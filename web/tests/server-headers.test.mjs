import assert from "node:assert/strict";
import { test } from "node:test";
import { sanitizeForwardingHeaders } from "../server-headers.mjs";
import * as routing from "../server-headers.mjs";

test("a caller cannot forge its address through the web proxy", () => {
  const request = { headers: { host: "pumpwatch.example", forwarded: "for=198.51.100.99", "x-forwarded-for": "198.51.100.99", "x-forwarded-proto": "https", "x-forwarded-host": "evil.example", "x-real-ip": "198.51.100.99" }, socket: { remoteAddress: "203.0.113.7" } };
  sanitizeForwardingHeaders(request);
  assert.equal(request.headers["x-forwarded-for"], "203.0.113.7");
  assert.equal(request.headers["x-forwarded-host"], "pumpwatch.example");
  assert.equal(request.headers["x-forwarded-proto"], "http");
  assert.equal(request.headers.forwarded, undefined);
  assert.equal(request.headers["x-real-ip"], undefined);
});

test("different socket clients retain distinct addresses and unrelated headers", () => {
  for (const address of ["203.0.113.7", "203.0.113.8"]) {
    const request = { headers: { host: "pumpwatch.example", accept: "text/event-stream" }, socket: { remoteAddress: address, encrypted: true } };
    sanitizeForwardingHeaders(request);
    assert.equal(request.headers["x-forwarded-for"], address);
    assert.equal(request.headers["x-forwarded-proto"], "https");
    assert.equal(request.headers.accept, "text/event-stream");
  }
});

test("normalized API paths cannot bypass the mock-mode boundary", () => {
  for (const target of ["/api", "/api/v1/watchlist", "/x/../api/v1/watchlist", "/x/%2e%2e/api/v1/watchlist", "http:/localhost:3000/api/v1/watchlist"])
    assert.equal(routing.isApiRequest(target), true, target);
  assert.equal(routing.isApiRequest("/live"), false);
});
