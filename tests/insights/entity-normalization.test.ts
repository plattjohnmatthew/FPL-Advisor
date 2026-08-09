import assert from "node:assert/strict";
import test from "node:test";

import { normalizeInsightEntities, validateExtractionForPersistence, type InsightExtraction } from "../../lib/insights/schema";

const base: InsightExtraction["insights"][number] = {
  claim: "Hold Watkins", reasoning: "Fixtures", primaryCategory: "TRANSFER_DECISION", recommendation: "HOLD",
  timeHorizon: "SHORT", creatorConfidence: "HIGH", tags: ["forward"], evidenceText: "Hold him",
  timestampSeconds: null, validFromGameweek: null, validToGameweek: null, entities: [],
};

test("duplicate mentions and aliases resolving to one canonical relationship are deduplicated", () => {
  const result = normalizeInsightEntities({ insights: [{ ...base, entities: [
    { type: "PLAYER", canonicalName: "Ollie Watkins", aliases: ["Watkins"], role: "SUBJECT" },
    { type: "PLAYER", canonicalName: "ollie watkins", aliases: ["O. Watkins", "Watkins"], role: "subject" },
  ] }] });
  assert.equal(result.insights[0].entities.length, 1);
  assert.deepEqual(result.insights[0].entities[0].aliases.sort(), ["O. Watkins", "Watkins"]);
});

test("different semantic roles remain distinct relationships", () => {
  const result = normalizeInsightEntities({ insights: [{ ...base, entities: [
    { type: "PLAYER", canonicalName: "Ollie Watkins", aliases: [], role: "SUBJECT" },
    { type: "PLAYER", canonicalName: "Ollie Watkins", aliases: [], role: "COMPARISON" },
  ] }] });
  assert.equal(result.insights[0].entities.length, 2);
});

test("persistence boundary accepts multiple, single, and zero entities and canonicalizes tags", () => {
  const result = validateExtractionForPersistence("episode-123", { insights: [
    { ...base, tags: ["fixture", "fixture", "captaincy"], entities: [
      { type: "PLAYER", canonicalName: "Saka", aliases: [], role: "SUBJECT" },
      { type: "TEAM", canonicalName: "Arsenal", aliases: ["AFC"], role: "TEAM_CONTEXT" },
    ] },
    { ...base, tags: [], entities: [{ type: "PLAYER", canonicalName: "Palmer", aliases: [], role: "SUBJECT" }] },
    { ...base, tags: [], entities: [], timestampSeconds: null, validFromGameweek: null, validToGameweek: null },
  ] });
  assert.deepEqual(result.insights[0].tags, ["fixture", "captaincy"]);
  assert.deepEqual(result.insights.map((insight) => insight.entities.length), [2, 1, 0]);
});

test("persistence boundary rejects scalar collection fields with episode, insight, and field context", () => {
  assert.throws(
    () => validateExtractionForPersistence("episode-123", { insights: [{ ...base, entities: { type: "PLAYER" } }] }),
    /episode=episode-123 insight=0 field=entities .*received=object/,
  );
  assert.throws(
    () => validateExtractionForPersistence("episode-123", { insights: [{ ...base, tags: "fixture" }] }),
    /episode=episode-123 insight=0 field=tags .*received=string/,
  );
  assert.throws(
    () => validateExtractionForPersistence("episode-123", { insights: [{ ...base, entities: [{ type: "PLAYER", canonicalName: "Saka", aliases: null, role: "SUBJECT" }] }] }),
    /field=entities\.0\.aliases .*received=null/,
  );
});
