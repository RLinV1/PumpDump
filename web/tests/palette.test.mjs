import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCommand } from "../lib/commands.ts";
import { fuzzy, paletteItems } from "../lib/palette.ts";

const known = [
  { ticker: "GME", onList: true, badge: "72 Pump likely" },
  { ticker: "AMC", onList: true },
  { ticker: "GMED", onList: false },
  { ticker: "AAPL", onList: false },
];

test("fuzzy ranks prefix before word start before substring before scattered letters", () => {
  const score = (q, t) => fuzzy(q, t)?.score;
  assert.ok(score("ga", "gamma") < score("ma", "go-market"));
  assert.ok(score("ma", "go market") < score("ar", "go market"));
  assert.ok(score("ar", "go market") < score("gmt", "go market"));
  assert.equal(fuzzy("zz", "go market"), null);
  assert.deepEqual(fuzzy("fla", "Flag chat").indexes, [0, 1, 2]);
  assert.deepEqual(fuzzy("fc", "flag chat").indexes, [0, 5]);
});

test("palette groups tickers, commands and an ask row, best match first", () => {
  const items = paletteItems("gm", known);
  assert.deepEqual(items.filter((i) => i.group === "tickers").map((i) => i.label), ["GME", "GMED"]);
  assert.equal(items.find((i) => i.label === "GME").badge, "72 Pump likely");
  assert.deepEqual(items.find((i) => i.label === "GME").indexes, [0, 1]);
  assert.equal(items.at(-1).group, "ask");
  assert.equal(items.at(-1).run, "ASK gm");
  assert.deepEqual(paletteItems("   ", known), []);
});

test("an unknown symbol can still be selected, and commands offer only real actions", () => {
  const items = paletteItems("xyz", known);
  assert.ok(items.some((i) => i.group === "tickers" && i.label === "XYZ" && i.run === "SEL XYZ"));
  assert.ok(items.some((i) => i.run === "LOOK XYZ"));
  assert.ok(items.some((i) => i.run === "ADD XYZ"));
  assert.ok(!paletteItems("gme", known).some((i) => i.run === "ADD GME"));
  const commands = paletteItems("flag", known).filter((i) => i.group === "commands");
  assert.ok(commands.some((i) => i.run === "ASK" && i.label === "Ask about a flag"));
  assert.ok(!paletteItems("pt", known).some((i) => i.run === "PT" || /paper/i.test(i.label)));
});

test("every palette action is a command the parser accepts, and the ask row opens the assistant", () => {
  for (const q of ["gme", "chart", "flag", "assistant", "mode", "refresh", "help", "sent", "ask is gme pumped"]) {
    for (const item of paletteItems(q, known)) assert.notEqual(parseCommand(item.run).type, "error", `${q} -> ${item.run}`);
  }
  assert.deepEqual(parseCommand(paletteItems("ask is gme pumped", known).at(-1).run), { type: "ask", question: "is gme pumped" });
});
