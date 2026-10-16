import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, W, T } from "./sim.js";
import { createObserver } from "./fx.js";

const run = (obs, s) => { const out = []; obs(s, (...e) => out.push(e)); return out; };
const clone = (s) => structuredClone(s);

test("first state and unchanged state emit nothing", () => {
  const obs = createObserver(), s = newGame(2, 1);
  assert.deepEqual(run(obs, s), []);
  assert.deepEqual(run(obs, clone(s)), []);
});

test("wall, bomb, death and pickup are detected once", () => {
  const obs = createObserver(), s = newGame(2, 1);
  run(obs, s);
  const a = clone(s);
  const wi = a.grid.indexOf(2);
  a.grid[wi] = 0;
  a.bombs.push({ x: 1, y: 1, owner: 0, t: 100, range: 2 });
  a.players[1].alive = false;
  assert.deepEqual(run(obs, a), [["wall", wi % W, Math.floor(wi / W)], ["bomb", 1, 1], ["die", 1]]);
  assert.deepEqual(run(obs, clone(a)), []);

  const b = clone(a);
  b.items.push({ x: 3, y: 1, type: 4 });
  run(obs, b);
  const c = clone(b);
  c.items = [];
  c.players[0].x = 3 * T + 8; c.players[0].y = 1 * T + 8;
  assert.deepEqual(run(obs, c), [["pick", 3, 1, 4]]);
});

test("burned item without a player on it is not a pickup; sliding bombs are not drops", () => {
  const obs = createObserver(), s = newGame(2, 1);
  s.items.push({ x: 5, y: 1, type: 0 });
  run(obs, s);
  const a = clone(s);
  a.items = [];
  a.bombs.push({ x: 6, y: 1, owner: 0, t: 50, range: 2, dx: 1, dy: 0 });
  assert.deepEqual(run(obs, a), []);
});

test("a new round resets", () => {
  const obs = createObserver(), s = newGame(2, 1);
  for (let i = 0; i < 100; i++) step(s, [{}, {}]);
  run(obs, s);
  assert.deepEqual(run(obs, newGame(2, 2)), [["reset"]]);
});
