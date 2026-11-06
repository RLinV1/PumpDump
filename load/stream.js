// Holds CONNS SSE connections open for HOLD seconds; counts connected and dropped.
import http from "k6/http";
import { Counter } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost";
const CONNS = Number(__ENV.CONNS || 80); // API caps streams at api.max-streams (100)
const HOLD = Number(__ENV.HOLD || 30);
const connected = new Counter("stream_connected");
const dropped = new Counter("stream_dropped");

export const options = { scenarios: { s: { executor: "per-vu-iterations", vus: CONNS, iterations: 1, maxDuration: `${HOLD + 30}s` } } };

export default function () {
  const t0 = Date.now();
  const res = http.get(`${BASE}/api/v1/flags/stream`, { timeout: `${HOLD}s`, headers: { Accept: "text/event-stream" } });
  // k6 buffers the body, so a held connection ends at the timeout (status 0); a 200 earlier means the server closed it.
  if (res.status === 200 || (res.status === 0 && Date.now() - t0 >= HOLD * 900)) connected.add(1);
  if (res.status !== 0 && Date.now() - t0 < HOLD * 900) dropped.add(1);
}

export function handleSummary(data) {
  const v = (n) => data.metrics[n]?.values.count ?? 0;
  const out = { target: BASE, conns: CONNS, hold_s: HOLD, date: new Date().toISOString(), connected: v("stream_connected"), dropped: v("stream_dropped") };
  return { "load/results/stream.json": JSON.stringify(out, null, 2), stdout: JSON.stringify(out) + "\n" };
}
