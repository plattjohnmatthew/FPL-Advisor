import assert from "node:assert/strict";
import test from "node:test";
import { evidenceFingerprint, normalizeResearchQuestion, questionSimilarity, queryFingerprint } from "../../lib/research/analysis-cache";
import type { ResearchQueryPlan, RetrievedInsight } from "../../lib/research/schema";

const plan: ResearchQueryPlan = { playerEntities: ["Saka"], teamEntities: [], categories: ["TRANSFER_DECISION"], creators: [], dateFrom: null, dateTo: null, gameweeks: [], searchTerms: ["sell"], maxResults: 40, chronologicalComparison: false, currentDecision: true, splitFocus: false, includeTranscriptEvidence: false };
const insight = { id: "10000000-0000-4000-8000-000000000001" } as RetrievedInsight;
test("question normalization and similarity are deterministic", () => { assert.equal(normalizeResearchQuestion("  Sell SAKA?! "), "sell saka"); assert.ok(questionSimilarity("Should I sell Saka?", "Should I sell Saka now") > 0.72); assert.ok(questionSimilarity("Should I sell Saka?", "Who should captain Haaland?") < 0.72); });
test("query fingerprints ignore ordering but retain decision intent", () => { assert.equal(queryFingerprint(plan), queryFingerprint({ ...plan, playerEntities: [...plan.playerEntities].reverse() })); assert.notEqual(queryFingerprint(plan), queryFingerprint({ ...plan, currentDecision: false })); });
test("evidence fingerprints change when relevant evidence changes", () => { const first = evidenceFingerprint([insight], []); assert.equal(first, evidenceFingerprint([insight], [])); assert.notEqual(first, evidenceFingerprint([insight, { ...insight, id: "10000000-0000-4000-8000-000000000002" }], [])); });
