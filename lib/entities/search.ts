export type SearchableEntity = { id: string; type: "PLAYER" | "TEAM"; canonicalName: string; aliases: string[]; externalFplId: number | null };

export function matchEntities(entities: SearchableEntity[], term: string, limit = 20) {
  const query = term.trim().toLocaleLowerCase();
  if (query.length < 2) return [];
  return entities.filter((entity) => entity.canonicalName.toLocaleLowerCase().includes(query) || entity.aliases.some((alias) => alias.toLocaleLowerCase().includes(query)))
    .sort((a, b) => Number(b.canonicalName.toLocaleLowerCase() === query) - Number(a.canonicalName.toLocaleLowerCase() === query) || a.canonicalName.localeCompare(b.canonicalName))
    .slice(0, limit);
}
