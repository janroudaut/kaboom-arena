import { THEMES } from "./look.js";

export const LAYOUTS = ["classic", "open", "pillars", "cross", "maze"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ON_OFF = [[true, "On"], [false, "Off"]];

const SYS = [["auto", "System"], [true, "On"], [false, "Off"]];

export const FIELDS = [
  { key: "bot", label: "Bots", opts: [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]] },
  { key: "rounds", label: "Rounds to win", opts: [[1, "1"], [2, "2"], [3, "3"]] },
  { key: "layout", label: "Arena", opts: [...LAYOUTS.map((l) => [l, cap(l)]), ["random", "Random"]] },
  { key: "theme", label: "Theme", opts: [["auto", "Auto"], ...Object.entries(THEMES).map(([k, t]) => [k, t.name])] },
  { key: "powerups", label: "Power-ups", opts: ON_OFF },
  { key: "sudden", label: "Sudden death", opts: ON_OFF },
  { key: "teams", label: "Teams (4 players)", opts: [[false, "Off"], [true, "2 vs 2"]] },
  { key: "ff", label: "Friendly fire (teams)", opts: ON_OFF },
  { key: "cb", label: "Colour-blind friendly colours", opts: [[false, "Off"], [true, "On"]], a11y: true },
  { key: "reduce", label: "Reduce motion (shake, sparks, menu)", opts: SYS, a11y: true },
  { key: "vibrate", label: "Phone vibration", opts: ON_OFF, a11y: true },
  { key: "rumble", label: "Gamepad rumble", opts: ON_OFF, a11y: true },
  { key: "intensity", label: "Vibration intensity", opts: [["low", "Low"], ["normal", "Normal"], ["strong", "Strong"]], a11y: true },
];

export const DEFAULTS = { bot: "normal", rounds: 2, layout: "classic", theme: "grass", powerups: true, sudden: true, teams: false, ff: true, cb: false, reduce: "auto", vibrate: true, rumble: true, intensity: "normal" };

export const reduced = (set, system) => (set.reduce === "auto" ? !!system : set.reduce);

export function sanitize(o) {
  const out = { ...DEFAULTS };
  for (const f of FIELDS) if (f.opts.some(([v]) => v === o?.[f.key])) out[f.key] = o[f.key];
  return out;
}

export function load() {
  try { return sanitize(JSON.parse(localStorage.getItem("settings"))); } catch { return { ...DEFAULTS }; }
}

export function save(set) {
  try { localStorage.setItem("settings", JSON.stringify(set)); } catch {}
}

// Options for one round; teams are P1+P3 (top corners) vs P2+P4 (bottom corners).
export function roundOpts(set, n, rand = Math.random) {
  const pick = (a) => a[Math.floor(rand() * a.length)];
  return {
    opts: {
      layout: set.layout === "random" ? pick(LAYOUTS) : set.layout,
      powerups: set.powerups,
      suddenDeath: set.sudden,
      teams: set.teams && n === 4 ? [0, 1, 0, 1] : null,
      friendlyFire: set.ff,
    },
    theme: set.theme === "auto" ? pick(Object.keys(THEMES)) : set.theme,
  };
}
