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

test("behind the trusted proxy the client address survives, and only the proxy's entry counts", () => {
  const request = { headers: { host: "pumpwatch.example", "x-forwarded-for": "198.51.100.99, 203.0.113.7" }, socket: { remoteAddress: "172.18.0.5" } };
  sanitizeForwardingHeaders(request, true);
  assert.equal(request.headers["x-forwarded-for"], "203.0.113.7");
  const direct = { headers: { host: "pumpwatch.example" }, socket: { remoteAddress: "172.18.0.5" } };
  sanitizeForwardingHeaders(direct, true);
  assert.equal(direct.headers["x-forwarded-for"], "172.18.0.5");
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

test("API paths match case-insensitively like Next's proxy rule, and reach the doors in lowercase", () => {
  for (const target of ["/API/v1/flags", "/Api/v1/flags?x=1", "/aPi", "http://web.test/API/v1/flags"]) assert.equal(routing.isApiRequest(target), true, target);
  for (const target of ["/apix/v1", "/v1/api", "/"]) assert.equal(routing.isApiRequest(target), false, target);
  assert.equal(routing.canonicalApiUrl("/API/V1/Flags?A=1"), "/api/V1/Flags?A=1");
  assert.equal(routing.canonicalApiUrl("http://web.test/Api/v1/flags"), "http://web.test/api/v1/flags");
  assert.equal(routing.canonicalApiUrl("/other/API"), "/other/API");
});

test("every web response carries the baseline security headers", () => {
  const set = {};
  routing.applySecurityHeaders({ setHeader: (name, value) => { set[name] = value; } });
  assert.equal(set["X-Content-Type-Options"], "nosniff");
  assert.match(set["Content-Security-Policy"], /frame-ancestors 'none'/);
  assert.ok(set["Referrer-Policy"] && set["Permissions-Policy"]);
});
