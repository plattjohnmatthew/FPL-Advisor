import type { StoredEpisode } from "@/lib/processing/types";
import type { NormalizedTranscriptResult, TranscriptProvider } from "./provider";

export class FakeTranscriptProvider implements TranscriptProvider {
  private readonly attempts = new Map<string, number>();

  constructor(private readonly failFirstFor = new Set<string>()) {}

  async acquireTranscript(episode: StoredEpisode): Promise<NormalizedTranscriptResult> {
    const attempt = (this.attempts.get(episode.externalEpisodeId) ?? 0) + 1;
    this.attempts.set(episode.externalEpisodeId, attempt);

    if (attempt === 1 && this.failFirstFor.has(episode.externalEpisodeId)) {
      throw new Error(`Fake transcript acquisition failed for ${episode.externalEpisodeId}`);
    }

    return {
      rawText: `Transcript for ${episode.title}. This is deterministic test content.`,
      language: "en",
      durationSeconds: episode.durationSeconds,
      providerName: "fake",
      segments: [{ startSeconds: 0, text: `Transcript for ${episode.title}.` }],
    };
  }
}

