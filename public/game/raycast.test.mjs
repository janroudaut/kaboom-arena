import test from "node:test";
import assert from "node:assert/strict";
import { castRay, cast, texU, planeOf, project, angDiff, FACES } from "./raycast.js";

const W = 15, H = 13;
const rng = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

function arena(rand, density) {
  const g = new Array(W * H).fill(0);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || (x % 2 === 0 && y % 2 === 0)) g[y * W + x] = 1;
    else if (rand() < density) g[y * W + x] = 2;
  }
  return g;
}

function march(g, ox, oy, dx, dy) {
  const step = 1e-4;
  let px = ox, py = oy;
  for (let t = 0; t < 40; t += step) {
    const x = ox + t * dx, y = oy + t * dy, cx = Math.floor(x), cy = Math.floor(y);
    if (cx < 0 || cy < 0 || cx >= W || cy >= H || g[cy * W + cx]) return { t, cx, cy, px: Math.floor(px), py: Math.floor(py), x, y };
    px = x; py = y;
  }
  return null;
}

test("matches a brute-force marcher on random grids and angles", () => {
  const rand = rng(7), out = {};
  let n = 0;
  for (let k = 0; k < 40; k++) {
    const g = arena(rand, 0.5);
    for (let r = 0; r < 100; r++) {
      let ox, oy;
      do { ox = 1 + rand() * (W - 2); oy = 1 + rand() * (H - 2); } while (g[Math.floor(oy) * W + Math.floor(ox)]);
      const a = rand() * 2 * Math.PI, dx = Math.cos(a), dy = Math.sin(a);
      const m = march(g, ox, oy, dx, dy);
      castRay(g, W, H, ox, oy, dx, dy, out);
      assert.ok(Math.abs(out.t - m.t) < 2e-3, `t ${out.t} vs ${m.t}`);
      assert.equal(out.cell, m.cy * W + m.cx);
      assert.equal(out.tile, g[out.cell]);
      const corner = Math.abs(m.x - Math.round(m.x)) < 2e-3 && Math.abs(m.y - Math.round(m.y)) < 2e-3;
      if (!corner) {
        assert.equal(out.side, m.px !== m.cx ? 0 : 1);
        const hit = out.side === 0 ? m.y : m.x;
        assert.ok(Math.abs(out.u - (hit - Math.floor(hit))) < 2e-3);
      }
      n++;
    }
  }
  assert.equal(n, 4000);
});

test("axis-aligned rays, boundary and inside-wall origin", () => {
  const g = new Array(W * H).fill(0);
  g[5 * W + 9] = 2;
  const o = {};
  castRay(g, W, H, 3.5, 5.5, 1, 0, o);
  assert.deepEqual([o.t, o.side, o.cell, o.tile, o.u], [5.5, 0, 5 * W + 9, 2, 0.5]);
  castRay(g, W, H, 3.5, 5.5, 0, -1, o);
  assert.deepEqual([o.t, o.side, o.cell, o.tile], [5.5, 1, -1, 1]);
  castRay(g, W, H, 9.2, 5.5, 1, 0, o);
  assert.equal(o.t, 0);
  assert.equal(o.tile, 2);
});

test("perpendicular distance: a flat wall has the same z for every column (no fisheye)", () => {
  const g = new Array(W * H).fill(0);
  for (let x = 0; x < W; x++) g[x] = 1;
  const d = { x: 0, y: -1 }, pl = planeOf(d.x, d.y, 0.8, {}), o = {};
  for (const c of [-1, -0.5, 0, 0.7, 1]) {
    castRay(g, W, H, 7.5, 6.5, d.x + pl.x * c, d.y + pl.y * c, o);
    assert.ok(Math.abs(o.t - 5.5) < 1e-9, `${c}: ${o.t}`);
    assert.equal(o.side, 1);
  }
});

test("texture mirroring keeps the texture readable from every side", () => {
  assert.equal(texU(0.25, 0, 1, 0), 0.75);
  assert.equal(texU(0.25, 0, -1, 0), 0.25);
  assert.equal(texU(0.25, 1, 0, -1), 0.75);
  assert.equal(texU(0.25, 1, 0, 1), 0.25);
});

test("planeOf is on the right of the facing direction", () => {
  const r = (f) => planeOf(FACES[f][0], FACES[f][1], 1, {});
  assert.equal(r(0).x, 1);
  assert.equal(r(1).y, 1);
  assert.equal(r(2).x, -1);
  assert.equal(r(3).y, -1);
});

test("project: depth and lateral agree with the ray through the sprite", () => {
  const rand = rng(3), pl = {}, p = new Float64Array(2);
  for (let i = 0; i < 200; i++) {
    const a = rand() * 6.28, dx = Math.cos(a), dy = Math.sin(a);
    planeOf(dx, dy, 0.85, pl);
    const x = 7 + (rand() - 0.5) * 10, y = 6 + (rand() - 0.5) * 10;
    project(7, 6, dx, dy, pl.x, pl.y, x, y, p);
    const k = p[0] / p[1];
    const rx = dx + pl.x * k, ry = dy + pl.y * k;
    if (p[1] > 0.01) {
      assert.ok(Math.abs(rx * (y - 6) - ry * (x - 7)) < 1e-9, "collinear");
      assert.ok(Math.abs(7 + rx * p[1] - x) < 1e-9 && Math.abs(6 + ry * p[1] - y) < 1e-9, "depth is the ray parameter");
    }
  }
  planeOf(0, -1, 0.85, pl);
  project(7, 6, 0, -1, pl.x, pl.y, 7, 3, p);
  assert.ok(Math.abs(p[0]) < 1e-12 && Math.abs(p[1] - 3) < 1e-12);
  project(7, 6, 0, -1, pl.x, pl.y, 7, 9, p);
  assert.ok(p[1] < 0);
});

test("angDiff takes the short way round", () => {
  assert.ok(Math.abs(angDiff(0, Math.PI / 2) - Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(angDiff(0, 3 * Math.PI / 2) + Math.PI / 2) < 1e-12);
  assert.ok(Math.abs(angDiff(5 * Math.PI, 0) - Math.PI) < 1e-9 || Math.abs(angDiff(5 * Math.PI, 0) + Math.PI) < 1e-9);
});
