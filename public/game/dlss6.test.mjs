import test from "node:test";
import assert from "node:assert/strict";
import { PANEL_FIELDS, PANEL_DEFAULTS, sanitizePanel, loadPanel, savePanel, bloomLabel, bloomStrength, valueText, fakeFps, fpsLine, statLine, toastText, TOASTS, halluVariant, bootState, BOOT_MS, BOOT_STAGES, createCadence, createGovernor, flareDots, FLARE_N, DISCLAIMER, CATCHPHRASE } from "./dlss6.js";

const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };

test("panel sanitize keeps valid values and falls back on junk", () => {
  assert.deepEqual(sanitizePanel(null), PANEL_DEFAULTS);
  assert.deepEqual(sanitizePanel({ rt: false, bloom: 3, faces: "yes", chroma: 1, lat: false }), { ...PANEL_DEFAULTS, rt: false, bloom: 3, lat: false });
  assert.equal(sanitizePanel({ bloom: 11 }).bloom, PANEL_DEFAULTS.bloom);
  assert.equal(sanitizePanel({ bloom: 2.5 }).bloom, PANEL_DEFAULTS.bloom);
  assert.equal(sanitizePanel({ __proto__: { rt: false }, extra: 1 }).extra, undefined);
});

test("panel persistence round trips and survives broken storage", () => {
  const mem = {};
  const st = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => { mem[k] = v; } };
  savePanel(st, { ...PANEL_DEFAULTS, rr: false });
  assert.equal(loadPanel(st).rr, false);
  mem.dlss6 = "{nope";
  assert.deepEqual(loadPanel(st), PANEL_DEFAULTS);
  assert.deepEqual(loadPanel({ getItem() { throw new Error("blocked"); } }), PANEL_DEFAULTS);
  savePanel({ setItem() { throw new Error("full"); } }, PANEL_DEFAULTS);
});

test("panel labels and strengths", () => {
  for (let v = 0; v <= 10; v++) assert.ok(bloomLabel(v));
  assert.equal(bloomStrength(PANEL_DEFAULTS.bloom), 0.6);
  assert.equal(valueText({ key: "lat" }, true), "-0 ms");
  assert.equal(valueText({ key: "rt" }, false), "OFF");
  assert.ok(PANEL_FIELDS.every((f) => f.label && f.key in PANEL_DEFAULTS));
});

test("fake numbers are exaggerated, finite and formatted", () => {
  assert.deepEqual(fakeFps(60), { native: 1, gen: 360 });
  assert.equal(fakeFps(0).native, 1);
  assert.equal(fakeFps(Infinity).gen, 0);
  assert.equal(fakeFps(5000).gen, 5994);
  assert.equal(fakeFps(NaN).gen, 0);
  assert.equal(fpsLine(60), "1 FPS native → 360 FPS generated");
  assert.equal(fpsLine(240), "5 FPS native → 1,440 FPS generated");
  assert.match(statLine(42, 1), /42%/);
  assert.match(statLine(7, 99), /7%/);
});

test("toasts fill their placeholders and the disclaimer wording is stable", () => {
  for (let i = 0; i < TOASTS.length; i++) {
    const t = toastText(() => (i + 0.5) / TOASTS.length, "Ann");
    assert.ok(!t.includes("{"), t);
  }
  assert.ok(TOASTS.includes(CATCHPHRASE));
  assert.equal(DISCLAIMER, "Parody. Not affiliated with NVIDIA.");
  assert.ok(["fingers", "studs"].includes(halluVariant(Math.random)));
  assert.equal(halluVariant(() => 0.1), "fingers");
  assert.equal(halluVariant(() => 0.9), "studs");
});

test("boot sequence is monotonic, stalls at 99% and ends inside 3 s", () => {
  assert.ok(BOOT_MS < 3000);
  let prev = -1, prevStage = -1;
  for (let ms = 0; ms <= BOOT_MS + 500; ms += 20) {
    const b = bootState(ms);
    assert.ok(b.pct >= prev && b.pct <= 1 && b.stage >= prevStage && b.stage < BOOT_STAGES.length);
    prev = b.pct; prevStage = b.stage;
  }
  assert.equal(bootState(0).pct, 0);
  assert.equal(bootState(BOOT_MS * 0.8).pct, 0.99);
  assert.equal(bootState(BOOT_MS).done, true);
  assert.equal(bootState(BOOT_MS - 1).done, false);
  assert.equal(bootState(-5).pct, 0);
});

test("cadence respects ranges and never fires two gags back to back", () => {
  const c = createCadence({ a: [10, 10], b: [10, 10] }, 6, () => 0.5);
  assert.equal(c.due("a", 4), false);
  assert.equal(c.due("a", 5), true);
  assert.equal(c.due("b", 6), false);
  assert.equal(c.due("b", 11), true);
  assert.equal(c.due("a", 16), false);
  assert.equal(c.due("a", 17), true);
  c.defer("a", 17, 10);
  assert.equal(c.due("a", 26), false);
  assert.equal(c.due("a", 27.5), true);
});

test("cadence randomness stays inside the range", () => {
  const c = createCadence({ x: [20, 40] }, 0, seq(0, 1));
  assert.equal(c.next.x, 10);
  assert.equal(c.due("x", 10), true);
  assert.equal(c.next.x, 10 + 40);
});

test("governor drops effects one level at a time, then recovers slowly", () => {
  const g = createGovernor();
  assert.equal(g.level, 3);
  assert.equal(g.update(60, 0.5), null);
  assert.equal(g.update(40, 0.5), "down");
  assert.equal(g.level, 2);
  let t = 0, ups = 0;
  while (t < 4.5) { t += 0.5; if (g.update(60, 0.5)) ups++; }
  assert.equal(ups, 0);
  assert.equal(g.update(60, 0.5), "up");
  assert.equal(g.level, 3);
  for (let i = 0; i < 3; i++) g.update(40, 0.5);
  assert.equal(g.level, 0);
  assert.equal(g.update(40, 0.5), null);
});

test("governor does not recover while the scale is still reduced, and backs off after flapping", () => {
  const g = createGovernor();
  g.update(40, 0.5);
  for (let i = 0; i < 10; i++) assert.equal(g.update(60, 0.5, false), null);
  assert.equal(g.level, 2);
  let n = 0;
  while (g.update(60, 0.5) !== "up") n++;
  assert.equal(g.update(40, 0.5), "down");
  let m = 0;
  while (g.update(60, 0.5) !== "up") m++;
  assert.ok(m > n);
});

test("flare dots: hot spot at the explosion, ghosts through the centre, fading out", () => {
  const out = new Float32Array(FLARE_N * 4);
  flareDots(out, 0.5, -0.4, 0);
  assert.equal(out[0], 0.5);
  assert.ok(Math.abs(out[1] + 0.4) < 1e-6);
  for (let i = 1; i < FLARE_N; i++) assert.ok(Math.abs(out[i * 4] * -0.4 - out[i * 4 + 1] * 0.5) < 1e-6);
  const a0 = out[3];
  flareDots(out, 0.5, -0.4, 0.5);
  assert.ok(out[3] < a0);
  flareDots(out, 0.5, -0.4, 1);
  for (let i = 0; i < FLARE_N; i++) assert.equal(out[i * 4 + 3], 0);
});
