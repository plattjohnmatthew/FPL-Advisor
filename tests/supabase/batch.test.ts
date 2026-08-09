import assert from "node:assert/strict";
import test from "node:test";

import { batchValues, SUPABASE_IN_FILTER_BATCH_SIZE } from "../../lib/supabase/batch";

test("large ID collections are split before PostgREST URL filters are built", () => {
  const ids = Array.from({ length: 2000 }, (_, index) => `00000000-0000-4000-8000-${index.toString().padStart(12, "0")}`);
  const batches = batchValues(ids);
  assert.equal(batches.flat().length, 2000);
  assert.equal(batches.length, 40);
  assert.ok(batches.every((batch) => batch.length <= SUPABASE_IN_FILTER_BATCH_SIZE));
  assert.ok(batches.every((batch) => encodeURIComponent(batch.join(",")).length < 4096));
});
