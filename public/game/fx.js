import { W, H, T } from "./sim.js";

// Pure and allocation-free: derives render events by diffing successive game states (solo, host or guest alike).
// on(kind, a, b, c): "reset"; "die" (id); "bomb" (x, y); "wall" (x, y); "pick" (x, y, type).
export function createObserver() {
  const N = W * H;
  const grid = new Uint8Array(N), occ = new Uint8Array(N), item = new Int8Array(N), cur = new Uint8Array(N);
  const alive = [];
  let tick = -1;

  return function observe(s, on) {
    const n = s.players.length;
    const fresh = tick < 0 || s.tick + 30 < tick || n !== alive.length;
    if (fresh && tick >= 0) on("reset");
    cur.fill(0);
    for (const it of s.items) cur[it.y * W + it.x] = 1;
    if (!fresh) {
      for (let i = 0; i < N; i++) if (grid[i] === 2 && s.grid[i] === 0) on("wall", i % W, (i / W) | 0);
      for (const b of s.bombs) if (!(b.dx || b.dy) && !occ[b.y * W + b.x]) on("bomb", b.x, b.y);
      for (let i = 0; i < n; i++) if (alive[i] && !s.players[i].alive) on("die", i);
      for (let i = 0; i < N; i++) {
        if (!item[i] || cur[i]) continue;
        const x = i % W, y = (i / W) | 0;
        const who = s.players.some((p, k) => (alive[k] || p.alive) && Math.floor(p.x / T) === x && Math.floor(p.y / T) === y);
        if (who) on("pick", x, y, item[i] - 1);
      }
    }
    tick = s.tick;
    for (let i = 0; i < N; i++) grid[i] = s.grid[i];
    occ.fill(0);
    for (const b of s.bombs) occ[b.y * W + b.x] = 1;
    item.fill(0);
    for (const it of s.items) item[it.y * W + it.x] = it.type + 1;
    for (let i = 0; i < n; i++) alive[i] = s.players[i].alive;
  };
}
