// Read-API load test. BASE defaults to the local proxy; set VUS to change the peak.
import http from "k6/http";
import { check } from "k6";
import { Counter, Rate } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost";
const VUS = Number(__ENV.VUS || 100);
const RATE_LIMIT = __ENV.RATE_LIMIT || "unknown (set RATE_LIMIT to the API_RATE_LIMIT_PER_MINUTE in use)";
const limited = new Counter("rate_limited"); // 429s are the limiter working, not failures

export const options = {
  scenarios: {
    ramp: {
      executor: "ramping-vus",
      stages: [
        { duration: "20s", target: VUS },
        { duration: "60s", target: VUS },
        { duration: "10s", target: 0 },
      ],
    },
  },
  thresholds: {
    "http_req_duration{expected_response:true}": ["p(95)<500"],
    errors: ["rate<0.01"],
  },
};
const errors = new Rate("errors");

const PATHS = ["/api/v1/watchlist", "/api/v1/flags?limit=20", "/api/v1/tickers/GME/timeline"];

export default function () {
  const res = http.get(BASE + PATHS[Math.floor(Math.random() * PATHS.length)]);
  if (res.status === 429) {
    limited.add(1);
    return;
  }
  errors.add(!check(res, { "status 200": (r) => r.status === 200 }));
}

export function handleSummary(data) {
  const m = data.metrics;
  // latency of successful responses only: 429s return fast and would flatter the percentiles
  const d = (m["http_req_duration{expected_response:true}"] ?? m.http_req_duration).values;
  const out = {
    target: BASE, vus: VUS, rate_limit: RATE_LIMIT, date: new Date().toISOString(),
    requests: m.http_reqs.values.count, rps: +m.http_reqs.values.rate.toFixed(1),
    p50_ms: +d.med.toFixed(1), p95_ms: +d["p(95)"].toFixed(1), p99_ms: +(d["p(99)"] ?? d.max).toFixed(1),
    error_rate: +(m.errors?.values.rate ?? 0).toFixed(4),
    rate_limited: m.rate_limited?.values.count ?? 0,
  };
  return { "load/results/api.json": JSON.stringify(out, null, 2), stdout: JSON.stringify(out) + "\n" };
}
