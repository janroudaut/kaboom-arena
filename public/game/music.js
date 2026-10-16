// Pure: procedural soundtrack. A plan (style, scale, tempo, seed) plus a bar number gives the notes of that bar,
// so the same plan always plays the same loop. The WebAudio side only turns these events into sound.

export const STYLE_KEYS = ["auto", "arcade", "epic", "chill", "synth", "silence"];
export const LOOP = 8;
export const MIDI_MIN = 24, MIDI_MAX = 100;

export const mulberry = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const hash = (str) => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygdom: [0, 1, 4, 5, 7, 8, 10],
};
const degree = (scale, root, k) => {
  const sc = SCALES[scale], n = sc.length;
  return root + sc[((k % n) + n) % n] + 12 * Math.floor(k / n);
};

// Lead rhythms in 16th steps: [start, length].
const RHY = [
  [[0, 4], [4, 2], [6, 2], [8, 4], [12, 4]],
  [[0, 2], [2, 2], [4, 4], [8, 2], [10, 2], [12, 4]],
  [[0, 3], [3, 3], [6, 2], [8, 8]],
  [[2, 2], [4, 2], [6, 2], [8, 2], [10, 2], [12, 4]],
  [[0, 8], [8, 4], [12, 4]],
  [[0, 1], [1, 1], [2, 2], [4, 4], [8, 4], [12, 2], [14, 2]],
];

// voices: layer -> [wave, volume, attack s, release s, lowpass Hz (0 = none), detune cents (0 = single oscillator)].
// layers[level]: layers that enter at that intensity level (0 calm, 1 few players left, 2 sudden death).
export const STYLES = {
  arcade: {
    bpm: 150, scale: "major", root: 60, prog: [0, 4, 5, 3], rhy: [0, 1, 2, 3, 5], lead: [7, 15],
    bass: "1.8.1.8.1.8.5.8.", arp: "0.1.2.1.0.1.2.1.", kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.",
    voices: { bass: ["triangle", 0.34, 0.004, 0.09, 0, 0], lead: ["square", 0.1, 0.006, 0.1, 3200, 0], lead2: ["square", 0.05, 0.006, 0.1, 3200, 0], arp: ["square", 0.045, 0.003, 0.06, 2600, 0], pad: ["triangle", 0.06, 0.05, 0.3, 0, 0] },
    layers: [["bass", "kick", "snare", "lead"], ["hat", "arp", "pad"], ["lead2", "kick2"]],
  },
  epic: {
    bpm: 104, scale: "minor", root: 57, prog: [0, 5, 2, 6], rhy: [2, 4, 0], lead: [7, 14],
    bass: "1.1.1.1.1.1.1.1.", arp: "0.1.2.1.0.1.2.1.", kick: "x.....x.x.......", snare: "....x.......x...", hat: "x.x.x.x.x.x.x.x.",
    voices: { bass: ["sawtooth", 0.2, 0.01, 0.12, 700, 0], lead: ["sawtooth", 0.08, 0.03, 0.2, 2200, 8], lead2: ["sawtooth", 0.04, 0.03, 0.2, 2200, 8], arp: ["triangle", 0.07, 0.004, 0.1, 0, 0], pad: ["sawtooth", 0.07, 0.25, 0.5, 1100, 9] },
    layers: [["bass", "pad", "kick", "snare", "lead"], ["hat", "arp"], ["lead2", "kick2"]],
  },
  chill: {
    bpm: 78, scale: "dorian", root: 62, prog: [0, 3, 0, 4], rhy: [4, 2], lead: [8, 14],
    bass: "1.......5.......", arp: "0.1.2.1.0.1.2.1.", kick: "x.......x.......", snare: "........x.......", hat: "..x...x...x...x.",
    voices: { bass: ["sine", 0.34, 0.01, 0.2, 0, 0], lead: ["sine", 0.09, 0.01, 0.5, 0, 0], lead2: ["triangle", 0.04, 0.01, 0.4, 0, 0], arp: ["sine", 0.06, 0.004, 0.25, 0, 0], pad: ["triangle", 0.09, 0.35, 0.7, 1400, 7] },
    layers: [["bass", "pad", "kick", "lead"], ["snare", "hat", "arp"], ["lead2", "kick2"]],
  },
  synth: {
    bpm: 116, scale: "minor", root: 52, prog: [0, 5, 2, 6], rhy: [0, 1, 3], lead: [7, 15],
    bass: "1.1.8.1.1.1.8.1.", arp: "01201202012012.1", kick: "x...x...x...x...", snare: "....x.......x...", hat: "..x...x...x...x.",
    voices: { bass: ["sawtooth", 0.24, 0.004, 0.08, 900, 0], lead: ["square", 0.08, 0.01, 0.15, 2800, 6], lead2: ["sawtooth", 0.04, 0.01, 0.15, 2800, 6], arp: ["sawtooth", 0.05, 0.003, 0.07, 1800, 0], pad: ["sawtooth", 0.06, 0.004, 0.05, 1300, 10] },
    layers: [["bass", "pad", "kick", "snare"], ["hat", "arp", "lead"], ["lead2", "kick2"]],
  },
  menu: {
    bpm: 84, scale: "major", root: 60, prog: [0, 5, 3, 4], rhy: [4], lead: [7, 14],
    bass: "1.......1.......", arp: "0...1...2...1...", kick: "................", snare: "................", hat: "................",
    voices: { bass: ["sine", 0.22, 0.02, 0.3, 0, 0], arp: ["sine", 0.05, 0.005, 0.5, 0, 0], pad: ["triangle", 0.06, 0.4, 0.8, 1200, 6] },
    layers: [["bass", "pad", "arp"], [], []],
  },
};

// Theme flavours for "Auto": snow gets bells, desert the Phrygian dominant scale, lava heavy riffs, night synthwave.
const THEME_FLAVOUR = {
  grass: { style: "arcade" },
  snow: { style: "chill", scale: "major" },
  desert: { style: "arcade", scale: "phrygdom", tempo: 0.92 },
  lava: { style: "epic", tempo: 1.1 },
  night: { style: "synth" },
};
const MODE_FLAVOUR = {
  hill: { tempo: 1.04 },
  potato: { tempo: 1.12, floor: 1 },
  survival: { style: "epic", floor: 1 },
};

// Chosen music setting + scene -> plan, or null for silence.
// scene: { kind: "menu" } | { kind: "game", theme, mode, boss, who } where who is a story fighter id (changes the melody seed).
export function pickPlan(setting, scene) {
  if (setting === "silence" || !STYLES[setting === "auto" ? "arcade" : setting]) return null;
  if (!scene || scene.kind === "menu") return planOf("menu", {}, 0);
  const th = THEME_FLAVOUR[scene.theme] ?? THEME_FLAVOUR.grass, md = MODE_FLAVOUR[scene.mode] ?? {};
  const auto = setting === "auto";
  const f = { style: auto ? md.style ?? th.style : setting, scale: auto ? th.scale : undefined, tempo: (auto ? th.tempo ?? 1 : 1) * (md.tempo ?? 1), floor: md.floor ?? 0 };
  if (scene.boss) { f.style = auto ? "epic" : f.style; f.tempo *= 1.06; f.floor = Math.max(f.floor, 1); }
  return planOf(f.style, f, hash(`${scene.theme}${scene.who ?? ""}`), scene.who);
}

function planOf(style, f, seed, who) {
  const st = STYLES[style], scale = f.scale ?? st.scale, tempo = f.tempo ?? 1, floor = f.floor ?? 0;
  return { key: `${style}:${scale}:${tempo.toFixed(2)}:${floor}:${who ?? ""}`, style, scale, bpm: st.bpm * tempo, floor, seed };
}

export const levelBpm = (plan, level) => plan.bpm * (level >= 2 ? 1.12 : 1);
export const barSeconds = (plan, level) => (4 * 60) / levelBpm(plan, level);

export function activeLayers(plan, level, mobile = false) {
  const st = STYLES[plan.style], set = new Set(), lv = plan.style === "menu" ? 0 : Math.min(2, Math.max(level, plan.floor));
  for (let i = 0; i <= lv; i++) for (const l of st.layers[i]) set.add(l);
  if (mobile && lv < 2) set.delete("arp");
  if (mobile) set.delete("lead2");
  return set;
}

// Notes of one bar: [{ s: start in 16th steps, d: length in steps, m: MIDI note or 0 for drums, l: layer, v: 0..1 }].
export function bar(plan, n, level = 0, mobile = false) {
  const st = STYLES[plan.style], layers = activeLayers(plan, level, mobile), b = ((n % LOOP) + LOOP) % LOOP, out = [];
  const chord = st.prog[b >> 1], tone = (k) => degree(plan.scale, st.root, chord + k);
  const last = b === LOOP - 1;

  if (layers.has("bass")) {
    for (let i = 0; i < 16; i++) {
      const c = st.bass[i];
      if (c === ".") continue;
      const m = c === "5" ? tone(4) - 24 : c === "8" ? tone(0) - 12 : tone(0) - 24;
      out.push({ s: i, d: plan.style === "chill" ? 8 : 1.6, m, l: "bass", v: i % 4 ? 0.7 : 1 });
    }
  }
  if (layers.has("pad")) {
    const gated = plan.style === "synth";
    const chordNotes = [tone(0), tone(2), tone(4)];
    if (gated) {
      for (let i = 0; i < 16; i++) if ("xx.xx.xx.xx.xx.x"[i] === "x") for (const m of chordNotes) out.push({ s: i, d: 1, m, l: "pad", v: 0.8 });
    } else if (b % 2 === 0) for (const m of chordNotes) out.push({ s: 0, d: 32, m, l: "pad", v: 1 });
  }
  if (layers.has("arp")) {
    for (let i = 0; i < 16; i++) {
      const c = st.arp[i];
      if (c === ".") continue;
      out.push({ s: i, d: 1.5, m: tone(+c * 2) + 12, l: "arp", v: i % 4 ? 0.6 : 0.9 });
    }
  }
  if (layers.has("lead")) lead(plan, st, b, chord, out, "lead", 0);
  if (layers.has("lead2") && layers.has("lead")) lead(plan, st, b, chord, out, "lead2", 12);

  const fill = last;
  for (let i = 0; i < 16; i++) {
    if (layers.has("kick") && (st.kick[i] === "x" || (layers.has("kick2") && i === 10))) out.push({ s: i, d: 1, m: 0, l: "kick", v: i % 4 ? 0.7 : 1 });
    if (layers.has("snare") && (st.snare[i] === "x" || (fill && i >= 12 && i % 2 === 0))) out.push({ s: i, d: 1, m: 0, l: "snare", v: fill && i >= 12 ? 0.5 + (i - 12) * 0.1 : 0.9 });
    if (layers.has("hat") && st.hat[i] === "x") out.push({ s: i, d: 0.5, m: 0, l: "hat", v: i % 4 ? 0.5 : 0.7 });
  }
  return out;
}

function lead(plan, st, b, chord, out, layer, shift) {
  const r = mulberry(plan.seed ^ Math.imul((b % 4) + 1, 0x9e3779b1) ^ (plan.style === "menu" ? 0 : 0x51ed27));
  const rhy = RHY[st.rhy[Math.floor(r() * st.rhy.length)]], [lo, hi] = st.lead;
  const cadence = b === 3 ? 4 : b === LOOP - 1 ? 0 : -1;
  let cur = chord + 7 + Math.floor(r() * 3) * 2;
  rhy.forEach(([s, d], k) => {
    const strong = s % 4 === 0;
    cur += Math.floor(r() * 5) - 2;
    if (strong) cur = chord + 2 * Math.round((cur - chord) / 2);
    if (k === rhy.length - 1 && cadence >= 0) cur = 7 + cadence + 7 * Math.round((cur - 7 - cadence) / 7);
    cur = Math.min(hi, Math.max(lo, cur));
    out.push({ s, d: d * 0.9, m: degree(plan.scale, st.root, cur) + shift, l: layer, v: strong ? 1 : 0.8 });
  });
}
