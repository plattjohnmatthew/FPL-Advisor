import { requireCapability } from "@/lib/app-config";
import "server-only";

import { XMLParser } from "fast-xml-parser";
import { compareEpisodes, isAfterCheckpoint, type EpisodeDiscoveryProvider } from "./discovery";
import { isPublishedInDiscoveryWindow, type ProcessingRunOptions } from "./options";
import type { DiscoveredEpisode, ProcessingSource, SourceCheckpoint } from "./types";

type FeedEntry = {
  videoId?: string;
  title?: string;
  published?: string;
  link?: { href?: string } | Array<{ href?: string }>;
};

type YoutubeFeed = { feed?: { entry?: FeedEntry | FeedEntry[] } };
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export class YouTubeEpisodeDiscoveryProvider implements EpisodeDiscoveryProvider {
  constructor(private readonly fetcher: FetchLike = fetch) {}

  async discoverEpisodes(source: ProcessingSource, _checkpoint: SourceCheckpoint | null, options?: ProcessingRunOptions) {
    requireCapability("canProcessSources");
    if (source.platform !== "YOUTUBE") throw new Error(`Unsupported discovery platform: ${source.platform}`);
    if (!/^UC[A-Za-z0-9_-]{22}$/.test(source.externalChannelId)) {
      throw new Error(`Invalid YouTube channel ID configured for ${source.name}.`);
    }
    const feedUrl = new URL("https://www.youtube.com/feeds/videos.xml");
    feedUrl.searchParams.set("channel_id", source.externalChannelId);
    let response: Response;
    try {
      response = await this.fetcher(feedUrl, { headers: { Accept: "application/atom+xml, application/xml" } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network request failed";
      throw new Error(`Unable to check YouTube feed for ${source.name}: ${message}`);
    }
    if (!response.ok) throw new Error(`YouTube feed for ${source.name} returned HTTP ${response.status}.`);
    const parsed = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", removeNSPrefix: true }).parse(await response.text()) as YoutubeFeed;
    const rawEntries = parsed.feed?.entry;
    const entries = rawEntries ? (Array.isArray(rawEntries) ? rawEntries : [rawEntries]) : [];
    return entries.map((entry): DiscoveredEpisode => {
      const links = Array.isArray(entry.link) ? entry.link : entry.link ? [entry.link] : [];
      const videoId = entry.videoId?.trim();
      const publishedAt = entry.published?.trim();
      const title = entry.title?.trim();
      if (!videoId || !title || !publishedAt || Number.isNaN(Date.parse(publishedAt))) {
        throw new Error(`YouTube feed for ${source.name} contained an invalid episode entry.`);
      }
      return {
        externalEpisodeId: videoId,
        title,
        sourceUrl: links.find((link) => link.href)?.href ?? `https://www.youtube.com/watch?v=${videoId}`,
        publishedAt: new Date(publishedAt).toISOString(),
        durationSeconds: null,
        gameweek: null,
      };
    }).filter((episode) => options
      ? isPublishedInDiscoveryWindow(episode.publishedAt, options)
      : isAfterCheckpoint(episode, _checkpoint)).sort(compareEpisodes);
  }
}
