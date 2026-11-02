import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveCitations, creatorBreadth, answerSections, followUpQuestions, scopeDescription } from "../../lib/research/presentation";
import type { ResearchResponse, ResearchSource } from "../../lib/research/schema";

const source: ResearchSource = { evidenceIds: ["insight:abc-123"], episodeId: "episode-1", episodeTitle: "Captaincy", sourceName: "Creator", sourceUrl: "https://example.com", publishedAt: "2026-11-01", timestampSeconds: null };
test("creator breadth counts identities across episodes and omits unprovable legacy counts", () => {
  assert.equal(creatorBreadth(["insight:abc-123", "insight:other"], [{ ...source, sourceId: "creator-1" }, { ...source, episodeId: "episode-2", sourceId: "creator-1", evidenceIds: ["insight:other"] }]), 1);
  assert.equal(creatorBreadth(source.evidenceIds, [source]), null);
});
test("citations resolve only canonical IDs from real source records and deduplicate", () => {
  const result = resolveCitations(["insight:abc-123", "insight:invented", "insight:abc-123"], [source]);
  assert.equal(result.length, 1);
  assert.equal(result[0].href, "/episodes/episode-1#insight-abc-123");
  assert.deepEqual(resolveCitations(["unknown"], [{ ...source, evidenceIds: ["unknown"] }]), []);
});
test("disagreement stays separate and empty sections disappear", () => {
  const finding = { type: "DISAGREEMENT" as const, statement: "Views differ", explanation: "Different reasoning", evidenceIds: source.evidenceIds };
  const response = { answer: { findings: [finding] } } as ResearchResponse;
  assert.deepEqual(answerSections(response).map((item) => item.title), ["Disagreement"]);
  assert.deepEqual(answerSections({ answer: { findings: [] } } as unknown as ResearchResponse), []);
});
test("followups retain question context and weak retrieval offers evidence exploration", () => {
  assert.match(followUpQuestions("Saka or Haaland?", false)[0], /disagree.*Saka or Haaland/);
  assert.match(followUpQuestions("Arsenal?", true)[0], /stored creator evidence.*Arsenal/);
  assert.ok(followUpQuestions("x".repeat(1000), false).every((value) => value.length <= 1000));
});
test("answer scope shows exact resolved boundaries including exclusive end", () => {
  assert.equal(scopeDescription({ preset: "CUSTOM", label: "Custom", dateFrom: "2026-10-01", dateTo: "2026-10-08" }), "Custom · 2026-10-01 → 2026-10-08 (exclusive)");
  assert.match(scopeDescription({ preset: "ALL_HISTORY", label: "All history", dateFrom: null, dateTo: null }), /earliest stored evidence/);
});
