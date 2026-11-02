export const FPL_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type FplPosition = typeof FPL_POSITIONS[number];

export type FplTeam = { fplTeamId: number; name: string; shortName: string; code: number | null };
export type FplPlayer = {
  fplPlayerId: number; webName: string; firstName: string; secondName: string; knownName: string | null;
  canonicalName: string; fplTeamId: number; position: FplPosition; currentPrice: number; status: string | null;
  canSelect: boolean; canTransact: boolean; removed: boolean;
  eventPriceChange: number; startPriceChange: number;
  transfersIn: number; transfersOut: number; transfersInEvent: number; transfersOutEvent: number;
};
export type FplFixture = { fplFixtureId: number; eventId: number | null; kickoffTime: string | null; homeTeamId: number; awayTeamId: number; homeDifficulty: number; awayDifficulty: number; finished: boolean; started: boolean };
export type FplSnapshot = { teams: FplTeam[]; players: FplPlayer[]; fixtures: FplFixture[]; fetchedAt: string; eventId: number | null };
export type FplSyncResult = { runId: string; status: "COMPLETED" | "FAILED"; teamCount: number; playerCount: number; completedAt: string; errorMessage: string | null };
