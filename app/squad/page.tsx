import { loadPublishedSquad } from "@/lib/public-snapshot/squad";
import { getAppCapabilities } from "@/lib/app-config";
import { notFound as publicNotFound } from "next/navigation";
import { FplSquadRepository } from "@/lib/fpl-entry/repository";
import { FplSelectedEntryRepository } from "@/lib/fpl-entry/selection-repository";
import { SquadIntelligenceService } from "@/lib/fpl-entry/intelligence";
import SquadView from "./squad-view";
import { loadSquadFixtureCalendar } from "@/lib/fpl/fixtures-repository";
import { emptySquadFixtureCalendar, type SquadFixtureCalendar } from "@/lib/fpl/fixture-runs";

export const dynamic = "force-dynamic";
export default async function SquadPage() {
  if (getAppCapabilities().mode === "public_read_only") {
    if(!getAppCapabilities().canViewSquad) publicNotFound();
    const published=await loadPublishedSquad();
    const calendar=await loadSquadFixtureCalendar(published?.squad.picks.map(p=>p.fplTeamId) ?? []);
    return <SquadView entryId={published?.squad.entry.entryId ?? null} initialSquad={published?.squad ?? null} initialMessage={published ? null : "No squad was included in this public snapshot."} initialIntelligence={published?.intelligence ?? null} fixtureCalendar={calendar} />;
  }
  let props: Parameters<typeof SquadView>[0];
  try {
    const entryId = await new FplSelectedEntryRepository().getSelectedEntryId();
    const repository = new FplSquadRepository();
    const intelligence = await new SquadIntelligenceService().load();
    const [squad, latestStatusMessage] = await Promise.all([repository.getLatest(entryId), repository.getLatestAvailability(entryId)]);
    let statusMessage = latestStatusMessage;
    let fixtureCalendar: SquadFixtureCalendar = emptySquadFixtureCalendar();
    try {
      fixtureCalendar = await loadSquadFixtureCalendar(squad?.picks.map((pick) => pick.fplTeamId) ?? []);
    } catch (error) {
      const fixtureError = error instanceof Error ? error.message : "Upcoming fixtures could not be loaded.";
      statusMessage = [statusMessage, fixtureError].filter(Boolean).join(" ");
    }
    props = { entryId, initialSquad: squad, initialMessage: statusMessage, initialIntelligence: intelligence, fixtureCalendar };
  } catch (error) {
    props = { entryId: null, initialSquad: null, initialMessage: error instanceof Error ? error.message : "FPL squad configuration could not be loaded.", initialIntelligence: null, fixtureCalendar: emptySquadFixtureCalendar() };
  }
  return <SquadView {...props} />;
}
