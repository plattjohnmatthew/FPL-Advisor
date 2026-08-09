export const SUPABASE_IN_FILTER_BATCH_SIZE = 50;

export function batchValues<T>(values: readonly T[], size = SUPABASE_IN_FILTER_BATCH_SIZE): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error("Batch size must be a positive integer.");
  const unique = [...new Set(values)];
  const batches: T[][] = [];
  for (let index = 0; index < unique.length; index += size) batches.push(unique.slice(index, index + size));
  return batches;
}
