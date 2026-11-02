import { getPublishingEnvironment, publishRemoteSnapshot } from "../lib/public-snapshot/release";
import { FplSquadRepository } from "../lib/fpl-entry/repository";
import { loadEnvConfig } from "@next/env";
import { randomUUID } from "node:crypto";
import { getAppCapabilities } from "../lib/app-config";
import { createSupabaseServerClient } from "../lib/supabase/server";
import { collectDatabasePages } from "../lib/supabase/pagination";
import { PUBLIC_FIELDS, sanitizeTables, type PublicRow, type PublicSnapshot } from "../lib/public-snapshot/schema";
import { writeSnapshot } from "../lib/public-snapshot/storage";
import { RunSummarySchema } from "../lib/summaries/schema";
loadEnvConfig(process.cwd());
async function publish() {
  if (getAppCapabilities().mode !== "private") throw new Error("Publishing is a private/local operation; use APP_MODE=private.");
  const upload = process.argv.includes("--upload");
  if (upload) getPublishingEnvironment();
  const db=createSupabaseServerClient();
  const input: Record<string,PublicRow[]>={};
  await Promise.all(Object.entries(PUBLIC_FIELDS).map(async ([table,fields])=>{
    input[table]=await collectDatabasePages((from,to)=>db.from(table).select(fields).order(fields.split(",")[0]).range(from,to),`Unable to export ${table}`) as unknown as PublicRow[];
  }));
  const attempts=await collectDatabasePages((from,to)=>db.from("latest_episode_processing_attempts").select("episode_id,status").order("episode_id").range(from,to),"Unable to verify episode completion");
  const statuses=new Map(attempts.map(row=>[row.episode_id,row.status]));
  const transcriptEpisodes=new Set(input.transcripts.map(row=>row.episode_id));
  const insightEpisodes=new Set(input.insights.map(row=>row.episode_id));
  input.episodes=input.episodes.filter(row=>transcriptEpisodes.has(row.id) && insightEpisodes.has(row.id) && (!statuses.has(row.id) || statuses.get(row.id)==="COMPLETED"));
  const episodeIds=new Set(input.episodes.map(row=>row.id));
  for (const table of ["insights","transcripts","episode_extractions"]) input[table]=input[table].filter(row=>episodeIds.has(row.episode_id));
  const insightIds=new Set(input.insights.map(row=>row.id));
  input.insight_entities=input.insight_entities.filter(row=>insightIds.has(row.insight_id));
  // A split is published intact only when all its evidence is publishable.
  const badPositions=new Set(input.split_position_insights.filter(row=>!insightIds.has(row.insight_id)).map(row=>row.split_position_id));
  const badDecisions=new Set(input.split_positions.filter(row=>badPositions.has(row.id)).map(row=>row.split_decision_id));
  input.split_decisions=input.split_decisions.filter(row=>!badDecisions.has(row.id));
  const splitIds=new Set(input.split_decisions.map(row=>row.id));
  input.split_positions=input.split_positions.filter(row=>splitIds.has(row.split_decision_id));
  const positionIds=new Set(input.split_positions.map(row=>row.id));
  input.split_position_insights=input.split_position_insights.filter(row=>positionIds.has(row.split_position_id));
  const completed=new Set(input.synthesis_attempts.filter(row=>row.status==="COMPLETED").map(row=>row.synthesis_id));
  const before=input.run_summaries.length;
  input.run_summaries=input.run_summaries.filter(row=>completed.has(row.id) && RunSummarySchema.safeParse(row.summary_data).success);
  if (before!==input.run_summaries.length) console.log(`Excluded ${before-input.run_summaries.length} incomplete or incompatible briefings.`);
  const summaryIds=new Set(input.run_summaries.map(row=>row.id));
  input.synthesis_attempts=input.synthesis_attempts.filter(row=>summaryIds.has(row.synthesis_id) && row.status==="COMPLETED");
  input.synthesis_episodes=input.synthesis_episodes.filter(row=>summaryIds.has(row.synthesis_id));
  const tables=sanitizeTables(input);
  const latest=(rows:PublicRow[],field:string)=>rows.map(row=>String(row[field] ?? "")).filter(Boolean).sort().at(-1) ?? null;
  const snapshot:PublicSnapshot={ schema_version:1,id:randomUUID(),generated_at:new Date().toISOString(),latest_source_publication_at:latest(tables.episodes,"published_at"),latest_briefing_at:latest(tables.run_summaries,"generated_at"),counts:Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length])),tables };
  if (process.env.PUBLISH_PUBLIC_SQUAD === "true") {
    const selected=await db.from("fpl_selected_entry").select("entry_id").eq("singleton",true).maybeSingle();
    if(selected.error || !selected.data) throw new Error("Explicitly select and save a squad privately before publishing it.");
    const squad=await new FplSquadRepository().getLatest(Number(selected.data.entry_id));
    if(!squad) throw new Error("No saved squad is available for publication.");
    snapshot.squad={entryId:squad.entry.entryId,entryName:squad.entry.entryName,gameweek:squad.gameweek,retrievedAt:squad.retrievedAt,eventPoints:squad.eventPoints,totalPoints:squad.totalPoints,overallRank:squad.overallRank,activeChip:squad.activeChip,picks:squad.picks.map(({fplPlayerId,squadPosition,multiplier,isCaptain,isViceCaptain,benchOrder})=>({fplPlayerId,squadPosition,multiplier,isCaptain,isViceCaptain,benchOrder}))};
  }
  const bytes=await writeSnapshot(snapshot);
  if (upload) {
    const { put } = await import("@vercel/blob");
    await publishRemoteSnapshot(snapshot, put);
    console.log("Public data released; no application deployment or Git push required.");
  }
  console.log("Public snapshot generated");
  for (const [label,table] of Object.entries({ Briefings:"run_summaries",Episodes:"episodes",Insights:"insights",Players:"fpl_players",Teams:"fpl_teams",Creators:"sources" })) console.log(`${label}: ${snapshot.counts[table]}`);
  console.log(`Version: ${snapshot.id}\nBytes: ${bytes}\nGenerated: ${snapshot.generated_at}`);
}
publish().catch(error=>{ console.error(`Public snapshot generation failed: ${error instanceof Error ? error.message : "unknown error"}`);process.exitCode=1; });
