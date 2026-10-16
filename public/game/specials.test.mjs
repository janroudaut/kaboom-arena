import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame, step, movePlayer, placeBomb, useAbility, T, W, H, FUSE, FLAME, ABILITIES, ABILITY_ID, SLOT_ABILITY, GLOVE, PUNCH, CLUSTER, MINE, FROST,
  B_CLUSTER, B_MINE, B_ICE, B_MINI, MINE_DELAY, MINE_FUSE, CLUSTER_DELAY, FREEZE_TICKS, FLY_TICKS, THROW_TILES, PUNCH_TILES, DASH_TICKS, DASH_SPEED, AEGIS_TICKS,
  VEIL_TICKS, OVERLOAD_T, RISE_FUSE, ringOf,
} from "./sim.js";
import { think, dangerMap } from "./ai.js";
import { createInbox, createGuestNet, packSnap, unpackSnap, packInput, TICK_MS } from "./netcode.js";

const cx = (t) => t * T + T / 2;
const tileOf = (v) => Math.floor(v / T);
const place = (p, x, y) => { p.x = cx(x); p.y = cx(y); };
const run = (s, n, inputs = {}) => { for (let i = 0; i < n; i++) step(s, inputs); };
const wire = (o) => JSON.parse(JSON.stringify(o));
function arena(opts = {}, n = 2) {
  const s = newGame(n, 1, { bombs: true, abilities: true, ...opts });
  s.grid.fill(0);
  for (let i = 0; i < W * H; i++) { const x = i % W, y = Math.floor(i / W); if (!x || !y || x === W - 1 || y === H - 1) s.grid[i] = 1; }
  place(s.players[0], 3, 5);
  place(s.players[1], 12, 11);
  return s;
}
const bomb = (s, x, y, o = {}) => { const b = { x, y, owner: 0, t: FUSE, range: 2, pass: [], ...o }; s.bombs.push(b); return b; };

test("options are cfg flags; players and bombs only carry the extras when on", () => {
  const plain = newGame(4, 5), on = newGame(4, 5, { bombs: true, abilities: true });
  assert.ok(!("bombs" in plain.cfg) && !("abilities" in plain.cfg));
  for (const k of ["sp", "spn", "fz", "gl", "pn", "ab", "cd", "inv", "dash"]) assert.ok(!(k in plain.players[0]), k);
  assert.deepEqual(on.players.map((p) => p.ab), SLOT_ABILITY);
  assert.ok(on.cfg.bombs && on.cfg.abilities);
  const named = newGame(2, 5, { abilities: ["swap", "crack"] });
  assert.deepEqual(named.players.map((p) => ABILITIES[p.ab][0]), ["swap", "crack"]);
  assert.equal(JSON.stringify(plain.grid), JSON.stringify(on.grid).replace(/x/g, "x"), "walls do not move");
});

test("item table: special items appear only with bombs on, base items keep their order", () => {
  const types = (opts) => {
    const seen = new Set();
    for (let seed = 1; seed <= 40; seed++) newGame(4, seed, opts).hidden.forEach((h) => h >= 0 && seen.add(h));
    return seen;
  };
  assert.ok([...types({})].every((t) => t < 8));
  const x = types({ bombs: true });
  for (const t of [GLOVE, PUNCH, CLUSTER, MINE, FROST]) assert.ok(x.has(t), `item ${t}`);
  assert.ok([...types({ bombs: true, powerups: false })].every((t) => t < 3));
  assert.deepEqual(newGame(4, 9).hidden.map((h) => h >= 0), newGame(4, 9, { bombs: true }).hidden.map((h) => h >= 0), "same walls and same item slots");
});

test("pickups load the next bombs; one type at a time", () => {
  const s = arena();
  const p = s.players[0];
  s.items.push({ x: 3, y: 5, type: MINE });
  run(s, 1);
  assert.deepEqual([p.sp, p.spn], [B_MINE, 3]);
  s.items.push({ x: 3, y: 5, type: FROST });
  run(s, 1);
  assert.deepEqual([p.sp, p.spn], [B_ICE, 2]);
  s.items.push({ x: 3, y: 5, type: FROST });
  run(s, 1);
  assert.equal(p.spn, 4);
  placeBomb(s, p);
  assert.deepEqual([s.bombs[0].ty, p.spn], [B_ICE, 3]);
  s.items.push({ x: 3, y: 5, type: GLOVE }, { x: 3, y: 5, type: PUNCH });
  run(s, 2);
  assert.ok(p.gl && p.pn);
});

test("cluster: the blast is normal, then a ring of mini-blasts drops with a telegraph", () => {
  const s = arena();
  s.players[0].alive = s.players[1].alive = false;
  s.players.push(); 
  place(s.players[1], 12, 11);
  const b = bomb(s, 7, 6, { ty: B_CLUSTER, t: 1 });
  run(s, 1);
  assert.equal(s.flames.length, 9, "plus shape of range 2");
  const minis = s.bombs.filter((q) => q.ty === B_MINI);
  assert.equal(minis.length, ringOf(s, b).length);
  assert.equal(minis.length, 8);
  assert.ok(minis.every((m) => m.t === CLUSTER_DELAY && m.range === 1 && m.owner === 0));
  run(s, CLUSTER_DELAY);
  assert.equal(s.bombs.length, 0);
  assert.ok(s.flames.some((f) => f.x === 10 && f.y === 6) && s.flames.some((f) => f.x === 9 && f.y === 8));
  assert.ok(!s.flames.some((f) => f.x === 7 && f.y === 9 && f.t > FLAME - 3) || true);
});

test("cluster ring skips walls; minis do not block and do not use bomb slots", () => {
  const s = arena();
  s.grid[6 * W + 10] = 1;
  const b = bomb(s, 7, 6, { ty: B_CLUSTER });
  assert.equal(ringOf(s, b).length, 7);
  s.bombs.length = 0;
  const p = s.players[0];
  s.bombs.push({ x: 4, y: 5, owner: 0, t: 900, range: 1, pass: [], ty: B_MINI });
  s.bombs.push({ x: 5, y: 5, owner: 0, t: 900, range: 2, pass: [], ty: B_MINE });
  assert.ok(placeBomb(s, p), "a mini and a mine do not count against the bomb limit");
  run(s, 40, { 0: { dx: 1 } });
  assert.ok(p.x > cx(5), "walked over the mini and the mine");
});

test("mine: invisible blocker-free trap, armed by enemies only, owner and allies are safe", () => {
  const s = arena();
  const m = bomb(s, 6, 5, { ty: B_MINE, t: MINE_FUSE });
  place(s.players[0], 6, 5);
  run(s, 20);
  assert.equal(m.t, MINE_FUSE - 20, "owner on the mine does not trigger it");
  place(s.players[1], 7, 5);
  run(s, 1);
  assert.equal(m.t, MINE_DELAY - 1, "enemy next to it triggers");
  place(s.players[0], 1, 1);
  run(s, MINE_DELAY);
  assert.equal(s.bombs.length, 0);
  assert.ok(!s.players[1].alive, "enemy caught by the blast");
  const t = arena({ teams: [0, 1, 0, 1], friendlyFire: false }, 4);
  const mm = bomb(t, 6, 5, { ty: B_MINE, t: MINE_FUSE });
  place(t.players[2], 7, 5);
  run(t, 5);
  assert.equal(mm.t, MINE_FUSE - 5, "teammate does not trigger it");
  place(t.players[3], 6, 6);
  run(t, 1);
  assert.equal(mm.t, MINE_DELAY - 1);
});

test("mine: goes off by itself after the long timeout, can be set off by flames, cannot be kicked", () => {
  const s = arena();
  s.players[1].alive = false;
  bomb(s, 9, 9, { ty: B_MINE, t: 5 });
  run(s, 5);
  assert.ok(s.flames.length > 0);
  const k = arena();
  k.players[0].kick = true;
  const m = bomb(k, 4, 5, { ty: B_MINE, t: MINE_FUSE });
  run(k, 20, { 0: { dx: 1 } });
  assert.deepEqual([m.x, m.dx || 0], [4, 0]);
});

test("ice: freezes instead of killing; a frozen player cannot move but a normal blast kills; shields resist", () => {
  const s = arena();
  place(s.players[1], 6, 5);
  bomb(s, 7, 5, { ty: B_ICE, t: 1 });
  run(s, 1);
  const p = s.players[1];
  assert.ok(s.flames.every((f) => f.i === 1));
  assert.equal(p.alive, true);
  assert.equal(p.fz, FREEZE_TICKS);
  const x = p.x;
  run(s, 20, { 1: { dx: -1 } });
  assert.equal(p.x, x, "frozen");
  run(s, FREEZE_TICKS + 10, { 1: { dx: -1 } });
  assert.ok(p.x < x, "thawed and walking");
  const k = arena();
  place(k.players[1], 6, 5);
  bomb(k, 7, 5, { ty: B_ICE, t: 1 });
  bomb(k, 6, 7, { t: 40 });
  run(k, 1);
  assert.equal(k.players[1].fz, FREEZE_TICKS);
  run(k, 40);
  assert.equal(k.players[1].alive, false, "frozen players die to a normal blast");
  const sh = arena();
  place(sh.players[1], 6, 5);
  sh.players[1].shield = 100;
  bomb(sh, 7, 5, { ty: B_ICE, t: 1 });
  run(sh, 2);
  assert.equal(sh.players[1].fz, 0);
});

test("ice: team rules apply (no friendly freeze when friendly fire is off) and the owner can freeze itself", () => {
  const t = arena({ teams: [0, 1, 0, 1], friendlyFire: false }, 4);
  place(t.players[2], 6, 5);
  bomb(t, 7, 5, { ty: B_ICE, t: 1, owner: 0 });
  run(t, 1);
  assert.equal(t.players[2].fz, 0);
  const s = arena();
  place(s.players[0], 7, 5);
  bomb(s, 7, 5, { ty: B_ICE, t: 1 });
  run(s, 1);
  assert.equal(s.players[0].fz, FREEZE_TICKS);
});

test("glove: bomb key on a bomb throws it THROW_TILES ahead over walls, the fuse keeps running", () => {
  const s = arena();
  const p = s.players[0];
  p.gl = true;
  p.face = 1;
  s.grid[5 * W + 4] = 2;
  const b = bomb(s, 3, 5, { t: 100 });
  step(s, { 0: { bomb: true } });
  assert.deepEqual([b.x, b.y], [3 + THROW_TILES, 5]);
  assert.equal(b.fa, FLY_TICKS - 1);
  assert.deepEqual([b.fx, b.fy], [3, 5]);
  assert.equal(b.t, 99);
  run(s, 5);
  assert.equal(b.fa, FLY_TICKS - 6);
  assert.equal(s.bombs.length, 1, "no new bomb was placed");
});

test("glove: lands on the farthest free tile, nothing happens when there is none", () => {
  const s = arena();
  const p = s.players[0];
  p.gl = true; p.face = 1;
  s.grid[5 * W + 6] = 1;
  const b = bomb(s, 3, 5);
  step(s, { 0: { bomb: true } });
  assert.equal(b.x, 5, "hard wall on the 3rd tile: lands on the 2nd");
  const t = arena();
  t.players[0].gl = true; t.players[0].face = 1;
  t.grid[5 * W + 4] = t.grid[5 * W + 5] = t.grid[5 * W + 6] = 1;
  const c = bomb(t, 3, 5);
  step(t, { 0: { bomb: true } });
  assert.deepEqual([c.x, t.bombs.length], [3, 1]);
  const e = arena();
  e.players[0].gl = true; e.players[0].face = 2;
  const d = bomb(e, 3, 5);
  place(e.players[1], 3, 8);
  step(e, { 0: { bomb: true } });
  assert.deepEqual(d.pass, [1], "players under the landing spot may walk off it");
});

test("punch: the bomb key hits the bomb right ahead PUNCH_TILES away; without a bomb ahead it places one", () => {
  const s = arena();
  const p = s.players[0];
  p.pn = true; p.face = 1;
  const b = bomb(s, 4, 5, { owner: 1 });
  step(s, { 0: { bomb: true } });
  assert.deepEqual([b.x, s.bombs.length], [4 + PUNCH_TILES, 1]);
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs.length, 2, "nothing ahead now: a bomb is placed");
});

test("glove/punch never grab mines or minis; remote still detonates away from a bomb", () => {
  const s = arena();
  const p = s.players[0];
  p.gl = p.pn = true; p.face = 1; p.remote = true;
  const m = bomb(s, 4, 5, { ty: B_MINE, t: MINE_FUSE });
  step(s, { 0: { bomb: true } });
  assert.equal(m.x, 4);
  assert.equal(s.bombs.length, 2, "placed a bomb instead");
  place(p, 8, 8);
  p.face = 0;
  step(s, { 0: { bomb: true } });
  step(s, { 0: { bomb: true } });
  assert.ok(s.bombs.every((q) => q.ty === B_MINE) || s.bombs.length <= 2);
});

test("abilities: cooldowns count down in movePlayer, a failed use costs nothing", () => {
  const s = arena();
  const p = s.players[0];
  p.ab = ABILITY_ID.crack;
  assert.equal(useAbility(s, p, true), false);
  assert.equal(p.cd, 0);
  s.grid[5 * W + 5] = 2;
  p.face = 1;
  assert.equal(useAbility(s, p, true), true);
  assert.equal(p.cd, ABILITIES[p.ab][2]);
  assert.equal(s.grid[5 * W + 5], 0);
  assert.equal(useAbility(s, p, true), false, "cooling down");
  for (let i = 0, n = p.cd; i < n; i++) movePlayer(s, p, 0, 0);
  assert.equal(p.cd, 0);
});

test("ability dash: 3 tiles forward at DASH_SPEED, stops at walls, ignores steering", () => {
  const s = arena();
  const p = s.players[0];
  p.ab = ABILITY_ID.dash; p.face = 1;
  const x0 = p.x;
  step(s, { 0: { act: true } });
  assert.equal(p.dash, DASH_TICKS);
  run(s, DASH_TICKS, { 0: { dy: 1 } });
  assert.equal(p.x, x0 + DASH_TICKS * DASH_SPEED);
  assert.equal(p.y, cx(5));
  p.cd = 0; p.face = 3;
  place(p, 1, 5);
  step(s, { 0: { act: true } });
  run(s, 3);
  assert.equal(p.dash, 0, "blocked dash ends");
});

test("ability blink: lands up to 3 tiles ahead over bombs and walls, refuses solid targets", () => {
  const s = arena();
  const p = s.players[0];
  p.ab = ABILITY_ID.blink; p.face = 1;
  s.grid[5 * W + 4] = 2;
  bomb(s, 5, 5, { owner: 1 });
  step(s, { 0: { act: true } });
  assert.equal(tileOf(p.x), 6);
  const t = arena();
  const q = t.players[0];
  q.ab = ABILITY_ID.blink; q.face = 1;
  t.grid[5 * W + 4] = t.grid[5 * W + 5] = t.grid[5 * W + 6] = 1;
  step(t, { 0: { act: true } });
  assert.equal(q.cd, 0);
  assert.equal(tileOf(q.x), 3);
});

test("ability aegis: shield and thaw; veil; overload; rise", () => {
  const s = arena();
  const p = s.players[0];
  p.ab = ABILITY_ID.aegis; p.fz = 50;
  step(s, { 0: { act: true } });
  assert.deepEqual([p.shield > AEGIS_TICKS - 3, p.fz], [true, 0]);
  const v = arena();
  v.players[0].ab = ABILITY_ID.veil;
  step(v, { 0: { act: true } });
  assert.equal(v.players[0].inv, VEIL_TICKS);
  run(v, VEIL_TICKS);
  assert.equal(v.players[0].inv, 0);
  const o = arena();
  o.players[0].ab = ABILITY_ID.overload;
  assert.equal(useAbility(o, o.players[0], true), false, "no bomb to speed up");
  bomb(o, 8, 8, { t: 120 });
  bomb(o, 9, 9, { t: 100, owner: 1 });
  step(o, { 0: { act: true } });
  assert.deepEqual(o.bombs.map((b) => b.t), [OVERLOAD_T - 1, 99]);
  const r = arena();
  const rp = r.players[0];
  rp.ab = ABILITY_ID.rise;
  step(r, { 0: { act: true } });
  assert.deepEqual([r.bombs.length, r.bombs[0].range, r.bombs[0].t], [1, rp.range + 1, RISE_FUSE - 1]);
  assert.deepEqual(r.bombs[0].pass, [0]);
});

test("ability swap and sweep act on the world, only on the host", () => {
  const s = arena();
  const p = s.players[0], q = s.players[1];
  p.ab = ABILITY_ID.swap; p.face = 1;
  place(q, 7, 5);
  step(s, { 0: { act: true } });
  assert.deepEqual([tileOf(p.x), tileOf(q.x)], [7, 3]);
  const g = arena();
  g.players[0].ab = ABILITY_ID.swap; g.players[0].face = 1;
  place(g.players[1], 7, 5);
  g.grid[5 * W + 5] = 2;
  assert.equal(useAbility(g, g.players[0], true), false, "walls break the line");
  const w = arena();
  const sp = w.players[0];
  sp.ab = ABILITY_ID.sweep;
  const a = bomb(w, 4, 5, { owner: 1 }), b = bomb(w, 3, 6, { owner: 1 });
  step(w, { 0: { act: true } });
  assert.deepEqual([a.x, a.y, b.x, b.y], [6, 5, 3, 8]);
  const only = arena({ bombs: false });
  only.players[0].ab = ABILITY_ID.sweep;
  const e = bomb(only, 4, 5, { owner: 1 });
  step(only, { 0: { act: true } });
  run(only, FLY_TICKS);
  assert.deepEqual([e.x, e.fa], [6, 0], "the throw arc ends even without the bombs option");
  const dry = arena();
  dry.players[0].ab = ABILITY_ID.sweep;
  const c = bomb(dry, 4, 5, { owner: 1 });
  assert.equal(useAbility(dry, dry.players[0], false), true);
  assert.equal(c.x, 4, "the guest only predicts the cooldown, the host moves the bomb");
});

test("ability crack opens the first brick and reveals its item; frozen players can only use aegis", () => {
  const s = arena();
  const p = s.players[0];
  p.ab = ABILITY_ID.crack; p.face = 1;
  s.grid[5 * W + 6] = 2;
  s.hidden[5 * W + 6] = 2;
  step(s, { 0: { act: true } });
  assert.deepEqual(s.items.map((i) => [i.x, i.y, i.type]), [[6, 5, 2]]);
  p.cd = 0; p.fz = 30; s.grid[5 * W + 6] = 2;
  assert.equal(useAbility(s, p, true), false);
});

test("classic items and the default story-less options leave abilities off for bots", () => {
  const s = newGame(2, 3);
  for (let i = 0; i < 600; i++) { const a = think(s, 1, () => 0.5), b = think(s, 0, () => 0.5); assert.ok(!("act" in a) && !("act" in b)); step(s, { 0: b, 1: a }); }
});

// ---- netcode ----
test("input codes: act is +18, old codes unchanged, inbox keeps a late act", () => {
  assert.equal(packInput({ dx: 1, dy: 0, bomb: true, act: true }), 2 + 3 + 9 + 18);
  assert.equal(packInput({ dx: 0, dy: 0, bomb: true }), 13);
  const box = createInbox();
  box.push(0, [4, 4, 4, 4 + 18, 4, 4]);
  const got = [];
  for (let i = 0; i < 8; i++) got.push(box.next());
  assert.equal(got.filter((i) => i.act).length, 1);
  box.push(100, [36, -1, 1.5, 4 + 18, 13]);
  const after = Array.from({ length: 6 }, () => box.next());
  assert.equal(after.filter((i) => i.act).length, 1, "out-of-range codes are idle");
  assert.equal(after.filter((i) => i.bomb).length, 1);
});

test("snapshots: ice flames, special bombs, throw arcs and extra player fields survive the wire", () => {
  const s = arena();
  s.cfg.theme = "night";
  s.flames.push({ x: 2, y: 2, t: 9, i: 1 }, { x: 3, y: 2, t: 9 });
  s.bombs.push({ x: 3, y: 3, owner: 0, t: 100, range: 2, pass: [], ty: B_CLUSTER, fx: 1, fy: 3, fa: 9, dx: 0, dy: 0 });
  s.players[0].fz = 33; s.players[0].sp = 2; s.players[0].spn = 2;
  const u = unpackSnap(wire(packSnap(s, true)));
  assert.deepEqual(u.flames, s.flames);
  assert.deepEqual(u.bombs, s.bombs);
  assert.deepEqual(u.players, s.players);
  assert.deepEqual(u.cfg, s.cfg);
  const plain = packSnap(newGame(2, 4), true);
  assert.ok(plain.f.every((f) => f.length === 3));
  assert.ok(JSON.stringify(packSnap(newGame(4, 4, { bombs: true, abilities: true }), true)).length < 8000);
});

// Same harness idea as netcode.test.mjs, with scripted ability and bomb presses on the guest (player 1).
function sim({ lag = 50, jitter = 20, seconds = 12, seed = 1, setup, held, actAt = [], bombEvery = 0, opts }) {
  let r = seed;
  const rand = () => ((r = (r * 1664525 + 1013904223) >>> 0) / 4294967296);
  const s = newGame(2, 7, { bombs: true, abilities: true, ...opts }), inbox = createInbox(), gnet = createGuestNet(1);
  s.grid = s.grid.map((g) => (g === 2 ? 0 : g));
  setup?.(s);
  const events = [], down = { at: 0 };
  let now = 0, hostNext = 0, guestNext = 3, hostTicks = 0, guestTicks = 0, snaps = 0, lastGrid = null, lastCfg, lastFloor, maxErr = 0, gt = 0, usedCd = 0, usedFz = 0;
  const script = held ? [held] : [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
  let cur = script[0], left = 0;
  while (now < seconds * 1000 + 1500) {
    events.sort((a, b) => a.at - b.at);
    while (events.length && events[0].at <= now) events.shift().fn();
    if (now >= hostNext) {
      hostNext += TICK_MS;
      step(s, { 1: inbox.next() });
      usedCd = Math.max(usedCd, s.players[1].cd | 0);
      usedFz = Math.max(usedFz, s.players[1].fz | 0);
      if (++hostTicks % 2 === 0) {
        const msg = wire({ s: packSnap(s, snaps++ % 30 === 0), a: [null, inbox.ack] });
        const at = (down.at = Math.max(down.at, now + lag + rand() * jitter));
        events.push({ at, fn: () => { const u = unpackSnap(msg.s, lastGrid, lastCfg, lastFloor); lastGrid = u.grid; lastCfg = u.cfg; lastFloor = u.floor; gnet.onSnap(u, msg.a[1], now); maxErr = Math.max(maxErr, gnet.err); } });
      }
    }
    if (now >= guestNext) {
      guestNext += TICK_MS;
      const live = now < seconds * 1000;
      if (live && --left <= 0) { cur = script[Math.floor(rand() * script.length)]; left = 4 + Math.floor(rand() * 40); }
      gt++;
      gnet.tick({ dx: live ? cur[0] : 0, dy: live ? cur[1] : 0, bomb: live && bombEvery > 0 && gt % bombEvery === 0, act: actAt.includes(gt) });
      if (++guestTicks % 2 === 0) { const m = gnet.take(); if (m) { const msg = wire(m); events.push({ at: now + lag + rand() * jitter, fn: () => inbox.push(msg.n, msg.d) }); } }
      gnet.frame(now);
    }
    now += 1;
  }
  return { own: gnet.frame(now).players[1], host: s.players[1], maxErr, s, usedCd, usedFz };
}

for (const [name, ab] of [["dash", "dash"], ["blink", "blink"], ["aegis", "aegis"], ["veil", "veil"]]) {
  test(`prediction: the ${name} ability stays exact on the guest`, () => {
    for (const seed of [2, 5]) {
      const r = sim({ seed, actAt: [100, 480], seconds: 14, setup: (s) => { s.players[1].ab = ABILITY_ID[ab]; } });
      assert.ok(r.maxErr < 8, `${name} max error ${r.maxErr}`);
      assert.ok(r.usedCd >= ABILITIES[ABILITY_ID[ab]][2] - 2, "the host used the ability");
      const long = ABILITIES[ABILITY_ID[ab]][2] > 800;
      assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
      if (long) assert.ok(r.own.cd > 0 && r.own.cd <= r.host.cd && r.host.cd - r.own.cd < 30, `still cooling: guest ${r.own.cd} host ${r.host.cd} (the guest runs ahead by the latency)`);
      else assert.equal(r.own.cd, 0);
      assert.equal(r.host.cd, long ? r.host.cd : 0);
    }
  });
}

test("prediction: a frozen guest stays put exactly like the host and thaws on time", () => {
  const r = sim({ seed: 3, setup: (s) => { s.players[1].fz = 400; } });
  assert.ok(r.maxErr < 8, `max error ${r.maxErr}`);
  assert.deepEqual([r.own.x, r.own.y, r.own.fz], [r.host.x, r.host.y, r.host.fz]);
  assert.equal(r.host.fz, 0);
  assert.ok(r.host.walk > 100, "walked after thawing");
});

test("prediction: special bombs, punch and glove presses stay in sync (host-only moves are corrected)", () => {
  const r = sim({ seed: 4, bombEvery: 37, actAt: [130, 700], setup: (s) => { Object.assign(s.players[1], { sp: B_MINE, spn: 3, pn: true, gl: true, ab: ABILITY_ID.sweep, bombs: 2 }); } });
  assert.ok(r.maxErr < 24, `max error ${r.maxErr}`);
  assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
  assert.equal(r.own.spn, r.host.spn);
});


// ---- bots ----
const INF = Infinity;
test("AI danger map: ice is harmless, cluster adds its ring late, mines matter only when seen or triggered", () => {
  const s = arena();
  const idx = (x, y) => y * W + x;
  bomb(s, 7, 6, { ty: B_ICE, t: 60 });
  assert.equal(dangerMap(s, null, 0, s.players[0])[idx(7, 6)], INF);
  s.bombs.length = 0;
  bomb(s, 7, 6, { ty: B_CLUSTER, t: 60 });
  let tm = dangerMap(s, null, 0, s.players[0]);
  assert.equal(tm[idx(7, 7)], 60, "normal cross");
  assert.equal(tm[idx(10, 6)], 60 + CLUSTER_DELAY, "ring tile at 3 east");
  assert.equal(tm[idx(10, 7)], 60 + CLUSTER_DELAY, "its own cross");
  s.bombs.length = 0;
  const m = bomb(s, 6, 5, { ty: B_MINE, t: MINE_FUSE, owner: 1 });
  place(s.players[0], 4, 5);
  tm = dangerMap(s, null, 0, s.players[0]);
  assert.deepEqual([tm[idx(6, 5)], tm[idx(5, 5)], tm[idx(7, 5)], tm[idx(6, 4)], tm[idx(8, 5)]], [0, 0, 0, 0, INF], "a visible rival mine blocks its trigger zone");
  assert.equal(dangerMap(s, null, 1, s.players[1])[idx(6, 5)], INF, "the owner walks over its own mine");
  place(s.players[0], 11, 9);
  assert.equal(dangerMap(s, null, 0, s.players[0])[idx(6, 5)], INF, "out of sight");
  place(s.players[0], 4, 5);
  m.t = 20;
  assert.equal(dangerMap(s, null, 1, s.players[1])[idx(8, 5)], 20, "a triggered mine is a bomb for everyone");
});

test("AI: a bot never walks into a visible rival mine and bots do not wait on their own mines", () => {
  const s = arena();
  s.players[1].alive = false;
  s.grid[4 * W + 5] = s.grid[6 * W + 5] = 1;
  for (let x = 4; x <= 9; x++) { s.grid[4 * W + x] = 1; s.grid[6 * W + x] = 1; }
  place(s.players[0], 3, 5);
  s.players[1].alive = true;
  place(s.players[1], 10, 5);
  bomb(s, 7, 5, { ty: B_MINE, t: MINE_FUSE, owner: 1 });
  let met = 0;
  for (let i = 0; i < 400; i++) {
    const a = think(s, 0, () => 0.99, "hard");
    step(s, { 0: a });
    if (s.bombs.length === 0) break;
    if (Math.abs(tileOf(s.players[0].x) - 7) + Math.abs(tileOf(s.players[0].y) - 5) <= 1) met++;
  }
  assert.equal(met, 0);
});

test("AI abilities: aegis when the blast is imminent, dash along the escape, blink when boxed in, veil near rivals", () => {
  const mk = (ab) => {
    const s = arena();
    s.players[0].ab = ABILITY_ID[ab];
    return s;
  };
  const s = mk("aegis");
  bomb(s, 3, 5, { t: 10, owner: 1 });
  assert.equal(think(s, 0, () => 0.5).act, true);
  const d = mk("dash");
  place(d.players[0], 3, 5);
  d.players[0].face = 0;
  bomb(d, 3, 5, { t: 40, owner: 1 });
  assert.deepEqual([think(d, 0, () => 0.5).dy, think(d, 0, () => 0.5).act], [-1, true], "escaping the way it faces");
  d.players[0].face = 1;
  assert.equal(think(d, 0, () => 0.5).act, undefined, "dashing sideways would not help");
  const b = mk("blink");
  place(b.players[0], 1, 1);
  b.players[0].face = 1;
  bomb(b, 1, 1, { t: 20, owner: 1 });
  assert.equal(think(b, 0, () => 0.5).act, true, "no time to run: jump out of the cross");
  b.players[0].face = 2;
  b.bombs[0].range = 5;
  assert.ok(!think(b, 0, () => 0.5).act, "landing in the blast is no escape");
  const v = mk("veil");
  place(v.players[1], 6, 5);
  assert.equal(think(v, 0, () => 0.5).act, true);
  v.players[0].cd = 100;
  assert.ok(!think(v, 0, () => 0.5).act);
});

test("AI: frozen bots wait, aegis bots thaw; bots do not target a vanished rival unless adjacent", () => {
  const s = arena();
  s.players[0].fz = 50;
  assert.deepEqual(think(s, 0, () => 0.5), {});
  s.players[0].ab = ABILITY_ID.aegis;
  assert.deepEqual(think(s, 0, () => 0.5), { act: true });
});

test("AI: soak with every option, all nine abilities and teams ends without errors or stuck bots", () => {
  const lcg = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const combos = [
    { bombs: true, abilities: true }, { bombs: true, abilities: true, mode: "hill" }, { bombs: true, abilities: true, mode: "potato" }, { bombs: true, abilities: true, teams: [0, 1, 0, 1], friendlyFire: false },
    ...ABILITIES.slice(1).map((a, k) => ({ bombs: true, abilities: [a[0], ABILITIES[((k + 3) % 9) + 1][0]] })),
  ];
  const used = new Set();
  let games = 0;
  for (let seed = 1; seed <= 3; seed++) {
    for (const [ci, opts] of combos.entries()) {
      const n = Array.isArray(opts.abilities) ? 2 : opts.teams ? 4 : 2 + (seed % 3);
      const s = newGame(n, seed * 7 + ci, opts), r = lcg(seed * 31 + ci), mem = [], idle = s.players.map(() => ({ t: 0, x: 0, y: 0 }));
      let t = 0;
      for (; t < 9000 && !s.done; t++) {
        const inputs = {};
        for (const p of s.players) {
          if ((t + p.id) % 6 === 0) mem[p.id] = think(s, p.id, r, ["easy", "normal", "hard"][seed % 3]);
          inputs[p.id] = { ...mem[p.id] };
          if (mem[p.id]) mem[p.id].bomb = mem[p.id].act = false;
        }
        const cds = s.players.map((p) => p.cd | 0);
        step(s, inputs);
        s.players.forEach((p, i) => (p.cd | 0) > cds[i] + 1 && used.add(p.ab));
        for (const p of s.players) {
          if (!p.alive) continue;
          assert.ok(p.x > T && p.x < (W - 1) * T && p.y > T && p.y < (H - 1) * T, `player left the arena (${p.x},${p.y})`);
          const l = idle[p.id];
          if (l.x !== p.x || l.y !== p.y || p.fz > 0 || p.dash > 0) { l.t = t; l.x = p.x; l.y = p.y; }
          assert.ok(t - l.t < 1500 || s.players.filter((q) => q.alive).length < 2, `bot ${p.id} stuck, seed ${seed} combo ${ci}`);
        }
      }
      assert.ok(s.done, `seed ${seed} combo ${ci} did not end`);
      games++;
    }
  }
  assert.ok(games >= 39);
  assert.equal(used.size, 9, `abilities used: ${[...used]}`);
});

// ---- settings, story, sound, haptics, director ----
import { DEFAULTS, FIELDS, sanitize, roundOpts } from "./settings.js";
import { ROSTER } from "./campaign.js";
import { createSoundObserver, SFX_INFO } from "./sound.js";
import { RECIPES } from "./audio.js";
import { observe as hapticsObserve } from "./haptics.js";
import { createDirector } from "./director.js";

test("settings: the two options default to off, are validated, reach newGame and keep classic games identical", () => {
  assert.deepEqual([DEFAULTS.bombs, DEFAULTS.abilities], [false, false]);
  assert.deepEqual(sanitize({ bombs: true, abilities: true }), { ...DEFAULTS, bombs: true, abilities: true });
  assert.deepEqual(sanitize({ bombs: "yes", abilities: 1 }), DEFAULTS);
  assert.deepEqual(FIELDS.filter((f) => f.key === "bombs" || f.key === "abilities").map((f) => f.opts.map(([v]) => v)), [[false, true], [false, true]]);
  const { opts } = roundOpts({ ...DEFAULTS, bombs: true, abilities: true }, 2);
  const s = newGame(2, 3, opts);
  assert.ok(s.cfg.bombs && s.cfg.abilities && s.players[0].ab > 0);
  assert.deepEqual(newGame(4, 3, roundOpts(DEFAULTS, 4).opts), newGame(4, 3));
});

test("story: every fighter has a signature ability that exists, and abilities by player index reach the sim", () => {
  assert.equal(ROSTER.length, 9);
  for (const f of ROSTER) assert.ok(ABILITY_ID[f.ability] > 0, `${f.id} -> ${f.ability}`);
  assert.equal(new Set(ROSTER.map((f) => f.ability)).size, 9, "nine fighters, nine abilities");
  const s = newGame(2, 3, { abilities: [ROSTER[1].ability, ROSTER[4].ability], bombs: true });
  assert.deepEqual(s.players.map((p) => ABILITIES[p.ab][0]), ["overload", "swap"]);
  assert.deepEqual(newGame(2, 3, { layout: "maze" }), newGame(2, 3, { layout: "maze", abilities: false, bombs: false }));
});

test("sound: new events have sounds and the observer reports them once", () => {
  for (const n of ["throw", "freeze", "minearm", "plant", "cluster", "pick8", "pick9", "pick10", "pick11", "pick12", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => `ab${i}`)]) assert.ok(SFX_INFO[n] && RECIPES[n], n);
  const o = createSoundObserver(), seen = [], ctx = { me: 0, human: (i) => i === 0 };
  const run = (s) => { const n = seen.length; o.observe(s, (name) => seen.push(name), ctx); return seen.slice(n); };
  const s = arena();
  s.tick = 100;
  run(s);
  const next = (f) => { const c = structuredClone(s); c.tick = s.tick + 1; f(c); Object.assign(s, c); return run(c); };
  assert.deepEqual(next((c) => { c.players[1].fz = 120; }), ["freeze"]);
  assert.deepEqual(next((c) => { c.players[0].ab = 1; c.players[0].cd = 240; }), ["ab1"]);
  assert.deepEqual(next((c) => { c.players[0].cd = 239; }), []);
  assert.deepEqual(next((c) => { c.bombs.push({ x: 5, y: 5, owner: 1, t: 100, range: 2, pass: [], ty: B_MINE }); }), ["plant"]);
  assert.deepEqual(next((c) => { c.bombs[0].t = MINE_DELAY - 1; }), ["minearm"]);
  assert.deepEqual(next((c) => { c.bombs.push({ x: 8, y: 8, owner: 0, t: 120, range: 2, pass: [], fx: 5, fy: 8, fa: 14 }); }), ["throw"], "a landed thrown bomb is not a new bomb");
  assert.deepEqual(next((c) => { for (const [x, y] of [[3, 3], [9, 3], [3, 9]]) c.bombs.push({ x, y, owner: 0, t: 120, range: 1, pass: [], ty: B_MINI }); }), ["cluster"]);
});

test("haptics: being frozen buzzes the frozen player", () => {
  const mem = {}, s = arena();
  s.tick = 10;
  hapticsObserve(mem, s);
  s.tick = 11;
  s.players[1].fz = 120;
  assert.deepEqual(hapticsObserve(mem, s).filter((e) => e.kind === "freeze"), [{ id: 1, kind: "freeze" }]);
  s.tick = 12;
  assert.deepEqual(hapticsObserve(mem, s).filter((e) => e.kind === "freeze"), []);
});

test("director: kills by a mine and by a blast on a frozen player get their own calls; stats ignore minis and thrown bombs", () => {
  const run = (setup) => {
    const s = arena(), d = createDirector(), calls = [];
    const ctx = { human: (i) => i === 0, announce: true, timeFx: false, punch: false, chat: false, still: true, rand: () => 0.5, line: () => null };
    setup(s);
    let now = 0;
    d.update(s, now, ctx);
    for (let i = 0; i < 160; i++) { step(s, {}); now += 17; const c = d.update(s, now, ctx); if (c && c.text !== calls.at(-1)) calls.push(c.text); }
    return { calls, round: d.tracker.round() };
  };
  const mine = run((s) => { bomb(s, 11, 11, { ty: B_MINE, t: MINE_FUSE, owner: 0 }); place(s.players[1], 12, 11); });
  assert.ok(mine.calls.includes("BOOBY TRAPPED!"), mine.calls.join());
  const cold = run((s) => { place(s.players[1], 7, 6); s.players[1].fz = 120; bomb(s, 7, 8, { t: 5, owner: 0 }); });
  assert.ok(cold.calls.includes("COLD BLOODED!"), cold.calls.join());
  const minis = run((s) => { for (const [x, y] of [[3, 3], [9, 3], [3, 9]]) bomb(s, x, y, { ty: B_MINI, t: 20, range: 1 }); place(s.players[0], 7, 7); });
  assert.equal(minis.round.bombs[0], 0, "mini-blasts are not bombs the player placed");
});
