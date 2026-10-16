import test from "node:test";
import assert from "node:assert/strict";
import { createNav } from "./nav.js";

// A tiny browser: a stack of entries, async popstate on go(), and a "user Back" button.
function rig() {
  const log = [], backs = [];
  const h = { stack: [null], pos: 0 };
  let nav;
  const history = {
    pushState(s) { h.stack.length = h.pos + 1; h.stack.push(s); h.pos++; log.push("push"); },
    go(n) { log.push(`go${n}`); h.pos += n; queueMicrotask(() => nav.pop()); },
  };
  nav = createNav({ history, onBack: (k) => backs.push(k) });
  const userBack = () => { if (h.pos > 0) { h.pos--; nav.pop(); } };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { nav, log, backs, h, userBack, settle };
}

test("opening a screen pushes one entry and closing it goes back once, silently", async () => {
  const t = rig();
  t.nav.open("screen"); await t.settle();
  assert.deepEqual(t.log, ["push"]);
  t.nav.close("screen"); await t.settle();
  assert.deepEqual(t.log, ["push", "go-1"]);
  assert.deepEqual(t.backs, []);
  assert.equal(t.h.pos, 0);
});

test("user Back closes the top layer and reports it", async () => {
  const t = rig();
  t.nav.open("screen"); t.nav.open("help"); await t.settle();
  assert.deepEqual(t.log, ["push", "push"]);
  t.userBack(); assert.deepEqual(t.backs, ["help"]);
  t.userBack(); assert.deepEqual(t.backs, ["help", "screen"]);
  assert.equal(t.h.pos, 0);
});

test("close then open in the same tick leaves the history alone", async () => {
  const t = rig();
  t.nav.open("screen"); await t.settle();
  t.nav.close("screen"); t.nav.open("screen"); await t.settle();
  assert.deepEqual(t.log, ["push"]);
});

test("open then close in the same tick does nothing", async () => {
  const t = rig();
  t.nav.open("screen"); t.nav.close("screen"); await t.settle();
  assert.deepEqual(t.log, []);
});

test("closing two layers programmatically is one traversal", async () => {
  const t = rig();
  t.nav.open("screen"); t.nav.open("help"); await t.settle();
  t.nav.close("help"); t.nav.close("screen"); await t.settle();
  assert.deepEqual(t.log, ["push", "push", "go-2"]);
  assert.deepEqual(t.backs, []);
  assert.equal(t.h.pos, 0);
});

test("a layer re-opened from onBack (e.g. pausing instead of leaving) is pushed again", async () => {
  const t = rig();
  let again = true;
  const nav = createNav({ history: { pushState: () => t.log.push("push"), go: () => {} }, onBack: (k) => { if (again) { again = false; nav.open(k); } } });
  nav.open("screen"); await t.settle();
  nav.pop(); await t.settle();
  assert.deepEqual(t.log, ["push", "push"]);
});

test("a pop with nothing open (leaving the site) is ignored", () => {
  const t = rig();
  t.nav.pop();
  assert.deepEqual(t.backs, []);
});
