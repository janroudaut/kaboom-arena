// Pure grid raycasting for the first-person view ("Bomber Shooter"). Units are tiles; the ray is origin + t * dir
// (dir need not be unit: with dir = camera dir + plane * k, t is the perpendicular distance, so no fisheye).

export const FACES = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// Ray register file (Float64Array: stores into object double fields allocate in V8, typed arrays do not).
export const OX = 0, OY = 1, DX = 2, DY = 3, T = 4, SIDE = 5, CELL = 6, TILE = 7, U = 8;
export const newRay = () => new Float64Array(9);

// DDA from (r[OX], r[OY]) along (r[DX], r[DY]) through a gw x gh grid; anything outside or non-zero is a wall.
// Results: r[T] ray parameter, r[SIDE] 0 = x face (E/W) / 1 = y face (N/S), r[CELL] index (-1 outside), r[TILE], r[U] texture column 0..1 (not mirrored).
export function cast(grid, gw, gh, r) {
  const ox = r[OX], oy = r[OY], dx = r[DX], dy = r[DY];
  let mx = Math.floor(ox) | 0, my = Math.floor(oy) | 0;
  const ddx = Math.abs(1 / dx), ddy = Math.abs(1 / dy); // 1 / 0 = Infinity on purpose (a literal Infinity makes V8 box every loop value)
  const sx = dx < 0 ? -1 : 1, sy = dy < 0 ? -1 : 1;
  let nx = dx < 0 ? (ox - mx) * ddx : (mx + 1 - ox) * ddx;
  let ny = dy < 0 ? (oy - my) * ddy : (my + 1 - oy) * ddy;
  let side = 0, t = 0, tile = 0, cell = -1;
  for (let i = 0, n = gw + gh + 4; i <= n; i++) {
    if (mx < 0 || my < 0 || mx >= gw || my >= gh) { tile = 1; cell = -1; break; }
    cell = my * gw + mx;
    tile = grid[cell];
    if (tile) break;
    if (nx < ny) { t = nx; nx += ddx; mx += sx; side = 0; }
    else { t = ny; ny += ddy; my += sy; side = 1; }
  }
  const hit = side === 0 ? oy + t * dy : ox + t * dx;
  r[T] = t; r[SIDE] = side; r[CELL] = cell; r[TILE] = tile;
  r[U] = hit - Math.floor(hit);
}

const RAY = newRay();
// Convenience wrapper with an object result (tests, one-off casts).
export function castRay(grid, gw, gh, ox, oy, dx, dy, out) {
  RAY[OX] = ox; RAY[OY] = oy; RAY[DX] = dx; RAY[DY] = dy;
  cast(grid, gw, gh, RAY);
  out.t = RAY[T]; out.side = RAY[SIDE]; out.cell = RAY[CELL]; out.tile = RAY[TILE]; out.u = RAY[U];
  return out;
}

// Texture column as seen from the ray (mirrored on the faces that would otherwise read backwards).
export const texU = (u, side, dx, dy) => ((side === 0 ? dx > 0 : dy < 0) ? 1 - u : u);

// Camera plane for a unit dir and half-width p (right-hand side of dir).
export const planeOf = (dx, dy, p, out) => { out.x = -dy * p; out.y = dx * p; return out; };

// Billboard transform into out = Float64Array(2): [0] lateral (screen x = W/2 * (1 + tx / ty)), [1] depth (same units as cast's t).
export function project(cx, cy, dx, dy, px, py, x, y, out) {
  const inv = 1 / (px * dy - dx * py), sx = x - cx, sy = y - cy;
  out[0] = inv * (dy * sx - dx * sy);
  out[1] = inv * (-py * sx + px * sy);
  return out;
}

// Smallest signed angle from a to b.
export const angDiff = (a, b) => { let d = (b - a) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; else if (d < -Math.PI) d += 2 * Math.PI; return d; };
