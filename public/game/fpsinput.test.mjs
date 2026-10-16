import test from "node:test";
import assert from "node:assert/strict";
import { createFps, padStrafe, REPEAT_DELAY, REPEAT_EVERY } from "./fpsinput.js";

const inp = (dx, dy) => ({ dx, dy, bomb: false });
const run = (f, dx, dy, n, t0 = 1) => { const o = []; for (let i = 0; i < n; i++) o.push({ ...f.map(inp(dx, dy), t0 + i) }); return o; };

test("forward / back follow the facing axis for all four facings", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 0);
  const fwd = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  for (let face = 0; face < 4; face++) {
    f.face = face;
    assert.deepEqual(f.map(inp(0, -1), 2), { dx: fwd[face][0], dy: fwd[face][1], bomb: false });
    assert.deepEqual(f.map(inp(0, 1), 2), { dx: -fwd[face][0] || 0, dy: -fwd[face][1] || 0, bomb: false });
  }
});

test("no -0 and the bomb flag is untouched", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 1);
  const o = f.map({ dx: 0, dy: 1, bomb: true }, 2);
  assert.ok(Object.is(o.dy, 0) && o.dx === -1 && o.bomb === true);
});

test("a tap turns exactly once and never moves", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 1);
  const o = run(f, 1, 0, 5, 2);
  assert.equal(f.face, 2);
  assert.ok(o.every((x) => x.dx === 0 && x.dy === 0));
  run(f, 0, 0, 3, 8);
  run(f, -1, 0, 1, 11);
  assert.equal(f.face, 1);
});

test("holding repeats after the delay, then every REPEAT_EVERY steps", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 0);
  const faces = [];
  for (let i = 0; i < REPEAT_DELAY + 2 * REPEAT_EVERY + 1; i++) { f.map(inp(1, 0), 2 + i); faces.push(f.face); }
  assert.equal(faces[0], 1);
  assert.equal(faces[REPEAT_DELAY - 1], 1);
  assert.equal(faces[REPEAT_DELAY], 2);
  assert.equal(faces[REPEAT_DELAY + REPEAT_EVERY - 1], 2);
  assert.equal(faces[REPEAT_DELAY + REPEAT_EVERY], 3);
  assert.equal(faces[REPEAT_DELAY + 2 * REPEAT_EVERY], 0);
});

test("releasing resets the repeat timer", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 0);
  run(f, 1, 0, REPEAT_DELAY - 2, 2);
  run(f, 0, 0, 1, 40);
  run(f, 1, 0, REPEAT_DELAY - 1, 41);
  assert.equal(f.face, 2);
});

test("direct left-to-right switch turns immediately (simultaneous keys resolve to the newest)", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 0);
  f.map(inp(-1, 0), 2);
  assert.equal(f.face, 3);
  f.map(inp(1, 0), 3);
  assert.equal(f.face, 0);
});

test("diagonal (d-pad up+right) turns then walks along the new facing", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 0);
  const o = f.map(inp(1, -1), 2);
  assert.equal(f.face, 1);
  assert.deepEqual([o.dx, o.dy], [1, 0]);
  const b = f.map(inp(1, 1), 3);
  assert.deepEqual([b.dx, b.dy], [-1, 0]);
});

test("back-walking keeps the facing", () => {
  const f = createFps();
  f.map(inp(0, 0), 1, 2);
  const o = run(f, 0, 1, 30, 2);
  assert.equal(f.face, 2);
  assert.ok(o.every((x) => x.dx === 0 && x.dy === -1));
});

test("tick going backwards (new round) or reset() restores the spawn facing", () => {
  const f = createFps();
  f.map(inp(0, 0), 100, 1);
  f.map(inp(1, 0), 101, 1);
  assert.equal(f.face, 2);
  f.map(inp(0, 0), 0, 3);
  assert.equal(f.face, 3);
  f.reset();
  f.map(inp(0, 0), 5, 0);
  assert.equal(f.face, 0);
});

test("strafe: shoulders move sideways relative to the facing, forward wins", () => {
  const f = createFps();
  const pad = { connected: true, buttons: [] };
  f.pads = () => [pad];
  f.map(inp(0, 0), 1, 1);
  pad.buttons[5] = { pressed: true };
  f.face = 1;
  let o = f.map(inp(0, 0), 2);
  assert.deepEqual([o.dx, o.dy], [0, 1]);
  pad.buttons[5] = { pressed: false };
  pad.buttons[4] = { pressed: true };
  o = f.map(inp(0, 0), 3);
  assert.deepEqual([o.dx, o.dy], [0, -1]);
  o = f.map(inp(0, -1), 4);
  assert.deepEqual([o.dx, o.dy], [1, 0]);
  assert.equal(padStrafe([{ connected: false, buttons: [{}, {}, {}, {}, { pressed: true }] }]), 0);
});

test("strafe keys: the latest held wins, release falls back", () => {
  const ls = {};
  const target = { addEventListener: (n, fn) => (ls[n] = fn) };
  const f = createFps();
  f.bind(target);
  f.pads = null;
  f.map(inp(0, 0), 1, 0);
  ls.keydown({ code: "Period", target: {} });
  assert.equal(f.map(inp(0, 0), 2).dx, 1);
  ls.keydown({ code: "Comma", target: {} });
  assert.equal(f.map(inp(0, 0), 3).dx, -1);
  ls.keyup({ code: "Comma" });
  assert.equal(f.map(inp(0, 0), 4).dx, 1);
  ls.blur();
  assert.equal(f.map(inp(0, 0), 5).dx, 0);
  ls.keydown({ code: "Comma", target: { tagName: "INPUT" } });
  assert.equal(f.map(inp(0, 0), 6).dx, 0);
});
