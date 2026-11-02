import { requireCapability } from "@/lib/app-config";
import "server-only";
import { SYNTHESIS_PIPELINE_VERSION } from "./cache";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnvironment } from "@/lib/env";
import type { RunSummaryGeneration, RunSummaryGenerator } from "./generator";
import { RUN_SUMMARY_PROMPT, RUN_SUMMARY_PROMPT_VERSION } from "./prompt";
import { createRunSummaryOutputSchema, RunSummarySchema, type RunSummaryContext } from "./schema";
import { getOpenAIModel, getRepairModel } from "@/lib/openai/model-policy";
import { normalizeResponseUsage, trackOpenAICall } from "@/lib/openai/usage";
import { composePromptVersion, customInstructionsMessage } from "@/lib/prompt-settings/config";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";
import { buildCreatorOpinionGroups } from "@/lib/opinions/aggregation";
import { CREATOR_BRIEF_PROMPT_VERSION, CreatorBriefSchema, chunkCreatorInsights, createCreatorBriefOutputSchema, creatorBriefInputHash, mergeCreatorBriefs, synthesisScopeBounds, type CreatorBrief } from "./creator-brief";
import { CREATOR_REDUCTION_PROMPT } from "./reduction-prompt";
import { assertWithinTokenBudget, estimateTokens, getSynthesisTokenBudget, selectSynthesisMode } from "./token-budget";
import { SupabaseCreatorBriefCache, type CreatorBriefCache } from "./creator-brief-repository";

export class OpenAIRunSummaryGenerator implements RunSummaryGenerator {
  constructor(private readonly briefCache: CreatorBriefCache = new SupabaseCreatorBriefCache()) {}

  async getIdentity() {
    requireCapability("canGenerateBriefings");
    const setting = await new SupabasePromptSettingsRepository().get("SYNTHESIS_CUSTOM_INSTRUCTIONS");
    return { model: getOpenAIModel("SYNTHESIS"), promptVersion: composePromptVersion(RUN_SUMMARY_PROMPT_VERSION, setting.version),
      reductionModel: getOpenAIModel("SYNTHESIS_REDUCTION"), reductionPromptVersion: CREATOR_BRIEF_PROMPT_VERSION,
      pipelineVersion: SYNTHESIS_PIPELINE_VERSION, configuration: getSynthesisTokenBudget() };
  }

  async generate(context: RunSummaryContext, callContext?: { requestId: string }): Promise<RunSummaryGeneration> {
    requireCapability("canGenerateBriefings");
    const customSetting = await new SupabasePromptSettingsRepository().get("SYNTHESIS_CUSTOM_INSTRUCTIONS");
    const model = getOpenAIModel("SYNTHESIS");
    const promptVersion = composePromptVersion(RUN_SUMMARY_PROMPT_VERSION, customSetting.version);
    const outputFormat = this.outputFormat(context);
    const directPayload = { ...context, creatorOpinionGroups: buildCreatorOpinionGroups(context.insights) };
    const budget = getSynthesisTokenBudget();
    const directTokens = estimateTokens(RUN_SUMMARY_PROMPT, customInstructionsMessage(customSetting.value), directPayload, outputFormat);
    if (selectSynthesisMode(directTokens, budget.directMaxInputTokens) === "DIRECT") {
      const final = await this.generateFinal(context, directPayload, outputFormat, model, promptVersion, customSetting.value, callContext);
      return { ...final, synthesisMode: "DIRECT", creatorBriefCount: 0, excludedCreators: [], reductionModel: null, reductionPromptVersion: null, reductionInputTokens: 0, reductionOutputTokens: 0 };
    }

    const reductionModel = getOpenAIModel("SYNTHESIS_REDUCTION");
    const briefs: CreatorBrief[] = []; let reductionInputTokens = 0; let reductionOutputTokens = 0;
    const byCreator = Map.groupBy(context.insights, (insight) => insight.sourceId);
    for (const [sourceId, insights] of byCreator) {
      const sourceName = insights[0].sourceName;
      const key = { sourceId, scope: context.scope, inputHash: creatorBriefInputHash(insights), promptVersion: CREATOR_BRIEF_PROMPT_VERSION, model: reductionModel };
      const cached = await this.briefCache.find(key);
      if (cached) { briefs.push(cached.brief); reductionInputTokens += cached.inputTokens ?? 0; reductionOutputTokens += cached.outputTokens ?? 0; continue; }
      const chunks = chunkCreatorInsights(insights, budget.reductionMaxInputTokens, estimateTokens(CREATOR_REDUCTION_PROMPT));
      const partials: CreatorBrief[] = []; let creatorInput = 0; let creatorOutput = 0;
      for (const chunk of chunks) {
        const reduced = await this.reduceCreator(sourceId, sourceName, context, chunk, reductionModel, callContext);
        partials.push(reduced.brief); creatorInput += reduced.inputTokens ?? 0; creatorOutput += reduced.outputTokens ?? 0;
      }
      const brief = mergeCreatorBriefs(partials);
      this.validateBriefEvidence(brief, new Set(insights.map((item) => item.id)), new Set(insights.map((item) => item.episodeId)));
      await this.briefCache.save(key, { brief, inputTokens: creatorInput, outputTokens: creatorOutput });
      reductionInputTokens += creatorInput; reductionOutputTokens += creatorOutput; briefs.push(brief);
    }
    const hierarchicalPayload = { scope: context.scope, runStatus: context.runStatus, creatorBriefs: briefs, splitDecisions: context.splitDecisions, eligibleEpisodeCount: context.eligibleEpisodeIds.length, includedEpisodeCount: context.includedEpisodeIds.length, excludedEpisodes: context.excludedEpisodes, distinctCreatorCount: briefs.length };
    const finalTokens = estimateTokens(RUN_SUMMARY_PROMPT, customInstructionsMessage(customSetting.value), hierarchicalPayload, outputFormat);
    assertWithinTokenBudget("Hierarchical final synthesis", finalTokens, budget.directMaxInputTokens);
    const final = await this.generateFinal(context, hierarchicalPayload, outputFormat, model, promptVersion, customSetting.value, callContext);
    return { ...final, synthesisMode: "HIERARCHICAL", creatorBriefCount: briefs.length, excludedCreators: [], reductionModel, reductionPromptVersion: CREATOR_BRIEF_PROMPT_VERSION, reductionInputTokens, reductionOutputTokens };
  }

  private outputFormat(context: RunSummaryContext) {
    return zodTextFormat(createRunSummaryOutputSchema(context.insights.map((item) => item.id), context.splitDecisions.map((item) => item.id), context.distinctCreatorCount >= 2), "fpl_run_summary");
  }

  private async generateFinal(context: RunSummaryContext, payload: unknown, outputFormat: ReturnType<typeof zodTextFormat>, model: string, promptVersion: string, custom: string, callContext?: { requestId: string }) {
    const { apiKey } = getOpenAIEnvironment();
    const response = await trackOpenAICall({ task: "SYNTHESIS", model, processingRunId: context.runId, requestId: callContext?.requestId }, () => new OpenAI({ apiKey, maxRetries: 2 }).responses.parse({ model, input: [{ role: "system", content: RUN_SUMMARY_PROMPT }, { role: "user", content: customInstructionsMessage(custom) }, { role: "user", content: `Bounded structured synthesis context:\n${JSON.stringify(payload)}` }], text: { format: outputFormat } }));
    if (!response.output_parsed) throw new Error("OpenAI returned no validated run-summary output.");
    let summary = RunSummarySchema.parse(response.output_parsed);
    try { this.validateFinalEvidence(summary, context); }
    catch (error) {
      const repairModel = getRepairModel(model);
      const repairPayload = { synthesisContext: payload, invalidOutput: summary, validationError: error instanceof Error ? error.message : "Invalid evidence", allowedInsightIds: context.insights.map((item) => item.id), allowedSplitDecisionIds: context.splitDecisions.map((item) => item.id) };
      const repairTokens = estimateTokens(RUN_SUMMARY_PROMPT, repairPayload, outputFormat);
      assertWithinTokenBudget("Synthesis structured-output repair", repairTokens, getSynthesisTokenBudget().directMaxInputTokens);
      const repaired = await trackOpenAICall({ task: "STRUCTURED_OUTPUT_REPAIR", model: repairModel, processingRunId: context.runId, requestId: callContext?.requestId }, () => new OpenAI({ apiKey, maxRetries: 2 }).responses.parse({ model: repairModel, input: [{ role: "system", content: `${RUN_SUMMARY_PROMPT}\nCorrect the supplied invalid report. Preserve its useful conclusions, but replace or remove every invalid citation. Use only the supplied allowlisted original evidence IDs.` }, { role: "user", content: JSON.stringify(repairPayload) }], text: { format: outputFormat } }));
      if (!repaired.output_parsed) throw new Error("OpenAI returned no validated repaired run-summary output.");
      summary = RunSummarySchema.parse(repaired.output_parsed);
      try { this.validateFinalEvidence(summary, context); }
      catch { summary = this.removeInvalidEvidence(summary, context); this.validateFinalEvidence(summary, context); }
    }
    const usage = normalizeResponseUsage(response);
    return { summary, model, promptVersion, generatedAt: new Date().toISOString(), inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null, totalTokens: usage?.totalTokens ?? null };
  }

  private async reduceCreator(sourceId: string, sourceName: string, context: RunSummaryContext, insights: RunSummaryContext["insights"], model: string, callContext?: { requestId: string }) {
    const { apiKey } = getOpenAIEnvironment(); const budget = getSynthesisTokenBudget();
    const payload = { creatorId: sourceId, creatorName: sourceName, scope: synthesisScopeBounds(context.scope), insights };
    const format = zodTextFormat(createCreatorBriefOutputSchema(insights.map((item) => item.id), [...new Set(insights.map((item) => item.episodeId))]), "creator_brief");
    const tokens = estimateTokens(CREATOR_REDUCTION_PROMPT, payload, format);
    assertWithinTokenBudget(`Creator reduction for ${sourceName}`, tokens, budget.reductionMaxInputTokens);
    const response = await trackOpenAICall({ task: "SYNTHESIS_REDUCTION", model, processingRunId: context.runId, requestId: callContext?.requestId }, () => new OpenAI({ apiKey, maxRetries: 2 }).responses.parse({ model, input: [{ role: "system", content: CREATOR_REDUCTION_PROMPT }, { role: "user", content: JSON.stringify(payload) }], text: { format } }));
    if (!response.output_parsed) throw new Error(`Creator reduction returned no validated output for ${sourceName}.`);
    const brief = CreatorBriefSchema.parse(response.output_parsed); const usage = normalizeResponseUsage(response);
    this.validateBriefEvidence(brief, new Set(insights.map((item) => item.id)), new Set(insights.map((item) => item.episodeId)));
    return { brief, inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null };
  }

  private validateBriefEvidence(brief: CreatorBrief, insightIds: Set<string>, episodeIds: Set<string>) {
    for (const position of brief.positions) {
      for (const id of position.evidenceInsightIds) if (!insightIds.has(id)) throw new Error(`Creator brief referenced unknown insight ID: ${id}`);
      for (const id of position.episodeIds) if (!episodeIds.has(id)) throw new Error(`Creator brief referenced unknown episode ID: ${id}`);
    }
  }

  private validateFinalEvidence(summary: import("./schema").RunSummary, context: RunSummaryContext) {
    const insights = new Set(context.insights.map((item) => item.id)); const splits = new Set(context.splitDecisions.map((item) => item.id));
    for (const id of summary.overviewSupportingInsightIds) if (!insights.has(id)) throw new Error(`Run summary referenced unknown insight ID: ${id}`);
    for (const section of Object.values(summary.sections)) for (const item of section) for (const id of item.supportingInsightIds) if (!insights.has(id)) throw new Error(`Run summary referenced unknown insight ID: ${id}`);
    for (const id of summary.splitDecisionIds) if (!splits.has(id)) throw new Error(`Run summary referenced unknown split-decision ID: ${id}`);
  }

  private removeInvalidEvidence(summary: import("./schema").RunSummary, context: RunSummaryContext) {
    const allowedInsights = new Set(context.insights.map((item) => item.id)); const allowedSplits = new Set(context.splitDecisions.map((item) => item.id));
    for (const key of Object.keys(summary.sections) as Array<keyof typeof summary.sections>) {
      summary.sections[key] = summary.sections[key].map((item) => ({ ...item, supportingInsightIds: item.supportingInsightIds.filter((id) => allowedInsights.has(id)) })).filter((item) => item.supportingInsightIds.length > 0);
    }
    summary.overviewSupportingInsightIds = summary.overviewSupportingInsightIds.filter((id) => allowedInsights.has(id));
    if (summary.overviewSupportingInsightIds.length === 0) summary.overviewSupportingInsightIds = [...new Set(Object.values(summary.sections).flatMap((items) => items.flatMap((item) => item.supportingInsightIds)))].slice(0, 12);
    if (summary.overviewSupportingInsightIds.length === 0) throw new Error("Repaired synthesis contained no valid original evidence IDs.");
    summary.splitDecisionIds = summary.splitDecisionIds.filter((id) => allowedSplits.has(id));
    return RunSummarySchema.parse(summary);
  }
}
