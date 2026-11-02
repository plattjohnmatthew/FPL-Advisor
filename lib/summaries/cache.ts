import { createHash } from "node:crypto";
import { RunSummarySchema, type RunSummaryContext } from "./schema";

export const SYNTHESIS_PIPELINE_VERSION = "structured-hierarchical-v1";
export type SynthesisIdentity = { model: string; promptVersion: string; reductionModel: string; reductionPromptVersion: string; pipelineVersion: string; configuration: unknown };
export type SynthesisCacheMetadata = { fingerprint: string; identity: SynthesisIdentity; sourceIds: string[]; bounds: { startInclusive: string; endExclusive: string } | null };
// Database result order must not invalidate the same immutable evidence set.
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
export function synthesisCacheMetadata(context: RunSummaryContext, identity: SynthesisIdentity, bounds: SynthesisCacheMetadata["bounds"]): SynthesisCacheMetadata {
  return { fingerprint: createHash("sha256").update(JSON.stringify(canonical({ context, identity, bounds }))).digest("hex"), identity, bounds,
    sourceIds: [...new Set(context.insights.filter((item) => context.includedEpisodeIds.includes(item.episodeId)).map((item) => item.sourceId))].sort() };
}

export function validStoredSynthesis(data: unknown, includedIds: string[], context: RunSummaryContext, metadata: SynthesisCacheMetadata) {
  const parsed = RunSummarySchema.safeParse(data);
  if (!parsed.success || (data as { _synthesis?: { fingerprint?: string } })._synthesis?.fingerprint !== metadata.fingerprint) return false;
  if (JSON.stringify([...includedIds].sort()) !== JSON.stringify([...context.includedEpisodeIds].sort())) return false;
  const allowed = new Set(context.insights.map((item) => item.id));
  const cited = [...parsed.data.overviewSupportingInsightIds, ...Object.values(parsed.data.sections).flatMap((items) => items.flatMap((item) => item.supportingInsightIds))];
  const splits = new Set(context.splitDecisions.map((item) => item.id));
  return cited.every((id) => allowed.has(id)) && parsed.data.splitDecisionIds.every((id) => splits.has(id));
}
