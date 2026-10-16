import test from "node:test";
import assert from "node:assert/strict";
import {
  newGame, step, snapshot, movePlayer, placeBomb, detonate, doomed,
  T, W, H, FUSE, SUDDEN, REMOTE_FUSE, SHIELD_TICKS, CURSES, KICK, REMOTE, PASS, SHIELD, SKULL,
} from "./sim.js";

const run = (s, n, inputs = {}) => { for (let i = 0; i < n; i++) step(s, inputs); };
const cx = (tx) => tx * T + T / 2;
const place = (p, tx, ty) => { p.x = cx(tx); p.y = cx(ty); };
// Empty arena, p0 at (3,5), p1 at (12,11).
function arena(opts) {
  const s = newGame(2, 1, opts);
  s.grid.fill(0);
  place(s.players[0], 3, 5);
  place(s.players[1], 12, 11);
  return s;
}
const bomb = (x, y, o = {}) => ({ x, y, owner: 1, t: 999, range: 2, pass: [], ...o });

test("default newGame is unchanged: classic grid and original item roll", () => {
  const old = {
    "4,42": ["111111111111111100020220200001101212121012101102220222220001121212101212121122202202222221101210121212101120222220222201121210101212121102222222222201101212121210101100002202020001111111111111111",
      "-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,-1,-1,2,-1,-1,-1,-1,-1,-1,-1,-1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,0,-1,-1,-1,1,1,-1,-1,-1,-1,-1,-1,0,-1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,1,-1,1,-1,-1,2,2,-1,-1,-1,-1,-1,-1,0,-1,-1,-1,-1,-1,1,-1,2,-1,-1,-1,-1,-1,1,-1,-1,-1,-1,-1,-1,0,-1,0,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,2,-1,-1,1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1,-1"],
    "2,7": ["111111111111111100022220222221101212101212121102022022022021121012121212101102022220220221101012121012121122222002202001121212121210101122200022202001101210121212101122220222220001111111111111111", null],
  };
  for (const [k, [grid, hidden]] of Object.entries(old)) {
    const [n, seed] = k.split(",").map(Number);
    assert.equal(newGame(n, seed).grid.join(""), grid);
    assert.equal(newGame(n, seed, { powerups: false }).grid.join(""), grid);
    if (hidden) assert.equal(newGame(n, seed, { powerups: false }).hidden.join(","), hidden);
  }
  assert.deepEqual(newGame(2, 1).cfg, { layout: "classic", softDensity: 0.7, powerups: true, teams: null, friendlyFire: true, suddenDeath: true });
});

test("every layout is valid and spawns are connected, over many seeds", () => {
  for (const layout of ["classic", "open", "pillars", "cross", "maze"]) {
    for (let seed = 1; seed <= 40; seed++) {
      const s = newGame(4, seed, { layout, softDensity: seed % 2 ? 1 : 0.7 });
      const g = (x, y) => s.grid[y * W + x];
      for (let x = 0; x < W; x++) assert.ok(g(x, 0) === 1 && g(x, H - 1) === 1);
      for (let y = 0; y < H; y++) assert.ok(g(0, y) === 1 && g(W - 1, y) === 1);
      const sp = s.players.map((p) => [Math.floor(p.x / T), Math.floor(p.y / T)]);
      for (const [sx, sy] of sp) {
        for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
          const d = Math.abs(x - sx) + Math.abs(y - sy);
          if (d <= 2) assert.notEqual(g(x, y), 2, `${layout} soft near spawn`);
          if (d <= 1) assert.equal(g(x, y), 0, `${layout} blocked next to spawn`);
          if (d <= 2 && layout !== "classic" && layout !== "maze") assert.equal(g(x, y), 0);
        }
      }
      const seen = new Set([sp[0][1] * W + sp[0][0]]), q = [sp[0]];
      while (q.length) {
        const [x, y] = q.pop();
        for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
          const i = (y + dy) * W + x + dx;
          if (g(x + dx, y + dy) !== 1 && !seen.has(i)) { seen.add(i); q.push([x + dx, y + dy]); }
        }
      }
      for (const [sx, sy] of sp) assert.ok(seen.has(sy * W + sx), `${layout} seed ${seed} spawn disconnected`);
    }
  }
  const grids = new Set(["classic", "open", "pillars", "cross", "maze"].map((layout) => newGame(2, 1, { layout, softDensity: 0 }).grid.join("")));
  assert.equal(grids.size, 5);
});

test("new items only appear when powerups are enabled", () => {
  const types = (opts) => {
    const out = new Set();
    for (let seed = 1; seed <= 40; seed++) for (const h of newGame(4, seed, opts).hidden) if (h >= 0) out.add(h);
    return out;
  };
  assert.deepEqual([...types({ powerups: false })].sort(), [0, 1, 2]);
  assert.deepEqual([...types({})].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test("kick: bomb slides 1 tile per 6 ticks and stops before a wall", () => {
  const s = arena();
  s.players[0].kick = true;
  s.grid[5 * W + 9] = 1;
  s.bombs.push(bomb(4, 5));
  run(s, 3, { 0: { dx: 1 } });
  assert.equal(s.bombs[0].x, 4);
  const xs = [];
  for (let i = 0; i < 60; i++) { step(s, { 0: { dx: 1 } }); xs.push(s.bombs[0].x); }
  assert.equal(xs.indexOf(5), 2);
  assert.equal(xs.indexOf(6) - xs.indexOf(5), 6);
  assert.equal(s.bombs[0].x, 8);
  assert.equal(s.bombs[0].dx, 0);
});

test("kick: no kick without the item, stops before bombs and players, explodes in flames", () => {
  let s = arena();
  s.bombs.push(bomb(4, 5));
  run(s, 30, { 0: { dx: 1 } });
  assert.equal(s.bombs[0].x, 4);

  s = arena();
  s.players[0].kick = true;
  s.bombs.push(bomb(4, 5), bomb(8, 5));
  run(s, 80, { 0: { dx: 1 } });
  assert.equal(s.bombs[0].x, 7);

  s = arena();
  s.players[0].kick = true;
  place(s.players[1], 7, 5);
  s.bombs.push(bomb(4, 5));
  run(s, 80, { 0: { dx: 1 } });
  assert.equal(s.bombs[0].x, 6);

  s = arena();
  s.players[0].kick = true;
  s.flames.push({ x: 6, y: 5, t: 200 });
  s.bombs.push(bomb(4, 5));
  run(s, 20, { 0: { dx: 1 } });
  assert.equal(s.bombs.length, 0, "bomb blew up on entering the flame");
});

test("kicked bomb is destroyed by the closing wall ring", () => {
  const s = arena();
  s.players[0].kick = true;
  s.bombs.push(bomb(4, 5));
  s.tick = SUDDEN - 1;
  s.sd = 0;
  run(s, 100, { 0: { dx: 1 } });
  assert.ok(s.bombs.every((b) => s.grid[b.y * W + b.x] === 0));
});

test("remote: long fuse, button detonates the oldest bomb when none can be placed", () => {
  const s = arena();
  const p = s.players[0];
  p.remote = true;
  p.bombs = 2;
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs[0].t, REMOTE_FUSE - 1);
  run(s, 40, { 0: { dx: 1 } });
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs.length, 2);
  const second = s.bombs[1];
  run(s, 10, { 0: { dx: 1 } });
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs.length, 1, "oldest bomb detonated");
  assert.equal(s.bombs[0], second);
  assert.ok(s.flames.length > 0);
  assert.equal(detonate(s, s.players[1]), false);
});

test("without the remote, the bomb button on a full limit does nothing", () => {
  const s = arena();
  step(s, { 0: { bomb: true } });
  run(s, 20, { 0: { dx: 1 } });
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs.length, 1);
  assert.equal(s.flames.length, 0);
});

test("pass: walks through bombs, others do not", () => {
  const s = arena();
  s.bombs.push(bomb(4, 5));
  s.players[0].pass = true;
  run(s, 40, { 0: { dx: 1 } });
  assert.ok(s.players[0].x > cx(5));
  const t = arena();
  t.bombs.push(bomb(4, 5));
  run(t, 40, { 0: { dx: 1 } });
  assert.ok(t.players[0].x < cx(4));
});

test("shield: set on pickup, counts down, blocks flames until it expires", () => {
  const s = arena();
  s.items.push({ x: 3, y: 5, type: SHIELD });
  step(s, {});
  assert.equal(s.players[0].shield, SHIELD_TICKS - 1);
  s.flames.push({ x: 3, y: 5, t: 100 });
  run(s, 50, {});
  assert.equal(s.players[0].alive, true);
  assert.equal(s.players[0].shield, SHIELD_TICKS - 51);
  s.flames.push({ x: 3, y: 5, t: 1000 });
  run(s, SHIELD_TICKS, {});
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].shield, 0);
});

test("shield does not stop the sudden-death wall; death clears shield and curse", () => {
  const s = newGame(2, 1);
  s.players[0].shield = 500;
  s.players[0].curse = { type: "slow", t: 500 };
  s.tick = SUDDEN - 1;
  step(s, {});
  assert.equal(s.players[0].alive, false);
  assert.equal(s.players[0].shield, 0);
  assert.equal(s.players[0].curse, null);
});

test("curses: slow, fast, reverse, nobomb, auto-bomb, expiry", () => {
  const speed = (type) => {
    const s = arena();
    s.players[0].curse = { type, t: 500 };
    const x0 = s.players[0].x;
    movePlayer(s, s.players[0], 1, 0);
    return s.players[0].x - x0;
  };
  assert.equal(speed("slow"), 0.5);
  assert.equal(speed("fast"), 2.5);
  assert.equal(speed("reverse"), -1);
  assert.equal(speed("nobomb"), 1);

  let s = arena();
  s.players[0].curse = { type: "nobomb", t: 500 };
  assert.equal(placeBomb(s, s.players[0]), null);

  s = arena();
  s.players[0].bombs = 6;
  s.players[0].curse = { type: "auto", t: 500 };
  run(s, 95, {});
  assert.equal(s.bombs.length, 1, "same tile: one bomb");
  s.players[0].curse.t = 500;
  run(s, 65, { 0: { dx: 1 } });
  assert.ok(s.bombs.length >= 3);

  s = arena();
  s.players[0].curse = { type: "slow", t: 3 };
  run(s, 3, {});
  assert.equal(s.players[0].curse, null);
});

test("skull pickup gives a random curse, deterministic per seed", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed++) {
    const s = newGame(2, seed);
    s.items.push({ x: 1, y: 1, type: SKULL });
    step(s, {});
    const c = s.players[0].curse;
    assert.ok(CURSES.includes(c.type));
    assert.ok(c.t > 500);
    seen.add(c.type);
  }
  assert.equal(seen.size, CURSES.length);
});

test("teams: round ends when one team is left; friendly fire off spares teammates", () => {
  const s = newGame(4, 1, { teams: [0, 1, 0, 1] });
  s.players[1].alive = s.players[3].alive = false;
  step(s, {});
  assert.equal(s.end > 0, true);
  assert.equal(s.winnerTeam, 0);
  assert.ok([0, 2].includes(s.winner));

  const t = newGame(4, 1, { teams: [0, 1, 0, 1] });
  t.players[3].alive = false;
  step(t, {});
  assert.equal(t.end, -1, "two teams still alive");

  const ff = (friendlyFire) => {
    const g = newGame(4, 1, { teams: [0, 1, 0, 1], friendlyFire });
    g.grid.fill(0);
    place(g.players[0], 7, 1); place(g.players[2], 3, 5); place(g.players[1], 3, 6); place(g.players[3], 12, 11);
    g.bombs.push(bomb(3, 4, { owner: 0, t: 1, range: 3 }));
    step(g, {});
    return g.players.map((p) => p.alive);
  };
  assert.deepEqual(ff(true), [true, false, false, true]);
  assert.deepEqual(ff(false), [true, false, true, true]);
});

test("friendly fire off: teammate's flames still chain bombs and burn walls", () => {
  const g = newGame(4, 1, { teams: [0, 1, 0, 1], friendlyFire: false });
  g.grid.fill(0);
  g.grid[5 * W + 6] = 2;
  g.bombs.push(bomb(3, 5, { owner: 0, t: 1, range: 2 }), bomb(5, 5, { owner: 2, t: 99, range: 1 }));
  step(g, {});
  assert.equal(g.bombs.length, 0);
  assert.equal(g.grid[5 * W + 6], 0);
});

test("suddenDeath: false disables the closing ring", () => {
  const s = newGame(2, 1, { suddenDeath: false });
  const before = s.grid.join("");
  run(s, SUDDEN + 400);
  assert.equal(s.grid.join(""), before);
  assert.deepEqual(doomed(s, 600), []);
  assert.equal(s.players.every((p) => p.alive), true);
});

test("determinism with opts + snapshot stays JSON-serialisable", () => {
  const opts = { layout: "maze", teams: [0, 1, 0, 1], friendlyFire: false, softDensity: 0.9 };
  const play = () => {
    const s = newGame(4, 5, opts);
    for (const p of s.players) { p.kick = p.remote = true; p.curse = { type: "auto", t: 400 }; }
    for (let i = 0; i < 600; i++) step(s, { 0: { dx: (i >> 5) % 3 - 1, bomb: i % 50 === 0 }, 1: { dy: (i >> 4) % 3 - 1, bomb: i % 70 === 0 }, 2: { dx: 1, dy: 0 } });
    return s;
  };
  const a = play(), b = play();
  assert.deepEqual(a, b);
  const snap = snapshot(a);
  assert.deepEqual(JSON.parse(JSON.stringify(snap)), JSON.parse(JSON.stringify(snap)));
  assert.equal(JSON.parse(JSON.stringify(snap)).cfg.layout, "maze");
});

test("item type ids", () => {
  assert.deepEqual([KICK, REMOTE, PASS, SHIELD, SKULL], [3, 4, 5, 6, 7]);
});
