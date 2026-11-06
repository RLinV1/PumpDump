#!/usr/bin/env bash
# Usage: BASE=http://<ip> VUS=100 CONNS=1000 RATE_LIMIT=100000 load/run.sh   (local k6 or node optional; falls back to Docker images)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p load/results
if command -v k6 >/dev/null; then K6=(k6); else K6=(docker run --rm -i --user "$(id -u):$(id -g)" -v "$PWD:/w" -w /w -e BASE -e VUS -e RATE_LIMIT grafana/k6); fi
if command -v node >/dev/null; then NODE=(node); else NODE=(docker run --rm -i --user "$(id -u):$(id -g)" -v "$PWD:/w" -w /w -e BASE -e CONNS -e HOLD -e RAMP node:20-alpine node); fi
"${K6[@]}" run load/api.js
"${NODE[@]}" load/stream.mjs
"${NODE[@]}" -e '
const a=require("./load/results/api.json"),s=require("./load/results/stream.json");
require("fs").writeFileSync("load/results/summary.md",
`# Load test summary\n\n- Target: ${a.target}\n- Date: ${a.date}\n- Virtual users: ${a.vus}\n- API rate limit per client: ${a.rate_limit}\n- Requests: ${a.requests} (${a.rps} req/s)\n- Latency (successful responses): p50 ${a.p50_ms} ms, p95 ${a.p95_ms} ms, p99 ${a.p99_ms} ms\n- Error rate: ${(a.error_rate*100).toFixed(2)}%\n- Rate limited (429): ${a.rate_limited}\n- Live stream: ${s.receiving}/${s.conns} clients receiving data after ${s.hold_s}s, ${s.dropped} dropped, ${s.refused} refused\n${s.flag_delivered?`- Flag delivery: ${s.flag_delivered} clients, p50 ${s.flag_p50_ms} ms, p95 ${s.flag_p95_ms} ms\n`:""}`)'
cat load/results/summary.md
