import { W, H, T, spikeIn, ICE, SPIKE, EVENTS } from "./sim.js";
import { createObserver } from "./fx.js";
import { pickPlan, hash } from "./music.js";

// name -> [priority 0..9, min gap in ms between two plays]. audio.js must hold a recipe for each.
export const SFX_INFO = {
  bomb: [5, 40], fuse: [1, 60], boom: [8, 60], chain: [7, 300], wall: [3, 50], die: [9, 100], pop: [4, 60], kick: [5, 120], shieldend: [3, 300],
  pick0: [6, 60], pick1: [6, 60], pick2: [6, 60], pick3: [6, 60], pick4: [6, 60], pick5: [6, 60], pick6: [6, 60], pick7: [6, 60],
  start: [9, 0], win: [9, 0], lose: [9, 0], draw: [9, 0], matchwin: [9, 0], matchlose: [9, 0], sudden: [8, 3000],
  click: [4, 40], nav: [3, 40], blip: [3, 20], test: [9, 0],
  tparm: [2, 400], tp: [6, 150], ice: [2, 500], spikeup: [3, 150], spikedn: [1, 150],
  ev0: [7, 0], ev1: [7, 0], ev2: [7, 0], ev3: [7, 0], ev4: [7, 0], quake: [7, 0], swap: [6, 0], frenzy: [6, 0], drop: [4, 0],
  hillpt: [4, 200], hillmove: [5, 0], pass: [6, 150], potbeep: [5, 0], wave: [7, 0],
};
export const VOICES = 16;
const JINGLES = new Set(["start", "win", "lose", "draw", "matchwin", "matchlose"]);

// Voice limiter over a caller-owned list of { end, prio } (expired entries are pruned in place).
// Returns -1 = add, i >= 0 = replace entry i (lowest priority, oldest), -2 = drop the new sound.
export function claim(live, prio, now, cap = VOICES) {
  for (let i = live.length - 1; i >= 0; i--) if (live[i].end <= now) live.splice(i, 1);
  if (live.length < cap) return -1;
  let low = 0;
  for (let i = 1; i < live.length; i++) if (live[i].prio < live[low].prio || (live[i].prio === live[low].prio && live[i].end < live[low].end)) low = i;
  return live[low].prio <= prio ? low : -2;
}

const N = W * H, MAXP = 16, EVN = EVENTS.map((_, i) => `ev${i}`), PICK = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => `pick${i}`);
const SHIELD = 6;

// Round result from the human point of view: "win" | "lose" | "draw". human(id) says whether player id is a local human.
export function outcome(s, human) {
  if (s.cfg?.mode === "survival") return "lose";
  if (s.winner < 0) return "draw";
  const tm = s.cfg?.teams;
  if (tm && s.winnerTeam >= 0) return s.players.some((p) => !p.dormant && human(p.id) && tm[p.id] === s.winnerTeam) ? "win" : "lose";
  return human(s.winner) ? "win" : "lose";
}

// Match result once a champion exists: "matchwin" | "matchlose" | null.
export function matchResult(g, human) {
  const champ = g.scores ? g.scores.findIndex((x) => x >= g.win) : -1;
  if (champ < 0 || !(g.win > 0)) return null;
  const tm = g.s?.cfg?.teams;
  return (tm ? g.s.players.some((p) => !p.dormant && human(p.id) && tm[p.id] === tm[champ]) : human(champ)) ? "matchwin" : "matchlose";
}

// Music intensity 0..2 from the game state: few survivors, or sudden death, or deep into a mode.
export function intensityOf(s) {
  if (s.sd > 0) return 2;
  if (s.survival) return s.survival.wave >= 6 ? 2 : s.survival.wave >= 3 ? 1 : 0;
  let alive = 0;
  for (const p of s.players) if (p.alive && !p.dormant) alive++;
  if (s.hill) for (const v of s.hill.score) if (v >= 20) return 1;
  return alive <= 2 && s.players.length > 2 ? 1 : 0;
}

export const blipPitch = (id) => 0.8 + ((hash(String(id)) % 9) / 8) * 1.1;

const tilePan = (x) => (x < 0 ? 0 : Math.max(-1, Math.min(1, ((x + 0.5) / W) * 2 - 1)) * 0.65);

// Allocation-free state-diff observer (like fx.js). on(name, tileX, amount): tileX < 0 = centred, amount 0..1.
// ctx = { me, human(id) }. The first call after construction/reset only records a baseline.
export function createSoundObserver() {
  let base = createObserver();
  const fl = new Uint8Array(N), nf = new Uint8Array(N), occ = new Uint8Array(N), nocc = new Uint8Array(N), spk = new Uint8Array(N);
  const alive = new Uint8Array(MAXP), shield = new Int16Array(MAXP), tpc = new Int16Array(MAXP), tp = new Int16Array(MAXP), ice = new Uint8Array(MAXP);
  let tick = -1, n = 0, sd = 0, end = -1, slides = 0, minT = 9999, evIdx = -1, evT = 0, evOn = false, wave = 0, hx = -1, hy = -1, hsum = 0, holder = -1, lastBeep = 0;
  let cs = null, cc = null, con = null, walls = 0, wallX = 0;

  const cb = (kind, a, b, c) => {
    if (kind === "wall") { walls++; wallX += a; }
    else if (kind === "bomb") con("bomb", a, 1);
    else if (kind === "die") {
      const p = cs.players[a];
      if (p.dormant) return;
      if (cs.cfg?.humans !== undefined && a >= cs.cfg.humans) con("pop", p.x / T, 0.6);
      else con("die", p.x / T, 1);
    } else if (kind === "pick") con(PICK[c] ?? PICK[0], a, cc.me >= 0 && cs.players[cc.me] && Math.floor(cs.players[cc.me].x / T) === a && Math.floor(cs.players[cc.me].y / T) === b ? 1 : 0.5);
  };

  function remember(s) {
    const np = Math.min(s.players.length, MAXP);
    tick = s.tick; n = s.players.length; sd = s.sd | 0; end = s.end;
    fl.set(nf);
    occ.set(nocc);
    slides = 0; minT = 9999;
    for (const b of s.bombs) {
      if (b.dx || b.dy) slides++;
      else if (b.t < minT) minT = b.t;
    }
    for (let i = 0; i < np; i++) {
      const p = s.players[i];
      alive[i] = p.alive ? 1 : 0; shield[i] = p.shield | 0; tpc[i] = p.tpc | 0; tp[i] = p.tp | 0;
      ice[i] = s.floor && p.alive && s.floor[Math.floor(p.y / T) * W + Math.floor(p.x / T)] === ICE ? 1 : 0;
    }
    if (s.floor) for (let i = 0; i < N; i++) spk[i] = s.floor[i] === SPIKE && !spikeIn(s, i) ? 1 : 0;
    const e = s.event;
    evIdx = e ? EVENTS.indexOf(e.type) : -1; evT = e ? e.t : 0; evOn = !!(e && e.on > 0);
    wave = s.survival ? s.survival.wave : 0;
    hx = s.hill ? s.hill.x : -1; hy = s.hill ? s.hill.y : -1;
    hsum = 0;
    if (s.hill) for (const v of s.hill.score) hsum += v;
    holder = s.potato ? s.potato.holder : -1;
    if (s.potato && s.potato.t > lastBeep) lastBeep = s.potato.t;
  }

  function observe(s, on, ctx) {
    const np = Math.min(s.players.length, MAXP);
    cs = s; cc = ctx; con = on;
    nf.fill(0);
    nocc.fill(0);
    for (const f of s.flames) nf[f.y * W + f.x]++;
    for (const b of s.bombs) nocc[b.y * W + b.x] = 1;
    const fresh = tick < 0 || s.tick + 30 < tick || s.players.length !== n;
    walls = wallX = 0;
    base(s, cb);
    if (fresh) {
      if (s.tick <= 2) on("start", -1, 1);
      remember(s);
      return;
    }
    if (walls) on("wall", wallX / walls, Math.min(1, walls / 4));

    let fresh_ = 0, sumX = 0, gone = 0, minNow = 9999, slideNow = 0, slideX = -1;
    for (let i = 0; i < N; i++) {
      if (nf[i] > fl[i]) { fresh_++; sumX += i % W; }
      if (occ[i] && nf[i] && !nocc[i]) gone++;
    }
    if (fresh_) {
      on("boom", sumX / fresh_, Math.min(1, fresh_ / 22));
      if (gone >= 3) on("chain", sumX / fresh_, Math.min(1, gone / 6));
    }
    for (const b of s.bombs) {
      if (b.dx || b.dy) { slideNow++; slideX = b.x; } else if (b.t < minNow) minNow = b.t;
    }
    if (slideNow > slides) on("kick", slideX, 1);
    if (minNow <= 90 && minNow < minT && ((minNow / 30) | 0) < ((Math.min(minT, 999) / 30) | 0)) on("fuse", -1, 1 - minNow / 90);

    for (let i = 0; i < np; i++) {
      const p = s.players[i];
      if (p.dormant) continue;
      const mine = i === cc.me ? 1 : 0.5, x = p.x / T;
      if (p.alive && alive[i] && shield[i] > 0 && !p.shield) on("shieldend", x, mine);
      if ((p.tpc | 0) > tpc[i]) on("tp", x, mine);
      else if ((p.tp | 0) > 0 && tp[i] === 0) on("tparm", x, mine);
      if (s.floor && p.alive && s.floor[Math.floor(p.y / T) * W + Math.floor(p.x / T)] === ICE && !ice[i]) on("ice", x, mine);
    }
    if (s.floor) {
      for (let i = 0; i < N; i++) {
        if (s.floor[i] !== SPIKE) continue;
        const up = !spikeIn(s, i) ? 1 : 0;
        if (up !== spk[i]) on(up ? "spikeup" : "spikedn", i % W, 0.6);
      }
    }
    if (s.sd > 0 && sd === 0) on("sudden", -1, 1);
    if (s.end >= 0 && end < 0) on(outcome(s, cc.human), -1, 1);

    const e = s.event, idx = e ? EVENTS.indexOf(e.type) : -1;
    if (idx >= 0 && evIdx < 0) on(EVN[idx], -1, 1);
    else if (idx < 0 && evIdx >= 0 && !evOn && evT <= 3) {
      const t = EVENTS[evIdx];
      on(t === "quake" ? "quake" : t === "swap" ? "swap" : "drop", -1, 1);
    }
    if (idx >= 0 && EVENTS[idx] === "frenzy" && e.on > 0 && !evOn) on("frenzy", -1, 1);

    if (s.hill) {
      let sum = 0;
      for (const v of s.hill.score) sum += v;
      if (sum > hsum) on("hillpt", s.hill.x, 1);
      if (hx >= 0 && (s.hill.x !== hx || s.hill.y !== hy)) on("hillmove", s.hill.x, 1);
    }
    if (s.potato) {
      const po = s.potato;
      if (holder >= 0 && po.holder !== holder && s.players[holder]?.alive) on("pass", s.players[po.holder].x / T, 1);
      const period = po.t > 300 ? 60 : po.t > 150 ? 30 : po.t > 60 ? 15 : 8;
      if (lastBeep - po.t >= period && po.t > 0) { on("potbeep", s.players[po.holder].x / T, 1 - po.t / 600); lastBeep = po.t; }
    }
    if (s.survival && s.survival.wave > wave && wave >= 0) on("wave", -1, 1);
    remember(s);
  }

  return { observe, reset() { tick = -1; base = createObserver(); } };
}

export const browserSpeech = () => {
  const ss = globalThis.speechSynthesis;
  if (!ss || typeof globalThis.SpeechSynthesisUtterance !== "function") return null;
  return {
    speak(text, volume) {
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.15; u.pitch = 0.9; u.volume = volume;
        ss.cancel();
        ss.speak(u);
      } catch {}
    },
    cancel() { try { ss.cancel(); } catch {} },
  };
};

const VOLUME = { low: 0.4, normal: 0.7, high: 1 };
export const volumeOf = (v) => VOLUME[v] ?? VOLUME.normal;
const VOICE_GAP = 1800;

// Orchestrator with injected backends. makeEngine() builds the audio engine (null when unsupported) and must be
// called from a user gesture; settings() is read on every call; speech = { speak(text, volume), cancel() } or null.
// Nothing runs (no engine, no timers, no observer) while sound is off, muted, paused or the tab is hidden.
export function createSound({ settings, makeEngine, speech = null, now = () => performance.now(), later = setTimeout, clear = clearTimeout }) {
  const obs = createSoundObserver();
  const ctx = { me: 0, human: (i) => i === 0 };
  const stamp = new Map();
  let eng = null, failed = false, unlocked = false, muted = false, hidden = false, paused = false;
  let scene = null, planKey = "", level = 0, lastCall = null, lastSay = -1e9, done = false, sceneKey = "", idle = 0;

  const set = () => settings();
  const live = () => unlocked && !muted && !hidden && !paused;
  const plan = () => pickPlan(set().music, scene);
  const wantsSfx = () => !!set().sfx;

  function ensure() {
    if (!eng && !failed) {
      try { eng = makeEngine(); } catch { eng = null; }
      failed = !eng;
    }
    return !!eng;
  }

  function sync() {
    clear(idle);
    const p = live() ? plan() : null;
    if (!live() || (!wantsSfx() && !p)) {
      if (eng) { eng.music.stop(); planKey = ""; eng.suspend(); }
      obs.reset();
      speech?.cancel();
      return false;
    }
    if (!ensure()) return false;
    eng.setVolume(volumeOf(set().volume));
    if (p) {
      if (p.key !== planKey) { eng.music.start(p); planKey = p.key; }
      eng.music.level(level);
    } else if (planKey) { eng.music.stop(); planKey = ""; }
    if (p || scene?.kind === "game") eng.resume();
    else eng.suspend();
    return true;
  }

  const emit = (name, x, v) => {
    if (JINGLES.has(name) && !plan()) return;
    const g = SFX_INFO[name]?.[1] ?? 0, t = now();
    if (g && t - (stamp.get(name) ?? -1e9) < g) return;
    stamp.set(name, t);
    const soft = name === "boom" || name === "chain" ? 0.6 : name === "wall" || name === "fuse" ? 0.5 : name === "potbeep" ? 0.6 : 0;
    eng.play(name, tilePan(x), soft + (1 - soft) * v, name === "boom" ? v : name === "fuse" || name === "potbeep" ? 1 + v * 0.6 : 1);
    if (SFX_INFO[name][0] >= 9 && name !== "die" && name !== "blip") eng.duck(1.2);
  };

  // Menu sounds resume the context briefly even when it sleeps, then let it go back to sleep.
  function ui(name, pitch = 1, force = false) {
    if (!unlocked || muted || hidden || (!force && !wantsSfx()) || !ensure()) return false;
    clear(idle);
    eng.setVolume(volumeOf(set().volume));
    eng.resume();
    eng.play(name, 0, 1, pitch);
    if (!plan() && scene?.kind !== "game") idle = later(sync, 1500);
    return true;
  }

  function say(text) {
    const t = now();
    if (!speech || !set().voice || muted || t - lastSay < VOICE_GAP) return;
    lastSay = t;
    speech.speak(String(text).toLowerCase(), volumeOf(set().volume));
  }

  return {
    ctx, sync, ui, say,
    get engine() { return eng; },
    get muted() { return muted; },
    gesture() {
      const first = !unlocked;
      unlocked = true;
      if (first || (eng && eng.state() !== "running")) sync();
    },
    setMuted(m) { muted = !!m; sync(); },
    setPaused(p) { paused = !!p; sync(); },
    setHidden(h) { hidden = !!h; sync(); },
    // scene: { kind: "menu" } | { kind: "game", theme, mode, boss, who }
    setScene(sc) {
      const k = sc ? `${sc.kind}${sc.theme}${sc.mode}${sc.boss}${sc.who}` : "";
      if (k === sceneKey) return;
      sceneKey = k; scene = sc; level = 0; done = false; lastCall = null;
      obs.reset();
      sync();
    },
    // Called once per rendered frame with the current game; cheap early return when nothing is playing.
    feed(g) {
      if (!live()) return;
      const c = g.call;
      if (c && c !== lastCall) say(c.text);
      lastCall = c ?? null;
      const s = g.s, p = plan();
      if (!eng || (!wantsSfx() && !p)) return;
      if (eng.state() !== "running") return obs.reset();
      level = intensityOf(s);
      if (planKey) eng.music.level(level);
      if (wantsSfx()) {
        obs.observe(s, emit, ctx);
        const over = !!(g.over || g.rematch);
        if (over && !done) { const r = matchResult(g, ctx.human); if (r) emit(r, -1, 1); }
        done = over;
      } else obs.reset();
    },
    cancelSpeech() { speech?.cancel(); },
    blip(id) { ui("blip", blipPitch(id)); },
  };
}
