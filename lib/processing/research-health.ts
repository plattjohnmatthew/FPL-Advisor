import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export type ResearchHealth = { attentionCount: number; updatedAt: string | null };
export async function getResearchHealth(): Promise<ResearchHealth> {
  const db = createSupabaseServerClient();
  const [failures, latest] = await Promise.all([
    db.from("latest_episode_processing_attempts").select("episode_id", { count: "exact", head: true }).in("status", ["FAILED", "CANCELLED"]).is("failure_dismissed_at", null),
    db.from("insights").select("created_at").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (failures.error || latest.error) throw new Error("Research health is temporarily unavailable.");
  return { attentionCount: failures.count ?? 0, updatedAt: latest.data?.created_at as string | null ?? null };
}
