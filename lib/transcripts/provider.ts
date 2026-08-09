import type { StoredEpisode } from "@/lib/processing/types";

export type TranscriptSegment = {
  startSeconds: number;
  endSeconds?: number;
  text: string;
};

export type NormalizedTranscriptResult = {
  rawText: string;
  language: string | null;
  durationSeconds: number | null;
  providerName: string;
  segments?: TranscriptSegment[];
};

export interface TranscriptProvider {
  acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult>;
}

export type TranscriptFailureKind = "TRANSIENT" | "PERMANENT" | "CONFIGURATION";

export class TranscriptAcquisitionError extends Error {
  constructor(message: string, readonly kind: TranscriptFailureKind) {
    super(message);
    this.name = "TranscriptAcquisitionError";
  }
}
