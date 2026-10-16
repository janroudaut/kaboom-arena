import { W, H, T, SUDDEN } from "./sim.js";
import { themeOf, teamInfo, teamsOf, curseText, hudEntries, bombPos } from "./look.js";

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

const cache = {};
function sprites(th) {
  return (cache[th.key] ??= {
    ground: [0, 1].map((k) => sprite(T, T, (c) => {
      c.fillStyle = th.ground[k];
      c.fillRect(0, 0, T, T);
      c.fillStyle = th.speck[k];
      for (const [x, y] of [[3, 4], [10, 2], [6, 11], [12, 9]]) c.fillRect(x + k * 2, y, 2, 1);
    })),
    hard: sprite(T, T, (c) => {
      const [base, hi, lo, face, fhi, flo, stud] = th.hard;
      c.fillStyle = base; c.fillRect(0, 0, T, T);
      c.fillStyle = hi; c.fillRect(0, 0, T, 2); c.fillRect(0, 0, 2, T);
      c.fillStyle = lo; c.fillRect(0, T - 2, T, 2); c.fillRect(T - 2, 0, 2, T);
      c.fillStyle = face; c.fillRect(3, 3, T - 6, T - 6);
      c.fillStyle = fhi; c.fillRect(3, 3, T - 6, 1); c.fillRect(3, 3, 1, T - 6);
      c.fillStyle = flo; c.fillRect(3, T - 4, T - 6, 1); c.fillRect(T - 4, 3, 1, T - 6);
      c.fillStyle = stud;
      for (const [x, y] of [[4, 4], [T - 6, 4], [4, T - 6], [T - 6, T - 6]]) c.fillRect(x, y, 2, 2);
    }),
    soft: sprite(T, T, (c) => {
      const [base, brick, hi] = th.soft;
      c.fillStyle = base; c.fillRect(0, 0, T, T);
      for (const [col, h] of [[brick, 4], [hi, 1]]) {
        c.fillStyle = col;
        for (let y = 0; y < T; y += 5) {
          const off = (y / 5) % 2 ? 4 : 0;
          for (let x = -off; x < T; x += 8) c.fillRect(Math.max(x, 0) + 1, y + 1, Math.min(7, T - x - 1), h);
        }
      }
      c.fillStyle = "#0003"; c.fillRect(0, T - 1, T, 1); c.fillRect(T - 1, 0, 1, T);
    }),
  });
}

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
  ["#e08a1e", (c) => {
    c.fillStyle = "#fff"; c.fillRect(6, 2, 4, 6); c.fillRect(6, 7, 6, 3);
    c.fillStyle = "#c9c9d6"; c.fillRect(11, 8, 1, 2);
    c.fillStyle = "#3a2410"; c.fillRect(6, 10, 7, 2);
    c.fillStyle = "#fff"; c.fillRect(2, 4, 3, 1); c.fillRect(2, 7, 2, 1);
  }],
  ["#5b6378", (c) => {
    c.fillStyle = "#e8453c"; c.fillRect(3, 2, 8, 2);
    c.fillStyle = "#d8d8e4"; c.fillRect(6, 4, 2, 4);
    c.fillStyle = "#1c1c26"; c.fillRect(2, 8, 10, 4);
    c.fillStyle = "#ffd23c"; c.fillRect(4, 9, 2, 2); c.fillRect(8, 9, 2, 2);
  }],
  ["#7a4ad6", (c) => {
    disc(c, 7, 6, 3.6, "#fff");
    c.fillStyle = "#fff"; c.fillRect(3.4, 6, 7.2, 5);
    c.fillStyle = "#7a4ad6"; c.fillRect(5, 10, 1, 2); c.fillRect(8, 10, 1, 2);
    c.fillStyle = "#222"; c.fillRect(5, 5, 1, 2); c.fillRect(8, 5, 1, 2);
  }],
  ["#1fa0c9", (c) => {
    poly(c, [[2.5, 2.5], [11.5, 2.5], [11.5, 7.5], [7, 12.5], [2.5, 7.5]], "#fff");
    poly(c, [[4, 4], [10, 4], [10, 7], [7, 10.5], [4, 7]], "#4fd8f5");
    c.fillStyle = "#fff"; c.fillRect(5, 5, 2, 1);
  }],
  ["#4a1f5e", (c) => {
    disc(c, 7, 6, 3.8, "#fff");
    c.fillStyle = "#fff"; c.fillRect(4.5, 7, 5, 4);
    c.fillStyle = "#111"; c.fillRect(4.5, 4.5, 2, 2.5); c.fillRect(7.5, 4.5, 2, 2.5); c.fillRect(6.6, 8, 0.8, 1);
    c.fillStyle = "#4a1f5e"; c.fillRect(6, 10, 0.8, 1); c.fillRect(7.8, 10, 0.8, 1);
  }],
].map(([bg, fn]) => sprite(14, 14, (c) => {
  c.fillStyle = "#fff"; c.fillRect(1, 0, 12, 14); c.fillRect(0, 1, 14, 12);
  c.fillStyle = bg; c.fillRect(1, 1, 12, 12);
  c.fillStyle = "#fff3"; c.fillRect(1, 1, 12, 2);
  c.translate(0, 0);
  fn(c);
}));

function bomb(c, b, grid, remote, tick) {
  const [bx, by] = bombPos(b, grid);
  const x = bx * T + 8, y = by * T + TOP + 9;
  const r = 5.5 + Math.sin(b.t / 5) * (b.t < 40 ? 1.4 : 0.7);
  c.fillStyle = "#0004"; c.fillRect(x - 5, y + 4, 10, 3);
  if (remote) {
    c.strokeStyle = `rgba(255,70,60,${0.45 + 0.4 * Math.sin(tick / 4)})`;
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r + 2 + Math.sin(tick / 4), 0, 7); c.stroke();
  }
  disc(c, x, y, r, remote ? "#4a0c10" : "#14141c");
  disc(c, x - 1.5, y - 1.5, r - 2, remote ? "#8a1c22" : "#2a2a38");
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

function player(c, p, v, team, tick) {
  const step = p.walk % 14 < 7 ? 1 : -1;
  const moving = p.walk !== p.lastWalk;
  p.lastWalk = p.walk;
  const x = Math.round(v.x), y = Math.round(v.y) + TOP;
  const bob = moving && step > 0 ? 1 : 0;
  c.fillStyle = "#0005"; c.fillRect(x - 6, y + 5, 12, 3);
  if (team !== undefined) {
    c.lineWidth = 3; c.strokeStyle = "#000a";
    c.beginPath(); c.ellipse(x, y + 6, 9, 3.5, 0, 0, 7); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = teamInfo(team).col;
    c.stroke();
  }
  if (p.curse) disc(c, x, y - 3, 11, `rgba(190,60,255,${0.22 + 0.12 * Math.sin(tick / 3)})`);
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
  if (p.curse) c.drawImage(ICONS[7], x - 4.5, y - 27 + Math.round(Math.sin(tick / 5)), 9, 9);
  if (p.shield > 0) {
    c.beginPath(); c.ellipse(x, y - 3, 11, 13, 0, 0, 7);
    c.fillStyle = p.shield < 60 && p.shield % 10 < 5 ? "rgba(90,220,255,.1)" : "rgba(90,220,255,.28)";
    c.fill();
    c.lineWidth = 1; c.strokeStyle = "rgba(200,248,255,.85)"; c.stroke();
  }
}

function isBlock(g, x, y) { return x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] !== 0; }

function hud(c, g) {
  const s = g.s, tm = teamsOf(s), rows = hudEntries(g);
  c.font = "bold 8px monospace"; c.textAlign = "left";
  const mark = (e, x) => {
    disc(c, x + 4, 8, 4.5, e.alive ? SUIT[e.i] : "#444");
    if (!e.alive) { c.fillStyle = "#e8453c"; c.fillRect(x + 1, 7, 6, 2); }
    if (e.i === g.me) { c.strokeStyle = "#ffd23c"; c.lineWidth = 1; c.beginPath(); c.arc(x + 4, 8, 5.5, 0, 7); c.stroke(); }
  };
  if (!tm) {
    rows.forEach((e, k) => {
      const x = 6 + k * 58;
      mark(e, x);
      c.fillStyle = e.i === g.me ? "#ffd23c" : "#fff";
      c.fillText(`${e.name ? e.name.slice(0, 6) + " " : ""}${e.score}`, x + 11, 11);
    });
  } else {
    [...new Set(rows.map((e) => e.team))].forEach((t, k) => {
      const x0 = 5 + k * 100, ti = teamInfo(t), mem = rows.filter((e) => e.team === t);
      c.fillStyle = ti.col;
      c.fillText(`${ti.name.toUpperCase()} ${mem[0].score}`, x0, 11);
      mem.forEach((e, j) => mark(e, x0 + 36 + j * 18));
      c.fillRect(x0, 14, 36 + mem.length * 18, 1);
    });
  }

  c.textAlign = "center";
  const pill = (x, w) => { c.fillStyle = "#000b"; c.fillRect(x - w / 2, TOP + 3, w, 11); };
  if (g.me >= 0 && !s.done && s.players[g.me]?.alive === false && !g.banner) {
    pill(CW / 2, 132);
    c.fillStyle = "#fff"; c.fillText("You're out – spectating", CW / 2, TOP + 12);
  }
  const cur = g.me >= 0 ? curseText(s.players[g.me]) : "";
  if (cur && s.players[g.me].alive) {
    pill(40, 76);
    c.fillStyle = "#d58cff"; c.fillText(cur, 40, TOP + 12);
  }
  c.textAlign = "right";
  if (s.tick >= SUDDEN - 300 && s.cfg?.suddenDeath !== false) {
    pill(CW - 50, 92);
    c.fillStyle = s.tick % 40 < 20 ? "#e8453c" : "#ffd23c";
    c.fillText(s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON", CW - 6, TOP + 12);
  } else if (g.win) {
    c.fillStyle = "#fff8";
    c.fillText(`FIRST TO ${g.win}`, CW - 6, TOP + 12);
  }
}

export function draw(c, g) {
  const s = g.s, th = themeOf(s.cfg), sp = sprites(th), tm = teamsOf(s);
  c.fillStyle = "#17171f";
  c.fillRect(0, 0, CW, CH);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = s.grid[y * W + x], px = x * T, py = y * T + TOP;
      if (t === 1) c.drawImage(sp.hard, px, py);
      else if (t === 2) c.drawImage(sp.soft, px, py);
      else {
        c.drawImage(sp.ground[(x + y) & 1], px, py);
        if (isBlock(s.grid, x, y - 1)) c.drawImage(shadow, px, py);
      }
    }
  }

  for (const it of s.items) {
    const icon = ICONS[it.type];
    if (!icon) continue;
    const bobY = Math.round(Math.sin((s.tick + it.x * 7) / 8));
    const x = it.x * T + 1, y = it.y * T + TOP + 1 + bobY;
    c.fillStyle = "#0004"; c.fillRect(x + 2, it.y * T + TOP + 14, 10, 2);
    c.drawImage(icon, x, y);
  }

  for (const b of s.bombs) bomb(c, b, s.grid, s.players[b.owner]?.remote, s.tick);
  flames(c, s.flames);

  for (const p of [...s.players].filter((q) => q.alive).sort((a, b) => a.y - b.y)) {
    player(c, p, p, tm ? tm[p.id] : undefined, s.tick);
  }

  c.fillStyle = "#0e0e16"; c.fillRect(0, 0, CW, TOP);
  c.fillStyle = "#2a2a3a"; c.fillRect(0, TOP - 1, CW, 1);
  hud(c, g);

  if (g.banner) {
    c.fillStyle = "#000b"; c.fillRect(0, CH / 2 - 16, CW, 32);
    c.fillStyle = "#ffd23c"; c.fillRect(0, CH / 2 - 16, CW, 1); c.fillRect(0, CH / 2 + 15, CW, 1);
    c.fillStyle = "#fff"; c.font = "bold 10px monospace"; c.textAlign = "center";
    c.fillText(g.banner, CW / 2, CH / 2 + 4);
  }
}
