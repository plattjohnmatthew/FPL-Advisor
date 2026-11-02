import assert from "node:assert/strict";
import test from "node:test";

import { resolveCanonicalEntitiesForPersistence, type ExistingEntityIdentity } from "../../lib/fpl/extraction-entity-resolution";
import type { InsightExtraction } from "../../lib/insights/schema";
import type { FplPlayer, FplTeam } from "../../lib/fpl/types";

const player = (id: number, canonicalName: string): FplPlayer => ({
  fplPlayerId: id, webName: canonicalName.split(" ").at(-1)!, firstName: canonicalName.split(" ")[0], secondName: canonicalName.split(" ").slice(1).join(" "),
  knownName: null, canonicalName, fplTeamId: 1, position: "MID", currentPrice: 7, status: null, canSelect: true, canTransact: true,
  removed: false, eventPriceChange: 0, startPriceChange: 0, transfersIn: 0, transfersOut: 0, transfersInEvent: 0, transfersOutEvent: 0,
});
const team = (id: number, name: string): FplTeam => ({ fplTeamId: id, name, shortName: name.slice(0, 3), code: null });
const insight = (entities: InsightExtraction["insights"][number]["entities"]): InsightExtraction => ({ insights: [{
  claim: "Test claim", reasoning: "Test reasoning", primaryCategory: "TRANSFER_DECISION", recommendation: "WATCH", timeHorizon: "SHORT",
  creatorConfidence: "MEDIUM", tags: [], evidenceText: "Evidence", timestampSeconds: null, validFromGameweek: null, validToGameweek: null, entities,
}] });
const registry = { players: [player(11, "Cristhian Mosquera"), player(397, "Antoine Semenyo")], teams: [team(5, "Brighton"), team(19, "Spurs")] };
const existing: ExistingEntityIdentity[] = [
  { id: "mosquera", type: "PLAYER", canonicalName: "Mosquera", aliases: ["Mosca"], externalFplId: 11 },
  { id: "brighton", type: "TEAM", canonicalName: "Brighton & Hove Albion", aliases: ["Brighton"], externalFplId: 5 },
];

test("reuses the player already owning a trusted external FPL ID", () => {
  const result = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Cristhian Mosquera", aliases: [], role: "SUBJECT" }]), registry, existing);
  assert.equal(result.insights[0].entities[0].canonicalName, "Mosquera");
  assert.ok(result.insights[0].entities[0].aliases.includes("Cristhian Mosquera"));
});

test("reuses an existing entity through a compatible alias when no registry ID is known", () => {
  const result = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Mosca", aliases: [], role: "SUBJECT" }]), { players: [], teams: [] }, existing);
  assert.equal(result.insights[0].entities[0].canonicalName, "Mosquera");
});

test("repeated resolution across episodes is idempotent", () => {
  const input = insight([{ type: "TEAM", canonicalName: "Brighton", aliases: [], role: "TEAM_CONTEXT" }]);
  assert.deepEqual(resolveCanonicalEntitiesForPersistence(input, registry, existing), resolveCanonicalEntitiesForPersistence(input, registry, existing));
});

test("two names for one player resolve to the same persisted owner", () => {
  const first = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Mosquera", aliases: [], role: "SUBJECT" }]), registry, existing);
  const second = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Cristhian Mosquera", aliases: [], role: "SUBJECT" }]), registry, existing);
  assert.equal(first.insights[0].entities[0].canonicalName, second.insights[0].entities[0].canonicalName);
});

test("team normalization follows the same external-ID ownership rule", () => {
  const result = resolveCanonicalEntitiesForPersistence(insight([{ type: "TEAM", canonicalName: "Brighton", aliases: [], role: "TEAM_CONTEXT" }]), registry, existing);
  assert.equal(result.insights[0].entities[0].canonicalName, "Brighton & Hove Albion");
});

test("creates a canonical name only when no trusted owner or unique alias exists", () => {
  const result = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Antoine Semenyo", aliases: [], role: "SUBJECT" }]), registry, existing);
  assert.equal(result.insights[0].entities[0].canonicalName, "Antoine Semenyo");
});

test("does not reuse an ambiguous alias", () => {
  const ambiguous = [...existing,
    { id: "one", type: "PLAYER" as const, canonicalName: "First", aliases: ["Alex"], externalFplId: null },
    { id: "two", type: "PLAYER" as const, canonicalName: "Second", aliases: ["Alex"], externalFplId: null }];
  const result = resolveCanonicalEntitiesForPersistence(insight([{ type: "PLAYER", canonicalName: "Alex", aliases: [], role: "SUBJECT" }]), { players: [], teams: [] }, ambiguous);
  assert.equal(result.insights[0].entities[0].canonicalName, "Alex");
});
