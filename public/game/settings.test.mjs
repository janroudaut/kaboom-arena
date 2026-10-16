import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "./sim.js";
import { DEFAULTS, FIELDS, LAYOUTS, sanitize, roundOpts, reduced } from "./settings.js";
import { THEMES, themeOf, bombPos, curseText } from "./look.js";

test("sanitize: defaults, junk and prototype keys are rejected", () => {
  assert.deepEqual(sanitize(null), DEFAULTS);
  assert.deepEqual(sanitize({ bot: "hard", rounds: 3, layout: "maze", theme: "night", teams: true }), { ...DEFAULTS, bot: "hard", rounds: 3, layout: "maze", theme: "night", teams: true });
  assert.deepEqual(sanitize({ bot: "god", rounds: "3", layout: {}, theme: "__proto__", powerups: 1 }), DEFAULTS);
  for (const f of FIELDS) assert.ok(f.opts.some(([v]) => v === DEFAULTS[f.key]), f.key);
});

test("roundOpts: teams only with 4 players, random layout/theme come from the tables", () => {
  const set = { ...DEFAULTS, teams: true, layout: "random", theme: "auto", sudden: false, ff: false };
  assert.deepEqual(roundOpts(set, 4, () => 0).opts.teams, [0, 1, 0, 1]);
  assert.equal(roundOpts(set, 3).opts.teams, null);
  for (let i = 0; i < 20; i++) {
    const { opts, theme } = roundOpts(set, 4);
    assert.ok(LAYOUTS.includes(opts.layout) && theme in THEMES);
    const s = newGame(4, i + 1, opts);
    assert.equal(s.cfg.layout, opts.layout);
    assert.deepEqual([s.cfg.suddenDeath, s.cfg.friendlyFire], [false, false]);
  }
});

test("look: unknown theme falls back to grass; sliding bombs interpolate and stop at walls", () => {
  assert.equal(themeOf({ theme: "constructor" }).key, "grass");
  assert.equal(themeOf(undefined).key, "grass");
  const grid = new Array(195).fill(0);
  assert.deepEqual(bombPos({ x: 3, y: 3, dx: 1, dy: 0, sc: 3 }, grid), [3.5, 3]);
  grid[3 * 15 + 4] = 1;
  assert.deepEqual(bombPos({ x: 3, y: 3, dx: 1, dy: 0, sc: 5 }, grid), [3, 3]);
  assert.equal(curseText({ curse: { type: "weird", t: 61 } }), "CURSED 2s");
});

test("accessibility settings: defaults, validation, reduce follows the system only on auto", () => {
  assert.deepEqual([DEFAULTS.cb, DEFAULTS.reduce, DEFAULTS.vibrate, DEFAULTS.rumble, DEFAULTS.intensity], [false, "auto", true, true, "normal"]);
  assert.deepEqual(sanitize({ cb: true, reduce: false, vibrate: false, rumble: false, intensity: "strong" }), { ...DEFAULTS, cb: true, reduce: false, vibrate: false, rumble: false, intensity: "strong" });
  assert.deepEqual(sanitize({ cb: "yes", reduce: "maybe", vibrate: 0, rumble: null, intensity: "max" }), DEFAULTS);
  assert.equal(reduced({ reduce: "auto" }, true), true);
  assert.equal(reduced({ reduce: "auto" }, false), false);
  assert.equal(reduced({ reduce: false }, true), false);
  assert.equal(reduced({ reduce: true }, false), true);
});
