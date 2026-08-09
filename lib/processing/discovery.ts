import type { DiscoveredEpisode, ProcessingSource, SourceCheckpoint } from "./types";
import type { ProcessingRunOptions } from "./options";
import { isPublishedInDiscoveryWindow } from "./options";

export interface EpisodeDiscoveryProvider {
  discoverEpisodes(
    source: ProcessingSource,
    checkpoint: SourceCheckpoint | null,
    options?: ProcessingRunOptions,
  ): Promise<DiscoveredEpisode[]>;
}

export function compareEpisodes(left: DiscoveredEpisode, right: DiscoveredEpisode) {
  const publishedDifference = Date.parse(left.publishedAt) - Date.parse(right.publishedAt);
  return publishedDifference || left.externalEpisodeId.localeCompare(right.externalEpisodeId);
}

export function isAfterCheckpoint(episode: DiscoveredEpisode, checkpoint: SourceCheckpoint | null) {
  if (!checkpoint?.lastSuccessfulPublishedAt) {
    return true;
  }

  const episodeTime = Date.parse(episode.publishedAt);
  const checkpointTime = Date.parse(checkpoint.lastSuccessfulPublishedAt);

  return (
    episodeTime > checkpointTime ||
    (episodeTime === checkpointTime &&
      episode.externalEpisodeId > (checkpoint.lastSuccessfulEpisodeExternalId ?? ""))
  );
}

export class FakeEpisodeDiscoveryProvider implements EpisodeDiscoveryProvider {
  constructor(private readonly catalogBySourceId?: ReadonlyMap<string, DiscoveredEpisode[]>) {}

  async discoverEpisodes(source: ProcessingSource, checkpoint: SourceCheckpoint | null, options?: ProcessingRunOptions) {
    const catalog = this.catalogBySourceId?.get(source.id) ?? this.createDemoCatalog(source);
    const checkpointId = checkpoint?.lastSuccessfulEpisodeExternalId ?? "";
    const visibleCatalog = checkpointId.endsWith("-B") || checkpointId.endsWith("-C")
      ? catalog
      : catalog.filter((episode) => !episode.externalEpisodeId.endsWith("-D"));

    return visibleCatalog.filter((episode) => options
      ? isPublishedInDiscoveryWindow(episode.publishedAt, options)
      : isAfterCheckpoint(episode, checkpoint)).sort(compareEpisodes);
  }

  private createDemoCatalog(source: ProcessingSource): DiscoveredEpisode[] {
    const createEpisode = (suffix: string, day: number): DiscoveredEpisode => ({
      externalEpisodeId: `${source.externalChannelId}-${suffix}`,
      title: `Fake episode ${suffix}`,
      sourceUrl: `https://example.com/${source.externalChannelId}/${suffix.toLowerCase()}`,
      publishedAt: `2026-08-${day.toString().padStart(2, "0")}T12:00:00.000Z`,
      durationSeconds: 1800,
      gameweek: 1,
    });

    return [createEpisode("A", 10), createEpisode("B", 11), createEpisode("C", 12), createEpisode("D", 13)];
  }
}
