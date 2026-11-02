export type FplEntryMetadata = { entryId: number; entryName: string; managerName: string; startedEvent: number; overallPoints: number | null; overallRank: number | null };
export type FplSquadPick = { fplPlayerId: number; squadPosition: number; multiplier: number; isCaptain: boolean; isViceCaptain: boolean; benchOrder: number | null };
export type PublicFplSquad = { availability: "PUBLIC_PICKS"; entry: FplEntryMetadata; gameweek: number; activeChip: string | null; eventPoints: number | null; totalPoints: number | null; overallRank: number | null; picks: FplSquadPick[]; retrievedAt: string };
export type NoPublicFplSquad = { availability: "NO_PUBLIC_PICKS"; entry: FplEntryMetadata; gameweek: null; nextGameweek: number | null; retrievedAt: string; message: string };
export type FplSquadFetchResult = PublicFplSquad | NoPublicFplSquad;
export type StoredFplSquad = Omit<PublicFplSquad, "picks"> & { snapshotId: string; stale: boolean; refreshError: string | null; fplDataUpdatedAt: string | null; picks: Array<FplSquadPick & { playerName: string; webName: string; position: string; currentPrice: number; teamName: string; fplTeamId: number; entityId: string | null; recentInsightCount: number }> };
export type FplSquadRefreshResult =
  | { availability: "PUBLIC_PICKS"; squad: StoredFplSquad }
  | { availability: "NO_PUBLIC_PICKS"; message: string; nextGameweek: number | null; latestSquad: StoredFplSquad | null }
  | { availability: "STALE_PUBLIC_PICKS"; message: string; squad: StoredFplSquad };
import type { SquadFixtureCalendar } from "@/lib/fpl/fixture-runs";

export type FplSquadPageRefreshResult = FplSquadRefreshResult & { fixtureCalendar: SquadFixtureCalendar; fixtureRefreshError: string | null };
