import { loadEnvConfig } from "@next/env";
import { createSupabaseServerClient } from "../lib/supabase/server";

function dateArgument(name: string, fallback: string) {
  const index = process.argv.indexOf(name); const value = index >= 0 ? process.argv[index + 1] : fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? "")) throw new Error(`${name} must use YYYY-MM-DD.`);
  return value;
}

async function main() {
  loadEnvConfig(process.cwd());
  const today = new Date().toISOString().slice(0, 10);
  const from = dateArgument("--from", today); const to = dateArgument("--to", from);
  if (from > to) throw new Error("--from must not be after --to.");
  const end = new Date(`${to}T00:00:00.000Z`); end.setUTCDate(end.getUTCDate() + 1);
  const { data, error } = await createSupabaseServerClient().from("transcript_provider_calls")
    .select("provider,provider_role,fallback_provider,fallback_reason,fallback_subsequently_used,episode_id,success,retry_attempt_count,http_request_count,billable_request_count,ai_fallback_used,transcript_existed_before_call")
    .gte("started_at", `${from}T00:00:00.000Z`).lt("started_at", end.toISOString());
  if (error) throw new Error(`Unable to load transcript usage: ${error.message}`);
  const rows = data ?? []; const unique = new Set(rows.map((row) => row.episode_id));
  const duplicateCalls = rows.length - unique.size;
  const providers = Object.entries(Object.groupBy(rows, (row) => row.provider)).map(([provider, items]) => ({ provider, calls: items?.length ?? 0 }));
  console.log(JSON.stringify({
    period: { from, to }, totalProviderCalls: rows.length, uniqueVideosRequested: unique.size,
    successfulCalls: rows.filter((row) => row.success).length, failedCalls: rows.filter((row) => !row.success).length,
    retryHttpRequests: rows.reduce((sum, row) => sum + Number(row.retry_attempt_count), 0),
    totalHttpRequests: rows.reduce((sum, row) => sum + Number(row.http_request_count), 0),
    duplicateOrRedundantCalls: duplicateCalls + rows.filter((row) => row.transcript_existed_before_call).length,
    aiFallbackCalls: rows.filter((row) => row.ai_fallback_used === true).length,
    successfulLocalFallbacks: rows.filter((row) => row.provider === "youtube_local" && row.provider_role === "FALLBACK" && row.success).length,
    supadataCallsAvoided: rows.filter((row) => row.provider === "youtube_local" && row.provider_role === "PRIMARY" && row.fallback_provider === "supadata" && row.success).length,
    fallbackReasons: Object.fromEntries([...new Set(rows.map((row) => row.fallback_reason).filter(Boolean))].map((reason) => [reason, rows.filter((row) => row.fallback_reason === reason).length])),
    byProvider: Object.fromEntries([...new Set(rows.map((row) => row.provider))].map((provider) => [provider, { calls: rows.filter((row) => row.provider === provider).length, successes: rows.filter((row) => row.provider === provider && row.success).length }])),
    knownBillableCredits: rows.reduce((sum, row) => sum + Number(row.billable_request_count ?? 0), 0), providers,
  }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
