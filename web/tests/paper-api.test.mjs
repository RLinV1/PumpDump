import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createPaperApi } from "../paper-api.mjs";

const TOKEN = "T".repeat(43);
const ACCOUNT = { cashCents: 1, totalCents: 1, positions: [], orders: [], dataMode: "mock", simulated: true };

// Records every upstream call; answers like the Python service would.
const fakeService = (calls = [], overrides = {}) => async (u, init) => {
  const body = init.body ? JSON.parse(init.body) : undefined;
  calls.push({ u, method: init.method, token: init.headers["X-Paper-Token"], body });
  if (overrides[u]) return overrides[u](body);
  if (u.endsWith("/paper/holdings")) return Response.json({ tickers: ["GME"] });
  return Response.json({ ...ACCOUNT, ...(u.includes("/lookup/") ? { ticker: "GME" } : {}) });
};

async function run({ origin = "http://plutus", fetchImpl, clock = { t: 0 }, ip = "1.1.1.1", mode = "mock", loadQuotes } = {}) {
  const handler = createPaperApi({ origin, fetchImpl, mode, loadQuotes, now: () => clock.t });
  const server = createServer((req, res) => { req.headers["x-forwarded-for"] = ip; if (!handler(req, res)) { res.writeHead(404); res.end(); } });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}`;
  const call = async (path, { method = "GET", body, headers = {}, token = TOKEN, raw } = {}) => {
    const h = { ...(token ? { "X-Paper-Token": token } : {}), ...(body !== undefined || raw ? { "Content-Type": "application/json" } : {}), ...headers };
    const res = await fetch(url + path, { method, headers: h, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  return { call, url, close: () => server.closeAllConnections() || server.close() };
}
const order = (body, extra) => ["/api/v1/paper/orders", { method: "POST", body, ...extra }];

test("a valid order is forwarded with the token and no client price", async () => {
  const calls = [];
  const s = await run({ fetchImpl: fakeService(calls) });
  const r = await s.call(...order({ side: "BUY", ticker: "GME", qty: 5, price: 0.01 }));
  s.close();
  assert.equal(r.status, 200);
  assert.deepEqual(calls, [{ u: "http://plutus/paper/orders", method: "POST", token: TOKEN, body: { side: "BUY", ticker: "GME", qty: 5 } }]);
  assert.equal(r.headers.get("x-pumpwatch-data-mode"), "mock");
  assert.match(r.body.notice, /Not investment advice/);
});

test("bad orders never reach the service", async () => {
  const calls = [];
  const s = await run({ fetchImpl: fakeService(calls) });
  const bad = [
    { side: "HOLD", ticker: "GME", qty: 1 }, { side: "BUY", ticker: "gme", qty: 1 }, { side: "BUY", ticker: "TOOLONG", qty: 1 },
    { side: "BUY", ticker: "GME", qty: 0 }, { side: "BUY", ticker: "GME", qty: -2 }, { side: "BUY", ticker: "GME", qty: 1.5 },
    { side: "BUY", ticker: "GME", qty: "5" }, { side: "BUY", ticker: "GME", qty: 10_001 }, { side: "BUY", ticker: "GME" }, [], null,
  ];
  for (const body of bad) assert.equal((await s.call(...order(body))).status, 400, JSON.stringify(body));
  assert.equal((await s.call(...order(undefined, { raw: "not json" }))).status, 400);
  assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 1 }, { headers: { "Content-Type": "text/plain" } }))).status, 415);
  assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 1, pad: "x".repeat(2000) }))).status, 413);
  assert.equal((await s.call("/api/v1/paper/orders")).status, 405);
  assert.equal((await s.call("/api/v1/paper/other")).status, 404);
  s.close();
  assert.equal(calls.length, 0);
});

test("the account token is required and checked before anything is forwarded", async () => {
  const calls = [];
  const s = await run({ fetchImpl: fakeService(calls) });
  for (const token of [null, "short", "x".repeat(65), `${"a".repeat(40)}!`, "a b".padEnd(40, "c")]) {
    assert.equal((await s.call("/api/v1/paper/account", { token })).status, 401, String(token));
    assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 1 }, { token }))).status, 401);
  }
  assert.equal((await s.call("/api/v1/paper/account", { method: "POST" })).status, 405);
  assert.equal((await s.call("/api/v1/paper/account")).status, 200);
  s.close();
  assert.equal(calls.length, 1);
});

test("account reads need no price from the browser; reset needs confirm: true", async () => {
  const calls = [];
  const s = await run({ fetchImpl: fakeService(calls) });
  assert.equal((await s.call("/api/v1/paper/account")).status, 200);
  assert.equal((await s.call("/api/v1/paper/reset", { method: "POST", body: {} })).status, 400);
  assert.equal((await s.call("/api/v1/paper/reset", { method: "POST", body: { confirm: "yes" } })).status, 400);
  assert.equal((await s.call("/api/v1/paper/reset", { method: "POST", body: { confirm: true } })).status, 200);
  s.close();
  assert.deepEqual(calls.map((c) => c.u), ["http://plutus/paper/account", "http://plutus/paper/reset"]);
});

test("lookup validates the ticker and forwards it", async () => {
  const calls = [];
  const s = await run({ fetchImpl: fakeService(calls) });
  assert.equal((await s.call("/api/v1/lookup/gme", { token: null })).status, 400);
  assert.equal((await s.call("/api/v1/lookup/TOOLONG", { token: null })).status, 400);
  assert.equal((await s.call("/api/v1/lookup/GME", { token: null })).status, 200);
  assert.equal((await s.call("/api/v1/lookup/GME", { method: "POST", token: null })).status, 405);
  s.close();
  assert.deepEqual(calls.map((c) => c.u), ["http://plutus/lookup/GME"]);
});

test("writes are rate limited per client, then recover after the window", async () => {
  const clock = { t: 0 };
  const s = await run({ fetchImpl: fakeService(), clock });
  for (let i = 0; i < 20; i++) assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 1 }))).status, 200);
  const limited = await s.call(...order({ side: "BUY", ticker: "GME", qty: 1 }));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  assert.equal((await s.call("/api/v1/paper/account")).status, 200); // reads have their own budget
  clock.t = 61_000;
  assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 1 }))).status, 200);
  s.close();
});

test("a global write cap stops many clients together", async () => {
  const clock = { t: 0 };
  const handler = createPaperApi({ origin: "http://plutus", fetchImpl: fakeService(), now: () => clock.t });
  let ip = 0;
  const server = createServer((req, res) => { req.headers["x-forwarded-for"] = `10.0.${ip >> 8}.${ip++ & 255}`; handler(req, res); });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/paper/orders`;
  const codes = [];
  for (let i = 0; i < 302; i++) codes.push((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "X-Paper-Token": TOKEN }, body: '{"side":"BUY","ticker":"GME","qty":1}' })).status);
  server.closeAllConnections();
  server.close();
  assert.equal(codes.filter((c) => c === 200).length, 300);
  assert.equal(codes.filter((c) => c === 429).length, 2);
});

test("live mode fills at this server's own Alpaca quote and refuses without one", async () => {
  const calls = [];
  const quotes = [];
  const loadQuotes = async (symbols) => { quotes.push(symbols); return { quotes: symbols.includes("GME") ? [{ ticker: "GME", price: 21.5 }] : [] }; };
  const s = await run({ mode: "live", loadQuotes, fetchImpl: fakeService(calls) });
  const ok = await s.call(...order({ side: "BUY", ticker: "GME", qty: 2, price: 0.01 }));
  assert.equal(ok.status, 200);
  assert.deepEqual(calls[0].body, { side: "BUY", ticker: "GME", qty: 2, price: 21.5 });
  const none = await s.call(...order({ side: "BUY", ticker: "AMC", qty: 2 }));
  assert.equal(none.status, 503);
  assert.match(none.body.error, /refused/);
  assert.equal(calls.length, 1);
  // account reads mark held tickers with the same quote source
  assert.equal((await s.call("/api/v1/paper/account")).status, 200);
  assert.deepEqual(calls.at(-1).body, { marks: { GME: 21.5 } });
  s.close();
});

test("503 when not configured or down; upstream details never leak", async () => {
  let s = await run({ origin: undefined });
  assert.equal((await s.call("/api/v1/paper/account")).status, 503);
  s.close();
  s = await run({ fetchImpl: async () => { throw new Error("ECONNREFUSED secret-host"); } });
  const down = await s.call("/api/v1/paper/account");
  assert.equal(down.status, 503);
  assert.doesNotMatch(JSON.stringify(down.body), /secret-host/);
  s.close();
  s = await run({ fetchImpl: async () => Response.json({ detail: "Not enough paper cash: 5 GME costs $1.00, you have $0.00." }, { status: 400 }) });
  const refused = await s.call(...order({ side: "BUY", ticker: "GME", qty: 5 }));
  assert.equal(refused.status, 400);
  assert.match(refused.body.error, /Not enough paper cash/);
  s.close();
  s = await run({ fetchImpl: async () => Response.json({ detail: [{ loc: ["body"], msg: "internal" }] }, { status: 422 }) });
  assert.equal((await s.call(...order({ side: "BUY", ticker: "GME", qty: 5 }))).status, 400);
  s.close();
  s = await run({ fetchImpl: async () => Response.json({ cashCents: "x" }) });
  assert.equal((await s.call("/api/v1/paper/account")).status, 502);
  s.close();
});
