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
  for (const input of ["FOO BAR", "10", "GME1", "TOOLONG", "../etc"]) {
    const result = parseCommand(input);
    assert.equal(result.type, "error", input);
    assert.match(result.message, /UNKNOWN COMMAND/);
    assert.match(result.message, /HELP/);
  }
  assert.ok(parseCommand("X".repeat(80) + "1").message.length < 80);
});

test("LOOK and DES look a ticker up; alone they open the lookup panel", () => {
  for (const input of ["LOOK gme", "des $gme", "look GME <GO>"]) assert.deepEqual(parseCommand(input), { type: "look", ticker: "GME" }, input);
  for (const input of ["LOOK", "des", "7", "LOOKUP"]) assert.deepEqual(parseCommand(input), { type: "panel", panel: "lookup" }, input);
  assert.equal(parseCommand("LOOK TOOLONG").type, "error");
  assert.equal(parseCommand("LOOK 12").type, "error");
});

test("retired order and account commands are plain errors", () => {
  for (const input of ["buy gme 10", "SELL AMC 2", "PT", "PT RESET"]) assert.notEqual(parseCommand(input).type, "trade", input);
  assert.equal(parseCommand("BUY GME 10").type, "error");
  assert.equal(parseCommand("PT RESET").type, "error");
  assert.deepEqual(parseCommand("SEL BUY"), { type: "select", ticker: "BUY" });
});

test("ASK sends the question with its own case, a bare ASK opens the chat widget, long questions are refused", () => {
  assert.deepEqual(parseCommand("ask Is GME being pumped? <GO>"), { type: "ask", question: "Is GME being pumped?" });
  assert.deepEqual(parseCommand("ASK  what   is a P/E ratio"), { type: "ask", question: "what is a P/E ratio" });
  for (const input of ["ASK", "ask <GO>", "AI", "assistant"]) assert.deepEqual(parseCommand(input), { type: "assistant" }, input);
  assert.equal(parseCommand("9").type, "error");
  assert.deepEqual(parseCommand("mode"), { type: "mode" });
  assert.equal(parseCommand(`ASK ${"x".repeat(301)}`).type, "error");
});
