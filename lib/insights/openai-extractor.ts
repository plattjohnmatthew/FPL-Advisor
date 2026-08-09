import "server-only";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { StoredEpisode } from "@/lib/processing/types";
import type { StoredTranscript } from "@/lib/processing/repository";
import { getOpenAIEnvironment } from "@/lib/env";
import type { InsightExtractor } from "./extractor";
import { FPL_INSIGHT_EXTRACTION_PROMPT, EXTRACTION_PROMPT_VERSION, EXTRACTION_VERSION } from "./prompt";
import { InsightExtractionSchema, normalizeInsightEntities, validateInsightSegmentReferences } from "./schema";
import { getOpenAIModel } from "@/lib/openai/model-policy";
import { normalizeResponseUsage, trackOpenAICall } from "@/lib/openai/usage";
import { composePromptVersion, customInstructionsMessage } from "@/lib/prompt-settings/config";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";

export class OpenAIInsightExtractor implements InsightExtractor {
  async extract(episode: StoredEpisode, transcript: StoredTranscript) {
    const { apiKey } = getOpenAIEnvironment();
    const model = getOpenAIModel("TRANSCRIPT_EXTRACTION");
    const customSetting = await new SupabasePromptSettingsRepository().get("EXTRACTION_CUSTOM_INSTRUCTIONS");
    const promptVersion = composePromptVersion(EXTRACTION_PROMPT_VERSION, customSetting.version);
    const client = new OpenAI({ apiKey, maxRetries: 2 });
    const response = await trackOpenAICall({ task: "TRANSCRIPT_EXTRACTION", model, episodeId: episode.id }, () => client.responses.parse({
        model,
        input: [
          { role: "system", content: FPL_INSIGHT_EXTRACTION_PROMPT },
          { role: "user", content: customInstructionsMessage(customSetting.value) },
          { role: "user", content: `Episode: ${episode.title}\nPublished: ${episode.publishedAt}\nTimestamped segments when available: ${transcript.segments ? JSON.stringify(transcript.segments.map((segment, segmentId) => ({ segmentId, ...(typeof segment === "object" && segment !== null ? segment : {}) }))) : "none"}\n\nTranscript:\n${transcript.rawText}` },
        ],
        text: { format: zodTextFormat(InsightExtractionSchema, "fpl_insight_extraction") },
      }));

      if (!response.output_parsed) throw new Error("OpenAI returned no validated structured extraction.");
      const parsed = normalizeInsightEntities(InsightExtractionSchema.parse(response.output_parsed));
      const validated = validateInsightSegmentReferences(episode.id, parsed, transcript.segments ?? []);
      const extractedAt = new Date().toISOString();
      const normalizedUsage = normalizeResponseUsage(response);
      const tokenUsage = normalizedUsage ? { inputTokens: normalizedUsage.inputTokens, outputTokens: normalizedUsage.outputTokens, totalTokens: normalizedUsage.totalTokens } : null;

    return {
        ...validated,
        model,
        extractionVersion: EXTRACTION_VERSION,
        promptVersion,
        extractedAt,
        tokenUsage,
    };
  }
}
