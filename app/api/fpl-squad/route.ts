import { disabledResponse } from "@/lib/app-config";
import { FplSquadService } from "@/lib/fpl-entry/service";
import { FplSelectedEntryRepository } from "@/lib/fpl-entry/selection-repository";
import { OfficialFplDataProvider } from "@/lib/fpl/official-provider";
import { SupabaseFplRepository } from "@/lib/fpl/repository";
import { FplSyncService } from "@/lib/fpl/sync-service";
import { loadSquadFixtureCalendar } from "@/lib/fpl/fixtures-repository";
import { emptySquadFixtureCalendar } from "@/lib/fpl/fixture-runs";

export async function POST() {
  const denied = disabledResponse("canRefreshFpl"); if (denied) return denied;

  try {
    const entryId = await new FplSelectedEntryRepository().getSelectedEntryId();
    let fixtureRefreshError: string | null = null;
    try {
      await new FplSyncService(new OfficialFplDataProvider(), new SupabaseFplRepository()).sync();
    } catch (error) {
      fixtureRefreshError = error instanceof Error ? error.message : "Official FPL fixture refresh failed.";
    }
    const result = await new FplSquadService().refresh(entryId);
    const squad = result.availability === "NO_PUBLIC_PICKS" ? result.latestSquad : result.squad;
    let fixtureCalendar = emptySquadFixtureCalendar();
    try {
      fixtureCalendar = await loadSquadFixtureCalendar(squad?.picks.map((pick) => pick.fplTeamId) ?? []);
    } catch (error) {
      fixtureRefreshError = [fixtureRefreshError, error instanceof Error ? error.message : "Fixture calendar could not be loaded."].filter(Boolean).join(" ");
    }
    return Response.json({ ...result, fixtureCalendar, fixtureRefreshError });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "FPL squad refresh failed." }, { status: 500 });
  }
}
