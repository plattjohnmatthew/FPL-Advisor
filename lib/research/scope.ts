import type { ResearchQueryPlan, ResearchScopeSelection, ResolvedResearchScope } from "./schema";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function localDate(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() - offsetMinutes * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function utcBoundary(local: string, offsetMinutes: number, endExclusive = false) {
  const timestamp = Date.parse(`${local}T00:00:00.000Z`) + offsetMinutes * 60_000 + (endExclusive ? 86_400_000 : 0);
  return new Date(timestamp).toISOString();
}

function requireSeasonDate(name: "FPL_SEASON_START_DATE" | "FPL_SEASON_END_DATE") {
  const value = process.env[name];
  if (!value || !DATE.test(value)) throw new Error(`${name} must be configured as YYYY-MM-DD to use This season.`);
  return value;
}

export function resolveResearchScope(selection: ResearchScopeSelection, plan: ResearchQueryPlan, now = new Date()): ResolvedResearchScope {
  if (!Number.isInteger(selection.timezoneOffsetMinutes) || Math.abs(selection.timezoneOffsetMinutes) > 840) throw new Error("Timezone offset is invalid.");
  const today = localDate(now, selection.timezoneOffsetMinutes);
  let from: string | null = null; let to: string | null = null; let label = "All history";
  if (selection.preset === "THIS_WEEK") {
    const localNow = new Date(`${today}T00:00:00.000Z`); const mondayOffset = (localNow.getUTCDay() + 6) % 7;
    const monday = new Date(localNow.getTime() - mondayOffset * 86_400_000).toISOString().slice(0, 10);
    const sunday = new Date(Date.parse(`${monday}T00:00:00.000Z`) + 6 * 86_400_000).toISOString().slice(0, 10);
    from = utcBoundary(monday, selection.timezoneOffsetMinutes); to = utcBoundary(sunday, selection.timezoneOffsetMinutes, true); label = "This week";
  } else if (selection.preset === "LAST_7_DAYS" || selection.preset === "LAST_30_DAYS") {
    const days = selection.preset === "LAST_7_DAYS" ? 7 : 30;
    const start = new Date(Date.parse(`${today}T00:00:00.000Z`) - (days - 1) * 86_400_000).toISOString().slice(0, 10);
    from = utcBoundary(start, selection.timezoneOffsetMinutes); to = utcBoundary(today, selection.timezoneOffsetMinutes, true); label = `Last ${days} days`;
  } else if (selection.preset === "THIS_SEASON") {
    const start = requireSeasonDate("FPL_SEASON_START_DATE"); const end = requireSeasonDate("FPL_SEASON_END_DATE");
    if (start > end) throw new Error("FPL season date configuration is invalid.");
    from = utcBoundary(start, selection.timezoneOffsetMinutes); to = utcBoundary(end, selection.timezoneOffsetMinutes, true); label = "This season";
  } else if (selection.preset === "CUSTOM") {
    if (!selection.fromDate || !selection.toDate || !DATE.test(selection.fromDate) || !DATE.test(selection.toDate) || selection.fromDate > selection.toDate) throw new Error("Choose a valid custom from/to date range.");
    from = utcBoundary(selection.fromDate, selection.timezoneOffsetMinutes); to = utcBoundary(selection.toDate, selection.timezoneOffsetMinutes, true); label = `${selection.fromDate} to ${selection.toDate}`;
  }
  const impliedFrom = plan.dateFrom ? new Date(plan.dateFrom).toISOString() : null;
  const impliedTo = plan.dateTo ? new Date(plan.dateTo).toISOString() : null;
  if (impliedFrom && (!from || impliedFrom > from)) from = impliedFrom;
  if (impliedTo && (!to || impliedTo < to)) to = impliedTo;
  if (from && to && from >= to) throw new Error("The question's time period does not overlap the selected search scope.");
  return { preset: selection.preset, label, dateFrom: from, dateTo: to };
}

export function applyResearchScope(plan: ResearchQueryPlan, scope: ResolvedResearchScope): ResearchQueryPlan {
  return { ...plan, dateFrom: scope.dateFrom, dateTo: scope.dateTo };
}
