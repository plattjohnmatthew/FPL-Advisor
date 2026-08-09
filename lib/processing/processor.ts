import type { StoredEpisode } from "./types";

export interface EpisodeProcessor {
  processEpisode(episode: StoredEpisode, retryCount: number): Promise<void>;
}

export class FakeEpisodeProcessor implements EpisodeProcessor {
  readonly processedExternalIds: string[] = [];

  constructor(private readonly delayMs = 0) {}

  async processEpisode(episode: StoredEpisode, retryCount: number) {
    this.processedExternalIds.push(episode.externalEpisodeId);

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    if (episode.externalEpisodeId.endsWith("-C") && retryCount === 0) {
      throw new Error("Deterministic fake failure for episode C");
    }
  }
}
