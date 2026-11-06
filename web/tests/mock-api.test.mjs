import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { serveMockApi } from "../mock-api.mjs";

let server;
let base;
const now = Date.parse("2026-10-28T18:00:00Z");
before(async () => {
  server = createServer((request, response) => serveMockApi(request, response, now));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); });

test("mock watchlist provides current aggregate data labeled mock", async () => {
  const response = await fetch(`${base}/api/v1/watchlist`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-pumpwatch-data-mode"), "mock");
  const body = await response.json();
  assert.equal(body.mode, "mock");
  assert.equal(body.data.length, 3);
  assert.ok(body.notice.includes("Not investment advice"));
  assert.equal(body.data[0].ticker, "GME");
  assert.equal(body.data[0].computedAt, "2026-10-28T18:00:00.000Z");
  assert.ok(!JSON.stringify(body).match(/author|rawText|postText/));
});

test("mock flags respect limits and share the ticker timeline time axis", async () => {
  const flags = await (await fetch(`${base}/api/v1/flags?limit=1`)).json();
  assert.equal(flags.data.length, 1);
  const flag = flags.data[0];
  const history = await (await fetch(`${base}/api/v1/tickers/${flag.ticker}/timeline`)).json();
  assert.equal(history.mode, "mock");
  assert.equal(history.data.scores.length, 73);
  assert.ok(history.data.flags.some((point) => point.id === flag.id && point.at === flag.raisedAt));
  assert.ok(history.data.scores.every((point) => point.score >= 0 && point.score <= 100));
  assert.equal(history.data.to, "2026-10-28T18:00:00.000Z");
});

test("mock API rejects writes, invalid ranges, unknown symbols and replay mixing", async () => {
  for (const [path, options, status] of [
    ["/watchlist", { method: "POST" }, 405],
    ["/flags?limit=0", {}, 400],
    ["/tickers/ZZZZZ/timeline", {}, 404],
    ["/tickers/GME/timeline?from=bad", {}, 400],
    ["/watchlist?runId=live", {}, 400],
  ]) assert.equal((await fetch(`${base}/api/v1${path}`, options)).status, status);
});

test("mock SSE sends labeled aggregate flags and supports event-id resume", async () => {
  const response = await fetch(`${base}/api/v1/flags/stream`);
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body.getReader();
  try {
    const chunk = new TextDecoder().decode((await reader.read()).value);
    assert.ok(chunk.includes("event: flag"));
    assert.ok(chunk.includes('"mode":"mock"'));
    const ids = [...chunk.matchAll(/id: (\d+)/g)].map((match) => Number(match[1]));
    const resumed = await fetch(`${base}/api/v1/flags/stream`, { headers: { "Last-Event-ID": String(Math.max(...ids)) } });
    const resumedReader = resumed.body.getReader();
    try { assert.ok(!new TextDecoder().decode((await resumedReader.read()).value).includes("event: flag")); }
    finally { await resumedReader.cancel(); }
  } finally { await reader.cancel(); }
});
