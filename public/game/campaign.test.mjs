import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "./sim.js";
import { LAYOUTS } from "./settings.js";
import { THEMES, setSuits, palette, view } from "./look.js";
import { ROSTER, BY_ID, KINDS, RELATIONS, ladder, fightOf, relation, WIN, fresh, load, save, sanitize, begin, advance, playable } from "./campaign.js";
import { TEXT, banter, TEMPLATE_ROLES } from "./story.js";

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
