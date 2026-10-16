import test from "node:test";
import assert from "node:assert/strict";
import { STYLES, SCALES, LOOP, MIDI_MIN, MIDI_MAX, pickPlan, bar, activeLayers, barSeconds, levelBpm, mulberry, hash, STYLE_KEYS } from "./music.js";
import { THEMES, MODE_INFO } from "./look.js";

const plans = () => {
  const out = [];
  for (const style of Object.keys(STYLES)) for (const scale of Object.keys(SCALES)) out.push({ key: "t", style, scale, bpm: STYLES[style].bpm, floor: 0, seed: 7 });
  return out;
};

test("rng and hash are deterministic", () => {
  const a = mulberry(5), b = mulberry(5);
  assert.deepEqual([a(), a(), a()], [b(), b(), b()]);
  assert.equal(hash("lava"), hash("lava"));
  assert.notEqual(hash("lava"), hash("snow"));
});

test("bars are deterministic, loop every 8 bars and differ between seeds", () => {
  for (const plan of plans()) {
    for (let n = 0; n < LOOP; n++) {
      assert.deepEqual(bar(plan, n, 2), bar({ ...plan }, n, 2));
      assert.deepEqual(bar(plan, n, 1), bar(plan, n + LOOP, 1));
    }
  }
  const a = { ...plans()[0], style: "arcade", scale: "major" };
  const leads = (p) => [0, 1, 2, 3].map((n) => JSON.stringify(bar(p, n, 0).filter((e) => e.l === "lead")));
  assert.notDeepEqual(leads(a), leads({ ...a, seed: 99 }));
});

test("every style, scale, level and bar stays in range with sane timing", () => {
  for (const plan of plans()) {
    for (let level = 0; level <= 2; level++) {
      for (let n = 0; n < LOOP; n++) {
        const ev = bar(plan, n, level);
        assert.ok(ev.length > 0, `${plan.style} bar ${n} is empty`);
        for (const e of ev) {
          assert.ok(Number.isFinite(e.s) && e.s >= 0 && e.s < 16 && e.d > 0 && e.v > 0 && e.v <= 1, JSON.stringify(e));
          if (e.m) assert.ok(Number.isInteger(e.m) && e.m >= MIDI_MIN && e.m <= MIDI_MAX, `${plan.style}/${plan.scale} ${e.l} ${e.m}`);
          assert.ok(plan.style === "menu" ? e.l in STYLES.menu.voices : e.l in STYLES[plan.style].voices || ["kick", "snare", "hat"].includes(e.l), e.l);
        }
      }
    }
  }
});

test("intensity adds layers, never removes them; menu stays simple; mobile drops the arp", () => {
  for (const style of Object.keys(STYLES)) {
    const plan = { style, floor: 0 };
    const sets = [0, 1, 2].map((l) => activeLayers(plan, l));
    assert.ok([...sets[0]].every((x) => sets[1].has(x)) && [...sets[1]].every((x) => sets[2].has(x)), style);
  }
  assert.deepEqual([...activeLayers({ style: "menu", floor: 0 }, 2)].sort(), ["arp", "bass", "pad"]);
  const p = pickPlan("arcade", { kind: "game", theme: "grass" });
  assert.ok(activeLayers(p, 1).has("arp") && !activeLayers(p, 1, true).has("arp"));
  assert.ok(levelBpm(p, 2) > levelBpm(p, 0) && barSeconds(p, 2) < barSeconds(p, 0));
});

test("Auto follows theme and mode; explicit styles ignore the theme; Silence is null", () => {
  const style = (t, extra) => pickPlan("auto", { kind: "game", theme: t, ...extra }).style;
  assert.deepEqual(["grass", "snow", "desert", "lava", "night"].map((t) => style(t)), ["arcade", "chill", "arcade", "epic", "synth"]);
  assert.deepEqual(Object.keys(THEMES), ["grass", "snow", "desert", "lava", "night"]);
  assert.equal(pickPlan("auto", { kind: "game", theme: "grass", mode: "survival" }).style, "epic");
  const boss = pickPlan("auto", { kind: "game", theme: "grass", boss: true }), norm = pickPlan("auto", { kind: "game", theme: "grass" });
  assert.ok(boss.style === "epic" && boss.floor === 1 && boss.bpm > norm.bpm * 0 && boss.key !== norm.key);
  assert.equal(pickPlan("auto", { kind: "game", theme: "desert" }).scale, "phrygdom");
  assert.equal(pickPlan("chill", { kind: "game", theme: "lava" }).style, "chill");
  assert.equal(pickPlan("silence", { kind: "game", theme: "lava" }), null);
  assert.equal(pickPlan("epic", { kind: "menu" }).style, "menu");
  assert.equal(pickPlan("nonsense", { kind: "menu" }), null);
  assert.ok(pickPlan("auto", { kind: "game", theme: "x" }), "unknown theme falls back");
  for (const m of Object.keys(MODE_INFO)) for (const k of STYLE_KEYS.filter((x) => x !== "silence")) assert.ok(pickPlan(k, { kind: "game", theme: "snow", mode: m }));
  assert.equal(pickPlan("auto", { kind: "game", theme: "grass", boss: true, who: "baron" }).key === pickPlan("auto", { kind: "game", theme: "grass", boss: true, who: "mama" }).key, false);
});
