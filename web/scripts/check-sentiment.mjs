// Real pretrained inference with synthetic posts. No Bluesky connection or provider keys.
// Run in the built web image: node scripts/check-sentiment.mjs
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { createBlueskySentiment } from "../bluesky-sentiment.mjs";
import { createBlueskySearch } from "../bluesky-search.mjs";
import { createNewsSentimentLoader } from "../news-sentiment.mjs";

if (process.argv.includes("--offline")) {
  globalThis.fetch = async () => { throw new Error("Network disabled for the model smoke test"); };
}

const now = Date.now();
const examples = [
  ["positive", "$GME reported record profits and raised its full-year guidance."],
  ["negative", "$GME reported a large quarterly loss and cut its full-year guidance."],
  ["neutral", "$GME will publish its quarterly report on Thursday."],
];
const post = (id, text) => ({ uri: `at://did:plc:synthetic/app.bsky.feed.post/${id}`, record: { text, createdAt: new Date(now).toISOString() } });
const socket = new EventTarget();
socket.close = () => {};
const sentiment = createBlueskySentiment({ watchlist: ["GME"], enabled: true, now: () => now, webSocketFactory: () => socket });
const assertCounts = (data) => {
  assert.equal(data.enabled, true);
  assert.equal(data.modelStatus, "ready");
  assert.equal(data.total, 3);
  for (const label of ["positive", "negative", "neutral"]) assert.equal(data[label], 1, label);
  assert.ok(!JSON.stringify(data).includes("did:plc"), "only aggregate results leave the collector");
};

try {
  await sentiment.start();
  assert.equal(sentiment.snapshot("GME").modelStatus, "ready", "the actual pretrained model must load");
  socket.dispatchEvent(new Event("open"));
  for (const [index, [expected, text]] of examples.entries()) {
    const actual = await sentiment.classify(text);
    assert.equal(actual, expected, text);
    console.log(`real model: ${expected} -> ${actual}`);
    const event = { kind: "commit", did: "did:plc:synthetic", time_us: now * 1000,
      commit: { operation: "create", collection: "app.bsky.feed.post", rkey: String(index), record: post(index, text).record } };
    assert.equal(sentiment.ingest(event), true);
    assert.equal(sentiment.ingest(event), false, "duplicate posts must not be counted twice");
  }
  for (let attempt = 0; attempt < 100 && sentiment.snapshot("GME").total < 3; attempt++) await delay(50);
  assertCounts(sentiment.snapshot("GME"));
  console.log("stream aggregation: positive=1 neutral=1 negative=1 total=3; duplicates excluded");

  const fixtures = [...examples.map(([, text], index) => post(index, text)), post(0, examples[0][1]), post("other", "$AMC earnings grew.")];
  const search = createBlueskySearch({ sentiment, now: () => now, fetchImpl: async () => Response.json({ posts: fixtures }) });
  for (const sample of ["top", "latest"]) {
    const data = await search("GME", sample);
    assertCounts(data);
    assert.equal(data.sample.examined, 5);
    console.log(`${sample} search aggregation: positive=1 neutral=1 negative=1 total=3; duplicate and unrelated ticker excluded`);
  }
  const disabled = createBlueskySentiment({ enabled: false, webSocketFactory: () => { throw new Error("must not connect"); } });
  await disabled.start();
  assert.equal(disabled.snapshot("GME").enabled, false);
  assert.equal(disabled.ingest({}), false);
  const news = createNewsSentimentLoader({ enabled: true, loadNews: async () => ({ ticker: "GME", asOf: new Date(now).toISOString(),
    items: examples.map(([, title], index) => ({ id: String(index), title, source: "synthetic", url: "https://example.com" })) }) });
  const headlines = await news("GME");
  assert.equal(headlines.sentimentModel, "Financial DistilRoBERTa");
  assert.equal(headlines.sentimentStatus, "ready");
  assert.deepEqual(headlines.items.map((item) => item.sentiment), examples.map(([label]) => label));
  console.log("financial-news pipeline: synthetic headlines classified positive, negative, neutral by Financial DistilRoBERTa");
  console.log("PASS: enabled synthetic inputs use real social/news models; disabled collection stays off. No live posts used.");
} finally {
  sentiment.stop();
}
