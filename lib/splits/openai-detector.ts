import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { getOpenAIEnvironment } from "@/lib/env";
import type { SplitDecisionDetector } from "./detector";
import { SPLIT_DETECTION_PROMPT, SPLIT_DETECTION_VERSION, SPLIT_PROMPT_VERSION } from "./prompt";
import { SplitDetectionOutputSchema, type SplitCandidateInsight } from "./schema";
import { getOpenAIModel } from "@/lib/openai/model-policy";
import { trackOpenAICall } from "@/lib/openai/usage";

export class OpenAISplitDecisionDetector implements SplitDecisionDetector {
  async detect(insights: SplitCandidateInsight[], context?: { runId: string | null; requestId?: string }) {
    const { apiKey } = getOpenAIEnvironment();
    const model = getOpenAIModel("SPLIT_DETECTION");
    const response = await trackOpenAICall({ task: "SPLIT_DETECTION", model, processingRunId: context?.runId, requestId: context?.requestId }, () => new OpenAI({ apiKey, maxRetries: 2 }).responses.parse({
      model,
      input: [
        { role: "system", content: SPLIT_DETECTION_PROMPT },
        { role: "user", content: `Candidate creator insights:\n${JSON.stringify(insights)}` },
      ],
      text: { format: zodTextFormat(SplitDetectionOutputSchema, "fpl_split_decisions") },
    }));
    if (!response.output_parsed) throw new Error("OpenAI returned no validated split-decision output.");
    return {
      ...SplitDetectionOutputSchema.parse(response.output_parsed),
      model,
      detectionVersion: SPLIT_DETECTION_VERSION,
      promptVersion: SPLIT_PROMPT_VERSION,
      detectedAt: new Date().toISOString(),
    };
  }
}
