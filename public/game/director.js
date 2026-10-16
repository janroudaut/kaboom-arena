import { W, H, T, blast } from "./sim.js";

// Pure game-feel layer: diffs successive states (solo, host or guest alike) into events and per-player stats,
// then turns them into announcer banners, hit-stop/slow-mo requests, camera punches and story speech bubbles.
// Nothing allocates per call except when an event fires.

const N = W * H, MAXB = 32, SHIELD = 6, SKULL = 7;
const zero = () => new Array(16).fill(0);
export const newStats = () => ({ bombs: zero(), kills: zero(), own: zero(), items: zero(), walls: zero() });

// on(kind, a, b, c): "reset"; "bomb" (owner); "blast" (bombs, walls); "die" (victim, killer, -); "pick" (id, type);
// "close" (id); "sudden"; "decide" (winner); "done". killer === victim means own bomb, -1 unknown (sudden death crush).
export function createTracker() {
  const grid = new Uint8Array(N), occ = new Uint8Array(N), item = new Int8Array(N), fl = new Uint8Array(N), nf = new Uint8Array(N), own = new Uint16Array(N);
  const pb = new Int16Array(MAXB * 5), alive = [true, true, true, true];
  let npb = 0, tick = -1, n = 0, end = -1, done = false, sd = 0, round = newStats(), total = newStats(), counted = false;

  const clear = (st) => { for (const k in st) st[k].fill(0); };
  const near = (j) => nf[j] > fl[j];
  const has = (bombs, x, y, o) => { for (const b of bombs) if (b.x === x && b.y === y && b.owner === o) return true; return false; };
  const lowest = (m) => (m ? 31 - Math.clz32(m & -m) : -1);

  function update(s, on) {
    const np = s.players.length;
    const fresh = tick < 0 || s.tick < tick || np !== n;
    if (fresh && tick >= 0) { clear(round); counted = false; on("reset"); }
    nf.fill(0);
    for (const f of s.flames) nf[f.y * W + f.x]++;
    for (let i = 0; i < N; i++) if (!nf[i]) own[i] = 0;
    let bombsOut = 0, wallsOut = 0;

    if (!fresh) {
      let objs = null;
      for (let k = 0; k < npb; k++) {
        const x = pb[k * 5], y = pb[k * 5 + 1], o = pb[k * 5 + 2];
        if (has(s.bombs, x, y, o) || nf[y * W + x] <= fl[y * W + x]) continue;
        objs ||= Array.from({ length: npb }, (_, j) => ({ x: pb[j * 5], y: pb[j * 5 + 1] }));
        bombsOut++;
        // ponytail: blasts are computed on the previous grid with every previous bomb as a blocker; chain order is not replayed.
        for (const [cx, cy] of blast({ grid, bombs: objs }, x, y, pb[k * 5 + 3])) {
          const i = cy * W + cx;
          if (grid[i] === 2 && s.grid[i] === 0 && !own[i]) { if (o >= 0) round.walls[o]++; wallsOut++; }
          if (o >= 0) own[i] |= 1 << o;
        }
      }
      if (bombsOut) on("blast", bombsOut, wallsOut);

      for (let id = 0; id < np; id++) {
        const p = s.players[id];
        if (alive[id] && !p.alive) {
          const m = own[Math.floor(p.y / T) * W + Math.floor(p.x / T)], mine = 1 << id;
          const killer = !m ? -1 : m === mine ? id : lowest(m & ~mine);
          if (killer === id) round.own[id]++;
          else if (killer >= 0) round.kills[killer]++;
          on("die", id, killer);
        }
      }

      for (const b of s.bombs) {
        if (b.owner >= 0 && !(b.dx || b.dy) && !occ[b.y * W + b.x]) { round.bombs[b.owner]++; on("bomb", b.owner); }
      }

      for (let i = 0; i < N; i++) {
        if (!item[i] || nf[i]) continue;
        const x = i % W, y = (i / W) | 0;
        if (s.items.some((it) => it.x === x && it.y === y)) continue;
        const id = s.players.findIndex((p, k) => (alive[k] || p.alive) && Math.floor(p.x / T) === x && Math.floor(p.y / T) === y);
        if (id >= 0) { round.items[id]++; on("pick", id, item[i] - 1); }
      }

      for (let id = 0; id < np; id++) {
        const p = s.players[id];
        if (!p.alive) continue;
        const tx = Math.floor(p.x / T), ty = Math.floor(p.y / T), i = ty * W + tx;
        if (nf[i]) continue;
        if ((tx > 0 && near(i - 1)) || (tx < W - 1 && near(i + 1)) || (ty > 0 && near(i - W)) || (ty < H - 1 && near(i + W))) on("close", id);
      }

      if (s.sd > 0 && sd === 0) on("sudden");
      if (s.end >= 0 && end < 0) on("decide", s.winner);
      if (s.done && !done) {
        if (!counted) for (const k in total) for (let id = 0; id < 4; id++) total[k][id] += round[k][id];
        counted = true;
        on("done");
      }
    }

    tick = s.tick; n = np; end = s.end; done = s.done; sd = s.sd | 0;
    for (let i = 0; i < N; i++) grid[i] = s.grid[i];
    fl.set(nf);
    occ.fill(0);
    item.fill(0);
    npb = 0;
    for (const b of s.bombs) {
      occ[b.y * W + b.x] = 1;
      if (npb < MAXB) { pb[npb * 5] = b.x; pb[npb * 5 + 1] = b.y; pb[npb * 5 + 2] = b.owner; pb[npb * 5 + 3] = b.range; npb++; }
    }
    for (const it of s.items) item[it.y * W + it.x] = it.type + 1;
    for (let id = 0; id < np; id++) alive[id] = s.players[id].alive;
  }

  return {
    update, round: () => round, total: () => total,
    // Forget everything, including the match totals (new match).
    restart() { tick = -1; n = 0; counted = false; clear(round); clear(total); },
  };
}

// Funny awards from a stats object: only a strict, non-trivial maximum wins. Returns up to 3 of { title, who, desc }.
const AWARDS = [
  ["own", "Darwin Award", "died to own bomb", 1],
  ["kills", "Terminator", "most kills", 2],
  ["bombs", "Pyromaniac", "most bombs", 3],
  ["walls", "Wall Wrecker", "most walls", 4],
  ["items", "Collector", "most items", 2],
];
export function awards(st, np) {
  const out = [];
  for (const [key, title, desc, min] of AWARDS) {
    const v = st[key].slice(0, np), top = Math.max(...v);
    if (top >= min && v.indexOf(top) === v.lastIndexOf(top)) out.push({ title, who: v.indexOf(top), desc });
  }
  return out.slice(0, 3);
}

export function recapView(st, np, names) {
  return {
    rows: Array.from({ length: np }, (_, i) => ({ id: i, name: names?.[i] ?? `P${i + 1}`, cells: [st.bombs[i], st.kills[i], st.items[i], st.walls[i]] })),
    awards: awards(st, np),
  };
}

// Banner queue: one at a time, short queue, per-key cooldown, a higher priority preempts. Times are in caller ms.
export function createAnnouncer(cap = 2) {
  const cool = new Map(), q = [];
  let cur = null;
  const show = (e, now) => { e.at = now; e.until = now + e.hold; cur = e; };
  return {
    push(key, text, { prio = 0, hold = 1400, cd = 0, still = false } = {}, now) {
      if (now < (cool.get(key) ?? 0)) return false;
      cool.set(key, now + Math.max(cd, hold));
      const e = { key, text, prio, hold, still, at: 0, until: 0, queued: now };
      if (!cur) show(e, now);
      else if (prio > cur.prio) show(e, now);
      else if (q.length < cap) q.push(e);
      else {
        const low = q.reduce((a, b, i) => (b.prio < q[a].prio ? i : a), 0);
        if (q[low].prio >= prio) return false;
        q[low] = e;
      }
      return true;
    },
    tick(now) {
      if (cur && now >= cur.until) cur = null;
      while (!cur && q.length) {
        const e = q.shift();
        if (now - e.queued < 2500) show(e, now);
      }
      return cur;
    },
    get cur() { return cur; },
    clear() { cur = null; q.length = 0; },
  };
}

const SLOW = 0.35, RAMP = 250;
// Simulation speed factor for the main loop's accumulator; times are in the same ms clock as the director.
export function timeScale(d, now) {
  if (now < d.hitUntil) return 0;
  const r = d.slowUntil - now;
  if (r <= 0) return 1;
  return r > RAMP ? SLOW : SLOW + (1 - SLOW) * (1 - r / RAMP);
}

// Greedy wrap into at most two lines (speech bubbles).
export function wrap(text, max = 14) {
  const out = [""];
  for (const w of text.split(" ")) {
    const l = out.length - 1;
    if (out[l] && out[l].length + 1 + w.length > max && out.length < 2) out.push(w);
    else out[l] = out[l] ? `${out[l]} ${w}` : w;
  }
  return out;
}

// Bubble rect in the caller's units: above the anchor, clamped to box = [x0, y0, x1, y1], pushed to the top/bottom
// edge when it would cover the hole (the centre of the playfield). Writes into out = { x, y, tail }.
export function placeBubble(out, ax, ay, w, h, box, hole, gap = 6) {
  out.x = Math.min(Math.max(ax - w / 2, box[0]), box[2] - w);
  out.y = Math.max(ay - h - gap, box[1]);
  out.tail = true;
  if (out.x < hole[2] && out.x + w > hole[0] && out.y < hole[3] && out.y + h > hole[1]) {
    out.y = ay < (hole[1] + hole[3]) / 2 ? box[1] : box[3] - h;
    out.tail = false;
  }
  return out;
}

const HIT_MS = 80, SLOW_MS = 800, SAY_MS = 2000, SAY_EVERY = 8000, CHAT_ODDS = { bomb: 1, die: 1, win: 1, close: 0.5 };

// Orchestrates a tracker, an announcer, time effects and bubbles. ctx (reused by the caller) = {
//   human(id), announce, timeFx (hit-stop + slow-mo allowed), punch (camera/zoom pulse allowed), chat (story bubbles),
//   still, line(id, event) -> string|null, rand }.
export function createDirector() {
  const tr = createTracker(), ann = createAnnouncer();
  const d = {
    tracker: tr, announcer: ann, hitUntil: 0, slowUntil: 0, punch: null, bub: [null, null],
    bubbled: [false, false], nextSay: [0, 0],
  };
  const last = { x: 0, y: 0 };
  let lastDie = -1e9, np = 0, now = 0, ctx = null, cur = null;

  const say = (id, ev) => {
    if (!ctx.chat || id < 0 || id > 1) return;
    if (ev !== "die" && ev !== "win" && (now < d.nextSay[id] || d.bub[id])) return;
    if (ctx.rand() >= (CHAT_ODDS[ev] ?? 1)) return;
    const text = ctx.line(id, ev);
    if (!text) return;
    const lines = wrap(text);
    d.bub[id] = { text, lines, cols: Math.max(...lines.map((l) => l.length)), at: now, until: now + SAY_MS };
    d.nextSay[id] = now + SAY_EVERY;
  };
  const call = (key, text, prio, cd = 0) => ctx.announce && ann.push(key, text, { prio, cd, still: ctx.still }, now);

  function on(kind, a, b) {
    if (kind === "reset") {
      ann.clear();
      d.hitUntil = d.slowUntil = 0;
      d.punch = null;
      d.bub[0] = d.bub[1] = null;
    } else if (kind === "bomb") {
      if (!d.bubbled[a] && a < 2) { d.bubbled[a] = true; say(a, "bomb"); }
    } else if (kind === "blast") {
      if (a >= 3 || b >= 5) call("kaboom", "KABOOM!", 2, 4000);
    } else if (kind === "die") {
      const p = cur.players[a];
      last.x = p.x / T; last.y = p.y / T;
      if (ctx.timeFx && (ctx.human(a) || (b >= 0 && b !== a && ctx.human(b)))) d.hitUntil = now + HIT_MS;
      if (now - lastDie < 1000) call("double", "DOUBLE KILL!", 3);
      else if (a === b) call("darwin", "DARWIN AWARD", 2);
      lastDie = now;
      say(a, "die");
    } else if (kind === "pick") {
      if (ctx.human(a)) {
        if (b === SHIELD) call("shield", "SHIELD UP!", 1, 1500);
        else if (b === SKULL) call("curse", "CURSED!", 1, 1500);
      }
    } else if (kind === "close") {
      if (ctx.human(a)) call("close", "CLOSE CALL!", 1, 7000);
      say(a, "close");
    } else if (kind === "sudden") {
      call("sudden", "SUDDEN DEATH!", 2);
    } else if (kind === "decide") {
      if (ctx.timeFx) d.slowUntil = now + SLOW_MS;
      if (ctx.punch) d.punch = { x: last.x, y: last.y };
      if (a >= 0 && np >= 3) call("last", "LAST ONE STANDING", 2);
      say(a, "win");
    }
  }

  d.update = (s, t, c) => {
    cur = s; now = t; ctx = c; np = s.players.length;
    tr.update(s, on);
    const k = ann.tick(now);
    for (let i = 0; i < 2; i++) if (d.bub[i] && now >= d.bub[i].until) d.bub[i] = null;
    return k;
  };
  d.restart = () => {
    tr.restart();
    ann.clear();
    d.hitUntil = d.slowUntil = 0;
    d.punch = null;
    d.bub[0] = d.bub[1] = null;
    d.bubbled[0] = d.bubbled[1] = false;
    d.nextSay[0] = d.nextSay[1] = 0;
  };
  return d;
}
