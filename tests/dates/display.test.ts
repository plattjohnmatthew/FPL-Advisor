import assert from "node:assert/strict";
import test from "node:test";
import { formatDisplayDate } from "../../lib/dates/display";
import { DEFAULT_RESEARCH_SCOPE } from "../../lib/research/schema";

test("date display never throws for missing or malformed runtime values", () => {
  for (const value of [null, undefined, "", "not-a-date", Number.NaN, new Date(Number.NaN)]) {
    assert.doesNotThrow(() => formatDisplayDate(value));
    assert.equal(formatDisplayDate(value), "Date unavailable");
  }
});

test("missing chat time scope defaults centrally to Last 7 days", () => {
  assert.equal(DEFAULT_RESEARCH_SCOPE, "LAST_7_DAYS");
});
