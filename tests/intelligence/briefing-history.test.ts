import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { briefingPage, getBriefingHistory, latestRelevantBriefing } from "@/lib/intelligence/briefing-history";
import { getBriefingById, getBriefing } from "@/lib/intelligence/briefing";
import { latestSevenLocalDates, localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";
import { report } from "../overview/fixtures";

const makeRow = (id: string, from = "2026-11-01", to = "2026-11-02") => {
  const summary = report().summary;
  summary.overviewSupportingInsightIds = ["10000000-0000-4000-8000-000000000001"]; summary.sections.playersToBuy = [];
  return { id, scope_type: "DATE_RANGE", from_date: from, to_date: to,
    generated_at: "2026-11-02T14:56:57Z", model: "saved-model", prompt_version: "saved-prompt", synthesis_mode: "DIRECT",
    summary_data: { ...summary, _synthesis: { sourceIds: ["creator-1"], bounds: localDateRangeToUtcBounds(from, to, -60) } },
    eligible_insight_count: 12, distinct_creator_count: 1, included_episode_count: 1, excluded_episodes: [],
    synthesis_episodes: [{ episode_id: "episode-1" }], synthesis_attempts: [{ status: "COMPLETED" }] };
};
async function mockDatabase(run: () => Promise<void>, respond: (url: URL) => Response) {
  const originalFetch = globalThis.fetch;
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; const oldKey = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://briefing-test.supabase.co"; process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    assert.equal(request.method, "GET", "browsing must never write or invoke generation");
    const url = new URL(request.url);
    assert.equal(url.hostname, "briefing-test.supabase.co", "no OpenAI or provider requests");
    if (url.pathname.endsWith("/insights")) return Response.json([]);
    assert.match(url.pathname, /run_summaries$/);
    assert.equal(url.searchParams.get("synthesis_attempts.status"), "eq.COMPLETED");
    return respond(url);
  }) as typeof fetch;
  try { await run(); } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = oldKey;
  }
}

test("history is newest first and paginated at the database, including completion filter", async () => {
  await mockDatabase(async () => {
    const history = await getBriefingHistory(2);
    assert.equal(history.items.length, 1); assert.equal(history.total, 21); assert.equal(history.pageCount, 3);
  }, (url) => {
    assert.equal(url.searchParams.get("offset"), "10"); assert.equal(url.searchParams.get("limit"), "10");
    assert.match(url.searchParams.get("order")!, /generated_at.desc,id.desc/);
    assert.doesNotMatch(url.searchParams.get("select")!, /summary_data/);
    return Response.json([makeRow("saved")], { headers: { "content-range": "10-10/21" } });
  });
  assert.equal(briefingPage("bad"), 1); assert.equal(briefingPage("-1"), 1); assert.equal(briefingPage("3"), 3);
});

test("Overview prefers newest valid exact period, bypassing malformed newest payload", async () => {
  await mockDatabase(async () => {
    const result = await latestRelevantBriefing(latestSevenLocalDates(new Date("2026-11-02T12:00Z"), 0));
    assert.equal(result?.id, "valid"); assert.equal(result?.from, "2026-10-27");
  }, (url) => {
    if (url.searchParams.has("id")) return Response.json(makeRow("valid", "2026-10-27"));
    assert.equal(url.searchParams.get("from_date"), "eq.2026-10-27");
    assert.equal(url.searchParams.get("to_date"), "eq.2026-11-02");
    assert.match(url.searchParams.get("order")!, /generated_at.desc/);
    return Response.json([{ ...makeRow("invalid"), summary_data: {} }, makeRow("valid", "2026-10-27")]);
  });
});

test("Overview fallback retrieves actual two-day scope rather than pretending it covers seven days", async () => {
  await mockDatabase(async () => {
    const result = await latestRelevantBriefing(latestSevenLocalDates(new Date("2026-11-02T12:00Z"), 0));
    assert.equal(result?.from, "2026-11-01"); assert.equal(result?.to, "2026-11-02");
  }, (url) => {
    if (url.searchParams.has("id")) return Response.json(makeRow("recent"));
    return Response.json(url.searchParams.get("from_date")?.startsWith("eq.") ? [] : [makeRow("recent")]);
  });
});

test("completed historical version reopens after a refresh using its ID with zero generation calls", async () => {
  await mockDatabase(async () => {
    const first = await getBriefingById("old-version");
    const reopened = await getBriefingById("old-version");
    assert.deepEqual(first, reopened); assert.equal(first?.includedInsightCount, 12);
    assert.equal(first?.bounds?.startInclusive, "2026-10-31T23:00:00.000Z");
  }, (url) => { assert.equal(url.searchParams.get("id"), "eq.old-version"); return Response.json(makeRow("old-version")); });
});

test("period lookup retains canonical local bounds and rejects a different timezone", async () => {
  await mockDatabase(async () => {
    assert.equal((await getBriefing("2026-11-01", "2026-11-02", undefined, -60))?.id, "stored");
    assert.equal(await getBriefing("2026-11-01", "2026-11-02", undefined, 0), null);
  }, (url) => Response.json(url.searchParams.has("id") ? makeRow("stored") : makeRow("stored")));
});

test("missing completed artifact cannot appear as a primary report", async () => {
  await mockDatabase(async () => {
    assert.equal(await getBriefingById("failed"), null);
    assert.equal(await latestRelevantBriefing(latestSevenLocalDates(new Date("2026-11-02"), 0)), null);
  }, (url) => Response.json(url.searchParams.has("id") ? null : []));
});

test("successful explicit generation invalidates Overview/history and refreshes client route data", () => {
  const api = readFileSync("app/api/syntheses/route.ts", "utf8");
  assert.match(api, /revalidatePath\("\/"\)/); assert.match(api, /revalidatePath\("\/intelligence\/briefings"\)/);
  assert.match(api, /await service.synthesizeDateRange[\s\S]*?invalidateBriefings\(\)/);
  assert.match(readFileSync("app/intelligence/briefing-workspace.tsx", "utf8"), /router.refresh\(\)/);
  for (const path of ["app/intelligence/briefings/page.tsx", "app/intelligence/briefings/[id]/page.tsx", "lib/intelligence/briefing-history.ts", "lib/intelligence/briefing.ts"]) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /createSynthesisService|startProcessingRun|client.responses|\.generate\(/);
  }
});
