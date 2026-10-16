import { W, H, T, SUDDEN, ICE, CONV, SPIKE, TELE, POTATO_TICKS, HILL_GOAL, B_CLUSTER, B_MINE, B_ICE, B_MINI, FLY_TICKS, MINE_DELAY } from "./sim.js";
import { placeBubble } from "./director.js";
import { themeOf, teamInfo, teamsOf, curseText, hudEntries, bombPos, palette, view, humansOf, foeLook, FLOORC, EVENT_INFO, spikePhase, eventText, modeText, BOMB_INFO, ICE_FLAME, mineSeen, abilityInfo, heldBombs } from "./look.js";

export const CW = W * T, CH = H * T + 16;
export const NAMES = ["White", "Black", "Red", "Blue"];
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

// Floor art is theme independent and built once. Conveyor strips scroll: the window slides over a repeating chevron pattern.
let FLOOR = null;
function floorSprites() {
  const F = FLOORC;
  return (FLOOR ??= {
    ice: sprite(T, T, (c) => {
      c.fillStyle = F.ice.base; c.fillRect(0, 0, T, T);
      c.fillStyle = F.ice.lo; c.fillRect(0, T - 2, T, 2); c.fillRect(T - 2, 0, 2, T);
      c.fillStyle = F.ice.hi; c.fillRect(0, 0, T, 1); c.fillRect(0, 0, 1, T);
      for (const [x, y, l] of [[3, 10, 5], [8, 5, 4], [10, 11, 3]]) for (let i = 0; i < l; i++) c.fillRect(x + i, y - i, 1, 1);
    }),
    star: sprite(5, 5, (c) => { c.fillStyle = "#fff"; c.fillRect(2, 0, 1, 5); c.fillRect(0, 2, 5, 1); }),
    belt: [0, 1, 2, 3].map((d) => {
      const up = sprite(T, T + 8, (c) => {
        c.fillStyle = F.conv.base; c.fillRect(0, 0, T, T + 8);
        c.fillStyle = F.conv.edge; c.fillRect(0, 0, 2, T + 8); c.fillRect(T - 2, 0, 2, T + 8);
        c.fillStyle = F.conv.arrow;
        for (let y = 0; y < T + 8; y += 8) for (let r = 0; r < 5; r++) { c.fillRect(7 - r, y + 2 + r, 2, 2); c.fillRect(7 + r, y + 2 + r, 2, 2); }
      });
      if (d === 0) return up;
      const w = d === 2 ? T : T + 8, h = d === 2 ? T + 8 : T;
      return sprite(w, h, (c) => { c.translate(w / 2, h / 2); c.rotate((d * Math.PI) / 2); c.drawImage(up, -up.width / 2, -up.height / 2); });
    }),
    pad: F.tele.map((col, k) => sprite(T, T, (c) => {
      disc(c, 8, 8, 7, "#14141f");
      c.strokeStyle = col; c.lineWidth = 1.5;
      for (let r = 0; r <= k; r++) { c.beginPath(); c.arc(8, 8, 6 - r * 2, 0, 7); c.stroke(); }
      disc(c, 8, 8, 1.2, col);
    })),
    spike: [0, 1, 2, 3].map((ph) => sprite(T, T, (c) => {
      const tip = [null, F.spike.warn, "#ff7a2a", F.spike.hot][ph];
      c.fillStyle = ph ? tip : F.spike.plate; c.fillRect(1, 1, T - 2, T - 2);
      c.fillStyle = [F.spike.plate, "#4a3610", "#4a3610", "#4a1410"][ph]; c.fillRect(2, 2, T - 4, T - 4);
      for (const [x, y] of [[3, 4], [10, 4], [3, 10], [10, 10]]) {
        if (!ph) { c.fillStyle = "#1a1a22"; c.fillRect(x + 1, y + 1, 2, 2); continue; }
        c.fillStyle = tip;
        if (ph === 3) c.fillRect(x + 1, y - 2, 1, 2);
        c.fillRect(x + 1, y, 1, 1); c.fillRect(x, y + 1, 3, 2);
        if (ph === 3) c.fillRect(x, y, 3, 1);
        c.fillStyle = ph === 3 ? "#ffd8c8" : "#fff2b0"; c.fillRect(x + 1, ph === 3 ? y - 2 : y, 1, 1);
      }
    })),
  });
}

function floorTile(c, f, px, py, i, s) {
  const F = floorSprites(), still = view.still;
  if (f === ICE) {
    c.drawImage(F.ice, px, py);
    if (still || (s.tick + i * 17) % 100 < 14) c.drawImage(F.star, px + 9, py + 2);
  } else if (f >= CONV && f < CONV + 4) {
    const d = f - CONV, ph = still ? 0 : (s.tick >> 1) % 8, belt = F.belt[d];
    if (d === 0) c.drawImage(belt, 0, ph, T, T, px, py, T, T);
    else if (d === 2) c.drawImage(belt, 0, 8 - ph, T, T, px, py, T, T);
    else c.drawImage(belt, d === 1 ? 8 - ph : ph, 0, T, T, px, py, T, T);
  } else if (f >= TELE) {
    const k = (f - TELE) % FLOORC.tele.length;
    c.drawImage(F.pad[k], px, py);
    const a = still ? 0 : s.tick / 12 + i;
    c.fillStyle = FLOORC.tele[k];
    c.fillRect(px + 8 + Math.round(Math.cos(a) * 5), py + 8 + Math.round(Math.sin(a) * 5), 1, 1);
  } else if (f === SPIKE) {
    const ph = spikePhase(s, i);
    c.drawImage(F.spike[ph === 1 && !still && s.tick % 8 < 4 ? 2 : ph === 2 ? 3 : ph], px, py);
  }
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
  ["#2fb6a8", (c) => {
    c.fillStyle = "#fff"; c.fillRect(4, 3, 7, 7); c.fillRect(3, 6, 1, 3); c.fillRect(11, 5, 1, 3);
    c.fillStyle = "#2fb6a8"; for (const x of [6, 8, 10]) c.fillRect(x, 3, 1, 3);
    c.fillStyle = "#e8453c"; c.fillRect(4, 10, 7, 2);
    c.fillStyle = "#ffd23c"; c.fillRect(4, 11, 7, 1);
  }],
  ["#d6458a", (c) => {
    c.fillStyle = "#fff"; c.fillRect(5, 3, 7, 7); c.fillRect(4, 4, 1, 5);
    c.fillStyle = "#d6458a"; for (const x of [6, 8, 10]) c.fillRect(x, 5, 1, 2);
    c.fillStyle = "#c9c9d6"; c.fillRect(5, 9, 7, 1);
    c.fillStyle = "#fff"; c.fillRect(1, 4, 3, 1); c.fillRect(0, 7, 4, 1); c.fillRect(2, 10, 3, 1);
    c.fillRect(5, 10, 6, 2);
  }],
  ["#c98a10", (c) => {
    disc(c, 7, 8, 3.8, "#111");
    c.fillStyle = "#ffd23c"; for (const [x, y] of [[4, 6], [9, 5], [6, 11], [10, 9]]) c.fillRect(x, y, 2, 2);
    c.fillStyle = "#fff"; c.fillRect(4, 3, 1, 1); c.fillRect(7, 2, 1, 1); c.fillRect(10, 3, 1, 1);
    c.fillStyle = "#fff9"; c.fillRect(5.2, 6.2, 1.2, 1.2);
  }],
  ["#3f6b3a", (c) => {
    c.fillStyle = "#111"; c.fillRect(3, 7, 8, 4); c.fillRect(4, 6, 6, 6);
    c.fillStyle = "#2a2a38"; c.fillRect(4, 7, 6, 1);
    c.fillStyle = "#ff3b30"; c.fillRect(6, 4, 2, 2);
    c.fillStyle = "#fff"; c.fillRect(6, 4, 1, 1);
    c.fillStyle = "#9be36a"; for (const [x, y] of [[2, 6], [11, 6], [2, 11], [11, 11]]) c.fillRect(x, y, 1, 1);
  }],
  ["#2f8fd8", (c) => {
    disc(c, 7, 8, 4, "#bdeeff");
    disc(c, 6, 7, 2.2, "#fff");
    c.fillStyle = "#fff"; c.fillRect(7, 1, 1, 3); c.fillRect(1, 8, 3, 1); c.fillRect(10, 8, 3, 1); c.fillRect(6, 11, 3, 1);
    c.fillStyle = "#2f8fd8"; c.fillRect(6, 8, 3, 1); c.fillRect(7, 7, 1, 3);
  }],
].map(([bg, fn]) => sprite(14, 14, (c) => {
  c.fillStyle = "#fff"; c.fillRect(1, 0, 12, 14); c.fillRect(0, 1, 14, 12);
  c.fillStyle = bg; c.fillRect(1, 1, 12, 12);
  c.fillStyle = "#fff3"; c.fillRect(1, 1, 12, 2);
  c.translate(0, 0);
  fn(c);
}));

function bomb(c, b, s, me) {
  const [bx, by] = bombPos(b, s.grid), remote = s.players[b.owner]?.remote, tick = s.tick, ty = b.ty | 0;
  let x = bx * T + 8, y = by * T + TOP + 9, up = 0;
  if (b.fa > 0) {
    const k = 1 - b.fa / FLY_TICKS;
    x = (b.fx + (b.x - b.fx) * k) * T + 8;
    y = (b.fy + (b.y - b.fy) * k) * T + TOP + 9;
    up = Math.sin(k * Math.PI) * 18;
  }
  if (ty === B_MINE) return mine(c, b, x, y, tick, mineSeen(s, b, me));
  if (ty === B_MINI) {
    const hot = b.t % 8 < 4;
    c.fillStyle = "#0004"; c.fillRect(x - 3, y + 4, 6, 2);
    disc(c, x, y + 1, 3.4, hot ? "#ffd23c" : BOMB_INFO[B_MINI].col);
    disc(c, x - 1, y, 1.2, "#fff9");
    return;
  }
  const r = 5.5 + Math.sin(b.t / 5) * (b.t < 40 ? 1.4 : 0.7);
  c.fillStyle = "#0004"; c.fillRect(x - 5, y + 4, 10, 3);
  y -= up;
  if (remote) {
    c.strokeStyle = `rgba(255,70,60,${0.45 + 0.4 * Math.sin(tick / 4)})`;
    c.lineWidth = 2;
    c.beginPath(); c.arc(x, y, r + 2 + Math.sin(tick / 4), 0, 7); c.stroke();
  }
  const ice = ty === B_ICE;
  disc(c, x, y, r, ice ? "#2a6f9a" : remote ? "#4a0c10" : "#14141c");
  disc(c, x - 1.5, y - 1.5, r - 2, ice ? "#6cc4f2" : remote ? "#8a1c22" : "#2a2a38");
  disc(c, x - 2.5, y - 2.5, 1.6, "#ffffff90");
  if (ty === B_CLUSTER) {
    c.strokeStyle = BOMB_INFO[B_CLUSTER].col; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y, r + 0.5, 0, 7); c.stroke();
    c.fillStyle = BOMB_INFO[B_CLUSTER].col;
    for (const [dx, dy] of [[-4, 1], [3, 2], [0, 4], [-3, -2]]) c.fillRect(x + dx - 1, y + dy - 1, 2, 2);
  } else if (ice) {
    c.fillStyle = "#fff";
    c.fillRect(x - 1, y + r - 1, 2, 3); c.fillRect(x - r - 1, y, 3, 1); c.fillRect(x + r - 1, y, 3, 1); c.fillRect(x - 1, y + r + 1, 1, 1);
  }
  c.fillStyle = "#b5703a"; c.fillRect(x + 2, y - r - 1, 2, 3);
  c.fillStyle = ice ? (b.t % 8 < 4 ? "#ffffff" : "#7ad0ff") : b.t % 8 < 4 ? "#ffd23c" : "#ff7a2a";
  c.fillRect(x + 2, y - r - 3, 3, 3);
  c.fillStyle = "#fff"; c.fillRect(x + 3, y - r - 2, 1, 1);
}

// Mines: a flat disc with a blinking LED for the owner's side, a barely-there ring for rivals, loud once triggered.
function mine(c, b, x, y, tick, seen) {
  const hot = b.t <= MINE_DELAY;
  if (hot) {
    const on = view.still || b.t % 6 < 3;
    c.strokeStyle = on ? "#ff3b30" : "#ffd23c"; c.lineWidth = 2;
    c.beginPath(); c.arc(x, y + 1, 7, 0, 7); c.stroke();
  } else if (!seen) {
    c.strokeStyle = "rgba(255,255,255,.13)"; c.lineWidth = 1;
    c.beginPath(); c.arc(x, y + 1, 5, 0, 7); c.stroke();
    return;
  }
  c.fillStyle = "#0004"; c.fillRect(x - 5, y + 3, 10, 3);
  disc(c, x, y + 1, 5, "#1b2a1b");
  disc(c, x, y + 1, 3.4, "#2c4a2c");
  c.fillStyle = BOMB_INFO[B_MINE].col;
  for (const [dx, dy] of [[-6, 0], [5, 0], [-1, -6], [-1, 5]]) c.fillRect(x + dx, y + 1 + dy, 2, 2);
  c.fillStyle = hot || view.still || tick % 40 < 8 ? "#ff3b30" : "#5a1410";
  c.fillRect(x - 1, y, 2, 2);
}

const FIRE_FLAME = ["#e8453c", "#ff9a2a", "#ffe066", "#fff8d0"];

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
    const col = f.i ? ICE_FLAME : FIRE_FLAME;
    layer(col[0], 0);
    layer(col[1], 1);
    layer(col[2], 3);
    if (f.t > 20) layer(col[3], 5);
  }
}

function tag(c, n, x, y) {
  c.font = "bold 8px monospace"; c.textAlign = "center";
  c.lineWidth = 2.5; c.strokeStyle = "#000"; c.strokeText(n, x, y);
  c.fillStyle = "#fff"; c.fillText(n, x, y);
}

function player(c, p, v, team, tick, foe) {
  const pal = palette(), fl = foeLook();
  const suit = foe ? fl.suit : pal.suit[p.id], dark = foe ? fl.dark : pal.dark[p.id];
  const step = p.walk % 14 < 7 ? 1 : -1;
  const moving = p.walk !== p.lastWalk;
  p.lastWalk = p.walk;
  const x = Math.round(v.x), y = Math.round(v.y) + TOP;
  const bob = moving && step > 0 ? 1 : 0;
  c.fillStyle = "#0005"; c.fillRect(x - 6, y + 5, 12, 3);
  if (foe) {
    c.lineWidth = 3; c.strokeStyle = "#000a";
    c.beginPath(); c.ellipse(x, y + 6, 9, 3.5, 0, 0, 7); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = fl.ring;
    c.stroke();
  } else if (team !== undefined) {
    c.lineWidth = 3; c.strokeStyle = "#000a";
    c.beginPath(); c.ellipse(x, y + 6, 9, 3.5, 0, 0, 7); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = teamInfo(team).col;
    c.stroke();
  }
  if (p.curse) disc(c, x, y - 3, 11, `rgba(190,60,255,${0.22 + 0.12 * Math.sin(tick / 3)})`);
  const lf = moving && !p.fz ? step : 0;
  c.fillStyle = "#222"; c.fillRect(x - 5, y + 4 + (lf > 0 ? 0 : 1), 4, 3); c.fillRect(x + 1, y + 4 + (lf > 0 ? 1 : 0), 4, 3);
  c.fillStyle = suit; c.fillRect(x - 5, y - 1 - bob, 10, 6);
  c.fillStyle = dark; c.fillRect(x - 5, y + 3 - bob, 10, 2);
  c.fillStyle = "#ffd9b0"; c.fillRect(x - 6, y + (moving ? step : 0) - bob, 2, 3); c.fillRect(x + 4, y + (moving ? -step : 0) - bob, 2, 3);
  disc(c, x, y - 5 - bob, 6.5, suit);
  c.fillStyle = dark; c.fillRect(x - 6, y - 4 - bob, 12, 1);
  if (p.face !== 0) {
    c.fillStyle = "#ffd9b0"; c.fillRect(x - 4 + (p.face === 3 ? -1 : p.face === 1 ? 1 : 0), y - 8 - bob, 8, 6);
    c.fillStyle = "#111";
    const ex = p.face === 3 ? -2 : p.face === 1 ? 2 : 0;
    c.fillRect(x - 3 + ex, y - 6 - bob, 2, 3); c.fillRect(x + 1 + ex, y - 6 - bob, 2, 3);
  } else {
    c.fillStyle = dark; c.fillRect(x - 4, y - 8 - bob, 8, 5);
  }
  if (foe) { c.fillStyle = "#efe6d0"; c.fillRect(x - 6, y - 14 - bob, 2, 4); c.fillRect(x + 4, y - 14 - bob, 2, 4); }
  c.fillStyle = "#e8453c"; c.fillRect(x - 1, y - 13 - bob, 3, 3);
  c.fillStyle = "#fff"; c.fillRect(x, y - 12 - bob, 1, 1);
  if (p.curse) c.drawImage(ICONS[7], x - 4.5, y - 27 + Math.round(Math.sin(tick / 5)), 9, 9);
  if (view.cb && !foe) tag(c, p.id + 1, x, y - 16 - bob);
  if (p.fz > 0) {
    const thaw = !view.still && p.fz < 30 && p.fz % 6 < 3;
    c.fillStyle = thaw ? "rgba(190,235,255,.35)" : "rgba(150,215,255,.6)";
    c.fillRect(x - 8, y - 14 - bob, 16, 23);
    c.fillStyle = "#e8fbff";
    c.fillRect(x - 8, y - 14 - bob, 16, 1); c.fillRect(x - 8, y - 14 - bob, 1, 23); c.fillRect(x - 3, y - 11 - bob, 1, 6); c.fillRect(x + 2, y + 1 - bob, 1, 5);
    c.fillRect(x - 2, y - 6 - bob, 3, 1); c.fillRect(x + 3, y - 3 - bob, 3, 1);
  }
  if (p.shield > 0) {
    c.beginPath(); c.ellipse(x, y - 3, 11, 13, 0, 0, 7);
    c.fillStyle = p.shield < 60 && p.shield % 10 < 5 ? "rgba(90,220,255,.1)" : "rgba(90,220,255,.28)";
    c.fill();
    c.lineWidth = 1; c.strokeStyle = "rgba(200,248,255,.85)"; c.stroke();
  }
}

const DASH = [3, 3], SOLID = [];

function zone(c, cx, cy, grid, fill, edge, dash) {
  c.fillStyle = fill;
  for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < W && y < H && grid[y * W + x] !== 1) c.fillRect(x * T, y * T + TOP, T, T);
  c.strokeStyle = edge; c.lineWidth = 2; c.setLineDash(dash);
  c.strokeRect((cx - 1) * T + 1, (cy - 1) * T + TOP + 1, 3 * T - 2, 3 * T - 2);
  c.setLineDash(SOLID);
}

function hillZone(c, s) {
  const h = s.hill;
  if (!h) return;
  let who = -1, n = 0;
  for (const p of s.players) if (p.alive && Math.abs(Math.floor(p.x / T) - h.x) <= 1 && Math.abs(Math.floor(p.y / T) - h.y) <= 1) { who = p.id; n++; }
  const foe = who >= humansOf(s);
  zone(c, h.x, h.y, s.grid, n > 1 ? "rgba(232,69,60,.28)" : n ? "rgba(255,210,60,.34)" : "rgba(255,210,60,.22)", n > 1 ? "#e8453c" : FLOORC.hill, SOLID);
  if (n === 1) { c.fillStyle = foe ? foeLook().suit : palette().suit[who]; c.fillRect(h.x * T + 4, (h.y - 1) * T + TOP - 3, T - 8, 3); }
  if (Array.isArray(h.next) && (view.still || s.tick % 20 < 14)) zone(c, h.next[0], h.next[1], s.grid, "rgba(255,255,255,.1)", FLOORC.next, DASH);
}

function brackets(c, x, y, col) {
  c.fillStyle = col;
  for (const sx of [0, T - 4]) for (const sy of [0, T - 1]) c.fillRect(x + sx, y + sy, 4, 1);
  for (const sx of [0, T - 1]) for (const sy of [0, T - 4]) c.fillRect(x + sx, y + sy, 1, 4);
}

// Telegraph markers under items and players: bomb rain, item rain, quake.
function eventTiles(c, s) {
  const e = s.event, info = e && EVENT_INFO[e.type];
  if (!info || !Array.isArray(e.tiles)) return;
  const hot = e.t < 30, lit = view.still || e.t % (hot ? 6 : 16) < (hot ? 3 : 11);
  for (const t of e.tiles) {
    if (!Array.isArray(t)) continue;
    const x = t[0] * T, y = t[1] * T + TOP;
    if (e.type === "quake") {
      c.fillStyle = "#1c120a";
      for (const [dx, dy, w, h] of [[3, 1, 2, 3], [5, 4, 2, 3], [3, 7, 2, 3], [5, 10, 2, 3], [7, 12, 2, 3], [9, 3, 2, 2], [11, 6, 2, 3]]) c.fillRect(x + dx, y + dy, w, h);
    } else if (e.type === "bombrain") {
      disc(c, x + 8, y + 9, 3.5, "#14141c");
      c.fillStyle = "#ffd23c"; c.fillRect(x + 9, y + 4, 2, 2);
    } else {
      c.fillStyle = "#ffe14a";
      c.fillRect(x + 7, y + 4, 2, 8); c.fillRect(x + 4, y + 7, 8, 2);
    }
    if (lit) brackets(c, x, y, info.col);
  }
}

// Swap links and the frenzy tint, drawn over the players.
function eventOver(c, s) {
  const e = s.event, info = e && EVENT_INFO[e.type];
  if (!info) return;
  const lit = view.still || e.t % 16 < 11;
  if (e.type === "swap") {
    const a = s.players[e.a], b = s.players[e.b];
    if (!a?.alive || !b?.alive) return;
    c.strokeStyle = info.col; c.lineWidth = 1;
    c.globalAlpha = 0.5;
    c.setLineDash(DASH);
    c.beginPath(); c.moveTo(a.x, a.y + TOP - 3); c.lineTo(b.x, b.y + TOP - 3); c.stroke();
    c.setLineDash(SOLID);
    c.globalAlpha = 1;
    if (lit) for (const p of [a, b]) { c.lineWidth = 2; c.beginPath(); c.ellipse(Math.round(p.x), Math.round(p.y) + TOP - 3, 11, 13, 0, 0, 7); c.stroke(); }
  } else if (e.type === "frenzy") {
    if (e.on > 0) { c.fillStyle = "rgba(255,61,138,.1)"; c.fillRect(0, TOP, CW, CH - TOP); }
    else if (lit) { c.strokeStyle = info.col; c.lineWidth = 2; c.strokeRect(1, TOP + 1, CW - 2, CH - TOP - 2); }
  }
}

function potatoMark(c, s) {
  const po = s.potato, h = po && s.players[po.holder];
  if (!h?.alive) return;
  const x = Math.round(h.x), y = Math.round(h.y) + TOP, f = Math.max(0, Math.min(1, po.t / POTATO_TICKS));
  const flash = !view.still && f < 0.25 && s.tick % 8 < 4;
  disc(c, x, y - 3, 12, flash ? "rgba(255,60,40,.5)" : "rgba(255,138,42,.4)");
  const py = Math.max(y - 24, TOP + 9);
  c.fillStyle = "#000"; c.beginPath(); c.ellipse(x, py, 6.5, 5.5, -0.3, 0, 7); c.fill();
  c.fillStyle = "#d9a24e"; c.beginPath(); c.ellipse(x, py, 5, 4, -0.3, 0, 7); c.fill();
  c.fillStyle = "#7a4e22"; c.fillRect(x - 2, py - 1, 1, 1); c.fillRect(x + 1, py + 1, 1, 1); c.fillRect(x - 1, py + 2, 1, 1);
  c.fillStyle = "#4a3018"; c.fillRect(x + 2, py - 7, 1, 4);
  c.fillStyle = s.tick % 6 < 3 ? "#ffd23c" : "#ff7a2a"; c.fillRect(x + 1, py - 9 + Math.round(f * 2), 3, 3);
  if (!view.still) {
    const sp = 0.25 + (1 - f) * 0.7;
    for (let k = 0; k < 2; k++) {
      const a = s.tick * sp + k * 3.1;
      c.fillRect(x + 2 + Math.round(Math.cos(a) * (3 + (1 - f) * 5)), py - 8 + Math.round(Math.sin(a) * (3 + (1 - f) * 5)), 1, 1);
    }
  }
  c.fillStyle = "#000"; c.fillRect(x - 9, y + 9, 18, 4);
  c.fillStyle = f > 0.5 ? "#7bd34a" : f > 0.25 ? "#ffb02a" : flash ? "#fff" : "#ff3b30";
  c.fillRect(x - 8, y + 10, Math.round(16 * f), 2);
}

// Afterimages behind a dashing player.
function trail(c, p) {
  const pal = palette(), [dx, dy] = [[0, -1], [1, 0], [0, 1], [-1, 0]][p.face];
  c.fillStyle = pal.suit[p.id];
  for (let k = 1; k <= 3; k++) {
    c.globalAlpha = 0.6 - k * 0.15;
    c.fillRect(Math.round(p.x) - 5 - dx * k * 5, Math.round(p.y) + TOP - 6 - dy * k * 5, 10, 11);
  }
  c.globalAlpha = 1;
}

// Bottom strip: ability ring (seconds left, or its initial when ready), held special bombs, glove and punch. Players are listed on shared screens.
function dock(c, g) {
  const s = g.s, solo = g.me >= 0;
  const list = solo ? [s.players[g.me]] : s.players.slice(0, humansOf(s));
  const who = list.filter((p) => p?.alive);
  if (!who.length) return;
  const w = solo ? 112 : 40, x0 = Math.round((CW - who.length * w) / 2), y = CH - 14, suit = palette().suit;
  c.fillStyle = "#000b"; c.fillRect(x0 - 2, y, who.length * w + 4, 12);
  c.font = "bold 7px monospace"; c.textAlign = "center";
  who.forEach((p, k) => {
    let x = x0 + k * w + 2;
    if (!solo) { c.fillStyle = suit[p.id]; c.fillRect(x - 1, y + 3, 2, 6); x += 3; }
    const a = abilityInfo(p);
    if (a) {
      c.lineWidth = 2; c.strokeStyle = "#fff3";
      c.beginPath(); c.arc(x + 6, y + 6, 4.5, 0, 7); c.stroke();
      c.strokeStyle = a.ready ? "#ffd23c" : suit[p.id];
      c.beginPath(); c.arc(x + 6, y + 6, 4.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * a.frac); c.stroke();
      c.fillStyle = a.ready ? "#ffd23c" : "#fff";
      c.fillText(a.ready ? a.name[0] : a.secs, x + 6, y + 9);
      x += 14;
      if (solo) { c.textAlign = "left"; c.fillStyle = a.ready ? "#ffd23c" : "#fffa"; c.fillText(a.name, x, y + 9); c.textAlign = "center"; x += a.name.length * 4.3 + 4; }
      else x += 1;
    }
    const h = heldBombs(p);
    if (h) {
      c.drawImage(ICONS[9 + h.ty], x, y + 1, 10, 10);
      c.fillStyle = "#fff"; c.textAlign = "left"; c.fillText(`x${h.n}`, x + 11, y + 9); c.textAlign = "center";
      x += 22;
    }
    if (solo) {
      if (p.gl) { c.drawImage(ICONS[8], x, y + 2, 9, 9); x += 10; }
      if (p.pn) c.drawImage(ICONS[9], x, y + 2, 9, 9);
    }
  });
}

function isBlock(g, x, y) { return x >= 0 && y >= 0 && x < W && y < H && g[y * W + x] !== 0; }

function hud(c, g) {
  const s = g.s, tm = teamsOf(s), rows = hudEntries(g);
  const SUIT = palette().suit;
  c.font = "bold 8px monospace"; c.textAlign = "left";
  const mark = (e, x) => {
    disc(c, x + 4, 8, 4.5, e.alive ? SUIT[e.i] : "#444");
    if (view.cb) { tag(c, e.i + 1, x + 4, 11); c.textAlign = "left"; }
    if (!e.alive) { c.fillStyle = "#e8453c"; c.fillRect(x + 1, 7, 6, 2); }
    if (e.i === g.me) { c.strokeStyle = "#ffd23c"; c.lineWidth = 1; c.beginPath(); c.arc(x + 4, 8, 5.5, 0, 7); c.stroke(); }
  };
  if (!tm) {
    const wide = rows.length < 3;
    rows.forEach((e, k) => {
      const x = 6 + k * (wide ? 118 : 58);
      mark(e, x);
      c.fillStyle = e.i === g.me ? "#ffd23c" : "#fff";
      const sc = e.score < 0 ? "" : e.pts >= 0 ? `${e.score}·${e.pts}` : e.score;
      c.fillText(`${e.name ? e.name.slice(0, wide ? 10 : e.pts >= 0 ? 3 : 6) + " " : ""}${sc}`, x + 11, 11);
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
  const pill = (x, w, y = TOP + 3) => { c.fillStyle = "#000b"; c.fillRect(x - w / 2, y, w, 11); };
  if (g.me >= 0 && !s.done && s.players[g.me]?.alive === false && !g.banner) {
    pill(CW / 2, 132);
    c.fillStyle = "#fff"; c.fillText("You're out – spectating", CW / 2, TOP + 12);
  }
  const cur = g.me >= 0 ? curseText(s.players[g.me]) : "";
  if (cur && s.players[g.me].alive) {
    pill(40, 76);
    c.fillStyle = "#d58cff"; c.fillText(cur, 40, TOP + 12);
  }
  c.textAlign = "left";
  const mt = modeText(s), et = eventText(s);
  if (mt) {
    pill(5 + mt.length * 2.5 + 3, mt.length * 5 + 6, CH - 14);
    c.fillStyle = s.hill ? FLOORC.hill : s.potato ? FLOORC.potato : "#ff6a5c"; c.fillText(mt, 8, CH - 5);
  }
  c.textAlign = "right";
  if (et) {
    pill(CW - 5 - et.length * 2.5 - 3, et.length * 5 + 6, CH - 14);
    c.fillStyle = EVENT_INFO[s.event.type].col; c.fillText(et, CW - 8, CH - 5);
  }
  if (s.tick >= SUDDEN - 300 && s.cfg?.suddenDeath !== false) {
    pill(CW - 50, 92);
    c.fillStyle = s.tick % 40 < 20 ? "#e8453c" : "#ffd23c";
    c.fillText(s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON", CW - 6, TOP + 12);
  } else if (g.win && !s.survival) {
    c.fillStyle = "#fff8";
    c.fillText(`FIRST TO ${g.win}`, CW - 6, TOP + 12);
  }
}

const PIX = '8px "Press Start 2P", monospace', spot = {};
const BOX = [2, TOP + 2, CW - 2, CH - 2], HOLE = [CW / 2 - 44, CH / 2 - 36, CW / 2 + 44, CH / 2 + 36];

function callout(c, g) {
  const k = g.call, t = (g.clock - k.at) / (k.until - k.at);
  const a = Math.min(1, t / 0.1, (1 - t) / 0.25);
  c.save();
  c.globalAlpha = Math.max(0, a);
  c.translate(CW / 2, CH * 0.36);
  if (!k.still) { const z = 1 + 0.5 * Math.max(0, 1 - t / 0.12); c.rotate(-0.04 * (1 - Math.min(1, t * 4))); c.scale(z, z); }
  c.font = g.retro ? '12px "Press Start 2P", monospace' : "900 20px monospace";
  c.textAlign = "center"; c.lineJoin = "round";
  c.lineWidth = 4; c.strokeStyle = "#000"; c.strokeText(k.text, 0, 0, 224);
  c.fillStyle = "#ffd23c"; c.fillText(k.text, 0, 0, 224);
  c.restore();
}

function bubbles(c, g) {
  c.font = PIX; c.textAlign = "left";
  for (let i = 0; i < 2; i++) {
    const b = g.bub[i], p = g.s.players[i];
    if (!b || !p) continue;
    const w = b.cols * 8 + 8, h = b.lines.length * 10 + 6;
    placeBubble(spot, p.x, p.y + TOP - 16, w, h, BOX, HOLE);
    const x = Math.round(spot.x), y = Math.round(spot.y);
    c.fillStyle = "#000"; c.fillRect(x - 1, y - 1, w + 2, h + 2);
    c.fillStyle = "#fff"; c.fillRect(x, y, w, h);
    if (spot.tail) { c.fillStyle = "#000"; c.fillRect(Math.round(p.x) - 2, y + h, 5, 4); c.fillStyle = "#fff"; c.fillRect(Math.round(p.x) - 1, y + h, 3, 3); }
    c.fillStyle = "#14141f";
    b.lines.forEach((l, k) => c.fillText(l, x + 4, y + 10 + k * 10));
  }
}

export function draw(c, g) {
  const s = g.s, th = themeOf(s.cfg), sp = sprites(th), tm = teamsOf(s), fl = s.floor, nh = humansOf(s);
  c.fillStyle = "#17171f";
  c.fillRect(0, 0, CW, CH);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = s.grid[y * W + x], px = x * T, py = y * T + TOP;
      if (t === 1) c.drawImage(sp.hard, px, py);
      else if (t === 2) c.drawImage(sp.soft, px, py);
      else {
        c.drawImage(sp.ground[(x + y) & 1], px, py);
        if (fl && fl[y * W + x]) floorTile(c, fl[y * W + x], px, py, y * W + x, s);
        if (isBlock(s.grid, x, y - 1)) c.drawImage(shadow, px, py);
      }
    }
  }

  if (s.hill) hillZone(c, s);
  if (s.event) eventTiles(c, s);

  for (const it of s.items) {
    const icon = ICONS[it.type];
    if (!icon) continue;
    const bobY = Math.round(Math.sin((s.tick + it.x * 7) / 8));
    const x = it.x * T + 1, y = it.y * T + TOP + 1 + bobY;
    c.fillStyle = "#0004"; c.fillRect(x + 2, it.y * T + TOP + 14, 10, 2);
    c.drawImage(icon, x, y);
  }

  for (const b of s.bombs) bomb(c, b, s, g.me);
  flames(c, s.flames);

  for (const p of [...s.players].filter((q) => q.alive).sort((a, b) => a.y - b.y)) {
    if (p.dash > 0) trail(c, p);
    if (p.inv > 0) c.globalAlpha = g.me < 0 || p.id === g.me || (tm && tm[p.id] === tm[g.me]) ? (!view.still && p.inv < 30 && p.inv % 6 < 3 ? 0.8 : 0.4) : 0.1;
    player(c, p, p, tm ? tm[p.id] : undefined, s.tick, p.id >= nh);
    c.globalAlpha = 1;
  }
  if (s.potato) potatoMark(c, s);
  if (s.event) eventOver(c, s);

  c.fillStyle = "#0e0e16"; c.fillRect(0, 0, CW, TOP);
  c.fillStyle = "#2a2a3a"; c.fillRect(0, TOP - 1, CW, 1);
  hud(c, g);
  if (s.cfg?.bombs || s.cfg?.abilities) dock(c, g);

  if (g.banner) {
    c.fillStyle = "#000b"; c.fillRect(0, CH / 2 - 16, CW, 32);
    c.fillStyle = "#ffd23c"; c.fillRect(0, CH / 2 - 16, CW, 1); c.fillRect(0, CH / 2 + 15, CW, 1);
    c.fillStyle = "#fff"; c.font = g.retro ? '8px "Press Start 2P", monospace' : "bold 10px monospace"; c.textAlign = "center";
    c.fillText(g.banner, CW / 2, CH / 2 + 4);
  }
  if (g.call) callout(c, g);
  if (g.bub && (g.bub[0] || g.bub[1])) bubbles(c, g);
}
