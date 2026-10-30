import test from "node:test";
import assert from "node:assert/strict";
import { createBlueskySentiment } from "../bluesky-sentiment.mjs";

const START = Date.parse("2026-10-30T14:00:00Z");
const event = (rkey = "one", text = "$GME earnings are strong", at = START) => ({
  kind: "commit", did: "did:plc:private-author", time_us: at * 1000,
  commit: { operation: "create", collection: "app.bsky.feed.post", rkey, record: { text, createdAt: new Date(at).toISOString() } },
});
const deleted = (rkey = "one") => ({ ...event(rkey), commit: { operation: "delete", collection: "app.bsky.feed.post", rkey } });
const settle = async (until) => {
  for (let i = 0; i < 100 && !until(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(until(), "work must settle");
};
const make = (options = {}) => {
  const sockets = [];
  const service = createBlueskySentiment({
    watchlist: ["GME", "AMC"], enabled: true, now: () => START,
    classify: async () => [{ label: "positive", score: 0.9 }],
    webSocketFactory: (url) => {
      const socket = new EventTarget();
      socket.url = url; socket.closed = false;
      socket.close = () => { socket.closed = true; socket.dispatchEvent(new Event("close")); };
      sockets.push(socket);
      return socket;
    }, ...options,
  });
  return { service, sockets };
};

test("disabled service never loads a model or opens a stream", async () => {
  const { service, sockets } = make({ enabled: false, classify: () => { throw new Error("must not run"); } });
  await service.start();
  assert.equal(service.snapshot("GME").modelStatus, "disabled");
  assert.equal(service.ingest(event()), false);
  assert.equal(sockets.length, 0);
  service.stop();
});

test("selecting a stock outside the watchlist starts collecting its sentiment", async () => {
  const { service } = make();
  await service.start();
  assert.equal(service.ingest(event("before", "$NVDA profits beat expectations")), false);
  assert.equal(service.snapshot("NVDA").total, 0);
  assert.equal(service.ingest(event("after", "$NVDA profits beat expectations")), true);
  await settle(() => service.snapshot("NVDA").total === 1);
  assert.equal(service.snapshot("NVDA").positive, 1);
  service.stop();
});

test("selected stocks expire after an hour without reads", async () => {
  let now = START;
  const { service } = make({ now: () => now });
  await service.start();
  service.snapshot("NVDA");
  assert.equal(service.ingest(event("active", "$NVDA earnings", now)), true);
  await settle(() => service.snapshot("NVDA").total === 1);
  now += 3600001;
  assert.equal(service.ingest(event("expired", "$NVDA earnings", now)), false);
  assert.equal(service.ingest(event("configured", "$GME earnings", now)), true);
  service.stop();
});

test("selection tracking is bounded while preserving the configured watchlist", async () => {
  const { service } = make();
  await service.start();
  for (let i = 0; i < 65; i++) service.snapshot(`Z${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`);
  assert.equal(service.ingest(event("evicted", "$ZAA earnings")), false);
  assert.equal(service.ingest(event("latest", "$ZCM earnings")), true);
  assert.equal(service.ingest(event("configured", "$GME earnings")), true);
  service.stop();
});

test("local classification counts each matching ticker once and exposes no post or author data", async () => {
  let calls = 0;
  const { service, sockets } = make({ classify: async () => { calls++; return [{ label: "positive", score: 0.95 }]; } });
  await service.start();
  sockets[0].dispatchEvent(new Event("open"));
  assert.equal(service.ingest(event("one", "$GME and $AMC sales beat expectations. PRIVATE_POST")), true);
  assert.equal(service.ingest(event("one")), false);
  await settle(() => service.snapshot("GME").total === 1);
  assert.equal(service.snapshot("AMC").positive, 1);
  assert.equal(calls, 1);
  assert.equal(service.snapshot("GME").streamConnected, true);
  const publicData = JSON.stringify(service.snapshot("GME"));
  assert.ok(!publicData.includes("PRIVATE_POST") && !publicData.includes("private-author") && !publicData.includes("did:"));
  assert.match(sockets[0].url, /wantedCollections=app.bsky.feed.post/);
  service.stop();
});

test("rejects off-topic, malformed, stale and future posts before inference", async () => {
  let calls = 0;
  const { service } = make({ classify: async () => { calls++; return "neutral"; } });
  await service.start();
  for (const input of ["{bad", null, {}, event("a", "GME is a nice abbreviation"), event("b", "$AAPL is up"),
    event("c", "$GME profits", START - 3600001), event("d", "$GME profits", START + 300001),
    { ...event("e"), kind: "identity" }]) assert.equal(service.ingest(input), false);
  assert.equal(service.ingest(event("f", "GME earnings look good")), true);
  await settle(() => service.snapshot("GME").total === 1);
  assert.equal(calls, 1);
  service.stop();
});

test("deleted posts are removed and cannot reappear from an in-flight classification", async () => {
  let finish;
  const { service } = make({ classify: () => new Promise((resolve) => { finish = resolve; }) });
  await service.start();
  service.ingest(event());
  await settle(() => !!finish);
  service.ingest(deleted());
  finish("positive");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.snapshot("GME").total, 0);
  service.stop();
  const ready = make().service;
  await ready.start(); ready.ingest(event());
  await settle(() => ready.snapshot("GME").total === 1);
  ready.ingest(deleted());
  assert.equal(ready.snapshot("GME").total, 0);
  ready.stop();
});

test("expired samples leave the one-hour aggregate and malformed model labels are never fabricated", async () => {
  let now = START;
  const { service } = make({ now: () => now, classify: async () => "negative" });
  await service.start(); service.ingest(event());
  await settle(() => service.snapshot("GME").negative === 1);
  now += 3600001;
  assert.equal(service.snapshot("GME").total, 0);
  assert.equal(service.snapshot("GME").lastPostAt, null);
  service.stop();
  const invalid = make({ classify: async () => ({ label: "guaranteed profit" }) }).service;
  await invalid.start(); invalid.ingest(event());
  await settle(() => invalid.snapshot("GME").modelStatus === "error");
  assert.equal(invalid.snapshot("GME").total, 0);
  invalid.stop();
});

test("queue and retained sample limits stay bounded and inference remains serial", async () => {
  let complete, active = 0, maxActive = 0;
  const { service } = make({ maxQueue: 2, maxSamples: 2, classify: async () => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => { complete = resolve; }); active--; return "positive";
  } });
  await service.start();
  service.ingest(event("one")); await settle(() => !!complete);
  service.ingest(event("two")); service.ingest(event("three"));
  assert.equal(service.ingest(event("four")), false);
  assert.equal(service.snapshot("GME").dropped, 1);
  for (let i = 0; i < 3; i++) {
    const before = complete; complete();
    if (i < 2) await settle(() => complete !== before);
  }
  await settle(() => service.snapshot("GME").total === 2);
  assert.equal(maxActive, 1);
  assert.equal(service.snapshot("GME").total, 2);
  service.stop();
});

test("stop discards pending inference and closes the stream without reconnecting", async () => {
  let finish;
  const { service, sockets } = make({ classify: () => new Promise((resolve) => { finish = resolve; }) });
  await service.start(); service.ingest(event()); await settle(() => !!finish);
  service.stop(); finish("positive");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(service.snapshot("GME").total, 0);
  assert.equal(service.snapshot("GME").streamConnected, false);
  assert.equal(sockets[0].closed, true);
});

test("stream messages are classified and reconnect resumes from the event cursor", async () => {
  const { service, sockets } = make({ reconnectDelayMs: 5 });
  await service.start();
  const message = new Event("message");
  message.data = JSON.stringify(event());
  sockets[0].dispatchEvent(message);
  await settle(() => service.snapshot("GME").total === 1);
  sockets[0].dispatchEvent(new Event("close"));
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(sockets.length, 2);
  assert.equal(new URL(sockets[1].url).searchParams.get("cursor"), String(START * 1000));
  service.stop();
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(sockets.length, 2);
});

test("a stalled classifier reports an error and does not start overlapping inferences", async () => {
  let calls = 0;
  const { service } = make({ inferenceTimeoutMs: 5, classify: () => { calls++; return new Promise(() => {}); } });
  await service.start();
  service.ingest(event("one")); service.ingest(event("two"));
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(service.snapshot("GME").modelStatus, "error");
  assert.equal(service.snapshot("GME").total, 0);
  assert.equal(service.snapshot("GME").dropped, 2);
  assert.equal(calls, 1);
  service.stop();
});
