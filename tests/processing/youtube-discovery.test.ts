import assert from "node:assert/strict";
import test from "node:test";

import { YouTubeEpisodeDiscoveryProvider } from "../../lib/processing/youtube-discovery";
import type { ProcessingSource, SourceCheckpoint } from "../../lib/processing/types";

const source = (id: string, name: string, channelId: string): ProcessingSource => ({
  id, name, platform: "YOUTUBE", channelUrl: `https://www.youtube.com/channel/${channelId}`, externalChannelId: channelId,
});

const letsTalkFpl = source("source-1", "Let's Talk FPL", "UCxeOc7eFxq37yW_Nc-69deA");
const fplWire = source("source-2", "The FPL Wire", "UCtIPFexB6PLKNNl0XH3SKKw");

function feed(entries: Array<{ id: string; title: string; published: string }>) {
  return `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:yt="http://www.youtube.com/xml/schemas/2015">${entries.map((entry) => `<entry><yt:videoId>${entry.id}</yt:videoId><title>${entry.title}</title><link rel="alternate" href="https://www.youtube.com/watch?v=${entry.id}"/><published>${entry.published}</published></entry>`).join("")}</feed>`;
}

const initialEntries = [
  { id: "real-shape-a", title: "Existing episode A", published: "2026-08-01T10:00:00Z" },
  { id: "real-shape-b", title: "Existing episode B", published: "2026-08-02T10:00:00Z" },
];

test("two configured real channels normalize existing feed episodes and checkpoint reruns return no duplicates", async () => {
  const provider = new YouTubeEpisodeDiscoveryProvider(async () => new Response(feed(initialEntries), { status: 200 }));
  for (const channel of [letsTalkFpl, fplWire]) {
    const first = await provider.discoverEpisodes(channel, null);
    assert.deepEqual(first.map((episode) => episode.externalEpisodeId), ["real-shape-a", "real-shape-b"]);
    assert.equal(first[0].durationSeconds, null);
    assert.equal(first[0].sourceUrl, "https://www.youtube.com/watch?v=real-shape-a");
    const checkpoint: SourceCheckpoint = {
      sourceId: channel.id, lastSuccessfulPublishedAt: first[1].publishedAt,
      lastSuccessfulEpisodeExternalId: first[1].externalEpisodeId, lastCheckedAt: first[1].publishedAt,
    };
    assert.deepEqual(await provider.discoverEpisodes(channel, checkpoint), []);
  }
});

test("a simulated newer upload is the only episode returned after the checkpoint", async () => {
  const withNewEpisode = [...initialEntries, { id: "real-shape-c", title: "New episode C", published: "2026-08-03T10:00:00Z" }];
  const provider = new YouTubeEpisodeDiscoveryProvider(async () => new Response(feed(withNewEpisode), { status: 200 }));
  const discovered = await provider.discoverEpisodes(letsTalkFpl, {
    sourceId: letsTalkFpl.id, lastSuccessfulPublishedAt: "2026-08-02T10:00:00.000Z",
    lastSuccessfulEpisodeExternalId: "real-shape-b", lastCheckedAt: "2026-08-02T11:00:00.000Z",
  });
  assert.deepEqual(discovered.map((episode) => episode.externalEpisodeId), ["real-shape-c"]);
});

test("invalid configuration and source-specific HTTP failures are understandable", async () => {
  const provider = new YouTubeEpisodeDiscoveryProvider(async () => new Response("Unavailable", { status: 503 }));
  await assert.rejects(() => provider.discoverEpisodes(letsTalkFpl, null), /Let's Talk FPL.*HTTP 503/);
  await assert.rejects(() => provider.discoverEpisodes({ ...letsTalkFpl, externalChannelId: "bad-id" }, null), /Invalid YouTube channel ID/);
});
