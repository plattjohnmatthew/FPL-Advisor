export const ENTITY_RANGE_PRESETS = ["7d", "14d", "30d", "season", "all", "custom"] as const;
export type EntityRangePreset = typeof ENTITY_RANGE_PRESETS[number];
export type EntityRange = { preset: EntityRangePreset; label: string; dateFrom: string | null; dateTo: string | null; fromDate: string; toDate: string; query: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
function day(date: Date) { return date.toISOString().slice(0, 10); }

export function resolveEntityRange(input: { range?: string; from?: string; to?: string }, now = new Date()): EntityRange {
  const preset: EntityRangePreset = ENTITY_RANGE_PRESETS.includes(input.range as EntityRangePreset) ? input.range as EntityRangePreset : "30d";
  const today = day(now);
  let fromDate = ""; let toDate = ""; let label = "All history";
  if (preset === "7d" || preset === "14d" || preset === "30d") {
    const days = preset === "7d" ? 7 : preset === "14d" ? 14 : 30;
    fromDate = day(new Date(Date.parse(`${today}T00:00:00.000Z`) - (days - 1) * 86_400_000)); toDate = today; label = `Last ${days} days`;
  } else if (preset === "season") {
    const start = process.env.FPL_SEASON_START_DATE; const end = process.env.FPL_SEASON_END_DATE;
    if (!start || !end || !DATE.test(start) || !DATE.test(end) || start > end) throw new Error("Configure valid FPL_SEASON_START_DATE and FPL_SEASON_END_DATE to use This season.");
    fromDate = start; toDate = end; label = "This season";
  } else if (preset === "custom") {
    if (!input.from || !input.to || !DATE.test(input.from) || !DATE.test(input.to) || input.from > input.to) throw new Error("Choose a valid custom from/to date range.");
    fromDate = input.from; toDate = input.to; label = `${fromDate} to ${toDate}`;
  }
  const params = new URLSearchParams({ range: preset });
  if (preset === "custom") { params.set("from", fromDate); params.set("to", toDate); }
  return { preset, label, fromDate, toDate, dateFrom: fromDate ? `${fromDate}T00:00:00.000Z` : null, dateTo: toDate ? new Date(Date.parse(`${toDate}T00:00:00.000Z`) + 86_400_000).toISOString() : null, query: `?${params}` };
}
