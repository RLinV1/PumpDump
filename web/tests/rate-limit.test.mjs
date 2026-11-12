import assert from "node:assert/strict";
import { test } from "node:test";
import { clientKey, createRateLimiter } from "../rate-limit.mjs";

test("IPv6 clients group by /64, IPv4-mapped counts as IPv4, compressed forms expand", () => {
  assert.equal(clientKey("2001:db8:1:2:aaaa:bbbb:cccc:dddd"), clientKey("2001:db8:1:2::1"));
  assert.notEqual(clientKey("2001:db8:1:2::1"), clientKey("2001:db8:1:3::1"));
  assert.equal(clientKey("::ffff:1.2.3.4"), "1.2.3.4");
  assert.equal(clientKey("1.2.3.4"), "1.2.3.4");
  assert.equal(clientKey("::1"), "0000:0000:0000:0000::/64");
  assert.equal(clientKey("2001:db8::5"), "2001:0db8:0000:0000::/64");
  assert.equal(clientKey(undefined), "unknown");
});

test("clients in one /64 share a budget, other /64s and IPv4 do not", () => {
  const allowed = createRateLimiter({ perClient: 2, all: 100, now: () => 0 });
  assert.equal(allowed("2001:db8:1:2::1"), true);
  assert.equal(allowed("2001:db8:1:2:ffff::9"), true);
  assert.equal(allowed("2001:db8:1:2::3"), false);
  assert.equal(allowed("2001:db8:1:3::1"), true);
  assert.equal(allowed("1.2.3.4"), true);
  assert.equal(allowed("::ffff:1.2.3.4"), true);
  assert.equal(allowed("1.2.3.4"), false);
});

test("blocked requests add no entries and expired clients are pruned", () => {
  let t = 0;
  const allowed = createRateLimiter({ perClient: 1, all: 2, now: () => t });
  assert.equal(allowed("1.1.1.1"), true);
  assert.equal(allowed("1.1.1.2"), true);
  for (let i = 0; i < 1000; i++) assert.equal(allowed(`9.9.${i >> 8}.${i & 255}`), false);
  assert.equal(allowed.size(), 2);
  t = 61_000;
  assert.equal(allowed("1.1.1.3"), true);
  assert.equal(allowed.size(), 1);
});
