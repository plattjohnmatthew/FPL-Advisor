import assert from "node:assert/strict";
import test from "node:test";

import { FakeRunSummaryGenerator } from "../../lib/summaries/fake-generator";
import type { RunSummaryGeneration } from "../../lib/summaries/generator";
import type { RunSummaryRepository } from "../../lib/summaries/repository";
import { createRunSummaryOutputSchema, type RunSummaryContext } from "../../lib/summaries/schema";
import { RunSummarySynthesisService } from "../../lib/summaries/service";

const insightA = "10000000-0000-4000-8000-000000000001";
const insightB = "10000000-0000-4000-8000-000000000002";
const splitId = "20000000-0000-4000-8000-000000000001";

test("OpenAI summary output requires UUID citations before service-level allowlist validation", () => {
  const schema = createRunSummaryOutputSchema([insightA, insightB], []);
  const result = schema.safeParse({
    title: "Report",
    overviewParagraphs: ["One", "Two"],
    overviewSupportingInsightIds: ["30000000-0000-4000-8000-000000000001"],
    sections: Object.fromEntries([
      "teamsToTarget", "teamsToAvoid", "playersToBuy", "playersToSell", "mostDiscussedPlayers",
      "fixtureSwings", "chipStrategy", "undervaluedPlayers", "overpricedPlayers", "watchlist",
    ].map((key) => [key, []])),
    splitDecisionIds: [],
  });
  assert.equal(result.success, true);
});

const context: RunSummaryContext = {
  scope: { type: "RUN", runId: "run-1" }, runId: "run-1", runStatus: "PARTIAL",
  eligibleEpisodeIds: ["episode-a", "episode-b"], includedEpisodeIds: ["episode-a", "episode-b"],
  excludedEpisodes: [{ episodeId: "failed", title: "Failed episode", sourceName: "Creator C", reason: "Transcript unavailable" }],
  excludedEpisodeCount: 1, distinctCreatorCount: 2,
  failedEpisodes: [{ episodeId: "failed", title: "Failed episode", sourceName: "Creator C", errorMessage: "Transcript unavailable" }],
  insights: [
    { id: insightA, sourceId: "source-a", sourceName: "Creator A", episodeId: "episode-a", episodeTitle: "A", sourceUrl: "https://example.com/a", publishedAt: "2026-08-07T10:00:00Z", timestampSeconds: null, claim: "Buy Player", reasoning: "Fixtures", primaryCategory: "TRANSFER_DECISION", recommendation: "BUY", timeHorizon: "SHORT", entities: [{ type: "PLAYER", name: "Player", role: "SUBJECT" }] },
    { id: insightB, sourceId: "source-b", sourceName: "Creator B", episodeId: "episode-b", episodeTitle: "B", sourceUrl: "https://example.com/b", publishedAt: "2026-08-08T10:00:00Z", timestampSeconds: null, claim: "Buy Player", reasoning: "Role", primaryCategory: "TRANSFER_DECISION", recommendation: "BUY", timeHorizon: "SHORT", entities: [{ type: "PLAYER", name: "Player", role: "SUBJECT" }] },
  ],
  splitDecisions: [{ id: splitId, question: "Buy now or wait?", unresolvedQuestion: "Timing", implication: "Transfer priority", positions: [
    { position: "BUY", reasoning: "Upside", supportingInsightIds: [insightA], creators: ["Creator A"], creatorCount: 1 },
    { position: "WAIT", reasoning: "Uncertainty", supportingInsightIds: [insightB], creators: ["Creator B"], creatorCount: 1 },
  ] }],
};

function generation(): RunSummaryGeneration {
  return {
    summary: {
      title: "FPL Weekly Intelligence",
      overviewParagraphs: ["Two creators report a transfer theme.", "One episode failed, so coverage is partial."],
      overviewSupportingInsightIds: [insightA, insightB],
      sections: {
        teamsToTarget: [], teamsToAvoid: [],
        playersToBuy: [{ subject: "Player", sentiment: "POSITIVE", summary: "Two creators support buying.", reasoning: "Fixtures and role.", sourceCount: 99, timeHorizon: "SHORT", caveat: null, interpretation: "CONSENSUS", supportingInsightIds: [insightA, insightB], supportingCreatorNames: [], attention: { insightCount: 1, episodeCount: 1, creatorCount: 1 } }],
        playersToSell: [], mostDiscussedPlayers: [{ subject: "Player", sentiment: "POSITIVE", summary: "Player drew cross-source attention.", reasoning: "Two independent episodes discussed the same action.", sourceCount: 2, timeHorizon: "SHORT", caveat: null, interpretation: "CONSENSUS", supportingInsightIds: [insightA, insightB], supportingCreatorNames: [], attention: { insightCount: 1, episodeCount: 1, creatorCount: 1 } }],
        fixtureSwings: [], chipStrategy: [], undervaluedPlayers: [], overpricedPlayers: [], watchlist: [],
      },
      splitDecisionIds: [splitId],
    },
    model: "fake-model", promptVersion: "fpl-editorial-report-v2", generatedAt: "2026-08-08T12:00:00.000Z",
    inputTokens: 100, outputTokens: 30, totalTokens: 130,
  };
}

class MemoryRepository implements RunSummaryRepository {
  persisted: RunSummaryGeneration[] = [];
  persistedContexts: RunSummaryContext[] = [];
  attempts: Array<{ status: string; message?: string }> = [];
  dateContext = context;
  async findLatestRelevantRun() { return { id: "run-1", status: "PARTIAL" as const }; }
  async loadRunContext() { return context; }
  async loadDateRangeContext() { return this.dateContext; }
  async startAttempt() { this.attempts.push({ status: "RUNNING" }); return `attempt-${this.attempts.length}`; }
  async finishAttempt() { this.attempts.at(-1)!.status = "COMPLETED"; }
  async failAttempt(_id: string, message: string) { Object.assign(this.attempts.at(-1)!, { status: "FAILED", message }); }
  async persist(_scope: import("../../lib/summaries/schema").SynthesisScope, persistedContext: RunSummaryContext, result: RunSummaryGeneration) { this.persistedContexts.push(persistedContext); this.persisted.push(result); return "summary-1"; }
}

test("partial-run synthesis persists traceable claims using successful structured insights", async () => {
  const repository = new MemoryRepository();
  const id = await new RunSummarySynthesisService(repository, new FakeRunSummaryGenerator(generation())).synthesizeRun("run-1", "PARTIAL");
  assert.equal(id.synthesisId, "summary-1");
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].interpretation, "CONSENSUS");
  assert.deepEqual(repository.persisted[0].summary.sections.playersToBuy[0].supportingInsightIds, [insightA, insightB]);
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].sourceCount, 2);
  assert.equal(repository.persisted[0].summary.sections.playersToBuy.length, 1, "similar atomic insights are aggregated");
  assert.ok(repository.persisted[0].summary.sections.playersToBuy.length < context.insights.length);
  assert.equal(context.failedEpisodes.length, 1);
  assert.deepEqual(repository.persistedContexts[0].includedEpisodeIds, ["episode-a", "episode-b"]);
  assert.deepEqual(repository.persistedContexts[0].excludedEpisodes, context.excludedEpisodes);
  assert.equal(repository.persistedContexts[0].distinctCreatorCount, 2);
});

test("cancelled and partial runs synthesize only their completed episode set", async () => {
  for (const status of ["CANCELLED", "PARTIAL"] as const) {
    const repository = new MemoryRepository();
    const result = await new RunSummarySynthesisService(repository, new FakeRunSummaryGenerator(generation())).synthesizeRun("run-1", status);
    assert.equal(result.includedEpisodeCount, 2);
    assert.equal(result.excludedEpisodeCount, 1);
  }
});

test("synthesis failure is retryable without ingestion work", async () => {
  const repository = new MemoryRepository();
  let calls = 0;
  const generator = { generate: async () => { calls += 1; if (calls === 1) throw new Error("Temporary OpenAI failure"); return generation(); } };
  const service = new RunSummarySynthesisService(repository, generator);
  await assert.rejects(service.synthesizeRun("run-1", "PARTIAL"), /Temporary OpenAI failure/);
  assert.equal(repository.attempts[0].status, "FAILED");
  assert.equal((await service.synthesizeRun("run-1", "PARTIAL")).synthesisId, "summary-1");
  assert.equal(repository.attempts[1].status, "COMPLETED");
  assert.equal(calls, 2);
});

test("unknown insight and split IDs cannot be persisted", async () => {
  const bad = generation();
  bad.summary.sections.watchlist = [{ subject: "Invented", sentiment: "NEUTRAL", summary: "Invented", reasoning: "None", sourceCount: 1, timeHorizon: null, caveat: null, interpretation: "CREATOR_CLAIM", supportingInsightIds: ["30000000-0000-4000-8000-000000000001"], supportingCreatorNames: [], attention: { insightCount: 1, episodeCount: 1, creatorCount: 1 } }];
  const repository = new MemoryRepository();
  await assert.rejects(() => new RunSummarySynthesisService(repository, new FakeRunSummaryGenerator(bad)).synthesizeRun("run-1", "PARTIAL"), /unknown insight ID/);
  assert.equal(repository.persisted.length, 0);
});

test("single-creator evidence is retained but normalized away from consensus", async () => {
  const bad = generation();
  bad.summary.sections.playersToBuy[0].supportingInsightIds = [insightA];
  bad.summary.sections.playersToBuy[0].sourceCount = 1;
  const repository = new MemoryRepository();
  await new RunSummarySynthesisService(repository, new FakeRunSummaryGenerator(bad)).synthesizeRun("run-1", "PARTIAL");
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].interpretation, "SINGLE_SOURCE");
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].sourceCount, 1);
});

test("two episodes from one creator still count as one source", async () => {
  const sameCreatorContext = structuredClone(context);
  sameCreatorContext.insights[1].sourceId = sameCreatorContext.insights[0].sourceId;
  sameCreatorContext.distinctCreatorCount = 1;
  const repository = new MemoryRepository();
  repository.dateContext = sameCreatorContext;
  await new RunSummarySynthesisService(repository, new FakeRunSummaryGenerator(generation())).synthesizeDateRange("2026-08-03", "2026-08-09");
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].sourceCount, 1);
  assert.equal(repository.persisted[0].summary.sections.playersToBuy[0].interpretation, "SINGLE_SOURCE");
});
