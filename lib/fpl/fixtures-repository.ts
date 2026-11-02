import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { emptySquadFixtureCalendar, findStrongFixtureRuns, fixtureDataStatus, isUpcomingFixture, type SquadFixtureCalendar, type TeamFixture } from "./fixture-runs";

export type TeamFixtureSchedule = { teamId: number; teamName: string; shortName: string; fixtures: TeamFixture[]; strongRuns: ReturnType<typeof findStrongFixtureRuns> };
export async function loadSquadFixtureCalendar(teamIds: number[], now = new Date()): Promise<SquadFixtureCalendar> {
  const uniqueTeamIds = [...new Set(teamIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (uniqueTeamIds.length === 0) return emptySquadFixtureCalendar();
  const supabase = createSupabaseServerClient();
  const [{ data: teams, error: teamError }, { data: fixtures, error: fixtureError }] = await Promise.all([
    supabase.from("fpl_teams").select("fpl_team_id,name,short_name"),
    supabase.from("fpl_fixtures").select("*").eq("finished", false).not("event_id", "is", null).or(`home_team_id.in.(${uniqueTeamIds.join(",")}),away_team_id.in.(${uniqueTeamIds.join(",")})`).order("event_id").order("kickoff_time"),
  ]);
  if (teamError || fixtureError) throw new Error(`Unable to load squad fixtures: ${teamError?.message ?? fixtureError?.message}`);
  const teamById = new Map(teams.map((team) => [Number(team.fpl_team_id), team]));
  const upcomingFixtures = fixtures.filter((fixture) => isUpcomingFixture({ finished: Boolean(fixture.finished), kickoffTime: fixture.kickoff_time as string | null }, now));
  const fixturesByTeam = Object.fromEntries(uniqueTeamIds.map((teamId) => [teamId, upcomingFixtures.filter((fixture) => Number(fixture.home_team_id) === teamId || Number(fixture.away_team_id) === teamId).map((fixture): TeamFixture => {
    const home = Number(fixture.home_team_id) === teamId; const opponent = teamById.get(Number(home ? fixture.away_team_id : fixture.home_team_id));
    return { fixtureId: Number(fixture.fpl_fixture_id), eventId: fixture.event_id == null ? null : Number(fixture.event_id), kickoffTime: fixture.kickoff_time as string | null, opponentName: String(opponent?.name ?? "Unknown"), opponentShortName: String(opponent?.short_name ?? "?"), venue: home ? "H" : "A", difficulty: Number(home ? fixture.home_difficulty : fixture.away_difficulty) };
  })]));
  const gameweeks = [...new Set(upcomingFixtures.map((fixture) => fixture.event_id == null ? null : Number(fixture.event_id)).filter((event): event is number => event != null))].sort((a, b) => a - b);
  const updatedAt = fixtures.map((fixture) => fixture.updated_at == null ? null : String(fixture.updated_at)).filter((value): value is string => value != null).sort().at(-1) ?? null;
  return { fixturesByTeam, gameweeks, defaultGameweek: gameweeks[0] ?? null, updatedAt, status: fixtureDataStatus(updatedAt, now) };
}

export async function loadFixtureDifficulty(limitPerTeam = 8) {
  const supabase = createSupabaseServerClient();
  const [{ data: teams, error: teamError }, { data: fixtures, error: fixtureError }] = await Promise.all([
    supabase.from("fpl_teams").select("fpl_team_id,name,short_name").order("name"),
    supabase.from("fpl_fixtures").select("*").eq("finished", false).order("event_id").order("kickoff_time"),
  ]);
  if (teamError || fixtureError) throw new Error(`Unable to load FPL fixtures: ${teamError?.message ?? fixtureError?.message}`);
  const teamById = new Map(teams.map((team) => [Number(team.fpl_team_id), team]));
  const schedules = teams.map((team): TeamFixtureSchedule => {
    const teamId = Number(team.fpl_team_id);
    const normalized = fixtures.filter((fixture) => Number(fixture.home_team_id) === teamId || Number(fixture.away_team_id) === teamId).slice(0, limitPerTeam).map((fixture): TeamFixture => {
      const home = Number(fixture.home_team_id) === teamId; const opponent = teamById.get(Number(home ? fixture.away_team_id : fixture.home_team_id));
      return { fixtureId: Number(fixture.fpl_fixture_id), eventId: fixture.event_id == null ? null : Number(fixture.event_id), kickoffTime: fixture.kickoff_time as string | null, opponentName: String(opponent?.name ?? "Unknown"), opponentShortName: String(opponent?.short_name ?? "?"), venue: home ? "H" : "A", difficulty: Number(home ? fixture.home_difficulty : fixture.away_difficulty) };
    });
    return { teamId, teamName: String(team.name), shortName: String(team.short_name), fixtures: normalized, strongRuns: findStrongFixtureRuns(normalized) };
  });
  const updatedAt = fixtures.map((fixture) => String(fixture.updated_at)).sort().at(-1) ?? null;
  return { schedules, updatedAt };
}
