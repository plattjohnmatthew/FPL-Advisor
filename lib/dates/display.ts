export function formatDisplayDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
  fallback = "Date unavailable",
) {
  if (value === null || value === undefined || value === "") return fallback;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  try {
    return new Intl.DateTimeFormat(undefined, options).format(date);
  } catch {
    return fallback;
  }
}
