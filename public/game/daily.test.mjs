import test from "node:test";
import assert from "node:assert/strict";
import { newGame } from "./sim.js";
import { dayKey, prevKey, seedOf, ruleOf, specOf, RULES, score, resultLine, summary, fresh, load, save, record, streakOn, sanitize, hash } from "./daily.js";
import { cleanOpts } from "./replay.js";
import { BY_ID } from "./campaign.js";

const mem = () => { const m = {}; return { getItem: (k) => m[k] ?? null, setItem: (k, v) => (m[k] = v) }; };

test("day key is the UTC date and seeds are stable", () => {
  assert.equal(dayKey(Date.UTC(2026, 9, 16, 23, 59, 59)), "2026-10-16");
  assert.equal(dayKey(Date.UTC(2026, 9, 17, 0, 0, 0)), "2026-10-17");
  assert.equal(prevKey("2026-03-01"), "2026-02-28");
  assert.equal(prevKey("2026-01-01"), "2025-12-31");
  assert.equal(seedOf("2026-10-16", 0), seedOf("2026-10-16", 0));
  assert.notEqual(seedOf("2026-10-16", 0), seedOf("2026-10-16", 1));
  assert.notEqual(seedOf("2026-10-16", 0), seedOf("2026-10-17", 0));
  assert.equal(hash(""), 0x811c9dc5);
});

test("the ruleset rotates daily through every rule without repeating back to back", () => {
  const seen = new Set();
  let prev = null;
  for (let d = 0; d < RULES.length * 2; d++) {
    const key = dayKey(Date.UTC(2026, 0, 1) + d * 86400000), r = ruleOf(key);
    seen.add(r.id);
    assert.notEqual(r.id, prev);
    prev = r.id;
  }
  assert.equal(seen.size, RULES.length);
  assert.equal(ruleOf("2026-10-16").id, ruleOf("2026-10-16").id);
});

test("every rule builds a valid match for the sim and survives replay sanitising", () => {
  for (const r of RULES) {
    assert.ok(BY_ID[r.fighter], r.id);
    const spec = specOf("2026-05-05", r);
    assert.deepEqual(cleanOpts(spec.opts).mode ?? "classic", r.mode ?? "classic", r.id);
    assert.equal(cleanOpts(spec.opts).layout, r.layout);
    const s = newGame(spec.n, spec.seed(0), cleanOpts(spec.opts));
    assert.equal(s.cfg.mode ?? "classic", r.mode ?? "classic");
    assert.ok(s.players.length >= spec.n);
    assert.ok(summary(spec).length > 10);
    assert.ok(Array.isArray(spec.opts.abilities) || !r.abilities);
  }
});

test("score formula: wins beat losses, speed and kills help, waves and points dominate their modes", () => {
  const classic = { id: "x" };
  assert.ok(score(classic, { won: true, ticks: 3600, kills: 0 }) > score(classic, { won: false, ticks: 3600, kills: 3 }));
  assert.ok(score(classic, { won: true, ticks: 3600, kills: 1 }) > score(classic, { won: true, ticks: 7200, kills: 1 }));
  assert.ok(score(classic, { won: true, ticks: 3600, kills: 3 }) > score(classic, { won: true, ticks: 3600, kills: 2 }));
  assert.equal(score(classic, { won: true, ticks: 99999, kills: 0 }), 5000);
  const sv = { mode: "survival" };
  assert.ok(score(sv, { waves: 4, ticks: 4800 }) > score(sv, { waves: 3, ticks: 9000 }));
  assert.ok(score(sv, { waves: 3, ticks: 9000 }) > score(sv, { waves: 3, ticks: 8000 }));
  const hill = { mode: "hill" };
  assert.ok(score(hill, { points: 30, won: true, ticks: 3000 }) > score(hill, { points: 29, won: false, ticks: 5400 }));
  assert.ok(score(hill, { points: 30, won: true, ticks: 2000 }) > score(hill, { points: 30, won: true, ticks: 3000 }));
  for (const r of [classic, sv, hill]) assert.ok(Number.isInteger(score(r, { won: true, ticks: 1234, kills: 2, waves: 2, points: 7 })));
  assert.equal(resultLine(classic, { won: true, ticks: 4320, kills: 1 }), "Won · 1:12 · 1 kill");
  assert.equal(resultLine(sv, { waves: 3, ticks: 3900 }), "3 waves · 1:05");
});

test("streak counts consecutive UTC days with a finished attempt and resets after a gap", () => {
  const st = fresh();
  assert.equal(record(st, "2026-10-14", { value: 100, line: "a" }), true);
  assert.equal(st.streak, 1);
  assert.equal(record(st, "2026-10-14", { value: 50, line: "b" }), false);
  assert.equal(st.streak, 1);
  assert.equal(st.days["2026-10-14"].tries, 2);
  assert.equal(st.days["2026-10-14"].best, 100);
  record(st, "2026-10-15", { value: 10, line: "c", data: "xyz" });
  assert.equal(st.streak, 2);
  assert.equal(streakOn(st, "2026-10-15"), 2);
  assert.equal(streakOn(st, "2026-10-16"), 2);
  assert.equal(streakOn(st, "2026-10-17"), 0);
  record(st, "2026-10-18", { value: 1, line: "d" });
  assert.equal(st.streak, 1);
  assert.equal(st.days["2026-10-15"].data, undefined);
});

test("storage is sanitised and capped", () => {
  const m = mem(), st = fresh();
  record(st, "2026-10-14", { value: 5, line: "x", data: "d" });
  save(m, st);
  assert.deepEqual(load(m), st);
  m.setItem("daily", "{broken");
  assert.deepEqual(load(m), fresh());
  assert.deepEqual(sanitize({ days: { bad: { best: 1, tries: 1 }, "2026-01-01": { best: -4, tries: 1 }, "2026-01-02": { best: 7, tries: 2, line: 5 } }, streak: "x" }).days, { "2026-01-02": { best: 7, tries: 2, line: "" } });
  const big = fresh();
  for (let d = 1; d <= 40; d++) record(big, `2026-02-${String(d % 28 + 1).padStart(2, "0")}`, { value: d, line: "" });
  for (let d = 0; d < 45; d++) record(big, dayKey(Date.UTC(2026, 3, 1) + d * 86400000), { value: 1, line: "" });
  assert.ok(Object.keys(big.days).length <= 30);
});
