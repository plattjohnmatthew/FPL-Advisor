import assert from "node:assert/strict";
import test from "node:test";
import { applyCitationRepairs, buildCitationRepairRequest, findOutOfRangeSegmentReferences } from "../../lib/insights/citation-repair";
import { validateInsightSegmentReferences, type InsightExtraction } from "../../lib/insights/schema";

const extraction: InsightExtraction = {
  insights: [{
    claim: "Buy the player before the deadline.",
    reasoning: "The creator expects strong immediate returns.",
    primaryCategory: "TRANSFER_DECISION",
    recommendation: "BUY",
    timeHorizon: "IMMEDIATE",
    creatorConfidence: "HIGH",
    entities: [{ type: "PLAYER", canonicalName: "Example Player", aliases: [], role: "SUBJECT" }],
    tags: ["transfer"],
    evidenceText: "I am buying the player before the deadline.",
    evidenceSegmentIds: [1593],
    timestampSeconds: 1593,
    validFromGameweek: null,
    validToGameweek: null,
  }],
};

const segments = Array.from({ length: 1300 }, (_, segmentId) => ({
  startSeconds: Number((segmentId * 1.964).toFixed(3)),
  endSeconds: Number((segmentId * 1.964 + 1.8).toFixed(3)),
  text: segmentId === 811 ? "I am buying the player before the deadline." : `Unrelated discussion ${segmentId}`,
}));

test("timestamp-like out-of-range segment IDs receive a small evidence candidate set", () => {
  assert.deepEqual(findOutOfRangeSegmentReferences(extraction, segments.length), [{ insightIndex: 0, invalidIds: [1593] }]);
  const request = buildCitationRepairRequest(extraction, segments);
  assert.equal(request.insights.length, 1);
  assert.ok(request.insights[0].candidates.length <= 18);
  assert.ok(request.insights[0].candidates.some((candidate) => candidate.segmentId === 811));
  assert.ok(JSON.stringify(request).length < 10_000, "repair payload must remain bounded and omit the full transcript");
});

test("allowlisted citation repair produces an extraction accepted by stored-segment validation", () => {
  const request = buildCitationRepairRequest(extraction, segments);
  const repaired = applyCitationRepairs(extraction, request, { repairs: [{ insightIndex: 0, evidenceSegmentIds: [811] }] });
  const validated = validateInsightSegmentReferences("episode-1", repaired, segments);
  assert.deepEqual(validated.insights[0].evidenceSegmentIds, [811]);
  assert.equal(validated.insights[0].timestampSeconds, Math.floor(segments[811].startSeconds));
});

test("citation repair cannot invent a segment or omit an affected insight", () => {
  const request = buildCitationRepairRequest(extraction, segments);
  assert.throws(
    () => applyCitationRepairs(extraction, request, { repairs: [{ insightIndex: 0, evidenceSegmentIds: [1299] }] }),
    /non-candidate segment ID=1299/,
  );
  assert.throws(() => applyCitationRepairs(extraction, request, { repairs: [] }), /omitted insightIndex=0/);
});
