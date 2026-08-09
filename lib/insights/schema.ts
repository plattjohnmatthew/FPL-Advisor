import { z } from "zod";

export const PRIMARY_CATEGORIES = ["TRANSFER_DECISION", "CAPTAINCY", "FIXTURES", "MINUTES_AVAILABILITY", "FORM_UNDERLYING", "VALUE_MARKET", "CHIPS_WILDCARD", "SQUAD_STRUCTURE", "ROLE_TEAM_CONTEXT"] as const;
export const RECOMMENDATIONS = ["BUY", "SELL", "HOLD", "AVOID", "WATCH", "CAPTAIN", "START", "BENCH", "NEUTRAL"] as const;
export const TIME_HORIZONS = ["IMMEDIATE", "SHORT", "MEDIUM", "SEASONAL"] as const;
export const CREATOR_CONFIDENCES = ["HIGH", "MEDIUM", "LOW"] as const;

export const InsightEntitySchema = z.object({
  type: z.enum(["PLAYER", "TEAM"]),
  canonicalName: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)),
  role: z.string().trim().min(1),
});

export const ExtractedInsightSchema = z.object({
  claim: z.string().trim().min(1),
  reasoning: z.string().trim().min(1),
  primaryCategory: z.enum(PRIMARY_CATEGORIES),
  recommendation: z.enum(RECOMMENDATIONS),
  timeHorizon: z.enum(TIME_HORIZONS),
  creatorConfidence: z.enum(CREATOR_CONFIDENCES),
  entities: z.array(InsightEntitySchema),
  tags: z.array(z.string().trim().min(1)),
  evidenceText: z.string().trim().min(1),
  timestampSeconds: z.number().int().nonnegative().nullable(),
  validFromGameweek: z.number().int().min(1).max(38).nullable(),
  validToGameweek: z.number().int().min(1).max(38).nullable(),
}).refine(
  (value) => value.validFromGameweek == null || value.validToGameweek == null || value.validFromGameweek <= value.validToGameweek,
  { message: "validFromGameweek must not exceed validToGameweek" },
);

export const InsightExtractionSchema = z.object({ insights: z.array(ExtractedInsightSchema) });
export type InsightExtraction = z.infer<typeof InsightExtractionSchema>;

export function normalizeInsightEntities(extraction: InsightExtraction): InsightExtraction {
  return {
    insights: extraction.insights.map((insight) => {
      const entities = new Map<string, typeof insight.entities[number]>();
      for (const entity of insight.entities) {
        const key = `${entity.type}\u0000${entity.canonicalName.toLocaleLowerCase()}\u0000${entity.role.toLocaleLowerCase()}`;
        const existing = entities.get(key);
        entities.set(key, existing ? {
          ...existing,
          aliases: [...new Set([...existing.aliases, ...entity.aliases].map((alias) => alias.trim()).filter(Boolean))],
        } : { ...entity, aliases: [...new Set(entity.aliases)] });
      }
      return { ...insight, tags: [...new Set(insight.tags)], entities: [...entities.values()] };
    }),
  };
}

function receivedType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

export function validateExtractionForPersistence(episodeId: string, value: unknown): InsightExtraction {
  const result = InsightExtractionSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    let received: unknown = value;
    for (const segment of issue.path) {
      const key = typeof segment === "symbol" ? String(segment) : segment;
      received = received != null && typeof received === "object" ? (received as Record<string | number, unknown>)[key] : undefined;
    }
    const insightIndex = issue.path[0] === "insights" && typeof issue.path[1] === "number" ? issue.path[1] : null;
    const field = issue.path.slice(insightIndex === null ? 0 : 2).join(".") || "extraction";
    throw new Error(`Extraction validation failed: episode=${episodeId}${insightIndex === null ? "" : ` insight=${insightIndex}`} field=${field} expected=${issue.message} received=${receivedType(received)}`);
  }
  return normalizeInsightEntities(result.data);
}
