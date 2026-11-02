import { getAppCapabilities } from "@/lib/app-config";
import "server-only";
import { createResearchDataClient as createSupabaseServerClient } from "@/lib/research-data";
import { getBriefingById } from "./briefing";
import { RunSummarySchema } from "@/lib/summaries/schema";
import type { OverviewPeriod } from "@/lib/overview/repository";

export const BRIEFING_PAGE_SIZE = 10;
export function briefingPage(value: unknown) {
  const page = Number(value ?? 1);
  return Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1;
}
export async function getBriefingHistory(page = 1) {
  const { data, error, count } = await createSupabaseServerClient().from("run_summaries")
    .select("id,scope_type,from_date,to_date,generated_at,included_episode_count,distinct_creator_count,synthesis_attempts!inner(status)", { count: "exact" })
    .eq("synthesis_attempts.status", "COMPLETED")
    .order("generated_at", { ascending: false }).order("id", { ascending: false })
    .range((page - 1) * BRIEFING_PAGE_SIZE, page * BRIEFING_PAGE_SIZE - 1);
  if (error) throw new Error(`Unable to load briefing history: ${error.message}`);
  return { items: data, total: count ?? 0, page, pageCount: Math.ceil((count ?? 0) / BRIEFING_PAGE_SIZE) };
}

// Exact period first. Otherwise show a recent overlapping report under its actual dates.
// Skip invalid payloads rather than hiding an older valid report behind a broken row.
export async function latestRelevantBriefing(period: OverviewPeriod) {
  const db = createSupabaseServerClient();
  for (const exact of getAppCapabilities().mode === "public_read_only" ? [null] : [true, false]) {
    for (let from = 0; ; from += BRIEFING_PAGE_SIZE) {
      let query = db.from("run_summaries").select("id,summary_data,synthesis_attempts!inner(status)")
        .eq("scope_type", "DATE_RANGE").eq("synthesis_attempts.status", "COMPLETED");
      query = exact === null ? query : exact ? query.eq("from_date", period.fromDate).eq("to_date", period.toDate)
        : query.lte("from_date", period.toDate).gte("to_date", period.fromDate);
      const { data, error } = await query.order("generated_at", { ascending: false }).order("id", { ascending: false }).range(from, from + BRIEFING_PAGE_SIZE - 1);
      if (error) throw new Error("Stored briefing is temporarily unavailable.");
      for (const row of data) {
        if (!RunSummarySchema.safeParse(row.summary_data).success) continue;
        const report = await getBriefingById(row.id as string, true);
        if (report) return report;
      }
      if (data.length < BRIEFING_PAGE_SIZE) break;
    }
  }
  return null;
}
