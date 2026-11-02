export type SearchableEntity = { id: string; type: "PLAYER" | "TEAM"; canonicalName: string; aliases: string[]; externalFplId: number | null; club?: string; fullName?: string; displayName?: string };

export function matchEntities(entities: SearchableEntity[], term: string, limit = 20) {
  const query = term.trim().toLocaleLowerCase();
  if (query.length < 2 && !/^\d+$/.test(query)) return [];
  return entities.filter((entity) => [entity.canonicalName, entity.club, entity.fullName, entity.displayName, ...entity.aliases].some((name) => name?.toLocaleLowerCase().includes(query)) || String(entity.externalFplId) === query)
    .sort((a, b) => Number(b.canonicalName.toLocaleLowerCase() === query) - Number(a.canonicalName.toLocaleLowerCase() === query) || a.canonicalName.localeCompare(b.canonicalName))
    .slice(0, limit);
}
