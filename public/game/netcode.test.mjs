import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step, T } from "./sim.js";
import { createInbox, createGuestNet, packSnap, unpackSnap, packInput, TICK_MS } from "./netcode.js";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const wire = (o) => JSON.parse(JSON.stringify(o));

// Host sim + guest predictor (player 1) over a simulated link; returns stats.
function simulate({ lag, jitter, loss = 0, reorder = false, bombs = 0, seconds = 20, seed = 1, setup, held }) {
  const rand = rng(seed);
  const s = newGame(2, 7), inbox = createInbox();
  s.grid = s.grid.map((g) => (g === 2 ? 0 : g));
  setup?.(s);
  const gnet = createGuestNet(1);
  const events = [];
  const send = (fn, ordered, state) => {
    if (rand() < loss) return;
    let at = now + lag + rand() * jitter;
    if (ordered) at = state.at = Math.max(state.at, at);
    events.push({ at, fn });
  };
  const down = { at: 0 }, up = { at: 0 };
  let now = 0, hostNext = 0, guestNext = 3, hostTicks = 0, guestTicks = 0, snaps = 0, lastGrid = null;
  let maxErr = 0, errSum = 0, errN = 0;
  const script = held ? [held] : [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]];
  let cur = script[0], left = 0;
  const total = seconds * 1000;
  while (now < total + 1500) {
    events.sort((a, b) => a.at - b.at);
    while (events.length && events[0].at <= now) events.shift().fn();
    if (now >= hostNext) {
      hostNext += TICK_MS;
      step(s, { 1: inbox.next() });
      if (++hostTicks % 2 === 0) {
        const msg = wire({ s: packSnap(s, snaps++ % 30 === 0), a: [null, inbox.ack] });
        send(() => {
          const u = unpackSnap(msg.s, lastGrid);
          lastGrid = u.grid;
          gnet.onSnap(u, msg.a[1], now);
          maxErr = Math.max(maxErr, gnet.err);
          errSum += gnet.err; errN++;
        }, true, down);
      }
    }
    if (now >= guestNext) {
      guestNext += TICK_MS;
      if (now < total && --left <= 0) {
        cur = script[Math.floor(rand() * script.length)];
        left = 4 + Math.floor(rand() * 40);
      }
      const bomb = now < total && rand() < bombs;
      gnet.tick({ dx: now < total ? cur[0] : 0, dy: now < total ? cur[1] : 0, bomb });
      if (++guestTicks % 2 === 0) {
        const m = gnet.take();
        if (m) {
          const msg = wire(m);
          const hop = reorder ? () => (rand() < 0.3 ? 40 * rand() : 0) : () => 0;
          events.push({ at: now + lag + rand() * jitter + hop(), fn: () => inbox.push(msg.n, msg.d) });
          if (loss && rand() < loss) events.pop();
        }
      }
      gnet.frame(now);
    }
    now += 1;
  }
  const own = gnet.frame(now).players[1], host = s.players[1];
  return { own, host, maxErr, meanErr: errSum / errN, walk: host.walk, alive: host.alive, bombs: s.bombs };
}

function mustMove(r) {
  assert.ok(r.walk > 300 && r.alive, `guest barely moved: walk ${r.walk}`);
}

test("prediction: zero corrections at 100 ms RTT without jitter", () => {
  const r = simulate({ lag: 50, jitter: 0 });
  assert.ok(r.maxErr < 0.5, `max error ${r.maxErr}`);
  mustMove(r);
  assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
});

test("prediction: small corrections at 100 ms RTT with 40 ms jitter, converges exactly", () => {
  for (const seed of [3, 4, 5, 6]) {
    const r = simulate({ lag: 50, jitter: 40, seed });
    console.log("jitter40 seed", seed, "maxErr", r.maxErr.toFixed(2), "meanErr", r.meanErr.toFixed(3));
    assert.ok(r.maxErr < 8, `max error ${r.maxErr}`);
    mustMove(r);
    assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
  }
});

test("prediction: 5% loss + reordered inputs still converge, no snaps", () => {
  const r = simulate({ lag: 60, jitter: 30, loss: 0.05, reorder: true, seed: 5 });
  console.log("loss5", r.maxErr.toFixed(2), r.meanErr.toFixed(3));
  assert.ok(r.maxErr < 24, `max error ${r.maxErr}`);
  mustMove(r);
  assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
});

test("prediction: ghost bombs and replayed bomb collisions stay in sync", () => {
  const r = simulate({ lag: 50, jitter: 20, bombs: 0.004, seed: 11, seconds: 8 });
  assert.ok(r.maxErr < 24, `max error ${r.maxErr}`);
});

test("inbox: late bomb is kept, hostile data is sanitised, dropped guest goes idle", () => {
  const ib = createInbox();
  ib.push(100, [packInput({ dx: 1 }), packInput({ dx: 1 })]);
  for (let i = 0; i < 4; i++) ib.next();
  ib.push(100, [packInput({ bomb: true })]);
  assert.equal(ib.next().bomb, true);
  ib.push(Number.NaN, "x");
  ib.push(5e15, [999, -3, "a"]);
  for (let i = 0; i < 30; i++) ib.next();
  assert.deepEqual(ib.next(), { dx: 0, dy: 0, bomb: false });
});

test("snapshots: packed form round-trips and is lighter", () => {
  const s = newGame(4, 9);
  s.flames.push({ x: 3, y: 1, t: 20 });
  for (let i = 0; i < 200; i++) step(s, { 0: { dx: 1, bomb: i % 40 === 0 }, 1: { dy: -1, bomb: i % 50 === 0 } });
  const old = JSON.stringify({ ...s, hidden: undefined }).length;
  const full = JSON.stringify(packSnap(s, true)).length, lean = JSON.stringify(packSnap(s, false)).length;
  console.log("snapshot bytes old/full/lean", old, full, lean);
  assert.ok(lean < old * 0.6);
  const { hidden, rs, ...expected } = s;
  assert.deepEqual(unpackSnap(wire(packSnap(s, true))), expected);
  assert.equal(unpackSnap(wire(packSnap(s, false))), null);
});

test("interpolation: remote player moves smoothly between 30 Hz snapshots under jitter", () => {
  const g = createGuestNet(0);
  const base = newGame(2, 3);
  const rand = rng(9);
  const xs = [];
  let now = 0, tick = 0;
  const arrivals = [];
  for (let k = 0; k < 120; k++) {
    tick += 2;
    const s = structuredClone(base);
    s.tick = tick;
    s.players[1].x = 100 + tick; // 1 px per tick
    arrivals.push({ at: k * 2 * TICK_MS + 40 + rand() * 30, s });
  }
  arrivals.sort((a, b) => a.at - b.at);
  for (now = 0; now < 3500; now += TICK_MS) {
    while (arrivals.length && arrivals[0].at <= now) g.onSnap(arrivals[0].s, null, arrivals.shift().at);
    const f = g.frame(now);
    if (f && now > 1000) xs.push(f.players[1].x);
  }
  const steps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(Math.max(...steps) < 2.5 && Math.min(...steps) > 0, `steps ${Math.min(...steps)}..${Math.max(...steps)}`);
});

test("new round (tick regression) resets interpolation without sliding", () => {
  const g = createGuestNet(0);
  const mk = (tick, x) => { const s = newGame(2, 3); s.tick = tick; s.players[1].x = x; return s; };
  g.onSnap(mk(500, 200), null, 0);
  g.onSnap(mk(502, 202), null, 33);
  g.frame(500);
  g.onSnap(mk(2, 40), null, 600);
  assert.equal(g.frame(610).players[1].x, 40);
});

const curseP1 = (type) => (s) => { s.players[1].curse = { type, t: 1e6 }; };

for (const type of ["reverse", "slow", "fast"]) {
  test(`prediction: ${type} curse stays in sync with the host`, () => {
    const r = simulate({ lag: 50, jitter: 20, seconds: 15, seed: 8, setup: curseP1(type) });
    assert.ok(r.maxErr < 8, `max error ${r.maxErr}`);
    mustMove(r);
    assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
  });
}

test("prediction: kicking a bomb is corrected by snapshots, no teleport, converges", () => {
  const r = simulate({
    lag: 50, jitter: 20, seconds: 8, seed: 2, held: [-1, 0],
    setup: (s) => { s.players[1].kick = true; s.bombs.push({ x: 11, y: 11, owner: 0, t: 99999, range: 2, pass: [] }); },
  });
  assert.equal(r.bombs[0].x, 1, "bomb was kicked to the wall");
  assert.ok(r.maxErr < 24, `max error ${r.maxErr}`);
  assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
});

test("pass: guest walks through its own bomb like the host", () => {
  const r = simulate({ lag: 50, jitter: 20, seconds: 6, seed: 4, held: [-1, 0], setup: (s) => { s.players[1].pass = true; s.bombs.push({ x: 11, y: 11, owner: 0, t: 99999, range: 2, pass: [] }); } });
  assert.ok(r.maxErr < 8, `max error ${r.maxErr}`);
  assert.deepEqual([r.own.x, r.own.y], [r.host.x, r.host.y]);
});

test("snapshots: shield, curse, sliding bombs, teams and theme survive the wire", () => {
  const s = newGame(4, 9, { teams: [0, 1, 0, 1], friendlyFire: false });
  s.cfg.theme = "lava";
  s.players[0].shield = 200;
  s.players[1].curse = { type: "auto", t: 300 };
  s.players[2].kick = s.players[2].remote = s.players[2].pass = true;
  s.bombs.push({ x: 3, y: 3, owner: 0, t: 100, range: 2, pass: [], dx: 1, dy: 0, sc: 3 });
  s.flames.push({ x: 2, y: 2, t: 9, o: 1 });
  s.winnerTeam = 1;
  const full = unpackSnap(wire(packSnap(s, true)));
  assert.deepEqual(full.players, s.players);
  assert.deepEqual(full.bombs, s.bombs);
  assert.deepEqual(full.cfg, s.cfg);
  assert.equal(full.winnerTeam, 1);
  const lean = unpackSnap(wire(packSnap(s, false)), full.grid, full.cfg);
  assert.deepEqual(lean.cfg, s.cfg);
  assert.deepEqual(lean.players, s.players);
});

test("interpolation: a sliding bomb advances smoothly between snapshots", () => {
  const g = createGuestNet(0);
  const mk = (tick, sc) => { const s = newGame(2, 3); s.tick = tick; s.bombs.push({ x: 5, y: 5, owner: 1, t: 99, range: 2, pass: [], dx: 1, dy: 0, sc }); return s; };
  g.onSnap(mk(100, 0), null, 0);
  g.onSnap(mk(102, 2), null, 33);
  const scs = [];
  for (let now = 100; now < 200; now += 10) scs.push(g.frame(now).bombs[0].sc);
  assert.ok(scs.every((v, i) => !i || v >= scs[i - 1]) && scs.at(-1) > 0, scs.join());
});
