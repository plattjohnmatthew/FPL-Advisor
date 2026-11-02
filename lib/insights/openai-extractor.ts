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
import { getRepairModel } from "@/lib/openai/model-policy";
import { normalizeResponseUsage, trackOpenAICall } from "@/lib/openai/usage";
import { composePromptVersion, customInstructionsMessage } from "@/lib/prompt-settings/config";
import { SupabasePromptSettingsRepository } from "@/lib/prompt-settings/repository";
import { applyCitationRepairs, buildCitationRepairRequest, CitationRepairSchema, findOutOfRangeSegmentReferences } from "./citation-repair";
import { EXTRACTION_CITATION_REPAIR_PROMPT } from "./citation-repair-prompt";
import { CurrentSquadContextService } from "@/lib/fpl-entry/context";

export class OpenAIInsightExtractor implements InsightExtractor {
  async extract(episode: StoredEpisode, transcript: StoredTranscript) {
    const { apiKey } = getOpenAIEnvironment();
    const model = getOpenAIModel("TRANSCRIPT_EXTRACTION");
    const customSetting = await new SupabasePromptSettingsRepository().get("EXTRACTION_CUSTOM_INSTRUCTIONS");
    const squadContext = await loadExtractionSquadContext();
    const promptVersion = composePromptVersion(EXTRACTION_PROMPT_VERSION, customSetting.version);
    const client = new OpenAI({ apiKey, maxRetries: 2 });
    const response = await trackOpenAICall({ task: "TRANSCRIPT_EXTRACTION", model, episodeId: episode.id }, () => client.responses.parse({
        model,
        input: [
          { role: "system", content: FPL_INSIGHT_EXTRACTION_PROMPT },
          ...(squadContext ? [{ role: "user" as const, content: `Canonical current-squad identity context (resolution aid only; never create an insight merely because a player appears here):\n${JSON.stringify(squadContext)}` }] : []),
          { role: "user", content: customInstructionsMessage(customSetting.value) },
          { role: "user", content: `Episode: ${episode.title}\nPublished: ${episode.publishedAt}\nTimestamped segments when available: ${transcript.segments ? JSON.stringify(transcript.segments.map((segment, segmentId) => ({ segmentId, ...(typeof segment === "object" && segment !== null ? segment : {}) }))) : "none"}\n\nTranscript:\n${transcript.rawText}` },
        ],
        text: { format: zodTextFormat(InsightExtractionSchema, "fpl_insight_extraction") },
      }));

      if (!response.output_parsed) throw new Error("OpenAI returned no validated structured extraction.");
      const parsed = normalizeInsightEntities(InsightExtractionSchema.parse(response.output_parsed));
      const segments = transcript.segments ?? [];
      let validated;
      try {
        validated = validateInsightSegmentReferences(episode.id, parsed, segments);
      } catch (error) {
        const issues = findOutOfRangeSegmentReferences(parsed, segments.length);
        if (issues.length === 0) throw error;

        const repairRequest = buildCitationRepairRequest(parsed, segments);
        const repairModel = getRepairModel(model);
        const repairResponse = await trackOpenAICall(
          { task: "STRUCTURED_OUTPUT_REPAIR", model: repairModel, episodeId: episode.id },
          () => client.responses.parse({
            model: repairModel,
            input: [
              { role: "system", content: EXTRACTION_CITATION_REPAIR_PROMPT },
              { role: "user", content: JSON.stringify(repairRequest) },
            ],
            text: { format: zodTextFormat(CitationRepairSchema, "fpl_extraction_citation_repair") },
          }),
        );
        if (!repairResponse.output_parsed) throw new Error("OpenAI returned no validated extraction citation repair.");
        const repaired = applyCitationRepairs(parsed, repairRequest, CitationRepairSchema.parse(repairResponse.output_parsed));
        validated = validateInsightSegmentReferences(episode.id, repaired, segments);
      }
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

async function loadExtractionSquadContext() {
  try {
    const context = await new CurrentSquadContextService().getCurrent();
    return context?.players.map((player) => ({ fplPlayerId: player.fplPlayerId, canonicalName: player.playerName, commonName: player.webName, team: player.teamName, position: player.position })) ?? null;
  } catch {
    return null;
  }
}
