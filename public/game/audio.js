import { SFX_INFO, claim } from "./sound.js";
import { bar, barSeconds, STYLES } from "./music.js";

// Tone: [wave s/t/q/w, Hz from, Hz to, seconds, volume, delay]. Noise: ["n", cutoff from, cutoff to, seconds, volume, delay, "lp"|"bp"|"hp"].
// A function recipe takes the caller's parameter (explosion size 0..1) instead of a pitch multiplier.
const arp = (w, notes, gap, len, v) => notes.map((f, i) => [w, f, f, len, v, i * gap]);
export const RECIPES = {
  bomb: [["q", 300, 120, 0.09, 0.16], ["s", 120, 60, 0.12, 0.3]],
  fuse: [["q", 2000, 2000, 0.02, 0.04]],
  boom: (z = 0.5) => [["n", 2200, 120, 0.3 + z * 0.6, 0.3 + z * 0.3, 0, "lp"], ["s", 110, 36, 0.25 + z * 0.4, 0.45], ["n", 700, 200, 0.18, 0.12 + z * 0.1, 0, "bp"]],
  chain: [["n", 800, 60, 1.1, 0.3, 0, "lp"], ["s", 60, 30, 0.9, 0.35], ["n", 500, 80, 0.7, 0.2, 0.25, "lp"]],
  wall: [["n", 1400, 400, 0.2, 0.2, 0, "bp"], ["q", 240, 100, 0.09, 0.07]],
  pick0: [["q", 440, 440, 0.07, 0.13], ["q", 660, 660, 0.12, 0.13, 0.07]],
  pick1: arp("q", [523, 659, 784], 0.06, 0.1, 0.12),
  pick2: [["q", 300, 1300, 0.2, 0.12]],
  pick3: [["s", 220, 80, 0.12, 0.3], ["q", 600, 950, 0.1, 0.1, 0.05]],
  pick4: [["q", 1250, 1250, 0.04, 0.12], ["q", 1250, 1250, 0.04, 0.12, 0.08], ["q", 900, 900, 0.1, 0.12, 0.16]],
  pick5: [["t", 800, 300, 0.16, 0.2], ["t", 300, 900, 0.16, 0.2, 0.16]],
  pick6: [["t", 1320, 1760, 0.3, 0.16], ["s", 880, 880, 0.3, 0.12], ["s", 1760, 2093, 0.25, 0.07, 0.08]],
  pick7: [["w", 233, 110, 0.4, 0.14], ["w", 247, 117, 0.4, 0.12]],
  die: [["w", 420, 55, 0.55, 0.2], ["n", 1600, 180, 0.45, 0.22, 0, "lp"], ["s", 130, 40, 0.4, 0.3]],
  pop: [["q", 600, 150, 0.12, 0.12], ["n", 2500, 400, 0.08, 0.08, 0, "bp"]],
  kick: [["n", 400, 1400, 0.1, 0.15, 0, "bp"], ["t", 150, 260, 0.1, 0.2]],
  shieldend: [["t", 900, 300, 0.22, 0.16], ["n", 4000, 800, 0.15, 0.06, 0, "hp"]],
  start: [...arp("q", [523, 659, 784], 0.09, 0.1, 0.14), ["q", 1047, 1047, 0.3, 0.16, 0.27], ["t", 523, 523, 0.3, 0.14, 0.27]],
  win: [...arp("q", [523, 659, 784], 0.1, 0.1, 0.15), ["q", 1047, 1047, 0.4, 0.17, 0.3], ["t", 262, 262, 0.5, 0.2, 0.3]],
  lose: [...arp("t", [392, 370, 349, 311], 0.2, 0.28, 0.2), ["w", 156, 130, 0.5, 0.1, 0.6]],
  draw: [["t", 440, 440, 0.2, 0.18], ["t", 440, 415, 0.35, 0.18, 0.22]],
  matchwin: [...arp("q", [523, 659, 784, 1047, 784, 1047, 1319], 0.12, 0.12, 0.14), ["q", 1568, 1568, 0.6, 0.16, 0.84], ["t", 262, 262, 0.8, 0.22, 0.84], ["t", 392, 392, 0.8, 0.14, 0.84]],
  matchlose: [...arp("t", [440, 415, 392, 370, 349, 330, 311], 0.18, 0.25, 0.18), ["w", 110, 82, 1, 0.12, 1.1]],
  sudden: [...arp("q", [880, 660, 880, 660], 0.15, 0.13, 0.13), ["w", 110, 110, 0.6, 0.1]],
  click: [["q", 1000, 1000, 0.03, 0.08]],
  emote: [["q", 520, 520, 0.05, 0.09], ["q", 780, 780, 0.08, 0.09, 0.06]],
  nav: [["q", 700, 700, 0.025, 0.05]],
  blip: [["q", 400, 400, 0.035, 0.07]],
  test: [...arp("q", [523, 659, 784], 0.08, 0.1, 0.14), ["t", 1047, 1047, 0.2, 0.14, 0.24]],
  choice: [["q", 660, 660, 0.05, 0.1], ["q", 880, 880, 0.09, 0.1, 0.06]],
  secret: [...arp("q", [392, 494, 587, 784, 988, 1175, 1568], 0.08, 0.1, 0.13), ["t", 1568, 1568, 0.5, 0.14, 0.56], ["s", 196, 196, 0.5, 0.12, 0.56]],
  tparm: [["s", 400, 900, 0.3, 0.1]],
  tp: [["s", 200, 1700, 0.15, 0.2], ["s", 1700, 200, 0.2, 0.18, 0.1]],
  ice: [["n", 3000, 6500, 0.25, 0.07, 0, "hp"], ["t", 1500, 2300, 0.2, 0.05]],
  spikeup: [["n", 5000, 3000, 0.1, 0.09, 0, "hp"], ["q", 1800, 1200, 0.08, 0.06]],
  spikedn: [["q", 600, 220, 0.1, 0.05]],
  ev0: [["s", 1500, 400, 0.7, 0.16]],
  ev1: arp("t", [1568, 1976, 2349], 0.12, 0.3, 0.1),
  ev2: [["w", 300, 1300, 0.8, 0.11]],
  ev3: [["n", 220, 90, 0.9, 0.3, 0, "lp"], ["s", 48, 40, 0.9, 0.35]],
  ev4: [["t", 500, 1000, 0.18, 0.16], ["t", 1000, 500, 0.18, 0.16, 0.2]],
  quake: [["n", 300, 60, 1.1, 0.4, 0, "lp"], ["s", 50, 30, 1, 0.45]],
  swap: [["n", 500, 5000, 0.3, 0.14, 0, "bp"], ["t", 400, 1200, 0.25, 0.1]],
  frenzy: [["w", 200, 800, 0.4, 0.1], ["q", 400, 1600, 0.4, 0.06]],
  drop: [["n", 4000, 1500, 0.35, 0.1, 0, "hp"]],
  hillpt: [["q", 1175, 1175, 0.05, 0.08], ["q", 1568, 1568, 0.08, 0.08, 0.05]],
  hillmove: [["t", 440, 880, 0.2, 0.14], ["t", 660, 1320, 0.2, 0.12, 0.1]],
  pass: [["q", 880, 440, 0.08, 0.14], ["q", 440, 880, 0.1, 0.14, 0.08]],
  potbeep: [["q", 1400, 1400, 0.05, 0.16]],
  pick8: [["q", 500, 500, 0.06, 0.12], ["q", 750, 750, 0.06, 0.12, 0.06], ["n", 1500, 600, 0.1, 0.06, 0.1, "bp"]],
  pick9: [["q", 300, 700, 0.08, 0.14], ["s", 140, 70, 0.12, 0.28, 0.06]],
  pick10: arp("q", [659, 784, 988, 1175], 0.045, 0.07, 0.11),
  pick11: [["w", 180, 150, 0.16, 0.12], ["q", 1500, 1500, 0.03, 0.1, 0.18], ["q", 1500, 1500, 0.03, 0.08, 0.3]],
  pick12: [["t", 1800, 2600, 0.2, 0.1], ["n", 4500, 6500, 0.2, 0.06, 0, "hp"], ["t", 2200, 3000, 0.16, 0.07, 0.1]],
  throw: [["n", 500, 1800, 0.18, 0.12, 0, "bp"], ["t", 220, 520, 0.2, 0.14]],
  freeze: [["n", 6000, 2500, 0.35, 0.12, 0, "hp"], ["t", 2400, 900, 0.3, 0.1], ["q", 3200, 3200, 0.04, 0.07, 0.12]],
  minearm: [["q", 1800, 1800, 0.05, 0.14], ["q", 1800, 1800, 0.05, 0.14, 0.1], ["q", 1800, 1800, 0.05, 0.14, 0.2]],
  plant: [["q", 200, 130, 0.06, 0.06]],
  cluster: [["s", 400, 100, 0.2, 0.25], ["n", 2500, 600, 0.25, 0.15, 0.1, "bp"], ["q", 900, 400, 0.08, 0.08, 0.2]],
  ab1: [["n", 600, 2500, 0.18, 0.14, 0, "bp"], ["s", 200, 520, 0.16, 0.12]],
  ab2: [["s", 300, 1800, 0.12, 0.16], ["s", 1800, 600, 0.14, 0.12, 0.08]],
  ab3: [["t", 700, 1400, 0.25, 0.14], ["s", 880, 880, 0.3, 0.1, 0.05]],
  ab4: [["n", 3000, 800, 0.4, 0.07, 0, "hp"], ["t", 900, 350, 0.35, 0.08]],
  ab5: [["n", 900, 200, 0.2, 0.2, 0, "bp"], ["s", 110, 60, 0.18, 0.3]],
  ab6: [["w", 200, 900, 0.3, 0.12], ["q", 1600, 1600, 0.04, 0.12, 0.3]],
  ab7: [["t", 400, 1100, 0.14, 0.14], ["t", 1100, 400, 0.14, 0.14, 0.15]],
  ab8: [["n", 700, 2400, 0.14, 0.14, 0, "bp"], ["q", 500, 250, 0.1, 0.1, 0.08]],
  ab9: [["w", 80, 200, 0.3, 0.14], ["s", 120, 60, 0.3, 0.3, 0.1]],
  wave: [["w", 110, 110, 0.5, 0.12], ["w", 165, 165, 0.5, 0.1], ["w", 220, 220, 0.5, 0.1, 0.25], ["w", 330, 330, 0.6, 0.1, 0.25]],
};

const WAVE = { s: "sine", t: "triangle", q: "square", w: "sawtooth" };
const MUSIC_LEVEL = 0.15, LOOK = 1.3, END = 0.0001;
const CURVE = Float32Array.from({ length: 2049 }, (_, i) => (Math.tanh(1.6 * (i / 1024 - 1)) / Math.tanh(1.6)) * 0.98);

// Builds the synth graph on any BaseAudioContext (realtime or offline). Everything ends in compressor -> soft clip,
// so nothing can exceed full scale. set/clear: timer backends for the music scheduler.
export function createEngine(ctx, { mobile = false, set = setTimeout, clear = clearTimeout } = {}) {
  const sfxBus = ctx.createGain(), musBus = ctx.createGain(), master = ctx.createGain(), comp = ctx.createDynamicsCompressor();
  const shaper = ctx.createWaveShaper(), out = ctx.createGain();
  musBus.gain.value = MUSIC_LEVEL;
  sfxBus.gain.value = 1.25;
  master.gain.value = 0.7;
  out.gain.value = 0.9;
  Object.assign(comp.threshold, { value: -14 });
  Object.assign(comp.knee, { value: 6 });
  Object.assign(comp.ratio, { value: 10 });
  Object.assign(comp.attack, { value: 0.003 });
  Object.assign(comp.release, { value: 0.2 });
  shaper.curve = CURVE;
  sfxBus.connect(master);
  musBus.connect(master);
  if (!mobile) {
    const send = ctx.createGain(), dly = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter();
    send.gain.value = 0.2; dly.delayTime.value = 0.3; fb.gain.value = 0.3; lp.frequency.value = 2200;
    musBus.connect(send); send.connect(dly); dly.connect(lp); lp.connect(fb); fb.connect(dly); lp.connect(master);
  }
  master.connect(comp); comp.connect(shaper); shaper.connect(out); out.connect(ctx.destination);

  const nb = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 2), ctx.sampleRate), nd = nb.getChannelData(0);
  for (let i = 0, a = 12345; i < nd.length; i++) { a = (Math.imul(a, 1664525) + 1013904223) | 0; nd[i] = a / 2147483648; }
  let noff = 0;

  function osc(dest, t, type, f0, f1, dur, vol, rel = 0, atk = 0.003, lp = 0, det = 0) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    if (det) o.detune.value = det;
    const a = Math.min(atk, dur * 0.4);
    g.gain.setValueAtTime(END, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    if (rel) g.gain.setValueAtTime(vol, t + dur);
    g.gain.exponentialRampToValueAtTime(END, t + dur + rel);
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.frequency.value = lp;
      o.connect(f); f.connect(g);
    } else o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + rel + 0.02);
  }

  function noise(dest, t, f0, f1, dur, vol, kind) {
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = nb;
    f.type = kind === "hp" ? "highpass" : kind === "bp" ? "bandpass" : "lowpass";
    f.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    f.Q.value = kind === "bp" ? 1.2 : 0.7;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(END, t + dur);
    src.connect(f); f.connect(g); g.connect(dest);
    noff = (noff + 0.37) % 1.2;
    src.start(t, noff);
    src.stop(t + dur + 0.02);
  }

  const live = [];
  function play(name, pan = 0, vol = 1, k = 1) {
    const info = SFX_INFO[name], rec = RECIPES[name];
    if (!info || !rec) return false;
    const t = ctx.currentTime, slot = claim(live, info[0], t);
    if (slot === -2) return false;
    const vg = ctx.createGain();
    vg.gain.value = vol;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      vg.connect(p); p.connect(sfxBus);
    } else vg.connect(sfxBus);
    const fn = typeof rec === "function", parts = fn ? rec(k) : rec, m = fn ? 1 : k;
    let end = 0;
    for (const [w, a, b, dur, v, delay = 0, kind] of parts) {
      if (w === "n") noise(vg, t + delay, a, b, dur, v, kind);
      else osc(vg, t + delay, WAVE[w], a * m, b * m, dur, v);
      end = Math.max(end, delay + dur);
    }
    const voice = { end: t + end + 0.05, prio: info[0], kill: () => vg.gain.setTargetAtTime(0, ctx.currentTime, 0.01) };
    if (slot >= 0) { live[slot].kill(); live[slot] = voice; } else live.push(voice);
    return true;
  }

  const hz = (m) => 440 * 2 ** ((m - 69) / 12);
  function drum(dest, t, l, v) {
    if (l === "kick") osc(dest, t, "sine", 140, 45, 0.14, 0.7 * v, 0.02);
    else if (l === "snare") { noise(dest, t, 1900, 1900, 0.13, 0.28 * v, "bp"); osc(dest, t, "triangle", 200, 120, 0.08, 0.14 * v); }
    else noise(dest, t, 7000, 7000, 0.035, 0.1 * v, "hp");
  }

  // Schedules one bar starting at time t into dest and returns its length in seconds.
  function playBar(t, plan, n, level, dest = musBus) {
    const sec = barSeconds(plan, level), q = sec / 16, voices = STYLES[plan.style].voices;
    for (const e of bar(plan, n, level, mobile)) {
      const tt = t + e.s * q;
      if (!e.m) { drum(dest, tt, e.l, e.v); continue; }
      const [w, vol, atk, rel, lp, det] = voices[e.l];
      const f = hz(e.m), dur = e.d * q;
      osc(dest, tt, w, f, f, dur, vol * e.v, rel, atk, lp);
      if (det && !mobile) osc(dest, tt, w, f, f, dur, vol * e.v, rel, atk, lp, det);
    }
    return sec;
  }

  let cur = null, timer = 0;
  function pump() {
    timer = 0;
    if (!cur || ctx.state !== "running") return;
    while (cur.next < ctx.currentTime + LOOK) cur.next += playBar(cur.next, cur.plan, cur.n++, cur.level, cur.track);
    timer = set(pump, 400);
  }

  const music = {
    start(plan) {
      music.stop();
      const track = ctx.createGain(), t = ctx.currentTime;
      track.gain.setValueAtTime(0, t);
      track.gain.linearRampToValueAtTime(plan.style === "menu" ? 0.6 : 1, t + 0.4);
      track.connect(musBus);
      cur = { plan, track, n: 0, next: t + 0.1, level: 0 };
      pump();
    },
    stop() {
      clear(timer);
      timer = 0;
      if (cur) cur.track.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
      cur = null;
    },
    level(l) { if (cur) cur.level = l; },
  };

  return {
    ctx, music, play, playBar, musBus, sfxBus,
    state: () => ctx.state,
    setVolume: (v) => master.gain.setTargetAtTime(v, ctx.currentTime, 0.05),
    duck(sec) {
      const t = ctx.currentTime;
      musBus.gain.cancelScheduledValues(t);
      musBus.gain.setTargetAtTime(MUSIC_LEVEL * 0.3, t, 0.05);
      musBus.gain.setTargetAtTime(MUSIC_LEVEL, t + sec, 0.4);
    },
    resume() {
      if (ctx.state === "running") return;
      ctx.resume?.().then(() => { if (cur && !timer) pump(); }).catch(() => {});
    },
    suspend() {
      clear(timer);
      timer = 0;
      ctx.suspend?.().catch(() => {});
    },
  };
}

export function browserEngine({ mobile = false } = {}) {
  const C = globalThis.AudioContext || globalThis.webkitAudioContext;
  return C ? createEngine(new C(), { mobile }) : null;
}
