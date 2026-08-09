import assert from "node:assert/strict";
import test from "node:test";
import { episodeIdsWithPersistedInsights, evaluateSynthesisEligibility } from "../../lib/summaries/repository";

test("date-range inclusion uses persisted insight relationships, not processing-run membership", () => {
  const candidatesFromSeveralRuns = ["run-one-episode", "run-two-episode", "manual-import"];
  assert.deepEqual(
    episodeIdsWithPersistedInsights(candidatesFromSeveralRuns, ["run-one-episode", "run-two-episode", "manual-import"]),
    candidatesFromSeveralRuns,
  );
});

test("episodes without persisted insights are excluded without substituting demo records", () => {
  assert.deepEqual(episodeIdsWithPersistedInsights(["transcript-only"], []), []);
});

test("older persisted episodes remain eligible when they are candidates for a custom period", () => {
  assert.deepEqual(episodeIdsWithPersistedInsights(["historical-episode"], ["historical-episode"]), ["historical-episode"]);
});

test("synthesis eligibility depends on persisted transcripts and insights, not run outcome", () => {
  const result = evaluateSynthesisEligibility([
    { id: "partial-complete", title: "A", sourceName: "Creator A", transcriptCount: 1, insightCount: 12 },
    { id: "cancelled-complete", title: "B", sourceName: "Creator B", transcriptCount: 1, insightCount: 10 },
    { id: "no-transcript", title: "C", sourceName: "Creator C", transcriptCount: 0, insightCount: 3 },
    { id: "no-insights", title: "D", sourceName: "Creator D", transcriptCount: 1, insightCount: 0 },
  ]);
  assert.deepEqual(result.eligibleEpisodeIds, ["partial-complete", "cancelled-complete"]);
  assert.deepEqual(result.excludedEpisodes.map((item) => item.reason), ["No persisted transcript", "No successfully persisted insights"]);
});
