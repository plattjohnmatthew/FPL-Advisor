import type { InsightExtraction } from "@/lib/insights/schema";
import type { FplPlayer, FplTeam } from "./types";

export function normalizeFplName(value: string) { return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase().replace(/[^a-z0-9]/g, ""); }
function uniqueMatch<T>(items: T[], candidates: string[], names: (item: T) => string[]) {
  const wanted = new Set(candidates.map(normalizeFplName).filter(Boolean));
  const matches = items.filter((item) => names(item).some((name) => wanted.has(normalizeFplName(name))));
  return matches.length === 1 ? matches[0] : null;
}
export function matchFplPlayer(name: string, aliases: string[], players: FplPlayer[]) {
  return uniqueMatch(players, [name, ...aliases], (player) => [player.canonicalName, player.webName, player.knownName ?? "", `${player.firstName} ${player.secondName}`]);
}
export function matchFplTeam(name: string, aliases: string[], teams: FplTeam[]) {
  return uniqueMatch(teams, [name, ...aliases], (team) => [team.name, team.shortName]);
}
export function resolveExtractionEntities<T extends InsightExtraction>(extraction: T, registry: { players: FplPlayer[]; teams: FplTeam[] }): T {
  return { ...extraction, insights: extraction.insights.map((insight) => ({ ...insight, entities: insight.entities.map((entity) => {
    if (entity.type === "PLAYER") { const player = matchFplPlayer(entity.canonicalName, entity.aliases, registry.players); return player ? { ...entity, canonicalName: player.canonicalName, aliases: [...new Set([...entity.aliases, entity.canonicalName, player.webName].filter((name) => name !== player.canonicalName))] } : entity; }
    const team = matchFplTeam(entity.canonicalName, entity.aliases, registry.teams); return team ? { ...entity, canonicalName: team.name, aliases: [...new Set([...entity.aliases, entity.canonicalName, team.shortName].filter((name) => name !== team.name))] } : entity;
  }) })) } as T;
}
export function currentPlayerMetadata(playerId: number, registry: { players: FplPlayer[]; teams: FplTeam[] }) {
  const player = registry.players.find((item) => item.fplPlayerId === playerId); if (!player) return null;
  const team = registry.teams.find((item) => item.fplTeamId === player.fplTeamId) ?? null;
  return { playerId, name: player.canonicalName, position: player.position, currentPrice: player.currentPrice, team };
}
