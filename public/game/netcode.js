import { movePlayer, placeBomb, FUSE } from "./sim.js";

export const TICK_MS = 1000 / 60;
const IDLE = 4;
const LEAD = 2, MAX_AHEAD = 8, MAX_STALE = 10, MAX_BATCH = 16, MAX_STARVE = 12;
const MAX_REPLAY = 90, SNAP_DIST = 24, TELEPORT = 40, ERR_DECAY = 0.85;
const GHOST_TTL = 60, BUFFER = 30;

// Input code: dx + 1 + 3 * (dy + 1), +9 when the bomb key was pressed on that tick.
export const packInput = ({ dx = 0, dy = 0, bomb }) => dx + 1 + 3 * (dy + 1) + (bomb ? 9 : 0);
const unpackInput = (c) => ({ dx: (c % 3) - 1, dy: Math.floor((c % 9) / 3) - 1, bomb: c >= 9 });

export function packSnap(s, withGrid) {
  const { hidden, grid, flames, rs, cfg, ...rest } = s;
  return { ...rest, g: withGrid ? grid.join("") : undefined, cfg: withGrid ? cfg : undefined, f: flames.map((f) => [f.x, f.y, f.t]) };
}

export function unpackSnap(p, prevGrid, prevCfg) {
  if (!Array.isArray(p?.players) || !Array.isArray(p.f) || !Array.isArray(p.bombs) || !Array.isArray(p.items)) return null;
  const grid = typeof p.g === "string" ? Array.from(p.g, Number) : prevGrid;
  if (!grid || grid.length !== 195) return null;
  const { g, f, cfg, ...rest } = p;
  return { ...rest, grid, cfg: cfg ?? prevCfg, flames: f.map(([x, y, t]) => ({ x, y, t })) };
}

// Host side: replays each guest's per-tick inputs in order, one per sim tick. Missing ticks repeat the held
// direction (idle after MAX_STARVE ticks, e.g. dropped guest); `cursor` (the ack) counts guest ticks consumed whether or not their data arrived.
export function createInbox() {
  const q = new Map();
  let cursor = null, newest = -1, held = IDLE, bomb = false, starve = 0;
  return {
    get ack() { return cursor; },
    push(n, d) {
      if (!Number.isSafeInteger(n) || !Array.isArray(d) || n < 0) return;
      const last = n + Math.min(d.length, MAX_BATCH) - 1;
      if (cursor === null || last < cursor - MAX_STALE) {
        cursor = n - LEAD;
        newest = -1;
        q.clear();
      }
      d.slice(0, MAX_BATCH).forEach((c, i) => {
        c = Number.isInteger(c) && c >= 0 && c < 18 ? c : IDLE;
        if (n + i < cursor) bomb ||= c >= 9;
        else q.set(n + i, c);
      });
      newest = Math.max(newest, last);
    },
    next() {
      if (cursor === null) return unpackInput(IDLE);
      if (newest - cursor > MAX_AHEAD) {
        const to = newest - LEAD;
        for (const [k, c] of q) if (k < to) { bomb ||= c >= 9; q.delete(k); }
        cursor = to;
      }
      const c = q.get(cursor);
      q.delete(cursor++);
      if (c !== undefined) { held = c % 9; starve = 0; }
      else if (++starve > MAX_STARVE) held = IDLE;
      const inp = unpackInput(held);
      inp.bomb = (c >= 9) || bomb;
      bomb = false;
      return inp;
    },
  };
}

// Guest side: predicts the own player on top of the latest snapshot and renders everyone else
// `delay` ms in the past, interpolated between snapshots.
export function createGuestNet(me, delay = 100) {
  const buf = [];
  const hist = new Uint8Array(256);
  let offs = [], base = 0, rt = null, lastNow = null;
  let L = 0, sent = 0, first = null, quiet = true;
  let w = null, pred = null, ex = 0, ey = 0, ghosts = [];

  function apply(inp, live) {
    if (!pred?.alive) return;
    movePlayer(w, pred, inp.dx, inp.dy);
    if (inp.bomb) {
      const b = placeBomb(w, pred);
      if (b && live) ghosts.push({ x: b.x, y: b.y, at: L });
    }
  }

  function reset() {
    buf.length = 0;
    offs = [];
    rt = null;
    ghosts = [];
    ex = ey = 0;
  }

  return {
    get err() { return Math.hypot(ex, ey); },

    tick(inp) {
      const c = packInput(inp);
      hist[L & 255] = c;
      apply(unpackInput(c), true);
      L++;
      ex *= ERR_DECAY;
      ey *= ERR_DECAY;
      if (Math.abs(ex) + Math.abs(ey) < 0.05) ex = ey = 0;
    },

    take() {
      if (sent === L) return null;
      const d = Array.from({ length: L - sent }, (_, i) => hist[(sent + i) & 255]);
      const msg = { n: sent, d };
      sent = L;
      const idle = d.every((c) => c === IDLE);
      if (idle && quiet) return null;
      quiet = idle;
      first ??= msg.n;
      return msg;
    },

    onSnap(s, ack, now) {
      let last = buf.at(-1);
      if (last && s.tick < last.s.tick) { reset(); last = null; }
      if (last && s.tick === last.s.tick) buf[buf.length - 1] = { s, ms: s.tick * TICK_MS };
      else buf.push({ s, ms: s.tick * TICK_MS });
      if (buf.length > BUFFER) buf.shift();
      offs.push(now - s.tick * TICK_MS);
      if (offs.length > 90) offs.shift();
      base = Math.min(...offs);

      const auth = s.players[me];
      if (!auth) return;
      const old = pred && { x: pred.x + ex, y: pred.y + ey };
      pred = { ...auth };
      w = { ...s, bombs: s.bombs.map((b) => ({ ...b })), players: s.players.map((q) => (q.id === me ? pred : q)) };
      const from = Number.isInteger(ack) ? ack : (first ?? L);
      if (from <= L && L - from <= MAX_REPLAY) for (let k = from; k < L; k++) apply(unpackInput(hist[k & 255]), false);
      const dx = old ? old.x - pred.x : 0, dy = old ? old.y - pred.y : 0;
      [ex, ey] = Math.hypot(dx, dy) < SNAP_DIST ? [dx, dy] : [0, 0];
    },

    frame(now) {
      if (!buf.length) return null;
      const dt = lastNow === null ? 0 : now - lastNow;
      lastNow = now;
      const target = now - base - delay;
      if (rt === null || Math.abs(target - rt - dt) > 250) rt = target;
      else rt += dt + (target - rt - dt) * 0.05;
      rt = Math.min(rt, buf.at(-1).ms);
      let i = 0;
      while (i + 1 < buf.length && buf[i + 1].ms <= rt) i++;
      buf.splice(0, i);
      const a = buf[0].s, nb = buf[1];
      let players = a.players.slice();
      if (nb && rt > buf[0].ms) {
        const k = Math.min(1, (rt - buf[0].ms) / (nb.ms - buf[0].ms));
        players = players.map((p, j) => {
          const q = nb.s.players[j];
          if (!q || Math.hypot(q.x - p.x, q.y - p.y) > TELEPORT) return p;
          return { ...p, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
        });
      }
      if (pred && players[me]) {
        players[me] = { ...players[me], x: pred.x + ex, y: pred.y + ey, face: pred.face, walk: pred.walk };
      }
      ghosts = ghosts.filter((g) => L - g.at < GHOST_TTL && !a.bombs.some((b) => b.x === g.x && b.y === g.y));
      const ahead = Math.max(0, rt - buf[0].ms) / TICK_MS;
      const bombs = a.bombs.map((b) => (b.dx || b.dy ? { ...b, sc: b.sc + ahead } : b)).concat(
        ghosts.map((g) => ({ x: g.x, y: g.y, owner: me, t: Math.max(1, FUSE - (L - g.at)), range: 1, pass: [] })),
      );
      return { ...a, players, bombs };
    },
  };
}
