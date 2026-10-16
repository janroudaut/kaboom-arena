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

test("game feel settings: on by default, validated, listed in their own group", () => {
  assert.deepEqual([DEFAULTS.announcer, DEFAULTS.slowmo, DEFAULTS.recap], [true, true, true]);
  assert.deepEqual(sanitize({ announcer: false, slowmo: false, recap: false }), { ...DEFAULTS, announcer: false, slowmo: false, recap: false });
  assert.deepEqual(sanitize({ announcer: "off", slowmo: 0, recap: null }), DEFAULTS);
  assert.deepEqual(FIELDS.filter((f) => f.feel).map((f) => f.key), ["announcer", "slowmo", "recap", "emotes"]);
});

test("extras settings: mode, tiles and chaos are validated and reach newGame", () => {
  assert.deepEqual([DEFAULTS.mode, DEFAULTS.tiles, DEFAULTS.chaos], ["classic", "off", false]);
  assert.deepEqual(sanitize({ mode: "survival", tiles: "many", chaos: true }), { ...DEFAULTS, mode: "survival", tiles: "many", chaos: true });
  assert.deepEqual(sanitize({ mode: "__proto__", tiles: "lots", chaos: "yes" }), DEFAULTS);
  assert.deepEqual(FIELDS.find((f) => f.key === "mode").opts.map(([v]) => v), ["classic", "hill", "potato", "survival"]);
  const plain = newGame(4, 3, roundOpts(DEFAULTS, 4).opts);
  assert.deepEqual(plain, newGame(4, 3, roundOpts(DEFAULTS, 4, () => 0).opts));
  assert.equal(plain.floor, undefined);
  const hill = newGame(2, 3, roundOpts({ ...DEFAULTS, mode: "hill", tiles: "few", chaos: true, sudden: true }, 2).opts);
  assert.ok(hill.hill && hill.floor && hill.event === null);
  assert.equal(hill.cfg.suddenDeath, false);
  const surv = newGame(2, 3, roundOpts({ ...DEFAULTS, mode: "survival", ff: true }, 2).opts);
  assert.deepEqual([surv.cfg.friendlyFire, surv.players.length], [false, 14]);
});

test("sound settings: defaults, validation, grouped in the Sound section", () => {
  assert.deepEqual([DEFAULTS.sfx, DEFAULTS.music, DEFAULTS.volume, DEFAULTS.voice], [true, "silence", "normal", false]);
  assert.deepEqual(sanitize({ sfx: false, music: "synth", volume: "high", voice: true }), { ...DEFAULTS, sfx: false, music: "synth", volume: "high", voice: true });
  assert.deepEqual(sanitize({ sfx: "no", music: "polka", volume: 11, voice: 1 }), DEFAULTS);
  assert.deepEqual(FIELDS.filter((f) => f.sound).map((f) => f.key), ["sfx", "music", "volume", "voice"]);
});
