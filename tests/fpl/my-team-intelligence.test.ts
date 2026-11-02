import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSquadIntelligence, type SquadIntelligenceInsight } from "../../lib/fpl-entry/intelligence";
import type { CurrentSquadContext } from "../../lib/fpl-entry/context";

function player(id: number, entityId: string, position = "MID") {
  return { fplPlayerId: id, squadPosition: id, multiplier: 1, isCaptain: id === 1, isViceCaptain: id === 2, benchOrder: null, playerName: `Player ${id}`, webName: `P${id}`, position, currentPrice: 7.5, teamName: "Arsenal", fplTeamId: 1, entityId, recentInsightCount: 0, isStarter: true };
}
function context(players = [player(1, "entity-1"), player(2, "entity-2")]): CurrentSquadContext {
  return { entryId: 3555737, snapshotId: "snapshot", gameweek: 8, entryName: "Team", players, playerIds: players.map((item) => item.fplPlayerId), entityIds: players.map((item) => item.entityId!), captain: players[0], viceCaptain: players[1] };
}
function insight(id: string, entityId: string, sourceId: string, recommendation: string): SquadIntelligenceInsight {
  return { id, entityId, playerName: entityId, sourceId, sourceName: sourceId, episodeId: `episode-${id}`, episodeTitle: "Episode", sourceUrl: "https://example.com", publishedAt: "2026-10-25T00:00:00Z", claim: "Claim", reasoning: "Reason", recommendation, primaryCategory: "TRANSFER_DECISION", timeHorizon: "SHORT", timestampSeconds: 10, evidenceText: "Evidence", entities: [{ name: entityId, type: "PLAYER" }] };
}

test("squad relevance is derived from current entity membership and ignores non-squad insights", () => {
  const result = buildSquadIntelligence(context(), [insight("a", "entity-1", "creator-a", "BUY"), insight("b", "outside", "creator-b", "SELL")], [], "2026-10-17T00:00:00Z");
  assert.equal(result.players[0].status, "POSITIVE"); assert.equal(result.players[0].insightCount, 1);
  assert.equal(result.players[1].status, "NO_RECENT_COVERAGE"); assert.equal(result.questioned.length, 0);
});

test("creator breadth is distinct and contradictory creator positions are mixed", () => {
  const result = buildSquadIntelligence(context(), [insight("a", "entity-1", "same", "BUY"), insight("b", "entity-1", "same", "BUY"), insight("c", "entity-1", "same", "SELL")], [], "2026-10-17T00:00:00Z");
  assert.equal(result.players[0].creatorCount, 1); assert.equal(result.players[0].insightCount, 3); assert.equal(result.players[0].status, "MIXED");
});

test("changing the latest squad changes current relevance without changing insight records", () => {
  const stored = [insight("a", "entity-1", "creator", "BUY")];
  assert.equal(buildSquadIntelligence(context(), stored, [], "date").players[0].insightCount, 1);
  const transferred = context([player(2, "entity-2"), player(3, "entity-3")]);
  assert.equal(buildSquadIntelligence(transferred, stored, [], "date").players.every((item) => item.insightCount === 0), true);
  assert.equal(stored.length, 1);
});

test("selected entry remains database-backed and page load has no AI or transcript call", () => {
  const selection = readFileSync("lib/fpl-entry/selection-repository.ts", "utf8");
  const page = ["app/squad/page.tsx", "app/squad/squad-view.tsx", "lib/fpl-entry/intelligence.ts"].map((file) => readFileSync(file, "utf8")).join("\n");
  assert.match(selection, /from\("fpl_selected_entry"\)/); assert.match(selection, /getFplEntryEnvironment/);
  assert.doesNotMatch(page, /OpenAI|acquireTranscript|TranscriptProvider/);
  assert.match(page, /LAST_14_DAYS/);
});
