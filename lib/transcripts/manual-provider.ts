import type { StoredEpisode } from "@/lib/processing/types";
import type { NormalizedTranscriptResult, TranscriptProvider, TranscriptSegment } from "./provider";

export type ManualTranscriptInput = {
  rawText: string;
  language?: string | null;
  durationSeconds?: number | null;
  segments?: TranscriptSegment[];
};

type ManualTranscriptResolver = (episode: StoredEpisode) => Promise<ManualTranscriptInput | null>;

export class ManualTranscriptProvider implements TranscriptProvider {
  constructor(private readonly resolve: ManualTranscriptResolver) {}

  async acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult> {
    const input = await this.resolve(episode);
    const rawText = input?.rawText.trim();

    if (!input || !rawText) {
      throw new Error("No manual transcript is available. Paste a transcript, then retry processing.");
    }
    if (input.durationSeconds != null && (!Number.isFinite(input.durationSeconds) || input.durationSeconds < 0)) {
      throw new Error("Transcript duration must be a non-negative number.");
    }

    return {
      rawText,
      language: input.language?.trim() || null,
      durationSeconds: input.durationSeconds ?? null,
      providerName: "manual",
      segments: input.segments,
    };
  }
}

