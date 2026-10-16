import { W, H, T, blast, doomed, spikeIn, KICK, REMOTE, SKULL, ICE, CONV, SPIKE, TELE, POTATO_RANGE } from "./sim.js";

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ESCAPE_MAX = 6, DOOM_HORIZON = 120, DOOM_TIME = 40, SPIKE_HORIZON = 100, HOLDER_FLEE = 2;
const LEVELS = {
  easy: { margin: 0, bombP: 0.4, idle: 0.5, grabP: 0.4, itemRange: 8 },
  normal: { margin: 16, bombP: 0.8, idle: 0, grabP: 1, itemRange: 8 },
  hard: { margin: 24, bombP: 1, idle: 0, grabP: 1, itemRange: 8 },
};
const AVOID = [KICK, REMOTE, SKULL];

const idx = (x, y) => y * W + x;
const steer = (dir) => ({ dx: DIRS[dir][0], dy: DIRS[dir][1] });

// tm[i] = ticks until cell i is hit (Infinity if never). Chains: a bomb caught in another's blast goes off with it.
function dangerMap(s, extra, id) {
  const tm = new Array(W * H).fill(Infinity);
  const holder = s.potato && s.potato.holder !== id && s.players[s.potato.holder];
  const virtual = holder?.alive ? [{ x: Math.floor(holder.x / T), y: Math.floor(holder.y / T), range: POTATO_RANGE, t: s.potato.t }] : [];
  const bombs = [...s.bombs, ...(extra ? [extra] : []), ...virtual].map((b) => ({ ...b, t: b.t ?? 150 }));
  const sim = { grid: s.grid, bombs };
  const cells = bombs.map((b) => blast(sim, b.x, b.y, b.range));
  for (let changed = true; changed;) {
    changed = false;
    bombs.forEach((a, i) => {
      for (const [x, y] of cells[i]) {
        for (const c of bombs) if (c !== a && c.x === x && c.y === y && c.t > a.t) { c.t = a.t; changed = true; }
      }
    });
  }
  bombs.forEach((b, i) => { for (const [x, y] of cells[i]) tm[idx(x, y)] = Math.min(tm[idx(x, y)], b.t); });
  for (const f of s.flames) tm[idx(f.x, f.y)] = 0;
  for (const [x, y] of doomed(s, DOOM_HORIZON)) tm[idx(x, y)] = Math.min(tm[idx(x, y)], DOOM_TIME);
  s.floor?.forEach((f, i) => {
    if (f === SPIKE) tm[i] = Math.min(tm[i], spikeIn(s, i));
  });
  return tm;
}

// BFS over walkable tiles; returns first-step direction to the nearest tile satisfying `goal`.
function bfs(s, from, goal, canEnter, maxDepth = 99) {
  const seen = new Set([idx(from.x, from.y)]);
  let frontier = [[from.x, from.y, -1, 0]];
  while (frontier.length) {
    const next = [];
    for (const [x, y, first, depth] of frontier) {
      if (depth > 0 && goal(x, y)) return { dir: first, depth };
      if (depth >= maxDepth) continue;
      DIRS.forEach(([dx, dy], k) => {
        const nx = x + dx, ny = y + dy, i = idx(nx, ny);
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(i) || s.floor?.[i] >= TELE) return;
        if (s.grid[i] !== 0 || s.bombs.some((b) => b.x === nx && b.y === ny) || !canEnter(nx, ny, depth + 1)) return;
        seen.add(i);
        next.push([nx, ny, depth === 0 ? k : first, depth + 1]);
      });
    }
    frontier = next;
  }
  return null;
}

export function think(s, id, rand = Math.random, level = "normal") {
  const p = s.players[id];
  if (!p.alive) return {};
  const lv = LEVELS[level] || LEVELS.normal;
  if (lv.idle && rand() < lv.idle) return {};
  const me = { x: Math.floor(p.x / T), y: Math.floor(p.y / T) };
  const ticksPerTile = (T / p.speed) * 1.5;
  const flee = (tm, strict) => {
    const slick = (x, y) => s.floor?.[idx(x, y)] === ICE || s.floor?.[idx(x, y)] - CONV < 4 && s.floor?.[idx(x, y)] >= CONV;
    const timed = (x, y, depth) => depth * ticksPerTile < tm[idx(x, y)] - lv.margin && (!strict || !slick(x, y));
    const goal = (x, y) => tm[idx(x, y)] === Infinity;
    return bfs(s, me, goal, timed, ESCAPE_MAX) || (!strict && bfs(s, me, goal, (x, y) => tm[idx(x, y)] > 0, ESCAPE_MAX));
  };

  const tm = dangerMap(s, null, id);
  const bad = (x, y) => s.items.some((it) => it.x === x && it.y === y && AVOID.includes(it.type));
  const spikeFar = (x, y) => s.floor?.[idx(x, y)] === SPIKE && tm[idx(x, y)] > SPIKE_HORIZON;
  const safe = (x, y) => (tm[idx(x, y)] === Infinity || spikeFar(x, y)) && !bad(x, y);

  if (tm[idx(me.x, me.y)] !== Infinity && !spikeFar(me.x, me.y)) {
    const r = flee(tm);
    return r ? steer(r.dir) : {};
  }

  const team = (i) => s.cfg?.teams?.[i] ?? i;
  const enemies = s.players.filter((q) => q.alive && team(q.id) !== team(id));
  const cheb = (q) => Math.max(Math.abs(Math.floor(q.x / T) - me.x), Math.abs(Math.floor(q.y / T) - me.y));
  const po = s.potato;
  if (po && po.holder === id) {
    const r = bfs(s, me, (x, y) => enemies.some((q) => Math.abs(Math.floor(q.x / T) - x) + Math.abs(Math.floor(q.y / T) - y) <= 1), safe);
    if (r) return steer(r.dir);
  } else if (po && s.players[po.holder]?.alive && cheb(s.players[po.holder]) <= HOLDER_FLEE) {
    const h = s.players[po.holder];
    const r = bfs(s, me, (x, y) => safe(x, y) && Math.max(Math.abs(Math.floor(h.x / T) - x), Math.abs(Math.floor(h.y / T) - y)) > HOLDER_FLEE, safe);
    if (r) return steer(r.dir);
  }

  if (lv.grabP >= 1 || rand() < lv.grabP) {
    const grab = bfs(s, me, (x, y) => s.items.some((it) => it.x === x && it.y === y && !AVOID.includes(it.type)), safe, lv.itemRange);
    if (grab) return steer(grab.dir);
  }

  const hunter = s.cfg?.mode === "survival" && team(id) === 1;
  const atEnemy = (x, y) => enemies.some((q) => Math.floor(q.x / T) === x && Math.floor(q.y / T) === y);
  const hunt = hunter ? bfs(s, me, atEnemy, safe) : null;
  const nearSoft = DIRS.some(([dx, dy]) => s.grid[idx(me.x + dx, me.y + dy)] === 2);
  const enemyInLine = enemies.some((q) => {
    const qx = Math.floor(q.x / T), qy = Math.floor(q.y / T);
    return (qx === me.x || qy === me.y) && Math.abs(qx - me.x) + Math.abs(qy - me.y) <= p.range;
  });
  const mine = s.bombs.filter((b) => b.owner === id).length;
  if (((nearSoft && !hunt) || enemyInLine) && mine < p.bombs && !s.bombs.some((b) => b.x === me.x && b.y === me.y) && rand() < lv.bombP) {
    const esc = flee(dangerMap(s, { x: me.x, y: me.y, range: p.range, t: 150 }), true);
    if (esc) return { ...steer(esc.dir), bomb: true };
  }

  if (hunt) return steer(hunt.dir);
  const hill = s.hill;
  if (hill) {
    const inZone = (x, y) => Math.abs(x - hill.x) <= 1 && Math.abs(y - hill.y) <= 1;
    const contested = enemies.some((q) => inZone(Math.floor(q.x / T), Math.floor(q.y / T)));
    if (inZone(me.x, me.y) && !contested) return {};
    if (!inZone(me.x, me.y)) {
      const r = bfs(s, me, (x, y) => inZone(x, y) && safe(x, y), safe);
      if (r) return steer(r.dir);
    }
  }

  const target = (x, y) =>
    DIRS.some(([dx, dy]) => s.grid[idx(x + dx, y + dy)] === 2) || atEnemy(x, y);
  const r = bfs(s, me, target, safe);
  return r ? steer(r.dir) : {};
}
