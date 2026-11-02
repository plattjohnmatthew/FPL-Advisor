import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { matchEntities } from "../../lib/entities/search";
import { SQUAD_RESEARCH_ACTIONS, researchQuestionHref } from "../../lib/research/navigation";

const player = { id: "saka", type: "PLAYER" as const, canonicalName: "Bukayo Saka", aliases: ["Starboy"], externalFplId: 7, fullName: "Bukayo Ayoyinka Saka", displayName: "Saka", club: "Arsenal" };
test("search matches full names, display names, aliases, clubs and exact short FPL IDs", () => {
  for (const query of ["Ayoyinka", "Saka", "Starboy", "Arsenal", "7"]) assert.equal(matchEntities([player], query)[0]?.id, "saka", query);
  assert.deepEqual(matchEntities([player], "71"), []);
});
test("all four squad actions prefill the shared Ask route with database-selected My Team context", () => {
  assert.equal(SQUAD_RESEARCH_ACTIONS.length, 4);
  for (const action of SQUAD_RESEARCH_ACTIONS) {
    const url = new URL(action.href, "https://example.com");
    assert.equal(url.pathname, "/ask"); assert.equal(url.searchParams.get("context"), "MY_TEAM");
    assert.equal(url.searchParams.get("scope"), "LAST_14_DAYS");
    assert.equal(url.searchParams.get("q"), action.question); assert.equal(url.searchParams.has("entryId"), false);
  }
});
test("player Ask navigation preserves custom research periods and encoded question", () => {
  const url = new URL(researchQuestionHref("What about Son & Saka?", { scope: "CUSTOM", from: "2026-10-01", to: "2026-10-14" }), "https://example.com");
  assert.equal(url.searchParams.get("q"), "What about Son & Saka?"); assert.equal(url.searchParams.get("from"), "2026-10-01"); assert.equal(url.searchParams.get("to"), "2026-10-14");
});
test("shared metadata hides missing price/statistics and distinguishes saved official observations", () => {
  const code = `const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {EntityMetadata}=require('./components/entity-research.tsx');console.log(JSON.stringify({missing:renderToStaticMarkup(React.createElement(EntityMetadata,{type:'PLAYER',metadata:{position:'MID',current_price:null}})),player:renderToStaticMarkup(React.createElement(EntityMetadata,{type:'PLAYER',metadata:{position:'MID',current_price:10.2,fpl_teams:{name:'Arsenal'}}})),team:renderToStaticMarkup(React.createElement(EntityMetadata,{type:'TEAM',metadata:{name:'Arsenal',short_name:'ARS'}}))}));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--import", "tsx", "-e", code], { encoding: "utf8" }));
  assert.doesNotMatch(result.missing, /NaN|£|points|form/i); assert.match(result.player, /£10.2m/);
  assert.match(result.player, /latest saved observation/); assert.match(result.team, /Arsenal/);
});
