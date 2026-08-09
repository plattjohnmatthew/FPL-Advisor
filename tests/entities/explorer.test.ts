import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { matchEntities } from "../../lib/entities/search";
import { resolveEntityRange } from "../../lib/entities/scope";

const entities = [
  { id: "saka", type: "PLAYER" as const, canonicalName: "Bukayo Saka", aliases: ["Saka"], externalFplId: 1 },
  { id: "arsenal", type: "TEAM" as const, canonicalName: "Arsenal", aliases: ["The Gunners"], externalFplId: 2 },
  { id: "watkins", type: "PLAYER" as const, canonicalName: "Ollie Watkins", aliases: ["Watkins"], externalFplId: 3 },
];

test("player search finds canonical players and exact canonical matches rank first", () => {
  assert.equal(matchEntities(entities, "Bukayo Saka")[0].id, "saka");
});
test("alias search returns the canonical player without creating an entity", () => {
  assert.equal(matchEntities(entities, "Saka")[0].canonicalName, "Bukayo Saka");
});
test("team canonical and alias search work", () => {
  assert.equal(matchEntities(entities, "Arsenal")[0].type, "TEAM");
  assert.equal(matchEntities(entities, "Gunners")[0].id, "arsenal");
});
test("short or missing searches do not load results", () => assert.deepEqual(matchEntities(entities, "s"), []));

test("Last 7 days uses inclusive publication dates and URL persistence", () => {
  const scope = resolveEntityRange({ range: "7d" }, new Date("2026-08-09T12:00:00Z"));
  assert.equal(scope.fromDate, "2026-08-03"); assert.equal(scope.toDate, "2026-08-09"); assert.equal(scope.query, "?range=7d");
});
test("missing range defaults to Last 30 days", () => {
  const scope = resolveEntityRange({}, new Date("2026-08-09T12:00:00Z"));
  assert.equal(scope.preset, "30d"); assert.equal(scope.fromDate, "2026-07-11");
});
test("All history has no database date boundaries", () => {
  const scope = resolveEntityRange({ range: "all" }); assert.equal(scope.dateFrom, null); assert.equal(scope.dateTo, null);
});
test("custom range is bookmarkable and uses an exclusive end boundary", () => {
  const scope = resolveEntityRange({ range: "custom", from: "2026-08-01", to: "2026-08-09" });
  assert.equal(scope.query, "?range=custom&from=2026-08-01&to=2026-08-09"); assert.equal(scope.dateTo, "2026-08-10T00:00:00.000Z");
});
test("This season uses explicit configuration", () => {
  const oldStart = process.env.FPL_SEASON_START_DATE; const oldEnd = process.env.FPL_SEASON_END_DATE;
  process.env.FPL_SEASON_START_DATE = "2026-08-01"; process.env.FPL_SEASON_END_DATE = "2027-05-31";
  try { const scope = resolveEntityRange({ range: "season" }); assert.equal(scope.fromDate, "2026-08-01"); assert.equal(scope.toDate, "2027-05-31"); }
  finally { if (oldStart === undefined) delete process.env.FPL_SEASON_START_DATE; else process.env.FPL_SEASON_START_DATE = oldStart; if (oldEnd === undefined) delete process.env.FPL_SEASON_END_DATE; else process.env.FPL_SEASON_END_DATE = oldEnd; }
});
test("invalid custom ranges fail clearly without deleting history", () => assert.throws(() => resolveEntityRange({ range: "custom", from: "2026-09-01", to: "2026-08-01" }), /valid custom/));

test("entity retrieval is database-scoped by relation and episode publication date", async () => {
  const source = await readFile("lib/entities/repository.ts", "utf8");
  assert.match(source, /\.eq\("entity_id", entityId\)/); assert.match(source, /insights\.episodes\.published_at/); assert.doesNotMatch(source, /insight\.created_at|fetched_at/);
});
test("player/team pages are read-only, preserve episode links, timestamps, splits, and honest empty state", async () => {
  const source = await readFile("app/entities/[entityId]/page.tsx", "utf8");
  assert.doesNotMatch(source, /OpenAI|responses\.parse|extract\(/); assert.match(source, /Creator splits/); assert.match(source, /\/episodes\/\$\{insight\.episodeId\}/); assert.match(source, /buildYouTubeTimestampUrl/); assert.match(source, /No stored insights about/); assert.doesNotMatch(source, /demo|fake/i);
});
