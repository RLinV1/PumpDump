import { listenLoopback } from "./http-server.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createLookupApi } from "../lookup-api.mjs";

const ok = (calls = []) => async (u) => { calls.push(u); return Response.json({ ticker: "GME", dataMode: "mock" }); };

async function run({ origin = "http://research", fetchImpl = ok(), clock = { t: 0 } } = {}) {
  const handler = createLookupApi({ origin, fetchImpl, now: () => clock.t });
  const server = createServer((req, res) => { req.headers["x-forwarded-for"] = "1.1.1.1"; if (!handler(req, res)) { res.writeHead(404); res.end(); } });
  await listenLoopback(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, method = "GET") => { const res = await fetch(url + path, { method }); return { status: res.status, headers: res.headers, body: await res.json() }; };
  return { call, close: () => server.closeAllConnections() || server.close() };
}

test("lookup validates the ticker and forwards it", async () => {
  const calls = [];
  const s = await run({ fetchImpl: ok(calls) });
  assert.equal((await s.call("/api/v1/lookup/gme")).status, 400);
  assert.equal((await s.call("/api/v1/lookup/TOOLONG")).status, 400);
  assert.equal((await s.call("/api/v1/lookup/GME", "POST")).status, 405);
  const good = await s.call("/api/v1/lookup/GME");
  assert.equal(good.status, 200);
  assert.equal(good.headers.get("x-pumpwatch-data-mode"), "mock");
  s.close();
  assert.deepEqual(calls, ["http://research/lookup/GME"]);
});

test("reads are rate limited per client, then recover after the window", async () => {
  const clock = { t: 0 };
  const s = await run({ clock });
  for (let i = 0; i < 60; i++) assert.equal((await s.call("/api/v1/lookup/GME")).status, 200);
  const limited = await s.call("/api/v1/lookup/GME");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  clock.t = 60_001;
  assert.equal((await s.call("/api/v1/lookup/GME")).status, 200);
  s.close();
});

test("503 when not configured or down; upstream details never leak", async () => {
  const off = await run({ origin: null });
  assert.equal((await off.call("/api/v1/lookup/GME")).status, 503);
  off.close();
  const down = await run({ fetchImpl: async () => { throw new Error("secret host"); } });
  const r = await down.call("/api/v1/lookup/GME");
  down.close();
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.body).includes("secret"));
  const bad = await run({ fetchImpl: async () => Response.json({ detail: "No data for ZZZ." }, { status: 404 }) });
  const nf = await bad.call("/api/v1/lookup/ZZZ");
  bad.close();
  assert.equal(nf.status, 404);
  assert.equal(nf.body.error, "No data for ZZZ.");
});
