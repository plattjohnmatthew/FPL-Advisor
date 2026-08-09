import type { StoredEpisode } from "@/lib/processing/types";
import type { StoredTranscript } from "@/lib/processing/repository";
import type { InsightExtraction } from "./schema";

export type ExtractionResult = InsightExtraction & {
  model: string;
  extractionVersion: string;
  promptVersion: string;
  extractedAt: string;
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
};

export interface InsightExtractor {
  extract(episode: StoredEpisode, transcript: StoredTranscript): Promise<ExtractionResult>;
}
