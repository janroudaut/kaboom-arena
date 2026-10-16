import test from "node:test";
import assert from "node:assert/strict";
import { newGame, step } from "./sim.js";
import { think } from "./ai.js";

function canon(v) {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().filter((k) => v[k] !== undefined).map((k) => `${k}:${canon(v[k])}`).join(",")}}`;
  return String(v);
}

function hash(v) {
  let h = 0x811c9dc5;
  for (const c of canon(v)) h = Math.imul(h ^ c.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
}

const lcg = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const SCENARIOS = [
  [2, 1, {}], [3, 2, {}], [4, 3, {}], [4, 4, { layout: "maze", teams: [0, 1, 0, 1] }], [4, 5, { tiles: "many", chaos: true }],
  [4, 6, { mode: "hill" }], [4, 7, { mode: "potato" }], [2, 8, { mode: "survival" }], [4, 9, { layout: "cross", powerups: false }], [4, 10, { tiles: "few" }],
];

// Human-like random inputs for player 0, AI for the others when bots is set.
function play(n, seed, opts, ticks, bots) {
  const s = newGame(n, seed, opts), r = lcg(seed), ar = lcg(seed + 77), trail = [];
  let dir = [0, 0];
  const mem = [];
  for (let t = 0; t < ticks && !s.done; t++) {
    const inputs = {};
    for (const p of s.players) {
      if (p.id === 0 && !bots) {
        if (t % 20 === 0) { const k = Math.floor(r() * 5); dir = k === 4 ? [0, 0] : [[0, -1], [1, 0], [0, 1], [-1, 0]][k]; }
        inputs[0] = { dx: dir[0], dy: dir[1], bomb: r() < 0.03 };
      } else if (bots || p.id !== 0) {
        if ((t + p.id) % 6 === 0) mem[p.id] = think(s, p.id, ar, "normal");
        inputs[p.id] = { ...mem[p.id] };
        if (mem[p.id]) mem[p.id].bomb = false;
      }
    }
    step(s, inputs);
    if (t % 250 === 0) trail.push(hash(s));
  }
  return [hash(s), s.tick, trail.join("")];
}

// Captured from the sim before the opt-in extras (bombs, abilities) existed: never regenerate. Any new field on state, players, bombs or cfg
// when the options are off, or any extra roll()/rand() draw, changes these values.
const GOLDEN = [
  "a1b806cf", "7cf12f69", "6001598b", "df50878c", "ea397d2f", "87d9ea72", "3472fa5d", "5be76b56", "cd485af4", "f79b4d3e",
  "b2cf54e4", "5e9a2940", "cd6c2a", "d8f4a876", "bd966b01", "9b96e858", "4097ea6c", "941bbfd2", "1f318254", "9414ded8",
];

test("classic sim and bots reproduce the pre-extras games bit for bit", () => {
  const got = [];
  for (const [n, seed, opts] of SCENARIOS) for (const bots of [false, true]) { const [h, , trail] = play(n, seed, opts, 3000, bots); got.push(hash(h + trail)); }
  assert.deepEqual(got, GOLDEN);
});
