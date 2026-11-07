import { listenLoopback } from "./http-server.mjs";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { createAssistantApi } from "../assistant-api.mjs";

const UPSTREAM = { answer: "GME is 74/100. not investment advice.", tools_used: ["get_pump_risk"], mode: { data: "mock", llm: "mock" }, note: "",
  sources: [{ kind: "pumpwatch", title: "Pumpwatch risk score (mock data)", url: null }, { kind: "news", title: "ok", url: "https://example.com" }, { bad: true }] };

async function run({ origin = "http://research", fetchImpl, clock = { t: 0 }, ip = "1.1.1.1" } = {}) {
  const handler = createAssistantApi({ origin, fetchImpl, now: () => clock.t });
  const server = createServer((req, res) => { req.headers["x-forwarded-for"] = ip; if (!handler(req, res)) { res.writeHead(404); res.end(); } });
  await listenLoopback(server);
  const url = `http://127.0.0.1:${server.address().port}`;
  const post = async (body, headers = { "Content-Type": "application/json" }, path = "/api/v1/assistant/ask") => {
    const res = await fetch(url + path, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
    return { status: res.status, headers: res.headers, body: await res.json() };
  };
  return { post, url, close: () => server.closeAllConnections() || server.close() };
}
const okFetch = (calls = []) => async (u, init) => { calls.push({ u, body: JSON.parse(init.body) }); return new Response(JSON.stringify(UPSTREAM), { status: 200 }); };

test("forwards a valid question and maps the answer, dropping malformed sources", async () => {
  const calls = [];
  const s = await run({ fetchImpl: okFetch(calls) });
  const r = await s.post({ question: "  Is GME being pumped?  " });
  s.close();
  assert.equal(r.status, 200);
  assert.deepEqual(calls, [{ u: "http://research/assistant/ask", body: { question: "Is GME being pumped?" } }]);
  assert.equal(r.headers.get("x-pumpwatch-data-mode"), "mock");
  assert.match(r.body.notice, /Not investment advice/);
  assert.deepEqual(r.body.data.toolsUsed, ["get_pump_risk"]);
  assert.equal(r.body.data.sources.length, 2);
  assert.equal(r.body.data.dataMode, "mock");
  assert.equal(r.body.data.llm, "mock");
});

test("labels the answering model as gemini or mock and forwards only a well-formed paper token", async () => {
  const seen = [];
  const fetchImpl = async (u, init) => { seen.push(init.headers["X-Paper-Token"]); return new Response(JSON.stringify({ ...UPSTREAM, mode: { data: "live", llm: "gemini" } }), { status: 200 }); };
  const s = await run({ fetchImpl });
  const token = "a".repeat(40);
  const json = { "Content-Type": "application/json" };
  const a = await s.post({ question: "q" }, { ...json, "X-Paper-Token": token });
  await s.post({ question: "q" }, { ...json, "X-Paper-Token": "short" });
  s.close();
  assert.equal(a.body.data.llm, "gemini");
  assert.deepEqual(seen, [token, undefined]);
});

test("rejects bad input before anything is forwarded", async () => {
  const calls = [];
  const s = await run({ fetchImpl: okFetch(calls) });
  assert.equal((await s.post({})).status, 400);
  assert.equal((await s.post({ question: "   " })).status, 400);
  assert.equal((await s.post({ question: 5 })).status, 400);
  assert.equal((await s.post({ question: "bad\u0000char" })).status, 400);
  assert.equal((await s.post({ question: "x".repeat(301) })).status, 400);
  assert.equal((await s.post("not json")).status, 400);
  assert.equal((await s.post({ question: "x" }, { "Content-Type": "text/plain" })).status, 415);
  assert.equal((await s.post({ question: "x".repeat(5000) })).status, 413);
  const get = await fetch(s.url + "/api/v1/assistant/ask");
  assert.equal(get.status, 405);
  assert.equal((await s.post({ question: "x" }, undefined, "/api/v1/assistant/other")).status, 404);
  s.close();
  assert.equal(calls.length, 0);
});

test("rate limits per client, then recovers after the window", async () => {
  const clock = { t: 0 };
  const s = await run({ fetchImpl: okFetch(), clock });
  for (let i = 0; i < 5; i++) assert.equal((await s.post({ question: "q" })).status, 200);
  const limited = await s.post({ question: "q" });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("retry-after"), "60");
  clock.t = 61_000;
  assert.equal((await s.post({ question: "q" })).status, 200);
  s.close();
});

test("a global cap stops many clients together", async () => {
  const clock = { t: 0 };
  const handler = createAssistantApi({ origin: "http://research", fetchImpl: okFetch(), now: () => clock.t });
  let ip = 0;
  const server = createServer((req, res) => { req.headers["x-forwarded-for"] = `10.0.0.${ip++}`; handler(req, res); });
  await listenLoopback(server);
  const url = `http://127.0.0.1:${server.address().port}/api/v1/assistant/ask`;
  const codes = [];
  for (let i = 0; i < 32; i++) codes.push((await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: '{"question":"q"}' })).status);
  server.closeAllConnections();
  server.close();
  assert.equal(codes.filter((c) => c === 200).length, 30);
  assert.equal(codes.filter((c) => c === 429).length, 2);
});

test("503 when not configured or the service is down, 429 and 502 pass through safely", async () => {
  let s = await run({ origin: "" });
  assert.equal((await s.post({ question: "q" })).status, 503);
  s.close();
  s = await run({ fetchImpl: async () => { throw new Error("ECONNREFUSED secret-host"); } });
  const down = await s.post({ question: "q" });
  assert.equal(down.status, 503);
  assert.doesNotMatch(JSON.stringify(down.body), /secret-host/);
  s.close();
  s = await run({ fetchImpl: async () => new Response("{}", { status: 429 }) });
  assert.equal((await s.post({ question: "q" })).status, 429);
  s.close();
  s = await run({ fetchImpl: async () => new Response('{"answer":1}', { status: 200 }) });
  assert.equal((await s.post({ question: "q" })).status, 502);
  s.close();
});
