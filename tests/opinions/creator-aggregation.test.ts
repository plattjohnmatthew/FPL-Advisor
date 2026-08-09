import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateByCreator,
  aggregateSentiment,
  buildCreatorOpinionGroups,
  calculateSubjectAttention,
  type OpinionInsight,
} from "@/lib/opinions/aggregation";
import { normalizeSplitCreatorEvidence } from "@/lib/splits/service";
import type { SplitCandidateInsight } from "@/lib/splits/schema";

const uuid = (value: number) => `10000000-0000-4000-8000-${String(value).padStart(12, "0")}`;
const insight = (id: number, sourceId: string, recommendation: string, episodeId = `episode-${id}`, publishedAt = `2026-08-${String(id).padStart(2, "0")}T10:00:00Z`): OpinionInsight => ({
  id: uuid(id), sourceId, sourceName: sourceId, episodeId, publishedAt, recommendation,
  primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", entities: [{ name: "Saka" }],
});

test("same creator with three identical BUY insights counts once", () => {
  const opinions = aggregateByCreator([insight(1, "Wire", "BUY"), insight(2, "Wire", "BUY"), insight(3, "Wire", "BUY")]);
  assert.equal(opinions.length, 1);
  assert.equal(opinions[0].stance, "POSITIVE");
  assert.equal(opinions[0].insightIds.length, 3);
});

test("three different BUY creators count three", () => {
  assert.equal(aggregateByCreator([insight(1, "Wire", "BUY"), insight(2, "LTFPL", "BUY"), insight(3, "Planet", "BUY")]).length, 3);
});

test("same creator across multiple episodes counts once while retaining episodes", () => {
  const opinion = aggregateByCreator([insight(1, "Wire", "BUY", "A"), insight(2, "Wire", "BUY", "B")])[0];
  assert.deepEqual(opinion.episodeIds, ["A", "B"]);
});

test("same creator BUY and SELL in one period becomes MIXED", () => {
  const evidence = [insight(1, "Wire", "BUY"), insight(2, "Wire", "SELL")];
  assert.equal(aggregateByCreator(evidence)[0].stance, "MIXED");
  assert.equal(aggregateSentiment(evidence), "MIXED");
});

test("chronological opinion change is preserved in evidence order", () => {
  const opinion = aggregateByCreator([
    insight(2, "Wire", "SELL", "later", "2026-08-08T10:00:00Z"),
    insight(1, "Wire", "BUY", "earlier", "2026-08-01T10:00:00Z"),
  ])[0];
  assert.equal(opinion.stance, "MIXED");
  assert.deepEqual(opinion.chronology.map((item) => [item.episodeId, item.stance]), [["earlier", "POSITIVE"], ["later", "NEGATIVE"]]);
});

test("split positions retain distinct creators and move self-contradiction to MIXED", () => {
  const evidence = [insight(1, "Wire", "BUY"), insight(2, "Wire", "SELL"), insight(3, "LTFPL", "BUY"), insight(4, "Planet", "SELL")];
  const byId = new Map(evidence.map((item) => [item.id, { ...item, episodeTitle: item.episodeId, claim: "claim", reasoning: "reason", evidenceText: null, entities: ["Saka"] } as SplitCandidateInsight]));
  const normalized = normalizeSplitCreatorEvidence({
    decisionKey: "buy-or-sell-saka", subject: "Saka", question: "Buy or sell Saka?", primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT",
    positions: [
      { positionKey: "buy", position: "BUY", reasoning: "Upside", supportingInsightIds: [uuid(1), uuid(3)] },
      { positionKey: "sell", position: "SELL", reasoning: "Risk", supportingInsightIds: [uuid(2), uuid(4)] },
    ], unresolvedQuestion: null, implication: null,
  }, byId)!;
  assert.deepEqual(normalized.positions.map((position) => position.supportingInsightIds), [[uuid(3)], [uuid(4)], [uuid(1), uuid(2)]]);
  assert.equal(normalized.positions[2].position, "MIXED CREATOR STANCE");
});

test("attention volume remains separate from creator breadth", () => {
  const evidence = [insight(1, "Wire", "BUY", "A"), insight(2, "Wire", "BUY", "B"), insight(3, "LTFPL", "BUY", "C")];
  assert.deepEqual(calculateSubjectAttention("Saka", evidence), { insightCount: 3, episodeCount: 3, creatorCount: 2 });
  assert.deepEqual(buildCreatorOpinionGroups(evidence)[0].attention, { insightCount: 3, episodeCount: 3, creatorCount: 2 });
});
