// Server-only consumers use bounded requests to avoid the hosted API row cap.
export async function collectDatabasePages<T>(load: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>, label: string, size = 500): Promise<T[]> {
  if (!Number.isInteger(size) || size < 1) throw new Error("Page size must be a positive integer.");
  const rows: T[] = [];
  for (let from = 0; ; from += size) {
    const result = await load(from, from + size - 1);
    if (result.error) throw new Error(`${label}: ${result.error.message}`);
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < size) return rows;
  }
}
