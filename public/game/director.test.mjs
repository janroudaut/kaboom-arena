import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, T, FUSE, SUDDEN } from "./sim.js";
import { createTracker, createAnnouncer, createDirector, awards, recapView, timeScale, wrap, placeBubble } from "./director.js";

const cx = (t) => t * T + T / 2;
const place = (p, tx, ty) => { p.x = cx(tx); p.y = cx(ty); };
function arena(n = 2) {
  const s = newGame(n, 1);
  s.grid.fill(0);
  for (let i = 0; i < s.grid.length; i++) { const x = i % 15, y = (i / 15) | 0; if (!x || !y || x === 14 || y === 12) s.grid[i] = 1; }
  s.items = [];
  place(s.players[0], 3, 5);
  place(s.players[1], 12, 11);
  return s;
}
const bomb = (x, y, owner, t = 1, range = 2) => ({ x, y, owner, t, range, pass: [] });
const watch = (s) => {
  const tr = createTracker(), ev = [];
  const on = (...e) => ev.push(e);
  tr.update(s, on);
  return { tr, ev, sync() { tr.update(s, on); ev.length = 0; }, go(n = 1) { for (let i = 0; i < n; i++) { step(s, {}); tr.update(s, on); } return ev; } };
};

test("own bomb: Darwin death, blast and bomb stats", () => {
  const s = arena(), w = watch(s);
  s.bombs.push(bomb(3, 5, 0));
  w.sync();
  w.go();
  assert.deepEqual(w.ev, [["blast", 1, 0], ["die", 0, 0], ["decide", 1]]);
  assert.deepEqual([w.tr.round().own[0], w.tr.round().kills[0]], [1, 0]);
});

test("a kill is credited to the bomb owner, including walking into a lingering flame", () => {
  const s = arena(), w = watch(s);
  s.bombs.push(bomb(11, 11, 0, 1, 3));
  w.sync();
  w.go();
  assert.deepEqual(w.ev.filter((e) => e[0] === "die"), [["die", 1, 0]]);
  assert.equal(w.tr.round().kills[0], 1);

  const t = arena(), v = watch(t);
  t.bombs.push(bomb(8, 5, 1, 1, 3));
  v.sync();
  v.go();
  place(t.players[0], 6, 5);
  v.go();
  assert.deepEqual(v.ev.filter((e) => e[0] === "die"), [["die", 0, 1]]);
});

test("double kill gives two die events in one step; chain counts bombs; close call; walls", () => {
  const s = arena(), w = watch(s);
  place(s.players[1], 4, 5);
  s.bombs.push(bomb(3, 5, 0));
  w.sync();
  w.go();
  assert.equal(w.ev.filter((e) => e[0] === "die").length, 2);

  const c = arena(), k = watch(c);
  place(c.players[0], 1, 1); place(c.players[1], 13, 11);
  c.bombs.push(bomb(5, 5, 0, 1, 2), bomb(6, 5, 0, 99, 2), bomb(7, 5, 1, 99, 2));
  k.sync();
  k.go();
  assert.deepEqual(k.ev.find((e) => e[0] === "blast"), ["blast", 3, 0]);

  const n = arena(), q = watch(n);
  n.bombs.push(bomb(5, 5, 1, 1, 2));
  place(n.players[0], 8, 5);
  q.sync();
  q.go();
  assert.deepEqual(q.ev.filter((e) => e[0] === "close"), [["close", 0]]);

  const m = arena(), h = watch(m);
  m.grid[5 * 15 + 6] = 2;
  m.grid[4 * 15 + 5] = 2;
  m.bombs.push(bomb(5, 5, 1, 1, 2));
  h.sync();
  h.go();
  assert.equal(h.tr.round().walls[1], 2);
});

test("bombs, pickups, sudden death, decide and done; ghost bombs vanishing are not blasts", () => {
  const s = arena(), w = watch(s);
  w.go();
  s.items.push({ x: 4, y: 5, type: 6 });
  w.go();
  place(s.players[0], 4, 5);
  s.items = [];
  w.ev.length = 0;
  w.tr.update(s, (...e) => w.ev.push(e));
  assert.deepEqual(w.ev, [["pick", 0, 6]]);

  s.bombs.push(bomb(9, 9, 0, 999));
  w.ev.length = 0;
  w.tr.update(s, (...e) => w.ev.push(e));
  assert.deepEqual(w.ev, [["bomb", 0]]);
  s.bombs = [];
  w.ev.length = 0;
  w.tr.update(s, (...e) => w.ev.push(e));
  assert.deepEqual(w.ev, []);

  s.tick = SUDDEN + 7;
  s.sd = 1;
  s.players[1].alive = false;
  s.end = 120; s.winner = 0;
  w.ev.length = 0;
  w.tr.update(s, (...e) => w.ev.push(e));
  assert.deepEqual(w.ev.map((e) => e[0]), ["die", "sudden", "decide"]);
  assert.deepEqual(w.ev[0], ["die", 1, -1]);
  s.done = true;
  w.ev.length = 0;
  w.tr.update(s, (...e) => w.ev.push(e));
  assert.deepEqual(w.ev, [["done"]]);
  assert.equal(w.tr.total().items[0], 1);
  w.tr.update({ ...s, tick: 1, done: false, end: -1 }, (...e) => w.ev.push(e));
  assert.equal(w.ev.at(-1)[0], "reset");
  assert.equal(w.tr.round().items[0], 0);
  assert.equal(w.tr.total().items[0], 1);
});

test("awards need a strict, non-trivial maximum and cap at 3", () => {
  const st = { bombs: [5, 2, 0, 0], kills: [0, 2, 0, 0], own: [0, 0, 1, 0], items: [2, 2, 0, 0], walls: [1, 6, 0, 0] };
  const a = awards(st, 4);
  assert.deepEqual(a.map((x) => [x.title, x.who]), [["Darwin Award", 2], ["Terminator", 1], ["Pyromaniac", 0]]);
  assert.deepEqual(awards({ bombs: [3, 3], kills: [1, 0], own: [0, 0], items: [2, 2], walls: [0, 0] }, 2), []);
  const v = recapView(st, 2, ["A"]);
  assert.deepEqual([v.rows.length, v.rows[0].name, v.rows[1].name, v.rows[0].cells], [2, "A", "P2", [5, 0, 2, 1]]);
});

test("announcer: cooldown, priority preempts, queue cap, stale queue entries dropped", () => {
  const a = createAnnouncer();
  assert.equal(a.push("a", "ONE", { prio: 1, cd: 5000 }, 0), true);
  assert.equal(a.push("a", "ONE", { prio: 1 }, 2000), false);
  assert.equal(a.push("b", "TWO", { prio: 0 }, 100), true);
  assert.equal(a.push("c", "THREE", { prio: 0 }, 100), true);
  assert.equal(a.push("d", "FOUR", { prio: 0 }, 100), false);
  assert.equal(a.tick(200).text, "ONE");
  assert.equal(a.push("e", "BIG", { prio: 3 }, 300), true);
  assert.equal(a.tick(300).text, "BIG");
  assert.equal(a.tick(1800).text, "TWO");
  assert.equal(a.tick(5000), null);
});

test("director: banners, hit-stop, slow-mo only when allowed; bubbles are rate limited", () => {
  const ctx = { human: (i) => i === 0, announce: true, timeFx: true, punch: true, chat: true, still: false, line: (i, ev) => `${i} ${ev} line`, rand: () => 0 };
  const t = arena(), d2 = createDirector();
  d2.update(t, 0, ctx);
  t.bombs.push(bomb(3, 5, 0));
  d2.update(t, 1, ctx);
  step(t, {});
  const k = d2.update(t, 5, ctx);
  assert.equal(k.text, "DARWIN AWARD");
  assert.equal(d2.hitUntil, 85);
  assert.ok(d2.slowUntil > 800 && d2.punch);
  assert.equal(d2.bub[0].text, "0 die line");
  assert.equal(d2.nextSay[0], 8005);
  assert.equal(timeScale(d2, 50), 0);
  assert.equal(timeScale(d2, 300), 0.35);
  assert.equal(timeScale(d2, 2000), 1);

  const d3 = createDirector(), t3 = arena();
  d3.update(t3, 0, { ...ctx, timeFx: false, chat: false, announce: false });
  t3.bombs.push(bomb(3, 5, 0));
  d3.update(t3, 1, { ...ctx, timeFx: false, chat: false, announce: false });
  step(t3, {});
  assert.equal(d3.update(t3, 5, { ...ctx, timeFx: false, chat: false, announce: false }), null);
  assert.equal(d3.hitUntil + d3.slowUntil, 0);
  assert.equal(d3.bub[0], null);
});

test("bubble helpers: wrap in two lines, placement avoids the centre hole", () => {
  assert.deepEqual(wrap("Fire in the hole, kid!"), ["Fire in the", "hole, kid!"]);
  assert.deepEqual(wrap("Short"), ["Short"]);
  const out = {}, box = [0, 16, 240, 224], hole = [80, 70, 160, 150];
  placeBubble(out, 30, 100, 60, 26, box, hole);
  assert.deepEqual([out.x, out.y, out.tail], [0, 68, true]);
  placeBubble(out, 120, 90, 60, 26, box, hole);
  assert.deepEqual([out.y, out.tail], [16, false]);
  placeBubble(out, 120, 140, 60, 26, box, hole);
  assert.deepEqual([out.y, out.tail], [198, false]);
});
