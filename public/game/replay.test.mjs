import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step } from "./sim.js";
import { think } from "./ai.js";
import { createRecorder, createPlayback, encode, decode, pack, unpack, linkText, fileText, fromFileText, fragmentOf, settle, stateHash, code, uncode, cleanOpts, SIM_VERSION, MAX_LINK } from "./replay.js";

const lcg = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// Mirrors main.js: bots think every 6 ticks and hold their input in between.
function liveMatch(n, seed, opts, { rounds = 2, level = "normal", theme = "grass", kind = "solo", max = 12000 } = {}) {
  const rec = createRecorder({ k: kind, n, hm: 1, nm: Array.from({ length: n }, (_, i) => `P${i + 1}`), w: rounds, lv: level, st: null, dl: null, fg: null, ts: 1700000000000, rs: "test" });
  const g = { n, scores: Array(n).fill(0), win: rounds, names: Array.from({ length: n }, (_, i) => `P${i + 1}`), over: false };
  const rand = lcg(seed), finals = [], hashes = [];
  for (let r = 0; !g.over && r < 8; r++) {
    const s = newGame(n, seed + r * 7919, opts);
    s.cfg.theme = theme;
    g.s = s;
    rec.begin(s, seed + r * 7919, opts, theme);
    const mem = [];
    for (let t = 0; t < max && !s.done; t++) {
      const inputs = {};
      for (const p of s.players) {
        if ((s.tick + p.id) % 6 === 0) mem[p.id] = think(s, p.id, rand, level);
        inputs[p.id] = { ...mem[p.id] };
        if (mem[p.id]) mem[p.id].bomb = mem[p.id].act = false;
      }
      rec.step(s, inputs);
    }
    rec.end(s);
    settle(g);
    hashes.push(stateHash(s));
    finals.push(s);
  }
  return { match: rec.finish({}), finals, hashes, g };
}

function replayAll(match) {
  const pb = createPlayback(match), hashes = [], states = [];
  for (let r = 0; r < match.r.length; r++) {
    const s = pb.make(r);
    while (!s.done) { pb.note(s); step(s, pb.inputs(s)); }
    assert.equal(s.tick, match.r[r].tk);
    pb.check(s);
    hashes.push(stateHash(s));
    states.push(s);
  }
  return { pb, hashes, states };
}

const COMBOS = [
  [2, 11, {}], [4, 12, { layout: "maze", teams: [0, 1, 0, 1] }], [4, 13, { tiles: "many", chaos: true }], [4, 14, { bombs: true, abilities: true, tiles: "few" }],
  [3, 15, { mode: "hill" }], [4, 16, { mode: "potato", powerups: false }], [2, 17, { mode: "survival" }], [4, 18, { chaos: true, bombs: true, abilities: ["blink", "dash", "veil", "sweep"], mode: "hill" }],
  [1, 19, { mode: "survival", tiles: "many" }],
];

test("replay re-simulates every recorded match to the same state hash", () => {
  for (const [n, seed, opts] of COMBOS) {
    const live = liveMatch(n, seed, opts, { rounds: 2, level: n % 2 ? "hard" : "easy" });
    const back = decode(encode(live.match));
    assert.ok(back.match, `decode ${JSON.stringify(opts)}`);
    const { pb, hashes } = replayAll(back.match);
    assert.deepEqual(hashes, live.hashes, JSON.stringify(opts));
    assert.equal(pb.drift, false);
    assert.deepEqual(pb.scoresBefore(back.match.r.length), live.g.scores);
  }
});

test("a replay of the same match is deterministic in full state, not just the hash", () => {
  const live = liveMatch(4, 21, { tiles: "many", chaos: true, bombs: true });
  const { states } = replayAll(decode(encode(live.match)).match);
  assert.deepEqual(JSON.parse(JSON.stringify(states.at(-1))), JSON.parse(JSON.stringify(live.finals.at(-1))));
});

test("seeking to tick T equals playing straight to T", () => {
  const live = liveMatch(4, 31, { tiles: "few", chaos: true, mode: "classic" }, { rounds: 2 });
  const pb = createPlayback(decode(encode(live.match)).match);
  for (const T of [0, 1, 299, 300, 301, 1234, Math.floor(pb.total / 2), pb.total - 1, 5]) {
    const { r, s } = pb.seek(T);
    const ref = pb.make(r);
    while (ref.tick < T - pb.off[r]) step(ref, pb.inputs(ref));
    assert.equal(stateHash(s), stateHash(ref), `T=${T}`);
    assert.deepEqual(JSON.parse(JSON.stringify(s)), JSON.parse(JSON.stringify(ref)), `T=${T}`);
  }
});

test("input codes round-trip", () => {
  for (let c = 0; c < 36; c++) assert.equal(code(uncode(c)), c);
  assert.equal(code(undefined), 0);
  assert.equal(code({ dx: 0, dy: 0 }), 0);
  assert.equal(code({}), 0);
});

test("dead players are stored as idle and survival revivals keep their input", () => {
  const live = liveMatch(1, 41, { mode: "survival" }, { rounds: 1 });
  const { states } = replayAll(live.match);
  assert.equal(stateHash(states[0]), live.hashes[0]);
});

test("old sim version is refused, garbage never throws", () => {
  const live = liveMatch(2, 51, {}, { rounds: 1 });
  const bytes = encode({ ...live.match, v: SIM_VERSION + 1 });
  assert.deepEqual(decode(bytes), { error: "version" });
  const good = encode(live.match);
  assert.ok(decode(good).match);
  const rnd = lcg(5);
  for (let k = 0; k < 600; k++) {
    const b = Uint8Array.from(good);
    const flips = 1 + Math.floor(rnd() * 6);
    for (let f = 0; f < flips; f++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
    const r = decode(k % 5 === 0 ? b.subarray(0, Math.floor(rnd() * b.length)) : b);
    assert.ok(r.match || r.error);
    if (r.match) {
      const pb = createPlayback(r.match);
      for (let q = 0; q < r.match.r.length; q++) { const s = pb.make(q); for (let k = 0; k < 400 && !s.done; k++) step(s, pb.inputs(s)); }
    }
  }
  for (const junk of [new Uint8Array(0), new Uint8Array(5000).fill(255), Uint8Array.from([0x4b, 0x42, 1, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), Uint8Array.from(Array.from({ length: 300 }, (_, i) => (i * 37) & 255)), "str", null, {}]) {
    assert.ok(decode(junk).error);
  }
});

test("hostile headers are rejected or sanitised", () => {
  const live = liveMatch(2, 52, {}, { rounds: 1 });
  const m = live.match;
  const bad = [
    { ...m, n: 99 }, { ...m, n: 0 }, { ...m, k: "x" }, { ...m, r: [] }, { ...m, r: Array(500).fill(m.r[0]) },
    { ...m, r: [{ ...m.r[0], th: "__proto__" }] }, { ...m, r: [{ ...m.r[0], tk: 1e9 }] }, { ...m, r: [{ ...m.r[0], sd: -1 }] },
    { ...m, st: { id: "nobody", i: 0 } }, { ...m, st: { id: "mama", i: 99 } }, { ...m, w: 99 }, { ...m, r: [{ ...m.r[0], kl: [99] }] },
  ];
  for (const b of bad) assert.ok(decode(encode(b)).error, JSON.stringify(b).slice(0, 80));
  const odd = decode(encode({ ...m, nm: ["<img src=x onerror=alert(1)>\u0000evil name too long", 5, null], rs: "<b>\u0007x</b>", r: [{ ...m.r[0], o: { layout: "nope", softDensity: 7, teams: [1, 1, 1, 1], abilities: ["x"], mode: "bad", evil: 1 } }] })).match;
  assert.ok(odd);
  assert.deepEqual(odd.r[0].o, {});
  assert.ok(odd.nm.every((x) => x.length <= 12 && !/\p{C}/u.test(x)));
  assert.equal(odd.rs.includes("\u0007"), false);
  assert.deepEqual(cleanOpts({ teams: [0, 1, 0, 1], layout: "maze", abilities: false }), { teams: [0, 1, 0, 1], layout: "maze" });
});

test("run totals must match the tick count exactly", () => {
  const live = liveMatch(2, 53, {}, { rounds: 1 });
  const m = structuredClone(live.match);
  m.r[0].runs[0][0] += 36;
  assert.ok(decode(encode(m)).error);
});

test("links and files round-trip, oversize matches are trimmed or refused", async () => {
  const live = liveMatch(4, 61, { layout: "maze" }, { rounds: 2 });
  const one = await linkText({ ...live.match, r: live.match.r.slice(0, 1) });
  assert.ok(one && one.text.length <= MAX_LINK && !one.trimmed);
  const back = await unpack(one.text);
  assert.deepEqual(replayAll(back.match).hashes, live.hashes.slice(0, 1));
  const text = await fileText(live.match);
  assert.deepEqual(replayAll((await fromFileText(text)).match).hashes, live.hashes);
  assert.equal(fragmentOf("#r=abc"), "abc");
  assert.equal(fragmentOf("#x=abc"), null);
  for (const t of ["", "1", "0!!", "1AAAA", "2abcd", "0" + "A".repeat(200000), "1" + "A".repeat(100)]) assert.ok((await unpack(t)).error);
  assert.ok((await fromFileText("{not json")).error);
  assert.ok((await fromFileText(JSON.stringify({ replay: 5 }))).error);
  // a deflate bomb (tiny input, huge output) is cut at the output cap
  const { CompressionStream: CS } = globalThis;
  const z = await new Response(new Blob([new Uint8Array(50e6)]).stream().pipeThrough(new CS("deflate-raw"))).arrayBuffer();
  const t = Buffer.from(z).toString("base64url");
  assert.ok(t.length < 100000);
  assert.ok((await unpack("1" + t)).error);
});

test("a long match that does not fit a link falls back to its last round or to a file", async () => {
  const big = { k: "solo", n: 4, hm: 1, nm: ["a", "b", "c", "d"], w: 2, lv: "hard", st: null, dl: null, fg: null, ts: 1, rs: "", v: SIM_VERSION, r: [] };
  const rnd = lcg(9);
  const mk = (runs) => ({ sd: 1, th: "grass", o: {}, tk: runs * 2, wn: 0, wt: -1, h: 0, runs: Array.from({ length: 4 }, () => Array.from({ length: runs }, () => 1 + Math.floor(rnd() * 35) + 36)) });
  big.r = [mk(3000), mk(100)];
  const r = await linkText(big);
  assert.equal(r.trimmed, true);
  big.r = [mk(100), mk(3000)];
  assert.equal(await linkText(big), null);
});

test("the stored list is capped and sanitised", async () => {
  const { loadList, addEntry, saveList, KEEP, titleOf, rulesOf } = await import("./replay.js");
  let list = [];
  for (let i = 0; i < 15; i++) list = addEntry(list, { id: `id${i}`, ts: i, title: "t", res: "r", data: "x".repeat(10) });
  assert.equal(list.length, KEEP);
  assert.equal(list[0].id, "id14");
  list = addEntry(list, { id: "id14", ts: 99, title: "again", res: "", data: "y" });
  assert.equal(list.length, KEEP);
  assert.equal(list[0].title, "again");
  list = addEntry([], { id: "a", ts: 1, title: "", res: "", data: "z".repeat(300000) });
  list = addEntry(list, { id: "b", ts: 2, title: "", res: "", data: "z".repeat(300000) });
  assert.deepEqual(list.map((e) => e.id), ["b"]);
  const mem = {};
  const store = { getItem: (k) => mem[k] ?? null, setItem: (k, v) => (mem[k] = v) };
  assert.ok(saveList(store, [{ id: "q", ts: 5, title: "T".repeat(500), res: "", data: "abc" }]));
  assert.equal(loadList(store)[0].title.length, 60);
  mem.replays = JSON.stringify([{ id: 5 }, null, { id: "z", data: "d", ts: "no" }, "x"]);
  assert.deepEqual(loadList(store), []);
  mem.replays = "{nope";
  assert.deepEqual(loadList(store), []);
  const live = liveMatch(4, 71, { layout: "maze", tiles: "few" }, { rounds: 1 });
  assert.match(titleOf(live.match), /^Solo · Classic vs 3 bots$/);
  assert.match(rulesOf({ layout: "maze", tiles: "few", chaos: true }), /maze arena · floor tiles · chaos/);
});
