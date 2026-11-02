import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchAnswerGenerator, ResearchQueryInterpreter } from "../../lib/research/models";
import type { ResearchRepository } from "../../lib/research/repository";
import { ResearchAnswerSchema, type ResearchAnswer, type ResearchQueryPlan, type RetrievedEvidence, type RetrievedInsight, type RetrievedSplitDecision } from "../../lib/research/schema";
import { evidenceId, FplResearchService } from "../../lib/research/service";
import type { AnalysisLookup, AnalysisSave, ResearchAnalysisStore } from "../../lib/research/analysis-repository";
import type { StoredAnalysis } from "../../lib/research/analysis-cache";

const oldId = "10000000-0000-4000-8000-000000000001"; const newId = "10000000-0000-4000-8000-000000000002";
const plan: ResearchQueryPlan = { playerEntities: ["Saka"], teamEntities: [], categories: [], creators: [], dateFrom: null, dateTo: null, gameweeks: [], searchTerms: ["Saka"], maxResults: 50, chronologicalComparison: true, currentDecision: false, splitFocus: false, includeTranscriptEvidence: false };
const insight = (id: string, publishedAt: string): RetrievedInsight => ({ id, claim: "Creator view", reasoning: "Reasoning", primaryCategory: "TRANSFER_DECISION", recommendation: "HOLD", timeHorizon: "SHORT", creatorConfidence: "HIGH", evidenceText: null, timestampSeconds: null, validFromGameweek: null, validToGameweek: null, episodeId: `episode-${id}`, episodeTitle: `Episode ${publishedAt}`, sourceUrl: `https://example.com/${id}`, publishedAt, gameweek: null, sourceId: `source-${id}`, sourceName: `Creator ${id}`, entities: [{ name: "Saka", type: "PLAYER" }] });

class Repo implements ResearchRepository {
  receivedPlan: ResearchQueryPlan | null = null;
  receivedPlans: ResearchQueryPlan[] = [];
  constructor(readonly insights: RetrievedInsight[], readonly splits: RetrievedSplitDecision[] = []) {}
  async searchInsights(value: ResearchQueryPlan) { this.receivedPlan = value; this.receivedPlans.push(value); return this.insights; }
  async searchSplits() { return this.splits; }
  async loadInsightsByIds(ids: string[]) { return this.insights.filter((item) => ids.includes(item.id)); }
}
class Interpreter implements ResearchQueryInterpreter { constructor(private value = plan) {} async interpret() { return this.value; } }
class Answerer implements ResearchAnswerGenerator {
  calls = 0; contexts: Array<{ requestId: string; model: string; domainContext?: unknown } | undefined> = []; constructor(private answers: Array<ResearchAnswer | Error>) {}
  async answer(_question: string, _evidence: RetrievedEvidence[], _splits: RetrievedSplitDecision[], _repair?: { error: string; validEvidenceIds: string[] }, context?: { requestId: string; model: string; domainContext?: unknown }) { this.contexts.push(context); const value = this.answers[Math.min(this.calls++, this.answers.length - 1)]; if (value instanceof Error) throw value; return value; }
}
const grounded = (ids = [oldId]): ResearchAnswer => ({ answerSummary: "Grounded summary", answerSummaryEvidenceIds: ids.map(evidenceId), insufficientEvidence: null, findings: [{ type: "ANSWER", statement: "Grounded finding", explanation: "Stored creator reasoning", evidenceIds: ids.map(evidenceId) }] });

test("every finding requires at least one evidence ID", () => {
  assert.equal(ResearchAnswerSchema.safeParse({ ...grounded(), findings: [{ type: "ANSWER", statement: "Bad", explanation: "Bad", evidenceIds: [] }] }).success, false);
});

test("valid evidence IDs produce readable, UUID-free primary source records", async () => {
  const result = await new FplResearchService(new Interpreter(), new Repo([insight(oldId, "2026-08-07T12:00:00Z")]), new Answerer([grounded()])).ask("What about Saka?", { preset: "ALL_HISTORY", timezoneOffsetMinutes: 0 });
  assert.equal(result.sources[0].sourceName.startsWith("Creator"), true); assert.equal(result.sources[0].episodeTitle.startsWith("Episode"), true);
  assert.equal(result.sources[0].sourceUrl.includes(oldId), true); assert.equal("evidenceId" in result.sources[0], false);
});

test("unknown evidence is rejected and one repair attempt can fix it", async () => {
  const bad = grounded([newId]); const answerer = new Answerer([bad, grounded([oldId])]);
  const result = await new FplResearchService(new Interpreter(), new Repo([insight(oldId, "2026-08-07T12:00:00Z")]), answerer).ask("What about Saka?", { preset: "ALL_HISTORY", timezoneOffsetMinutes: 0 });
  assert.equal(answerer.calls, 2); assert.equal(result.sources.length, 1);
  assert.equal(answerer.contexts[0]?.model, "gpt-5.4-mini"); assert.deepEqual(answerer.contexts[1], answerer.contexts[0]);
});

test("a second invalid answer fails without returning ungrounded content", async () => {
  const answerer = new Answerer([grounded([newId]), grounded([newId])]);
  await assert.rejects(() => new FplResearchService(new Interpreter(), new Repo([insight(oldId, "2026-08-07T12:00:00Z")]), answerer).ask("What about Saka?", { preset: "ALL_HISTORY", timezoneOffsetMinutes: 0 }), /unknown evidence ID/);
  assert.equal(answerer.calls, 2);
});

test("multiple findings may share evidence and one finding may cite multiple sources", async () => {
  const answer = grounded([oldId, newId]); answer.findings.push({ ...answer.findings[0], type: "CONSENSUS", statement: "Shared evidence" });
  const result = await new FplResearchService(new Interpreter(), new Repo([insight(oldId, "2025-08-10T12:00:00Z"), insight(newId, "2026-01-15T12:00:00Z")]), new Answerer([answer])).ask("How did views change?", { preset: "ALL_HISTORY", timezoneOffsetMinutes: 0 });
  assert.equal(result.sources.length, 2); assert.equal(result.answer.findings[0].evidenceIds.length, 2);
});

test("no retrieval result returns grounded insufficient evidence without answer generation", async () => {
  const answerer = new Answerer([new Error("must not run")]);
  const result = await new FplResearchService(new Interpreter(), new Repo([]), answerer).ask("What about Saka?");
  assert.equal(answerer.calls, 0); assert.equal(result.answer.findings.length, 0); assert.match(result.answer.insufficientEvidence!, /No relevant/);
});

test("selected scope reaches retrieval and is never broadened", async () => {
  const repo = new Repo([insight(oldId, "2026-08-07T12:00:00Z")]);
  await new FplResearchService(new Interpreter(), repo, new Answerer([grounded()])).ask("Should I sell Saka?", { preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 });
  assert.ok(repo.receivedPlan?.dateFrom); assert.ok(repo.receivedPlan?.dateTo);
});

test("empty keyword retrieval retries once without keywords but preserves the date boundary", async () => {
  const repo = new Repo([insight(oldId, "2026-08-07T12:00:00Z")]); let calls = 0;
  repo.searchInsights = async (value) => { repo.receivedPlan = value; repo.receivedPlans.push(value); return calls++ === 0 ? [] : repo.insights; };
  await new FplResearchService(new Interpreter(), repo, new Answerer([grounded()])).ask("What are the main debates?", { preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 });
  assert.equal(repo.receivedPlans.length, 2); assert.deepEqual(repo.receivedPlans[1].searchTerms, []);
  assert.equal(repo.receivedPlans[1].dateFrom, repo.receivedPlans[0].dateFrom); assert.equal(repo.receivedPlans[1].dateTo, repo.receivedPlans[0].dateTo);
});

test("a similar question reuses a saved answer only for the same scope and evidence fingerprint", async () => {
  class Store implements ResearchAnalysisStore {
    saved: StoredAnalysis | null = null; saves = 0;
    async findReusable(input: AnalysisLookup) { return this.saved && this.saved.scope.dateFrom === input.scope.dateFrom && this.saved.scope.dateTo === input.scope.dateTo ? this.saved : null; }
    async save(input: AnalysisSave) { this.saves += 1; return this.saved = { id: "30000000-0000-4000-8000-000000000001", contextMode: input.contextMode, question: input.question, normalizedQuestion: input.question.toLowerCase(), scope: input.scope, response: input.response, createdAt: "2026-08-10T12:00:00Z", reuseCount: 0 }; }
    async list() { return this.saved ? [this.saved] : []; }
  }
  const store = new Store(); const answerer = new Answerer([grounded()]); const repo = new Repo([insight(oldId, "2026-08-07T12:00:00Z")]);
  const service = new FplResearchService(new Interpreter(), repo, answerer, undefined, undefined, store);
  const first = await service.ask("Should I sell Saka?", { preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 });
  const second = await service.ask("Should I sell Saka now?", { preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 });
  assert.equal(store.saves, 1); assert.equal(answerer.calls, 1); assert.equal(first.analysis?.reused, false); assert.equal(second.analysis?.reused, true);
});

const squad = { entryId: 1, snapshotId: "snapshot", gameweek: 8, entryName: "Team", playerIds: [1,2,3], entityIds: ["e1","e2","e3"], players: [
  { fplPlayerId: 1, squadPosition: 1, multiplier: 1, isCaptain: true, isViceCaptain: false, benchOrder: null, playerName: "Owned Mid", webName: "Mid", position: "MID", currentPrice: 7.5, teamName: "Arsenal", fplTeamId: 1, entityId: "e1", recentInsightCount: 1, isStarter: true },
  { fplPlayerId: 2, squadPosition: 2, multiplier: 1, isCaptain: false, isViceCaptain: true, benchOrder: null, playerName: "Owned Forward", webName: "Forward", position: "FWD", currentPrice: 7.5, teamName: "Chelsea", fplTeamId: 2, entityId: "e2", recentInsightCount: 1, isStarter: true },
  { fplPlayerId: 3, squadPosition: 12, multiplier: 0, isCaptain: false, isViceCaptain: false, benchOrder: 1, playerName: "Bench Mid", webName: "Bench", position: "MID", currentPrice: 5, teamName: "Leeds", fplTeamId: 3, entityId: "e3", recentInsightCount: 0, isStarter: false },
], get captain() { return this.players[0]; }, get viceCaptain() { return this.players[1]; } } as const;
const squadService = { async getCurrent() { return squad; } };

test("My Team midfield and captain queries start from owned canonical players", async () => {
  const midfieldRepo = new Repo([insight(oldId, "2026-08-07T12:00:00Z")]);
  const answerer = new Answerer([grounded()]);
  await new FplResearchService(new Interpreter(), midfieldRepo, answerer, squadService as never).ask("What are creators saying about my midfield?", { preset: "LAST_14_DAYS", timezoneOffsetMinutes: 0 }, "MY_TEAM");
  assert.deepEqual(midfieldRepo.receivedPlan?.playerEntities, ["Owned Mid", "Bench Mid"]);
  const context = answerer.contexts[0]?.domainContext as { captain: string; players: Array<{ owned: boolean; position: string }> };
  assert.equal(context.captain, "Owned Mid"); assert.equal(context.players.every((item) => item.owned), true);
});

test("My Team replacement queries add price- and position-compatible non-owned candidates", async () => {
  const repo = new Repo([insight(oldId, "2026-08-07T12:00:00Z")]);
  const answerer = new Answerer([grounded()]);
  const replacementFinder = async (filters: { position?: string; maxPrice?: number }) => { assert.equal(filters.position, "FWD"); assert.equal(filters.maxPrice, 8); return [{ fpl_player_id: 99, canonical_name: "Candidate Forward" }] as never; };
  await new FplResearchService(new Interpreter(), repo, answerer, squadService as never, replacementFinder as never).ask("Who could replace one of my forwards?", { preset: "LAST_14_DAYS", timezoneOffsetMinutes: 0 }, "MY_TEAM");
  assert.deepEqual(repo.receivedPlan?.playerEntities, ["Owned Forward", "Candidate Forward"]);
  const context = answerer.contexts[0]?.domainContext as { nonOwnedCandidateNames: string[] };
  assert.deepEqual(context.nonOwnedCandidateNames, ["Candidate Forward"]);
});
