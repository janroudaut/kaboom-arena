import { W, KICK_EVERY } from "./sim.js";

// ground/speck: 2 checker shades; hard: [base, hi, lo, face, faceHi, faceLo, stud]; soft: [base, brick, highlight].
// d3: ground colours + speckle, hard colour/metalness, soft [base, hue, sat, light], background, hemisphere [sky, ground, k], sun [colour, k].
export const THEMES = {
  grass: {
    name: "Grass",
    ground: ["#47a050", "#3f9348"], speck: ["#53ad5c", "#4aa254"],
    hard: ["#6c6c80", "#9a9ab0", "#43435a", "#82829a", "#a8a8be", "#5a5a70", "#54546a"],
    soft: ["#7a4220", "#c27a3e", "#e0a066"],
    d3: { ground: ["#41ae54", "#37a049"], speck: ["#ffffff10", "#00000014"], hard: 0x9a9fb8, metal: 0.7, soft: ["#6d3a1c", 20, 54, 40], bg: 0x16162b, hemi: [0xdfe9ff, 0x66785a, 1.5], sun: [0xffecc8, 2.8] },
  },
  snow: {
    name: "Snow",
    ground: ["#e8f0f8", "#dce8f2"], speck: ["#ffffff", "#c4d6ea"],
    hard: ["#5f7fa6", "#a8c8e8", "#38557a", "#7aa0c8", "#bcdcf4", "#4e6f96", "#44628a"],
    soft: ["#6a4a38", "#b08a68", "#f4f8ff"],
    d3: { ground: ["#a4b6cc", "#98abc4"], speck: ["#ffffff30", "#2a4a7014"], hard: 0x6a90bc, metal: 0.25, soft: ["#7a5a46", 24, 34, 46], bg: 0x2a3a58, hemi: [0xe6f0ff, 0x8898b0, 0.8], sun: [0xffffff, 1.3] },
  },
  desert: {
    name: "Desert",
    ground: ["#e0c078", "#d6b46a"], speck: ["#ecd08c", "#c9a35a"],
    hard: ["#9c7448", "#d0a870", "#6a4a2c", "#b48a58", "#d8b27c", "#8a6238", "#7a5430"],
    soft: ["#7a3a22", "#c8643c", "#f09870"],
    d3: { ground: ["#b8975a", "#ae8b50"], speck: ["#fff0c030", "#6a481814"], hard: 0xa88050, metal: 0.1, soft: ["#7a3a22", 12, 58, 46], bg: 0x4a3524, hemi: [0xfff0d0, 0xb08850, 0.9], sun: [0xffd890, 1.7] },
  },
  lava: {
    name: "Lava",
    ground: ["#3a2c30", "#332528"], speck: ["#ff6a1a", "#c43c10"],
    hard: ["#2c2433", "#5a4a68", "#14101a", "#3a3044", "#6a5878", "#241c2c", "#ff5a1a"],
    soft: ["#2a1410", "#7a3220", "#ff7a2a"],
    d3: { ground: ["#46363a", "#3a2c30"], speck: ["#ff7a2a70", "#00000030"], hard: 0x6a5878, metal: 0.45, soft: ["#3a1c14", 10, 62, 34], bg: 0x2a0c08, hemi: [0xffa070, 0x601c10, 1.1], sun: [0xff9a50, 2.4] },
  },
  night: {
    name: "Night",
    ground: ["#233456", "#1e2c4c"], speck: ["#35497a", "#4a68a8"],
    hard: ["#3a3a5c", "#6c6ca0", "#1c1c34", "#4a4a74", "#7a7ab0", "#2e2e4c", "#8ab0ff"],
    soft: ["#2e1c3a", "#7a4a8a", "#c090d8"],
    d3: { ground: ["#2c4068", "#24365a"], speck: ["#8ab0ff30", "#00000020"], hard: 0x6a6a9c, metal: 0.5, soft: ["#3a2448", 285, 32, 44], bg: 0x070a18, hemi: [0x7a96d8, 0x28304c, 1.1], sun: [0xaec4ff, 2.0] },
  },
};
for (const [key, t] of Object.entries(THEMES)) t.key = key;

export const themeOf = (cfg) => (Object.hasOwn(THEMES, cfg?.theme) ? THEMES[cfg.theme] : THEMES.grass);

// Colour-blind mode (Okabe-Ito based) is a flag set by main.js; both renderers read colours through palette()/teamInfo().
export const view = { cb: false };
const PALETTES = {
  std: { suit: ["#f2f2f2", "#454556", "#e8453c", "#3c7be8"], dark: ["#b8b8c4", "#262633", "#a32a24", "#2452a8"] },
  cb: { suit: ["#f0e442", "#0072b2", "#d55e00", "#56b4e9"], dark: ["#a89f1c", "#00486f", "#8f3e00", "#2e7fae"] },
};
const dim = (h) => `#${[1, 3, 5].map((i) => Math.round(parseInt(h.slice(i, i + 2), 16) * 0.65).toString(16).padStart(2, "0")).join("")}`;
let custom = null;
// Story mode: suit colours per player index (rest stays standard); colour-blind mode still wins.
export const setSuits = (cols) => {
  const n = cols?.length ?? 0;
  custom = cols && { suit: [...cols, ...PALETTES.std.suit.slice(n)], dark: [...cols.map(dim), ...PALETTES.std.dark.slice(n)] };
};
export const palette = () => (view.cb ? PALETTES.cb : custom ?? PALETTES.std);

const TEAMS_BY = {
  std: [{ name: "Gold", col: "#ffd23c" }, { name: "Cyan", col: "#38d6e8" }],
  cb: [{ name: "Pink", col: "#cc79a7" }, { name: "Green", col: "#009e73" }],
};
export const teamInfo = (t) => { const l = view.cb ? TEAMS_BY.cb : TEAMS_BY.std; return l[t] ?? l[0]; };
export const teamsOf = (s) => (Array.isArray(s?.cfg?.teams) ? s.cfg.teams : null);

const CURSE_NAMES = { slow: "SLOW", fast: "HYPER", reverse: "REVERSED", nobomb: "NO BOMBS", auto: "BOMB SPAM" };
export const curseText = (p) => (p?.curse ? `${CURSE_NAMES[p.curse.type] ?? "CURSED"} ${Math.ceil((p.curse.t | 0) / 60)}s` : "");

// HUD rows in display order (team members grouped when teams are on).
export function hudEntries(g) {
  const tm = teamsOf(g.s);
  const rows = g.s.players.map((p, i) => ({ i, alive: p.alive, name: g.names?.[i] ?? "", score: Number(g.scores?.[i]) | 0, team: tm ? tm[i] : -1 }));
  return tm ? rows.sort((a, b) => a.team - b.team || a.i - b.i) : rows;
}

// Tile position of a bomb; sliding bombs advance continuously towards the next tile (sc counts ticks since the last hop).
export function bombPos(b, grid) {
  if (!(b.dx || b.dy)) return [b.x, b.y];
  if (grid[(b.y + b.dy) * W + b.x + b.dx]) return [b.x, b.y];
  const f = Math.min(Math.max(b.sc || 0, 0), KICK_EVERY) / KICK_EVERY;
  return [b.x + b.dx * f, b.y + b.dy * f];
}
