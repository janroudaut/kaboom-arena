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

export function newGame(nPlayers, seed = Date.now(), opts = {}) {
  const cfg = {
    layout: LAYOUTS[opts.layout] ? opts.layout : "classic",
    softDensity: opts.softDensity ?? 0.7,
    powerups: opts.powerups ?? true,
    teams: opts.teams ?? null,
    friendlyFire: opts.friendlyFire ?? true,
    suddenDeath: opts.suddenDeath ?? true,
  };
  const rand = rng(seed);
  const grid = new Array(W * H).fill(EMPTY);
  const hidden = new Array(W * H).fill(-1);
  const spawns = CORNERS.slice(0, nPlayers);
  const nearSpawn = (x, y) => spawns.some(([sx, sy]) => Math.abs(x - sx) + Math.abs(y - sy) <= 2);
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
  const players = spawns.map(([x, y], id) => ({
    id, x: x * T + T / 2, y: y * T + T / 2, alive: true,
    bombs: 1, range: 2, speed: 1, face: 2, walk: 0,
    kick: false, remote: false, pass: false, shield: 0, curse: null,
  }));
  return { tick: 0, grid, hidden, bombs: [], flames: [], items: [], players, sd: 0, end: -1, done: false, winner: -1, winnerTeam: -1, cfg, rs: Math.floor(rand() * 2 ** 31) };
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
const speedOf = (p) => (curseIs(p, "slow") ? 0.5 : curseIs(p, "fast") ? 2.5 : p.speed);
const die = (p) => { p.alive = false; p.shield = 0; p.curse = null; };

function move(s, p, dx, dy) {
  const sp = speedOf(p);
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

export function movePlayer(s, p, dx, dy) {
  if (!dx && !dy) return;
  if (curseIs(p, "reverse")) { dx = -dx; dy = -dy; }
  // One axis at a time; horizontal wins on diagonals.
  const mx = dx, my = dx ? 0 : dy;
  p.face = mx ? (mx > 0 ? 1 : 3) : my > 0 ? 2 : 0;
  const bx = p.x, by = p.y;
  move(s, p, mx, my);
  if (p.x !== bx || p.y !== by) p.walk++;
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

export function step(s, inputs) {
  if (s.done) return;
  s.tick++;
  if (s.tick >= SUDDEN && s.tick % SUDDEN_EVERY === 0 && s.cfg.suddenDeath) closeIn(s);

  for (const p of s.players) {
    if (!p.alive) continue;
    const inp = inputs[p.id] || {};
    movePlayer(s, p, inp.dx || 0, inp.dy || 0);
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

  if (s.end < 0) {
    const alive = s.players.filter((p) => p.alive);
    if (new Set(alive.map((p) => teamOf(s, p.id))).size <= 1) {
      s.end = END_DELAY;
      s.winner = alive.length ? alive[0].id : -1;
      s.winnerTeam = alive.length && s.cfg.teams ? teamOf(s, alive[0].id) : -1;
    }
  } else if (--s.end <= 0) s.done = true;
}
