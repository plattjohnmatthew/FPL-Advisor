import { localDateRangeToUtcBounds } from "@/lib/dates/calendar-window";
import { PRIMARY_CATEGORIES } from "@/lib/insights/schema";

export const FEED_PAGE_SIZE = 20;
export type FeedFilters = { q: string; from: string; to: string; creator: string; category: string; type: string; page: number; tz: number };
export type FeedSearch = Record<string, string | string[] | undefined>;
export function parseFeedFilters(search: FeedSearch): FeedFilters {
  const value = (key: string) => { const item = search[key]; return (Array.isArray(item) ? item[0] : item) ?? ""; };
  const from = value("from"); const to = value("to");
  const tz = value("tz") ? Number(value("tz")) : 0;
  if (!Number.isInteger(tz) || Math.abs(tz) > 840) throw new Error("Invalid timezone offset.");
  if (from) localDateRangeToUtcBounds(from, from, tz);
  if (to) localDateRangeToUtcBounds(to, to, tz);
  if (from && to && from > to) throw new Error("Date from must be on or before date to.");
  const creator = value("creator");
  if (creator && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creator)) throw new Error("Invalid creator filter.");
  const category = value("category");
  if (category && !PRIMARY_CATEGORIES.includes(category as typeof PRIMARY_CATEGORIES[number])) throw new Error("Invalid category filter.");
  const type = value("type");
  if (type && !["YOUTUBE", "PODCAST"].includes(type)) throw new Error("Invalid source type.");
  const page = Number(value("page") || 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new Error("Invalid page number.");
  return { q: value("q").trim().slice(0, 200), from, to, creator, category, type, page, tz };
}

export function feedQuery(filters: FeedFilters) {
  const params = new URLSearchParams();
  for (const key of ["q", "from", "to", "creator", "category", "type"] as const) if (filters[key]) params.set(key, filters[key]);
  if (filters.page > 1) params.set("page", String(filters.page));
  if (filters.tz) params.set("tz", String(filters.tz));
  return params.toString();
}
export function intelligenceReturnUrl(value: string) {
  if (!value.startsWith("/intelligence?") && value !== "/intelligence") return null;
  try { return `/intelligence${value.includes("?") ? `?${feedQuery(parseFeedFilters(Object.fromEntries(new URLSearchParams(value.split("?")[1]))))}` : ""}`; } catch { return null; }
}
export function humanize(value: string) { return value.toLowerCase().replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase()); }
export function escapeLike(value: string) { return value.replace(/[\\%_]/g, "\\$&"); }
