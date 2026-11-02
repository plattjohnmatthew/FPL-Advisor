import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import type { FplPlayer, FplSnapshot, FplSyncResult, FplTeam, FplPosition } from "./types";
import { matchFplPlayer, matchFplTeam, normalizeFplName } from "./matching";
import { derivePriceMovement } from "./prices";

export interface FplRepository {
  startSync(): Promise<string>; completeSync(runId: string, snapshot: FplSnapshot): Promise<FplSyncResult>; failSync(runId: string, error: string): Promise<FplSyncResult>;
}
export class SupabaseFplRepository implements FplRepository {
  async startSync() { const { data, error } = await createSupabaseServerClient().from("fpl_sync_runs").insert({ status: "RUNNING" }).select("id").single(); if (error) throw new Error(`Unable to start FPL sync: ${error.message}`); return data.id as string; }
  async completeSync(runId: string, snapshot: FplSnapshot) {
    const supabase = createSupabaseServerClient();
    const { error: teamError } = await supabase.from("fpl_teams").upsert(snapshot.teams.map((team) => ({ fpl_team_id: team.fplTeamId, name: team.name, short_name: team.shortName, code: team.code, updated_at: snapshot.fetchedAt })), { onConflict: "fpl_team_id" });
    if (teamError) throw new Error(`Unable to sync FPL teams: ${teamError.message}`);
    const { error: playerError } = await supabase.from("fpl_players").upsert(snapshot.players.map((player) => ({ fpl_player_id: player.fplPlayerId, web_name: player.webName, first_name: player.firstName, second_name: player.secondName, known_name: player.knownName, canonical_name: player.canonicalName, fpl_team_id: player.fplTeamId, position: player.position, current_price: player.currentPrice, event_price_change: player.eventPriceChange, start_price_change: player.startPriceChange, transfers_in: player.transfersIn, transfers_out: player.transfersOut, transfers_in_event: player.transfersInEvent, transfers_out_event: player.transfersOutEvent, status: player.status, can_select: player.canSelect, can_transact: player.canTransact, removed: player.removed, updated_at: snapshot.fetchedAt })), { onConflict: "fpl_player_id" });
    if (playerError) throw new Error(`Unable to sync FPL players: ${playerError.message}`);
    const { error: fixtureError } = await supabase.from("fpl_fixtures").upsert(snapshot.fixtures.map((fixture) => ({ fpl_fixture_id: fixture.fplFixtureId, event_id: fixture.eventId, kickoff_time: fixture.kickoffTime, home_team_id: fixture.homeTeamId, away_team_id: fixture.awayTeamId, home_difficulty: fixture.homeDifficulty, away_difficulty: fixture.awayDifficulty, finished: fixture.finished, started: fixture.started, source: "OFFICIAL_FPL_FIXTURES", sync_run_id: runId, updated_at: snapshot.fetchedAt })), { onConflict: "fpl_fixture_id" });
    if (fixtureError) throw new Error(`Unable to sync FPL fixtures: ${fixtureError.message}`);
    const { error: snapshotError } = await supabase.from("fpl_player_price_snapshots").upsert(snapshot.players.map((player) => ({ sync_run_id: runId, fpl_player_id: player.fplPlayerId, price: player.currentPrice, observed_at: snapshot.fetchedAt, event_id: snapshot.eventId, source: "OFFICIAL_BOOTSTRAP" })), { onConflict: "sync_run_id,fpl_player_id", ignoreDuplicates: true });
    if (snapshotError) throw new Error(`Unable to store FPL price snapshots: ${snapshotError.message}`);
    await reconcileStoredEntities(snapshot);
    const completedAt = new Date().toISOString(); const { error } = await supabase.from("fpl_sync_runs").update({ status: "COMPLETED", completed_at: completedAt, player_count: snapshot.players.length, team_count: snapshot.teams.length, error_message: null }).eq("id", runId); if (error) throw new Error(`Unable to complete FPL sync: ${error.message}`);
    return { runId, status: "COMPLETED" as const, teamCount: snapshot.teams.length, playerCount: snapshot.players.length, completedAt, errorMessage: null };
  }
  async failSync(runId: string, message: string) { const completedAt = new Date().toISOString(); await createSupabaseServerClient().from("fpl_sync_runs").update({ status: "FAILED", completed_at: completedAt, error_message: message }).eq("id", runId); return { runId, status: "FAILED" as const, teamCount: 0, playerCount: 0, completedAt, errorMessage: message }; }
}

async function reconcileStoredEntities(snapshot: FplSnapshot) {
  const supabase = createSupabaseServerClient(); const { data, error } = await supabase.from("entities").select("id,type,canonical_name,aliases,external_fpl_id").order("canonical_name"); if (error) throw new Error(`Unable to load entities for FPL reconciliation: ${error.message}`);
  const claimedPlayers = new Set(data.filter((e) => e.type === "PLAYER" && e.external_fpl_id != null).map((e) => Number(e.external_fpl_id)));
  const claimedTeams = new Set(data.filter((e) => e.type === "TEAM" && e.external_fpl_id != null).map((e) => Number(e.external_fpl_id)));
  const unresolved = data.filter((e) => e.external_fpl_id == null).sort((a, b) => {
    const aExact = a.type === "PLAYER" ? snapshot.players.some((p) => normalizeFplName(p.canonicalName) === normalizeFplName(a.canonical_name)) : snapshot.teams.some((t) => normalizeFplName(t.name) === normalizeFplName(a.canonical_name));
    const bExact = b.type === "PLAYER" ? snapshot.players.some((p) => normalizeFplName(p.canonicalName) === normalizeFplName(b.canonical_name)) : snapshot.teams.some((t) => normalizeFplName(t.name) === normalizeFplName(b.canonical_name));
    return Number(bExact) - Number(aExact) || String(a.id).localeCompare(String(b.id));
  });
  for (const entity of unresolved) {
    const aliases = (entity.aliases as string[]) ?? [];
    const match = entity.type === "PLAYER" ? matchFplPlayer(entity.canonical_name, aliases, snapshot.players) : matchFplTeam(entity.canonical_name, aliases, snapshot.teams);
    if (!match) continue; const externalId = entity.type === "PLAYER" ? (match as FplPlayer).fplPlayerId : (match as FplTeam).fplTeamId; const claimed = entity.type === "PLAYER" ? claimedPlayers : claimedTeams; if (claimed.has(externalId)) continue;
    const { error: updateError } = await supabase.from("entities").update({ external_fpl_id: externalId, fpl_match_status: "RESOLVED" }).eq("id", entity.id); if (updateError) throw new Error(`Unable to link entity ${entity.id} to FPL ID ${externalId}: ${updateError.message}`); claimed.add(externalId);
  }
}

export async function loadFplRegistry(): Promise<{ players: FplPlayer[]; teams: FplTeam[] }> {
  const supabase = createSupabaseServerClient(); const [players, teams] = await Promise.all([supabase.from("fpl_players").select("*"), supabase.from("fpl_teams").select("*")]);
  if (players.error || teams.error) throw new Error(`Unable to load FPL registry: ${players.error?.message ?? teams.error?.message}`);
  return { players: players.data.map((p) => ({ fplPlayerId: p.fpl_player_id, webName: p.web_name, firstName: p.first_name, secondName: p.second_name, knownName: p.known_name, canonicalName: p.canonical_name, fplTeamId: p.fpl_team_id, position: p.position, currentPrice: Number(p.current_price), eventPriceChange: Number(p.event_price_change), startPriceChange: Number(p.start_price_change), transfersIn: Number(p.transfers_in), transfersOut: Number(p.transfers_out), transfersInEvent: Number(p.transfers_in_event), transfersOutEvent: Number(p.transfers_out_event), status: p.status, canSelect: p.can_select, canTransact: p.can_transact, removed: p.removed })), teams: teams.data.map((t) => ({ fplTeamId: t.fpl_team_id, name: t.name, shortName: t.short_name, code: t.code })) };
}
export type FplPlayerFilter = { teamId?: number; position?: FplPosition; minPrice?: number; maxPrice?: number };
export async function findFplPlayers(filters: FplPlayerFilter) { let query = createSupabaseServerClient().from("fpl_players").select("*, fpl_teams(name, short_name)").order("current_price"); if (filters.teamId) query = query.eq("fpl_team_id", filters.teamId); if (filters.position) query = query.eq("position", filters.position); if (filters.minPrice != null) query = query.gte("current_price", filters.minPrice); if (filters.maxPrice != null) query = query.lte("current_price", filters.maxPrice); const { data, error } = await query; if (error) throw new Error(`Unable to filter FPL players: ${error.message}`); return data; }
export async function findInsightsForFplPlayers(filters: FplPlayerFilter) { const players = await findFplPlayers(filters); if (!players.length) return []; const { data: entities, error } = await createSupabaseServerClient().from("entities").select("id").eq("type", "PLAYER").in("external_fpl_id", players.map((p) => p.fpl_player_id)); if (error) throw new Error(`Unable to map FPL players to entities: ${error.message}`); if (!entities.length) return []; const { data, error: insightError } = await createSupabaseServerClient().from("insight_entities").select("entity_id, role, insights(*, episodes(title, published_at, source_url, sources(name)))").in("entity_id", entities.map((e) => e.id)); if (insightError) throw new Error(`Unable to load FPL player insights: ${insightError.message}`); return data; }
export async function getLatestFplSyncStatus() { const { data, error } = await createSupabaseServerClient().from("fpl_sync_runs").select("id,status,started_at,completed_at,player_count,team_count,error_message").order("started_at", { ascending: false }).limit(1).maybeSingle(); if (error) throw new Error(`Unable to load FPL sync status: ${error.message}`); return data; }
export async function getPlayerPriceHistory(fplPlayerId: number, limit = 52) { const { data, error } = await createSupabaseServerClient().from("fpl_player_price_snapshots").select("id,price,observed_at,event_id,source,sync_run_id").eq("fpl_player_id", fplPlayerId).order("observed_at", { ascending: false }).limit(limit); if (error) throw new Error(`Unable to load FPL price history: ${error.message}`); return data.map((row) => ({ ...row, price: Number(row.price) })); }
export async function getPlayerPriceMovement(fplPlayerId: number) { const history = await getPlayerPriceHistory(fplPlayerId, 2); return derivePriceMovement(history.map((row) => ({ price: row.price, observedAt: row.observed_at }))); }
