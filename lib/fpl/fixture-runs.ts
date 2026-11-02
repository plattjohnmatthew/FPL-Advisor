export type TeamFixture = { fixtureId: number; eventId: number | null; kickoffTime: string | null; opponentName: string; opponentShortName: string; venue: "H" | "A"; difficulty: number };
export type FixtureDataStatus = "CURRENT" | "STALE" | "UNAVAILABLE";
export type SquadFixtureCalendar = {
  fixturesByTeam: Record<number, TeamFixture[]>;
  gameweeks: number[];
  defaultGameweek: number | null;
  updatedAt: string | null;
  status: FixtureDataStatus;
};
export type SquadFixtureMode = "NEXT_THREE" | number;
export type StrongFixtureRun = { start: number; end: number; rule: "THREE_TWO_GREEN_ONE_NEUTRAL" | "FIVE_TWO_GREEN_NO_RED" | "FIVE_THREE_GREEN_MAX_ONE_RED" };
export const FIXTURE_FRESHNESS_MS = 24 * 60 * 60 * 1000;

export function emptySquadFixtureCalendar(status: FixtureDataStatus = "UNAVAILABLE"): SquadFixtureCalendar {
  return { fixturesByTeam: {}, gameweeks: [], defaultGameweek: null, updatedAt: null, status };
}

export function fixtureDataStatus(updatedAt: string | null, now = new Date()) : FixtureDataStatus {
  if (!updatedAt) return "UNAVAILABLE";
  const observedAt = new Date(updatedAt);
  if (Number.isNaN(observedAt.getTime())) return "UNAVAILABLE";
  return now.getTime() - observedAt.getTime() <= FIXTURE_FRESHNESS_MS ? "CURRENT" : "STALE";
}

export function isUpcomingFixture(fixture: { finished: boolean; kickoffTime: string | null }, now = new Date()) {
  if (fixture.finished) return false;
  if (!fixture.kickoffTime) return true;
  const kickoff = new Date(fixture.kickoffTime);
  return !Number.isNaN(kickoff.getTime()) && kickoff.getTime() > now.getTime();
}

export function difficultyBand(difficulty: number) { return difficulty <= 2 ? "GREEN" as const : difficulty === 3 ? "NEUTRAL" as const : "RED" as const; }

export function findStrongFixtureRuns(fixtures: TeamFixture[]) {
  const runs: StrongFixtureRun[] = [];
  for (let start = 0; start <= fixtures.length - 3; start += 1) {
    const window = fixtures.slice(start, start + 3).map((fixture) => difficultyBand(fixture.difficulty));
    if (window.filter((band) => band === "GREEN").length === 2 && window.filter((band) => band === "NEUTRAL").length === 1) runs.push({ start, end: start + 2, rule: "THREE_TWO_GREEN_ONE_NEUTRAL" });
  }
  for (let start = 0; start <= fixtures.length - 5; start += 1) {
    const window = fixtures.slice(start, start + 5).map((fixture) => difficultyBand(fixture.difficulty));
    const greens = window.filter((band) => band === "GREEN").length; const reds = window.filter((band) => band === "RED").length;
    if (greens >= 3 && reds <= 1) runs.push({ start, end: start + 4, rule: "FIVE_THREE_GREEN_MAX_ONE_RED" });
    else if (greens >= 2 && reds === 0) runs.push({ start, end: start + 4, rule: "FIVE_TWO_GREEN_NO_RED" });
  }
  return runs;
}

export function highlightedFixtureIndexes(fixtures: TeamFixture[]) { const indexes = new Set<number>(); for (const run of findStrongFixtureRuns(fixtures)) for (let index = run.start; index <= run.end; index += 1) indexes.add(index); return indexes; }

export function selectSquadFixtures(fixtures: TeamFixture[], mode: SquadFixtureMode) {
  return mode === "NEXT_THREE" ? fixtures.slice(0, 3) : fixtures.filter((fixture) => fixture.eventId === mode);
}

export function emptyFixtureLabel(status: FixtureDataStatus, selectedGameweek: number | null) {
  if (status === "UNAVAILABLE") return "Fixture unavailable";
  if (status === "STALE") return "Refresh needed";
  return selectedGameweek == null ? "No upcoming fixture" : `Blank GW${selectedGameweek}`;
}
