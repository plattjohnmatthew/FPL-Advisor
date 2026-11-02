import { requireCapability } from "@/lib/app-config";
import "server-only";

export type ResolvedYouTubeChannel = { externalChannelId: string; name: string; channelUrl: string };

export class YouTubeChannelResolutionError extends Error {
  constructor(message: string) { super(message); this.name = "YouTubeChannelResolutionError"; }
}

function decodeXml(value: string) {
  return value.replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}

export class YouTubeChannelResolver {
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  async resolve(input: string): Promise<ResolvedYouTubeChannel> {
    requireCapability("canProcessSources");
    let url: URL;
    try { url = new URL(input.trim()); } catch { throw new YouTubeChannelResolutionError("Enter a valid YouTube channel URL."); }
    if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname.toLowerCase())) {
      throw new YouTubeChannelResolutionError("Enter a valid youtube.com channel URL.");
    }
    const path = url.pathname.replace(/\/$/, "");
    if (!/^\/(channel\/UC[\w-]+|@[\w.-]+|c\/[\w.-]+|user\/[\w.-]+)$/i.test(path)) {
      throw new YouTubeChannelResolutionError("This YouTube URL is not a channel URL.");
    }

    let channelId = path.match(/^\/channel\/(UC[\w-]+)$/i)?.[1];
    if (!channelId) {
      let response: Response;
      try { response = await this.fetcher(url.toString(), { redirect: "follow", signal: AbortSignal.timeout(10_000) }); }
      catch { throw new YouTubeChannelResolutionError("YouTube channel lookup timed out. Please retry."); }
      if (!response.ok) throw new YouTubeChannelResolutionError("The YouTube channel is unavailable or could not be resolved.");
      const html = await response.text();
      channelId = html.match(/"(?:channelId|externalId)":"(UC[\w-]+)"/)?.[1]
        ?? html.match(/<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[\w-]+)["']/i)?.[1]
        ?? html.match(/youtube\.com\/channel\/(UC[\w-]+)/i)?.[1];
    }
    if (!channelId) throw new YouTubeChannelResolutionError("YouTube did not return a canonical channel ID.");

    let feedResponse: Response;
    try { feedResponse = await this.fetcher(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, { signal: AbortSignal.timeout(10_000) }); }
    catch { throw new YouTubeChannelResolutionError("YouTube metadata lookup timed out. Please retry."); }
    if (!feedResponse.ok) throw new YouTubeChannelResolutionError("The YouTube channel is unavailable or deleted.");
    const feed = await feedResponse.text();
    const name = feed.match(/<title>([\s\S]*?)<\/title>/i)?.[1]?.trim();
    if (!name) throw new YouTubeChannelResolutionError("YouTube channel metadata could not be read. Please retry.");
    return { externalChannelId: channelId, name: decodeXml(name), channelUrl: `https://www.youtube.com/channel/${channelId}` };
  }
}
