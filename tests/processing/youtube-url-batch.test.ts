import assert from "node:assert/strict";
import test from "node:test";
import { MAX_SPECIFIC_VIDEO_URLS, normalizeYouTubeVideoUrl, parseSpecificVideoUrls } from "@/lib/processing/youtube-url-batch";
import { YouTubeVideoResolver } from "@/lib/processing/youtube-video-resolver";

test("one URL and five URLs normalize as one batch", () => {
  assert.equal(parseSpecificVideoUrls("https://youtube.com/watch?v=abcdefghijk").length, 1);
  const five = Array.from({ length: 5 }, (_, index) => `https://youtube.com/watch?v=abcdefghij${index}`).join("\n");
  assert.equal(parseSpecificVideoUrls(five).filter((item) => item.status === "VALID").length, 5);
});

test("blank lines are ignored and same-video URL formats deduplicate", () => {
  const items = parseSpecificVideoUrls("\n https://youtube.com/watch?v=abcdefghijk \n\nhttps://youtu.be/abcdefghijk\n");
  assert.equal(items.length, 2);
  assert.deepEqual(items.map((item) => item.status), ["VALID", "DUPLICATE_IN_BATCH"]);
  assert.equal(items[0].normalizedUrl, "https://www.youtube.com/watch?v=abcdefghijk");
});

test("invalid and unsupported lines do not block valid videos", () => {
  const items = parseSpecificVideoUrls("not-a-url\nhttps://youtube.com/@creator\nhttps://youtube.com/shorts/abcdefghijk");
  assert.deepEqual(items.map((item) => item.status), ["INVALID_URL", "UNSUPPORTED_URL", "VALID"]);
});

test("watch, short, live, embed, mobile, and short URLs share canonical identity", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=abcdefghijk", "https://m.youtube.com/watch?v=abcdefghijk",
    "https://youtu.be/abcdefghijk?t=20", "https://youtube.com/shorts/abcdefghijk",
    "https://youtube.com/live/abcdefghijk", "https://youtube.com/embed/abcdefghijk",
  ]) assert.deepEqual(normalizeYouTubeVideoUrl(url), { videoId: "abcdefghijk", normalizedUrl: "https://www.youtube.com/watch?v=abcdefghijk" });
});

test("batch size limit rejects rather than truncates", () => {
  const urls = Array.from({ length: MAX_SPECIFIC_VIDEO_URLS + 1 }, (_, index) => `https://youtu.be/abcdefghi${String(index).padStart(2, "0")}`).join("\n");
  assert.throws(() => parseSpecificVideoUrls(urls), /no more than 20/);
});

test("video metadata resolves canonical creator and episode identity", async () => {
  const html = `<meta name="title" content="GW Preview"><meta itemprop="datePublished" content="2026-08-09"><meta itemprop="duration" content="PT1H2M3S"><script>{"channelId":"UC1234567890123456789012","ownerChannelName":"FPL &amp; Co","title":"GW Preview","lengthSeconds":"3723"}</script>`;
  const result = await new YouTubeVideoResolver(async () => new Response(html, { status: 200 })).resolve("abcdefghijk");
  assert.equal(result.channel.externalChannelId, "UC1234567890123456789012");
  assert.equal(result.channel.name, "FPL & Co");
  assert.equal(result.episode.externalEpisodeId, "abcdefghijk");
  assert.equal(result.episode.durationSeconds, 3723);
});
