import { z } from "zod";
import { RunSummarySchema } from "@/lib/summaries/schema";

export const PublishedSquadSchema=z.object({
 entryId:z.number().int().positive(),entryName:z.string(),gameweek:z.number().int().min(1).max(38),retrievedAt:z.string().refine(value=>Number.isFinite(Date.parse(value)),"Invalid publication date"),
 eventPoints:z.number().nullable(),totalPoints:z.number().nullable(),overallRank:z.number().nullable(),activeChip:z.string().nullable(),
 picks:z.array(z.object({fplPlayerId:z.number().int().positive(),squadPosition:z.number().int().min(1).max(15),multiplier:z.number(),isCaptain:z.boolean(),isViceCaptain:z.boolean(),benchOrder:z.number().nullable()}).strict()).length(15)
}).strict();
export type PublishedSquad=z.infer<typeof PublishedSquadSchema>;
// Explicit field allowlists. No SELECT * is used by the publisher.
export const PUBLIC_FIELDS = {
  sources: "id,name,platform",
  episodes: "id,source_id,title,source_url,published_at,created_at,external_episode_id,duration_seconds",
  transcripts: "id,episode_id,fetched_at",
  episode_extractions: "id,episode_id,model,prompt_version,extracted_at",
  insights: "id,episode_id,claim,reasoning,primary_category,recommendation,time_horizon,evidence_text,timestamp_seconds,extraction_index,created_at",
  entities: "id,type,canonical_name,aliases,external_fpl_id",
  insight_entities: "insight_id,entity_id,role",
  split_decisions: "id,question,unresolved_question,implication",
  split_positions: "id,split_decision_id,position,reasoning",
  split_position_insights: "split_position_id,insight_id",
  run_summaries: "id,scope_type,from_date,to_date,summary_data,generated_at,included_episode_count,distinct_creator_count,model,prompt_version,synthesis_mode,eligible_insight_count",
  synthesis_episodes: "synthesis_id,episode_id",
  synthesis_attempts: "id,synthesis_id,status",
  fpl_players: "fpl_player_id,first_name,second_name,web_name,canonical_name,fpl_team_id,position,current_price,event_price_change,start_price_change,transfers_in,transfers_out,transfers_in_event,transfers_out_event,status,updated_at",
  fpl_teams: "fpl_team_id,name,short_name,code,updated_at",
  fpl_fixtures: "fpl_fixture_id,event_id,kickoff_time,home_team_id,away_team_id,home_difficulty,away_difficulty,finished,started,updated_at",
  fpl_player_price_snapshots: "id,fpl_player_id,price,observed_at,event_id,source",
} as const;
export type PublicTable = keyof typeof PUBLIC_FIELDS;
export type PublicRow = Record<string, unknown>;
export type PublicTables = Record<PublicTable, PublicRow[]> & { public_episode_processing_states: PublicRow[] };
export type PublicSnapshot = { squad?:PublishedSquad; schema_version: 1; id: string; generated_at: string; latest_source_publication_at: string | null; latest_briefing_at: string | null; counts: Record<string, number>; tables: PublicTables };
export function sanitizeTables(input: Record<string, PublicRow[]>): PublicTables {
  const tables = Object.fromEntries(Object.entries(PUBLIC_FIELDS).map(([table, fields]) => [table, (input[table] ?? []).map(row => Object.fromEntries(fields.split(",").filter(field => field in row).map(field => [field, row[field]])))])) as PublicTables;
  // Zod parses only the published report contract, discarding private cache/prompt metadata.
  tables.insights = tables.insights.map(row => ({ ...row, evidence_text: typeof row.evidence_text === "string" ? row.evidence_text.slice(0,2000) : null }));
  tables.run_summaries = tables.run_summaries.map(row => ({ ...row, summary_data: RunSummarySchema.parse(row.summary_data) }));
  tables.public_episode_processing_states = tables.episodes.map(row => ({ episode_id: row.id, status: "COMPLETED" }));
  return tables;
}
export function validateSnapshot(snapshot: PublicSnapshot) {
  if (snapshot.schema_version !== 1 || !/^[a-zA-Z0-9-]+$/.test(snapshot.id) || !Number.isFinite(Date.parse(snapshot.generated_at))) throw new Error("Invalid snapshot metadata");
  const approvedMetadata = ["schema_version","id","generated_at","latest_source_publication_at","latest_briefing_at","counts","tables","squad"];
  if (Object.keys(snapshot).some(key=>!approvedMetadata.includes(key))) throw new Error("Unapproved snapshot metadata");
  const tables = snapshot.tables;
  const allowed = new Set([...Object.keys(PUBLIC_FIELDS), "public_episode_processing_states"]);
  for (const [table, rows] of Object.entries(tables)) {
    if (!allowed.has(table) || !Array.isArray(rows)) throw new Error(`Unapproved public table: ${table}`);
    const fields = table === "public_episode_processing_states" ? ["episode_id", "status"] : PUBLIC_FIELDS[table as PublicTable].split(",");
    for (const row of rows) {
      for (const [key,value] of Object.entries(row)) {
        if (!fields.includes(key)) throw new Error(`Unapproved public field: ${table}.${key}`);
        if (key === "summary_data") continue;
        if (key === "aliases") { if (!Array.isArray(value) || value.some(v=>typeof v!=="string")) throw new Error("Invalid aliases"); continue; }
        if (value != null && !["string","number","boolean"].includes(typeof value)) throw new Error(`Invalid public value: ${table}.${key}`);
      }
      const identity = fields[0];
      if (row[identity] == null || !["string","number"].includes(typeof row[identity])) throw new Error(`Missing public identity: ${table}`);
      if (table === "episodes" && !["https:","http:"].includes(new URL(String(row.source_url)).protocol)) throw new Error("Unsafe public source URL");
    }
  }
  for (const table of allowed) if (!Array.isArray(tables[table as keyof PublicTables])) throw new Error(`Missing public table: ${table}`);
  const ids = (table: keyof PublicTables, key = "id") => new Set(tables[table].map(row => String(row[key])));
  const references: Array<[keyof PublicTables, string, keyof PublicTables, string?]> = [
    ["episodes","source_id","sources"], ["insights","episode_id","episodes"], ["transcripts","episode_id","episodes"], ["episode_extractions","episode_id","episodes"],
    ["insight_entities","insight_id","insights"], ["insight_entities","entity_id","entities"],
    ["split_positions","split_decision_id","split_decisions"], ["split_position_insights","split_position_id","split_positions"], ["split_position_insights","insight_id","insights"],
    ["synthesis_episodes","synthesis_id","run_summaries"], ["synthesis_episodes","episode_id","episodes"], ["synthesis_attempts","synthesis_id","run_summaries"],
    ["fpl_players","fpl_team_id","fpl_teams","fpl_team_id"], ["fpl_fixtures","home_team_id","fpl_teams","fpl_team_id"], ["fpl_fixtures","away_team_id","fpl_teams","fpl_team_id"],
    ["fpl_player_price_snapshots","fpl_player_id","fpl_players","fpl_player_id"], ["public_episode_processing_states","episode_id","episodes"]
  ];
  for (const [from, field, to, key] of references) { const targets = ids(to,key); for (const row of tables[from]) if (!targets.has(String(row[field]))) throw new Error(`Broken public relationship: ${from}.${field}`); }
  for (const [table, rows] of Object.entries(tables)) {
    const key = table === "fpl_players" ? "fpl_player_id" : table === "fpl_teams" ? "fpl_team_id" : table === "fpl_fixtures" ? "fpl_fixture_id" : "id";
    if (rows.some(row => key in row) && new Set(rows.map(row => row[key])).size !== rows.length) throw new Error(`Duplicate public identity: ${table}`);
    if (snapshot.counts[table] !== rows.length) throw new Error(`Invalid public count: ${table}`);
  }
  const insightIds = ids("insights"), splitIds = ids("split_decisions");
  for (const row of tables.run_summaries) {
    const report = RunSummarySchema.parse(row.summary_data);
    const references = new Set([...report.overviewSupportingInsightIds,...Object.values(report.sections).flatMap(items=>items.flatMap(item=>item.supportingInsightIds))]);
    const positions = new Set(tables.split_positions.filter(position=>report.splitDecisionIds.includes(String(position.split_decision_id))).map(position=>position.id));
    for(const link of tables.split_position_insights)if(positions.has(link.split_position_id))references.add(String(link.insight_id));
    if (references.size > 200 || report.splitDecisionIds.length > 20 || JSON.stringify(report).length > 262144) throw new Error("Public briefing exceeds bounded evidence budget");
    if (JSON.stringify(report) !== JSON.stringify(row.summary_data)) throw new Error("Unapproved briefing metadata");
    for (const id of [...report.overviewSupportingInsightIds,...Object.values(report.sections).flatMap(items => items.flatMap(item => item.supportingInsightIds))]) if (!insightIds.has(id)) throw new Error("Briefing has unpublished evidence");
    for (const id of report.splitDecisionIds) if (!splitIds.has(id)) throw new Error("Briefing has unpublished split");
  }
  if (snapshot.squad) {
    const squad=PublishedSquadSchema.parse(snapshot.squad);
    if(new Set(squad.picks.map(p=>p.fplPlayerId)).size!==15 || new Set(squad.picks.map(p=>p.squadPosition)).size!==15 || squad.picks.filter(p=>p.isCaptain).length!==1 || squad.picks.filter(p=>p.isViceCaptain).length!==1) throw new Error("Invalid published squad picks");
    const players=ids("fpl_players","fpl_player_id");
    for(const pick of squad.picks) if(!players.has(String(pick.fplPlayerId))) throw new Error("Unpublished squad player");
  }
  const serialized = JSON.stringify(snapshot);
  if (Buffer.byteLength(serialized) > 25 * 1024 * 1024) throw new Error("Snapshot exceeds public size limit");
  if (/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}|sb_secret_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/.test(serialized)) throw new Error("Potential credential in public snapshot");
  for (const [key,value] of Object.entries(process.env)) if (/(?:KEY|TOKEN|SECRET|INSTRUCTIONS|PASSWORD)$/.test(key) && value && value.length >= 16 && serialized.includes(value)) throw new Error("Private configuration found in snapshot");
}
