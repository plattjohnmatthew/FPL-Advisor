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
  assert.match(dashboard, /onClick=\{\(\) => synthesize/);
  assert.doesNotMatch(dashboard, /currentRunStatus === "PARTIAL"/);
  assert.match(dashboard, /synthesisExcludedEpisodes\.length > 0/);
  assert.match(dashboard, /Derived-analysis warning/);
  assert.match(dashboard, /synthesisFromDate/);
  assert.match(dashboard, /payload\.scope === "DATE_RANGE" \? payload/);
});
