import assert from "node:assert/strict";
import test from "node:test";
import type { ResearchQueryPlan } from "../../lib/research/schema";
import { resolveResearchScope } from "../../lib/research/scope";

const plan: ResearchQueryPlan = { playerEntities: [], teamEntities: [], categories: [], creators: [], dateFrom: null, dateTo: null, gameweeks: [], searchTerms: [], maxResults: 40, chronologicalComparison: false, currentDecision: false, splitFocus: false, includeTranscriptEvidence: false };
const now = new Date("2026-08-08T12:00:00Z");

test("Last 7 and Last 30 days use bounded episode-publication windows", () => {
  assert.deepEqual(resolveResearchScope({ preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 }, plan, now), { preset: "LAST_7_DAYS", label: "Last 7 days", dateFrom: "2026-08-02T00:00:00.000Z", dateTo: "2026-08-09T00:00:00.000Z" });
  assert.equal(resolveResearchScope({ preset: "LAST_30_DAYS", timezoneOffsetMinutes: 0 }, plan, now).dateFrom, "2026-07-10T00:00:00.000Z");
});

test("Last 14 days is a bounded inclusive publication window", () => {
  const scope = resolveResearchScope({ preset: "LAST_14_DAYS", timezoneOffsetMinutes: 0 }, plan, new Date("2026-08-09T12:00:00Z"));
  assert.equal(scope.label, "Last 14 days"); assert.equal(scope.dateFrom, "2026-07-27T00:00:00.000Z"); assert.equal(scope.dateTo, "2026-08-10T00:00:00.000Z");
});

test("This week is Monday through Sunday across a week boundary", () => {
  const scope = resolveResearchScope({ preset: "THIS_WEEK", timezoneOffsetMinutes: 0 }, plan, new Date("2026-08-03T00:01:00Z"));
  assert.equal(scope.dateFrom, "2026-08-03T00:00:00.000Z"); assert.equal(scope.dateTo, "2026-08-10T00:00:00.000Z");
});

test("This season uses configured bounds", () => {
  const oldStart = process.env.FPL_SEASON_START_DATE; const oldEnd = process.env.FPL_SEASON_END_DATE;
  process.env.FPL_SEASON_START_DATE = "2026-08-01"; process.env.FPL_SEASON_END_DATE = "2027-05-31";
  try { const scope = resolveResearchScope({ preset: "THIS_SEASON", timezoneOffsetMinutes: 0 }, plan, now); assert.equal(scope.dateFrom, "2026-08-01T00:00:00.000Z"); assert.equal(scope.dateTo, "2027-06-01T00:00:00.000Z"); }
  finally { if (oldStart) process.env.FPL_SEASON_START_DATE = oldStart; else delete process.env.FPL_SEASON_START_DATE; if (oldEnd) process.env.FPL_SEASON_END_DATE = oldEnd; else delete process.env.FPL_SEASON_END_DATE; }
});

test("All history has no boundary while Custom is inclusive by local calendar dates", () => {
  assert.equal(resolveResearchScope({ preset: "ALL_HISTORY", timezoneOffsetMinutes: 0 }, plan, now).dateFrom, null);
  const custom = resolveResearchScope({ preset: "CUSTOM", fromDate: "2026-03-01", toDate: "2026-03-31", timezoneOffsetMinutes: 0 }, plan, now);
  assert.equal(custom.dateFrom, "2026-03-01T00:00:00.000Z"); assert.equal(custom.dateTo, "2026-04-01T00:00:00.000Z");
});

test("question-implied time narrows but never broadens selected UI scope", () => {
  const selected = resolveResearchScope({ preset: "LAST_30_DAYS", timezoneOffsetMinutes: 0 }, { ...plan, dateFrom: "2026-08-05T00:00:00Z", dateTo: "2026-08-07T00:00:00Z" }, now);
  assert.equal(selected.dateFrom, "2026-08-05T00:00:00.000Z"); assert.equal(selected.dateTo, "2026-08-07T00:00:00.000Z");
  const broadQuestion = resolveResearchScope({ preset: "LAST_7_DAYS", timezoneOffsetMinutes: 0 }, { ...plan, dateFrom: "2026-01-01T00:00:00Z", dateTo: "2027-01-01T00:00:00Z" }, now);
  assert.equal(broadQuestion.dateFrom, "2026-08-02T00:00:00.000Z"); assert.equal(broadQuestion.dateTo, "2026-08-09T00:00:00.000Z");
});
