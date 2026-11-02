import assert from "node:assert/strict";
import test from "node:test";
import { synthesisCacheMetadata, validStoredSynthesis, type SynthesisCacheMetadata, type SynthesisIdentity } from "../../lib/summaries/cache";
import { NoEligibleContentError, RunSummarySynthesisService } from "../../lib/summaries/service";
import type { RunSummaryContext, SynthesisScope } from "../../lib/summaries/schema";
import type { RunSummaryGeneration, RunSummaryGenerator } from "../../lib/summaries/generator";
import type { RunSummaryRepository } from "../../lib/summaries/repository";
import { localDateRangeToUtcBounds } from "../../lib/dates/calendar-window";

const insightId = "10000000-0000-4000-8000-000000000001";
const otherId = "10000000-0000-4000-8000-000000000002";
const identity: SynthesisIdentity = { model: "model-a", promptVersion: "prompt-v1+custom-v1", reductionModel: "reducer-a", reductionPromptVersion: "reduction-v1", pipelineVersion: "pipeline-v1", configuration: { directMaxInputTokens: 1000 } };
function context(): RunSummaryContext {
  return { scope: { type: "DATE_RANGE", fromDate: "2026-10-01", toDate: "2026-10-07" }, runId: null, runStatus: null, eligibleEpisodeIds: ["episode-1"], includedEpisodeIds: ["episode-1"], excludedEpisodes: [], excludedEpisodeCount: 0, distinctCreatorCount: 1, failedEpisodes: [], splitDecisions: [],
    insights: [{ id: insightId, sourceId: "source-1", sourceName: "Creator", episodeId: "episode-1", episodeTitle: "Episode", sourceUrl: "https://example.com/episode", publishedAt: "2026-10-02T10:00:00Z", timestampSeconds: 30, claim: "Watch the player", reasoning: "Minutes remain uncertain", primaryCategory: "MINUTES_AVAILABILITY", recommendation: "WATCH", timeHorizon: "SHORT", entities: [{ id: "player-1", type: "PLAYER", name: "Player", role: "SUBJECT" }] }] };
}
function generation(current: SynthesisIdentity): RunSummaryGeneration {
  return { summary: { title: "Creator briefing", overviewParagraphs: ["A creator discusses minutes.", "This remains a creator claim."], overviewSupportingInsightIds: [insightId], splitDecisionIds: [], sections: { teamsToTarget: [], teamsToAvoid: [], playersToBuy: [], playersToSell: [], mostDiscussedPlayers: [], fixtureSwings: [], chipStrategy: [], undervaluedPlayers: [], overpricedPlayers: [], watchlist: [] } },
    model: current.model, promptVersion: current.promptVersion, generatedAt: "2026-10-08T10:00:00Z", inputTokens: 100, outputTokens: 20, totalTokens: 120, synthesisMode: "HIERARCHICAL", reductionModel: current.reductionModel, reductionPromptVersion: current.reductionPromptVersion, creatorBriefCount: 1 };
}
class Repository implements RunSummaryRepository {
  current = context(); attempts: string[] = []; saved: { id: string; context: RunSummaryContext; value: RunSummaryGeneration }[] = [];
  async findLatestRelevantRun() { return null; }
  async loadRunContext() { return this.current; }
  async loadDateRangeContext() { return this.current; }
  async startAttempt() { this.attempts.push("RUNNING"); return String(this.attempts.length - 1); }
  async finishAttempt(id: string) { this.attempts[Number(id)] = "COMPLETED"; }
  async failAttempt(id: string) { this.attempts[Number(id)] = "FAILED"; }
  async persist(_scope: SynthesisScope, context: RunSummaryContext, value: RunSummaryGeneration) { const id = `saved-${this.saved.length}`; this.saved.push({ id, context: structuredClone(context), value: structuredClone(value) }); return id; }
  async findReusable(context: RunSummaryContext, metadata: SynthesisCacheMetadata) { return this.saved.find((row) => row.value.cacheMetadata && validStoredSynthesis({ ...row.value.summary, _synthesis: row.value.cacheMetadata }, row.context.includedEpisodeIds, context, metadata))?.id ?? null; }
}

test("same period and structured evidence reuse a completed briefing without another generation", async () => {
  const repository = new Repository(); let calls = 0;
  const generator: RunSummaryGenerator = { getIdentity: async () => identity, generate: async () => { calls++; return generation(identity); } };
  const service = new RunSummarySynthesisService(repository, generator);
  const first = await service.synthesizeDateRange("2026-10-01", "2026-10-07");
  const second = await service.synthesizeDateRange("2026-10-01", "2026-10-07");
  assert.equal(first.reused, false); assert.equal(second.reused, true); assert.equal(first.synthesisId, second.synthesisId);
  assert.equal(calls, 1); assert.equal(repository.saved.length, 1); assert.deepEqual(repository.attempts, ["COMPLETED", "COMPLETED"]);
  assert.deepEqual(repository.saved[0].value.cacheMetadata?.sourceIds, ["source-1"]);
  assert.equal(repository.saved[0].value.cacheMetadata?.identity.pipelineVersion, "pipeline-v1");
  assert.equal(repository.saved[0].value.synthesisMode, "HIERARCHICAL");
});

test("evidence, model, prompt, reduction and pipeline changes all invalidate reuse", () => {
  const original = context();
  const bounds = localDateRangeToUtcBounds("2026-10-01", "2026-10-07", 0);
  const initial = synthesisCacheMetadata(original, identity, bounds).fingerprint;
  for (const key of ["model", "promptVersion", "reductionModel", "reductionPromptVersion", "pipelineVersion"] as const) assert.notEqual(synthesisCacheMetadata(original, { ...identity, [key]: "changed" }, bounds).fingerprint, initial);
  const changed = context(); changed.insights[0].reasoning = "New evidence";
  assert.notEqual(synthesisCacheMetadata(changed, identity, bounds).fingerprint, initial);
  changed.insights.push({ ...changed.insights[0], id: otherId });
  assert.notEqual(synthesisCacheMetadata(changed, identity, bounds).fingerprint, initial);
  assert.notEqual(synthesisCacheMetadata(original, identity, localDateRangeToUtcBounds("2026-10-01", "2026-10-07", -60)).fingerprint, initial);
});

test("database ordering does not change the evidence fingerprint", () => {
  const first = context(); first.insights.push({ ...first.insights[0], id: otherId, sourceId: "source-2" });
  const second = structuredClone(first); second.insights.reverse();
  assert.equal(synthesisCacheMetadata(first, identity, null).fingerprint, synthesisCacheMetadata(second, identity, null).fingerprint);
});

test("legacy, malformed, unknown-citation and incomplete episode sets are not reusable", () => {
  const current = context(); const metadata = synthesisCacheMetadata(current, identity, null); const summary = generation(identity).summary;
  assert.equal(validStoredSynthesis(summary, current.includedEpisodeIds, current, metadata), false);
  assert.equal(validStoredSynthesis({ _synthesis: metadata }, current.includedEpisodeIds, current, metadata), false);
  assert.equal(validStoredSynthesis({ ...summary, _synthesis: metadata }, [], current, metadata), false);
  assert.equal(validStoredSynthesis({ ...summary, overviewSupportingInsightIds: [otherId], _synthesis: metadata }, current.includedEpisodeIds, current, metadata), false);
});

test("changed data appends a new derived briefing and retains the earlier one", async () => {
  const repository = new Repository(); let calls = 0;
  const service = new RunSummarySynthesisService(repository, { getIdentity: async () => identity, generate: async () => { calls++; return generation(identity); } });
  await service.synthesizeDateRange("2026-10-01", "2026-10-07");
  repository.current.insights[0].claim = "Changed recommendation";
  const result = await service.synthesizeDateRange("2026-10-01", "2026-10-07");
  assert.equal(result.reused, false); assert.equal(calls, 2); assert.equal(repository.saved.length, 2);
});

test("no eligible content records failure without invoking the generator", async () => {
  const repository = new Repository(); repository.current.includedEpisodeIds = []; repository.current.insights = [];
  const service = new RunSummarySynthesisService(repository, { generate: async () => { throw new Error("Must not generate"); } });
  await assert.rejects(() => service.synthesizeDateRange("2026-10-01", "2026-10-07"), NoEligibleContentError);
  assert.deepEqual(repository.attempts, ["FAILED"]); assert.equal(repository.saved.length, 0);
});

test("an identity change during generation never marks the result reusable under the wrong version", async () => {
  const repository = new Repository();
  const service = new RunSummarySynthesisService(repository, { getIdentity: async () => identity, generate: async () => generation({ ...identity, promptVersion: "new-version" }) });
  await service.synthesizeDateRange("2026-10-01", "2026-10-07");
  assert.equal(repository.saved[0].value.cacheMetadata, undefined);
});
