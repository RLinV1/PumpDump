import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand } from "../lib/commands.ts";

test("a ticker selects it, with or without $, case or a trailing GO", () => {
  for (const input of ["gme", "GME", " $gme ", "GME <GO>", "gme go", "GME GO"]) {
    assert.deepEqual(parseCommand(input), { type: "select", ticker: "GME" }, input);
  }
});

test("mnemonics and panel numbers jump to panels", () => {
  const cases = { WL: "watchlist", wl: "watchlist", "1": "watchlist", GR: "chart", "2": "chart", FLAG: "flags", NEWS: "news", SENT: "sentiment", MOV: "movers", "6": "movers", "NEWS <GO>": "news" };
  for (const [input, panel] of Object.entries(cases)) assert.deepEqual(parseCommand(input), { type: "panel", panel }, input);
});

test("help, refresh and empty input", () => {
  assert.deepEqual(parseCommand("HELP"), { type: "help" });
  assert.deepEqual(parseCommand("?"), { type: "help" });
  assert.deepEqual(parseCommand("refresh"), { type: "refresh" });
  assert.deepEqual(parseCommand("   "), { type: "empty" });
  assert.deepEqual(parseCommand("GO"), { type: "empty" });
});

test("add, remove and explicit select take a ticker", () => {
  assert.deepEqual(parseCommand("add amc"), { type: "add", ticker: "AMC" });
  assert.deepEqual(parseCommand("RM $AMC"), { type: "remove", ticker: "AMC" });
  assert.deepEqual(parseCommand("SEL FLAG"), { type: "select", ticker: "FLAG" });
  assert.equal(parseCommand("ADD 12").type, "error");
  assert.equal(parseCommand("ADD TOOLONG").type, "error");
  assert.deepEqual(parseCommand("ADDX"), { type: "select", ticker: "ADDX" });
});

test("anything else is a clear inline error", () => {
  for (const input of ["FOO BAR", "7", "GME1", "TOOLONG", "../etc"]) {
    const result = parseCommand(input);
    assert.equal(result.type, "error", input);
    assert.match(result.message, /UNKNOWN COMMAND/);
    assert.match(result.message, /HELP/);
  }
  assert.ok(parseCommand("X".repeat(80) + "1").message.length < 80);
});
