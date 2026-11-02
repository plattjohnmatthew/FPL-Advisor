import "server-only";
import { readSnapshot } from "./storage";
import type { StoredFplSquad } from "@/lib/fpl-entry/types";
import type { CurrentSquadContext } from "@/lib/fpl-entry/context";
import { buildSquadIntelligence, type SquadIntelligenceInsight } from "@/lib/fpl-entry/intelligence";
export async function loadPublishedSquad() {
 const snapshot=await readSnapshot(), published=snapshot.squad;
 if(!published) return null;
 const tables=snapshot.tables;
 const picks=published.picks.map(pick=>{
  const player=tables.fpl_players.find(row=>row.fpl_player_id===pick.fplPlayerId)!;
  const team=tables.fpl_teams.find(row=>row.fpl_team_id===player.fpl_team_id)!;
  const entity=tables.entities.find(row=>row.type==="PLAYER" && row.external_fpl_id===pick.fplPlayerId);
  return {...pick,playerName:String(player.canonical_name),webName:String(player.web_name),position:String(player.position),currentPrice:Number(player.current_price),teamName:String(team.name),fplTeamId:Number(team.fpl_team_id),entityId:entity ? String(entity.id):null,recentInsightCount:0};
 });
 const squad:StoredFplSquad={availability:"PUBLIC_PICKS",snapshotId:snapshot.id,stale:false,refreshError:null,fplDataUpdatedAt:tables.fpl_players.map(row=>String(row.updated_at)).sort().at(-1) ?? null,entry:{entryId:published.entryId,entryName:published.entryName,managerName:"",startedEvent:1,overallPoints:published.totalPoints,overallRank:published.overallRank},gameweek:published.gameweek,retrievedAt:published.retrievedAt,eventPoints:published.eventPoints,totalPoints:published.totalPoints,overallRank:published.overallRank,activeChip:published.activeChip,picks};
 const players=picks.map(pick=>({...pick,isStarter:pick.squadPosition<=11}));
 const context:CurrentSquadContext={entryId:published.entryId,snapshotId:snapshot.id,gameweek:published.gameweek,entryName:published.entryName,players,playerIds:players.map(p=>p.fplPlayerId),entityIds:players.flatMap(p=>p.entityId?[p.entityId]:[]),captain:players.find(p=>p.isCaptain)!,viceCaptain:players.find(p=>p.isViceCaptain)!};
 const from=new Date(snapshot.generated_at);from.setUTCDate(from.getUTCDate()-13);from.setUTCHours(0,0,0,0);
 const insights:SquadIntelligenceInsight[]=[];
 for(const link of tables.insight_entities){
  const owned=players.find(player=>player.entityId===link.entity_id);if(!owned)continue;
  const insight=tables.insights.find(row=>row.id===link.insight_id)!;
  const episode=tables.episodes.find(row=>row.id===insight.episode_id)!;if(String(episode.published_at)<from.toISOString())continue;
  const source=tables.sources.find(row=>row.id===episode.source_id)!;
  insights.push({id:String(insight.id),entityId:String(link.entity_id),playerName:owned.playerName,sourceId:String(source.id),sourceName:String(source.name),episodeId:String(episode.id),episodeTitle:String(episode.title),sourceUrl:String(episode.source_url),publishedAt:String(episode.published_at),claim:String(insight.claim),reasoning:String(insight.reasoning),recommendation:String(insight.recommendation),primaryCategory:String(insight.primary_category),timeHorizon:String(insight.time_horizon),timestampSeconds:insight.timestamp_seconds as number|null,evidenceText:insight.evidence_text as string|null,entities:[{name:owned.playerName,type:"PLAYER"}]});
 }
 const evidence=new Set(insights.map(row=>row.id));
 const positions=new Set(tables.split_position_insights.filter(row=>evidence.has(String(row.insight_id))).map(row=>row.split_position_id));
 const decisions=new Set(tables.split_positions.filter(row=>positions.has(row.id)).map(row=>row.split_decision_id));
 const splitQuestions=tables.split_decisions.filter(row=>decisions.has(row.id)).map(row=>String(row.question));
 return {squad,intelligence:buildSquadIntelligence(context,insights,splitQuestions,from.toISOString())};
}
