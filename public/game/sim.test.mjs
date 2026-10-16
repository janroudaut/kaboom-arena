import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, T, W, FUSE, SUDDEN, SUDDEN_EVERY } from "./sim.js";

const run = (s, n, inputs = {}) => { for (let i = 0; i < n; i++) step(s, inputs); };

test("same seed + inputs => same state", () => {
  const a = newGame(4, 42), b = newGame(4, 42);
  run(a, 300, { 0: { dx: 1 } });
  run(b, 300, { 0: { dx: 1 } });
  assert.deepEqual(a, b);
});

test("spawn corners are clear", () => {
  const s = newGame(4, 1);
  for (const p of s.players) {
    const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T);
    assert.equal(s.grid[ty * W + tx], 0);
  }
});

test("player cannot walk through hard blocks", () => {
  const s = newGame(2, 1);
  run(s, 200, { 0: { dx: -1 } });
  assert.ok(s.players[0].x >= T + 6);
});

test("bomb explodes, kills owner standing on it, ends round", () => {
  const s = newGame(2, 1);
  step(s, { 0: { bomb: true } });
  assert.equal(s.bombs.length, 1);
  run(s, FUSE + 5);
  assert.equal(s.players[0].alive, false);
  run(s, 200);
  assert.equal(s.done, true);
  assert.equal(s.winner, 1);
});

test("player leaves own bomb tile, then bomb blocks", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.grid[0] = 1;
  step(s, { 0: { bomb: true } });
  run(s, 40, { 0: { dx: 1 } });
  const x = s.players[0].x;
  run(s, 40, { 0: { dx: -1 } });
  assert.ok(s.players[0].x > T * 1.5 - 1, `blocked by bomb, x=${s.players[0].x} from ${x}`);
});

test("chain reaction", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.players[1].alive = false;
  s.bombs.push({ x: 5, y: 5, owner: 1, t: 1, range: 3, pass: [] });
  s.bombs.push({ x: 7, y: 5, owner: 1, t: 100, range: 1, pass: [] });
  step(s, {});
  assert.equal(s.bombs.length, 0);
});

test("soft wall destroyed, hidden item revealed, blast stops at wall", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.grid[5 * W + 7] = 2;
  s.grid[5 * W + 8] = 2;
  s.hidden[5 * W + 7] = 1;
  s.bombs.push({ x: 5, y: 5, owner: 1, t: 1, range: 4, pass: [] });
  step(s, {});
  assert.equal(s.grid[5 * W + 7], 0);
  assert.equal(s.grid[5 * W + 8], 2);
  assert.deepEqual(s.items, [{ x: 7, y: 5, type: 1 }]);
});

test("sudden death closes in, kills an idle player, ends the round", () => {
  const s = newGame(2, 1);
  run(s, SUDDEN + 150 * SUDDEN_EVERY);
  assert.equal(s.done, true);
  assert.ok(s.players.filter((p) => p.alive).length <= 1);
});

test("player slides around a block corner into an open lane", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.grid[2 * W + 4] = 1;
  s.players[0].x = 3 * T + 10;
  s.players[0].y = 1 * T + 8;
  run(s, 60, { 0: { dy: 1 } });
  assert.ok(s.players[0].y > 2 * T + 8, `y=${s.players[0].y}`);
});

test("player straddling a tile when a bomb lands there is not trapped inside it", () => {
  const s = newGame(2, 1);
  s.grid.fill(0);
  s.players[0].x = 9 * T + 8;
  s.players[0].y = 2 * T - 3;
  s.players[1].x = 9 * T + 8;
  s.players[1].y = 3 * T + 8;
  step(s, { 1: { bomb: true } });
  const y = s.players[0].y;
  run(s, 20, { 0: { dy: -1 } });
  assert.ok(s.players[0].y < y);
});
