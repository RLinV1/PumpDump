import assert from "node:assert/strict";
import { test } from "node:test";
import { createNewsSentimentLoader } from "../news-sentiment.mjs";

const news = { ticker: "GME", asOf: "2026-11-06T12:00:00Z", items: [{ id: "1", title: "Synthetic profits grew", url: "https://example.com", source: "mock", symbols: ["GME"] }] };

test("news uses the financial-news classifier, coalesces requests and keeps source fields", async () => {
  let calls = 0;
  const load = createNewsSentimentLoader({ loadNews: async () => news, enabled: true, loadClassifier: async () => async (text) => {
    calls++; assert.equal(text, news.items[0].title); return [{ label: "positive", score: 0.9 }];
  } });
  const [a, b] = await Promise.all([load("GME"), load("GME")]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  assert.equal(a.items[0].sentiment, "positive");
  assert.equal(a.sentimentModel, "Financial DistilRoBERTa");
  assert.equal(a.items[0].url, news.items[0].url);
  await load("GME");
  assert.equal(calls, 1);
});

test("disabled news sentiment does not load a model", async () => {
  const load = createNewsSentimentLoader({ loadNews: async () => news, enabled: false, loadClassifier: () => { throw new Error("must not load"); } });
  assert.deepEqual(await load("GME"), news);
});

test("inference errors preserve the headlines and report unavailable sentiment", async () => {
  for (const classifier of [async () => { throw new Error("private model path"); }, async () => [{ label: "wrong" }]]) {
    const load = createNewsSentimentLoader({ loadNews: async () => news, enabled: true, loadClassifier: async () => classifier });
    const result = await load("GME");
    assert.deepEqual(result.items, news.items);
    assert.equal(result.sentimentStatus, "error");
    assert.ok(!JSON.stringify(result).includes("private"));
  }
});


test("a transient failure retries the same snapshot and then caches success", async () => {
  let loads = 0;
  const load = createNewsSentimentLoader({ loadNews: async () => news, enabled: true, loadClassifier: async () => {
    loads++;
    return async () => { if (loads === 1) throw new Error("transient failure"); return [{ label: "positive" }]; };
  } });
  assert.equal((await load("GME")).sentimentStatus, "error");
  const [a, b] = await Promise.all([load("GME"), load("GME")]);
  assert.equal(a.sentimentStatus, "ready");
  assert.equal(b.items[0].sentiment, "positive");
  await load("GME");
  assert.equal(loads, 2);
});
