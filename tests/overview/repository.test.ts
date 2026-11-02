import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseOverviewRepository } from "../../lib/overview/repository";

test("latest content pages past incomplete attempts, returns only five successes, and never writes", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL; const originalKey = process.env.SUPABASE_SECRET_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://overview-test.supabase.co"; process.env.SUPABASE_SECRET_KEY = "sb_secret_test";
  const methods: string[] = []; let pages = 0; let noSelection = false;
  const row = (index: number) => ({ id: `episode-${index}`, title: `Episode ${index}`, published_at: index <= 20 ? "2026-10-30T12:00:00Z" : "2026-10-29T12:00:00Z", sources: { name: "Creator", platform: "YOUTUBE" }, transcripts: [{ id: "transcript" }], insights: [{ id: `insight-${index}`, claim: "An actual stored claim", extraction_index: 0 }] });
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); methods.push(request.method); const url = new URL(request.url);
    if (noSelection) { assert.match(url.pathname, /fpl_selected_entry$/); return Response.json([]); }
    if (url.pathname.endsWith("/episodes")) {
      pages++;
      assert.match(url.searchParams.get("select") ?? "", /transcripts!inner.*insights!inner/);
      assert.match(url.searchParams.get("order") ?? "", /published_at.desc/);
      return Response.json((pages === 1 ? Array.from({ length: 20 }, (_, index) => index + 1) : [21, 22, 23, 24, 25, 26, 27]).map(row));
    }
    assert.match(url.pathname, /latest_episode_processing_attempts$/);
    return Response.json(pages === 1 ? Array.from({ length: 20 }, (_, index) => ({ episode_id: `episode-${index + 1}`, status: ["FAILED", "PAUSED", "CANCELLED", "EXTRACTING"][index % 4] })) : [21, 23, 24, 25, 26, 27].map((index) => ({ episode_id: `episode-${index}`, status: index === 23 ? "FAILED" : "COMPLETED" })));
  }) as typeof fetch;
  try {
    const repository = new SupabaseOverviewRepository(); const items = await repository.latestEpisodes();
    assert.equal(pages, 2);
    assert.deepEqual(items.map((item) => item.id), ["episode-21", "episode-22", "episode-24", "episode-25", "episode-26"]);
    assert.ok(items.every((item) => item.claimExcerpt === "An actual stored claim"));
    noSelection = true; assert.deepEqual(await repository.squadEntityIds(), []);
    assert.ok(methods.every((method) => method === "GET"), "No squad initialization, reconciliation or persistence is permitted");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_SECRET_KEY; else process.env.SUPABASE_SECRET_KEY = originalKey;
  }
});
