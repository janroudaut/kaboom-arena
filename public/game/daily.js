import { ABILITIES, SLOT_ABILITY } from "./sim.js";
import { BY_ID } from "./campaign.js";
import { THEMES, MODE_INFO } from "./look.js";

const DAY = 86400000;
export const KEEP_DAYS = 30;
const KEY_RE = /^\d{4}-\d\d-\d\d$/;

export const dayKey = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);
const num = (key) => Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / DAY;
export const prevKey = (key) => dayKey((num(key) - 1) * DAY);

export function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}
export const seedOf = (key, round) => hash(`kaboom-daily|${key}|${round}`);

// bots: opponents next to the human. Rounds: first to `win`. A rule never reads the player's settings.
export const RULES = [
  { id: "wave", name: "Wave Rider", mode: "survival", bots: 0, layout: "open", theme: "night", fighter: "kapow", win: 1, tag: "How many waves can you ride?" },
  { id: "hill", name: "Hill Rush", mode: "hill", bots: 3, level: "normal", layout: "cross", theme: "desert", fighter: "dolores", win: 1, tag: "Stand on the zone, score fast." },
  { id: "maze", name: "Packed Maze", bots: 3, level: "hard", layout: "maze", theme: "lava", soft: 0.9, fighter: "baron", win: 1, tag: "Bricks everywhere, rivals hungry." },
  { id: "ice", name: "Ice Rink", bots: 2, level: "normal", layout: "open", theme: "snow", tiles: "many", fighter: "mama", win: 2, tag: "Ice, belts, spikes, portals. Good luck braking." },
  { id: "potato", name: "Hot Potato Party", mode: "potato", bots: 3, level: "normal", layout: "classic", theme: "grass", fighter: "tony", win: 1, tag: "Pass it on before it blows." },
  { id: "chaos", name: "Chaos Cup", bots: 3, level: "normal", layout: "pillars", theme: "night", chaos: true, fighter: "dynamita", win: 1, tag: "Bomb rain, quakes and swaps." },
  { id: "duel", name: "Duel at Dawn", bots: 1, level: "hard", layout: "pillars", theme: "grass", abilities: true, fighter: "ignatius", win: 2, tag: "One hard rival, first to two." },
  { id: "bazaar", name: "Bomb Bazaar", bots: 3, level: "normal", layout: "classic", theme: "desert", bombs: true, fighter: "fizzle", win: 1, tag: "Cluster, mine, ice, glove and punch." },
  { id: "spikes", name: "Spike Survival", mode: "survival", bots: 0, layout: "cross", theme: "lava", tiles: "many", fighter: "dynamita", win: 1, tag: "Waves, spikes and portals." },
  { id: "frozen", name: "Frozen Hill", mode: "hill", bots: 2, level: "hard", layout: "open", theme: "snow", tiles: "few", fighter: "fizzle", win: 1, tag: "Slippery king of the hill." },
  { id: "sprint", name: "Sprint", bots: 1, level: "easy", layout: "open", theme: "desert", powerups: false, fighter: "tony", win: 1, tag: "One easy bot. Be quick about it." },
  { id: "hard3", name: "Three Hard Bots", bots: 3, level: "hard", layout: "classic", theme: "grass", fighter: "ignatius", win: 1, tag: "The classic, with teeth." },
  { id: "brawl", name: "Ability Brawl", bots: 3, level: "normal", layout: "cross", theme: "night", abilities: true, fighter: "dolores", win: 1, tag: "Everybody has a trick." },
  { id: "storm", name: "Storm Survival", mode: "survival", bots: 0, layout: "pillars", theme: "lava", chaos: true, bombs: true, fighter: "baron", win: 1, tag: "Waves, chaos and special bombs." },
];

export const ruleOf = (key) => RULES[((num(key) % RULES.length) + RULES.length) % RULES.length];

// Everything a match needs: no settings involved, same for everybody on that UTC day.
export function specOf(key, r = ruleOf(key)) {
  const me = BY_ID[r.fighter], survival = r.mode === "survival";
  const opts = {
    layout: r.layout, softDensity: r.soft ?? 0.7, powerups: r.powerups ?? true, suddenDeath: true, friendlyFire: survival ? undefined : true,
    tiles: r.tiles ?? "off", chaos: !!r.chaos, bombs: !!r.bombs, mode: r.mode ?? "classic",
    abilities: r.abilities ? [me.ability, ...SLOT_ABILITY.slice(1).map((i) => ABILITIES[i][0])] : false,
  };
  return { key, rule: r, n: survival ? 1 : 1 + r.bots, win: r.win, level: r.level ?? "normal", fighter: me, opts, theme: r.theme, seed: (round) => seedOf(key, round) };
}

export function summary(spec) {
  const r = spec.rule, bits = [MODE_INFO[r.mode ?? "classic"].name, `${r.layout} arena`, THEMES[r.theme].name];
  if (r.tiles) bits.push("floor tiles");
  if (r.chaos) bits.push("chaos");
  if (r.bombs) bits.push("special bombs");
  if (r.abilities) bits.push("abilities");
  if (r.bots) bits.push(`${r.bots} ${r.level} bot${r.bots > 1 ? "s" : ""}`);
  return bits.join(" · ");
}

// One number per attempt: higher is better. result = { won, ticks, kills, waves, points } (ticks = whole match).
export function score(rule, r) {
  const sec = Math.floor((r.ticks | 0) / 60), won = !!r.won;
  if (rule.mode === "survival") return (r.waves | 0) * 1000 + sec * 10;
  if (rule.mode === "hill") return (r.points | 0) * 100 + (won ? 1000 + Math.max(0, 90 - sec) * 10 : 0);
  return (won ? 5000 : 0) + (r.kills | 0) * 750 + (won ? Math.max(0, 240 - sec) * 8 : 0);
}

// What the player sees as the outcome, e.g. "Won in 1:12 · 2 kills".
export function resultLine(rule, r) {
  const sec = Math.floor((r.ticks | 0) / 60), t = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (rule.mode === "survival") return `${plural(r.waves | 0, "wave")} · ${t}`;
  if (rule.mode === "hill") return `${plural(r.points | 0, "point")} · ${r.won ? "won" : "lost"} · ${t}`;
  return `${r.won ? "Won" : "Lost"} · ${t} · ${plural(r.kills | 0, "kill")}`;
}

// ---- progress (localStorage `daily`, storage injected) ----------------------------------------------------------------

export const fresh = () => ({ days: {}, streak: 0, last: null });

export function sanitize(o) {
  const st = fresh();
  if (!o || typeof o !== "object") return st;
  const ok = (v, max = 1e7) => Number.isInteger(v) && v >= 0 && v <= max;
  for (const [k, d] of Object.entries(o.days ?? {}).slice(0, 400)) {
    if (!KEY_RE.test(k) || !d || !ok(d.best) || !ok(d.tries, 1e6)) continue;
    st.days[k] = { best: d.best, tries: d.tries, line: typeof d.line === "string" ? d.line.slice(0, 60) : "", ...(typeof d.data === "string" && d.data.length < 40000 ? { data: d.data } : {}) };
  }
  if (ok(o.streak, 1e5) && typeof o.last === "string" && KEY_RE.test(o.last)) { st.streak = o.streak; st.last = o.last; }
  return st;
}

export function load(storage) {
  try { return sanitize(JSON.parse(storage.getItem("daily"))); } catch { return fresh(); }
}
export function save(storage, st) {
  try { storage.setItem("daily", JSON.stringify(st)); } catch {}
}

// Consecutive UTC days with at least one finished attempt; a missed day resets it.
export function streakOn(st, key) {
  return st.last === key || st.last === prevKey(key) ? st.streak : 0;
}

// Returns true when this attempt is the new best of the day. Only the best run keeps its replay data.
export function record(st, key, { value, line, data }) {
  const d = (st.days[key] ??= { best: -1, tries: 0, line: "" });
  d.tries++;
  const better = value > d.best;
  if (better) { d.best = value; d.line = line; if (data) d.data = data; else delete d.data; }
  if (!st.last || key > st.last) { st.streak = st.last === prevKey(key) ? st.streak + 1 : 1; st.last = key; }
  const keep = Object.keys(st.days).sort().slice(-KEEP_DAYS);
  for (const k of Object.keys(st.days)) {
    if (!keep.includes(k)) delete st.days[k];
    else if (k !== key) delete st.days[k].data;
  }
  return better;
}
