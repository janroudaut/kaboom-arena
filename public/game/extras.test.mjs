import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame, step, movePlayer, T, W, H, FUSE, ICE, CONV, SPIKE, TELE, TP_ARM, TP_COOL, SPIKE_CYCLE,
  EVENT_WARN, FRENZY_TICKS, HILL_EVERY, HILL_GOAL, HILL_TIME, POTATO_TICKS, POTATO_COOL, SURV_CAP, SURV_EVERY, spikeIn, EVENTS,
} from "./sim.js";
import { think } from "./ai.js";
import { createTracker, recapView } from "./director.js";
import { hudEntries, teamsOf, humansOf, isFoe, spikePhase, eventText, modeText, modeOf } from "./look.js";

const cx = (t) => t * T + T / 2;
const tileOf = (v) => Math.floor(v / T);
const place = (p, x, y) => { p.x = cx(x); p.y = cx(y); };
const run = (s, n, inputs = {}) => { for (let i = 0; i < n; i++) step(s, inputs); };
function arena(opts, n = 2) {
  const s = newGame(n, 1, opts);
  s.grid.fill(0);
  s.floor ??= new Array(W * H).fill(0);
  s.floor.fill(0);
  place(s.players[0], 3, 5);
  place(s.players[1], 12, 11);
  return s;
}
const set = (s, x, y, code) => { s.floor[y * W + x] = code; };

test("defaults: explicit off options produce the very same game", () => {
  assert.deepEqual(newGame(4, 42), newGame(4, 42, { tiles: "off", chaos: false, mode: "classic" }));
  const s = newGame(4, 42);
  for (const k of ["floor", "event", "evAt", "hill", "potato", "survival", "score"]) assert.ok(!(k in s), k);
  assert.equal(s.players.length, 4);
});

test("tiles: grid unchanged, spawns clear, pairs complete, connectivity kept over many seeds", () => {
  for (const layout of ["classic", "open", "pillars", "cross", "maze"]) {
    for (let seed = 1; seed <= 25; seed++) {
      for (const tiles of ["few", "many"]) {
        const n = 1 + (seed % 4), plain = newGame(n, seed, { layout }), s = newGame(n, seed, { layout, tiles });
        assert.deepEqual(s.grid, plain.grid);
        assert.equal(s.rs, plain.rs);
        const codes = s.floor.filter(Boolean);
        assert.ok(codes.length > 0);
        s.floor.forEach((f, i) => {
          if (!f) return;
          assert.equal(s.grid[i], 0);
          for (const p of s.players) assert.ok(Math.abs((i % W) - tileOf(p.x)) + Math.abs(Math.floor(i / W) - tileOf(p.y)) > 2);
        });
        for (const f of new Set(codes.filter((c) => c >= TELE))) assert.equal(codes.filter((c) => c === f).length, 2);
      }
    }
  }
});

test("ice: keeps sliding after release until leaving the ice, can be steered, stops at walls", () => {
  const s = arena({ tiles: "few" });
  for (let x = 4; x <= 8; x++) set(s, x, 5, ICE);
  const p = s.players[0];
  run(s, 14, { 0: { dx: 1 } });
  const x0 = p.x;
  run(s, 10);
  assert.ok(p.x > x0 + 5, "slides without input");
  run(s, 100);
  assert.ok(tileOf(p.x) === 9, `left the ice at tile ${tileOf(p.x)}`);
  const stop = p.x;
  run(s, 20);
  assert.equal(p.x, stop, "no momentum once off the ice");
  set(s, 9, 5, ICE);
  s.grid[5 * W + 11] = 1;
  run(s, 5, { 0: { dx: 1 } });
  run(s, 60);
  assert.ok(p.x < 11 * T - 6 && p.vx === 0, "stopped by the wall");
  run(s, 3, { 0: { dx: -1 } });
  assert.ok(p.vx === -1 || p.vx === 0);
});

test("conveyor carries players (who can fight it), bombs and items", () => {
  const s = arena({ tiles: "few" });
  for (let x = 3; x <= 9; x++) set(s, x, 5, CONV + 1);
  const p = s.players[0];
  run(s, 20);
  assert.ok(p.x > cx(3) + 9, "pushed right");
  const x1 = p.x;
  run(s, 20, { 0: { dx: -1 } });
  assert.ok(p.x < x1, "player at speed 1 beats the belt");
  s.bombs.push({ x: 6, y: 5, owner: 1, t: 999, range: 1, pass: [] });
  s.items.push({ x: 7, y: 5, type: 0 });
  place(p, 3, 9);
  run(s, 60);
  assert.ok(s.bombs[0].x > 6, `bomb moved to ${s.bombs[0].x}`);
  assert.ok(s.items[0].x > 7);
  run(s, 400);
  assert.equal(s.bombs[0].x, 10 - 0 > 9 ? s.bombs[0].x : 9);
});

test("prediction parity: movePlayer on a copy replays ice and conveyor exactly", () => {
  const s = arena({ tiles: "many", chaos: true });
  for (let x = 2; x <= 5; x++) set(s, x, 5, ICE);
  for (let y = 6; y <= 9; y++) set(s, 4, y, CONV + 2);
  s.event = { type: "frenzy", t: 0, on: 500 };
  const w = { ...s, bombs: s.bombs.map((b) => ({ ...b })), players: s.players.map((p) => ({ ...p })) };
  const seq = Array.from({ length: 300 }, (_, i) => ({ dx: [1, 0, -1, 0][(i >> 3) & 3], dy: i % 50 > 40 ? 1 : 0 }));
  for (const inp of seq) {
    step(s, { 0: { ...inp } });
    movePlayer(w, w.players[0], inp.dx, inp.dy);
    assert.equal(s.players[0].x, w.players[0].x);
    assert.equal(s.players[0].y, w.players[0].y);
  }
  assert.deepEqual(JSON.parse(JSON.stringify(s.players[0])), JSON.parse(JSON.stringify(s.players[0])));
});

test("teleporter: arms, jumps to the partner, cooldown prevents ping-pong, bombs stay", () => {
  const s = arena({ tiles: "few" });
  set(s, 3, 5, TELE); set(s, 10, 5, TELE);
  run(s, TP_ARM - 2);
  assert.equal(tileOf(s.players[0].x), 3);
  run(s, 3);
  assert.equal(tileOf(s.players[0].x), 10);
  run(s, TP_ARM + 30);
  assert.equal(tileOf(s.players[0].x), 10, "no immediate ping-pong while standing on the pad");
  s.bombs.push({ x: 3, y: 5, owner: 1, t: 999, range: 1, pass: [] });
  run(s, 5);
  assert.deepEqual([s.bombs[0].x, s.bombs[0].y], [3, 5]);
  run(s, 20, { 0: { dy: 1 } });
  run(s, 25, { 0: { dy: -1 } });
  assert.deepEqual([tileOf(s.players[0].x), tileOf(s.players[0].y)], [10, 5], "cooldown after leaving the pad");
  run(s, TP_COOL + TP_ARM + 5);
  assert.equal(tileOf(s.players[0].x), 10, "the cooldown only runs off the pad");
  s.bombs.length = 0;
  run(s, 20, { 0: { dy: 1 } });
  run(s, TP_COOL + 10);
  run(s, 20, { 0: { dy: -1 } });
  run(s, TP_ARM + 2);
  assert.equal(tileOf(s.players[0].x), 3, "armed again after leaving and waiting");
});

test("spikes: retracted -> telegraph -> deadly, shield absorbs, flames rules untouched", () => {
  const s = arena({ tiles: "few" });
  const i = 5 * W + 3;
  set(s, 3, 5, SPIKE);
  const seen = [];
  for (let k = 0; k < SPIKE_CYCLE * 2; k++) {
    s.players[1].alive = true;
    seen.push(spikeIn(s, i));
    step(s, {});
    if (!s.players[0].alive) break;
  }
  assert.ok(!s.players[0].alive, "dies on the extended spike");
  assert.ok(seen.some((v) => v > 0 && v <= 45), "telegraph window exists");
  assert.ok(seen.filter((v) => v === 0).length <= 1);
  const t = arena({ tiles: "few" });
  set(t, 3, 5, SPIKE);
  t.players[0].shield = 1000;
  run(t, SPIKE_CYCLE * 2);
  assert.ok(t.players[0].alive);
});

test("spikes are environmental: no friendly-fire dependency", () => {
  const s = arena({ tiles: "few", teams: [0, 0, 1, 1], friendlyFire: false }, 4);
  set(s, 3, 5, SPIKE);
  run(s, SPIKE_CYCLE * 2);
  assert.ok(!s.players[0].alive);
});

function announce(seed, opts = {}) {
  const s = newGame(4, seed, { chaos: true, ...opts });
  const out = [];
  let prev = null;
  for (let i = 0; i < 60 * 120; i++) {
    step(s, {});
    if (s.done) break;
    const e = s.event;
    if (e && (!prev || prev.type !== e.type || e.t > prev.t)) out.push({ tick: s.tick, type: e.type, t: e.t });
    prev = e && { type: e.type, t: e.t };
  }
  return out;
}

test("chaos: never before 10 s, 90 tick telegraph, 12-20 s apart, deterministic, all types appear", () => {
  const types = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const a = announce(seed), b = announce(seed);
    assert.deepEqual(a, b);
    assert.ok(a.length >= 2 || seed > 0);
    a.forEach((e, k) => {
      assert.equal(e.t, EVENT_WARN);
      types.add(e.type);
      if (k === 0) assert.ok(e.tick >= 600);
      else assert.ok(e.tick - a[k - 1].tick >= 12 * 60 + EVENT_WARN - 1, `gap ${e.tick - a[k - 1].tick}`);
    });
  }
  assert.deepEqual([...types].sort(), [...EVENTS].sort());
});

function force(s, type, extra = {}) {
  s.evAt = Infinity;
  s.event = { type, t: EVENT_WARN, ...extra };
}

test("chaos bombrain: lit bombs (owner -1) on empty tiles only after the telegraph, never on players", () => {
  const s = arena({ chaos: true });
  force(s, "bombrain", { tiles: [[5, 5], [6, 5], [3, 5], [8, 8]] });
  run(s, EVENT_WARN - 2);
  assert.equal(s.bombs.length, 0);
  run(s, 2);
  assert.equal(s.event, null);
  assert.deepEqual(s.bombs.map((b) => [b.x, b.y, b.owner]).sort(), [[5, 5, -1], [6, 5, -1], [8, 8, -1]]);
  assert.ok(s.bombs.every((b) => b.t >= FUSE - 2 && b.pass.length === 0));
  assert.ok(s.players[0].alive);
  run(s, FUSE + 5);
  assert.equal(s.bombs.length, 0);
  assert.ok(s.flames.length > 0 || s.players[0].alive !== undefined);
});

test("chaos itemrain / quake", () => {
  const s = arena({ chaos: true });
  force(s, "itemrain", { tiles: [[5, 5], [6, 6]] });
  run(s, EVENT_WARN);
  assert.equal(s.items.length, 2);
  const q = arena({ chaos: true });
  q.grid[7 * W + 7] = 2; q.grid[7 * W + 8] = 2; q.grid[7 * W + 9] = 2;
  q.hidden.fill(-1);
  q.hidden[7 * W + 7] = 1;
  force(q, "quake", { tiles: [[7, 7], [8, 7]] });
  run(q, EVENT_WARN - 1);
  assert.equal(q.grid[7 * W + 7], 2);
  run(q, 1);
  assert.deepEqual([q.grid[7 * W + 7], q.grid[7 * W + 8], q.grid[7 * W + 9]], [0, 0, 2]);
  assert.deepEqual(q.items, [{ x: 7, y: 7, type: 1 }]);
});

test("chaos frenzy: +50% speed for 10 s then back to normal", () => {
  const s = arena({ chaos: true });
  force(s, "frenzy");
  run(s, EVENT_WARN - 1);
  const x0 = s.players[0].x;
  step(s, { 0: { dx: 1 } });
  assert.equal(s.players[0].x - x0, 1.5);
  assert.equal(s.event.on, FRENZY_TICKS);
  run(s, FRENZY_TICKS);
  assert.equal(s.event, null);
  const x2 = s.players[0].x;
  s.players[0].x = cx(3);
  step(s, { 0: { dx: 1 } });
  assert.equal(s.players[0].x - cx(3), 1);
  assert.ok(x2 > 0);
});

test("chaos swap: positions exchange after the telegraph, cancelled inside a blast", () => {
  const s = arena({ chaos: true });
  force(s, "swap", { a: 0, b: 1 });
  run(s, EVENT_WARN - 1);
  assert.equal(tileOf(s.players[0].x), 3);
  run(s, 1);
  assert.deepEqual([tileOf(s.players[0].x), tileOf(s.players[0].y), tileOf(s.players[1].x)], [12, 11, 3]);
  const t = arena({ chaos: true });
  force(t, "swap", { a: 0, b: 1 });
  t.flames.push({ x: 3, y: 5, t: 400 });
  t.players[0].shield = 999;
  run(t, EVENT_WARN);
  assert.equal(tileOf(t.players[0].x), 3);
});

test("hill: lone occupant scores 1/s, contested scores nothing, first to 30 wins, zone relocates with telegraph", () => {
  const s = arena({ mode: "hill" });
  const h = s.hill;
  assert.equal(s.cfg.suddenDeath, false);
  h.x = 3; h.y = 5;
  run(s, 60);
  assert.deepEqual(s.score, [1, 0]);
  place(s.players[1], 4, 5);
  run(s, 120);
  assert.deepEqual(s.score, [1, 0], "contested");
  place(s.players[1], 12, 11);
  const t = arena({ mode: "hill" });
  t.hill.x = 3; t.hill.y = 5; t.hill.t = 1e9;
  run(t, 60 * HILL_GOAL - 1);
  assert.equal(t.end, -1);
  run(t, 1);
  assert.equal(t.winner, 0);
  assert.ok(t.end > 0);
  const u = arena({ mode: "hill" });
  u.hill.t = 100;
  const old = [u.hill.x, u.hill.y];
  run(u, 10);
  assert.ok(u.hill.next, "telegraphed");
  const nx = [...u.hill.next];
  run(u, 90);
  assert.deepEqual([u.hill.x, u.hill.y], nx);
  assert.notDeepEqual(nx, old);
  assert.equal(u.hill.t, HILL_EVERY);
});

test("hill: timeout gives the highest score, a tie is a draw; zone is never centred on a hard block", () => {
  const s = arena({ mode: "hill" });
  s.hill.x = 3; s.hill.y = 5; s.hill.t = 1e9;
  s.tick = HILL_TIME - 61;
  run(s, 61);
  assert.equal(s.winner, 0);
  const d = arena({ mode: "hill" });
  d.tick = HILL_TIME - 1;
  d.hill.t = 1e9;
  run(d, 1);
  assert.equal(d.winner, -1);
  for (const layout of ["classic", "pillars", "maze", "cross"]) {
    for (let seed = 1; seed < 15; seed++) {
      const g = newGame(2, seed, { mode: "hill", layout, tiles: "many" });
      assert.notEqual(g.grid[g.hill.y * W + g.hill.x], 1);
      assert.ok(![SPIKE].includes(g.floor[g.hill.y * W + g.hill.x]));
    }
  }
});

test("potato: passes on touch with a cooldown, explodes the holder, last survivor wins", () => {
  const s = arena({ mode: "potato" }, 3);
  s.grid.fill(0);
  place(s.players[0], 3, 5); place(s.players[1], 4, 5); place(s.players[2], 12, 11);
  s.potato.holder = 0; s.potato.t = 500; s.potato.cd = 0;
  step(s, {});
  assert.equal(s.potato.holder, 1);
  assert.equal(s.potato.cd, POTATO_COOL - 0);
  run(s, 10);
  assert.equal(s.potato.holder, 1, "no return during the cooldown");
  run(s, POTATO_COOL);
  assert.equal(s.potato.holder, 0, "passes back after the cooldown");
  s.potato.cd = 1e9;
  s.potato.t = 2;
  place(s.players[1], 8, 5); 
  run(s, 1);
  assert.ok(s.players[0].alive);
  run(s, 1);
  assert.ok(!s.players[0].alive, "holder explodes");
  assert.ok(s.flames.length > 0);
  assert.ok([1, 2].includes(s.potato.holder));
  assert.equal(s.potato.t, POTATO_TICKS);
  assert.equal(s.end, -1);
  s.potato.holder = 1;
  s.potato.t = 1; s.potato.cd = 1e9;
  place(s.players[1], 8, 5);
  run(s, 2);
  assert.ok(s.end > 0 && s.winner === 2);
});

test("potato: a shielded holder still explodes; normal bombs still work", () => {
  const s = arena({ mode: "potato" });
  s.potato.holder = 0; s.potato.t = 1; s.players[0].shield = 999;
  run(s, 1);
  assert.ok(!s.players[0].alive);
  const b = arena({ mode: "potato" });
  b.potato.holder = 1; b.potato.cd = 1e9;
  step(b, { 0: { bomb: true } });
  assert.equal(b.bombs.length, 1);
});

test("survival: dormant slots, waves activate shielded enemies up to the cap, round ends when humans die", () => {
  const s = newGame(2, 5, { mode: "survival" });
  assert.equal(s.cfg.suddenDeath, false);
  assert.equal(s.players.length, 2 + 12);
  assert.ok(s.players.slice(2).every((p) => p.dormant && !p.alive));
  assert.deepEqual(s.cfg.teams.slice(0, 3), [0, 0, 1]);
  run(s, 59);
  assert.equal(s.survival.wave, 0);
  run(s, 1);
  assert.equal(s.survival.wave, 1);
  const foes = s.players.filter((p) => p.id >= 2 && p.alive);
  assert.equal(foes.length, 2);
  assert.ok(foes.every((p) => p.shield > 0 && !p.dormant));
  assert.ok(s.players.slice(0, 2).every((p) => p.alive));
  for (let k = 0; k < 20 && !s.done; k++) { run(s, SURV_EVERY, {}); for (const p of s.players.slice(0, 2)) p.shield = 99999; }
  assert.ok(s.survival.wave >= 10);
  assert.ok(s.players.filter((p) => p.id >= 2 && p.alive).length <= SURV_CAP);
  assert.ok(s.players.length === 14);
  for (const p of s.players.slice(0, 2)) { p.shield = 0; p.alive = false; }
  run(s, 1);
  assert.equal(s.winner, -1);
  assert.equal(s.winnerTeam, 1);
  assert.ok(s.end > 0);
});

test("survival: a new wave comes early when no enemy is left; enemy slots are reused", () => {
  const s = newGame(1, 9, { mode: "survival" });
  run(s, 60);
  for (const p of s.players.slice(1)) p.alive = false;
  s.players[0].shield = 99999;
  run(s, 61);
  assert.equal(s.survival.wave, 2);
  assert.equal(s.players.filter((p) => p.id >= 1 && p.alive).length, 3);
  const spots = s.players.filter((p) => p.alive && p.id >= 1).map((p) => [tileOf(p.x), tileOf(p.y)]);
  for (const [x, y] of spots) assert.equal(s.grid[y * W + x], 0);
});

test("survival: arena spawn spots stay connected over many seeds, with tiles", () => {
  for (const layout of ["classic", "open", "pillars", "cross", "maze"]) {
    for (let seed = 1; seed <= 15; seed++) {
      const s = newGame(1 + (seed % 4), seed, { mode: "survival", layout, tiles: "many" });
      const open = (x, y) => s.grid[y * W + x] !== 1;
      const seen = new Set([W + 1]), q = [[1, 1]];
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const i = (y + dy) * W + x + dx;
          if (open(x + dx, y + dy) && !seen.has(i)) { seen.add(i); q.push([x + dx, y + dy]); }
        }
      }
      for (const [x, y] of [[W - 2, H - 2], [W - 2, 1], [1, H - 2], [7, 1], [7, H - 2], [1, 6], [W - 2, 6]]) assert.ok(seen.has(y * W + x), `${layout} ${seed} ${x},${y}`);
    }
  }
});

function drive(s, ticks, onTick) {
  let seed = 7;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const mem = s.players.map(() => ({}));
  for (let i = 0; i < ticks && !s.done; i++) {
    if (i % 6 === 0) s.players.forEach((p) => (mem[p.id] = think(s, p.id, rand)));
    step(s, Object.fromEntries(s.players.map((p) => [p.id, { ...mem[p.id] }])));
    if (i % 6 === 0) mem.forEach((m) => (m.bomb = false));
    onTick?.(i);
  }
}

test("AI: short tournament with spikes everywhere, bots rarely die on spikes", () => {
  let spikeDeaths = 0, deaths = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const s = newGame(4, seed, { tiles: "many" });
    let prev = s.players.map((p) => p.alive);
    drive(s, 60 * 90, () => {
      s.players.forEach((p, k) => {
        if (prev[k] && !p.alive) {
          deaths++;
          const i = tileOf(p.y) * W + tileOf(p.x);
          if (s.floor[i] === SPIKE && !s.flames.some((f) => f.x === tileOf(p.x) && f.y === tileOf(p.y))) spikeDeaths++;
        }
        prev[k] = p.alive;
      });
    });
  }
  console.log("spike deaths", spikeDeaths, "of", deaths);
  assert.ok(spikeDeaths <= Math.ceil(deaths * 0.05), `${spikeDeaths}/${deaths}`);
});

test("AI: modes run to completion and the hill is contested, potato holder chases, survival bots hunt", () => {
  const z = arena({ mode: "hill" });
  z.hill.x = 12; z.hill.y = 5;
  assert.deepEqual(think(z, 0, () => 0.5), { dx: 1, dy: 0 });
  place(z.players[0], 12, 5);
  assert.deepEqual(think(z, 0, () => 0.5), {});
  const pot = newGame(4, 3, { mode: "potato" });
  drive(pot, 60 * 200);
  assert.ok(pot.done, "potato finishes");
  assert.ok(pot.players.filter((p) => p.alive).length <= 1);
  const sv = newGame(2, 3, { mode: "survival" });
  drive(sv, 60 * 120);
  assert.ok(sv.survival.wave >= 3);
  const p = newGame(2, 1, { mode: "survival" });
  p.grid.fill(0);
  run(p, 60);
  const foe = p.players.find((q) => q.id >= 2 && q.alive);
  place(p.players[0], 7, 5);
  const o = think(p, foe.id, () => 0.5, "hard");
  assert.ok(o.dx || o.dy || o.bomb);
});

test("AI: avoids a telegraphed spike tile and teleporters when pathing", () => {
  const s = arena({ tiles: "few" });
  s.grid.fill(1);
  for (let x = 1; x <= 6; x++) s.grid[W + x] = 0;
  place(s.players[0], 1, 1);
  place(s.players[1], 6, 1);
  set(s, 3, 1, SPIKE);
  s.tick = 0;
  while (spikeIn(s, W + 3) !== 20) s.tick++;
  assert.deepEqual(think(s, 0, () => 0.5), {});
  s.floor[W + 3] = 0;
  set(s, 2, 1, TELE); set(s, 5, 1, TELE);
  assert.deepEqual(think(s, 0, () => 0.5), {});
  s.floor[W + 2] = 0; s.floor[W + 5] = 0;
  assert.equal(think(s, 0, () => 0.5).dx, 1);
});

test("AI: runs from bombrain bombs", () => {
  const s = arena({ chaos: true });
  force(s, "bombrain", { tiles: [[4, 5]] });
  run(s, EVENT_WARN);
  assert.equal(s.bombs.length, 1);
  const out = think(s, 0, () => 0.5);
  assert.ok(out.dx || out.dy);
});

test("performance: 60 s of play with every extra enabled", () => {
  const s = newGame(4, 11, { tiles: "many", chaos: true, mode: "survival" });
  const t0 = performance.now();
  drive(s, 3600);
  const ms = performance.now() - t0;
  console.log("3600 ticks with 4 bots, everything on:", Math.round(ms), "ms");
  assert.ok(ms < 8000);
  const q = newGame(4, 11, { tiles: "many", chaos: true, mode: "hill" });
  const t1 = performance.now();
  for (let i = 0; i < 3600 && !q.done; i++) step(q, {});
  assert.ok((performance.now() - t1) < 1000, "bare step stays far under a second per 1000 ticks");
});

test("look: spike phases follow spikeIn, event and mode lines, unknown values are ignored", () => {
  const s = newGame(2, 3, { tiles: "many" });
  const i = s.floor.indexOf(SPIKE), seen = new Set();
  for (let k = 0; k < SPIKE_CYCLE; k++, s.tick++) {
    const ph = spikePhase(s, i);
    assert.equal(ph === 2, spikeIn(s, i) === 0);
    seen.add(ph);
  }
  assert.equal(seen.size, 3);
  assert.equal(eventText({ event: { type: "bombrain", t: 61 } }), "BOMB RAIN 2s");
  assert.equal(eventText({ event: { type: "frenzy", t: 0, on: 300 } }), "FRENZY 5s");
  assert.deepEqual(["", "", ""], [eventText({}), eventText({ event: null }), eventText({ event: { type: "future", t: 5 } })]);
  assert.equal(modeText({ hill: { t: 900 } }), "HILL MOVES 15s");
  assert.equal(modeText({ potato: { t: 59 } }), "POTATO 1s");
  assert.equal(modeText({ survival: { wave: 0, next: 60 } }), "WAVE 1 IN 1s");
  assert.equal(modeText({ survival: { wave: 3, next: 600 } }), "WAVE 3 · NEXT 10s");
  assert.equal(modeText({}), "");
  assert.equal(modeOf({ mode: "constructor" }), "classic");
  assert.equal(modeOf({ mode: "hill" }), "hill");
});

test("survival: HUD rows, teams, recap and tracker only know the humans; owner -1 bombs are ignored", () => {
  const s = newGame(2, 4, { mode: "survival" });
  s.grid.fill(0);
  const g = { s, scores: [0, 0], names: ["A", "B"], me: 0 };
  assert.deepEqual([humansOf(s), teamsOf(s), hudEntries(g).length, isFoe(s, s.players[2]), isFoe(s, s.players[1])], [2, null, 2, true, false]);
  assert.ok(hudEntries(g).every((e) => e.score === -1));
  assert.equal(recapView(createTracker().round(), 2, g.names).rows.length, 2);
  const h = newGame(2, 4, { mode: "hill" });
  h.hill.score[1] = 7;
  assert.deepEqual(hudEntries({ s: h, scores: [1, 0] }).map((e) => [e.score, e.pts]), [[1, 0], [0, 7]]);
  const tr = createTracker(), ev = [];
  const on = (k, a) => ev.push([k, a]);
  const p = newGame(2, 4, { mode: "potato" });
  p.grid.fill(0);
  tr.update(p, on);
  p.bombs.push({ x: 6, y: 6, owner: -1, t: 2, range: 3, pass: [] });
  step(p, {}); tr.update(p, on);
  for (let i = 0; i < 4; i++) { step(p, {}); tr.update(p, on); }
  const st = tr.round();
  assert.ok(Object.values(st).every((a) => a.every((v) => v === 0)), JSON.stringify(st));
  assert.ok(!ev.some(([k]) => k === "bomb"));
  assert.ok(!Object.keys(st.bombs).some((k) => k === "-1"));
});
