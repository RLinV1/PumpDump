import assert from "node:assert/strict";
import test from "node:test";
import { addTicker, parseWatchlist } from "../lib/watchlist.ts";

test("adding a ticker normalizes case and cashtags without changing existing stocks", () => {
  assert.deepEqual(addTicker(["GME"], " $nvda "), { ticker: "NVDA", tickers: ["GME", "NVDA"] });
});

test("invalid, duplicate and over-limit additions leave the watchlist unchanged", () => {
  assert.match(addTicker(["GME"], " gme ").error, /already/);
  for (const input of ["", "bad-symbol", "A1", "TOOLONG"]) assert.match(addTicker([], input).error, /ticker/);
  const full = Array.from({ length: 30 }, (_, i) => `A${String.fromCharCode(65 + Math.floor(i / 26))}${String.fromCharCode(65 + i % 26)}`);
  assert.match(addTicker(full, "NVDA").error, /30/);
});

test("saved watchlists restore an empty selection and reject corrupted browser data", () => {
  assert.deepEqual(parseWatchlist('["GME","NVDA"]'), ["GME", "NVDA"]);
  assert.deepEqual(parseWatchlist("[]"), []);
  for (const value of [null, "{broken", "{}", '["GME",5]', '["bad-symbol"]']) assert.equal(parseWatchlist(value), null);
  assert.deepEqual(parseWatchlist('["GME","GME"]'), ["GME"]);
});
