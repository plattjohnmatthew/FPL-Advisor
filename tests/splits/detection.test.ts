import assert from "node:assert/strict";
import test from "node:test";

import type { SplitDetectionResult } from "../../lib/splits/detector";
import { FakeSplitDecisionDetector } from "../../lib/splits/fake-detector";
import type { SplitDecisionRepository } from "../../lib/splits/repository";
import type { SplitCandidateInsight, SplitDetection } from "../../lib/splits/schema";
import { SplitDetectionSchema } from "../../lib/splits/schema";
import { SplitDecisionDetectionService } from "../../lib/splits/service";

const ids = [
  "10000000-0000-4000-8000-000000000001", "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003", "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005", "10000000-0000-4000-8000-000000000006",
  "10000000-0000-4000-8000-000000000007", "10000000-0000-4000-8000-000000000008",
];

function insight(index: number, source: string, claim: string, recommendation: string, horizon = "SHORT"): SplitCandidateInsight {
  return {
    id: ids[index], sourceId: source, sourceName: `Creator ${source}`, episodeId: `episode-${index}`,
    episodeTitle: `Episode ${index}`, publishedAt: "2026-08-08T12:00:00.000Z", claim,
    reasoning: `${claim} because of the stated FPL trade-off.`, primaryCategory: "TRANSFER_DECISION",
    recommendation, timeHorizon: horizon, evidenceText: claim, entities: ["Example Player"],
  };
}

class MemoryRepository implements SplitDecisionRepository {
  persisted: SplitDetectionResult[] = [];
  evaluated = new Set<string>();
  constructor(readonly insights: SplitCandidateInsight[]) {}
  async loadRunContext() {
    return { newInsightIds: this.insights.map((item) => item.id).filter((id) => !this.evaluated.has(id)), insights: this.insights };
  }
  async loadRelevantInsights() { return this.insights; }
  async persist(_runId: string | null, evaluatedIds: string[], result: SplitDetectionResult) {
    evaluatedIds.forEach((id) => this.evaluated.add(id));
    this.persisted.push(result);
    return result.splitDecisions.length;
  }
}

const metadata = { model: "fake-model", detectionVersion: "fpl-splits-v1", promptVersion: "fpl-splits-prompt-v1", detectedAt: "2026-08-08T12:00:00.000Z" };

test("persists actionable BUY/AVOID, HOLD/SELL, captaincy, and time-horizon splits with evidence", async () => {
  const context = [
    insight(0, "A", "Buy Palmer", "BUY"), insight(1, "B", "Avoid Palmer", "AVOID"),
    insight(2, "A", "Hold Watkins", "HOLD"), insight(3, "C", "Sell Watkins", "SELL"),
    { ...insight(4, "B", "Captain Salah", "CAPTAIN"), primaryCategory: "CAPTAINCY", entities: ["Salah"] },
    { ...insight(5, "D", "Captain Haaland", "CAPTAIN"), primaryCategory: "CAPTAINCY", entities: ["Haaland"] },
    insight(6, "A", "Buy Isak now", "BUY", "IMMEDIATE"), insight(7, "B", "Wait on Isak for the medium term", "WATCH", "MEDIUM"),
  ];
  const splitDecisions: SplitDetection["splitDecisions"] = [
    { decisionKey: "buy-or-avoid-palmer-short", subject: "Palmer", question: "Buy Palmer now?", primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", positions: [
      { positionKey: "buy-palmer", position: "BUY PALMER", reasoning: "Strong upside", supportingInsightIds: [ids[0]] },
      { positionKey: "avoid-palmer", position: "AVOID PALMER", reasoning: "Poor value", supportingInsightIds: [ids[1]] },
    ], unresolvedQuestion: "Does upside justify the price?", implication: "Managers must decide whether to spend the transfer." },
    { decisionKey: "hold-or-sell-watkins-short", subject: "Watkins", question: "Hold or sell Watkins?", primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", positions: [
      { positionKey: "hold-watkins", position: "HOLD WATKINS", reasoning: "Fixtures", supportingInsightIds: [ids[2]] },
      { positionKey: "sell-watkins", position: "SELL WATKINS", reasoning: "Weak threat", supportingInsightIds: [ids[3]] },
    ], unresolvedQuestion: null, implication: "Changes transfer priority." },
    { decisionKey: "captain-salah-or-haaland-immediate", subject: "Captaincy", question: "Captain Salah or Haaland?", primaryCategory: "CAPTAINCY", timeHorizon: "IMMEDIATE", positions: [
      { positionKey: "captain-salah", position: "CAPTAIN SALAH", reasoning: "Fixture", supportingInsightIds: [ids[4]] },
      { positionKey: "captain-haaland", position: "CAPTAIN HAALAND", reasoning: "Ceiling", supportingInsightIds: [ids[5]] },
    ], unresolvedQuestion: "Which upside matters more?", implication: "Captain choice drives immediate rank movement." },
    { decisionKey: "isak-timing-immediate-versus-medium", subject: "Isak", question: "Buy Isak immediately or wait?", primaryCategory: "TRANSFER_DECISION", timeHorizon: "IMMEDIATE", positions: [
      { positionKey: "buy-isak-now", position: "BUY NOW", reasoning: "Immediate upside", supportingInsightIds: [ids[6]] },
      { positionKey: "wait-on-isak", position: "WAIT", reasoning: "Medium-term uncertainty", supportingInsightIds: [ids[7]] },
    ], unresolvedQuestion: "Whether immediate upside outweighs medium-term uncertainty.", implication: "The split is about timing, not Isak's overall quality." },
  ];
  const repository = new MemoryRepository(context);
  const outcome = await new SplitDecisionDetectionService(repository, new FakeSplitDecisionDetector({ splitDecisions, ...metadata })).detectForRun("run-1");
  assert.equal(outcome.persistedCount, 4);
  assert.deepEqual(outcome.warnings, []);
  assert.deepEqual(repository.persisted[0].splitDecisions.map((item) => item.decisionKey), splitDecisions.map((item) => item.decisionKey));
  assert.deepEqual(repository.persisted[0].splitDecisions[3].positions.flatMap((item) => item.supportingInsightIds), [ids[6], ids[7]]);
});

test("same conclusion with different reasoning and insufficient evidence create no split", async () => {
  const context = [insight(0, "A", "Buy Palmer for fixtures", "BUY"), insight(1, "B", "Buy Palmer for form", "BUY")];
  const repository = new MemoryRepository(context);
  const service = new SplitDecisionDetectionService(repository, new FakeSplitDecisionDetector({ splitDecisions: [], ...metadata }));
  assert.equal((await service.detectForRun("run-1")).persistedCount, 0);
  assert.equal(repository.persisted.length, 1, "a successful no-split evaluation is recorded for idempotency");
  assert.equal((await service.detectForRun("run-2")).persistedCount, 0);
  assert.equal(repository.persisted.length, 1, "evaluated insights are skipped later");

  const oneCreator = new MemoryRepository([insight(2, "A", "Hold Watkins", "HOLD"), insight(3, "A", "Sell Watkins", "SELL")]);
  const candidate: SplitDetection["splitDecisions"][number] = { decisionKey: "watkins-one-creator", subject: "Watkins", question: "Hold or sell?", primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", positions: [
    { positionKey: "hold", position: "HOLD", reasoning: "Fixtures", supportingInsightIds: [ids[2]] },
    { positionKey: "sell", position: "SELL", reasoning: "Form", supportingInsightIds: [ids[3]] },
  ], unresolvedQuestion: null, implication: null };
  const filtered = new SplitDecisionDetectionService(oneCreator, new FakeSplitDecisionDetector({ splitDecisions: [candidate], ...metadata }));
  assert.equal((await filtered.detectForRun("run-1")).persistedCount, 0);
  assert.equal(oneCreator.persisted[0].splitDecisions.length, 0);
});

test("schema rejects one insight being used for competing positions", () => {
  const parsed = SplitDetectionSchema.safeParse({ splitDecisions: [{
    decisionKey: "invalid-shared-evidence", subject: "Player", question: "Buy or avoid?",
    primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", positions: [
      { positionKey: "buy", position: "BUY", reasoning: "A", supportingInsightIds: [ids[0]] },
      { positionKey: "avoid", position: "AVOID", reasoning: "B", supportingInsightIds: [ids[0]] },
    ], unresolvedQuestion: null, implication: null,
  }] });
  assert.equal(parsed.success, false);
});

test("invalid overlapping candidate is discarded without losing valid candidates or insights", async () => {
  const context = [insight(0, "A", "Buy Palmer", "BUY"), insight(1, "B", "Avoid Palmer", "AVOID")];
  const invalid = {
    decisionKey: "invalid-shared-evidence", subject: "Palmer", question: "Buy or avoid Palmer?",
    primaryCategory: "TRANSFER_DECISION" as const, timeHorizon: "SHORT" as const,
    positions: [
      { positionKey: "buy", position: "BUY", reasoning: "Upside", supportingInsightIds: [ids[0]] },
      { positionKey: "avoid", position: "AVOID", reasoning: "Risk", supportingInsightIds: [ids[0]] },
    ], unresolvedQuestion: null, implication: null,
  };
  const repository = new MemoryRepository(context);
  const outcome = await new SplitDecisionDetectionService(repository, new FakeSplitDecisionDetector({ splitDecisions: [invalid], ...metadata })).detectForRun("run-1");
  assert.equal(outcome.persistedCount, 0);
  assert.match(outcome.warnings[0], /cannot support competing positions/);
  assert.deepEqual([...repository.evaluated], context.map((item) => item.id), "normal insights remain evaluated and available");
});
