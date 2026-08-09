import assert from "node:assert/strict";
import test from "node:test";
import { YouTubeChannelResolver } from "../../lib/sources/youtube-channel-resolver";

const feed = (name: string) => `<?xml version="1.0"?><feed><title>${name}</title></feed>`;

test("resolves direct channel URLs to canonical metadata", async () => {
  const resolver = new YouTubeChannelResolver(async () => new Response(feed("Planet FPL")));
  assert.deepEqual(await resolver.resolve("https://www.youtube.com/channel/UC123_test"), {
    externalChannelId: "UC123_test", name: "Planet FPL", channelUrl: "https://www.youtube.com/channel/UC123_test",
  });
});

test("resolves handle URLs through page metadata then verifies the feed", async () => {
  let calls = 0;
  const resolver = new YouTubeChannelResolver(async () => {
    calls += 1;
    return calls === 1 ? new Response('{"channelId":"UCresolved-1"}') : new Response(feed("FPL General &amp; Co"));
  });
  const result = await resolver.resolve("https://youtube.com/@FPLGeneral");
  assert.equal(result.externalChannelId, "UCresolved-1");
  assert.equal(result.name, "FPL General & Co");
});

test("rejects malformed, non-YouTube and non-channel URLs without lookup", async () => {
  const resolver = new YouTubeChannelResolver(async () => { throw new Error("must not fetch"); });
  await assert.rejects(() => resolver.resolve("not a url"), /valid YouTube channel URL/i);
  await assert.rejects(() => resolver.resolve("https://example.com/@creator"), /youtube.com/i);
  await assert.rejects(() => resolver.resolve("https://youtube.com/watch?v=abc"), /not a channel/i);
});

test("metadata failures do not return a source candidate", async () => {
  const resolver = new YouTubeChannelResolver(async () => new Response("missing", { status: 404 }));
  await assert.rejects(() => resolver.resolve("https://youtube.com/@missing"), /unavailable/i);
});
