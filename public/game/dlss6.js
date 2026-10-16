export const CATCHPHRASE = "RTX enabled. DLSS 6. It's on!";
export const DISCLAIMER = "Parody. Not affiliated with NVIDIA.";

export const PANEL_FIELDS = [
  { key: "fgen", label: "Frame Generation ×4 (×1 actually)", kind: "switch" },
  { key: "faces", label: "Neural Faces™", kind: "switch" },
  { key: "rt", label: "Path Tracing (one path)", kind: "switch", heavy: true },
  { key: "rr", label: "Ray Reconstruction", kind: "switch", heavy: true },
  { key: "flare", label: "Cinematic lens flare", kind: "switch", heavy: true },
  { key: "chroma", label: "Chromatic aberration (for realism)", kind: "switch" },
  { key: "bloom", label: "Bloom", kind: "slider", min: 0, max: 10 },
  { key: "lat", label: "Latency Reduction", kind: "switch" },
];

export const PANEL_DEFAULTS = { fgen: true, faces: true, rt: true, rr: true, flare: true, chroma: true, bloom: 6, lat: true };

export function sanitizePanel(o) {
  const out = { ...PANEL_DEFAULTS };
  for (const f of PANEL_FIELDS) {
    const v = o?.[f.key];
    if (f.kind === "switch" ? typeof v === "boolean" : Number.isInteger(v) && v >= f.min && v <= f.max) out[f.key] = v;
  }
  return out;
}

const KEY = "dlss6";
export function loadPanel(storage) {
  try { return sanitizePanel(JSON.parse(storage.getItem(KEY))); } catch { return { ...PANEL_DEFAULTS }; }
}
export function savePanel(storage, o) {
  try { storage.setItem(KEY, JSON.stringify(o)); } catch {}
}

const BLOOM_WORDS = ["off", "barely", "subtle", "tasteful", "noticeable", "cinematic", "a lot", "too much", "blinding", "sun", "yes"];
export const bloomLabel = (v) => BLOOM_WORDS[v] ?? String(v);
export const bloomStrength = (v) => v / 10;
export const latencyText = (on) => (on ? "-0 ms" : "+0 ms");
export const valueText = (f, v) => (f.key === "bloom" ? bloomLabel(v) : f.key === "lat" ? latencyText(v) : v ? "ON" : "OFF");

// Parody numbers derived from the measured FPS: one native frame, many imagined ones.
export function fakeFps(fps) {
  const f = Number.isFinite(fps) ? Math.min(999, Math.max(0, fps)) : 0;
  return { native: Math.max(1, Math.floor(f / 45)), gen: Math.round(f * 6) };
}
export const fpsLine = (fps) => {
  const { native, gen } = fakeFps(fps);
  return `${native} FPS native → ${gen.toLocaleString("en-US")} FPS generated`;
};

export const STAT_LINES = [
  (n) => `DLSS 6 improved your gameplay by ${n}%`,
  (n) => `DLSS 6 imagined ${n}% of this round`,
  (n) => `${n}% of these bricks were prompted`,
];
export const statLine = (n, i = 0) => STAT_LINES[i % STAT_LINES.length](n);

export const TOASTS = [
  "Neural frame ×6 generated", "Re-imagined {n} bricks", "Enhanced {p}'s cheekbones", "Upscaled {p}'s confidence",
  "Hallucinated {n} extra frames", "Denoised the vibes", "Added 2 fingers to {p} for realism", "Generative fuse optimisation active",
  "Smoothed {p}'s expression", "DLSS 6: 3 of every 4 pixels were imagined", "Frame generated from vibes",
  "Neural Radiance Cache warming up…", "Path traced 1 path (it was enough)", "Upscaled the upscaler (×2)",
  "Reflections are 100% real*", "Latency reduced by -0 ms", "Prompted {n} bricks into existence", CATCHPHRASE,
];
export function toastText(rand, name) {
  const n = 3 + Math.floor(rand() * 17);
  return TOASTS[Math.floor(rand() * TOASTS.length)].replace("{p}", name).replace("{n}", n);
}
export const halluVariant = (rand) => (rand() < 0.5 ? "fingers" : "studs");

export const BOOT_STAGES = [
  "Compiling 14,000 shaders for 4 bricks", "Hallucinating frames", "Upscaling the upscaler", "Warming up the Neural Radiance Cache",
  "Denoising the denoiser", "Tracing the one path", "Generating 5 frames from 1 vibe", "Enabling it",
];
export const BOOT_MS = 2400;

// The bar races to 99%, sits there a while, then finishes.
export function bootState(ms) {
  const t = Math.max(0, ms) / BOOT_MS;
  return { pct: t >= 0.92 ? 1 : t < 0.7 ? (0.99 * t) / 0.7 : 0.99, stage: Math.min(BOOT_STAGES.length - 1, Math.floor(t * BOOT_STAGES.length)), done: t >= 1 };
}

// Gag cadence on game time; `gap` keeps two gags from landing back to back.
export function createCadence(ranges, gap, rand = Math.random) {
  const next = {};
  let last = -Infinity;
  const span = ([a, b]) => a + rand() * (b - a);
  for (const k in ranges) next[k] = span(ranges[k]) / 2;
  return {
    due(kind, t) {
      if (t < next[kind] || t - last < gap) return false;
      last = t;
      next[kind] = t + span(ranges[kind]);
      return true;
    },
    defer(kind, t, s) { next[kind] = t + s; },
    next,
  };
}

// Heavy effects drop one level at a time (3 = all, 0 = none) before the resolution scale is touched.
export function createGovernor({ max = 3, down = 48, up = 57, upAfter = 5 } = {}) {
  let wait = upAfter, good = 0, lastDown = -Infinity, clock = 0;
  const g = {
    level: max,
    update(fps, dt, canUp = true) {
      clock += dt;
      if (fps < down) {
        good = 0;
        if (g.level === 0) return null;
        g.level--;
        wait = clock - lastDown < 20 ? Math.min(60, wait * 2) : upAfter;
        lastDown = clock;
        return "down";
      }
      if (fps < up || !canUp || g.level >= max) { good = 0; return null; }
      good += dt;
      if (good < wait) return null;
      good = 0;
      g.level++;
      return "up";
    },
  };
  return g;
}

export const FLARE_N = 5;
const FLARE_T = [1, -0.35, -0.8, 0.45, -1.4], FLARE_S = [0.3, 0.12, 0.2, 0.08, 0.3], FLARE_A = [1, 0.5, 0.4, 0.6, 0.3];
// Lens-flare dots for an explosion at NDC (fx, fy), age k in 0..1: a hot spot plus ghosts on the line through the screen centre.
export function flareDots(out, fx, fy, k) {
  const fade = (1 - k) * (1 - k);
  for (let i = 0; i < FLARE_N; i++) {
    out[i * 4] = fx * FLARE_T[i];
    out[i * 4 + 1] = fy * FLARE_T[i];
    out[i * 4 + 2] = FLARE_S[i] * (i ? 1 : 1 + 0.6 * k);
    out[i * 4 + 3] = FLARE_A[i] * fade;
  }
}
