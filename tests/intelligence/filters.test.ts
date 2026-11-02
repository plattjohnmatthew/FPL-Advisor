import assert from "node:assert/strict";
import test from "node:test";
import { escapeLike, FEED_PAGE_SIZE, feedQuery, intelligenceReturnUrl, parseFeedFilters } from "../../lib/intelligence/filters";
import { collectDatabasePages } from "../../lib/supabase/pagination";

test("feed URL round-trips independent metadata filters and pagination", () => {
  const filters = parseFeedFilters({ q: "  Team news ", from: "2026-10-01", to: "2026-10-31", creator: "11111111-1111-4111-8111-111111111111", category: "CAPTAINCY", type: "YOUTUBE", page: "3", tz: "-60" });
  assert.equal(FEED_PAGE_SIZE, 20);
  assert.equal(filters.q, "Team news");
  assert.deepEqual(parseFeedFilters(Object.fromEntries(new URLSearchParams(feedQuery(filters)))), filters);
  assert.equal(parseFeedFilters({ creator: filters.creator }).from, "");
  assert.equal(parseFeedFilters({ from: "2026-10-01" }).to, "");
  assert.equal(parseFeedFilters({ to: "2026-10-31" }).from, "");
});

test("invalid calendar dates, metadata, timezone and pages are rejected", () => {
  for (const invalid of [{ from: "2026-02-30" }, { from: "2026-11-03", to: "2026-11-01" }, { page: "0" }, { page: "1.5" }, { page: "Infinity" }, { tz: "NaN" }, { tz: "9999" }, { creator: "bad-id" }, { category: "INVENTED" }, { type: "TIKTOK" }]) assert.throws(() => parseFeedFilters(invalid));
});

test("feed search treats wildcard characters literally and caps metadata queries", () => {
  assert.equal(escapeLike("50%_off\\value"), "50\\%\\_off\\\\value");
  assert.equal(parseFeedFilters({ q: "a".repeat(500) }).q.length, 200);
  assert.equal(feedQuery(parseFeedFilters({})), "");
});

test("episode return URLs retain feed filters but never accept external routes", () => {
  assert.equal(intelligenceReturnUrl("/intelligence?q=Saka&page=2&category=CAPTAINCY"), "/intelligence?q=Saka&category=CAPTAINCY&page=2");
  for (const value of ["https://example.com", "//example.com", "javascript:alert(1)", "/sources", "/intelligence-other", "/intelligence?page=-1"]) assert.equal(intelligenceReturnUrl(value), null);
});

test("server synthesis paging retains more than the hosted 1000-row cap", async () => {
  const source = Array.from({ length: 1201 }, (_, index) => index);
  const requests: [number, number][] = [];
  const rows = await collectDatabasePages(async (from, to) => { requests.push([from, to]); return { data: source.slice(from, to + 1), error: null }; }, "Read failed");
  assert.deepEqual(rows, source);
  assert.deepEqual(requests, [[0, 499], [500, 999], [1000, 1499]]);
  await assert.rejects(() => collectDatabasePages(async () => ({ data: null, error: { message: "Unavailable" } }), "Read failed"), /Read failed: Unavailable/);
});
