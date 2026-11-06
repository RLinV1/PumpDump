// Live-stream test with real SSE clients. A client counts as live only if bytes reach it: an open socket proves nothing,
// because a buffering hop holds connections open while delivering no events.
// Usage: BASE=http://127.0.0.1 CONNS=1000 node load/stream.mjs
// INSERT_FLAG=1 (local stack only) also inserts one flag through docker compose and times its arrival at every client.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import http from "node:http";

const BASE = process.env.BASE ?? "http://127.0.0.1";
const CONNS = Number(process.env.CONNS ?? 1000);
const RAMP_MS = Number(process.env.RAMP ?? 10) * 1000; // a same-instant burst overflows the host accept queue
const HOLD_MS = Number(process.env.HOLD ?? 20) * 1000; // longer than the API's 15 s heartbeat
const agent = new http.Agent({ keepAlive: false, maxSockets: Infinity });
const marker = `stream-${Date.now()}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let open = 0, refused = 0, dropped = 0, receiving = 0, sentAt = 0;
const latencies = [];

function connect() {
  const req = http.get(`${BASE}/api/v1/flags/stream`, { agent, headers: { Accept: "text/event-stream", "Accept-Encoding": "gzip" } }, (res) => {
    if (res.statusCode !== 200) { refused++; res.resume(); return; }
    open++;
    let bytes = false, seen = false;
    res.setEncoding("utf8");
    res.on("data", (chunk) => {
      if (!bytes) { bytes = true; receiving++; }
      if (!seen && chunk.includes(marker)) { seen = true; latencies.push(Date.now() - sentAt); }
    });
    res.on("close", () => { open--; dropped++; });
  });
  req.on("error", () => { refused++; });
}

for (let i = 0; i < CONNS; i++) setTimeout(connect, (RAMP_MS * i) / CONNS);
await sleep(RAMP_MS + 2000);

if (process.env.INSERT_FLAG) {
  // psql starts first, so the clock covers commit, API poll and delivery, not docker start-up
  const psql = spawn("docker", ["compose", "exec", "-T", "postgres", "psql", "-q", "-U", "pumpwatch", "-d", "pumpwatch"], { stdio: ["pipe", "ignore", "inherit"] });
  await sleep(3000);
  sentAt = Date.now();
  psql.stdin.write(`INSERT INTO api_flags (run_id, topic, kafka_partition, kafka_offset, ticker, raised_at, evidence)
    VALUES ('live', 'load-seed', 1, ${sentAt}, 'GME', now(), '{"score":74,"modelVersion":"${marker}","topContributors":[],"postCount":1,"tradeCount":1,"catalyst":null}'::jsonb);\n`);
  psql.stdin.end();
}
await sleep(HOLD_MS);

latencies.sort((a, b) => a - b);
const pct = (p) => latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? null;
const out = { target: BASE, conns: CONNS, hold_s: HOLD_MS / 1000, date: new Date().toISOString(), open, receiving, dropped, refused,
  flag_delivered: latencies.length, flag_p50_ms: pct(0.5), flag_p95_ms: pct(0.95), flag_max_ms: latencies.at(-1) ?? null };
mkdirSync("load/results", { recursive: true });
writeFileSync("load/results/stream.json", JSON.stringify(out, null, 2));
console.log(JSON.stringify(out));
process.exit(0);
