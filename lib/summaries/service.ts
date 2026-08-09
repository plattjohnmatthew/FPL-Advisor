import type { RunSummaryGenerator } from "./generator";
import type { RunSummaryRepository } from "./repository";
import type { RunSummary, RunSummaryContext } from "./schema";
import type { SynthesisScope } from "./schema";
import { REPORT_SECTION_KEYS } from "./schema";

export class RunSummarySynthesisService {
  constructor(private readonly repository: RunSummaryRepository, private readonly generator: RunSummaryGenerator) {}

  async synthesizeLatestRun() {
    const run = await this.repository.findLatestRelevantRun();
    if (!run) throw new Error("No completed, partial, failed, or cancelled processing run is available to synthesize.");
    return this.synthesizeRun(run.id, run.status);
  }

  async synthesizeRun(runId: string, runStatus: Exclude<RunSummaryContext["runStatus"], null>) {
    const scope = { type: "RUN" as const, runId };
    return this.synthesize(scope, () => this.repository.loadRunContext(runId, runStatus));
  }

  async synthesizeDateRange(fromDate: string, toDate: string, timezoneOffsetMinutes = 0) {
    const scope = { type: "DATE_RANGE" as const, fromDate, toDate };
    return this.synthesize(scope, () => this.repository.loadDateRangeContext(fromDate, toDate, timezoneOffsetMinutes));
  }

  private async synthesize(scope: SynthesisScope, loadContext: () => Promise<RunSummaryContext>) {
    const attemptId = await this.repository.startAttempt(scope);
    try {
      const context = await loadContext();
      if (context.includedEpisodeIds.length === 0 || context.insights.length === 0) {
        throw new Error("No successfully processed episodes with persisted insights match this synthesis scope.");
      }
      const generation = await this.generator.generate(context, { requestId: attemptId });
    const insightById = new Map(context.insights.map((item) => [item.id, item]));
    const allowedSplits = new Set(context.splitDecisions.map((item) => item.id));
    for (const splitId of generation.summary.splitDecisionIds) {
      if (!allowedSplits.has(splitId)) throw new Error(`Run summary referenced unknown split-decision ID: ${splitId}`);
    }
    this.validateIds(generation.summary.overviewSupportingInsightIds, insightById);
    for (const key of REPORT_SECTION_KEYS) {
      for (const item of generation.summary.sections[key]) {
        this.validateIds(item.supportingInsightIds, insightById);
        const sourceCount = new Set(item.supportingInsightIds.map((id) => insightById.get(id)!.sourceId)).size;
        item.sourceCount = sourceCount;
        item.interpretation = this.normalizeInterpretation(item.interpretation, sourceCount);
      }
    }
      const synthesisId = await this.repository.persist(scope, context, generation);
      await this.repository.finishAttempt(attemptId, synthesisId);
      return { synthesisId, includedEpisodeCount: context.includedEpisodeIds.length, excludedEpisodeCount: context.excludedEpisodeCount };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown synthesis failure";
      await this.repository.failAttempt(attemptId, message);
      throw error;
    }
  }

  private normalizeInterpretation(
    interpretation: RunSummary["sections"]["playersToBuy"][number]["interpretation"],
    distinctCreatorCount: number,
  ) {
    if (distinctCreatorCount === 1) return "SINGLE_SOURCE" as const;
    if (interpretation === "CONSENSUS") return "CONSENSUS" as const;
    if (interpretation === "SPLIT" || interpretation === "DISAGREEMENT") return "SPLIT" as const;
    if (interpretation === "MIXED") return "MIXED" as const;
    return "MULTI_SOURCE_SUPPORT" as const;
  }

  private validateIds(insightIds: string[], insightById: Map<string, RunSummaryContext["insights"][number]>) {
    for (const insightId of insightIds) if (!insightById.has(insightId)) throw new Error(`Run summary referenced unknown insight ID: ${insightId}`);
  }
}
