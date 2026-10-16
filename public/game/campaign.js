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

// Bot level ramps easy -> normal -> hard; the last fight is the boss, with packed bricks (many more power-ups for both).
export function fightOf(id, i) {
  const l = ladder(id), n = l.length, boss = i === n - 1, foe = l[i], stage = BY_ID[foe].stage;
  return {
    id, foe, i, n, boss, stage, theme: stage.theme, win: WIN,
    level: i < 2 ? "easy" : i < n - 3 ? "normal" : "hard",
    opts: { layout: stage.layout, softDensity: boss ? 0.9 : 0.7, powerups: true, suddenDeath: true, friendlyFire: true, teams: null },
  };
}

const KEY = "story";
export const fresh = () => ({ run: null, cleared: [], unlocked: false });
export const playable = (st, id) => id in BY_ID && (id !== "gunpowder" || st.unlocked);

export function sanitize(o) {
  const st = fresh();
  if (!o || typeof o !== "object") return st;
  st.unlocked = o.unlocked === true;
  if (Array.isArray(o.cleared)) st.cleared = ROSTER.map((f) => f.id).filter((id) => o.cleared.includes(id));
  if (st.cleared.length) st.unlocked = true;
  const r = o.run;
  if (r && Object.hasOwn(BY_ID, r.id) && playable(st, r.id) && Number.isInteger(r.i) && r.i >= 0 && r.i < ladder(r.id).length) st.run = { id: r.id, i: r.i };
  return st;
}

export function load(storage) {
  try { return sanitize(JSON.parse(storage.getItem(KEY))); } catch { return fresh(); }
}

export function save(storage, st) {
  try { storage.setItem(KEY, JSON.stringify(st)); } catch {}
}

export function begin(st, id) {
  if (!playable(st, id)) return false;
  st.run = { id, i: 0 };
  return true;
}

// Fight won. done = run complete; fresh = Gunpowder unlocked just now.
export function advance(st) {
  const { id, i } = st.run;
  if (i + 1 < ladder(id).length) { st.run.i++; return { done: false, fresh: false }; }
  const fresh = !st.unlocked;
  if (!st.cleared.includes(id)) st.cleared.push(id);
  st.unlocked = true;
  st.run = null;
  return { done: true, fresh };
}
