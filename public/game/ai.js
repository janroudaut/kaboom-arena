import { W, H, T, blast, doomed, KICK, REMOTE, SKULL } from "./sim.js";

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ESCAPE_MAX = 6, DOOM_HORIZON = 120, DOOM_TIME = 40;
const LEVELS = {
  easy: { margin: 0, bombP: 0.4, idle: 0.5, grabP: 0.4, itemRange: 8 },
  normal: { margin: 16, bombP: 0.8, idle: 0, grabP: 1, itemRange: 8 },
  hard: { margin: 24, bombP: 1, idle: 0, grabP: 1, itemRange: 8 },
};
const AVOID = [KICK, REMOTE, SKULL];

const idx = (x, y) => y * W + x;
const steer = (dir) => ({ dx: DIRS[dir][0], dy: DIRS[dir][1] });

// tm[i] = ticks until cell i is hit (Infinity if never). Chains: a bomb caught in another's blast goes off with it.
function dangerMap(s, extra) {
  const tm = new Array(W * H).fill(Infinity);
  const bombs = (extra ? [...s.bombs, extra] : s.bombs).map((b) => ({ ...b, t: b.t ?? 150 }));
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
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen.has(i)) return;
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
    const timed = (x, y, depth) => depth * ticksPerTile < tm[idx(x, y)] - lv.margin;
    const goal = (x, y) => tm[idx(x, y)] === Infinity;
    return bfs(s, me, goal, timed, ESCAPE_MAX) || (!strict && bfs(s, me, goal, (x, y) => tm[idx(x, y)] > 0, ESCAPE_MAX));
  };

  const tm = dangerMap(s);
  const bad = (x, y) => s.items.some((it) => it.x === x && it.y === y && AVOID.includes(it.type));
  const safe = (x, y) => tm[idx(x, y)] === Infinity && !bad(x, y);

  if (tm[idx(me.x, me.y)] !== Infinity) {
    const r = flee(tm);
    return r ? steer(r.dir) : {};
  }

  if (lv.grabP >= 1 || rand() < lv.grabP) {
    const grab = bfs(s, me, (x, y) => s.items.some((it) => it.x === x && it.y === y && !AVOID.includes(it.type)), safe, lv.itemRange);
    if (grab) return steer(grab.dir);
  }

  const team = (i) => s.cfg?.teams?.[i] ?? i;
  const enemies = s.players.filter((q) => q.alive && team(q.id) !== team(id));
  const nearSoft = DIRS.some(([dx, dy]) => s.grid[idx(me.x + dx, me.y + dy)] === 2);
  const enemyInLine = enemies.some((q) => {
    const qx = Math.floor(q.x / T), qy = Math.floor(q.y / T);
    return (qx === me.x || qy === me.y) && Math.abs(qx - me.x) + Math.abs(qy - me.y) <= p.range;
  });
  const mine = s.bombs.filter((b) => b.owner === id).length;
  if ((nearSoft || enemyInLine) && mine < p.bombs && !s.bombs.some((b) => b.x === me.x && b.y === me.y) && rand() < lv.bombP) {
    const esc = flee(dangerMap(s, { x: me.x, y: me.y, range: p.range, t: 150 }), true);
    if (esc) return { ...steer(esc.dir), bomb: true };
  }

  const target = (x, y) =>
    DIRS.some(([dx, dy]) => s.grid[idx(x + dx, y + dy)] === 2) ||
    enemies.some((q) => Math.floor(q.x / T) === x && Math.floor(q.y / T) === y);
  const r = bfs(s, me, target, safe);
  return r ? steer(r.dir) : {};
}
