import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getFplEntryEnvironment, EnvironmentConfigurationError, InvalidEnvironmentConfigurationError } from "../../lib/env";
import { OfficialFplEntryProvider, FplEntryNotFoundError } from "../../lib/fpl-entry/official-provider";
import { FplSquadService } from "../../lib/fpl-entry/service";
import type { PublicFplSquad, StoredFplSquad } from "../../lib/fpl-entry/types";
import { deriveFormation, orderedBench, playerExplorerHref } from "../../lib/fpl-entry/presentation";
import { getTeamPresentation } from "../../lib/fpl-entry/team-colors";

test("FPL entry configuration is explicit and validated", () => {
  const previous = process.env.FPL_ENTRY_ID;
  try { delete process.env.FPL_ENTRY_ID; assert.throws(() => getFplEntryEnvironment(), EnvironmentConfigurationError); process.env.FPL_ENTRY_ID = "abc"; assert.throws(() => getFplEntryEnvironment(), InvalidEnvironmentConfigurationError); process.env.FPL_ENTRY_ID = "3555737"; assert.equal(getFplEntryEnvironment().entryId, 3555737); }
  finally { if (previous === undefined) delete process.env.FPL_ENTRY_ID; else process.env.FPL_ENTRY_ID = previous; }
});

const entry = { id: 3555737, name: "Palmersan Cheese", player_first_name: "John", player_last_name: "Platt", started_event: 1, summary_overall_points: 50, summary_overall_rank: 1000 };
const picks = Array.from({ length: 15 }, (_, index) => ({ element: index + 1, position: index + 1, multiplier: index === 0 ? 2 : index < 11 ? 1 : 0, is_captain: index === 0, is_vice_captain: index === 1 }));
function fetcher(mode: "public" | "predeadline" | "missing") {
  return async (input: string | URL | Request) => { const url = String(input); if (url.includes("bootstrap-static")) return Response.json({ events: [{ id: 1, deadline_time: mode === "predeadline" ? "2026-08-21T17:30:00Z" : "2026-08-01T17:30:00Z", is_next: mode === "predeadline" }] }); if (url.endsWith("/history/")) return Response.json({ current: mode === "public" ? [{ event: 1 }] : [] }); if (/\/entry\/\d+\/$/.test(url)) return mode === "missing" ? new Response(null, { status: 404 }) : Response.json(entry); if (url.includes("/picks/")) return Response.json({ active_chip: null, entry_history: { event: 1, points: 50, total_points: 50, overall_rank: 1000 }, picks }); return new Response(null, { status: 404 }); };
}
test("official provider loads post-deadline picks with captain, vice and ordered bench", async () => { const result = await new OfficialFplEntryProvider(fetcher("public") as typeof fetch, () => new Date("2026-08-09T00:00:00Z")).fetchLatestPublicSquad(3555737); assert.equal(result.availability, "PUBLIC_PICKS"); if (result.availability === "PUBLIC_PICKS") { assert.equal(result.picks.length, 15); assert.equal(result.picks[0].isCaptain, true); assert.equal(result.picks[1].isViceCaptain, true); assert.equal(result.picks[14].benchOrder, 4); } });
test("pre-deadline picks are explicitly unavailable", async () => { const result = await new OfficialFplEntryProvider(fetcher("predeadline") as typeof fetch, () => new Date("2026-08-09T00:00:00Z")).fetchLatestPublicSquad(3555737); assert.equal(result.availability, "NO_PUBLIC_PICKS"); assert.match(result.message, /not public before the deadline/); });
test("invalid entry ID returns a clear provider error", async () => { await assert.rejects(() => new OfficialFplEntryProvider(fetcher("missing") as typeof fetch).fetchLatestPublicSquad(999), FplEntryNotFoundError); });

const stored = { availability: "PUBLIC_PICKS", snapshotId: "snapshot", stale: false, refreshError: null, fplDataUpdatedAt: "2026-08-09T00:00:00Z", entry: { entryId: 1, entryName: "Team", managerName: "Manager", startedEvent: 1, overallPoints: 1, overallRank: 1 }, gameweek: 1, activeChip: null, eventPoints: 1, totalPoints: 1, overallRank: 1, retrievedAt: "2026-08-09T00:00:00Z", picks: [] } satisfies StoredFplSquad;
test("refresh failure preserves and labels the last saved squad", async () => { let failed = ""; const repository = { async startRefresh() { return "run"; }, async markUnavailable() {}, async markFailed(runId: string, error: string) { assert.equal(runId, "run"); failed = error; }, async persist(runId: string, squad: PublicFplSquad) { assert.ok(runId && squad); return stored; }, async getLatest() { return stored; } }; const service = new FplSquadService({ async fetchLatestPublicSquad() { throw new Error("official API unavailable"); } }, repository); const result = await service.refresh(1); assert.equal(result.availability, "STALE_PUBLIC_PICKS"); assert.equal(failed, "official API unavailable"); if (result.availability === "STALE_PUBLIC_PICKS") assert.equal(result.squad.stale, true); });

function formationPicks(defenders:number,midfielders:number,forwards:number): StoredFplSquad["picks"] { const positions=["GK",...Array(defenders).fill("DEF"),...Array(midfielders).fill("MID"),...Array(forwards).fill("FWD"),"GK","DEF","MID","FWD"]; return positions.map((position,index)=>({fplPlayerId:index+1,squadPosition:index+1,multiplier:index<11?1:0,isCaptain:index===1,isViceCaptain:index===2,benchOrder:index>10?index-10:null,playerName:`Player ${index+1}`,webName:`P${index+1}`,position,currentPrice:5+index/10,teamName:"Team",fplTeamId:1,entityId:index===3?null:`entity-${index+1}`,recentInsightCount:index})); }
test("pitch derives several real formations rather than hard-coding one",()=>{ assert.equal(deriveFormation(formationPicks(3,4,3)).label,"3-4-3"); assert.equal(deriveFormation(formationPicks(4,5,1)).label,"4-5-1"); assert.equal(deriveFormation(formationPicks(5,3,2)).label,"5-3-2"); });
test("bench order and captain metadata are preserved",()=>{ const squad=formationPicks(4,4,2); assert.deepEqual(orderedBench(squad).map((pick)=>pick.benchOrder),[1,2,3,4]); assert.equal(squad.find((pick)=>pick.isCaptain)?.webName,"P2"); assert.equal(squad.find((pick)=>pick.isViceCaptain)?.webName,"P3"); });
test("canonical My Team links use the existing 14-day entity explorer",()=>{ assert.equal(playerExplorerHref("entity-1"),"/entities/entity-1?range=14d&owned=1"); assert.equal(playerExplorerHref(null),null); });
test("central team presentation covers all 20 teams with kit-safe metadata",()=>{
  for (let teamId=1;teamId<=20;teamId+=1) { const kit=getTeamPresentation(teamId); assert.match(kit.primary,/^#[0-9a-f]{6}$/i); assert.match(kit.secondary,/^#[0-9a-f]{6}$/i); assert.ok(["SOLID","SLEEVES","STRIPES","HALVES","SASH"].includes(kit.pattern)); }
  assert.equal(getTeamPresentation(1).primary,"#ef0107"); assert.equal(getTeamPresentation(999).primary,"#46564e");
});
test("squad page rendering has no OpenAI dependency",()=>{ const source=["app/squad/page.tsx","app/squad/squad-view.tsx","app/squad/squad-pitch.tsx","lib/fpl-entry/repository.ts"].map((file)=>readFileSync(file,"utf8")).join("\n"); assert.doesNotMatch(source,/openai|responses\.create/i); });
test("pitch keeps every player card linked to the 14-day explorer with explicit C and VC markers",()=>{
  const source=readFileSync("app/squad/squad-pitch.tsx","utf8");
  assert.match(source,/data-testid="squad-player-card"/); assert.match(source,/playerExplorerHref/); assert.match(source,/role = pick\.isCaptain \? "C" : pick\.isViceCaptain \? "VC"/); assert.match(source,/double-gameweek-label/);
});
test("pitch readability uses larger high-contrast cards and responsive mobile sizing",()=>{
  const css=readFileSync("app/globals.css","utf8");
  assert.match(css,/\.pitch-player \{[^}]*width:160px/); assert.match(css,/\.player-label \{[^}]*background:rgba\(255,255,255,\.96\)/); assert.match(css,/\.player-label \.player-name-row strong \{[^}]*color:#13271e[^}]*font-size:14px/); assert.match(css,/@media \(max-width: 560px\)[\s\S]*\.pitch-player \{[^}]*width:min\(20vw,70px\)/);
});
test("team refresh also refreshes and returns the fixture calendar",()=>{
  const route=readFileSync("app/api/fpl-squad/route.ts","utf8"); const view=readFileSync("app/squad/squad-view.tsx","utf8");
  assert.match(route,/FplSyncService/); assert.match(route,/loadSquadFixtureCalendar/); assert.match(route,/fixtureCalendar/); assert.match(view,/setCalendar\(result\.fixtureCalendar\)/);
});
