// "Bomber Shooter": first-person raycast renderer. Same game state as the other renderers (a pure view).
// Low-res ImageData (reused), CSS pixelated upscale, no per-frame allocation in the 3D pass, nothing runs unless draw() is called.
import { W as GW, H as GH, T, SUDDEN, B_MINE, FLY_TICKS, SPIKE, TELE, POTATO_TICKS } from "./sim.js";
import { placeBubble } from "./director.js";
import { EMOTES, emoteLook } from "./emote.js";
import { themeOf, teamInfo, teamsOf, curseText, hudEntries, bombPos, palette, view, mineSeen, abilityInfo, heldBombs, humansOf, foeLook, FLOORC, EVENT_INFO, spikePhase, eventText, modeText } from "./look.js";
import { ICONS } from "./render.js";
import { cast, newRay, OX, OY, DX, DY, T as RT, SIDE, TILE, CELL, U, texU, planeOf, project, angDiff } from "./raycast.js";
import { fps } from "./fpsinput.js";
import * as X from "./fpstex.js";

const MOBILE = matchMedia("(pointer: coarse)").matches;
const CH = MOBILE ? 150 : 200, BAR = 28, MINI = MOBILE ? 3 : 4, MAXS = 220;
const FOG = 0.065, MIN_LIGHT = 0.22, FACE_DARK256 = 200;
const NUMS = [], PAIRS = [], num = (n) => (NUMS[n] ??= String(n)), pair = (a, b) => (PAIRS[a * 32 + b] ??= `${a}/${b}`);
const FACING = [[0, -1], [1, 0], [0, 1], [-1, 0]], WALLM = 31;
const PIX = '8px "Press Start 2P", monospace';

export function createRendererFps(canvas) {
  const c = canvas.getContext("2d", { alpha: false });
  let cw = 320, vh = CH - BAR, K = vh * 1.1, img = null, buf = null, bufI = null, zbuf = null, camX = null;
  let still = false, need = true, lastDraw = 0, lastNow = 0, ms = 0, errMsg = "";
  let yaw = 0, bobPh = 0, bobAmp = 0, lastWalk = -1, flick = 1;
  let miniOn = true;
  try { miniOn = localStorage.getItem("fpsmap") !== "0"; } catch {}

  const hit = newRay(), pl = { x: 0.5, y: 0.5 }, pr = new Float64Array(2), spot = { x: 0.5, y: 0.5, tail: true };
  const sh = new Uint32Array(256);
  let fogR = 0, fogG = 0, fogB = 0, fogPack = 0, ceilRgb = [0, 0, 0];
  let thKey = "", T_ = null, palRef = null, P_ = null, F_ = null;
  const ringCache = new Map(), portraits = new Map(), faceCache = new Map(), digits = [0, 1, 2, 3].map(X.digitTex);
  const items = ICONS.map(X.fromCanvas);
  const shadow = X.shadowTex(), bigBomb = X.toCanvas(X.bigBombTex());
  const flames = [0, 1, 2].map((f) => X.flameTex(f)), iceFlames = [0, 1, 2].map((f) => X.flameTex(f, true));
  const bombs = [0, 1, 2, 3, 4].map((k) => [[0, 0], [0, 1], [1, 0], [1, 1]].map(([r, s]) => X.bombTex(!!r, !!s, k)));
  const frost = X.auraTex(X.rgba("#9ee0ff", 120), X.rgba("#ffffff", 220));
  const shield = [X.auraTex(X.rgba("#5adcff", 72), X.rgba("#c8f8ff", 200)), X.auraTex(X.rgba("#5adcff", 26), X.rgba("#c8f8ff", 110))];
  const curse = X.auraTex(X.rgba("#be3cff", 80), X.rgba("#dc8cff", 180));
  const hotAura = [FLOORC.potato, "#ff3b30"].map((col) => X.auraTex(X.rgba(col, 90), X.rgba(col, 220)));
  const colCache = new Map(), teleCols = FLOORC.tele.map(X.columnTex);
  const OVT = X.floorOverlays(FLOORC).map((t) => t && new Int32Array(t.buffer));
  const ov = new Uint8Array(GW * GH), qk = new Uint8Array(GW * GH), shI = new Int32Array(sh.buffer);
  let nOv = 0, nQk = 0, convOff = 0;

  // sprite list (preallocated)
  const sTex = new Array(MAXS), sDepth = new Float32Array(MAXS), sSX = new Float32Array(MAXS), sW = new Float32Array(MAXS), sH = new Float32Array(MAXS), sZ = new Float32Array(MAXS), sFull = new Uint8Array(MAXS), ord = new Uint16Array(MAXS);
  let ns = 0, camPX = 0, camPY = 0, dirX = 0, dirY = -1;

  // me / transient HUD state
  const me = { id: 0, bombs: 0, grinUntil: 0, throwAt: -1e9, deadAt: -1e9, alive: true, tick: -1 };

  function resize() {
    const iw = innerWidth, ih = innerHeight, asp = Math.min(2.1, Math.max(4 / 3, iw / ih));
    const w = Math.round(CH * asp) & ~1;
    if (w !== cw || !img) {
      cw = w; vh = CH - BAR; K = vh * 1.1;
      canvas.width = cw; canvas.height = CH;
      img = c.createImageData(cw, CH);
      buf = new Uint32Array(img.data.buffer);
      bufI = new Int32Array(img.data.buffer);
      buf.fill(0xff000000);
      zbuf = new Float32Array(cw);
      camX = new Float32Array(cw);
      for (let x = 0; x < cw; x++) camX[x] = (2 * (x + 0.5)) / cw - 1;
    }
    const k = Math.min(iw / cw, ih / CH);
    canvas.style.width = `${cw * k}px`;
    canvas.style.height = `${CH * k}px`;
    need = true;
  }

  function setLook(th) {
    thKey = th.key;
    T_ = { stone: X.stoneTex(th), brick: X.brickTex(th), floor: X.floorTex(th), th };
    const fog = X.mixHex(th.hard[2], "#000000", 0.55), ceil = X.mixHex(th.hard[2], "#000000", 0.25);
    fogR = parseInt(fog.slice(1, 3), 16); fogG = parseInt(fog.slice(3, 5), 16); fogB = parseInt(fog.slice(5, 7), 16);
    ceilRgb = [1, 3, 5].map((i) => parseInt(ceil.slice(i, i + 2), 16));
    fogPack = (0xff000000 | (fogB << 16) | (fogG << 8) | fogR) >>> 0;
  }

  function setPalette(pal) {
    palRef = pal;
    const mk = (i, back, f) => X.playerTex(pal.suit[i], pal.dark[i], back, f);
    const fl = foeLook();
    F_ = [0, 1, 2, 3].map((k) => X.playerTex(fl.suit, fl.dark, k >> 1, k & 1));
    P_ = { body: [0, 1, 2, 3].map((i) => [mk(i, 0, 0), mk(i, 0, 1), mk(i, 1, 0), mk(i, 1, 1)]), hand: [0, 1, 2, 3].map((i) => X.toCanvas(X.handTex(pal.suit[i], pal.dark[i]))) };
    faceCache.clear();
  }

  const faceOf = (kind, id) => {
    const k = `${kind}${id}`;
    let f = faceCache.get(k);
    if (!f) faceCache.set(k, (f = X.toCanvas(X.faceTex(kind, palRef.suit[id & 3], palRef.dark[id & 3]))));
    return f;
  };

  const portrait = (id) => {
    let im = portraits.get(id);
    if (!im) { im = new Image(); im.src = `/portraits/${id}.webp`; portraits.set(id, im); }
    return im.complete && im.naturalWidth ? im : null;
  };

  // 0..256 integer so nothing is boxed per call.
  const light = (d) => {
    const v = (d * FOG < 1 - MIN_LIGHT ? 1 - d * FOG : MIN_LIGHT) * flick * 256;
    return v > 256 ? 256 : v | 0;
  };

  // Shade the palette of t into sh at light f (0..256), fading to the fog colour.
  function shadePal(t, f) {
    const pal = t.pal, g = 256 - f;
    for (let i = 1; i < t.n; i++) {
      const p = pal[i];
      sh[i] = (p & 0xff000000) | ((((p >> 16 & 255) * f + fogB * g) >> 8) << 16) | ((((p >> 8 & 255) * f + fogG * g) >> 8) << 8) | (((p & 255) * f + fogR * g) >> 8);
    }
  }

  // ---------- 3D pass ----------
  function walls(grid, hz) {
    const stone = T_.stone, brick = T_.brick;
    hit[OX] = camPX; hit[OY] = camPY;
    for (let x = 0; x < cw; x++) {
      const k = camX[x], rx = dirX + pl.x * k, ry = dirY + pl.y * k;
      hit[DX] = rx; hit[DY] = ry;
      cast(grid, GW, GH, hit);
      const t = hit[RT] < 0.05 ? 0.05 : hit[RT];
      zbuf[x] = t;
      const lh = K / t, top = hz - lh / 2;
      let y0 = Math.ceil(top), y1 = Math.floor(hz + lh / 2);
      const side = hit[SIDE], tp = hit[TILE] === 1 ? stone : brick;
      const tx = Math.min(WALLM, (texU(hit[U], side, rx, ry) * 32) | 0);
      const step = 32 / lh;
      let pos = (Math.max(y0, 0) - top) * step;
      if (y0 < 0) y0 = 0;
      if (y1 > vh) y1 = vh;
      shadePal(tp, side ? (light(t) * FACE_DARK256) >> 8 : light(t));
      if (nQk && qk[hit[CELL] | 0]) for (let i = 1; i < tp.n; i++) { const p = sh[i]; sh[i] = (p & 0xff000000) | ((((p >> 16 & 255) + 3 * 170) >> 2) << 16) | ((((p >> 8 & 255) + 3 * 236) >> 2) << 8) | (((p & 255) + 3 * 255) >> 2); }
      const base = tx * 32, idx = tp.idx;
      for (let y = y0, o = y0 * cw + x; y < y1; y++, o += cw) { buf[o] = sh[idx[base + ((pos | 0) & 31)]]; pos += step; }
    }
  }

  function overlayPx(k, u, v, base, f, g) {
    let su = u, sv = v;
    if (k >= 2 && k <= 5) {
      if (k === 2) sv = (v + convOff) & 31;
      else if (k === 4) sv = (31 - v + convOff) & 31;
      else if (k === 3) { su = v; sv = (31 - u + convOff) & 31; }
      else { su = 31 - v; sv = (u + convOff) & 31; }
    }
    const q = OVT[k][(sv << 5) | su], a = q >>> 24;
    if (!a) return base;
    let r = (q & 255), gg = (q >> 8 & 255), b = (q >> 16 & 255);
    r = (r * f + fogR * g) >> 8; gg = (gg * f + fogG * g) >> 8; b = (b * f + fogB * g) >> 8;
    if (a !== 255) {
      r = (((r - (base & 255)) * a) >> 8) + (base & 255);
      gg = (((gg - (base >> 8 & 255)) * a) >> 8) + (base >> 8 & 255);
      b = (((b - (base >> 16 & 255)) * a) >> 8) + (base >> 16 & 255);
    }
    return 0xff000000 | (b << 16) | (gg << 8) | r;
  }

  function buildOv(s) {
    nOv = nQk = 0;
    const fl = s.floor, h = s.hill, e = s.event;
    if (!fl && !h && !(e && e.type === "quake" && e.t > 0)) return;
    ov.fill(0); qk.fill(0);
    if (fl) {
      convOff = still ? 0 : s.tick & 15;
      for (let i = 0; i < GW * GH; i++) {
        const f = fl[i];
        if (!f) continue;
        nOv++;
        const ph = f === SPIKE ? spikePhase(s, i) : 0;
        ov[i] = f < SPIKE ? f : f === SPIKE ? X.OV_SPIKE + (ph === 1 && !still && s.tick % 8 < 4 ? 0 : ph) : X.OV_TELE + ((f - TELE) % FLOORC.tele.length);
      }
    }
    if (h) {
      let n = 0;
      for (let i = 0; i < s.players.length; i++) { const p = s.players[i]; if (p.alive && Math.abs(Math.floor(p.x / T) - h.x) <= 1 && Math.abs(Math.floor(p.y / T) - h.y) <= 1) n++; }
      const zone = (cx, cy, kind) => {
        for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (x >= 0 && y >= 0 && x < GW && y < GH && s.grid[y * GW + x] !== 1) { ov[y * GW + x] = kind; nOv++; }
      };
      zone(h.x, h.y, n > 1 ? X.OV_HOT : X.OV_HILL);
      if (Array.isArray(h.next) && (still || s.tick % 20 < 14)) zone(h.next[0], h.next[1], X.OV_NEXT);
    }
    if (e && e.type === "quake" && e.t > 0 && e.tiles && (still || (e.t >> 2) & 1)) {
      for (let i = 0; i < e.tiles.length; i++) { qk[e.tiles[i][1] * GW + e.tiles[i][0]] = 1; nQk++; }
    }
  }

  function floorCeil(hz) {
    const fl = T_.floor, idx = fl.idx;
    const hzi = Math.max(0, Math.min(vh, Math.round(hz)));
    for (let y = 0; y < hzi; y++) {
      const f = light((0.5 * K) / (hz - y + 0.5)), g = 256 - f;
      bufI.fill(0xff000000 | (((ceilRgb[2] * f + fogB * g) >> 8) << 16) | (((ceilRgb[1] * f + fogG * g) >> 8) << 8) | ((ceilRgb[0] * f + fogR * g) >> 8), y * cw, y * cw + cw);
    }
    const rx0 = dirX - pl.x, ry0 = dirY - pl.y, sx = (2 * pl.x) / cw, sy = (2 * pl.y) / cw;
    for (let y = hzi; y < vh; y++) {
      const rd = (0.5 * K) / (y - hz + 0.5);
      const lf = light(rd);
      shadePal(fl, lf);
      let fx = (camPX + rd * rx0) * 32, fy = (camPY + rd * ry0) * 32;
      const dx = rd * sx * 32, dy = rd * sy * 32;
      if (nOv) {
        const g = 256 - lf;
        for (let x = 0, o = y * cw; x < cw; x++, o++) {
          let p = shI[idx[((fy & 63) << 6) | (fx & 63)]];
          const tx = fx >> 5, ty = fy >> 5;
          if ((tx >>> 0) < GW && (ty >>> 0) < GH) { const k = ov[ty * GW + tx]; if (k) p = overlayPx(k, fx & 31, fy & 31, p, lf, g); }
          bufI[o] = p;
          fx += dx; fy += dy;
        }
        continue;
      }
      for (let x = 0, o = y * cw; x < cw; x++, o++) {
        buf[o] = sh[idx[((fy & 63) << 6) | (fx & 63)]];
        fx += dx; fy += dy;
      }
    }
  }

  // Billboards: world size in tiles (w, h), z = height of the bottom above the floor.
  function add(t, x, y, w, h, z, bias, full) {
    if (ns >= MAXS) return;
    project(camPX, camPY, dirX, dirY, pl.x, pl.y, x, y, pr);
    const ty = pr[1];
    if (ty < 0.15 || ty > 26) return;
    const sx = pr[0] / ty;
    if (Math.abs(sx) - (w * K) / ty / cw > 1) return;
    sTex[ns] = t; sDepth[ns] = ty + bias; sSX[ns] = (cw / 2) * (1 + sx); sW[ns] = w; sH[ns] = h; sZ[ns] = z; sFull[ns] = full; ns++;
  }

  function sprites(hz) {
    for (let i = 0; i < ns; i++) {
      let j = i;
      const d = sDepth[i];
      while (j > 0 && sDepth[ord[j - 1]] < d) { ord[j] = ord[j - 1]; j--; }
      ord[j] = i;
    }
    for (let n = 0; n < ns; n++) {
      const i = ord[n], t = sTex[i], ty = sDepth[i], sc = K / ty;
      const sw = sW[i] * sc, shh = sH[i] * sc;
      if (sw < 1) continue;
      const left = sSX[i] - sw / 2, bottom = hz + 0.5 * sc - sZ[i] * sc, top = bottom - shh;
      const x0 = Math.max(0, Math.round(left)), x1 = Math.min(cw, Math.round(left + sw));
      const y0 = Math.max(0, Math.ceil(top)), y1 = Math.min(vh, Math.floor(bottom));
      if (x0 >= x1 || y0 >= y1) continue;
      shadePal(t, sFull[i] ? 256 : light(ty));
      const tu = t.w / sw, tv = t.h / shh, idx = t.idx, tw = t.w, th = t.h;
      for (let x = x0; x < x1; x++) {
        if (ty >= zbuf[x]) continue;
        const col = Math.min(tw - 1, ((x + 0.5 - left) * tu) | 0);
        let pos = (y0 - top + 0.5) * tv;
        for (let y = y0, o = y0 * cw + x; y < y1; y++, o += cw, pos += tv) {
          const ti = idx[Math.min(th - 1, pos | 0) * tw + col];
          if (!ti) continue;
          const p = sh[ti], a = p >>> 24;
          if (a === 255) buf[o] = p;
          else {
            const d = buf[o];
            buf[o] = 0xff000000 | ((((p >> 16 & 255) - (d >> 16 & 255)) * a >> 8) + (d >> 16 & 255)) << 16 | ((((p >> 8 & 255) - (d >> 8 & 255)) * a >> 8) + (d >> 8 & 255)) << 8 | ((((p & 255) - (d & 255)) * a >> 8) + (d & 255));
          }
        }
      }
    }
  }

  function beacon(x, y, col) {
    let r = ringCache.get(col), cl = colCache.get(col);
    if (!r) ringCache.set(col, (r = X.ringTex(X.rgba(col))));
    if (!cl) colCache.set(col, (cl = X.columnTex(col)));
    add(r, x, y, 0.9, 0.2, 0, 0.02, 0);
    add(cl, x, y, 0.3, 0.55, 0, 0, 1);
  }

  function collect(s, tm, clock, meId) {
    const walk = !still;
    for (let i = 0; i < s.items.length; i++) {
      const it = s.items[i], icon = items[it.type];
      if (icon) add(icon, it.x + 0.5, it.y + 0.5, 0.42, 0.42, 0.06 + (walk ? 0.06 + 0.05 * Math.sin(clock / 160 + it.x * 7) : 0.08), 0, 0);
    }
    for (let i = 0; i < s.bombs.length; i++) {
      const b = s.bombs[i], rem = s.players[b.owner]?.remote ? 2 : 0, ty = b.ty | 0;
      if (ty === B_MINE && !mineSeen(s, b, meId)) continue;
      let px = b.x, py = b.y, lift = 0;
      if (b.fa > 0) {
        const t = 1 - b.fa / FLY_TICKS;
        px = b.fx + (b.x - b.fx) * t; py = b.fy + (b.y - b.fy) * t; lift = Math.sin(t * Math.PI) * 0.9;
      } else if (b.dx || b.dy) { const pos = bombPos(b, s.grid); px = pos[0]; py = pos[1]; }
      const k = still ? 1 : 1 + Math.sin(b.t / 5) * (b.t < 40 ? 0.1 : 0.05);
      add(bombs[ty][rem + ((b.t & 8) >> 3)], px + 0.5, py + 0.5, 0.5 * k, 0.57 * k, lift, 0, 0);
      add(shadow, px + 0.5, py + 0.5, 0.6, 0.12, 0, 0.03, 0);
    }
    for (let i = 0; i < s.flames.length; i++) {
      const f = s.flames[i], k = Math.min(1, f.t / 8);
      add((f.i ? iceFlames : flames)[((clock / 70) | 0) % 3], f.x + 0.5, f.y + 0.5, 0.95, 0.95 * (0.35 + 0.65 * k), 0, 0, 1);
    }
    if (s.floor) for (let i = 0; i < GW * GH; i++) if (s.floor[i] >= TELE) add(teleCols[(s.floor[i] - TELE) % teleCols.length], (i % GW) + 0.5, ((i / GW) | 0) + 0.5, 0.45, 0.8, 0, 0, 1);
    const ev = s.event, evCol = ev && !ev.on && EVENT_INFO[ev.type]?.col;
    if (evCol && ev.tiles && ev.type !== "quake") for (let i = 0; i < ev.tiles.length; i++) beacon(ev.tiles[i][0] + 0.5, ev.tiles[i][1] + 0.5, evCol);
    const dx = dirX, dy = dirY, humans = humansOf(s), po = s.potato;
    for (let i = 0; i < s.players.length; i++) {
      const p = s.players[i];
      if (i === meId || !p.alive || p.dormant) continue;
      const x = p.x / T, y = p.y / T, id = i & 3;
      const f = FACING[p.face & 3], back = f[0] * dx + f[1] * dy > 0.3 ? 2 : 0, foe = i >= humans;
      if (p.inv > 0 && !(tm && tm[i] === tm[meId])) continue;
      add(foe ? F_[back + (p.walk % 14 < 7 ? 0 : 1)] : P_.body[id][back + (p.walk % 14 < 7 ? 0 : 1)], x, y, 0.57, 0.79, 0, 0, 0);
      if (po && po.holder === i) add(hotAura[!still && po.t < POTATO_TICKS / 4 && s.tick % 8 < 4 ? 1 : 0], x, y, 0.85, 1.0, -0.02, -0.01, 1);
      if (ev && ev.type === "swap" && !ev.on && (ev.a === i || ev.b === i)) beacon(x, y, evCol);
      if (p.fz > 0) add(frost, x, y, 0.85, 1.0, -0.02, -0.01, 1);
      add(shadow, x, y, 0.7, 0.14, 0, 0.03, 0);
      if (tm || foe) {
        const col = foe ? foeLook().ring : teamInfo(tm[i]).col;
        let r = ringCache.get(col);
        if (!r) ringCache.set(col, (r = X.ringTex(X.rgba(col))));
        add(r, x, y, 0.9, 0.2, 0, 0.02, 0);
      }
      if (p.curse) {
        add(curse, x, y, 0.8, 0.95, 0, -0.01, 1);
        add(items[7], x, y, 0.3, 0.3, 0.95 + (still ? 0 : 0.03 * Math.sin(clock / 130)), -0.02, 0);
      }
      if (p.shield > 0) add(shield[p.shield < 60 && p.shield % 10 < 5 ? 1 : 0], x, y, 0.85, 1.0, -0.02, -0.01, 1);
      if (view.cb && !foe) add(digits[id], x, y, 0.2, 0.28, 0.85, -0.02, 1);
    }
  }

  // ---------- 2D overlay ----------
  const txt = (s, x, y, col, al = "left") => {
    c.textAlign = al;
    c.fillStyle = "#000"; c.fillText(s, x + 1, y + 1);
    c.fillStyle = col; c.fillText(s, x, y);
  };

  function hudScores(g, meId, suit) {
    const s = g.s, tm = teamsOf(s), all = hudEntries(g), rows = s.players.length > 4 ? all.filter((e) => !s.players[e.i]?.dormant) : all;
    c.fillStyle = "#000a"; c.fillRect(0, 0, cw, 13);
    c.font = "bold 8px monospace";
    const mark = (e, x) => {
      c.fillStyle = e.alive ? suit[e.i & 3] : "#444";
      c.fillRect(x + 1, 3, 6, 6);
      if (!e.alive) { c.fillStyle = "#e8453c"; c.fillRect(x, 5, 8, 2); }
      if (view.cb) txt(String(e.i + 1), x + 4, 9, "#fff", "center");
      if (e.i === meId) { c.strokeStyle = "#ffd23c"; c.lineWidth = 1; c.strokeRect(x + 0.5, 2.5, 7, 7); }
    };
    if (!tm) {
      const w = Math.min(70, (cw - 8) / rows.length);
      rows.forEach((e, k) => {
        const x = 4 + k * w;
        mark(e, x);
        txt(e.pts >= 0 ? `${e.score}/${e.pts}p` : `${e.name ? e.name.slice(0, w > 60 ? 8 : 5) + " " : ""}${e.score >= 0 ? e.score : ""}`, x + 10, 10, e.i === meId ? "#ffd23c" : "#fff");
      });
    } else {
      [...new Set(rows.map((e) => e.team))].slice(0, 2).forEach((t, k) => {
        const x0 = 4 + k * Math.floor(cw / 2), ti = teamInfo(t), mem = rows.filter((e) => e.team === t);
        txt(`${ti.name.toUpperCase()} ${mem[0].score}`, x0, 10, ti.col);
        mem.slice(0, 4).forEach((e, j) => mark(e, x0 + 46 + j * 11));
      });
    }
    if (g.win && !tm) txt(`FIRST TO ${g.win}`, 4, 23, "#fff9");
    c.textAlign = "center";
    if (s.tick >= SUDDEN - 300 && s.cfg?.suddenDeath !== false) {
      c.fillStyle = "#000b"; c.fillRect(cw / 2 - 48, 15, 96, 11);
      txt(s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON", cw / 2, 24, s.tick % 40 < 20 ? "#e8453c" : "#ffd23c", "center");
    }
  }

  function status(s) {
    const m = modeText(s), e = eventText(s);
    c.font = "bold 8px monospace";
    if (m) { c.fillStyle = "#000b"; c.fillRect(2, 26, m.length * 5 + 6, 11); txt(m, 5, 35, s.hill ? FLOORC.hill : s.potato ? FLOORC.potato : "#ff6a5c"); }
    if (e) { c.fillStyle = "#000b"; c.fillRect(2, 37, e.length * 5 + 6, 11); txt(e, 5, 46, EVENT_INFO[s.event.type].col); }
  }

  function minimap(s, p, th) {
    const S = MINI, x0 = cw - GW * S - 3, y0 = 15;
    c.fillStyle = "#000b"; c.fillRect(x0 - 1, y0 - 1, GW * S + 2, GH * S + 2);
    for (let pass = 1; pass <= 2; pass++) {
      c.fillStyle = pass === 1 ? th.hard[3] : th.soft[1];
      for (let i = 0; i < GW * GH; i++) if (s.grid[i] === pass) c.fillRect(x0 + (i % GW) * S, y0 + Math.floor(i / GW) * S, S, S);
    }
    c.fillStyle = "#ffd23c";
    for (let i = 0; i < s.items.length; i++) c.fillRect(x0 + s.items[i].x * S + 1, y0 + s.items[i].y * S + 1, S - 2, S - 2);
    for (let i = 0; i < s.bombs.length; i++) {
      const b = s.bombs[i], bp = bombPos(b, s.grid);
      if (b.ty === B_MINE && !mineSeen(s, b, me.id)) continue;
      c.fillStyle = "#000"; c.fillRect(x0 + bp[0] * S, y0 + bp[1] * S, S, S);
      c.fillStyle = "#fff"; c.fillRect(x0 + bp[0] * S + 1, y0 + bp[1] * S + 1, S - 2, S - 2);
    }
    c.fillStyle = "#ff8a1a";
    for (let i = 0; i < s.flames.length; i++) c.fillRect(x0 + s.flames[i].x * S, y0 + s.flames[i].y * S, S, S);
    const suit = palette().suit;
    for (let i = 0; i < s.players.length; i++) {
      const q = s.players[i];
      if (!q.alive || q.dormant) continue;
      c.fillStyle = i === me.id ? "#fff" : suit[i & 3];
      const r = i === me.id ? 4 : 3;
      c.fillRect(x0 + (q.x / T) * S - r / 2, y0 + (q.y / T) * S - r / 2, r, r);
    }
    c.fillStyle = "#ff3030";
    c.fillRect(x0 + camPX * S + dirX * 3 - 1, y0 + camPY * S + dirY * 3 - 1, 2, 2);
  }

  function face(g, p, s, clock) {
    const id = me.id & 3;
    let kind = "idle";
    if (!p.alive) kind = "dead";
    else {
      let scared = false;
      const px = p.x / T, py = p.y / T;
      for (let i = 0; i < s.flames.length && !scared; i++) scared = Math.hypot(s.flames[i].x + 0.5 - px, s.flames[i].y + 0.5 - py) < 1.5;
      for (let i = 0; i < s.bombs.length && !scared; i++) scared = s.bombs[i].owner !== me.id && s.bombs[i].t < 60 && Math.hypot(s.bombs[i].x + 0.5 - px, s.bombs[i].y + 0.5 - py) < 2.5;
      kind = scared ? "scared" : clock < me.grinUntil ? "grin" : !still && clock % 3300 < 130 ? "blink" : "idle";
    }
    const fx = cw / 2 - 12, fy = vh + 2;
    c.fillStyle = "#06060c"; c.fillRect(fx - 2, fy - 1, 28, 27);
    const pt = g.story ? portrait(g.story.id) : null;
    if (pt) {
      const sx = kind === "scared" && !still ? ((clock / 50) & 1) * 2 - 1 : 0;
      c.drawImage(pt, fx + sx, fy, 24, 24);
      if (kind === "dead") { c.fillStyle = "#c0101088"; c.fillRect(fx, fy, 24, 24); c.fillStyle = "#000"; for (let k = 0; k < 8; k++) { c.fillRect(fx + 5 + k, fy + 6 + k, 2, 2); c.fillRect(fx + 12 - k, fy + 6 + k, 2, 2); } }
    } else c.drawImage(faceOf(kind, id), fx, fy);
    c.strokeStyle = "#3a3a52"; c.lineWidth = 1; c.strokeRect(fx - 1.5, fy - 0.5, 27, 25);
  }

  function bar(g, p, s, th, clock) {
    c.fillStyle = "#14141f"; c.fillRect(0, vh, cw, BAR);
    c.fillStyle = th.hard[1]; c.fillRect(0, vh, cw, 1);
    c.fillStyle = "#000"; c.fillRect(0, vh + 1, cw, 1);
    face(g, p, s, clock);
    const po = s.potato;
    if (po) {
      const f = Math.max(0, Math.min(1, po.t / POTATO_TICKS));
      c.fillStyle = "#000"; c.fillRect(3, vh + BAR - 4, cw - 6, 4);
      c.fillStyle = !still && f < 0.25 && s.tick % 8 < 4 ? "#ff3b30" : FLOORC.potato; c.fillRect(4, vh + BAR - 3, (cw - 8) * f, 2);
    }
    const cx = cw / 2, sp = Math.min(36, (cx - 20) / 3), y = vh + 8, left = Math.max(0, p.bombs - me.bombs);
    c.font = "bold 8px monospace";
    stat(cx - 18 - sp * 3, y, 0, sp >= 32 ? pair(left, p.bombs) : num(left));
    stat(cx - 18 - sp * 2, y, 1, num(p.range));
    stat(cx - 18 - sp, y, 2, num(Math.round((p.speed - 1) * 4) + 1));
    let x = cx + 18;
    if (p.kick) { c.drawImage(ICONS[3], x, y - 1); x += 16; }
    if (p.remote) { c.drawImage(ICONS[4], x, y - 1); x += 16; }
    if (p.pass) { c.drawImage(ICONS[5], x, y - 1); x += 16; }
    if (p.shield > 0) { c.drawImage(ICONS[6], x, y - 1); txt(num(Math.ceil(p.shield / 60)), x + 16, y + 10, "#8fe8ff"); x += 30; }
    if (p.gl) { c.drawImage(ICONS[8], x, y - 1); x += 16; }
    if (p.pn) { c.drawImage(ICONS[9], x, y - 1); x += 16; }
    const h = heldBombs(p), a = abilityInfo(p);
    if (h) { c.drawImage(ICONS[9 + h.ty], x, y - 1); txt(`x${h.n}`, x + 16, y + 10, "#fff"); x += 30; }
    if (a) txt(`${a.name} ${a.ready ? "READY" : `${a.secs}s`}`, cw - 4, y + 10, a.ready ? "#ffd23c" : "#fff", "right");
  }

  function stat(x, y, ic, t) {
    c.drawImage(ICONS[ic], Math.max(3, x), y - 1);
    txt(t, Math.max(3, x) + 16, y + 10, "#fff");
  }

  function hand(p, s, clock) {
    if (!p.alive) return;
    const ready = me.bombs < p.bombs && p.curse?.type !== "nobomb";
    const d = still ? 1e9 : clock - me.throwAt, cx = cw / 2;
    const dip = d < 160 ? Math.sin((d / 160) * Math.PI) * 5 : 0;
    const hy = vh - 24 + dip;
    if (ready || d < 220) {
      let by = vh - 40;
      if (d < 220) by -= d * 0.17;
      else if (d < 380) by += 14;
      else if (d < 460) by += 14 * (1 - (d - 380) / 80);
      if (ready && d >= 380 || d < 220) c.drawImage(bigBomb, Math.round(cx - 15), Math.round(by + dip));
    }
    c.drawImage(P_.hand[me.id & 3], Math.round(cx - 22), Math.round(hy));
  }

  function banner(g) {
    if (!g.banner) return;
    const y = (vh >> 1) - 16;
    c.fillStyle = "#000b"; c.fillRect(0, y, cw, 32);
    c.fillStyle = "#ffd23c"; c.fillRect(0, y, cw, 1); c.fillRect(0, y + 31, cw, 1);
    c.fillStyle = "#fff"; c.font = g.retro ? '8px "Press Start 2P", monospace' : "bold 10px monospace"; c.textAlign = "center";
    c.fillText(g.banner, cw / 2, y + 20, cw - 8);
  }

  function callout(g) {
    const k = g.call, t = (g.clock - k.at) / (k.until - k.at), a = Math.min(1, t / 0.1, (1 - t) / 0.25);
    c.save();
    c.globalAlpha = Math.max(0, a);
    c.translate(cw / 2, vh * 0.34);
    if (!k.still) { const z = 1 + 0.5 * Math.max(0, 1 - t / 0.12); c.rotate(-0.04 * (1 - Math.min(1, t * 4))); c.scale(z, z); }
    c.font = g.retro ? '12px "Press Start 2P", monospace' : "900 20px monospace";
    c.textAlign = "center"; c.lineJoin = "round";
    c.lineWidth = 4; c.strokeStyle = "#000"; c.strokeText(k.text, 0, 0, cw - 20);
    c.fillStyle = "#ffd23c"; c.fillText(k.text, 0, 0, cw - 20);
    c.restore();
  }

  function bubbles(g, hz) {
    c.font = PIX; c.textAlign = "left";
    const box = [2, 14, cw - 2, vh - 2], hole = [cw * 0.38, vh * 0.3, cw * 0.62, vh * 0.7];
    for (let i = 0; i < 2; i++) {
      const b = g.bub[i], p = g.s.players[i];
      if (!b || !p) continue;
      const w = b.cols * 8 + 8, h = b.lines.length * 10 + 6;
      let ax = cw / 2, ay = vh - 4;
      if (i !== me.id) {
        project(camPX, camPY, dirX, dirY, pl.x, pl.y, p.x / T, p.y / T, pr);
        if (pr[1] > 0.3) { ax = (cw / 2) * (1 + pr[0] / pr[1]); ay = hz + (0.5 - 0.95) * (K / pr[1]); }
        else ay = 14;
      }
      placeBubble(spot, ax, ay, w, h, box, hole);
      const x = Math.round(spot.x), y = Math.round(spot.y);
      c.fillStyle = "#000"; c.fillRect(x - 1, y - 1, w + 2, h + 2);
      c.fillStyle = "#fff"; c.fillRect(x, y, w, h);
      if (spot.tail) { c.fillStyle = "#000"; c.fillRect(Math.round(ax) - 2, y + h, 5, 4); c.fillStyle = "#fff"; c.fillRect(Math.round(ax) - 1, y + h, 3, 3); }
      c.fillStyle = "#14141f";
      b.lines.forEach((l, k) => c.fillText(l, x + 4, y + 10 + k * 10));
    }
  }

  const emoLook = { k: 1, a: 1 };
  function emotes(g, hz) {
    c.textAlign = "center"; c.textBaseline = "middle";
    for (let i = 0; i < 4; i++) {
      const em = g.emo[i], p = g.s.players[i];
      if (!em || !p || p.dormant) continue;
      let ax = cw / 2, ay = vh - 22;
      if (i !== me.id) {
        project(camPX, camPY, dirX, dirY, pl.x, pl.y, p.x / T, p.y / T, pr);
        if (pr[1] <= 0.3) continue;
        ax = Math.min(Math.max((cw / 2) * (1 + pr[0] / pr[1]), 14), cw - 14);
        ay = Math.max(hz + (0.5 - 0.95) * (K / pr[1]) - 12, 20);
      }
      emoteLook(emoLook, em, g.clock, view.still);
      c.save();
      c.globalAlpha = emoLook.a;
      c.translate(Math.round(ax), Math.round(ay)); c.scale(emoLook.k, emoLook.k);
      c.fillStyle = "#000"; c.fillRect(-12, -9, 24, 18);
      c.fillStyle = "#fff"; c.fillRect(-11, -8, 22, 16);
      c.fillStyle = "#14141f";
      c.font = em.e === 7 ? PIX : "13px sans-serif";
      c.fillText(EMOTES[em.e], 0, 1);
      c.restore();
    }
    c.textBaseline = "alphabetic";
  }

  function track(g, p, s, clock) {
    if (s.tick < me.tick || me.id !== (g.me >= 0 ? g.me : 0)) { me.deadAt = -1e9; me.alive = true; }
    me.tick = s.tick;
    me.id = g.me >= 0 ? g.me : 0;
    let own = 0;
    for (let i = 0; i < s.bombs.length; i++) if (s.bombs[i].owner === me.id) own++;
    if (own > me.bombs && p.alive) { me.grinUntil = clock + 700; me.throwAt = clock; }
    me.bombs = own;
    if (me.alive && !p.alive) me.deadAt = clock;
    me.alive = p.alive;
  }

  function draw(g) {
    const now = performance.now();
    if (!need && MOBILE && now - lastDraw < 28) return;
    try {
      const s = g.s, p = s.players?.[g.me >= 0 ? g.me : 0];
      if (!p || !s.grid || s.grid.length !== GW * GH) return;
      need = false;
      lastDraw = now;
      const th = themeOf(s.cfg), pal = palette(), clock = g.clock ?? now;
      if (!T_ || thKey !== th.key) setLook(th);
      if (palRef !== pal) setPalette(pal);
      const dt = Math.min((now - lastNow) / 1000, 0.1);
      lastNow = now;
      track(g, p, s, clock);

      const target = (fps.face * Math.PI) / 2, d = angDiff(yaw, target);
      if (still || Math.abs(d) < 0.002) yaw = target;
      else yaw += d * (1 - Math.exp(-dt * 16));
      dirX = Math.sin(yaw); dirY = -Math.cos(yaw);
      planeOf(dirX, dirY, cw / (2 * K), pl);
      camPX = p.x / T; camPY = p.y / T;

      const moving = p.walk !== lastWalk && p.alive;
      lastWalk = p.walk;
      bobAmp += ((moving && !still ? 1 : 0) - bobAmp) * Math.min(1, dt * 10);
      bobPh += dt * 11 * bobAmp;
      flick = still ? 1 : 1 - 0.07 * (0.5 + 0.5 * Math.sin(clock * 0.011) * Math.sin(clock * 0.0173));
      const hz = vh / 2 + (still ? 0 : Math.sin(bobPh) * 1.6 * bobAmp);

      buildOv(s);
      floorCeil(hz);
      walls(s.grid, hz);
      ns = 0;
      collect(s, teamsOf(s), clock, me.id);
      sprites(hz);
      c.putImageData(img, 0, 0);

      hand(p, s, clock);
      if (!p.alive) {
        const fl = still ? 0.3 : 0.2 + 0.5 * Math.max(0, 1 - (clock - me.deadAt) / 700);
        c.fillStyle = `rgba(190,0,0,${fl})`; c.fillRect(0, 0, cw, vh);
      }
      bar(g, p, s, th, clock);
      hudScores(g, g.me, pal.suit);
      c.font = "bold 8px monospace";
      const cur = p.alive ? curseText(p) : "";
      if (cur) { c.fillStyle = "#000b"; c.fillRect(2, vh - 14, cur.length * 5 + 6, 11); txt(cur, 5, vh - 5, "#d58cff"); }
      else if (!p.alive && !s.done && !g.banner) { c.fillStyle = "#000b"; c.fillRect(cw / 2 - 66, vh - 14, 132, 11); txt("You're out – spectating", cw / 2, vh - 5, "#fff", "center"); }
      status(s);
      if (miniOn) minimap(s, p, th);
      banner(g);
      if (g.call) callout(g);
      if (g.bub && (g.bub[0] || g.bub[1])) bubbles(g, hz);
      if (g.emo) emotes(g, hz);
      ms += (performance.now() - now - ms) * 0.05;
    } catch (err) {
      if (String(err) !== errMsg) console.error((errMsg = String(err)), err);
    }
  }

  const setMini = (on) => {
    miniOn = on;
    need = true;
    try { localStorage.setItem("fpsmap", on ? "1" : "0"); } catch {}
  };
  addEventListener("keydown", (e) => {
    if (e.code === "KeyM" && !e.repeat && !canvas.hidden && e.target.tagName !== "INPUT" && !e.metaKey && !e.ctrlKey) setMini(!miniOn);
  });
  canvas.addEventListener("pointerdown", (e) => {
    const r = canvas.getBoundingClientRect(), x = ((e.clientX - r.left) / r.width) * cw, y = ((e.clientY - r.top) / r.height) * CH;
    if (x > cw - GW * MINI - 8 && y > 10 && y < 20 + GH * MINI) setMini(!miniOn);
  });
  addEventListener("resize", resize);
  resize();
  return { draw, resize, setStill: (on) => { still = on; need = true; }, get ms() { return ms; }, get mini() { return miniOn; } };
}
