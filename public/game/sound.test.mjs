import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, placeBomb, ICE, SPIKE, spikeIn, TELE } from "./sim.js";
import { SFX_INFO, claim, createSoundObserver, createSound, outcome, matchResult, intensityOf, blipPitch, volumeOf, VOICES } from "./sound.js";
import { RECIPES } from "./audio.js";
import { DEFAULTS } from "./settings.js";

const IDLE = { dx: 0, dy: 0, bomb: false };
const ctx = { me: 0, human: (i) => i === 0 };
function watch() {
  const o = createSoundObserver(), seen = [];
  const run = (s) => { const n = seen.length; o.observe(s, (name, x, v) => seen.push({ name, x, v }), ctx); return seen.slice(n).map((e) => e.name); };
  return { run, seen, o };
}
const clone = (s) => structuredClone(s);

test("every sound has a recipe and every recipe a priority", () => {
  assert.deepEqual(Object.keys(SFX_INFO).sort(), Object.keys(RECIPES).sort());
  for (const [p, g] of Object.values(SFX_INFO)) assert.ok(p >= 0 && p <= 9 && g >= 0);
});

test("voice limiter: fills up, steals the lowest priority, drops weaker sounds", () => {
  const live = [];
  for (let i = 0; i < VOICES; i++) { assert.equal(claim(live, 5, 0), -1); live.push({ end: 10 + i, prio: i === 3 ? 2 : 5 }); }
  assert.equal(claim(live, 4, 0), 3);
  assert.equal(claim(live, 1, 0), -2);
  live[3].prio = 5;
  assert.equal(claim(live, 5, 0), 0, "ties steal the oldest");
  assert.equal(claim(live, 5, 100), -1, "expired voices are pruned");
  assert.equal(live.length, 0);
});

test("a real bomb: place, fuse ticks, boom, wall and death are heard once each", () => {
  const s = newGame(2, 3, { softDensity: 1 }), { run, seen } = watch();
  assert.deepEqual(run(s), ["start"]);
  s.grid[15 + 3] = 2;
  placeBomb(s, s.players[0]);
  const names = [];
  for (let i = 0; i < 260; i++) { step(s, { 0: IDLE, 1: IDLE }); names.push(...run(s)); }
  for (const k of ["bomb", "fuse", "boom", "wall", "die", "lose"]) assert.ok(names.includes(k), `${k} in ${names.join()}`);
  assert.equal(names.filter((n) => n === "boom").length, 1);
  assert.ok(names.filter((n) => n === "fuse").length <= 3);
  assert.ok(seen.every((e) => Number.isFinite(e.v) && e.v >= 0 && e.v <= 1 && Number.isFinite(e.x)));
  assert.equal(seen.find((e) => e.name === "lose").x, -1);
});

test("start jingle fires on a new round, not when joining mid-round", () => {
  const { run } = watch(), s = newGame(2, 1);
  s.tick = 500;
  assert.deepEqual(run(s), []);
  s.tick = 0;
  assert.deepEqual(run(s), ["start"]);
});

test("pickups are distinct per kind and louder for the local player", () => {
  const { run, seen } = watch(), s = newGame(2, 1);
  s.tick = 100;
  run(s);
  for (let type = 0; type < 8; type++) {
    const a = clone(s);
    a.tick = 101;
    a.items.push({ x: 1, y: 1, type });
    run(a);
    const b = clone(a);
    b.tick = 102;
    b.items = [];
    assert.deepEqual(run(b), [`pick${type}`]);
    run(s);
  }
  assert.equal(seen.filter((e) => e.name === "pick0").at(-1).v, 1);
});

test("extras: teleport, ice, spikes, chaos, hill, potato, survival, sudden death", () => {
  let s = newGame(2, 5, { tiles: "many", chaos: true });
  const w = watch(), run = (x) => w.run(x).filter((n) => !n.startsWith("spike") || n === "spikeup" && x.mark);
  s.tick = 200;
  run(s);
  const f = clone(s);
  f.tick = 201;
  f.players[1].tpc = 60;
  assert.deepEqual(run(f), ["tp"]);
  const arm = clone(f);
  arm.tick = 202;
  arm.players[0].tp = 1;
  assert.deepEqual(run(arm), ["tparm"]);
  const ice = clone(arm), tile = s.floor.indexOf(ICE);
  ice.tick = 203;
  ice.players[0].x = (tile % 15) * 16 + 8; ice.players[0].y = Math.floor(tile / 15) * 16 + 8;
  assert.ok(run(ice).includes("ice"));
  const i = s.floor.indexOf(SPIKE);
  let t = 200;
  while (spikeIn({ tick: t }, i) !== 0) t++;
  const down = clone(ice), up = clone(ice);
  down.tick = t - 1; up.tick = t; up.mark = true;
  run(down);
  assert.ok(run(up).includes("spikeup"));
  const later = clone(up);
  later.tick = t + 40; later.mark = false;
  assert.ok(w.run(later).includes("spikedn"));

  const ev = clone(later);
  ev.tick += 1; ev.event = { type: "bombrain", t: 90, tiles: [] };
  assert.deepEqual(run(ev), ["ev0"]);
  const fire = clone(ev);
  fire.tick += 1; fire.event = { type: "bombrain", t: 1, tiles: [] };
  run(fire);
  const gone = clone(fire);
  gone.tick += 1; gone.event = null;
  assert.deepEqual(run(gone), ["drop"]);
  const q = clone(gone); q.tick += 1; q.event = { type: "quake", t: 2, tiles: [] }; run(q);
  const q2 = clone(q); q2.tick += 1; q2.event = null;
  assert.deepEqual(run(q2), ["quake"]);
  const fr = clone(q2); fr.tick += 1; fr.event = { type: "frenzy", t: 1 }; run(fr);
  const fr2 = clone(fr); fr2.tick += 1; fr2.event = { type: "frenzy", t: 0, on: 600 };
  assert.deepEqual(run(fr2), ["frenzy"]);

  const sd = clone(fr2); sd.tick += 1; sd.event = null; sd.sd = 1;
  assert.ok(run(sd).includes("sudden"));
});

test("hill, potato (accelerating fuse beeps), survival", () => {
  const h = newGame(3, 2, { mode: "hill" }), w = watch();
  h.tick = 10; w.run(h);
  const h2 = clone(h); h2.tick = 11; h2.hill.score[1]++;
  assert.deepEqual(w.run(h2), ["hillpt"]);
  const h3 = clone(h2); h3.tick = 12; h3.hill.x += 2;
  assert.deepEqual(w.run(h3), ["hillmove"]);

  const p = newGame(3, 2, { mode: "potato" }), wp = watch();
  p.tick = 10; p.potato.t = 600; wp.run(p);
  const beeps = [];
  for (let t = 599; t > 0; t--) {
    p.tick++; p.potato.t = t;
    if (wp.run(p).includes("potbeep")) beeps.push(t);
  }
  const gaps = beeps.map((b, i) => (i ? beeps[i - 1] - b : 0)).slice(1);
  assert.ok(beeps.length >= 10 && gaps[0] > gaps.at(-1) && gaps.at(-1) <= 8, gaps.join());
  const q = clone(p); q.tick++; q.potato.holder = (q.potato.holder + 1) % 3; q.potato.t = 599;
  assert.ok(wp.run(q).includes("pass"));

  const sv = newGame(1, 2, { mode: "survival" }), ws = watch();
  sv.tick = 10; ws.run(sv);
  const s2 = clone(sv); s2.tick = 11; s2.survival.wave = 1;
  assert.deepEqual(ws.run(s2), ["wave"]);
  const dormant = clone(s2); dormant.tick = 12; dormant.players[5].alive = true; dormant.players[5].dormant = false; dormant.players[5].shield = 120;
  assert.deepEqual(ws.run(dormant), []);
  dormant.tick = 13; dormant.players[5].alive = false;
  assert.deepEqual(ws.run(dormant), ["pop"]);
});

test("kick: a resting bomb that starts sliding is heard", () => {
  const s = newGame(2, 1), w = watch();
  s.tick = 50; s.bombs.push({ x: 5, y: 5, owner: 0, t: 100, range: 2, pass: [] });
  w.run(s);
  const k = clone(s); k.tick = 51; k.bombs[0].dx = 1; k.bombs[0].sc = 0;
  assert.deepEqual(w.run(k), ["kick"]);
});

test("round and match outcomes follow the local human, teams and survival", () => {
  const s = newGame(4, 1, { teams: [0, 1, 0, 1] });
  s.winner = 2; s.winnerTeam = 0;
  assert.equal(outcome(s, (i) => i === 0), "win");
  assert.equal(outcome(s, (i) => i === 1), "lose");
  s.winner = -1; s.winnerTeam = -1;
  assert.equal(outcome(s, () => true), "draw");
  const v = newGame(1, 1, { mode: "survival" });
  assert.equal(outcome(v, () => true), "lose");
  const g = { s: newGame(2, 1), scores: [1, 2], win: 2 };
  assert.equal(matchResult(g, (i) => i === 1), "matchwin");
  assert.equal(matchResult(g, (i) => i === 0), "matchlose");
  assert.equal(matchResult({ ...g, scores: [1, 1] }, () => true), null);
  assert.equal(matchResult({ ...g, scores: [0, 0], win: 0 }, () => true), null);
});

test("round end stinger comes from state only (works for guests)", () => {
  const s = newGame(2, 1), w = watch();
  s.tick = 80; w.run(s);
  const e = clone(s); e.tick = 81; e.end = 120; e.winner = 0;
  assert.deepEqual(w.run(e), ["win"]);
  const l = clone(e); l.tick = 82; l.end = -1; w.run(l);
  const l2 = clone(l); l2.tick = 83; l2.end = 120; l2.winner = 1;
  assert.deepEqual(w.run(l2), ["lose"]);
});

test("intensity: calm, few players left, sudden death, survival waves", () => {
  const s = newGame(4, 1);
  assert.equal(intensityOf(s), 0);
  s.players[2].alive = s.players[3].alive = false;
  assert.equal(intensityOf(s), 1);
  s.sd = 5;
  assert.equal(intensityOf(s), 2);
  const v = newGame(1, 1, { mode: "survival" });
  assert.equal(intensityOf(v), 0);
  v.survival.wave = 3;
  assert.equal(intensityOf(v), 1);
});

test("blip pitch is stable per speaker and in a sane range", () => {
  assert.equal(blipPitch("baron"), blipPitch("baron"));
  for (const id of ["baron", "mama", "tony", "narrator", "dolores"]) assert.ok(blipPitch(id) >= 0.8 && blipPitch(id) <= 1.9);
  assert.ok(volumeOf("low") < volumeOf("normal") && volumeOf("normal") < volumeOf("high") && volumeOf("x") === volumeOf("normal"));
});

function rig(over = {}) {
  const set = { ...DEFAULTS, ...over }, calls = [], timers = [];
  const eng = {
    music: { start: (p) => calls.push(["start", p.style]), stop: () => calls.push(["stop"]), level: (l) => calls.push(["level", l]) },
    play: (n) => calls.push(["play", n]), duck: () => {}, setVolume: () => {}, state: () => "running",
    resume: () => calls.push(["resume"]), suspend: () => calls.push(["suspend"]),
  };
  let made = 0, t = 0;
  const said = [];
  const snd = createSound({
    settings: () => set, makeEngine: () => (made++, eng), speech: { speak: (x) => said.push(x), cancel: () => said.push("cancel") },
    now: () => t, later: (f, ms) => timers.push([f, ms]), clear: () => {},
  });
  return { snd, set, calls, timers, said, made: () => made, clock: (v) => (t = v) };
}

test("controller: nothing is created before a gesture, with sound off, or while muted", () => {
  const r = rig();
  r.snd.setScene({ kind: "menu" });
  r.snd.feed({ s: newGame(2, 1) });
  assert.equal(r.made(), 0);
  r.snd.gesture();
  assert.equal(r.made(), 1);

  const off = rig({ sfx: false, music: "silence" });
  off.snd.gesture(); off.snd.setScene({ kind: "game", theme: "grass" });
  off.snd.feed({ s: newGame(2, 1) });
  assert.equal(off.made(), 0);
  assert.equal(off.timers.length, 0);

  const m = rig();
  m.snd.setMuted(true); m.snd.gesture(); m.snd.setScene({ kind: "game", theme: "grass" });
  assert.equal(m.made(), 0);
  assert.equal(m.snd.ui("click"), false);
});

test("controller: music follows scene, pause/hidden suspend, mute stops everything", () => {
  const r = rig();
  r.snd.gesture();
  r.snd.setScene({ kind: "menu" });
  assert.deepEqual(r.calls.filter((c) => c[0] === "start"), [["start", "menu"]]);
  r.snd.setScene({ kind: "game", theme: "lava" });
  assert.ok(r.calls.some((c) => c[0] === "start" && c[1] === "epic"));
  r.calls.length = 0;
  r.snd.setPaused(true);
  assert.deepEqual(r.calls.map((c) => c[0]), ["stop", "suspend"]);
  r.calls.length = 0;
  r.snd.feed({ s: newGame(2, 1) });
  assert.deepEqual(r.calls, [], "no work while paused");
  r.snd.setPaused(false);
  r.snd.setHidden(true);
  assert.equal(r.calls.at(-1)[0], "suspend");
  r.snd.setHidden(false);
  r.snd.setMuted(true);
  assert.equal(r.calls.at(-1)[0], "suspend");
  r.calls.length = 0;
  r.snd.feed({ s: newGame(2, 1) });
  assert.deepEqual(r.calls, []);
});

test("controller: Silence music keeps effects; menu clicks wake then re-suspend the engine", () => {
  const r = rig({ music: "silence" });
  r.snd.gesture();
  r.snd.setScene({ kind: "menu" });
  assert.equal(r.calls.some((c) => c[0] === "start"), false);
  r.calls.length = 0;
  assert.equal(r.snd.ui("click"), true);
  assert.deepEqual(r.calls.map((c) => c[0]), ["resume", "play"]);
  assert.equal(r.timers.length, 1);
  r.timers[0][0]();
  assert.equal(r.calls.at(-1)[0], "suspend");
  r.set.sfx = false;
  assert.equal(r.snd.ui("click"), false);
  assert.equal(r.snd.ui("test", 1, true), true, "the test button ignores the setting");
});

test("controller: gameplay events play, gaps are respected, match fanfare fires once", () => {
  const r = rig();
  r.snd.gesture();
  r.snd.setScene({ kind: "game", theme: "grass" });
  const s = newGame(2, 1);
  const g = { s, scores: [0, 0], win: 2 };
  r.snd.feed(g);
  assert.ok(r.calls.some((c) => c[0] === "play" && c[1] === "start"));
  r.calls.length = 0;
  g.scores = [2, 0]; g.over = true;
  r.snd.feed(g); r.snd.feed(g);
  assert.equal(r.calls.filter((c) => c[1] === "matchwin").length, 1);
});

test("controller: voice reads banners once, lower-cased, rate limited, only when enabled", () => {
  const r = rig({ sfx: false, music: "silence", voice: true });
  r.snd.gesture();
  const g = { s: newGame(2, 1), call: { text: "DOUBLE KILL!" } };
  r.snd.feed(g); r.snd.feed(g);
  assert.deepEqual(r.said.filter((x) => x !== "cancel"), ["double kill!"]);
  r.clock(500);
  r.snd.feed({ ...g, call: { text: "KABOOM!" } });
  assert.equal(r.said.filter((x) => x !== "cancel").length, 1, "rate limited");
  r.clock(5000);
  r.snd.feed({ ...g, call: { text: "KABOOM!" } });
  assert.equal(r.said.filter((x) => x !== "cancel").length, 2);
  const quiet = rig({ voice: false });
  quiet.snd.gesture();
  quiet.snd.feed(g);
  assert.deepEqual(quiet.said.filter((x) => x !== "cancel"), []);
});
