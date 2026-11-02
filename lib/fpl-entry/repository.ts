import "server-only";
import { createHash } from "node:crypto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PublicFplSquad, StoredFplSquad } from "./types";

type SnapshotRow = { id: string; entry_id: number; entry_name: string; manager_name: string; gameweek: number; retrieved_at: string; event_points: number | null; total_points: number | null; overall_rank: number | null; active_chip: string | null };
type PickRow = { fpl_player_id: number; squad_position: number; multiplier: number; is_captain: boolean; is_vice_captain: boolean; bench_order: number | null; fpl_players: { canonical_name: string; web_name: string; position: string; current_price: number; fpl_team_id: number; fpl_teams: { name: string } } };

export class FplSquadRepository {
  private client() { return createSupabaseServerClient(); }
  async startRefresh(entryId: number): Promise<string> {
    const { data, error } = await this.client().from("fpl_squad_refresh_runs").insert({ entry_id: entryId, status: "RUNNING" }).select("id").single();
    if (error) throw new Error(`Could not start FPL squad refresh: ${error.message}`);
    return data.id as string;
  }
  async markUnavailable(runId: string, message: string) {
    const { error } = await this.client().from("fpl_squad_refresh_runs").update({ status: "UNAVAILABLE", completed_at: new Date().toISOString(), availability_message: message }).eq("id", runId);
    if (error) throw new Error(`Could not record unavailable FPL squad: ${error.message}`);
  }
  async markFailed(runId: string, message: string) {
    const { error } = await this.client().from("fpl_squad_refresh_runs").update({ status: "FAILED", completed_at: new Date().toISOString(), error_message: message }).eq("id", runId);
    if (error) throw new Error(`Could not record failed FPL squad refresh: ${error.message}`);
  }
  async persist(runId: string, squad: PublicFplSquad): Promise<StoredFplSquad> {
    const picksHash = createHash("sha256").update(JSON.stringify([...squad.picks].sort((a, b) => a.squadPosition - b.squadPosition))).digest("hex");
    const { data, error } = await this.client().rpc("persist_fpl_squad_snapshot", { target_refresh_run_id: runId, target_entry_id: squad.entry.entryId, target_entry_name: squad.entry.entryName, target_manager_name: squad.entry.managerName, target_gameweek: squad.gameweek, target_retrieved_at: squad.retrievedAt, target_event_points: squad.eventPoints, target_total_points: squad.totalPoints, target_overall_rank: squad.overallRank, target_active_chip: squad.activeChip, target_picks_hash: picksHash, target_picks: squad.picks });
    if (error) throw new Error(`Could not persist FPL squad: ${error.message}`);
    const stored = await this.getById(data as string);
    if (!stored) throw new Error("The FPL squad was saved but could not be read back.");
    return stored;
  }
  async getLatest(entryId: number): Promise<StoredFplSquad | null> {
    const { data, error } = await this.client().from("fpl_squad_snapshots").select("id").eq("entry_id", entryId).order("gameweek", { ascending: false }).order("retrieved_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Could not load the latest FPL squad: ${error.message}`);
    return data ? this.getById(data.id as string) : null;
  }
  async getLatestAvailability(entryId: number): Promise<string | null> {
    const { data, error } = await this.client().from("fpl_squad_refresh_runs").select("availability_message,error_message").eq("entry_id", entryId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error(`Could not load FPL squad refresh status: ${error.message}`);
    return (data?.availability_message ?? data?.error_message ?? null) as string | null;
  }
  private async getById(snapshotId: string): Promise<StoredFplSquad | null> {
    const db = this.client();
    const [{ data: snapshot, error: snapshotError }, { data: picks, error: picksError }, { data: sync }] = await Promise.all([
      db.from("fpl_squad_snapshots").select("*").eq("id", snapshotId).maybeSingle(),
      db.from("fpl_squad_picks").select("fpl_player_id,squad_position,multiplier,is_captain,is_vice_captain,bench_order,fpl_players!inner(canonical_name,web_name,position,current_price,fpl_team_id,fpl_teams!inner(name))").eq("snapshot_id", snapshotId).order("squad_position"),
      db.from("fpl_sync_runs").select("completed_at").eq("status","COMPLETED").order("completed_at",{ascending:false}).limit(1).maybeSingle(),
    ]);
    if (snapshotError || picksError) throw new Error(`Could not load FPL squad details: ${snapshotError?.message ?? picksError?.message}`);
    if (!snapshot) return null;
    const pickRows = picks as unknown as PickRow[]; const playerIds = pickRows.map((pick) => pick.fpl_player_id);
    const { data: entities, error: entityError } = await db.from("entities").select("id,external_fpl_id").eq("type","PLAYER").in("external_fpl_id",playerIds);
    if (entityError) throw new Error(`Could not map FPL squad players to insight entities: ${entityError.message}`);
    const entityByPlayer = new Map((entities ?? []).map((entity) => [Number(entity.external_fpl_id), entity.id as string])); const insightCountByEntity = new Map<string,number>();
    if (entities?.length) { const since = new Date(); since.setUTCDate(since.getUTCDate()-30); const { data: links, error: linkError } = await db.from("insight_entities").select("entity_id,insights!inner(episodes!inner(published_at))").in("entity_id",entities.map((entity)=>entity.id)).gte("insights.episodes.published_at",since.toISOString()); if (linkError) throw new Error(`Could not load recent squad insight counts: ${linkError.message}`); for (const link of links ?? []) insightCountByEntity.set(link.entity_id as string,(insightCountByEntity.get(link.entity_id as string)??0)+1); }
    const row = snapshot as SnapshotRow;
    return { availability: "PUBLIC_PICKS", snapshotId: row.id, stale: false, refreshError: null, fplDataUpdatedAt: (sync?.completed_at as string | null) ?? null, entry: { entryId: row.entry_id, entryName: row.entry_name, managerName: row.manager_name, startedEvent: 1, overallPoints: row.total_points, overallRank: row.overall_rank }, gameweek: row.gameweek, retrievedAt: row.retrieved_at, eventPoints: row.event_points, totalPoints: row.total_points, overallRank: row.overall_rank, activeChip: row.active_chip, picks: pickRows.map((pick) => { const entityId=entityByPlayer.get(pick.fpl_player_id)??null; return { fplPlayerId: pick.fpl_player_id, squadPosition: pick.squad_position, multiplier: pick.multiplier, isCaptain: pick.is_captain, isViceCaptain: pick.is_vice_captain, benchOrder: pick.bench_order, playerName: pick.fpl_players.canonical_name, webName: pick.fpl_players.web_name, position: pick.fpl_players.position, currentPrice: Number(pick.fpl_players.current_price), teamName: pick.fpl_players.fpl_teams.name, fplTeamId: pick.fpl_players.fpl_team_id, entityId, recentInsightCount: entityId ? insightCountByEntity.get(entityId)??0 : 0 }; }) };
  }
}
