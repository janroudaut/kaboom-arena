import { W, H, T, SUDDEN } from "./sim.js";

export const CW = W * T, CH = H * T + 16;
export const NAMES = ["White", "Black", "Red", "Blue"];
const SUIT = ["#f2f2f2", "#454556", "#e8453c", "#3c7be8"];
const SUIT_DARK = ["#b8b8c4", "#262633", "#a32a24", "#2452a8"];
const TOP = 16;

function sprite(w, h, fn) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  fn(cv.getContext("2d"));
  return cv;
}

function disc(c, x, y, r, col) {
  c.fillStyle = col;
  c.beginPath();
  c.arc(x, y, r, 0, 7);
  c.fill();
}

const grass = [0, 1].map((k) => sprite(T, T, (c) => {
  c.fillStyle = k ? "#3f9348" : "#47a050";
  c.fillRect(0, 0, T, T);
  c.fillStyle = k ? "#4aa254" : "#53ad5c";
  for (const [x, y] of [[3, 4], [10, 2], [6, 11], [12, 9]]) c.fillRect(x + k * 2, y, 2, 1);
}));

const hard = sprite(T, T, (c) => {
  c.fillStyle = "#6c6c80"; c.fillRect(0, 0, T, T);
  c.fillStyle = "#9a9ab0"; c.fillRect(0, 0, T, 2); c.fillRect(0, 0, 2, T);
  c.fillStyle = "#43435a"; c.fillRect(0, T - 2, T, 2); c.fillRect(T - 2, 0, 2, T);
  c.fillStyle = "#82829a"; c.fillRect(3, 3, T - 6, T - 6);
  c.fillStyle = "#a8a8be"; c.fillRect(3, 3, T - 6, 1); c.fillRect(3, 3, 1, T - 6);
  c.fillStyle = "#5a5a70"; c.fillRect(3, T - 4, T - 6, 1); c.fillRect(T - 4, 3, 1, T - 6);
  for (const [x, y] of [[4, 4], [T - 6, 4], [4, T - 6], [T - 6, T - 6]]) { c.fillStyle = "#54546a"; c.fillRect(x, y, 2, 2); }
});

const soft = sprite(T, T, (c) => {
  c.fillStyle = "#7a4220"; c.fillRect(0, 0, T, T);
  const rows = [[0, 0], [5, 8], [10, 0], [15, 8]];
  c.fillStyle = "#c27a3e";
  for (let y = 0; y < T; y += 5) {
    const off = (y / 5) % 2 ? 4 : 0;
    for (let x = -off; x < T; x += 8) c.fillRect(Math.max(x, 0) + 1, y + 1, Math.min(7, T - x - 1), 4);
  }
  c.fillStyle = "#e0a066";
  for (let y = 0; y < T; y += 5) {
    const off = (y / 5) % 2 ? 4 : 0;
    for (let x = -off; x < T; x += 8) c.fillRect(Math.max(x, 0) + 1, y + 1, Math.min(7, T - x - 1), 1);
  }
  rows.length = 0;
  c.fillStyle = "#0003"; c.fillRect(0, T - 1, T, 1); c.fillRect(T - 1, 0, 1, T);
});

const shadow = sprite(T, T, (c) => { c.fillStyle = "#0004"; c.fillRect(0, 0, T, 4); });

function poly(c, pts, col) {
  c.fillStyle = col;
  c.beginPath();
  pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
  c.fill();
}

export const ICONS = [
  ["#3a8be8", (c) => {
    disc(c, 6, 8, 4.5, "#111");
    disc(c, 4.8, 6.8, 1, "#fff9");
    c.fillStyle = "#ffd23c"; c.fillRect(8, 2, 2, 2);
    c.fillStyle = "#fff"; c.fillRect(9, 5, 4, 1); c.fillRect(10.5, 3.5, 1, 4);
  }],
  ["#e8453c", (c) => {
    poly(c, [[7, 1], [11, 7], [10, 11], [7, 13], [4, 11], [3, 7], [5, 5]], "#ffb02a");
    poly(c, [[7, 5], [9.5, 9], [8.5, 11.5], [7, 12], [5.5, 11.5], [4.8, 9]], "#fff0a0");
  }],
  ["#2fa84f", (c) => {
    poly(c, [[8.5, 1], [3, 8], [6.5, 8], [5, 13], [11, 5.5], [7.5, 5.5]], "#ffe14a");
  }],
].map(([bg, fn]) => sprite(14, 14, (c) => {
  c.fillStyle = "#fff"; c.fillRect(1, 0, 12, 14); c.fillRect(0, 1, 14, 12);
  c.fillStyle = bg; c.fillRect(1, 1, 12, 12);
  c.fillStyle = "#fff3"; c.fillRect(1, 1, 12, 2);
  c.translate(0, 0);
  fn(c);
}));

function bomb(c, b) {
  const x = b.x * T + 8, y = b.y * T + TOP + 9;
  const r = 5.5 + Math.sin(b.t / 5) * (b.t < 40 ? 1.4 : 0.7);
  c.fillStyle = "#0004"; c.fillRect(x - 5, y + 4, 10, 3);
  disc(c, x, y, r, "#14141c");
  disc(c, x - 1.5, y - 1.5, r - 2, "#2a2a38");
  disc(c, x - 2.5, y - 2.5, 1.6, "#ffffff90");
  c.fillStyle = "#b5703a"; c.fillRect(x + 2, y - r - 1, 2, 3);
  c.fillStyle = b.t % 8 < 4 ? "#ffd23c" : "#ff7a2a";
  c.fillRect(x + 2, y - r - 3, 3, 3);
  c.fillStyle = "#fff"; c.fillRect(x + 3, y - r - 2, 1, 1);
}

function flames(c, fs) {
  const at = new Map(fs.map((f) => [f.y * W + f.x, f]));
  for (const f of fs) {
    const k = Math.min(1, f.t / 8), px = f.x * T, py = f.y * T + TOP;
    const has = (dx, dy) => at.has((f.y + dy) * W + f.x + dx);
    const inset = Math.round(3 * (1 - k)) + 1;
    const layer = (col, g) => {
      c.fillStyle = col;
      const x0 = px + inset + g, x1 = px + T - inset - g, y0 = py + inset + g, y1 = py + T - inset - g;
      c.fillRect(x0, y0, x1 - x0, y1 - y0);
      if (has(0, -1)) c.fillRect(x0, py, x1 - x0, y0 - py);
      if (has(0, 1)) c.fillRect(x0, y1, x1 - x0, py + T - y1);
      if (has(-1, 0)) c.fillRect(px, y0, x0 - px, y1 - y0);
      if (has(1, 0)) c.fillRect(x1, y0, px + T - x1, y1 - y0);
    };
    layer("#e8453c", 0);
    layer("#ff9a2a", 1);
    layer("#ffe066", 3);
    if (f.t > 20) layer("#fff8d0", 5);
  }
}

function player(c, p, v) {
  const step = p.walk % 14 < 7 ? 1 : -1;
  const moving = p.walk !== p.lastWalk;
  p.lastWalk = p.walk;
  const x = Math.round(v.x), y = Math.round(v.y) + TOP;
  const bob = moving && step > 0 ? 1 : 0;
  c.fillStyle = "#0005"; c.fillRect(x - 6, y + 5, 12, 3);
  const lf = moving ? step : 0;
  c.fillStyle = "#222"; c.fillRect(x - 5, y + 4 + (lf > 0 ? 0 : 1), 4, 3); c.fillRect(x + 1, y + 4 + (lf > 0 ? 1 : 0), 4, 3);
  c.fillStyle = SUIT[p.id]; c.fillRect(x - 5, y - 1 - bob, 10, 6);
  c.fillStyle = SUIT_DARK[p.id]; c.fillRect(x - 5, y + 3 - bob, 10, 2);
  c.fillStyle = "#ffd9b0"; c.fillRect(x - 6, y + (moving ? step : 0) - bob, 2, 3); c.fillRect(x + 4, y + (moving ? -step : 0) - bob, 2, 3);
  disc(c, x, y - 5 - bob, 6.5, SUIT[p.id]);
  c.fillStyle = SUIT_DARK[p.id]; c.fillRect(x - 6, y - 4 - bob, 12, 1);
  if (p.face !== 0) {
    c.fillStyle = "#ffd9b0"; c.fillRect(x - 4 + (p.face === 3 ? -1 : p.face === 1 ? 1 : 0), y - 8 - bob, 8, 6);
    c.fillStyle = "#111";
    const ex = p.face === 3 ? -2 : p.face === 1 ? 2 : 0;
    c.fillRect(x - 3 + ex, y - 6 - bob, 2, 3); c.fillRect(x + 1 + ex, y - 6 - bob, 2, 3);
  } else {
    c.fillStyle = SUIT_DARK[p.id]; c.fillRect(x - 4, y - 8 - bob, 8, 5);
  }
  c.fillStyle = "#e8453c"; c.fillRect(x - 1, y - 13 - bob, 3, 3);
  c.fillStyle = "#fff"; c.fillRect(x, y - 12 - bob, 1, 1);
}

function isBlock(g, x, y) { return x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] !== 0; }

export function draw(c, g) {
  const s = g.s;
  c.fillStyle = "#17171f";
  c.fillRect(0, 0, CW, CH);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = s.grid[y * W + x], px = x * T, py = y * T + TOP;
      if (t === 1) c.drawImage(hard, px, py);
      else if (t === 2) c.drawImage(soft, px, py);
      else {
        c.drawImage(grass[(x + y) & 1], px, py);
        if (isBlock(s.grid, x, y - 1)) c.drawImage(shadow, px, py);
      }
    }
  }

  for (const it of s.items) {
    const bobY = Math.round(Math.sin((s.tick + it.x * 7) / 8));
    const x = it.x * T + 1, y = it.y * T + TOP + 1 + bobY;
    c.fillStyle = "#0004"; c.fillRect(x + 2, it.y * T + TOP + 14, 10, 2);
    c.drawImage(ICONS[it.type], x, y);
  }

  for (const b of s.bombs) bomb(c, b);
  flames(c, s.flames);

  for (const p of [...s.players].filter((q) => q.alive).sort((a, b) => a.y - b.y)) {
    player(c, p, p);
  }

  c.fillStyle = "#0e0e16"; c.fillRect(0, 0, CW, TOP);
  c.fillStyle = "#2a2a3a"; c.fillRect(0, TOP - 1, CW, 1);
  c.font = "bold 8px monospace"; c.textAlign = "left";
  s.players.forEach((p, i) => {
    const x = 6 + i * 58;
    disc(c, x + 4, 8, 4.5, p.alive ? SUIT[i] : "#444");
    if (!p.alive) { c.fillStyle = "#e8453c"; c.fillRect(x + 1, 7, 6, 2); }
    c.fillStyle = i === g.me ? "#ffd23c" : "#fff";
    c.fillText(`${g.names ? g.names[i].slice(0, 6) + " " : ""}${g.scores[i]}`, x + 11, 11);
  });

  if (g.me >= 0 && !s.done && s.players[g.me]?.alive === false && !g.banner) {
    c.font = "bold 8px monospace"; c.textAlign = "center";
    c.fillStyle = "#000b"; c.fillRect(CW / 2 - 66, TOP + 4, 132, 12);
    c.fillStyle = "#fff"; c.fillText("You're out – spectating", CW / 2, TOP + 13);
    c.textAlign = "left";
  }

  if (s.tick >= SUDDEN - 300) {
    c.fillStyle = s.tick % 40 < 20 ? "#e8453c" : "#ffd23c";
    c.textAlign = "right";
    c.fillText(s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON", CW - 6, 11);
  }

  if (g.banner) {
    c.fillStyle = "#000b"; c.fillRect(0, CH / 2 - 16, CW, 32);
    c.fillStyle = "#ffd23c"; c.fillRect(0, CH / 2 - 16, CW, 1); c.fillRect(0, CH / 2 + 15, CW, 1);
    c.fillStyle = "#fff"; c.font = "bold 10px monospace"; c.textAlign = "center";
    c.fillText(g.banner, CW / 2, CH / 2 + 4);
  }
}
