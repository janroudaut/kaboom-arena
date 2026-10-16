import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, SUDDEN, KICK, REMOTE, SKULL, SHIELD, W } from "./sim.js";
import { think } from "./ai.js";

test("4 bots play to completion without throwing", () => {
  const s = newGame(4, 7);
  const mem = [{}, {}, {}, {}];
  for (let i = 0; i < 60 * 180 && !s.done; i++) {
    const inputs = {};
    if (i % 6 === 0) s.players.forEach((p) => (mem[p.id] = think(s, p.id, () => 0.5)));
    s.players.forEach((p) => (inputs[p.id] = { ...mem[p.id] }));
    step(s, inputs);
    if (i % 6 === 0) s.players.forEach((p) => (mem[p.id] = { ...mem[p.id], bomb: false }));
  }
  assert.ok(s.tick > 600, "game lasted");
  assert.ok(s.bombs.length + s.flames.length >= 0);
});

test("bot flees from a bomb about to blow", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  const p = s.players[0];
  s.bombs.push({ x: Math.floor(p.x / 16), y: Math.floor(p.y / 16), owner: 1, t: 50, range: 3, pass: [] });
  const out = think(s, 0, () => 0.5);
  assert.ok(out.dx || out.dy);
});

test("bot steps off a tile the sudden-death ring is about to close", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.tick = SUDDEN - 10;
  const out = think(s, 0, () => 0.5);
  assert.ok(out.dx || out.dy);
});

test("4 bots survive into sudden death more often than they stall", () => {
  let done = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const s = newGame(4, seed), mem = [{}, {}, {}, {}];
    for (let i = 0; i < 60 * 400 && !s.done; i++) {
      if (i % 6 === 0) s.players.forEach((p) => (mem[p.id] = think(s, p.id)));
      const inputs = {};
      s.players.forEach((p) => (inputs[p.id] = { ...mem[p.id] }));
      step(s, inputs);
      if (i % 6 === 0) s.players.forEach((p) => (mem[p.id].bomb = false));
    }
    done += s.done;
  }
  assert.equal(done, 10);
});

test("bot walks to a nearby bonus", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.items.push({ x: 4, y: 1, type: 0 });
  assert.deepEqual(think(s, 0, () => 0.5), { dx: 1, dy: 0 });
});

test("bot walks to a shield but never to kick, remote or skull", () => {
  const corridor = (type) => {
    const s = newGame(2, 1);
    s.grid.fill(1);
    for (let x = 1; x <= 6; x++) s.grid[W + x] = 0;
    s.items.push({ x: 3, y: 1, type });
    return think(s, 0, () => 0.5);
  };
  assert.deepEqual(corridor(SHIELD), { dx: 1, dy: 0 });
  for (const type of [KICK, REMOTE, SKULL]) assert.deepEqual(corridor(type), {}, `type ${type}`);
});

test("default level is normal; every level returns a legal input", () => {
  const s = newGame(2, 3);
  for (const lvl of [undefined, "easy", "normal", "hard", "bogus"]) {
    const out = think(s, 0, () => 0.9, lvl);
    assert.ok(typeof out === "object");
  }
  assert.deepEqual(think(s, 0, () => 0.5), think(s, 0, () => 0.5, "normal"));
});

function duel(a, b, seed) {
  let x = seed * 7 + 1;
  const rand = () => {
    x = (x + 0x6d2b79f5) | 0;
    let t = Math.imul(x ^ (x >>> 15), 1 | x);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const s = newGame(2, seed), lv = [a, b], mem = [{}, {}];
  for (let i = 0; i < 60 * 150 && !s.done; i++) {
    if (i % 6 === 0) s.players.forEach((p) => (mem[p.id] = think(s, p.id, rand, lv[p.id])));
    step(s, { 0: { ...mem[0] }, 1: { ...mem[1] } });
    if (i % 6 === 0) mem.forEach((m) => (m.bomb = false));
  }
  return s.winner;
}

// Wins of `a` and `b` over rounds played from both corners.
function match(a, b, n) {
  let wa = 0, wb = 0;
  for (let k = 1; k <= n; k++) {
    const w = duel(a, b, k), v = duel(b, a, k + 1000);
    wa += (w === 0) + (v === 1);
    wb += (w === 1) + (v === 0);
  }
  return [wa, wb];
}

test("tournament: hard and normal beat easy by a clear margin, hard at least holds against normal", () => {
  const [he, eh] = match("hard", "easy", 25);
  const [ne, en] = match("normal", "easy", 25);
  const [hn, nh] = match("hard", "normal", 25);
  console.log("hard/easy", he, eh, "normal/easy", ne, en, "hard/normal", hn, nh);
  assert.ok(he >= 2 * eh && he >= 30, `hard ${he} vs easy ${eh}`);
  assert.ok(ne >= 2 * en && ne >= 30, `normal ${ne} vs easy ${en}`);
  assert.ok(hn >= nh - 5, `hard ${hn} vs normal ${nh}`);
});

test("teams: a bot does not treat its teammate as a target", () => {
  const mk = (teams) => {
    const s = newGame(4, 1, { teams });
    s.grid.fill(0);
    const put = (p, x, y) => { p.x = x * 16 + 8; p.y = y * 16 + 8; };
    put(s.players[0], 3, 5); put(s.players[2], 5, 5); put(s.players[1], 13, 11); put(s.players[3], 12, 1);
    return s;
  };
  assert.equal(think(mk(null), 0, () => 0, "hard").bomb, true);
  assert.notEqual(think(mk([0, 1, 0, 1]), 0, () => 0, "hard").bomb, true);
});
