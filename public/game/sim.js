export const W = 15, H = 13, T = 16;
export const FUSE = 150, FLAME = 30, END_DELAY = 120, SUDDEN = 5400, SUDDEN_EVERY = 8;
const HALF = 6.5;
const EMPTY = 0, HARD = 1, SOFT = 2;
export const REMOTE_FUSE = 360, SHIELD_TICKS = 300, CURSE_TICKS = 600, KICK_EVERY = 6, AUTO_BOMB_EVERY = 30;
export const BOMB_UP = 0, RANGE_UP = 1, SPEED_UP = 2, KICK = 3, REMOTE = 4, PASS = 5, SHIELD = 6, SKULL = 7;
export const CURSES = ["slow", "fast", "reverse", "nobomb", "auto"];
const WEIGHTS = [20, 20, 15, 10, 8, 5, 7, 8];
const LAYOUTS = {
  classic: (x, y) => x % 2 === 0 && y % 2 === 0,
  open: () => false,
  pillars: (x, y) => x % 4 === 3 && y % 3 === 0,
  cross: (x, y) => (x === 7 && y >= 2 && y <= 10 && y !== 6) || (y === 6 && x >= 2 && x <= 12 && x !== 7),
  maze: (x, y) => (x % 2 === 0 && y % 2 === 0) || (y === 4 && x !== 3 && x !== 11) || (y === 8 && x !== 7),
};
const DIRS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
const CORNERS = [[1, 1], [W - 2, H - 2], [W - 2, 1], [1, H - 2]];
const SPOTS = [...CORNERS, [7, 1], [7, H - 2], [1, 6], [W - 2, 6]];

// Floor codes in s.floor (W*H): conveyors are CONV + direction index (0 up, 1 right, 2 down, 3 left); teleporters
// are TELE + pair index, both ends of a pair share the code.
export const ICE = 1, CONV = 2, SPIKE = 6, TELE = 10;
export const SPIKE_CYCLE = 165, SPIKE_WARN = 90, SPIKE_ON = 135;
export const TP_ARM = 20, TP_COOL = 60, CONV_SPEED = 0.5, CONV_BOMB_EVERY = 15, CONV_ITEM_EVERY = 20;
export const TILES = { few: { ice: 1, conv: 1, pairs: 1, spikes: 2 }, many: { ice: 3, conv: 3, pairs: 2, spikes: 6 } };
export const EVENTS = ["bombrain", "itemrain", "frenzy", "quake", "swap"];
export const EVENT_WARN = 90, EVENT_FIRST = 600, FRENZY_TICKS = 600;
export const MODES = ["classic", "hill", "potato", "survival"];
export const HILL_EVERY = 900, HILL_WARN = 90, HILL_GOAL = 30, HILL_TIME = 5400;
export const POTATO_TICKS = 600, POTATO_COOL = 60, POTATO_RANGE = 3;
export const SURV_SLOTS = 12, SURV_CAP = 8, SURV_EVERY = 1200, SURV_SHIELD = 120;

function mix(seed) {
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function rng(seed) {
  return () => mix((seed = (seed + 0x6d2b79f5) | 0));
}

// The sim's own stream lives in state (s.rs) so that step stays pure and snapshots carry it.
const roll = (s) => mix((s.rs = (s.rs + 0x6d2b79f5) | 0));

const pickItem = (rand, powerups) => {
  if (!powerups) return Math.floor(rand() * 3);
  let r = rand() * WEIGHTS.reduce((a, b) => a + b);
  return WEIGHTS.findIndex((w) => (r -= w) < 0);
};

const pickN = (r, list, n) => {
  const a = list.slice(), out = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(r() * a.length), 1)[0]);
  return out;
};

function makeFloor(grid, kind, spots, r) {
  const floor = new Array(W * H).fill(0);
  const ok = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && grid[y * W + x] === EMPTY && !floor[y * W + x]
    && spots.every(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) > 2);
  const all = () => grid.map((_, i) => i).filter((i) => ok(i % W, Math.floor(i / W)));
  const run = (code, len, dir) => {
    const [dx, dy] = DIRS[dir ?? Math.floor(r() * 4)], [start] = pickN(r, all(), 1);
    if (start === undefined) return;
    for (let k = 0, x = start % W, y = Math.floor(start / W); k < len && ok(x, y); k++, x += dx, y += dy) floor[y * W + x] = code;
  };
  const c = TILES[kind];
  for (let k = 0; k < c.ice; k++) run(ICE, 3);
  for (let k = 0; k < c.conv; k++) { const d = Math.floor(r() * 4); run(CONV + d, 3, d); }
  for (let k = 0; k < c.pairs; k++) {
    const [a] = pickN(r, all(), 1);
    if (a === undefined) break;
    floor[a] = TELE + k;
    const far = all().filter((i) => Math.abs((i % W) - (a % W)) + Math.abs(Math.floor(i / W) - Math.floor(a / W)) >= 5);
    const [b] = pickN(r, far.length ? far : all(), 1);
    if (b === undefined) floor[a] = 0;
    else floor[b] = TELE + k;
  }
  for (let k = 0; k < c.spikes; k++) { const [i] = pickN(r, all(), 1); if (i !== undefined) floor[i] = SPIKE; }
  return floor;
}

// Opt-in extras (all resolved into cfg only when non-default, so the plain cfg is unchanged):
// tiles "few"|"many" -> s.floor; chaos true -> s.event/s.evAt; mode "hill"|"potato"|"survival" -> s.hill/s.potato/s.survival.
export function newGame(nPlayers, seed = Date.now(), opts = {}) {
  const cfg = {
    layout: LAYOUTS[opts.layout] ? opts.layout : "classic",
    softDensity: opts.softDensity ?? 0.7,
    powerups: opts.powerups ?? true,
    teams: opts.teams ?? null,
    friendlyFire: opts.friendlyFire ?? true,
    suddenDeath: opts.suddenDeath ?? true,
  };
  const mode = MODES.includes(opts.mode) ? opts.mode : "classic";
  const tiles = TILES[opts.tiles] ? opts.tiles : null;
  if (tiles) cfg.tiles = tiles;
  if (opts.chaos) cfg.chaos = true;
  if (mode !== "classic") { cfg.mode = mode; cfg.suddenDeath = false; }
  if (mode === "survival") {
    cfg.humans = nPlayers;
    cfg.teams = [...new Array(nPlayers).fill(0), ...new Array(SURV_SLOTS).fill(1)];
    cfg.friendlyFire = opts.friendlyFire ?? false;
  }
  const rand = rng(seed);
  const grid = new Array(W * H).fill(EMPTY);
  const hidden = new Array(W * H).fill(-1);
  const spawns = CORNERS.slice(0, nPlayers);
  const foes = mode === "survival" ? SPOTS.filter(([x, y]) => !spawns.some(([sx, sy]) => sx === x && sy === y)) : [];
  const near = (list, d) => (x, y) => list.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= d);
  const nearSpawn = (x, y) => near(spawns, 2)(x, y) || near(foes, 1)(x, y);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || LAYOUTS[cfg.layout](x, y)) grid[i] = HARD;
      else if (!nearSpawn(x, y) && rand() < cfg.softDensity) {
        grid[i] = SOFT;
        if (rand() < 0.3) hidden[i] = pickItem(rand, cfg.powerups);
      }
    }
  }
  const mk = (id, x, y) => ({
    id, x: x * T + T / 2, y: y * T + T / 2, alive: true,
    bombs: 1, range: 2, speed: 1, face: 2, walk: 0,
    kick: false, remote: false, pass: false, shield: 0, curse: null,
  });
  const players = spawns.map(([x, y], id) => mk(id, x, y));
  const s = { tick: 0, grid, hidden, bombs: [], flames: [], items: [], players, sd: 0, end: -1, done: false, winner: -1, winnerTeam: -1, cfg, rs: Math.floor(rand() * 2 ** 31) };
  if (tiles) s.floor = makeFloor(grid, tiles, [...spawns, ...foes], rng(seed ^ 0x5bd1e995));
  if (cfg.chaos) { s.event = null; s.evAt = EVENT_FIRST + Math.floor(rng(seed ^ 0x9e3779b9)() * 360); }
  if (mode === "hill") {
    const [x, y] = hillSpot(s);
    s.hill = { x, y, t: HILL_EVERY, next: null, score: players.map(() => 0), acc: players.map(() => 0) };
    s.score = s.hill.score;
  } else if (mode === "potato") s.potato = { holder: Math.floor(roll(s) * nPlayers), t: POTATO_TICKS, cd: 0 };
  else if (mode === "survival") {
    for (let k = 0; k < SURV_SLOTS; k++) players.push({ ...mk(nPlayers + k, 0, 0), x: 0, y: 0, alive: false, dormant: true });
    s.survival = { wave: 0, t: 0, next: 60 };
  }
  return s;
}

export function snapshot(s) {
  return { ...s, hidden: undefined };
}

const tileOf = (v) => Math.floor(v / T);

function overlaps(p, tx, ty) {
  return tileOf(p.x - HALF) <= tx && tileOf(p.x + HALF - 1e-6) >= tx
    && tileOf(p.y - HALF) <= ty && tileOf(p.y + HALF - 1e-6) >= ty;
}

function solid(s, tx, ty, p) {
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return true;
  if (s.grid[ty * W + tx] !== EMPTY) return true;
  return !p.pass && s.bombs.some((b) => b.x === tx && b.y === ty && !b.pass.includes(p.id));
}

function blocked(s, p, x, y) {
  const x0 = tileOf(x - HALF), x1 = tileOf(x + HALF - 1e-6);
  const y0 = tileOf(y - HALF), y1 = tileOf(y + HALF - 1e-6);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(s, tx, ty, p)) return true;
  return false;
}

const curseIs = (p, type) => p.curse?.type === type;
const frenzy = (s) => s.event?.type === "frenzy" && s.event.on > 0;
const speedOf = (s, p) => (curseIs(p, "slow") ? 0.5 : curseIs(p, "fast") ? 2.5 : p.speed) * (frenzy(s) ? 1.5 : 1);
const die = (p) => { p.alive = false; p.shield = 0; p.curse = null; };

function move(s, p, dx, dy, sp) {
  const nx = p.x + dx * sp, ny = p.y + dy * sp;
  if (!blocked(s, p, nx, ny)) {
    p.x = nx; p.y = ny;
    return;
  }
  // Blocked head-on: drift toward the centre of the current lane if the tile ahead there is open.
  const perp = dx ? p.y : p.x;
  const lane = tileOf(perp);
  const off = perp - (lane * T + T / 2);
  if (off !== 0) {
    const ax = dx ? tileOf(p.x + dx * (HALF + 1)) : lane;
    const ay = dx ? lane : tileOf(p.y + dy * (HALF + 1));
    if (!solid(s, ax, ay, p)) {
      const nudge = -Math.sign(off) * Math.min(sp, Math.abs(off));
      const sx = p.x + (dx ? 0 : nudge), sy = p.y + (dx ? nudge : 0);
      if (!blocked(s, p, sx, sy)) {
        p.x = sx; p.y = sy;
        return;
      }
    }
  }
  for (let k = 3; k >= 1; k--) {
    const fx = p.x + (dx * sp * k) / 4, fy = p.y + (dy * sp * k) / 4;
    if (!blocked(s, p, fx, fy)) {
      p.x = fx; p.y = fy;
      return;
    }
  }
}

export function blast(s, bx, by, range) {
  const cells = [[bx, by]];
  for (const [dx, dy] of DIRS) {
    for (let r = 1; r <= range; r++) {
      const x = bx + dx * r, y = by + dy * r;
      const g = s.grid[y * W + x];
      if (g === HARD) break;
      cells.push([x, y]);
      if (g === SOFT || s.bombs.some((b) => b.x === x && b.y === y)) break;
    }
  }
  return cells;
}

const SPIRAL = (() => {
  const out = [];
  let x0 = 1, y0 = 1, x1 = W - 2, y1 = H - 2;
  while (x0 <= x1 && y0 <= y1) {
    for (let x = x0; x <= x1; x++) out.push([x, y0]);
    for (let y = y0 + 1; y <= y1; y++) out.push([x1, y]);
    if (y0 < y1) for (let x = x1 - 1; x >= x0; x--) out.push([x, y1]);
    if (x0 < x1) for (let y = y1 - 1; y > y0; y--) out.push([x0, y]);
    x0++; y0++; x1--; y1--;
  }
  return out;
})();

export function doomed(s, horizon) {
  if (s.cfg?.suddenDeath === false) return [];
  const n = Math.ceil((s.tick + horizon - SUDDEN) / SUDDEN_EVERY);
  return n > 0 ? SPIRAL.slice(s.sd, s.sd + n) : [];
}

function closeIn(s) {
  while (s.sd < SPIRAL.length) {
    const [x, y] = SPIRAL[s.sd++], i = y * W + x;
    if (s.grid[i] === HARD) continue;
    s.grid[i] = HARD;
    s.hidden[i] = -1;
    s.bombs = s.bombs.filter((b) => b.x !== x || b.y !== y);
    s.items = s.items.filter((it) => it.x !== x || it.y !== y);
    s.flames = s.flames.filter((f) => f.x !== x || f.y !== y);
    for (const p of s.players) {
      if (overlaps(p, x, y)) die(p);
    }
    return;
  }
}

function explode(s, first) {
  const queue = [first];
  const burned = new Set(), ff = s.cfg.friendlyFire || !s.cfg.teams;
  while (queue.length) {
    const b = queue.pop();
    if (!s.bombs.includes(b)) continue;
    s.bombs.splice(s.bombs.indexOf(b), 1);
    for (const [x, y] of blast(s, b.x, b.y, b.range)) {
      burned.add(y * W + x);
      s.flames.push(ff ? { x, y, t: FLAME } : { x, y, t: FLAME, o: b.owner });
      const other = s.bombs.find((o) => o.x === x && o.y === y);
      if (other) queue.push(other);
    }
  }
  s.items = s.items.filter((it) => !burned.has(it.y * W + it.x));
  for (const i of burned) {
    if (s.grid[i] !== SOFT) continue;
    s.grid[i] = EMPTY;
    if (s.hidden[i] >= 0) s.items.push({ x: i % W, y: Math.floor(i / W), type: s.hidden[i] });
  }
}

// Pure in (grid, bombs, floor, event, p): the guest replays it for its own player. Ice momentum lives in p.vx/p.vy.
export function movePlayer(s, p, dx, dy) {
  if (curseIs(p, "reverse")) { dx = -dx; dy = -dy; }
  let mx = dx, my = dx ? 0 : dy;
  const under = () => (s.floor ? s.floor[tileOf(p.y) * W + tileOf(p.x)] : 0);
  const ice = under() === ICE;
  if (ice) {
    if (mx || my) { p.vx = mx; p.vy = my; } else { mx = p.vx || 0; my = p.vy || 0; }
  } else if (p.vx || p.vy) p.vx = p.vy = 0;
  if (mx || my) {
    if (dx || dy) p.face = mx ? (mx > 0 ? 1 : 3) : my > 0 ? 2 : 0;
    const bx = p.x, by = p.y;
    move(s, p, mx, my, speedOf(s, p));
    if (p.x !== bx || p.y !== by) p.walk++;
    else if (ice) p.vx = p.vy = 0;
  }
  const c = under() - CONV;
  if (c >= 0 && c < 4) move(s, p, DIRS[c][0], DIRS[c][1], CONV_SPEED);
}

export function placeBomb(s, p) {
  const tx = tileOf(p.x), ty = tileOf(p.y);
  if (curseIs(p, "nobomb") || s.bombs.filter((b) => b.owner === p.id).length >= p.bombs || s.bombs.some((b) => b.x === tx && b.y === ty)) return null;
  const b = {
    x: tx, y: ty, owner: p.id, t: p.remote ? REMOTE_FUSE : FUSE, range: p.range,
    pass: s.players.filter((q) => q.alive && overlaps(q, tx, ty)).map((q) => q.id),
  };
  s.bombs.push(b);
  return b;
}

// Remote detonator: the oldest bomb of p goes off this tick. Returns false if p has none.
export function detonate(s, p) {
  const b = s.bombs.find((q) => q.owner === p.id);
  if (b) b.t = Math.min(b.t, 1);
  return !!b;
}

function kick(s, p, dx, dy) {
  const probe = { x: p.x + dx, y: p.y + dy };
  const b = s.bombs.find((q) => !q.dx && !q.dy && !q.pass.includes(p.id) && overlaps(probe, q.x, q.y));
  if (b && !stopsBomb(s, b.x + dx, b.y + dy)) { b.dx = dx; b.dy = dy; b.sc = 0; }
}

const stopsBomb = (s, x, y) => s.grid[y * W + x] !== EMPTY || s.bombs.some((b) => b.x === x && b.y === y)
  || s.players.some((q) => q.alive && overlaps(q, x, y));

function slide(s, b) {
  if (++b.sc < KICK_EVERY) return;
  b.sc = 0;
  const x = b.x + b.dx, y = b.y + b.dy;
  if (stopsBomb(s, x, y)) { b.dx = b.dy = 0; return; }
  b.x = x; b.y = y;
  if (s.flames.some((f) => f.x === x && f.y === y)) { b.t = 1; b.dx = b.dy = 0; }
}

function pickup(s, p, type) {
  if (type === BOMB_UP) p.bombs = Math.min(p.bombs + 1, 6);
  else if (type === RANGE_UP) p.range = Math.min(p.range + 1, 8);
  else if (type === SPEED_UP) p.speed = Math.min(p.speed + 0.25, 2);
  else if (type === KICK) p.kick = true;
  else if (type === REMOTE) p.remote = true;
  else if (type === PASS) p.pass = true;
  else if (type === SHIELD) p.shield = SHIELD_TICKS;
  else if (type === SKULL) p.curse = { type: CURSES[Math.floor(roll(s) * CURSES.length)], t: CURSE_TICKS };
}

const teamOf = (s, id) => s.cfg.teams?.[id] ?? id;

const floorAt = (s, x, y) => s.floor[y * W + x];
const inArena = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1;

// Ticks until the spike on tile i becomes deadly (0 = deadly now); telegraph is the last SPIKE_ON - SPIKE_WARN ticks.
export function spikeIn(s, i) {
  const ph = (s.tick + i * 53) % SPIKE_CYCLE;
  return ph >= SPIKE_ON ? 0 : SPIKE_ON - ph;
}

// Host-only: teleport arming and cooldown (the cooldown only runs while off the pad).
function teleport(s, p) {
  const tx = tileOf(p.x), ty = tileOf(p.y), f = floorAt(s, tx, ty);
  if (f < TELE) { p.tp = 0; if (p.tpc > 0) p.tpc--; return; }
  if (p.tpc > 0 || (p.tp = (p.tp | 0) + 1) < TP_ARM) return;
  const here = ty * W + tx, there = s.floor.indexOf(f) === here ? s.floor.lastIndexOf(f) : s.floor.indexOf(f);
  if (there === here || s.grid[there] !== EMPTY) return;
  const ex = there % W, ey = Math.floor(there / W);
  if (s.bombs.some((b) => b.x === ex && b.y === ey)) return;
  p.x = ex * T + T / 2; p.y = ey * T + T / 2;
  p.tp = 0; p.tpc = TP_COOL; p.vx = p.vy = 0;
}

// Host-only: conveyors carry resting bombs and items.
function carry(s) {
  for (const b of s.bombs) {
    if (b.dx || b.dy) continue;
    const c = floorAt(s, b.x, b.y) - CONV;
    if (c < 0 || c > 3) { b.cv = 0; continue; }
    if ((b.cv = (b.cv | 0) + 1) < CONV_BOMB_EVERY) continue;
    b.cv = 0;
    const x = b.x + DIRS[c][0], y = b.y + DIRS[c][1];
    if (stopsBomb(s, x, y)) continue;
    b.x = x; b.y = y;
    if (s.flames.some((f) => f.x === x && f.y === y)) b.t = 1;
  }
  if (s.tick % CONV_ITEM_EVERY) return;
  for (const it of s.items) {
    const c = floorAt(s, it.x, it.y) - CONV;
    if (c < 0 || c > 3) continue;
    const x = it.x + DIRS[c][0], y = it.y + DIRS[c][1];
    if (s.grid[y * W + x] === EMPTY && !s.items.some((o) => o.x === x && o.y === y)) { it.x = x; it.y = y; }
  }
}

const gap = (s) => 720 + Math.floor(roll(s) * 480);
const isSpot = (x, y) => SPOTS.some(([sx, sy]) => sx === x && sy === y);
const emptyTiles = (s) => s.grid.map((_, i) => i).filter((i) => {
  const x = i % W, y = Math.floor(i / W);
  return s.grid[i] === EMPTY && !isSpot(x, y) && !s.bombs.some((b) => b.x === x && b.y === y);
});

// Host-only chaos scheduler. event.t counts down the telegraph; frenzy then runs on event.on.
function chaos(s) {
  const e = s.event;
  if (!e) {
    if (s.tick < s.evAt || s.end >= 0) return;
    const alive = s.players.filter((p) => p.alive);
    const types = EVENTS.filter((k) => (k !== "swap" || alive.length >= 2) && (k !== "quake" || s.grid.includes(SOFT)));
    const type = types[Math.floor(roll(s) * types.length)];
    const ev = { type, t: EVENT_WARN };
    const r = () => roll(s);
    if (type === "bombrain" || type === "itemrain") ev.tiles = pickN(r, emptyTiles(s), 4 + Math.floor(r() * 3)).map((i) => [i % W, Math.floor(i / W)]);
    else if (type === "quake") ev.tiles = pickN(r, s.grid.map((g, i) => (g === SOFT ? i : -1)).filter((i) => i >= 0), 5).map((i) => [i % W, Math.floor(i / W)]);
    else if (type === "swap") [ev.a, ev.b] = pickN(r, alive, 2).map((p) => p.id);
    s.event = ev;
    return;
  }
  if (e.on) {
    if (--e.on <= 0) { s.event = null; s.evAt = s.tick + gap(s); }
    return;
  }
  if (--e.t > 0) return;
  if (e.type === "frenzy") { e.on = FRENZY_TICKS; return; }
  const free = ([x, y]) => s.grid[y * W + x] === EMPTY && !s.bombs.some((b) => b.x === x && b.y === y);
  if (e.type === "bombrain") {
    for (const [x, y] of e.tiles.filter(free)) {
      if (!s.players.some((p) => p.alive && overlaps(p, x, y))) s.bombs.push({ x, y, owner: -1, t: FUSE, range: 2, pass: [] });
    }
  } else if (e.type === "itemrain") {
    for (const [x, y] of e.tiles.filter(free)) {
      if (!s.items.some((it) => it.x === x && it.y === y)) s.items.push({ x, y, type: pickItem(() => roll(s), s.cfg.powerups) });
    }
  } else if (e.type === "quake") {
    for (const [x, y] of e.tiles) {
      const i = y * W + x;
      if (s.grid[i] !== SOFT) continue;
      s.grid[i] = EMPTY;
      if (s.hidden[i] >= 0) s.items.push({ x, y, type: s.hidden[i] });
    }
  } else if (e.type === "swap") {
    const a = s.players[e.a], b = s.players[e.b];
    const risky = (p) => s.flames.some((f) => f.x === tileOf(p.x) && f.y === tileOf(p.y)) || s.bombs.some((q) => overlaps(p, q.x, q.y));
    if (a.alive && b.alive && !risky(a) && !risky(b)) {
      [a.x, b.x] = [b.x, a.x];
      [a.y, b.y] = [b.y, a.y];
      a.vx = a.vy = b.vx = b.vy = 0;
    }
  }
  s.event = null;
  s.evAt = s.tick + gap(s);
}

// Hill centre: a non-hard tile away from the current one; the 3x3 around it may include walls.
function hillSpot(s, from) {
  const ok = (x, y) => s.grid[y * W + x] !== HARD && (!s.floor || floorAt(s, x, y) < SPIKE || floorAt(s, x, y) === ICE);
  const all = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (ok(x, y)) all.push([x, y]);
  const far = from ? all.filter(([x, y]) => Math.abs(x - from.x) + Math.abs(y - from.y) >= 4) : all;
  const list = far.length ? far : all;
  return list[Math.floor(roll(s) * list.length)];
}

const inHill = (h, p) => Math.abs(tileOf(p.x) - h.x) <= 1 && Math.abs(tileOf(p.y) - h.y) <= 1;

function hillTick(s) {
  const h = s.hill;
  if (--h.t <= 0) {
    [h.x, h.y] = h.next ?? hillSpot(s, h);
    h.next = null;
    h.t = HILL_EVERY;
  } else if (h.t === HILL_WARN) h.next = hillSpot(s, h);
  const inside = s.players.filter((p) => p.alive && inHill(h, p));
  if (inside.length === 1 && ++h.acc[inside[0].id] >= 60) { h.acc[inside[0].id] = 0; h.score[inside[0].id]++; }
}

function potatoTick(s) {
  const po = s.potato, alive = s.players.filter((p) => p.alive);
  if (alive.length < 2) return;
  let h = s.players[po.holder];
  if (!h.alive) {
    po.holder = alive[Math.floor(roll(s) * alive.length)].id;
    po.t = POTATO_TICKS;
    return;
  }
  if (po.cd > 0) po.cd--;
  else {
    const hx = tileOf(h.x), hy = tileOf(h.y);
    const near = alive.filter((q) => q !== h && Math.abs(tileOf(q.x) - hx) + Math.abs(tileOf(q.y) - hy) <= 1);
    if (near.length) { po.holder = near[0].id; po.cd = POTATO_COOL; }
  }
  if (--po.t > 0) return;
  h = s.players[po.holder];
  s.bombs.push({ x: tileOf(h.x), y: tileOf(h.y), owner: -1, t: 1, range: POTATO_RANGE, pass: [] });
  die(h);
  const left = alive.filter((q) => q !== h);
  po.holder = left[Math.floor(roll(s) * left.length)].id;
  po.t = POTATO_TICKS;
  po.cd = POTATO_COOL;
}

function waveTick(s) {
  const sv = s.survival, n = s.cfg.humans;
  sv.t++;
  const foes = s.players.filter((p) => p.id >= n && p.alive);
  if (!foes.length && sv.next > 60) sv.next = 60;
  if (--sv.next > 0) return;
  sv.wave++;
  sv.next = SURV_EVERY;
  const humans = s.players.slice(0, n).filter((p) => p.alive);
  const slots = s.players.filter((p) => p.id >= n && !p.alive).sort((a, b) => b.dormant - a.dormant || a.id - b.id);
  let spots = SPOTS.filter(([x, y]) => s.grid[y * W + x] === EMPTY
    && humans.every((p) => Math.abs(tileOf(p.x) - x) + Math.abs(tileOf(p.y) - y) >= 5)
    && foes.every((p) => Math.abs(tileOf(p.x) - x) + Math.abs(tileOf(p.y) - y) >= 2));
  for (let k = Math.min(1 + sv.wave, SURV_CAP - foes.length, slots.length); k > 0 && spots.length; k--) {
    const [x, y] = spots.splice(Math.floor(roll(s) * spots.length), 1)[0], p = slots.shift();
    Object.assign(p, { x: x * T + T / 2, y: y * T + T / 2, alive: true, dormant: false, bombs: 1, range: 2, speed: 1, face: 2, walk: 0,
      kick: false, remote: false, pass: false, shield: SURV_SHIELD, curse: null, vx: 0, vy: 0, tp: 0, tpc: 0 });
  }
}

function endCheck(s) {
  const alive = s.players.filter((p) => p.alive), mode = s.cfg.mode;
  let w = null;
  if (mode === "survival") {
    if (!s.players.slice(0, s.cfg.humans).some((p) => p.alive)) w = [-1, 1];
  } else {
    if (mode === "hill") {
      const sc = s.hill.score, top = Math.max(...sc);
      if (top >= HILL_GOAL || s.tick >= HILL_TIME) {
        const id = sc.indexOf(top) === sc.lastIndexOf(top) ? sc.indexOf(top) : -1;
        w = [id, id >= 0 && s.cfg.teams ? teamOf(s, id) : -1];
      }
    }
    if (!w && new Set(alive.map((p) => teamOf(s, p.id))).size <= 1) {
      w = [alive.length ? alive[0].id : -1, alive.length && s.cfg.teams ? teamOf(s, alive[0].id) : -1];
    }
  }
  if (w) { s.end = END_DELAY; [s.winner, s.winnerTeam] = w; }
}

export function step(s, inputs) {
  if (s.done) return;
  s.tick++;
  if (s.tick >= SUDDEN && s.tick % SUDDEN_EVERY === 0 && s.cfg.suddenDeath) closeIn(s);
  if (s.cfg.chaos) chaos(s);
  if (s.hill) hillTick(s);
  else if (s.potato) potatoTick(s);
  else if (s.survival) waveTick(s);

  for (const p of s.players) {
    if (!p.alive) continue;
    const inp = inputs[p.id] || {};
    movePlayer(s, p, inp.dx || 0, inp.dy || 0);
    if (s.floor) teleport(s, p);
    if (p.kick && (inp.dx || inp.dy)) {
      const sign = curseIs(p, "reverse") ? -1 : 1;
      kick(s, p, inp.dx ? sign * inp.dx : 0, inp.dx ? 0 : sign * inp.dy);
    }
    const tx = tileOf(p.x), ty = tileOf(p.y);
    if (inp.bomb) {
      inp.bomb = false;
      if (!placeBomb(s, p) && p.remote) detonate(s, p);
    }
    if (curseIs(p, "auto") && s.tick % AUTO_BOMB_EVERY === 0) placeBomb(s, p);
    const it = s.items.findIndex((i) => i.x === tx && i.y === ty);
    if (it >= 0) pickup(s, p, s.items.splice(it, 1)[0].type);
    if (p.shield > 0) p.shield--;
    if (p.curse && --p.curse.t <= 0) p.curse = null;
  }

  for (const b of s.bombs) if (b.dx || b.dy) slide(s, b);
  if (s.floor) carry(s);
  for (const b of s.bombs) {
    b.pass = b.pass.filter((id) => {
      const q = s.players[id];
      return q.alive && overlaps(q, b.x, b.y);
    });
  }

  for (const b of [...s.bombs]) {
    if (--b.t <= 0) explode(s, b);
  }
  s.flames = s.flames.filter((f) => --f.t > 0);

  const hurts = (f, p) => f.x === tileOf(p.x) && f.y === tileOf(p.y)
    && (s.cfg.friendlyFire || !s.cfg.teams || f.o === undefined || f.o === p.id || teamOf(s, f.o) !== teamOf(s, p.id));
  for (const p of s.players) {
    if (p.alive && !p.shield && s.flames.some((f) => hurts(f, p))) die(p);
  }
  if (s.floor) {
    for (const p of s.players) {
      const i = tileOf(p.y) * W + tileOf(p.x);
      if (p.alive && !p.shield && s.floor[i] === SPIKE && !spikeIn(s, i)) die(p);
    }
  }

  if (s.end < 0) endCheck(s);
  else if (--s.end <= 0) s.done = true;
}
