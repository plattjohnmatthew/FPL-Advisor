import type { StoredFplSquad } from "./types";

export const PITCH_POSITION_ORDER = ["GK", "DEF", "MID", "FWD"] as const;
export type SquadPlayer = StoredFplSquad["picks"][number];

export function deriveFormation(picks: SquadPlayer[]) {
  const starters = picks.filter((pick) => pick.squadPosition <= 11);
  const rows = PITCH_POSITION_ORDER.map((position) => ({ position, players: starters.filter((pick) => pick.position === position).sort((a, b) => a.squadPosition - b.squadPosition) }));
  return { rows, label: rows.slice(1).map((row) => row.players.length).join("-") };
}

export function orderedBench(picks: SquadPlayer[]) {
  return picks.filter((pick) => pick.squadPosition > 11).sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));
}

export function playerExplorerHref(entityId: string | null) { return entityId ? `/entities/${entityId}?range=14d&owned=1` : null; }
