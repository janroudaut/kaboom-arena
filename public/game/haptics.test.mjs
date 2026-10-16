import test from "node:test";
import assert from "node:assert/strict";
import { createHaptics, effect, observe, browserVibrate, browserRumble, vibrationReport } from "./haptics.js";
import { newGame, step, placeBomb } from "./sim.js";

const ALL = { vibrate: true, rumble: true, intensity: "normal" };
function rig(set = ALL) {
  const calls = [];
  let t = 1000;
  const h = createHaptics({ vibrate: (p) => calls.push(["vib", p]), rumble: (pad, e) => calls.push(["rum", pad, e]), settings: () => set, now: () => t });
  return { h, calls, tick: (ms) => (t += ms) };
}

test("fire: phone and each targeted pad, nothing for others", () => {
  const { h, calls } = rig();
  h.fire("bomb", { phone: true, pads: ["pad1"] });
  assert.deepEqual(calls.map((c) => c[0]), ["vib", "rum"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][1], "pad1");
  calls.length = 0;
  h.fire("item", { phone: false, pads: [] });
  h.fire("item", null);
  assert.equal(calls.length, 0);
});

test("throttle: per kind and per target", () => {
  const { h, calls, tick } = rig();
  h.fire("die", { phone: true, pads: ["pad0"] });
  h.fire("die", { phone: true, pads: ["pad0", "pad1"] });
  assert.equal(calls.length, 3);
  tick(1600);
  h.fire("die", { phone: true, pads: [] });
  assert.equal(calls.length, 4);
  h.fire("bomb", { phone: true, pads: [] });
  assert.equal(calls.length, 5);
});

test("settings: off means no call, intensity scales", () => {
  const off = rig({ ...ALL, vibrate: false, rumble: false });
  off.h.fire("die", { phone: true, pads: ["pad0"] });
  assert.equal(off.calls.length, 0);
  const phoneOnly = rig({ ...ALL, rumble: false });
  phoneOnly.h.fire("die", { phone: true, pads: ["pad0"] });
  assert.deepEqual(phoneOnly.calls.map((c) => c[0]), ["vib"]);
  const lo = effect("curse", "low"), hi = effect("curse", "strong");
  assert.ok(lo.vib[0] < hi.vib[0] && lo.vib[1] === hi.vib[1]);
  assert.ok(lo.rum.duration < hi.rum.duration && hi.rum.weakMagnitude <= 1);
  assert.deepEqual(effect("bomb", "junk"), effect("bomb", "normal"));
});

test("backends never throw without APIs", () => {
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  assert.doesNotThrow(() => { browserVibrate([10]); browserRumble("pad0", { duration: 1, strongMagnitude: 1, weakMagnitude: 1 }); });
  const played = [], pulsed = [];
  const pads = [{ vibrationActuator: { playEffect: (...a) => (played.push(a), Promise.reject(new Error("x"))) } }, { hapticActuators: [{ pulse: (...a) => pulsed.push(a) }] }, null];
  Object.defineProperty(globalThis, "navigator", { value: { getGamepads: () => pads, vibrate: () => { throw new Error("no"); } }, configurable: true });
  try {
    const e = { duration: 100, strongMagnitude: 0.5, weakMagnitude: 0.2 };
    browserRumble("pad0", e);
    browserRumble("pad1", e);
    browserRumble("pad2", e);
    browserRumble("pad7", e);
    browserVibrate([5]);
    assert.deepEqual(played[0], ["dual-rumble", { startDelay: 0, ...e }]);
    assert.deepEqual(pulsed[0], [0.5, 100]);
  } finally {
    nav ? Object.defineProperty(globalThis, "navigator", nav) : delete globalThis.navigator;
  }
});

test("observe: bomb, item, curse, blast distance, death, win from successive states", () => {
  const s = newGame(2, 7, { layout: "open", softDensity: 0 });
  const mem = {};
  assert.deepEqual(observe(mem, s), []);
  const [p0, p1] = s.players;
  const kinds = (id) => observe(mem, s).filter((e) => e.id === id).map((e) => e.kind);

  placeBomb(s, p0);
  assert.deepEqual(kinds(0), ["bomb"]);
  s.items.push({ x: 1, y: 1, type: 0 });
  assert.deepEqual(kinds(0), []);
  s.items.length = 0;
  assert.deepEqual(kinds(0), ["item"]);
  p0.curse = { type: "slow", t: 100 };
  assert.deepEqual(kinds(0), ["curse"]);

  s.flames.push({ x: 3, y: 1, t: 30 });
  const near = observe(mem, s).find((e) => e.id === 0 && e.kind === "blast");
  s.flames.push({ x: 10, y: 10, t: 30 });
  assert.ok(near.scale > 0.4 && near.scale < 1);
  assert.deepEqual(kinds(0), []);
  assert.deepEqual(kinds(1), []);

  p1.alive = false;
  assert.deepEqual(kinds(1), ["die"]);
  s.done = true; s.winner = 0;
  assert.deepEqual(kinds(0), ["win"]);
  assert.deepEqual(kinds(0), []);
});

test("observe: new round (tick going back) emits nothing", () => {
  const a = newGame(2, 1);
  for (let i = 0; i < 5; i++) step(a, {});
  const mem = {};
  observe(mem, a);
  const b = newGame(2, 2);
  b.players[0].alive = false;
  assert.deepEqual(observe(mem, b), []);
});

test("phone pulses are never shorter than what Android motors can render, and the report explains each case", () => {
  for (const kind of ["bomb", "item", "blast", "curse", "die", "win", "test"]) {
    for (const level of ["low", "normal", "strong"]) {
      const { vib } = effect(kind, level);
      vib.forEach((v, i) => { if (i % 2 === 0) assert.ok(v >= 20, `${kind}/${level} pulse ${v}`); });
    }
  }
  const nav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });
  assert.match(vibrationReport(true), /no vibration support/);
  Object.defineProperty(globalThis, "navigator", { value: { vibrate: () => true }, configurable: true });
  assert.match(vibrationReport(null), /switched off/);
  assert.match(vibrationReport(true), /Sent/);
  assert.match(vibrationReport(false), /refused/);
  if (nav) Object.defineProperty(globalThis, "navigator", nav); else delete globalThis.navigator;
});
