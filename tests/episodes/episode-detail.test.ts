import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildInsightSourceUrl, buildYouTubeTimestampUrl, dateScopeQuery, formatTimestamp, getInsightPlaybackSeconds } from "../../lib/episodes/presentation";
import { InsightExtractionSchema, validateInsightSegmentReferences } from "../../lib/insights/schema";

const baseInsight = {
  claim: "Buy the player", reasoning: "Strong role", primaryCategory: "TRANSFER_DECISION", recommendation: "BUY",
  timeHorizon: "SHORT", creatorConfidence: "HIGH", entities: [], tags: ["transfer"], evidenceText: "He is the buy.",
  evidenceSegmentIds: [1], timestampSeconds: 999, validFromGameweek: null, validToGameweek: null,
};

test("timestamps render as MM:SS and HH:MM:SS", () => {
  assert.equal(formatTimestamp(732), "12:12");
  assert.equal(formatTimestamp(3732), "1:02:12");
});

test("YouTube timestamp URLs preserve video identity and open the correct second", () => {
  assert.equal(buildYouTubeTimestampUrl("https://www.youtube.com/watch?v=abcdefghijk&list=test", 732), "https://www.youtube.com/watch?v=abcdefghijk&list=test&t=732s");
  assert.equal(buildYouTubeTimestampUrl("https://example.com/video", 10), null);
});

test("insight source links start five seconds before the cited moment and clamp at zero", () => {
  assert.equal(getInsightPlaybackSeconds(732), 727);
  assert.equal(getInsightPlaybackSeconds(3), 0);
  assert.equal(buildInsightSourceUrl("https://www.youtube.com/watch?v=abcdefghijk", 732), "https://www.youtube.com/watch?v=abcdefghijk&t=727s");
  assert.equal(buildInsightSourceUrl("https://example.com/podcast", 732), "https://example.com/podcast");
  assert.equal(buildInsightSourceUrl("https://www.youtube.com/watch?v=abcdefghijk", null), "https://www.youtube.com/watch?v=abcdefghijk");
});

test("valid stored segment IDs determine canonical timestamps", () => {
  const extraction = InsightExtractionSchema.parse({ insights: [baseInsight] });
  const result = validateInsightSegmentReferences("episode-1", extraction, [{ startSeconds: 4 }, { startSeconds: 72.9 }]);
  assert.equal(result.insights[0].timestampSeconds, 72);
  assert.deepEqual(result.insights[0].evidenceSegmentIds, [1]);
});

test("invalid segment IDs fail and non-timestamped historical shapes remain valid", () => {
  const extraction = InsightExtractionSchema.parse({ insights: [{ ...baseInsight, evidenceSegmentIds: [3] }] });
  assert.throws(() => validateInsightSegmentReferences("episode-1", extraction, [{ startSeconds: 4 }]), /invalid stored segment ID=3/);
  const historical = InsightExtractionSchema.parse({ insights: [{ ...baseInsight, evidenceSegmentIds: undefined, timestampSeconds: null }] });
  assert.doesNotThrow(() => validateInsightSegmentReferences("episode-1", historical, []));
});

test("date range is preserved without accepting arbitrary query text", () => {
  assert.equal(dateScopeQuery("2026-08-01", "2026-08-09"), "?from=2026-08-01&to=2026-08-09");
  assert.equal(dateScopeQuery("bad", "also-bad"), "");
});

test("opening episode and entity pages is read-only and makes no OpenAI call", async () => {
  const episodePage = await readFile("app/episodes/[episodeId]/page.tsx", "utf8");
  const entityPage = await readFile("app/entities/[entityId]/page.tsx", "utf8");
  assert.doesNotMatch(episodePage + entityPage, /OpenAI|responses\.parse|extract\(/);
  assert.match(episodePage, /getEpisodeDetail/);
  assert.match(entityPage, /getEntityInsightExplorer/);
});
