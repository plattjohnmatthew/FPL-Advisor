import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { RunSummarySchema } from "../../lib/summaries/schema";

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const item = (subject: string, sentiment: "POSITIVE" | "MIXED" | "NEGATIVE" | "NEUTRAL", ids = [a, b]) => ({
  subject, sentiment, summary: `${subject} summary`, reasoning: "Grounded creator reasoning",
  sourceCount: ids.length, timeHorizon: "SHORT" as const, caveat: null,
  interpretation: ids.length > 1 ? "CONSENSUS" as const : "CREATOR_CLAIM" as const,
  supportingInsightIds: ids,
});

test("editorial schema distinguishes consensus, mixed sentiment, fixtures, chips, and value", () => {
  const report = RunSummarySchema.parse({
    title: "FPL Weekly Intelligence",
    overviewParagraphs: ["The major transfer theme.", "The strategic implication."],
    overviewSupportingInsightIds: [a, b],
    sections: {
      teamsToTarget: [item("Arsenal fixtures", "POSITIVE")], teamsToAvoid: [],
      playersToBuy: [item("Palmer", "POSITIVE")], playersToSell: [],
      mostDiscussedPlayers: [item("Saka", "MIXED")], fixtureSwings: [item("Fixture swing", "POSITIVE")],
      chipStrategy: [item("Wildcard timing", "MIXED")], undervaluedPlayers: [item("Value midfielder", "POSITIVE")],
      overpricedPlayers: [item("Poor-value premium", "NEGATIVE")], watchlist: [item("Returning player", "NEUTRAL", [a])],
    }, splitDecisionIds: [],
  });
  assert.equal(report.sections.playersToBuy[0].sentiment, "POSITIVE");
  assert.equal(report.sections.mostDiscussedPlayers[0].sentiment, "MIXED");
  assert.notEqual(report.sections.undervaluedPlayers[0].subject, report.sections.overpricedPlayers[0].subject);
});

test("normal database reset has no demo seed and report UI exposes neither atomic dump nor UUID labels", () => {
  const config = readFileSync("supabase/config.toml", "utf8");
  const dashboard = readFileSync("app/dashboard.tsx", "utf8");
  assert.match(config, /\[db\.seed\][\s\S]*?enabled = false/);
  assert.doesNotMatch(dashboard, /Insights from episodes published/);
  assert.doesNotMatch(dashboard, /Insight \{insight\.id\}/);
  assert.match(dashboard, /No synthesis has been generated for this period/);
});
