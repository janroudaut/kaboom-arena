import { newGame, step, MODES, ABILITY_ID, SURV_SLOTS } from "./sim.js";
import { THEMES, MODE_INFO, teamInfo } from "./look.js";
import { LAYOUTS } from "./settings.js";
import { BY_ID, ladder, fightOf } from "./campaign.js";
import { cleanName } from "./lobby.js";

// Bump when sim.js or the bot-independent rules change in a way that alters a recorded match: older replays are then refused.
export const SIM_VERSION = 1;
export const FORMAT = 1;
export const MAX_ROUNDS = 40, MAX_TK = 108000, MAX_TOTAL = 600000, MAX_BYTES = 1 << 21, MAX_LINK = 8000, MAX_FRAGMENT = 70000;
export const KEY_EVERY = 300;
const KINDS = ["solo", "local", "story", "daily", "host"];
const LEVELS = ["easy", "normal", "hard"];
const BOOLS = ["powerups", "suddenDeath", "friendlyFire", "chaos", "bombs"];
const NAMES = Object.keys(ABILITY_ID).filter((k) => k !== "undefined");

// One tick of one player: 9 direction pairs x bomb x act, idle = 0.
export function code(i) {
  if (!i) return 0;
  const f = (v) => (v > 0 ? 1 : v < 0 ? 2 : 0);
  return (f(i.dx) * 3 + f(i.dy)) * 4 + (i.bomb ? 1 : 0) + (i.act ? 2 : 0);
}
const AX = [0, 1, -1];
export const uncode = (c) => ({ dx: AX[Math.floor(c / 12)], dy: AX[Math.floor(c / 4) % 3], bomb: !!(c & 1), act: !!(c & 2) });

export function cleanOpts(o) {
  const out = {};
  if (!o || typeof o !== "object") return out;
  if (LAYOUTS.includes(o.layout)) out.layout = o.layout;
  for (const k of BOOLS) if (typeof o[k] === "boolean") out[k] = o[k];
  if (typeof o.softDensity === "number" && o.softDensity >= 0 && o.softDensity <= 1) out.softDensity = o.softDensity;
  if (Array.isArray(o.teams) && o.teams.length === 4 && o.teams.every((v, i) => v === i % 2)) out.teams = [0, 1, 0, 1];
  if (o.tiles === "few" || o.tiles === "many") out.tiles = o.tiles;
  if (MODES.includes(o.mode)) out.mode = o.mode;
  if (o.abilities === true) out.abilities = true;
  else if (Array.isArray(o.abilities) && o.abilities.length <= 4 && o.abilities.every((a) => NAMES.includes(a))) out.abilities = [...o.abilities];
  return out;
}

const playersOf = (n, o) => n + (o.mode === "survival" ? SURV_SLOTS : 0);
const int = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

// ---- recorder -------------------------------------------------------------------------------------------------

export function createRecorder(head) {
  const rec = { head: { ...head }, rounds: [], cur: null };
  rec.begin = (s, seed, opts, theme, kill) => {
    const np = s.players.length;
    rec.cur = { sd: seed, th: theme, o: cleanOpts(opts), tk: 0, wn: -1, wt: -1, h: 0, runs: Array.from({ length: np }, () => []), last: new Array(np).fill(-1), len: new Array(np).fill(0) };
    if (kill?.length) rec.cur.kl = [...kill];
    rec.rounds.push(rec.cur);
  };
  const flush = (r, i) => {
    if (r.len[i]) r.runs[i].push((r.len[i] - 1) * 36 + r.last[i]);
  };
  // Records the inputs and runs the sim step. Input of a player dead before and after the step is never read: stored as idle.
  rec.step = (s, inputs) => {
    const r = rec.cur, np = s.players.length;
    if (!r || r.tk >= MAX_TK) return step(s, inputs);
    const was = s.players.map((p) => p.alive), codes = [];
    for (let i = 0; i < np; i++) codes.push(code(inputs[i]));
    step(s, inputs);
    for (let i = 0; i < np; i++) {
      const c = !was[i] && !s.players[i].alive ? 0 : codes[i];
      if (c === r.last[i]) r.len[i]++;
      else { flush(r, i); r.last[i] = c; r.len[i] = 1; }
    }
    r.tk++;
  };
  rec.end = (s) => {
    const r = rec.cur;
    if (!r) return;
    for (let i = 0; i < r.runs.length; i++) flush(r, i);
    r.len.fill(0);
    if (s?.done && r.tk < MAX_TK) { r.wn = s.winner; r.wt = s.winnerTeam; r.h = stateHash(s); }
    rec.cur = null;
  };
  rec.finish = (extra) => {
    rec.end();
    const rounds = rec.rounds.map(({ sd, th, o, tk, wn, wt, h, kl, runs }) => ({ sd, th, o, tk, wn, wt, h, ...(kl ? { kl } : {}), runs }));
    return { ...rec.head, ...extra, v: SIM_VERSION, r: rounds };
  };
  return rec;
}

// ---- binary format --------------------------------------------------------------------------------------------
// "KB" format(1) | varint headLen | head JSON (utf8) | per round, per player: varint byteLen | varint runs ((len-1)*36 + code)

function putVar(out, v) {
  while (v >= 128) { out.push((v & 127) | 128); v = Math.floor(v / 128); }
  out.push(v);
}

export function encode(m) {
  const head = { v: m.v, k: m.k, n: m.n, hm: m.hm, nm: m.nm, w: m.w, lv: m.lv, st: m.st, dl: m.dl, fg: m.fg, ts: m.ts, rs: m.rs, r: m.r.map(({ runs, ...meta }) => meta) };
  const json = new TextEncoder().encode(JSON.stringify(head));
  const out = [0x4b, 0x42, FORMAT];
  putVar(out, json.length);
  const parts = [Uint8Array.from(out), json];
  for (const r of m.r) {
    for (const runs of r.runs) {
      const b = [];
      for (const v of runs) putVar(b, v);
      const l = [];
      putVar(l, b.length);
      parts.push(Uint8Array.from(l), Uint8Array.from(b));
    }
  }
  const res = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { res.set(p, o); o += p.length; }
  return res;
}

function cleanHead(h) {
  if (!h || typeof h !== "object" || !Array.isArray(h.r) || !h.r.length || h.r.length > MAX_ROUNDS) return null;
  if (!KINDS.includes(h.k) || !int(h.n, 1, 4) || !int(h.hm, 0, 0xffff) || !int(h.w, 0, 3) || !(h.lv == null || LEVELS.includes(h.lv))) return null;
  if (!Array.isArray(h.nm) || h.nm.length > 16 || !Number.isSafeInteger(h.ts) || h.ts < 0) return null;
  let st = null;
  if (h.st != null) {
    if (typeof h.st.id !== "string" || !Object.hasOwn(BY_ID, h.st.id) || !int(h.st.i, 0, ladder(h.st.id).length - 1)) return null;
    st = { id: h.st.id, i: h.st.i };
  }
  const dl = typeof h.dl === "string" && /^\d{4}-\d\d-\d\d$/.test(h.dl) ? h.dl : null;
  const fg = typeof h.fg === "string" && Object.hasOwn(BY_ID, h.fg) ? h.fg : null;
  const rounds = [];
  let total = 0;
  for (const r of h.r) {
    if (!r || !Number.isSafeInteger(r.sd) || r.sd < 0 || !Object.hasOwn(THEMES, r.th) || !int(r.tk, 0, MAX_TK)) return null;
    total += r.tk;
    const o = cleanOpts(r.o), np = playersOf(h.n, o);
    if (o.mode === "survival" && h.n > 4) return null;
    if (!int(r.wn, -1, 15) || !int(r.wt, -1, 1) || !int(r.h, 0, 0xffffffff)) return null;
    let kl;
    if (r.kl != null) {
      if (!Array.isArray(r.kl) || r.kl.length > 16 || !r.kl.every((i) => int(i, 0, np - 1))) return null;
      kl = [...r.kl];
    }
    rounds.push({ sd: r.sd, th: r.th, o, tk: r.tk, wn: r.wn, wt: r.wt, h: r.h, ...(kl ? { kl } : {}), np });
  }
  if (total > MAX_TOTAL) return null;
  return {
    v: h.v, k: h.k, n: h.n, hm: h.hm, nm: h.nm.map(cleanName), w: h.w, lv: h.lv ?? null, st, dl, fg, ts: h.ts,
    rs: typeof h.rs === "string" ? h.rs.replace(/[\p{C}]+/gu, " ").trim().slice(0, 40) : "", r: rounds,
  };
}

// Never throws. { match } | { error: "version" | "corrupt" }.
export function decode(bytes) {
  try {
    if (!(bytes instanceof Uint8Array) || bytes.length > MAX_BYTES || bytes.length < 6 || bytes[0] !== 0x4b || bytes[1] !== 0x42 || bytes[2] !== FORMAT) return { error: "corrupt" };
    let p = 3;
    const getVar = () => {
      let v = 0, mul = 1;
      for (let k = 0; k < 5; k++) {
        if (p >= bytes.length) return -1;
        const b = bytes[p++];
        v += (b & 127) * mul;
        if (b < 128) return v;
        mul *= 128;
      }
      return -1;
    };
    const hl = getVar();
    if (hl < 2 || hl > 60000 || p + hl > bytes.length) return { error: "corrupt" };
    const raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(p, p + hl)));
    p += hl;
    if (raw?.v !== SIM_VERSION) return { error: Number.isInteger(raw?.v) ? "version" : "corrupt" };
    const head = cleanHead(raw);
    if (!head) return { error: "corrupt" };
    for (const r of head.r) {
      r.runs = [];
      for (let i = 0; i < r.np; i++) {
        const nb = getVar();
        if (nb < 0 || p + nb > bytes.length) return { error: "corrupt" };
        const end = p + nb, runs = [];
        let sum = 0;
        while (p < end) {
          const v = getVar();
          if (v < 0 || p > end) return { error: "corrupt" };
          sum += Math.floor(v / 36) + 1;
          if (sum > r.tk) return { error: "corrupt" };
          runs.push(v);
        }
        if (sum !== r.tk) return { error: "corrupt" };
        r.runs.push(runs);
      }
      delete r.np;
    }
    return p === bytes.length ? { match: head } : { error: "corrupt" };
  } catch {
    return { error: "corrupt" };
  }
}

// ---- text forms (links, files, storage) ----------------------------------------------------------------------------

export const b64 = (u8) => {
  let s = "";
  for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode(...u8.subarray(i, i + 8192));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
export function unb64(t) {
  if (typeof t !== "string" || t.length > MAX_FRAGMENT * 2 || !/^[A-Za-z0-9_-]*$/.test(t)) return null;
  try {
    const s = atob(t.replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(s, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function pump(bytes, stream, cap) {
  try {
    const rd = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await rd.read();
      if (done) break;
      total += value.length;
      if (total > cap) { rd.cancel().catch(() => {}); return null; }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  } catch {
    return null;
  }
}

// First char: "0" raw, "1" deflate-raw. Falls back to raw where CompressionStream is missing.
export async function pack(match) {
  const raw = encode(match);
  if (typeof CompressionStream === "undefined") return `0${b64(raw)}`;
  const z = await pump(raw, new CompressionStream("deflate-raw"), MAX_BYTES);
  return z && z.length < raw.length ? `1${b64(z)}` : `0${b64(raw)}`;
}

export async function unpack(text) {
  if (typeof text !== "string" || text.length < 2 || text.length > MAX_FRAGMENT * 2) return { error: "corrupt" };
  let bytes = unb64(text.slice(1));
  if (!bytes) return { error: "corrupt" };
  if (text[0] === "1") {
    if (typeof DecompressionStream === "undefined") return { error: "corrupt" };
    bytes = await pump(bytes, new DecompressionStream("deflate-raw"), MAX_BYTES);
    if (!bytes) return { error: "corrupt" };
  } else if (text[0] !== "0") return { error: "corrupt" };
  return decode(bytes);
}

// The match, or only its last round when the whole thing does not fit the link budget; null = file export only.
export async function linkText(match) {
  let t = await pack(match);
  if (t.length <= MAX_LINK) return { text: t, trimmed: false };
  if (match.r.length > 1) {
    t = await pack({ ...match, r: match.r.slice(-1) });
    if (t.length <= MAX_LINK) return { text: t, trimmed: true };
  }
  return null;
}

export const fileText = async (match) => JSON.stringify({ kaboom: 1, replay: await pack(match) });
export async function fromFileText(text) {
  try {
    if (typeof text !== "string" || text.length > MAX_FRAGMENT * 40) return { error: "corrupt" };
    return unpack(JSON.parse(text)?.replay);
  } catch {
    return { error: "corrupt" };
  }
}

export const fragmentOf = (hash) => (typeof hash === "string" && hash.startsWith("#r=") && hash.length <= MAX_FRAGMENT ? hash.slice(3) : null);

// ---- scoring, shared by live matches and playback --------------------------------------------------------------------

export const stateHash = (s) => {
  let h = 0x811c9dc5;
  const mix = (v) => { h = Math.imul(h ^ (v | 0), 0x01000193) >>> 0; };
  mix(s.tick); mix(s.winner); mix(s.winnerTeam);
  for (const c of s.grid) mix(c);
  for (const p of s.players) { mix(Math.round(p.x * 8)); mix(Math.round(p.y * 8)); mix(p.alive ? 1 : 0); mix(p.bombs); mix(p.range); }
  mix(s.bombs.length); mix(s.items.length);
  return h;
};

export function award(scores, s) {
  const tm = s.cfg?.teams;
  if (s.winnerTeam >= 0 && tm) s.players?.forEach?.((p) => tm[p.id] === s.winnerTeam && scores[p.id]++);
  else if (s.winner >= 0) scores[s.winner]++;
}

// End of a round: scores, match end, banner and the pause before the next round. Returns true when the match is over.
export function settle(g) {
  const s = g.s;
  if (s.survival) {
    const w = s.survival.wave, t = Math.floor(s.survival.t / 60);
    g.over = true;
    g.banner = w ? `Survived ${w} wave${w > 1 ? "s" : ""} · ${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}` : "Wiped out before wave 1";
    g.wait = 180;
    return true;
  }
  const tm = s.cfg.teams, who = (id) => (tm ? `Team ${teamInfo(tm[id]).name}` : g.names[id]);
  award(g.scores, s);
  const champ = g.scores.findIndex((x) => x >= g.win);
  g.over = champ >= 0;
  g.banner = g.story ? (g.over ? (champ === 0 ? "VICTORY!" : "YOU LOSE") : s.winner === 0 ? "KABOOM!" : s.winner > 0 ? "OUCH!" : "DRAW!") : g.over ? `${who(champ)} wins the match!` : s.winner >= 0 ? `${who(s.winner)} wins the round` : "Draw";
  g.wait = 180;
  return g.over;
}

// ---- playback -----------------------------------------------------------------------------------------------------

export function createPlayback(match) {
  const rounds = match.r.map((r) => ({ ...r, ends: r.runs.map((runs) => { const e = new Uint32Array(runs.length); let t = 0; runs.forEach((v, k) => (e[k] = t += Math.floor(v / 36) + 1)); return e; }), hint: new Array(r.runs.length).fill(0) }));
  const off = [];
  let total = 0;
  for (const r of rounds) { off.push(total); total += r.tk; }
  const keys = rounds.map(() => new Map());
  const pb = { match, rounds, off, total, drift: false, ended: false, r: 0 };

  pb.make = (r) => {
    const x = rounds[r], s = newGame(match.n, x.sd, x.o);
    s.cfg.theme = x.th;
    for (const id of x.kl ?? []) s.players[id].alive = false;
    pb.r = r;
    for (const k of x.hint.keys()) x.hint[k] = 0;
    return s;
  };

  // Fresh input objects for the step that follows s.tick: step() mutates them.
  pb.inputs = (s) => {
    const x = rounds[pb.r], t = s.tick, inp = {};
    for (let i = 0; i < x.runs.length; i++) {
      const e = x.ends[i];
      let k = x.hint[i];
      if (k > 0 && e[k - 1] > t) k = 0;
      while (k < e.length - 1 && e[k] <= t) k++;
      x.hint[i] = k;
      const c = x.runs[i].length ? x.runs[i][k] % 36 : 0;
      if (c) inp[i] = uncode(c);
    }
    return inp;
  };

  pb.note = (s) => {
    if (s.tick % KEY_EVERY === 0 && !keys[pb.r].has(s.tick)) keys[pb.r].set(s.tick, structuredClone(s));
  };

  pb.scoresBefore = (r) => {
    const sc = new Array(match.n).fill(0);
    for (let k = 0; k < r; k++) award(sc, { winner: rounds[k].wn, winnerTeam: rounds[k].wt, cfg: { teams: rounds[k].o.teams ?? null }, players: Array.from({ length: match.n }, (_, id) => ({ id })) });
    return sc;
  };

  // Global tick -> state of that round at that tick: nearest keyframe, then re-simulation (keyframes fill in as playback passes them).
  pb.seek = (T) => {
    T = Math.max(0, Math.min(total - 1, T | 0));
    let r = rounds.length - 1;
    while (off[r] > T) r--;
    const t = T - off[r];
    let s = null, best = -1;
    for (const k of keys[r].keys()) if (k <= t && k > best) best = k;
    if (best >= 0) { s = structuredClone(keys[r].get(best)); pb.r = r; for (const k of rounds[r].hint.keys()) rounds[r].hint[k] = 0; }
    else s = pb.make(r);
    while (s.tick < t && !s.done) {
      pb.note(s);
      step(s, pb.inputs(s));
    }
    return { r, s, scores: pb.scoresBefore(r) };
  };

  pb.at = (s) => off[pb.r] + s.tick;

  // Called when a round's state is done: compares with the recorded hash (engine or version drift).
  pb.check = (s) => {
    const x = rounds[pb.r];
    if (x.h && s.done && stateHash(s) !== x.h) pb.drift = true;
    return !pb.drift;
  };

  pb.story = match.st ? fightOf(match.st.id, match.st.i) : null;
  return pb;
}

// ---- list shown in the Replays screen (localStorage `replays`, storage injected) ------------------------------------------

export const KEEP = 10, KEEP_CHARS = 450000;

export function rulesOf(o) {
  const bits = [MODE_INFO[o.mode ?? "classic"].name];
  if (o.layout) bits.push(`${o.layout} arena`);
  if (o.tiles) bits.push("floor tiles");
  if (o.chaos) bits.push("chaos");
  if (o.bombs) bits.push("special bombs");
  if (o.abilities) bits.push("abilities");
  return bits.join(" · ");
}

export function titleOf(m) {
  if (m.st) return `Story · ${BY_ID[m.st.id].name} vs ${BY_ID[ladder(m.st.id)[m.st.i]].name}`;
  if (m.dl) return `Daily · ${m.dl}`;
  const mode = MODE_INFO[m.r[0].o.mode ?? "classic"].name;
  return m.k === "local" ? `Local · ${mode}` : m.k === "host" ? `Online · ${mode}` : `Solo · ${mode} vs ${m.n - 1} bot${m.n > 2 ? "s" : ""}`;
}

export function loadList(storage) {
  try {
    const a = JSON.parse(storage.getItem("replays"));
    if (!Array.isArray(a)) return [];
    return a.slice(0, KEEP).filter((e) => e && typeof e.id === "string" && typeof e.data === "string" && e.data.length <= MAX_FRAGMENT * 2 && Number.isSafeInteger(e.ts))
      .map((e) => ({ id: e.id.slice(0, 20), ts: e.ts, title: String(e.title ?? "").slice(0, 60), res: String(e.res ?? "").slice(0, 60), data: e.data }));
  } catch {
    return [];
  }
}

// Newest first; drops the oldest entries beyond KEEP or KEEP_CHARS of storage.
export function addEntry(list, e) {
  const out = [e, ...list.filter((x) => x.id !== e.id)].slice(0, KEEP);
  while (out.length > 1 && out.reduce((a, x) => a + x.data.length, 0) > KEEP_CHARS) out.pop();
  return out;
}

export function saveList(storage, list) {
  try { storage.setItem("replays", JSON.stringify(list)); return true; } catch { return false; }
}
