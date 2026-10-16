import { THEMES, MODE_INFO } from "./look.js";

export const LAYOUTS = ["classic", "open", "pillars", "cross", "maze"];
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const ON_OFF = [[true, "On"], [false, "Off"]];

const SYS = [["auto", "System"], [true, "On"], [false, "Off"]];

export const FIELDS = [
  { key: "bot", label: "Bots", opts: [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]] },
  { key: "mode", label: "Game mode", opts: Object.entries(MODE_INFO).map(([k, m]) => [k, m.name]) },
  { key: "rounds", label: "Rounds to win", opts: [[1, "1"], [2, "2"], [3, "3"]] },
  { key: "layout", label: "Arena", opts: [...LAYOUTS.map((l) => [l, cap(l)]), ["random", "Random"]] },
  { key: "theme", label: "Theme", opts: [["auto", "Auto"], ...Object.entries(THEMES).map(([k, t]) => [k, t.name])] },
  { key: "tiles", label: "Floor tiles", opts: [["off", "Off"], ["few", "Few"], ["many", "Many"]] },
  { key: "chaos", label: "Chaos events", opts: ON_OFF.slice().reverse() },
  { key: "powerups", label: "Power-ups", opts: ON_OFF },
  { key: "sudden", label: "Sudden death", opts: ON_OFF },
  { key: "teams", label: "Teams (4 players)", opts: [[false, "Off"], [true, "2 vs 2"]] },
  { key: "ff", label: "Friendly fire (teams)", opts: ON_OFF },
  { key: "announcer", label: "Announcer banners and taunts", opts: ON_OFF, feel: true },
  { key: "slowmo", label: "Slow-mo and hit-stop", opts: ON_OFF, feel: true },
  { key: "recap", label: "Round recap with awards", opts: ON_OFF, feel: true },
  { key: "sfx", label: "Sound effects", opts: ON_OFF, sound: true },
  { key: "music", label: "Music", opts: [["auto", "Auto"], ["arcade", "Arcade"], ["epic", "Epic"], ["chill", "Chill"], ["synth", "Synthwave"], ["silence", "Silence"]], sound: true },
  { key: "volume", label: "Volume", opts: [["low", "Low"], ["normal", "Normal"], ["high", "High"]], sound: true },
  { key: "voice", label: "Voice announcer (reads the banners)", opts: [[false, "Off"], [true, "On"]], sound: true },
  { key: "cb", label: "Colour-blind friendly colours", opts: [[false, "Off"], [true, "On"]], a11y: true },
  { key: "reduce", label: "Reduce motion (shake, sparks, menu)", opts: SYS, a11y: true },
  { key: "vibrate", label: "Phone vibration", opts: ON_OFF, a11y: true },
  { key: "rumble", label: "Gamepad rumble", opts: ON_OFF, a11y: true },
  { key: "intensity", label: "Vibration intensity", opts: [["low", "Low"], ["normal", "Normal"], ["strong", "Strong"]], a11y: true },
  { key: "offline", label: "Keep the whole game offline", opts: ON_OFF.slice().reverse(), store: true },
];

export const DEFAULTS = { bot: "normal", mode: "classic", tiles: "off", chaos: false, rounds: 2, layout: "classic", theme: "grass", powerups: true, sudden: true, teams: false, ff: true, cb: false, reduce: "auto", vibrate: true, rumble: true, intensity: "normal", offline: false, sfx: true, music: "auto", volume: "normal", voice: false, announcer: true, slowmo: true, recap: true };

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
      friendlyFire: set.mode === "survival" ? undefined : set.ff,
      tiles: set.tiles,
      chaos: set.chaos,
      mode: set.mode,
    },
    theme: set.theme === "auto" ? pick(Object.keys(THEMES)) : set.theme,
  };
}
