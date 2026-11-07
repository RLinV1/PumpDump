import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { test } from "node:test";

// k6 imports are runtime-only; exercise its summary callback with metric snapshots.
const script = readFileSync(new URL("../../load/api.js", import.meta.url), "utf8")
  .replace(/^import .+;$/gm, "").replace(/^export default function /gm, "function loadIteration").replace(/^export /gm, "");
const runtime = { __ENV: {}, Counter: class {}, Rate: class {} };
runInNewContext(script + "\nglobalThis.summary = handleSummary;", runtime);
const metrics = (percentiles) => ({ metrics: {
  http_req_duration: { values: { med: 10, "p(95)": 20, max: 100, ...percentiles } },
  http_reqs: { values: { count: 10, rate: 1.25 } },
} });
test("the k6 report preserves results when p99 was omitted by runtime settings", () => {
  const report = runtime.summary(metrics({}));
  const data = JSON.parse(report["load/results/api.json"]);
  assert.equal(data.p99_ms, null);
  assert.equal(data.p95_ms, 20);
  assert.equal(data.requests, 10);
});
test("the k6 report uses actual p99 rather than max", () => {
  const report = runtime.summary(metrics({ "p(99)": 42.26 }));
  assert.equal(JSON.parse(report["load/results/api.json"]).p99_ms, 42.3);
});
