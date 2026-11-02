import type { InsightExtraction } from "@/lib/insights/schema";
import type { FplPlayer, FplTeam } from "./types";
import { matchFplPlayer, matchFplTeam, normalizeFplName } from "./matching";

export type ExistingEntityIdentity = { id: string; type: "PLAYER" | "TEAM"; canonicalName: string; aliases: string[]; externalFplId: number | null };

export function resolveCanonicalEntitiesForPersistence(
  extraction: InsightExtraction,
  registry: { players: FplPlayer[]; teams: FplTeam[] },
  existing: ExistingEntityIdentity[],
): InsightExtraction {
  return { insights: extraction.insights.map((insight) => ({ ...insight, entities: insight.entities.map((incoming) => {
    const registryMatch = incoming.type === "PLAYER"
      ? matchFplPlayer(incoming.canonicalName, incoming.aliases, registry.players)
      : matchFplTeam(incoming.canonicalName, incoming.aliases, registry.teams);
    const trustedId = registryMatch ? (incoming.type === "PLAYER" ? (registryMatch as FplPlayer).fplPlayerId : (registryMatch as FplTeam).fplTeamId) : null;
    const trustedName = registryMatch ? (incoming.type === "PLAYER" ? (registryMatch as FplPlayer).canonicalName : (registryMatch as FplTeam).name) : incoming.canonicalName;
    const owner = trustedId == null ? null : existing.find((item) => item.type === incoming.type && item.externalFplId === trustedId) ?? null;
    const wanted = new Set([incoming.canonicalName, trustedName, ...incoming.aliases].map(normalizeFplName).filter(Boolean));
    const textMatches = existing.filter((item) => item.type === incoming.type && [item.canonicalName, ...item.aliases].some((name) => wanted.has(normalizeFplName(name))) && (trustedId == null || item.externalFplId == null || item.externalFplId === trustedId));
    const textMatch = textMatches.length === 1 ? textMatches[0] : null;
    const selected = owner ?? textMatch;
    const canonicalName = selected?.canonicalName ?? trustedName;
    const aliases = [...new Map([...incoming.aliases, incoming.canonicalName, trustedName, ...(selected?.aliases ?? [])]
      .map((name) => name.trim()).filter((name) => name && normalizeFplName(name) !== normalizeFplName(canonicalName))
      .map((name) => [normalizeFplName(name), name])).values()];
    return { ...incoming, canonicalName, aliases };
  }) })) };
}
