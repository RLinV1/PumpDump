#!/usr/bin/env bash
# Usage: BASE=http://<ip> VUS=100 CONNS=80 load/run.sh   (uses local k6 or the grafana/k6 image)
set -euo pipefail
cd "$(dirname "$0")/.."
if command -v k6 >/dev/null; then K6=(k6); else K6=(docker run --rm -i -v "$PWD:/w" -w /w -e BASE -e VUS -e CONNS -e HOLD grafana/k6); fi
"${K6[@]}" run load/api.js
"${K6[@]}" run load/stream.js
node -e '
const a=require("./load/results/api.json"),s=require("./load/results/stream.json");
require("fs").writeFileSync("load/results/summary.md",
`# Load test summary\n\n- Target: ${a.target}\n- Date: ${a.date}\n- Virtual users: ${a.vus}\n- Requests: ${a.requests} (${a.rps} req/s)\n- Latency: p50 ${a.p50_ms} ms, p95 ${a.p95_ms} ms, p99 ${a.p99_ms} ms\n- Error rate: ${(a.error_rate*100).toFixed(2)}%\n- Rate limited (429): ${a.rate_limited}\n- Live stream: ${s.connected}/${s.conns} connected for ${s.hold_s}s, ${s.dropped} dropped\n`)'
cat load/results/summary.md
