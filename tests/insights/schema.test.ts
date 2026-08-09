import assert from "node:assert/strict";
import test from "node:test";

import { InsightExtractionSchema } from "../../lib/insights/schema";
import { expectedRepresentativeExtraction, representativeTranscript } from "../fixtures/representative-transcript";

test("representative fixture covers requested FPL extraction cases", () => {
  const parsed = InsightExtractionSchema.parse(expectedRepresentativeExtraction);
  assert.equal(parsed.insights.length, 7);
  assert.match(representativeTranscript, /sponsor/i);
  assert.deepEqual(new Set(parsed.insights.map((insight) => insight.recommendation)), new Set(["BUY", "SELL", "WATCH", "CAPTAIN"]));
  assert.ok(parsed.insights.some((insight) => insight.tags.includes("rotation")));
  assert.ok(parsed.insights.some((insight) => insight.tags.includes("price-rise")));
  assert.ok(parsed.insights.some((insight) => insight.tags.includes("conflicting-view")));
  assert.ok(parsed.insights.every((insight) => !/sponsor|joke/i.test(insight.claim)));
});

test("malformed structured extraction is rejected", () => {
  assert.throws(() => InsightExtractionSchema.parse({ insights: [{ claim: "Buy Saka", recommendation: "STRONG_BUY" }] }));
});
