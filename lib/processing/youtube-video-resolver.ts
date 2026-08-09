import "server-only";

import type { DiscoveredEpisode } from "./types";
import type { ResolvedYouTubeChannel } from "@/lib/sources/youtube-channel-resolver";

export type ResolvedYouTubeVideo = { channel: ResolvedYouTubeChannel; episode: DiscoveredEpisode };

function decodeHtml(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
}

function jsonString(html: string, key: string) {
  const match = html.match(new RegExp(`"${key}":"((?:\\\\.|[^"\\\\])*)"`));
  if (!match) return null;
  try { return JSON.parse(`"${match[1]}"`) as string; } catch { return null; }
}

function isoDurationSeconds(value: string | null) {
  if (!value) return null;
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

export class YouTubeVideoResolver {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async resolve(videoId: string): Promise<ResolvedYouTubeVideo> {
    const canonicalUrl = `https://www.youtube.com/watch?v=${videoId}`;
    let response: Response;
    try { response = await this.fetcher(canonicalUrl, { redirect: "follow", signal: AbortSignal.timeout(15_000), headers: { "Accept-Language": "en" } }); }
    catch { throw new Error(`YouTube metadata lookup timed out for ${videoId}.`); }
    if (!response.ok) throw new Error(`YouTube metadata lookup returned HTTP ${response.status} for ${videoId}.`);
    const html = await response.text();
    const unavailable = jsonString(html, "reason");
    const channelId = jsonString(html, "channelId") ?? html.match(/itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{22})/i)?.[1] ?? null;
    const channelName = jsonString(html, "ownerChannelName") ?? html.match(/<link itemprop="name" content="([^"]+)"/i)?.[1] ?? null;
    const title = jsonString(html, "title") ?? html.match(/<meta name="title" content="([^"]+)"/i)?.[1] ?? null;
    const published = html.match(/itemprop="datePublished" content="([^"]+)"/i)?.[1] ?? jsonString(html, "publishDate");
    const length = jsonString(html, "lengthSeconds");
    const duration = length && /^\d+$/.test(length) ? Number(length) : isoDurationSeconds(html.match(/itemprop="duration" content="([^"]+)"/i)?.[1] ?? null);
    if (!channelId || !channelName || !title || !published || Number.isNaN(Date.parse(published))) {
      throw new Error(unavailable ? `YouTube video ${videoId} is unavailable: ${unavailable}` : `YouTube metadata for ${videoId} was incomplete.`);
    }
    return {
      channel: { externalChannelId: channelId, name: decodeHtml(channelName), channelUrl: `https://www.youtube.com/channel/${channelId}` },
      episode: { externalEpisodeId: videoId, title: decodeHtml(title), sourceUrl: canonicalUrl, publishedAt: new Date(published).toISOString(), durationSeconds: duration, gameweek: null },
    };
  }
}
