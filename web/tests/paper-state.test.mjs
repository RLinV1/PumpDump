import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = ts.transpileModule(readFileSync(new URL("../components/trade-panels.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022 },
}).outputText;
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const empty = { cashCents: 100000, positions: [], orders: [], dataMode: "mock" };
const bought = { ...empty, cashCents: 90000, positions: [{ ticker: "GME", qty: 1 }], orders: [{ id: 1 }] };
const flush = () => new Promise(setImmediate);

// Execute the real hook with controlled requests; no DOM or scheduler timing is needed for response ordering.
function mount(api) {
  const states = [];
  const hooks = {
    useState(initial) {
      const index = states.push(initial) - 1;
      return [initial, (value) => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
    },
    useRef: (current) => ({ current }),
    useCallback: (callback) => callback,
    useEffect: (effect) => effect(),
  };
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)((name) => name === "react" ? hooks : name === "@/lib/api" ? api : name.startsWith("@/") ? {} : require(name), loaded, loaded.exports);
  return { hook: loaded.exports.usePaper(), state: () => states[0] };
}

test("a delayed account read cannot replace a successful trade or reset", async () => {
  for (const action of ["trade", "reset"]) {
    const read = deferred();
    const expected = action === "trade" ? bought : empty;
    const app = mount({ getPaperAccount: () => read.promise, placePaperOrder: async () => ({ data: bought }), resetPaperAccount: async () => ({ data: empty }) });
    await app.hook[action]("BUY", "GME", 1);
    assert.deepEqual(app.state().account, expected);
    read.resolve({ data: action === "trade" ? empty : bought });
    await flush();
    assert.deepEqual(app.state().account, expected, `${action} must invalidate older account reads`);
  }
});

test("older successful and failed refreshes cannot replace a newer result", async () => {
  for (const fail of [false, true]) {
    const first = deferred();
    let reads = 0;
    const app = mount({ getPaperAccount: () => ++reads === 1 ? first.promise : Promise.reject(new Error("newest read failed")) });
    await app.hook.refresh();
    if (fail) first.reject(new Error("older read failed"));
    else first.resolve({ data: empty });
    await flush();
    assert.deepEqual(app.state(), { status: "error", message: "newest read failed" });
  }
});

test("a failed mutation still allows the pending initial read to finish loading", async () => {
  for (const action of ["trade", "reset"]) {
    const read = deferred();
    const fail = async () => { throw new Error("service unavailable"); };
    const app = mount({ getPaperAccount: () => read.promise, placePaperOrder: fail, resetPaperAccount: fail });
    assert.equal((await app.hook[action]("BUY", "GME", 1)).ok, false);
    read.resolve({ data: empty });
    await flush();
    assert.deepEqual(app.state(), { status: "done", account: empty });
  }
});

test("refresh and reset cannot race an in-flight trade", async () => {
  const order = deferred();
  let reads = 0, resets = 0;
  const app = mount({
    getPaperAccount: async () => { reads++; return { data: empty }; },
    placePaperOrder: () => order.promise,
    resetPaperAccount: async () => { resets++; return { data: empty }; },
  });
  await flush();
  const pending = app.hook.trade("BUY", "GME", 1);
  await app.hook.refresh();
  assert.equal((await app.hook.reset()).ok, false);
  assert.equal(reads, 1);
  assert.equal(resets, 0);
  order.resolve({ data: bought });
  await pending;
  assert.deepEqual(app.state().account, bought);
});
