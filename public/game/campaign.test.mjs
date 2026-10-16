import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step } from "./sim.js";
import { LAYOUTS } from "./settings.js";
import { THEMES, setSuits, palette, view } from "./look.js";
import { ROSTER, BY_ID, KINDS, RELATIONS, ladder, fightOf, relation, WIN, fresh, load, save, sanitize, begin, advance, playable, CHOICES, SECRET, ENDINGS, SIDEKICK, actor, pendingChoice, endingsOf, tally, effectNotes, continued } from "./campaign.js";
import { TEXT, banter, TEMPLATE_ROLES, fightLine, DUO, CHOICE_TEXT, ENDING_TEXT, fillText, sideLine } from "./story.js";
import { ART, pixels } from "./storyart.js";
import { cleanOpts, settle, createRecorder } from "./replay.js";
import { wrap } from "./director.js";

const ids = ROSTER.map((f) => f.id);
const mem = (init) => { const d = { ...init }; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => (d[k] = String(v)), d }; };

test("roster: 9 fighters, distinct hex colours, stages use known layouts and themes", () => {
  assert.equal(ids.length, 9);
  assert.equal(new Set(ROSTER.map((f) => f.color)).size, 9);
  for (const f of ROSTER) {
    assert.match(f.color, /^#[0-9a-f]{6}$/);
    assert.ok(LAYOUTS.includes(f.stage.layout) && f.stage.theme in THEMES, f.id);
    assert.ok(TEXT[f.id].bio && TEXT[f.id].intro && TEXT[f.id].victory && TEXT[f.id].defeat, f.id);
    assert.ok(TEXT[f.id].ending.length >= 4 && TEXT[f.id].ending.length <= 6, f.id);
  }
});

test("ladders: valid for every fighter, no self fight, Gunpowder last (and absent from his own run)", () => {
  for (const id of ids) {
    const l = ladder(id);
    assert.equal(l.length, 8, id);
    assert.equal(new Set(l).size, l.length, id);
    assert.ok(!l.includes(id) && l.every((x) => x in BY_ID), id);
    assert.equal(l.includes("gunpowder"), id !== "gunpowder");
    if (id !== "gunpowder") assert.equal(l.at(-1), "gunpowder");
    else assert.equal(l.at(-1), "baron");
  }
  assert.equal(new Set(ids.map((id) => ladder(id).join())).size, 9);
});

test("fightOf: level ramp, boss twist and sim-compatible options for every step", () => {
  for (const id of ids) {
    const levels = ladder(id).map((_, i) => fightOf(id, i).level);
    assert.deepEqual(levels, ["easy", "easy", "normal", "normal", "normal", "hard", "hard", "hard"]);
    ladder(id).forEach((foe, i) => {
      const f = fightOf(id, i);
      assert.equal(f.foe, foe);
      assert.equal(f.boss, i === 7);
      assert.equal(f.win, WIN);
      const s = newGame(2, 1, f.opts);
      assert.equal(s.cfg.layout, f.stage.layout);
      assert.equal(s.cfg.softDensity, f.boss ? 0.9 : 0.7);
      assert.equal(s.players.length, 2);
    });
  }
});

test("relations: valid graph, symmetric lookup with swapped roles", () => {
  const seen = new Set();
  for (const [a, b, k] of RELATIONS) {
    assert.ok(a in BY_ID && b in BY_ID && a !== b && k in KINDS);
    const key = [a, b].sort().join();
    assert.ok(!seen.has(key), `duplicate ${key}`);
    seen.add(key);
  }
  assert.deepEqual(relation("mama", "ignatius").roles, ["parent", "child"]);
  assert.deepEqual(relation("ignatius", "mama").roles, ["child", "parent"]);
  assert.equal(relation("kapow", "fizzle"), null);
  for (const roles of Object.values(KINDS)) for (const r of roles) assert.ok(TEMPLATE_ROLES.includes(r), r);
});

test("banter: every ordered pair has two lines, deterministic, special pairs and templates used", () => {
  for (const a of ids) {
    for (const b of ids) {
      if (a === b) continue;
      const l = banter(a, b);
      assert.equal(l.length, 2);
      assert.ok(l.every((x) => typeof x === "string" && x.length > 5 && !x.includes("{o}")), `${a}>${b}`);
      assert.deepEqual(l, banter(a, b));
    }
  }
  assert.match(banter("ignatius", "baron")[0], /sock drawer/);
  assert.equal(banter("baron", "ignatius")[1], banter("ignatius", "baron")[0]);
  assert.match(banter("dolores", "tony")[0], /Tony/);
  assert.match(banter("tony", "dolores")[0], /Dolores/);
  assert.deepEqual(banter("kapow", "fizzle"), [TEXT.kapow.taunt, TEXT.fizzle.taunt]);
  for (const id of ids) if (id !== "gunpowder") assert.ok(banter(id, "gunpowder")[1] !== TEXT.gunpowder.taunt);
});

test("progress: injected storage round trip, junk is rejected", () => {
  const store = mem();
  assert.deepEqual(load(store), fresh());
  const st = fresh();
  assert.ok(begin(st, "mama"));
  st.run.i = 3;
  save(store, st);
  assert.deepEqual(load(store), st);
  assert.deepEqual(load(mem({ story: "{nope" })), fresh());
  assert.deepEqual(load({ getItem() { throw new Error("denied"); } }), fresh());
  assert.deepEqual(sanitize({ run: { id: "__proto__", i: 0 } }), fresh());
  assert.deepEqual(sanitize({ run: { id: "mama", i: 99 }, cleared: ["nobody"] }), fresh());
  assert.deepEqual(sanitize({ run: { id: "gunpowder", i: 0 } }).run, null);
  assert.doesNotThrow(() => save({ setItem() { throw new Error("full"); } }, st));
});

test("run and unlock: Gunpowder unlocks once, after the first completed run", () => {
  const st = fresh();
  assert.ok(!playable(st, "gunpowder") && playable(st, "baron"));
  assert.ok(!begin(st, "gunpowder"));
  begin(st, "dynamita");
  for (let i = 0; i < 7; i++) assert.deepEqual(advance(st), { done: false, fresh: false });
  assert.equal(st.run.i, 7);
  assert.deepEqual(advance(st), { done: true, fresh: true });
  assert.deepEqual([st.run, st.cleared, st.unlocked], [null, ["dynamita"], true]);
  assert.ok(playable(st, "gunpowder") && begin(st, "gunpowder"));
  assert.equal(ladder("gunpowder").length, 8);
  st.run.i = 7;
  assert.deepEqual(advance(st), { done: true, fresh: false });
  assert.deepEqual(st.cleared, ["dynamita", "gunpowder"]);
  assert.equal(sanitize({ cleared: ["baron"] }).unlocked, true);
});

test("fighter suits: custom palette is stable, dark shades derived, colour-blind keeps priority", () => {
  const std = palette();
  setSuits(["#3c7be8", "#ff8a1a"]);
  const p = palette();
  assert.deepEqual(p.suit.slice(0, 2), ["#3c7be8", "#ff8a1a"]);
  assert.equal(p.suit[2], std.suit[2]);
  assert.match(p.dark[0], /^#[0-9a-f]{6}$/);
  assert.equal(p, palette());
  view.cb = true;
  assert.notEqual(palette(), p);
  assert.notEqual(palette().suit[0], "#3c7be8");
  view.cb = false;
  setSuits(null);
  assert.equal(palette(), std);
});

test("every fighter has a short in-fight line per event that fits a two-line bubble", () => {
  for (const id of ids) {
    for (const ev of ["bomb", "close", "die", "win"]) {
      const l = fightLine(id, ev);
      assert.ok(l && l.length <= 26, `${id} ${ev}`);
      assert.ok(wrap(l).every((x) => x.length <= 14), `${id} ${ev}`);
    }
  }
  assert.equal(fightLine("nobody", "bomb"), null);
});

const play = (id, co = false) => { const st = fresh(); begin(st, id, { co }); return st; };
const answerAll = (st, k) => { for (let g = 0; g < 30; g++) { const c = pendingChoice(st.run); if (c) st.run.p[c.id] = Math.min(k, c.opts.length - 1); else if (advance(st).done) return; } };

test("choices: 6-10 well formed, each with matching text and sim-compatible effects", () => {
  assert.ok(CHOICES.length >= 6 && CHOICES.length <= 10);
  assert.equal(new Set(CHOICES.map((c) => c.id)).size, CHOICES.length);
  for (const c of CHOICES) {
    const t = CHOICE_TEXT[c.id];
    assert.ok(c.at >= 0 && c.at < 8 && c.opts.length >= 2 && c.opts.length <= 3, c.id);
    assert.equal(t.opts.length, c.opts.length, c.id);
    assert.equal(t.res.length, c.opts.length, c.id);
    assert.ok(t.text.length <= 110 && t.title.length <= 24 && t.opts.every((o) => o.length <= 24) && t.res.every((r) => r.length <= 110), c.id);
    for (const o of c.opts) {
      assert.ok(!o.th || o.th in THEMES);
      assert.ok(!o.ly || LAYOUTS.includes(o.ly));
      assert.ok(!o.tl || ["few", "many"].includes(o.tl));
    }
    if (c.right !== undefined) assert.ok(c.right < c.opts.length);
  }
  assert.equal(fillText("{prev} > {foe} > {me} {x}", { prev: "A", foe: "B", me: "C" }), "A > B > C {x}");
});

test("choices change only the fight they precede: level, density, detours, extras", () => {
  const st = play("ignatius");
  const base = fightOf("ignatius", 4, st.run);
  st.run.p.bribe = 0;
  const bribed = fightOf("ignatius", 4, st.run);
  assert.equal(bribed.level, "hard");
  assert.equal(base.level, "normal");
  assert.ok(Math.abs(bribed.opts.softDensity - 0.9) < 1e-9);
  assert.equal(fightOf("ignatius", 5, st.run).level, "hard");
  st.run.p.path = 0;
  const path = fightOf("ignatius", 3, st.run);
  assert.deepEqual([path.opts.tiles, path.theme, path.stage.theme], ["few", "snow", "lava"].map((x, k) => (k === 2 ? BY_ID[ladder("ignatius")[3]].stage.theme : x)));
  assert.ok(path.notes.length && path.notes.every((n) => typeof n === "string"));
  st.run.p.path = 1;
  assert.equal(fightOf("ignatius", 3, st.run).opts.bombs, true);
  st.run.p.path = 2;
  assert.equal(fightOf("ignatius", 3, st.run).level, "easy");
  assert.deepEqual(effectNotes({ k: 1 }), []);
  for (const c of CHOICES) c.opts.forEach((_, k) => { st.run.p = { [c.id]: k }; assert.doesNotThrow(() => newGame(2, 1, fightOf("mama", c.at, st.run).opts)); });
});

test("pendingChoice asks each choice once, at its fight", () => {
  const st = play("tony");
  assert.equal(pendingChoice(st.run).id, "vendor");
  st.run.p.vendor = 1;
  assert.equal(pendingChoice(st.run), null);
  st.run.i = 2;
  assert.equal(pendingChoice(st.run).id, "spare");
  st.run.i = 1;
  assert.equal(pendingChoice(st.run), null);
});

test("endings: Flawless, Peacemaker and Tycoon come from hidden counters and are recorded once", () => {
  assert.deepEqual(Object.keys(SECRET), ENDINGS.slice(1));
  assert.equal(ENDINGS.length, 4);
  for (const e of ENDINGS) assert.ok(ENDING_TEXT[e].title && ENDING_TEXT[e].note, e);
  for (const e of ENDINGS.slice(1)) assert.ok(ENDING_TEXT[e].lines.length >= 4 && ENDING_TEXT[e].lines.length <= 6 && ART[{ flawless: "trophy", peace: "feast", tycoon: "tycoon" }[e]], e);

  let st = play("mama");
  answerAll(st, 1);
  assert.deepEqual([...st.ends], ["champion", "flawless", "peace"]);
  assert.ok(tally({ p: { vendor: 1, spare: 0, bribe: 1 } }).k === 3);

  st = play("mama");
  st.run.lr = 1;
  answerAll(st, 99);
  assert.ok(!st.ends.includes("flawless"));
  st = play("mama");
  continued(st);
  for (const c of CHOICES) st.run.p[c.id] = c.opts.findIndex((o) => o.g);
  assert.deepEqual(endingsOf({ ...st.run, p: Object.fromEntries(CHOICES.map((c) => [c.id, c.opts.findIndex((o) => o.g)]).filter(([, k]) => k >= 0)) }), ["tycoon"]);
  assert.ok(!endingsOf({ ct: 0, lr: 0, p: {} }).includes("tycoon") && endingsOf({ ct: 0, lr: 0, p: {} }).includes("flawless"));
  st = play("mama");
  st.run.i = 7;
  advance(st, 1);
  assert.deepEqual(st.ends, ["champion"]);
});

test("co-op fights: team layout, partner bots, level floor, friendly fire off by default", () => {
  const run = { id: "dynamita", i: 0, co: true, ff: false, p: {} };
  for (const id of ids) {
    ladder(id).forEach((foe, i) => {
      const f = fightOf(id, i, { ...run, id });
      const duo = i >= 2 && i < 7;
      assert.equal(f.co, true);
      assert.equal(f.ally !== null, duo, `${id} ${i}`);
      assert.deepEqual(f.opts.teams, duo ? [0, 0, 1, 1] : [0, 0, 1]);
      assert.equal(f.cast.length, duo ? 4 : 3);
      assert.deepEqual(f.heroes, [0, 1]);
      assert.deepEqual(f.foes, duo ? [2, 3] : [2]);
      assert.equal(f.cast[1], SIDEKICK.id);
      assert.ok(f.opts.friendlyFire === false && f.level !== "easy");
      if (duo) assert.ok(f.ally !== foe && f.ally !== id && f.ally !== "gunpowder" && f.ally in BY_ID);
      const s = newGame(f.cast.length, 3, f.opts);
      assert.equal(s.players.length, f.cast.length);
      assert.deepEqual(s.cfg.teams, f.opts.teams);
      assert.equal(fightOf(id, i, { ...run, id, ff: true }).opts.friendlyFire, true);
      assert.ok(DUO[foe] && actor(f.cast[1]).name === "Sparky");
    });
  }
  assert.equal(fightOf("mama", 7, { ...run, id: "mama" }).opts.softDensity, 0.9);
  const solo = fightOf("mama", 3);
  assert.deepEqual([solo.co, solo.ally, solo.opts.teams, solo.cast, solo.heroes, solo.foes, solo.opts.friendlyFire], [false, null, null, ["mama", solo.foe], [0], [1], true]);
});

test("co-op rounds: a team wins when its opponents are all dead, a lone survivor keeps the round going", () => {
  const f = fightOf("ignatius", 3, { ...play("ignatius", true).run });
  const run = (dead) => {
    const s = newGame(4, 5, f.opts), idle = {};
    for (const id of dead) s.players[id].alive = false;
    for (let k = 0; k < 600 && !s.done; k++) step(s, idle);
    return s;
  };
  let s = run([2, 3]);
  assert.equal(s.winnerTeam, 0);
  s = run([0, 1]);
  assert.equal(s.winnerTeam, 1);
  s = run([1, 3]);
  assert.equal(s.done && s.winnerTeam, false, "one hero and one foe left: nobody wins yet");
  const pl = [0, 1, 2, 3].map((id) => ({ id })), g = { s: { cfg: { teams: [0, 0, 1, 1] }, players: pl, winner: 1, winnerTeam: 0 }, scores: [0, 0, 0, 0], win: 2, story: true, names: [] };
  settle(g);
  assert.deepEqual(g.scores, [1, 1, 0, 0]);
  assert.equal(g.banner, "KABOOM!");
  g.s = { cfg: g.s.cfg, players: pl, winner: 2, winnerTeam: 1 };
  settle(g);
  assert.equal(g.banner, "OUCH!");
});

test("co-op replays: recorder keeps the team layout and the co-op marker", () => {
  assert.deepEqual(cleanOpts({ teams: [0, 0, 1] }).teams, [0, 0, 1]);
  assert.deepEqual(cleanOpts({ teams: [0, 0, 1, 1] }).teams, [0, 0, 1, 1]);
  assert.deepEqual(cleanOpts({ teams: [0, 1, 0, 1] }).teams, [0, 1, 0, 1]);
  for (const bad of [[1, 1, 0], [0, 0, 0, 1], [0, 1], "x", [0, 0, 1, 1, 1]]) assert.equal(cleanOpts({ teams: bad }).teams, undefined);
  const f = fightOf("baron", 2, { co: true, ff: false, p: {} });
  assert.deepEqual(cleanOpts(f.opts).teams, [0, 0, 1, 1]);
  const rec = createRecorder({ k: "story", n: 4, hm: 3, w: 2, lv: f.level, st: { id: "baron", i: 2, co: 1, al: f.ally }, ts: 1 });
  const s = newGame(4, 9, f.opts);
  rec.begin(s, 9, f.opts, f.theme, [2, 3]);
  rec.step(s, {});
  assert.deepEqual(rec.finish({ nm: [] }).r[0].o.teams, [0, 0, 1, 1]);
});

test("save migration: an old-format save loads silently with every new field defaulted", () => {
  const old = { run: { id: "mama", i: 3 }, cleared: ["dynamita", "baron"], unlocked: true };
  const st = load(mem({ story: JSON.stringify(old) }));
  assert.deepEqual(st.run, { id: "mama", i: 3, co: false, ff: false, p: {}, ct: 0, lr: 0 });
  assert.deepEqual([st.cleared, st.coop, st.ends, st.co, st.ff], [["dynamita", "baron"], [], ["champion"], false, false]);
  assert.deepEqual(sanitize(JSON.parse(JSON.stringify(st))), st);
  assert.deepEqual(load(mem({ story: JSON.stringify({ unlocked: true }) })).ends, []);
});

test("save sanitising: choices, counters, co-op and endings are validated", () => {
  const st = sanitize({
    run: { id: "tony", i: 3, co: true, ff: 1, ct: -4, lr: "x", p: { vendor: 1, spare: 9, path: 2, bribe: 0, nope: 1, riddle: 1 } },
    cleared: ["tony", "mama"], coop: ["mama", "baron", "zzz"], ends: ["peace", "bogus", "peace"], co: true,
  });
  assert.deepEqual(st.run.p, { vendor: 1, path: 2 });
  assert.deepEqual([st.run.co, st.run.ff, st.run.ct, st.run.lr], [true, false, 0, 0]);
  assert.deepEqual(st.coop, ["mama"]);
  assert.deepEqual(st.ends.sort(), ["champion", "peace"]);
  assert.equal(st.co, true);
  const store = mem();
  const a = play("kapow", true);
  a.run.p.vendor = 0;
  a.run.i = 1;
  a.coop.push("tony"); a.cleared.push("tony");
  save(store, a);
  assert.deepEqual(load(store), { ...a, ends: ["champion"], unlocked: true });
  assert.doesNotThrow(() => load(mem({ story: JSON.stringify({ run: { id: "mama", i: 2, p: "x" }, coop: 3, ends: {} }) })));
});

test("co-op progress is the same save: a co-op win flags the fighter, a solo win does not", () => {
  const st = play("fizzle", true);
  st.run.i = 7;
  advance(st);
  assert.deepEqual([st.cleared, st.coop], [["fizzle"], ["fizzle"]]);
  begin(st, "kapow");
  st.run.i = 7;
  advance(st);
  assert.deepEqual([st.cleared, st.coop], [["fizzle", "kapow"], ["fizzle"]]);
});

test("co-op and ending text: reactions for every fighter, short sidekick lines", () => {
  for (const id of ids) {
    assert.ok(DUO[id] && DUO[id].length <= 90, id);
    assert.ok(sideLine(id).length > 10 && sideLine(id) === sideLine(id));
  }
  assert.equal(SIDEKICK.name, "Sparky");
  assert.ok(!ids.includes(SIDEKICK.id) && !ROSTER.some((f) => f.color === SIDEKICK.color));
});

test("story art: rectangles stay inside their canvas and render to a static SVG", () => {
  for (const [name, a] of Object.entries(ART)) {
    assert.ok(a.r.length > 5, name);
    for (const r of a.r) assert.ok(r.x >= 0 && r.y >= 0 && r.w > 0 && r.h > 0 && r.x + r.w <= a.w && r.y + r.h <= a.h && /^#[0-9a-f]{3,6}$/i.test(r.c), `${name} ${JSON.stringify(r)}`);
    const svg = pixels(name, 4);
    assert.match(svg, /^<svg [^>]*viewBox="0 0 \d+ \d+"/);
    assert.ok(!svg.includes("<animate") && !svg.includes("<style"));
  }
});
