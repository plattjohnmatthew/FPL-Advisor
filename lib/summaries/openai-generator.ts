import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnvironment } from "@/lib/env";
import type { RunSummaryGenerator } from "./generator";
import { RUN_SUMMARY_PROMPT, RUN_SUMMARY_PROMPT_VERSION } from "./prompt";
import { createRunSummaryOutputSchema, RunSummarySchema, type RunSummaryContext } from "./schema";
import { getOpenAIModel } from "@/lib/openai/model-policy";
import { normalizeResponseUsage, trackOpenAICall } from "@/lib/openai/usage";
import { composePromptVersion, customInstructionsMessage } from "@/lib/prompt-settings/config";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";

export class OpenAIRunSummaryGenerator implements RunSummaryGenerator {
  async generate(context: RunSummaryContext, callContext?: { requestId: string }) {
    const { apiKey } = getOpenAIEnvironment();
    const model = getOpenAIModel("SYNTHESIS");
    const customSetting = await new SupabasePromptSettingsRepository().get("SYNTHESIS_CUSTOM_INSTRUCTIONS");
    const promptVersion = composePromptVersion(RUN_SUMMARY_PROMPT_VERSION, customSetting.version);
    const outputSchema = createRunSummaryOutputSchema(
      context.insights.map((insight) => insight.id),
      context.splitDecisions.map((decision) => decision.id),
      new Set(context.insights.map((insight) => insight.sourceId)).size >= 2,
    );
    const response = await trackOpenAICall({ task: "SYNTHESIS", model, processingRunId: context.runId, requestId: callContext?.requestId }, () => new OpenAI({ apiKey, maxRetries: 2 }).responses.parse({
      model,
      input: [
        { role: "system", content: RUN_SUMMARY_PROMPT },
        { role: "user", content: customInstructionsMessage(customSetting.value) },
        { role: "user", content: `Structured run context:\n${JSON.stringify(context)}` },
      ],
      text: { format: zodTextFormat(outputSchema, "fpl_run_summary") },
    }));
    if (!response.output_parsed) throw new Error("OpenAI returned no validated run-summary output.");
    const usage = normalizeResponseUsage(response);
    return {
      summary: RunSummarySchema.parse(response.output_parsed), model,
      promptVersion, generatedAt: new Date().toISOString(),
      inputTokens: usage?.inputTokens ?? null, outputTokens: usage?.outputTokens ?? null,
      totalTokens: usage?.totalTokens ?? null,
    };
  }
}
