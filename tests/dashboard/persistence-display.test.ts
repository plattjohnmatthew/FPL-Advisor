import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { setsDiffer } from "../../lib/dashboard/data";

test("matching stored synthesis episode set is reusable and order independent", () => {
  assert.equal(setsDiffer(["episode-a", "episode-b"], ["episode-b", "episode-a"]), false);
});

test("new or removed eligible content marks a stored synthesis stale", () => {
  assert.equal(setsDiffer(["episode-a", "episode-b"], ["episode-a"]), true);
  assert.equal(setsDiffer(["episode-a"], ["episode-a", "episode-b"]), true);
});

test("dashboard load is read-only and synthesis remains an explicit user action", () => {
  const dataSource = readFileSync("lib/dashboard/data.ts", "utf8");
  const dashboard = readFileSync("app/dashboard.tsx", "utf8");
  assert.doesNotMatch(dataSource, /createSynthesisService|OpenAI|\/api\/syntheses/);
  assert.match(dashboard, /No synthesis has been generated for this period/);
  const workspace = readFileSync("app/intelligence/briefing-workspace.tsx", "utf8");
  assert.doesNotMatch(dashboard, /fetch\("\/api\/syntheses"/);
  assert.match(workspace, /Generate briefing/);
  assert.match(workspace, /method: "POST"/);
  assert.doesNotMatch(dashboard.slice(dashboard.indexOf('<div className="run-report">')), /currentRunStatus === "PARTIAL"/);
  assert.match(dashboard, /synthesisExcludedEpisodes\.length > 0/);
  assert.match(dashboard, /Derived-analysis warning/);
  assert.match(dashboard, /synthesisFromDate/);
  assert.match(dashboard, /View briefings in Intelligence/);
  assert.match(workspace, /NO_ELIGIBLE_CONTENT/);
});

test("retry UI tracks unresolved episodes independently of the latest run", () => {
  const dataSource = readFileSync("lib/dashboard/data.ts", "utf8");
  const dashboard = readFileSync("app/dashboard.tsx", "utf8");
  assert.match(dataSource, /latest_episode_processing_attempts/);
  assert.match(dataSource, /retryableEpisodes/);
  const workspace = readFileSync("components/processing-workspace.tsx", "utf8");
  const presentation = readFileSync("lib/processing/presentation.ts", "utf8");
  assert.match(presentation, /snapshot\.retryableEpisodes/);
  assert.match(workspace, /Starting retry/);
  assert.match(dashboard, /currentRunStatus: "RUNNING", runType: "MANUAL_EPISODE"/);
  assert.match(dashboard, /busy=\{episodeActionId !== null \|\| runIsActive\}/);
});

test("root layout tolerates browser-extension attributes without hiding app hydration errors", () => {
  const layout = readFileSync("app/layout.tsx", "utf8");
  assert.match(layout, /<html lang="en" suppressHydrationWarning(?: [^>]*)?>/);
  assert.doesNotMatch(layout, /<body[^>]*suppressHydrationWarning/);
});


test("date browsing uses a database publication window and a separate synthesis action", () => {
  const data = readFileSync("lib/dashboard/data.ts", "utf8");
  const ui = readFileSync("app/dashboard.tsx", "utf8");
  assert.match(data, /gte\("published_at", period.startInclusive\)\.lt\("published_at", period.endExclusive\)/);
  assert.doesNotMatch(data, /if \(transcriptCount === 0 \|\| insightCount === 0\) return/);
  assert.equal((ui.match(/onClick=\{\(\) => synthesize/g) ?? []).length, 0);
  const apply = ui.slice(ui.indexOf("async function applyPeriod"), ui.indexOf("async function refreshSnapshot"));
  assert.match(apply, /refreshSnapshot\(\{ fromDate, toDate \}\)/);
  assert.doesNotMatch(apply, /synthesize|OpenAI|transcriptProvider/);
  assert.doesNotMatch(ui, /fetch\("\/api\/syntheses"/);
  assert.match(ui, /href=\{episodeHref\}/);
  assert.match(ui, /No synthesis has been generated for this period yet/);
});

test("dismissal hides latest failed attempts without deleting corpus or history", () => {
  const controls = readFileSync("lib/processing/episode-control.ts", "utf8");
  const data = readFileSync("lib/dashboard/data.ts", "utf8");
  assert.match(controls, /update\(\{ failure_dismissed_at:/);
  assert.doesNotMatch(controls, /\.delete\(/);
  assert.match(data, /is\("failure_dismissed_at", null\)/);
  assert.match(data, /in\("status", \["FAILED", "CANCELLED"\]\)/);
});
