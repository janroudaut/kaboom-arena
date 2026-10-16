// Story mode logic: roster, family graph, ladders, difficulty and saved progress. Pure; text lives in story.js.
// `ability` is the fighter's signature move (key of ABILITIES in sim.js), used when the "Fighter abilities" setting is on.

export const ROSTER = [
  { id: "ignatius", name: "Ignatius", color: "#3c7be8", stage: { name: "Old Man's Backyard", layout: "pillars", theme: "grass" }, ability: "crack" },
  { id: "dynamita", name: "Dynamita", color: "#ff8a1a", stage: { name: "Fireworks Factory", layout: "cross", theme: "lava" }, ability: "overload" },
  { id: "baron", name: "Baron", color: "#8a3cd6", stage: { name: "Von Boom Hedge Maze", layout: "maze", theme: "night" }, ability: "veil" },
  { id: "mama", name: "Mama", color: "#ff9ec7", stage: { name: "Mama's Kitchen", layout: "open", theme: "snow" }, ability: "sweep" },
  { id: "dolores", name: "Dolores", color: "#e8203c", stage: { name: "Bombshell Casino", layout: "cross", theme: "desert" }, ability: "swap" },
  { id: "tony", name: "Tony", color: "#8be04a", stage: { name: "Tick-Tock Parking Lot", layout: "classic", theme: "night" }, ability: "blink" },
  { id: "fizzle", name: "Fizzle", color: "#7d8fa8", stage: { name: "Draughty Castle", layout: "pillars", theme: "snow" }, ability: "aegis" },
  { id: "kapow", name: "Kapow", color: "#19d3d3", stage: { name: "Skate Park", layout: "open", theme: "desert" }, ability: "dash" },
  { id: "gunpowder", name: "Gunpowder", color: "#d8d2b0", stage: { name: "The Family Crypt", layout: "maze", theme: "lava" }, ability: "rise" },
];
export const BY_ID = Object.fromEntries(ROSTER.map((f) => [f.id, f]));

// Roles are [first, second] as listed in RELATIONS; story.js has one template set per role.
export const KINDS = {
  parent: ["parent", "child"], siblings: ["sibling", "sibling"], exes: ["ex", "ex"], mentor: ["mentor", "apprentice"],
  cousins: ["cousin", "cousin"], boss: ["boss", "employee"], spouses: ["spouse", "spouse"], godparent: ["godparent", "godchild"],
  partners: ["partner", "partner"], aunt: ["aunt", "nephew"], grandparent: ["grandparent", "grandchild"], inlaws: ["inlaw", "inlaw"],
};

export const RELATIONS = [
  ["mama", "ignatius", "parent"], ["mama", "baron", "parent"], ["gunpowder", "ignatius", "parent"], ["gunpowder", "baron", "parent"],
  ["ignatius", "dynamita", "parent"], ["dolores", "dynamita", "parent"],
  ["ignatius", "baron", "siblings"], ["tony", "kapow", "siblings"],
  ["ignatius", "dolores", "exes"], ["dynamita", "fizzle", "exes"],
  ["baron", "fizzle", "mentor"], ["baron", "tony", "boss"],
  ["mama", "gunpowder", "spouses"], ["baron", "dynamita", "godparent"], ["baron", "dolores", "partners"],
  ["dolores", "tony", "aunt"], ["dolores", "kapow", "aunt"],
  ["dynamita", "tony", "cousins"], ["dynamita", "kapow", "cousins"],
  ["mama", "dynamita", "grandparent"], ["gunpowder", "dynamita", "grandparent"], ["mama", "dolores", "inlaws"],
];

// { kind, roles: [a's role, b's role] } or null.
export function relation(a, b) {
  for (const [x, y, kind] of RELATIONS) {
    if (x === a && y === b) return { kind, roles: KINDS[kind] };
    if (x === b && y === a) return { kind, roles: [KINDS[kind][1], KINDS[kind][0]] };
  }
  return null;
}

// Gunpowder is the last fight of everyone else's run; in his own run the Baron closes it.
const LADDERS = {
  ignatius: ["kapow", "fizzle", "tony", "dolores", "mama", "dynamita", "baron"],
  dynamita: ["fizzle", "kapow", "tony", "dolores", "mama", "ignatius", "baron"],
  baron: ["kapow", "fizzle", "tony", "mama", "dolores", "dynamita", "ignatius"],
  mama: ["kapow", "tony", "fizzle", "dolores", "dynamita", "ignatius", "baron"],
  dolores: ["fizzle", "kapow", "tony", "mama", "ignatius", "dynamita", "baron"],
  tony: ["kapow", "fizzle", "dolores", "mama", "dynamita", "ignatius", "baron"],
  fizzle: ["kapow", "tony", "dolores", "mama", "ignatius", "dynamita", "baron"],
  kapow: ["fizzle", "tony", "dolores", "mama", "dynamita", "ignatius", "baron"],
  gunpowder: ["kapow", "fizzle", "tony", "dolores", "mama", "dynamita", "ignatius", "baron"],
};
export const ladder = (id) => (id === "gunpowder" ? LADDERS.gunpowder : [...LADDERS[id], "gunpowder"]);

export const WIN = 2;
const LEVELS = ["easy", "normal", "hard"];

export const SIDEKICK = { id: "sparky", name: "Sparky", color: "#ffe14a", ability: "dash" };
export const actor = (id) => BY_ID[id] ?? SIDEKICK;

// Choices come before fight `at`. Effects shape that fight only: lv = bot level shift, dn = brick density, th/ly = stage detour,
// bm = special bombs, tl = floor tiles, ch = chaos; k / g count towards the Peacemaker / Tycoon endings.
export const CHOICES = [
  { id: "vendor", at: 0, opts: [{ dn: 0.15 }, { k: 1 }] },
  { id: "spare", at: 2, opts: [{ k: 1, lv: -1 }, { g: 1, dn: 0.1 }] },
  { id: "path", at: 3, opts: [{ tl: "few", th: "snow" }, { bm: true, th: "night" }, { lv: -1, dn: -0.1 }] },
  { id: "bribe", at: 4, opts: [{ g: 1, lv: 1, dn: 0.2 }, { k: 1 }] },
  { id: "riddle", at: 5, right: 1, opts: [{ lv: 1 }, { lv: -1, dn: 0.1 }, { lv: 1 }] },
  { id: "lunch", at: 6, opts: [{ bm: true }, { k: 1, lv: -1 }, { g: 1, dn: 0.15 }] },
  { id: "fuse", at: 7, opts: [{ g: 1, ch: true }, { k: 1 }, { ch: true, dn: 0.1 }] },
];
export const PEACE = 3, GREED = 3;

const mods = (run, i) => {
  const m = { lv: 0, dn: 0 };
  for (const c of CHOICES) {
    const o = c.at === i && run?.p ? c.opts[run.p[c.id]] : null;
    if (o) { m.lv += o.lv ?? 0; m.dn += o.dn ?? 0; for (const k of ["th", "ly", "bm", "tl", "ch"]) if (o[k]) m[k] = o[k]; }
  }
  return m;
};

// Short lines telling the player what a choice changed in the next fight.
export function effectNotes(o) {
  return [
    o.lv > 0 && "Tougher opponent", o.lv < 0 && "Softer opponent", o.dn > 0 && "More power-ups", o.dn < 0 && "Fewer power-ups",
    (o.th || o.ly) && "Detour: new arena", o.bm && "Special bombs", o.tl && "Floor tiles", o.ch && "Chaos events",
  ].filter(Boolean);
}

export const pendingChoice = (run) => CHOICES.find((c) => c.at === run.i && run.p[c.id] === undefined) ?? null;

export const tally = (run) => {
  let k = 0, g = 0;
  for (const c of CHOICES) { const o = c.opts[run.p?.[c.id]]; if (o) { k += o.k ?? 0; g += o.g ?? 0; } }
  return { k, g };
};

// Secret endings, decided from the finished run. Several can apply: all are recorded, shown in this order.
export const SECRET = {
  flawless: (r) => r.ct === 0 && r.lr === 0,
  peace: (r) => tally(r).k >= PEACE,
  tycoon: (r) => tally(r).g >= GREED,
};
export const ENDINGS = ["champion", ...Object.keys(SECRET)];
export const endingsOf = (run) => Object.keys(SECRET).filter((e) => SECRET[e](run));

// Co-op: players 0 and 1 are the humans (team 0), then the opponent and, from the fourth fight on (not the boss), their partner.
// Teams are [0,0,1] or [0,0,1,1]; the corners alternate so each side starts diagonally.
const allyOf = (id, foe, i) => {
  const pool = ladder(id).filter((x) => x !== foe && x !== "gunpowder");
  return pool[(i * 3 + 1) % pool.length];
};

// Bot level ramps easy -> normal -> hard; the last fight is the boss, with packed bricks (many more power-ups for both).
// `run` (optional) applies its choices and co-op settings to the fight; without it you get the plain solo fight.
export function fightOf(id, i, run = null) {
  const l = ladder(id), n = l.length, boss = i === n - 1, foe = l[i], stage = BY_ID[foe].stage, co = !!run?.co;
  const m = mods(run, i), ally = co && !boss && i >= 2 ? allyOf(id, foe, i) : null;
  const base = i < 2 ? 0 : i < n - 3 ? 1 : 2;
  const level = LEVELS[Math.max(0, Math.min(2, Math.max(base, co ? 1 : 0) + m.lv))];
  const opts = { layout: m.ly ?? stage.layout, softDensity: Math.min(0.95, Math.max(0.3, (boss ? 0.9 : 0.7) + m.dn)), powerups: true, suddenDeath: true, friendlyFire: co ? !!run.ff : true, teams: null };
  if (m.bm) opts.bombs = true;
  if (m.tl) opts.tiles = m.tl;
  if (m.ch) opts.chaos = true;
  const cast = co ? [id, SIDEKICK.id, foe, ...(ally ? [ally] : [])] : [id, foe];
  if (co) opts.teams = ally ? [0, 0, 1, 1] : [0, 0, 1];
  return {
    id, foe, i, n, boss, stage, theme: m.th ?? stage.theme, win: WIN, level, opts, co, ally, cast, notes: effectNotes(m),
    heroes: co ? [0, 1] : [0], foes: cast.map((_, k) => k).filter((k) => k >= (co ? 2 : 1)),
  };
}

const KEY = "story";
const newRun = (id, co = false, ff = false) => ({ id, i: 0, co, ff, p: {}, ct: 0, lr: 0 });
export const fresh = () => ({ run: null, cleared: [], unlocked: false, co: false, ff: false, coop: [], ends: [] });
export const playable = (st, id) => id in BY_ID && (id !== "gunpowder" || st.unlocked);

const count = (v) => (Number.isInteger(v) && v >= 0 ? Math.min(v, 999) : 0);
const ids = (a, ok) => (Array.isArray(a) ? ok.filter((x) => a.includes(x)) : []);

// Old saves ({run: {id, i}, cleared, unlocked}) load as is: every newer field is optional.
export function sanitize(o) {
  const st = fresh();
  if (!o || typeof o !== "object") return st;
  const all = ROSTER.map((f) => f.id);
  st.unlocked = o.unlocked === true;
  st.cleared = ids(o.cleared, all);
  st.coop = ids(o.coop, st.cleared);
  st.co = o.co === true;
  st.ff = o.ff === true;
  if (st.cleared.length) st.unlocked = true;
  st.ends = ids(o.ends, ENDINGS);
  if (st.cleared.length && !st.ends.includes("champion")) st.ends.unshift("champion");
  const r = o.run;
  if (r && Object.hasOwn(BY_ID, r.id) && playable(st, r.id) && Number.isInteger(r.i) && r.i >= 0 && r.i < ladder(r.id).length) {
    st.run = newRun(r.id, r.co === true, r.ff === true);
    st.run.i = r.i;
    st.run.ct = count(r.ct);
    st.run.lr = count(r.lr);
    for (const c of CHOICES) if (c.at <= r.i && Number.isInteger(r.p?.[c.id]) && r.p[c.id] >= 0 && r.p[c.id] < c.opts.length) st.run.p[c.id] = r.p[c.id];
  }
  return st;
}

export function load(storage) {
  try { return sanitize(JSON.parse(storage.getItem(KEY))); } catch { return fresh(); }
}

export function save(storage, st) {
  try { storage.setItem(KEY, JSON.stringify(st)); } catch {}
}

export function begin(st, id, o = {}) {
  if (!playable(st, id)) return false;
  st.run = newRun(id, o.co === true, o.ff === true);
  return true;
}

// Fight won (lost = rounds the opponents took). done = run complete; fresh = Gunpowder unlocked just now.
export function advance(st, lost = 0) {
  const { id, i } = st.run;
  st.run.lr = count(st.run.lr + lost);
  if (i + 1 < ladder(id).length) { st.run.i++; return { done: false, fresh: false }; }
  const fresh = !st.unlocked, run = st.run;
  if (!st.cleared.includes(id)) st.cleared.push(id);
  if (run.co && !st.coop.includes(id)) st.coop.push(id);
  for (const e of ["champion", ...endingsOf(run)]) if (!st.ends.includes(e)) st.ends.push(e);
  st.unlocked = true;
  st.run = null;
  return { done: true, fresh };
}

export function continued(st) { st.run.ct = count(st.run.ct + 1); }
