import assert from "node:assert/strict";
import { test } from "node:test";
import { sentimentSummary } from "../lib/sentiment-summary.ts";

const sample = { enabled: true, modelStatus: "ready", positive: 3, neutral: 2, negative: 1, total: 6, asOf: "2026-11-06T12:00:00Z" };
test("a failed refresh labels retained sentiment stale until the next successful read", () => {
  assert.doesNotMatch(sentimentSummary(sample, true, false), /stale|could not refresh/i);
  const stale = sentimentSummary(sample, true, true);
  assert.match(stale, /could not refresh/i);
  assert.match(stale, /last received sample/i);
  assert.match(stale, /2026-11-06T12:00:00Z/);
  assert.doesNotMatch(stale, /last 24 hours/);
  assert.doesNotMatch(sentimentSummary(sample, true, false), /stale|could not refresh/i);
});
test("initial failures and loading never invent counts", () => {
  assert.equal(sentimentSummary(undefined, false, false), "Checking...");
  assert.equal(sentimentSummary(undefined, true, true), "Sentiment unavailable right now.");
});
