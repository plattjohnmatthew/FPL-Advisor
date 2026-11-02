import assert from "node:assert/strict";
import test from "node:test";
import { OfficialFplDataProvider, normalizePosition, normalizePrice } from "../../lib/fpl/official-provider";
import { currentPlayerMetadata, matchFplPlayer, resolveExtractionEntities } from "../../lib/fpl/matching";
import { FplSyncService } from "../../lib/fpl/sync-service";
import type { FplRepository } from "../../lib/fpl/repository";
import type { FplSnapshot } from "../../lib/fpl/types";
import { derivePriceMovement, filterPlayersByMetadata } from "../../lib/fpl/prices";

const observed = { eventPriceChange: 0, startPriceChange: 0, transfersIn: 0, transfersOut: 0, transfersInEvent: 0, transfersOutEvent: 0 };
const snapshot: FplSnapshot = { fetchedAt: "2026-08-09T00:00:00Z", eventId: 1, fixtures: [], teams: [{ fplTeamId: 1, name: "Arsenal", shortName: "ARS", code: 3 }, { fplTeamId: 2, name: "Chelsea", shortName: "CHE", code: 8 }], players: [
  { ...observed, fplPlayerId: 10, webName: "Saka", firstName: "Bukayo", secondName: "Saka", knownName: null, canonicalName: "Bukayo Saka", fplTeamId: 1, position: "MID", currentPrice: 10, status: "a", canSelect: true, canTransact: true, removed: false },
  { ...observed, fplPlayerId: 11, webName: "Smith", firstName: "John", secondName: "Smith", knownName: null, canonicalName: "John Smith", fplTeamId: 2, position: "MID", currentPrice: 6.5, status: "a", canSelect: true, canTransact: true, removed: false },
  { ...observed, fplPlayerId: 12, webName: "Smith", firstName: "James", secondName: "Smith", knownName: null, canonicalName: "James Smith", fplTeamId: 1, position: "DEF", currentPrice: 5, status: "a", canSelect: true, canTransact: true, removed: false },
] };

test("position and integer-tenths price normalization are explicit", () => { assert.equal(normalizePosition("GKP"), "GK"); assert.equal(normalizePosition("MID"), "MID"); assert.equal(normalizePrice(75), 7.5); });
test("official provider validates and normalizes current bootstrap shape", async () => {
  const provider = new OfficialFplDataProvider(async (url) => new Response(JSON.stringify(String(url).includes("fixtures") ? [{ id: 50, event: 1, kickoff_time: "2026-08-21T19:00:00Z", team_h: 1, team_a: 2, team_h_difficulty: 2, team_a_difficulty: 5, finished: false, started: false }] : { teams: [{ id: 1, name: "Arsenal", short_name: "ARS", code: 3 }], element_types: [{ id: 3, singular_name_short: "MID" }], events: [{ id: 1, is_current: false, is_next: true }], elements: [{ id: 10, web_name: "Saka", first_name: "Bukayo", second_name: "Saka", known_name: "", team: 1, element_type: 3, now_cost: 100, cost_change_event: 1, cost_change_start: 2, transfers_in: 100, transfers_out: 20, transfers_in_event: 10, transfers_out_event: 2, status: "a", can_select: true, can_transact: true, removed: false }] }), { status: 200 }));
  const result = await provider.fetchSnapshot(); assert.equal(result.eventId, 1); assert.equal(result.players[0].position, "MID"); assert.equal(result.players[0].currentPrice, 10); assert.equal(result.players[0].eventPriceChange, 0.1); assert.equal(result.players[0].canonicalName, "Bukayo Saka"); assert.equal(result.fixtures[0].homeDifficulty, 2); assert.equal(result.fixtures[0].awayDifficulty, 5);
});
test("price movement covers first observation, unchanged, increase and decrease", () => { assert.deepEqual(derivePriceMovement([{ price: 7.5, observedAt: "2" }]), { currentPrice: 7.5, previousPrice: null, difference: null, observedAt: "2" }); assert.equal(derivePriceMovement([{ price: 7.5, observedAt: "2" }, { price: 7.5, observedAt: "1" }]).difference, 0); assert.equal(derivePriceMovement([{ price: 7.6, observedAt: "2" }, { price: 7.5, observedAt: "1" }]).difference, 0.1); assert.equal(derivePriceMovement([{ price: 7.9, observedAt: "2" }, { price: 8, observedAt: "1" }]).difference, -0.1); });
test("price filters combine team, position and inclusive ranges", () => { assert.deepEqual(filterPlayersByMetadata(snapshot.players, { position: "MID", maxPrice: 7 }).map((p) => p.fplPlayerId), [11]); assert.deepEqual(filterPlayersByMetadata(snapshot.players, { teamId: 1, position: "DEF", maxPrice: 6 }).map((p) => p.fplPlayerId), [12]); assert.deepEqual(filterPlayersByMetadata(snapshot.players, { minPrice: 6, maxPrice: 8 }).map((p) => p.fplPlayerId), [11]); });
test("unique canonical or display names resolve while ambiguous names do not", () => { assert.equal(matchFplPlayer("Saka", [], snapshot.players)?.fplPlayerId, 10); assert.equal(matchFplPlayer("Bukayo Saka", [], snapshot.players)?.fplPlayerId, 10); assert.equal(matchFplPlayer("Smith", [], snapshot.players), null); });
test("extraction names become authoritative canonical names without changing insight history", () => {
  const extraction = { insights: [{ claim: "Buy Saka", reasoning: "Strong pick", primaryCategory: "TRANSFER_DECISION" as const, recommendation: "BUY" as const, timeHorizon: "SHORT" as const, creatorConfidence: "HIGH" as const, entities: [{ type: "PLAYER" as const, canonicalName: "Saka", aliases: [], role: "SUBJECT" }], tags: [], evidenceText: "Buy Saka", evidenceSegmentIds: [], timestampSeconds: null, validFromGameweek: null, validToGameweek: null }] };
  const resolved = resolveExtractionEntities(extraction, snapshot); assert.equal(resolved.insights[0].claim, extraction.insights[0].claim); assert.equal(resolved.insights[0].entities[0].canonicalName, "Bukayo Saka");
});
test("authoritative registry team overrides an incorrect AI team association", () => { const metadata = currentPlayerMetadata(10, snapshot); assert.equal(metadata?.team?.name, "Arsenal"); assert.notEqual(metadata?.team?.name, "Chelsea"); });
test("sync service records idempotent imports and updated team/price by stable ID", async () => {
  const stored = new Map<number, FplSnapshot["players"][number]>(); let run = 0;
  const repository: FplRepository = { async startSync() { return `run-${++run}`; }, async completeSync(runId, value) { value.players.forEach((p) => stored.set(p.fplPlayerId, p)); return { runId, status: "COMPLETED", teamCount: value.teams.length, playerCount: value.players.length, completedAt: value.fetchedAt, errorMessage: null }; }, async failSync(runId, error) { return { runId, status: "FAILED", teamCount: 0, playerCount: 0, completedAt: snapshot.fetchedAt, errorMessage: error }; } };
  const provider = { async fetchSnapshot() { return snapshot; } }; const service = new FplSyncService(provider, repository);
  await service.sync(); await service.sync(); assert.equal(stored.size, 3);
  const changed = structuredClone(snapshot); changed.players[0].fplTeamId = 2; changed.players[0].currentPrice = 10.1; const changedService = new FplSyncService({ async fetchSnapshot() { return changed; } }, repository); await changedService.sync(); assert.equal(stored.get(10)?.fplTeamId, 2); assert.equal(stored.get(10)?.currentPrice, 10.1);
});
