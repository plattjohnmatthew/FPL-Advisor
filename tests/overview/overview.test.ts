import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { getOverviewData } from "../../lib/overview/data";
import { conciseExplanation, findingsFromBriefing, findingsFromInsights } from "../../lib/overview/presentation";
import type { OverviewRepository } from "../../lib/overview/repository";
import { DECISION_SHORTCUTS, OVERVIEW_PROMPTS, initialResearchQuestion, researchQuestionHref } from "../../lib/research/navigation";
import { insight, report } from "./fixtures";

test("saved briefing yields five citable findings, with claims based on real creator IDs", () => {
  const findings = findingsFromBriefing(report());
  assert.equal(findings.length, 5);
  assert.ok(findings.every((item) => item.creators.length === 1 && item.label === "Creator claim"));
  assert.ok(findings.every((item) => item.evidence.length && item.entities.length && item.latestEvidenceAt));
  assert.ok(findings.every((item) => !item.explanation.includes("third sentence")));
});

test("one creator across five episodes still counts once; two creators have greater breadth", () => {
  const repeated = Array.from({ length: 5 }, (_, index) => ({ ...insight(index + 1), primaryCategory: "CAPTAINCY", entities: insight(1).entities }));
  const findings = findingsFromInsights(repeated);
  assert.equal(findings.length, 1); assert.equal(findings[0].creators.length, 1);
  const second = { ...insight(6, "creator-2"), primaryCategory: "CAPTAINCY", entities: insight(1).entities };
  const broader = findingsFromInsights([...repeated, second]);
  assert.equal(broader[0].creators.length, 2);
  assert.doesNotMatch(broader[0].label, /consensus/i);
});

test("opposing creator claims are mixed views, never represented as agreement", () => {
  const first = insight(1); const second = { ...insight(2, "creator-2"), entities: first.entities, primaryCategory: first.primaryCategory, recommendation: "SELL" };
  const finding = findingsFromInsights([first, second])[0];
  assert.equal(finding.creators.length, 2); assert.equal(finding.label, "Mixed creator views");
  assert.match(finding.breadthLabel, /discussing this topic/);
});

test("ownership adds a marker without boosting ranking or evidence strength", () => {
  const insights = Array.from({ length: 6 }, (_, index) => insight(index + 1));
  const plain = findingsFromInsights(insights); const owned = findingsFromInsights(insights, ["player-1", "player-2", "player-3", "player-4", "player-5", "player-6"]);
  assert.deepEqual(owned.map((item) => item.id), plain.map((item) => item.id));
  assert.deepEqual(owned.map((item) => item.creators), plain.map((item) => item.creators));
  assert.ok(owned.every((item) => item.inYourTeam)); assert.ok(plain.every((item) => !item.inYourTeam));
});

test("missing and wholly historical synthesis evidence cannot become current findings", () => {
  const saved = report(); saved.episodeIds = [];
  assert.deepEqual(findingsFromBriefing(saved), []);
  saved.insights = []; assert.deepEqual(findingsFromBriefing(saved), []);
  assert.deepEqual(findingsFromInsights([]), []);
  assert.equal(conciseExplanation("One. Two. Three."), "One. Two.");
  assert.ok(conciseExplanation("Long ".repeat(150)).length <= 420);
});

function repository(overrides: Partial<OverviewRepository> = {}): OverviewRepository {
  return { briefing: async () => report(), insights: async () => { throw new Error("Fallback should not be loaded"); }, latestEpisodes: async () => [], squadEntityIds: async () => ["player-1"], updatedAt: async () => "2026-11-02T12:00:00Z", ...overrides };
}
test("Overview uses persisted briefing without generating or loading unnecessary fallback data", async () => {
  const data = await getOverviewData(new Date("2026-11-02T12:00:00Z"), repository());
  assert.equal(data.mode, "briefing"); assert.equal(data.findings.length, 5);
  assert.equal(data.period.fromDate, "2026-10-27"); assert.equal(data.period.toDate, "2026-11-02");
});

test("absent briefing exposes stored claims, while truly empty data stays empty", async () => {
  const claims = await getOverviewData(new Date("2026-11-02"), repository({ briefing: async () => null, insights: async () => [insight()] }));
  assert.equal(claims.mode, "claims"); assert.equal(claims.briefingGeneratedAt, null);
  const empty = await getOverviewData(new Date("2026-11-02"), repository({ briefing: async () => null, insights: async () => [] }));
  assert.equal(empty.mode, "empty"); assert.deepEqual(empty.findings, []);
});

test("optional data failures preserve the question and research surface", async () => {
  const data = await getOverviewData(new Date("2026-11-02"), repository({ briefing: async () => { throw new Error("Unavailable"); }, insights: async () => [insight()], squadEntityIds: async () => { throw new Error("No squad"); }, latestEpisodes: async () => { throw new Error("Unavailable"); } }));
  assert.equal(data.mode, "claims"); assert.equal(data.briefingUnavailable, true); assert.equal(data.latestUnavailable, true); assert.equal(data.findings[0].inYourTeam, false);
});

test("shortcut and suggested-question URLs carry a reviewable Ask question", () => {
  assert.deepEqual(DECISION_SHORTCUTS.map((item) => item.label), ["Captaincy", "Transfers", "My Squad", "Players to Watch"]);
  for (const shortcut of DECISION_SHORTCUTS) assert.ok(shortcut.href === "/squad" || new URL(shortcut.href, "https://local.test").searchParams.get("q"));
  for (const prompt of OVERVIEW_PROMPTS) assert.equal(new URL(researchQuestionHref(prompt), "https://local.test").searchParams.get("q"), prompt);
  assert.equal(initialResearchQuestion(["  Captaincy? ", "ignored"]), "Captaincy?");
  assert.equal(initialResearchQuestion("x".repeat(1100)).length, 1000);
  assert.equal(initialResearchQuestion(undefined), "");
});

test("Overview page and reader contain no generation, processing, refresh or reconciliation calls", () => {
  const source = ["app/page.tsx", "components/overview.tsx", "lib/overview/data.ts", "lib/overview/repository.ts"].map((path) => readFileSync(path, "utf8")).join("\n");
  assert.doesNotMatch(source, /\.insert\(|\.update\(|\.upsert\(|\.rpc\(|\/api\/research-query|createSynthesisService|\.generate\(|ensureSquadEntityMappings|startProcessingRun|OfficialFpl/);
  assert.match(readFileSync("app/dashboard.tsx", "utf8"), /useState\(initialQuestion\)/);
});

test("rendered Overview has useful and honest empty states, accessible navigation and no duplicate chat engine", () => {
  // Render the view in the normal React runtime; the application test runner uses react-server conditions.
  const code = `const {createElement}=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {Overview}=require('./components/overview.tsx');const {viewData}=require('./tests/overview/fixtures.ts');console.log(JSON.stringify({useful:renderToStaticMarkup(createElement(Overview,{data:viewData()})),empty:renderToStaticMarkup(createElement(Overview,{data:viewData(true)})),noCitations:renderToStaticMarkup(createElement(Overview,{data:{...viewData(true),briefingGeneratedAt:'2026-11-02T12:00:00Z'}}))}));`;
  const output = execFileSync(process.execPath, ["--import", "tsx", "-e", code], { cwd: process.cwd(), encoding: "utf8" });
  const { useful, empty, noCitations } = JSON.parse(output) as { useful: string; empty: string; noCitations: string };
  assert.match(useful, /Your FPL briefing/); assert.match(useful, /What you need to know/);
  assert.equal((useful.match(/data-testid="overview-finding"/g) ?? []).length, 5);
  assert.equal((useful.match(/data-testid="overview-latest-episode"/g) ?? []).length, 5);
  assert.match(useful, /In your team/); assert.match(useful, /form action="\/ask"/);
  assert.match(useful, /Who should I captain this gameweek\?/); assert.doesNotMatch(useful, /next deadline|Gameweek \d|Process content|Retry/);
  assert.match(empty, /No briefing has been generated for the current period yet\./);
  assert.match(empty, /Explore Intelligence/); assert.match(empty, /No processed creator content yet/);
  assert.doesNotMatch(empty, /data-testid="overview-finding"/);
  assert.match(noCitations, /No citable findings are available for the current period\./);
});


test("overlapping stored briefing retains actual scope and summary even with no section findings", async () => {
  const stored = report(); stored.from = "2026-11-01";
  stored.summary.sections.playersToBuy = [];
  const data = await getOverviewData(new Date("2026-11-02T12:00Z"), repository({ briefing: async () => stored }));
  assert.equal(data.mode, "briefing"); assert.equal(data.briefing?.from, "2026-11-01");
  assert.deepEqual(data.briefing?.overview, stored.summary.overviewParagraphs);
  assert.equal(data.findings.length, 0);
});
