import { z } from "zod";
import type { InsightExtraction } from "./schema";

const MAX_REPAIR_INSIGHTS = 25;
const MAX_CANDIDATES_PER_INSIGHT = 18;
const MAX_CANDIDATE_TEXT_LENGTH = 400;
const TIMESTAMP_NEIGHBOR_RADIUS = 2;

type SegmentLike = { startSeconds?: unknown; endSeconds?: unknown; text?: unknown };

export type OutOfRangeSegmentReference = {
  insightIndex: number;
  invalidIds: number[];
};

export type CitationRepairCandidate = {
  segmentId: number;
  startSeconds: number;
  endSeconds: number | null;
  text: string;
};

export type CitationRepairRequest = {
  insights: Array<{
    insightIndex: number;
    claim: string;
    evidenceText: string;
    currentEvidenceSegmentIds: number[];
    candidates: CitationRepairCandidate[];
  }>;
};

export const CitationRepairSchema = z.object({
  repairs: z.array(z.object({
    insightIndex: z.number().int().nonnegative(),
    evidenceSegmentIds: z.array(z.number().int().nonnegative()).min(1),
  })),
});

export type CitationRepair = z.infer<typeof CitationRepairSchema>;

export function findOutOfRangeSegmentReferences(extraction: InsightExtraction, segmentCount: number): OutOfRangeSegmentReference[] {
  if (segmentCount <= 0) return [];
  return extraction.insights.flatMap((insight, insightIndex) => {
    const invalidIds = [...new Set(insight.evidenceSegmentIds ?? [])].filter((id) => id >= segmentCount);
    return invalidIds.length > 0 ? [{ insightIndex, invalidIds }] : [];
  });
}

function words(value: string) {
  return new Set(value.toLocaleLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []);
}

function nearestSegmentIndex(segments: unknown[], timestamp: number) {
  let nearest: number | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;
  segments.forEach((value, index) => {
    const segment = value as SegmentLike;
    const start = Number(segment.startSeconds);
    if (!Number.isFinite(start)) return;
    const distance = Math.abs(start - timestamp);
    if (distance < nearestDistance) {
      nearest = index;
      nearestDistance = distance;
    }
  });
  return nearest;
}

function candidateFor(segments: unknown[], segmentId: number): CitationRepairCandidate | null {
  const segment = segments[segmentId] as SegmentLike | undefined;
  if (!segment) return null;
  const startSeconds = Number(segment.startSeconds);
  if (!Number.isFinite(startSeconds)) return null;
  const end = Number(segment.endSeconds);
  return {
    segmentId,
    startSeconds,
    endSeconds: Number.isFinite(end) ? end : null,
    text: String(segment.text ?? "").slice(0, MAX_CANDIDATE_TEXT_LENGTH),
  };
}

function candidatesForInsight(extraction: InsightExtraction, issue: OutOfRangeSegmentReference, segments: unknown[]) {
  const insight = extraction.insights[issue.insightIndex];
  const candidateIds = new Set<number>();

  for (const id of insight.evidenceSegmentIds ?? []) {
    if (id >= 0 && id < segments.length) candidateIds.add(id);
  }

  const possibleTimestamps = [...issue.invalidIds];
  if (insight.timestampSeconds != null) possibleTimestamps.push(insight.timestampSeconds);
  for (const timestamp of possibleTimestamps) {
    const nearest = nearestSegmentIndex(segments, timestamp);
    if (nearest == null) continue;
    for (let offset = -TIMESTAMP_NEIGHBOR_RADIUS; offset <= TIMESTAMP_NEIGHBOR_RADIUS; offset += 1) {
      const id = nearest + offset;
      if (id >= 0 && id < segments.length) candidateIds.add(id);
    }
  }

  const evidenceWords = words(`${insight.claim} ${insight.evidenceText}`);
  const textMatches = segments.map((value, segmentId) => {
    const segment = value as SegmentLike;
    const segmentWords = words(String(segment.text ?? ""));
    let score = 0;
    for (const word of segmentWords) if (evidenceWords.has(word)) score += 1;
    return { segmentId, score };
  }).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score || a.segmentId - b.segmentId);

  for (const { segmentId } of textMatches) {
    if (candidateIds.size >= MAX_CANDIDATES_PER_INSIGHT) break;
    candidateIds.add(segmentId);
  }

  return [...candidateIds]
    .slice(0, MAX_CANDIDATES_PER_INSIGHT)
    .map((id) => candidateFor(segments, id))
    .filter((candidate): candidate is CitationRepairCandidate => candidate !== null)
    .sort((a, b) => a.segmentId - b.segmentId);
}

export function buildCitationRepairRequest(extraction: InsightExtraction, segments: unknown[]): CitationRepairRequest {
  const issues = findOutOfRangeSegmentReferences(extraction, segments.length);
  if (issues.length === 0) throw new Error("Citation repair requested without an out-of-range segment reference.");
  if (issues.length > MAX_REPAIR_INSIGHTS) throw new Error(`Citation repair refused: ${issues.length} invalid insights exceeds the bounded limit of ${MAX_REPAIR_INSIGHTS}.`);

  return {
    insights: issues.map((issue) => {
      const insight = extraction.insights[issue.insightIndex];
      const candidates = candidatesForInsight(extraction, issue, segments);
      if (candidates.length === 0) throw new Error(`Citation repair found no safe candidate segments for insight=${issue.insightIndex}.`);
      return {
        insightIndex: issue.insightIndex,
        claim: insight.claim,
        evidenceText: insight.evidenceText,
        currentEvidenceSegmentIds: [...new Set(insight.evidenceSegmentIds ?? [])],
        candidates,
      };
    }),
  };
}

export function applyCitationRepairs(extraction: InsightExtraction, request: CitationRepairRequest, repair: CitationRepair): InsightExtraction {
  const expectedIndexes = new Set(request.insights.map((insight) => insight.insightIndex));
  const repairs = new Map<number, number[]>();

  for (const item of repair.repairs) {
    if (!expectedIndexes.has(item.insightIndex)) throw new Error(`Citation repair returned unexpected insightIndex=${item.insightIndex}.`);
    if (repairs.has(item.insightIndex)) throw new Error(`Citation repair returned duplicate insightIndex=${item.insightIndex}.`);
    const allowedIds = new Set(request.insights.find((insight) => insight.insightIndex === item.insightIndex)?.candidates.map((candidate) => candidate.segmentId));
    const uniqueIds = [...new Set(item.evidenceSegmentIds)];
    const invalidId = uniqueIds.find((id) => !allowedIds.has(id));
    if (invalidId !== undefined) throw new Error(`Citation repair returned non-candidate segment ID=${invalidId} for insight=${item.insightIndex}.`);
    repairs.set(item.insightIndex, uniqueIds);
  }

  const missingIndex = [...expectedIndexes].find((index) => !repairs.has(index));
  if (missingIndex !== undefined) throw new Error(`Citation repair omitted insightIndex=${missingIndex}.`);

  return {
    ...extraction,
    insights: extraction.insights.map((insight, insightIndex) => repairs.has(insightIndex)
      ? { ...insight, evidenceSegmentIds: repairs.get(insightIndex)! }
      : insight),
  };
}
