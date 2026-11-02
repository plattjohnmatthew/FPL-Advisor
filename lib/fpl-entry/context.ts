import "server-only";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { FplSquadRepository } from "./repository";
import { FplSelectedEntryRepository } from "./selection-repository";
import type { StoredFplSquad } from "./types";

export type SquadContextPlayer = StoredFplSquad["picks"][number] & { isStarter: boolean };
export type CurrentSquadContext = {
  entryId: number;
  snapshotId: string;
  gameweek: number;
  entryName: string;
  players: SquadContextPlayer[];
  playerIds: number[];
  entityIds: string[];
  captain: SquadContextPlayer;
  viceCaptain: SquadContextPlayer;
};

export class CurrentSquadContextService {
  constructor(
    private readonly selection = new FplSelectedEntryRepository(),
    private readonly squads = new FplSquadRepository(),
  ) {}

  async getCurrent(): Promise<CurrentSquadContext | null> {
    const entryId = await this.selection.getSelectedEntryId();
    await ensureSquadEntityMappings(entryId);
    const squad = await this.squads.getLatest(entryId);
    if (!squad) return null;
    const players = squad.picks.map((pick) => ({ ...pick, isStarter: pick.squadPosition <= 11 }));
    const captain = players.find((pick) => pick.isCaptain);
    const viceCaptain = players.find((pick) => pick.isViceCaptain);
    if (!captain || !viceCaptain) throw new Error("The saved FPL squad is missing captain metadata.");
    return {
      entryId, snapshotId: squad.snapshotId, gameweek: squad.gameweek, entryName: squad.entry.entryName,
      players, playerIds: players.map((pick) => pick.fplPlayerId),
      entityIds: players.flatMap((pick) => pick.entityId ? [pick.entityId] : []), captain, viceCaptain,
    };
  }
}

export async function ensureSquadEntityMappings(entryId: number) {
  const supabase = createSupabaseServerClient();
  const { data: snapshot, error: snapshotError } = await supabase.from("fpl_squad_snapshots")
    .select("id").eq("entry_id", entryId).order("gameweek", { ascending: false }).order("retrieved_at", { ascending: false }).limit(1).maybeSingle();
  if (snapshotError) throw new Error(`Could not load the current squad identity: ${snapshotError.message}`);
  if (!snapshot) return;
  const { data: picks, error: pickError } = await supabase.from("fpl_squad_picks")
    .select("fpl_player_id, fpl_players!inner(canonical_name,web_name)").eq("snapshot_id", snapshot.id);
  if (pickError) throw new Error(`Could not load squad players for identity mapping: ${pickError.message}`);
  const playerIds = picks.map((pick) => Number(pick.fpl_player_id));
  const { data: owners, error: ownerError } = await supabase.from("entities").select("external_fpl_id").eq("type", "PLAYER").in("external_fpl_id", playerIds);
  if (ownerError) throw new Error(`Could not inspect squad entity mappings: ${ownerError.message}`);
  const owned = new Set((owners ?? []).map((row) => Number(row.external_fpl_id)));
  for (const pick of picks) {
    if (owned.has(Number(pick.fpl_player_id))) continue;
    const player = pick.fpl_players as unknown as { canonical_name: string; web_name: string };
    const { data: exact, error: exactError } = await supabase.from("entities").select("id,external_fpl_id")
      .eq("type", "PLAYER").ilike("canonical_name", player.canonical_name).limit(2);
    if (exactError) throw new Error(`Could not resolve ${player.canonical_name}: ${exactError.message}`);
    if (exact?.length === 1 && exact[0].external_fpl_id == null) {
      const { error } = await supabase.from("entities").update({ external_fpl_id: pick.fpl_player_id, fpl_match_status: "RESOLVED" }).eq("id", exact[0].id);
      if (error) throw new Error(`Could not link ${player.canonical_name}: ${error.message}`);
    } else if (!exact?.length) {
      const aliases = player.web_name === player.canonical_name ? [] : [player.web_name];
      const { error } = await supabase.from("entities").insert({ type: "PLAYER", canonical_name: player.canonical_name, external_fpl_id: pick.fpl_player_id, aliases, fpl_match_status: "RESOLVED" });
      if (error) throw new Error(`Could not create the canonical squad entity ${player.canonical_name}: ${error.message}`);
    }
  }
}
