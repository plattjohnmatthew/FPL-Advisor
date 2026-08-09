export function localDateRangeToUtcBounds(fromDate: string, toDate: string, timezoneOffsetMinutes: number) {
  const parse = (value: string) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error("Dates must use YYYY-MM-DD format.");
    const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
    const check = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    if (check.getUTCFullYear() !== parts[0] || check.getUTCMonth() !== parts[1] - 1 || check.getUTCDate() !== parts[2]) {
      throw new Error("Date range contains an invalid calendar date.");
    }
    return parts;
  };
  if (!Number.isInteger(timezoneOffsetMinutes) || Math.abs(timezoneOffsetMinutes) > 14 * 60) {
    throw new Error("Timezone offset is invalid.");
  }
  const from = parse(fromDate); const to = parse(toDate);
  const start = Date.UTC(from[0], from[1] - 1, from[2]) + timezoneOffsetMinutes * 60_000;
  const end = Date.UTC(to[0], to[1] - 1, to[2] + 1) + timezoneOffsetMinutes * 60_000;
  if (start >= end) throw new Error("The from date must not be after the to date.");
  return { startInclusive: new Date(start).toISOString(), endExclusive: new Date(end).toISOString() };
}

export function latestSevenLocalDates(now: Date, timezoneOffsetMinutes: number) {
  const local = new Date(now.getTime() - timezoneOffsetMinutes * 60_000);
  const to = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const from = new Date(to); from.setUTCDate(from.getUTCDate() - 6);
  const format = (date: Date) => date.toISOString().slice(0, 10);
  return { fromDate: format(from), toDate: format(to), ...localDateRangeToUtcBounds(format(from), format(to), timezoneOffsetMinutes) };
}
