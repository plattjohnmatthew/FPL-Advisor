import assert from "node:assert/strict";
import test from "node:test";
import { assertWithinTokenBudget, estimateTokens, selectSynthesisMode } from "../../lib/summaries/token-budget";
import { chunkCreatorInsights, creatorBriefInputHash, insightClusterKey, mergeCreatorBriefs } from "../../lib/summaries/creator-brief";
import type { SummaryInsightContext } from "../../lib/summaries/schema";

const uuid = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const insight = (n: number, recommendation = "BUY", publishedAt = `2026-08-${String(n).padStart(2, "0")}T00:00:00Z`): SummaryInsightContext => ({
  id: uuid(n), sourceId: uuid(900), sourceName: "Creator", episodeId: uuid(500 + n), episodeTitle: `Episode ${n}`,
  sourceUrl: `https://example.com/${n}`, publishedAt, timestampSeconds: null, claim: `${recommendation} Player`, reasoning: "Useful reason", primaryCategory: "TRANSFER_DECISION",
  recommendation, timeHorizon: "SHORT", entities: [{ id: uuid(800), type: "PLAYER", name: "Player", role: "SUBJECT" }],
});

test("small inputs use direct synthesis and large inputs switch before an API call", () => {
  assert.equal(selectSynthesisMode(10, 100), "DIRECT");
  assert.equal(selectSynthesisMode(101, 100), "HIERARCHICAL");
  assert.throws(() => assertWithinTokenBudget("test", 101, 100), /configured safe limit/);
  assert.ok(estimateTokens("a".repeat(1000)) > 0);
});

test("same-creator repeated positions cluster while conflicting recommendations remain distinct", () => {
  assert.equal(insightClusterKey(insight(1)), insightClusterKey(insight(2)));
  assert.notEqual(insightClusterKey(insight(1)), insightClusterKey(insight(2, "SELL")));
});

test("one large creator is chunked only at insight boundaries", () => {
  const values = Array.from({ length: 30 }, (_, index) => ({ ...insight(index + 1), reasoning: "r".repeat(1000) }));
  const chunks = chunkCreatorInsights(values, 3000);
  assert.ok(chunks.length > 1); assert.equal(chunks.flat().length, values.length);
});

test("creator input hash is stable and changes only when that creator's inputs change", () => {
  const values = [insight(1), insight(2)];
  assert.equal(creatorBriefInputHash(values), creatorBriefInputHash([...values].reverse()));
  assert.notEqual(creatorBriefInputHash(values), creatorBriefInputHash([...values, insight(3)]));
});

test("partial creator briefs retain original evidence and represent chronology as MIXED", () => {
  const base = { creatorId: uuid(900), creatorName: "Creator", scope: { from: "2026-08-01", to: "2026-08-18" } };
  const position = (recommendation: string, id: number, latestPublishedAt: string) => ({ clusterKey: "player|TRANSFER_DECISION|SHORT", subject: "Player", entityIds: [uuid(800)], category: "TRANSFER_DECISION", recommendation, timeHorizon: "SHORT", stance: recommendation === "BUY" ? "POSITIVE" as const : "NEGATIVE" as const, claim: `${recommendation} Player`, reasoning: ["Reason"], evidenceInsightIds: [uuid(id)], episodeIds: [uuid(500 + id)], latestPublishedAt, previousStance: null, changedAt: null });
  const merged = mergeCreatorBriefs([{ ...base, positions: [position("BUY", 1, "2026-08-02")] }, { ...base, positions: [position("SELL", 2, "2026-08-12")] }]);
  assert.equal(merged.positions[0].stance, "MIXED"); assert.deepEqual(merged.positions[0].evidenceInsightIds, [uuid(1), uuid(2)]); assert.equal(merged.positions[0].changedAt, "2026-08-12");
});

test("synthesis implementation contains no raw transcript dependency", async () => {
  const source = await import("node:fs/promises").then((fs) => fs.readFile("lib/summaries/openai-generator.ts", "utf8"));
  assert.doesNotMatch(source, /rawText|transcript\.raw|transcripts\(/);
});
