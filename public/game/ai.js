import {
  W, H, T, blast, doomed, spikeIn, KICK, REMOTE, SKULL, ICE, CONV, SPIKE, TELE, POTATO_RANGE, B_CLUSTER, B_MINE, B_ICE, B_MINI, MINE_DELAY, CLUSTER_DELAY,
  RISE_FUSE, THROW_TILES, ringOf, blinkTile, crackAt, swapTarget, sweepable, landing, canLift, ABILITIES,
} from "./sim.js";

const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const ESCAPE_MAX = 6, DOOM_HORIZON = 120, DOOM_TIME = 40, SPIKE_HORIZON = 100, HOLDER_FLEE = 2;
const LEVELS = {
  easy: { margin: 0, bombP: 0.4, idle: 0.5, grabP: 0.4, itemRange: 8 },
  normal: { margin: 16, bombP: 0.8, idle: 0, grabP: 1, itemRange: 8 },
  hard: { margin: 24, bombP: 1, idle: 0, grabP: 1, itemRange: 8 },
};
const AVOID = [KICK, REMOTE, SKULL];
const MINE_SIGHT = 3, MINE_ARMED = 60, MINE_PLANT = 6;
const solidBomb = (b) => b.ty !== B_MINE && b.ty !== B_MINI;

const idx = (x, y) => y * W + x;
const steer = (dir) => ({ dx: DIRS[dir][0], dy: DIRS[dir][1] });

// tm[i] = ticks until cell i is hit (Infinity if never). Chains: a bomb caught in another's blast goes off with it.
// Ice bombs never hurt; cluster bombs add their mini-blasts; a mine only matters once triggered, except the ones this player can see (viewer = its player),
// whose trigger zone is treated as impassable.
export function dangerMap(s, extra, id, viewer) {
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
  bombs.forEach((b, i) => {
    if (b.ty === B_ICE || (b.ty === B_MINE && b.t > MINE_ARMED)) return;
    for (const [x, y] of cells[i]) tm[idx(x, y)] = Math.min(tm[idx(x, y)], b.t);
    if (b.ty === B_CLUSTER) for (const [rx, ry] of ringOf(s, b)) for (const [x, y] of blast(sim, rx, ry, 1)) tm[idx(x, y)] = Math.min(tm[idx(x, y)], b.t + CLUSTER_DELAY);
  });
  if (viewer && s.cfg?.bombs) {
    const mx = Math.floor(viewer.x / T), my = Math.floor(viewer.y / T), mt = s.cfg.teams?.[viewer.id] ?? viewer.id;
    for (const b of s.bombs) {
      if (b.ty !== B_MINE || b.t <= MINE_DELAY || (s.cfg.teams?.[b.owner] ?? b.owner) === mt || Math.abs(b.x - mx) + Math.abs(b.y - my) > MINE_SIGHT) continue;
      for (const [dx, dy] of [[0, 0], ...DIRS]) tm[idx(b.x + dx, b.y + dy)] = 0;
    }
  }
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
        if (s.grid[i] !== 0 || s.bombs.some((b) => b.x === nx && b.y === ny && solidBomb(b)) || !canEnter(nx, ny, depth + 1)) return;
        seen.add(i);
        next.push([nx, ny, depth === 0 ? k : first, depth + 1]);
      });
    }
    frontier = next;
  }
  return null;
}

// Ability key for blasts that are about to land: r = the escape path found, t = ticks before the hit.
function escapeAct(s, p, r, t, tm) {
  const k = ABILITIES[p.ab]?.[0];
  if (!k || p.cd > 0) return false;
  if (k === "aegis") return t <= 24 || p.fz > 0;
  if (k === "dash") return !!r && r.dir === p.face && t < 70;
  if (k === "blink") { const b = blinkTile(s, p); return !!b && tm[idx(b[0], b[1])] === Infinity && (!r || t < 40); }
  if (k === "swap") return t < 70 && !!swapTarget(s, p);
  if (k === "sweep") return t < 90 && sweepable(s, p).length > 0;
  return false;
}

export function think(s, id, rand = Math.random, level = "normal") {
  const p = s.players[id];
  if (!p.alive) return {};
  const lv = LEVELS[level] || LEVELS.normal;
  if (lv.idle && rand() < lv.idle) return {};
  if (p.fz > 0) return ABILITIES[p.ab]?.[0] === "aegis" && !p.cd ? { act: true } : {};
  const me = { x: Math.floor(p.x / T), y: Math.floor(p.y / T) };
  const ticksPerTile = (T / p.speed) * 1.5;
  const flee = (tm, strict) => {
    const slick = (x, y) => s.floor?.[idx(x, y)] === ICE || s.floor?.[idx(x, y)] - CONV < 4 && s.floor?.[idx(x, y)] >= CONV;
    const timed = (x, y, depth) => depth * ticksPerTile < tm[idx(x, y)] - lv.margin && (!strict || !slick(x, y));
    const goal = (x, y) => tm[idx(x, y)] === Infinity;
    return bfs(s, me, goal, timed, ESCAPE_MAX) || (!strict && bfs(s, me, goal, (x, y) => tm[idx(x, y)] > 0, ESCAPE_MAX));
  };

  const tm = dangerMap(s, null, id, p);
  const bad = (x, y) => s.items.some((it) => it.x === x && it.y === y && AVOID.includes(it.type));
  const spikeFar = (x, y) => s.floor?.[idx(x, y)] === SPIKE && tm[idx(x, y)] > SPIKE_HORIZON;
  const safe = (x, y) => (tm[idx(x, y)] === Infinity || spikeFar(x, y)) && !bad(x, y);

  const team = (i) => s.cfg?.teams?.[i] ?? i;
  const cheb = (q) => Math.max(Math.abs(Math.floor(q.x / T) - me.x), Math.abs(Math.floor(q.y / T) - me.y));
  const extras = s.cfg?.bombs || s.cfg?.abilities;

  if (tm[idx(me.x, me.y)] !== Infinity && !spikeFar(me.x, me.y)) {
    const r = flee(tm);
    const out = r ? steer(r.dir) : {};
    if (extras) {
      const t = tm[idx(me.x, me.y)];
      if (escapeAct(s, p, r, t, tm)) out.act = true;
      const lf = (p.gl || p.pn) && canLift(s, p);
      if (lf && (!r || t < 50)) {
        const l = p.gl && s.bombs.some((b) => b.x === me.x && b.y === me.y) ? THROW_TILES : 0;
        if (!l || landing(s, { x: me.x, y: me.y }, ...DIRS[p.face], l) > p.range) out.bomb = true;
      }
    }
    return out;
  }

  const enemies = s.players.filter((q) => q.alive && team(q.id) !== team(id) && !(q.inv > 0 && cheb(q) > 1));
  let acts = false;
  if (s.cfg?.abilities && p.ab && !p.cd) {
    const k = ABILITIES[p.ab][0];
    if (k === "veil") acts = enemies.some((q) => cheb(q) <= 4);
    else if (k === "overload") {
      const mine = s.bombs.filter((b) => b.owner === id);
      acts = mine.length > 0 && enemies.some((q) => mine.some((b) => blast(s, b.x, b.y, b.range).some(([x, y]) => x === Math.floor(q.x / T) && y === Math.floor(q.y / T))));
    } else if (k === "crack") {
      const i = crackAt(s, p);
      acts = i >= 0 && Math.abs((i % W) - me.x) + Math.abs(Math.floor(i / W) - me.y) >= 2;
    }
  }
  const go = (o) => { if (acts) o.act = true; return o; };
  const po = s.potato;
  if (po && po.holder === id) {
    const r = bfs(s, me, (x, y) => enemies.some((q) => Math.abs(Math.floor(q.x / T) - x) + Math.abs(Math.floor(q.y / T) - y) <= 1), safe);
    if (r) return go(steer(r.dir));
  } else if (po && s.players[po.holder]?.alive && cheb(s.players[po.holder]) <= HOLDER_FLEE) {
    const h = s.players[po.holder];
    const r = bfs(s, me, (x, y) => safe(x, y) && Math.max(Math.abs(Math.floor(h.x / T) - x), Math.abs(Math.floor(h.y / T) - y)) > HOLDER_FLEE, safe);
    if (r) return go(steer(r.dir));
  }

  if (lv.grabP >= 1 || rand() < lv.grabP) {
    const grab = bfs(s, me, (x, y) => s.items.some((it) => it.x === x && it.y === y && !AVOID.includes(it.type)), safe, lv.itemRange);
    if (grab) return go(steer(grab.dir));
  }

  const hunter = s.cfg?.mode === "survival" && team(id) === 1;
  const atEnemy = (x, y) => enemies.some((q) => Math.floor(q.x / T) === x && Math.floor(q.y / T) === y);
  const hunt = hunter ? bfs(s, me, atEnemy, safe) : null;
  const nearSoft = DIRS.some(([dx, dy]) => s.grid[idx(me.x + dx, me.y + dy)] === 2);
  const enemyInLine = enemies.some((q) => {
    const qx = Math.floor(q.x / T), qy = Math.floor(q.y / T);
    return (qx === me.x || qy === me.y) && Math.abs(qx - me.x) + Math.abs(qy - me.y) <= p.range;
  });
  const here = s.bombs.some((b) => b.x === me.x && b.y === me.y);
  if (s.cfg?.bombs && p.sp === B_MINE && p.spn > 0 && !here && enemies.some((q) => cheb(q) <= MINE_PLANT) && rand() < 0.25) return go({ bomb: true });
  if (s.cfg?.abilities && ABILITIES[p.ab]?.[0] === "rise" && !p.cd && !here) {
    const reach = p.range + 1;
    const line = enemies.some((q) => {
      const qx = Math.floor(q.x / T), qy = Math.floor(q.y / T);
      return (qx === me.x || qy === me.y) && Math.abs(qx - me.x) + Math.abs(qy - me.y) <= reach;
    });
    const esc = line && flee(dangerMap(s, { x: me.x, y: me.y, range: reach, t: RISE_FUSE }, undefined, p), true);
    if (esc) return { ...steer(esc.dir), act: true };
  }
  const mine = s.bombs.filter((b) => b.owner === id && solidBomb(b)).length;
  if (((nearSoft && !hunt) || enemyInLine) && mine < p.bombs && !here && rand() < lv.bombP) {
    const esc = flee(dangerMap(s, { x: me.x, y: me.y, range: p.range, t: 150, ty: p.spn > 0 ? p.sp : undefined }, undefined, p), true);
    if (esc) return { ...go(steer(esc.dir)), bomb: true };
  }

  if (hunt) return go(steer(hunt.dir));
  const hill = s.hill;
  if (hill) {
    const inZone = (x, y) => Math.abs(x - hill.x) <= 1 && Math.abs(y - hill.y) <= 1;
    const contested = enemies.some((q) => inZone(Math.floor(q.x / T), Math.floor(q.y / T)));
    if (inZone(me.x, me.y) && !contested) return go({});
    if (!inZone(me.x, me.y)) {
      const r = bfs(s, me, (x, y) => inZone(x, y) && safe(x, y), safe);
      if (r) return go(steer(r.dir));
    }
  }

  const target = (x, y) =>
    DIRS.some(([dx, dy]) => s.grid[idx(x + dx, y + dy)] === 2) || atEnemy(x, y);
  const r = bfs(s, me, target, safe);
  return go(r ? steer(r.dir) : {});
}
