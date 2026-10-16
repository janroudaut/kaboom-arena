// Procedural pixel art for the first-person view: paletted textures {w, h, idx, pal, n} (index 0 = transparent).
// Palette entries are ABGR Uint32 (ImageData byte order), colours are drawn from look.js themes / palette().

export const rgba = (hex, a = 255) => ((a << 24) | (parseInt(hex.slice(5, 7), 16) << 16) | (parseInt(hex.slice(3, 5), 16) << 8) | parseInt(hex.slice(1, 3), 16)) >>> 0;
export const mixHex = (a, b, k) => {
  const c = (i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, "0");
  return `#${c(1)}${c(3)}${c(5)}`;
};

export function tex(w, h, cols, draw) {
  const idx = new Uint8Array(w * h), pal = new Uint32Array(cols.length + 1);
  cols.forEach((c, i) => (pal[i + 1] = typeof c === "number" ? c : rgba(c)));
  const p = {
    dot(x, y, c) { if (x >= 0 && y >= 0 && x < w && y < h) idx[y * w + x] = c; },
    rect(x, y, rw, rh, c) { for (let j = y; j < y + rh; j++) for (let i = x; i < x + rw; i++) p.dot(i, j, c); },
    disc(cx, cy, r, c) { for (let j = Math.floor(cy - r); j <= cy + r; j++) for (let i = Math.floor(cx - r); i <= cx + r; i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) p.dot(i, j, c); },
    ellipse(cx, cy, rx, ry, fill, edge) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
        const d = ((i + 0.5 - cx) / rx) ** 2 + ((j + 0.5 - cy) / ry) ** 2;
        if (d <= 1) p.dot(i, j, edge && d > 0.7 ? edge : fill);
      }
    },
  };
  draw(p);
  return { w, h, idx, pal, n: pal.length };
}

const lcg = (seed) => () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// Column-major so a wall column is contiguous.
function transposed(t) {
  const out = new Uint8Array(t.idx.length);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) out[x * t.h + y] = t.idx[y * t.w + x];
  return { ...t, idx: out };
}

export const WALL = 32, FLOOR = 64;

export function stoneTex(th) {
  const r = lcg(11), [base, hi, lo, face, fhi, flo, stud] = th.hard;
  return transposed(tex(WALL, WALL, [base, hi, lo, face, fhi, flo, stud], (p) => {
    p.rect(0, 0, 32, 32, 1);
    p.rect(0, 0, 32, 2, 2); p.rect(0, 0, 2, 32, 2);
    p.rect(0, 30, 32, 2, 3); p.rect(30, 0, 2, 32, 3);
    p.rect(4, 4, 24, 24, 4);
    p.rect(4, 4, 24, 1, 5); p.rect(4, 4, 1, 24, 5);
    p.rect(4, 27, 24, 1, 6); p.rect(27, 4, 1, 24, 6);
    for (const [x, y] of [[6, 6], [23, 6], [6, 23], [23, 23]]) p.rect(x, y, 3, 3, 7);
    p.rect(11, 11, 10, 10, 6); p.rect(12, 12, 9, 9, 5); p.rect(12, 12, 8, 8, 4);
    for (let k = 0; k < 22; k++) { const x = 5 + ((r() * 22) | 0), y = 5 + ((r() * 22) | 0); if (x < 10 || x > 21 || y < 10 || y > 21) p.dot(x, y, r() < 0.5 ? 5 : 6); }
  }));
}

export function brickTex(th) {
  const r = lcg(5), [base, brick, hi] = th.soft;
  return transposed(tex(WALL, WALL, [base, brick, hi, mixHex(brick, "#000000", 0.2), mixHex(brick, "#ffffff", 0.12)], (p) => {
    p.rect(0, 0, 32, 32, 1);
    for (let row = 0; row < 4; row++) {
      for (let x0 = (row & 1 ? 8 : 0) - 16; x0 < 32; x0 += 16) {
        const c = [2, 2, 4, 5][(r() * 4) | 0];
        p.rect(x0, row * 8 + 1, 15, 7, c);
        p.rect(x0, row * 8 + 1, 15, 1, 3);
        p.rect(x0, row * 8 + 7, 15, 1, 1);
        for (let k = 0; k < 3; k++) p.dot(x0 + 1 + ((r() * 13) | 0), row * 8 + 3 + ((r() * 3) | 0), r() < 0.5 ? 4 : 3);
      }
    }
  }));
}

// 2x2 tiles of 32 texels: tile parity is bit 5 of each coordinate, so the checker wraps seamlessly.
export function floorTex(th) {
  const specks = [[3, 4], [10, 2], [6, 11], [12, 9]];
  return tex(FLOOR, FLOOR, [th.ground[0], th.ground[1], th.speck[0], th.speck[1]], (p) => {
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const k = (i + j) & 1;
      p.rect(i * 32, j * 32, 32, 32, 1 + k);
      for (const [x, y] of specks) p.rect(i * 32 + (x + k * 2) * 2, j * 32 + y * 2, 4, 2, 3 + k);
    }
  });
}

export function playerTex(suit, dark, back, frame) {
  return tex(16, 22, [suit, dark, "#ffd9b0", "#222222", "#111111", "#e8453c", "#ffffff"], (p) => {
    const [SU, DK, SK, SH, EY, RD, WH] = [1, 2, 3, 4, 5, 6, 7];
    p.rect(7, 0, 3, 3, RD); p.dot(8, 1, WH);
    p.disc(8, 8.5, 6.5, SU);
    p.rect(2, 9, 12, 1, DK);
    if (back) p.rect(4, 5, 8, 5, DK);
    else { p.rect(4, 5, 8, 6, SK); p.rect(5, 7, 2, 3, EY); p.rect(9, 7, 2, 3, EY); }
    p.rect(3, 13, 10, 6, SU); p.rect(3, 17, 10, 2, DK);
    p.rect(1, 14 + (frame ? 1 : 0), 2, 3, SK); p.rect(13, 14 + (frame ? 0 : 1), 2, 3, SK);
    p.rect(3, 19 + (frame ? 0 : 1), 4, 3, SH); p.rect(9, 19 + (frame ? 1 : 0), 4, 3, SH);
  });
}

export function bombTex(remote, spark) {
  return tex(14, 16, [remote ? "#4a0c10" : "#14141c", remote ? "#8a1c22" : "#2a2a38", remote ? "#e86a6a" : "#8a8aa0", "#b5703a", spark ? "#ffd23c" : "#ff7a2a", "#ffffff"], (p) => {
    p.disc(7, 10, 6.2, 1); p.disc(5.5, 8.5, 4, 2); p.disc(4.5, 7, 1.4, 3);
    p.rect(8, 3, 2, 3, 4); p.rect(8, 0, 3, 3, 5); p.dot(9, 1, 6);
  });
}

export function flameTex(frame) {
  const ph = frame * 2.1;
  return tex(16, 24, ["#e8453c", "#ff9a2a", "#ffe066", "#fff8d0"], (p) => {
    for (let x = 0; x < 16; x++) {
      const env = 1 - ((x - 7.5) / 8.5) ** 2, ht = 7 + 16 * env * Math.abs(Math.sin((x + ph) * 0.62)) ** 0.7;
      const top = 24 - Math.round(ht), mid = Math.abs(x - 7.5);
      for (let y = top; y < 24; y++) {
        const d = y - top;
        p.dot(x, y, d > 10 && mid < 2.6 ? 4 : d > 6 && mid < 4.6 ? 3 : d > 2 && mid < 6.6 ? 2 : 1);
      }
    }
  });
}

export const auraTex = (fill, edge) => tex(20, 26, [fill, edge], (p) => p.ellipse(10, 13, 10, 13, 1, 2));
export const shadowTex = () => tex(20, 5, [rgba("#000000", 110)], (p) => p.ellipse(10, 2.5, 10, 2.5, 1));
export const ringTex = (col) => tex(26, 7, [rgba("#000000", 150), col], (p) => { p.ellipse(13, 3.5, 13, 3.5, 1); p.ellipse(13, 3.5, 12, 2.9, 2); p.ellipse(13, 3.5, 10, 1.7, 0); });

const DIGITS = ["010110010010111", "111001111100111", "111001111001111", "101101111001001"];
export const digitTex = (n) => tex(5, 7, ["#000000", "#ffffff"], (p) => {
  const g = DIGITS[n];
  for (let k = 0; k < 15; k++) if (g[k] === "1") for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) p.dot(1 + (k % 3) + i, 1 + ((k / 3) | 0) + j, 1);
  for (let k = 0; k < 15; k++) if (g[k] === "1") p.dot(1 + (k % 3), 1 + ((k / 3) | 0), 2);
});

// Canvas (item icons) -> paletted texture; alpha 0 = transparent.
export function fromCanvas(cv) {
  const w = cv.width, h = cv.height, px = new Uint32Array(cv.getContext("2d").getImageData(0, 0, w, h).data.buffer);
  const idx = new Uint8Array(w * h), map = new Map(), pal = [0];
  px.forEach((c, i) => {
    if (c >>> 24 === 0) return;
    let k = map.get(c);
    if (k === undefined) { k = Math.min(pal.length, 255); if (k === pal.length) pal.push(c); map.set(c, k); }
    idx[i] = k;
  });
  return { w, h, idx, pal: Uint32Array.from(pal), n: pal.length };
}

// Paletted texture -> canvas, for HUD pieces.
export function toCanvas(t) {
  const cv = Object.assign(document.createElement("canvas"), { width: t.w, height: t.h }), c = cv.getContext("2d");
  const im = c.createImageData(t.w, t.h), px = new Uint32Array(im.data.buffer);
  for (let i = 0; i < px.length; i++) px[i] = t.pal[t.idx[i]];
  c.putImageData(im, 0, 0);
  return cv;
}

export const FACE_KINDS = ["idle", "blink", "grin", "scared", "dead"];
export function faceTex(kind, suit, dark) {
  return tex(24, 24, [suit, dark, "#ffd9b0", "#111111", "#e8453c", "#ffffff", "#6cc8ff", "#e8607a"], (p) => {
    const [SU, DK, SK, EY, RD, WH, BL, TG] = [1, 2, 3, 4, 5, 6, 7, 8];
    p.rect(10, 0, 4, 4, RD); p.dot(11, 1, WH);
    p.disc(12, 13, 10.5, SU);
    p.rect(2, 14, 20, 1, DK);
    p.rect(5, 8, 14, 11, SK);
    p.dot(5, 8, SU); p.dot(18, 8, SU); p.dot(5, 18, SU); p.dot(18, 18, SU);
    if (kind === "dead") {
      for (let k = 0; k < 4; k++) { p.dot(7 + k, 10 + k, EY); p.dot(10 - k, 10 + k, EY); p.dot(14 + k, 10 + k, EY); p.dot(17 - k, 10 + k, EY); }
      p.rect(9, 16, 7, 1, EY); p.rect(12, 17, 3, 2, TG);
    } else if (kind === "scared") {
      p.rect(7, 10, 5, 6, WH); p.rect(13, 10, 5, 6, WH);
      p.rect(9, 12, 2, 3, EY); p.rect(14, 12, 2, 3, EY);
      p.rect(11, 16, 3, 3, EY); p.rect(20, 6, 2, 3, BL); p.dot(20, 9, BL);
    } else if (kind === "grin") {
      p.rect(7, 11, 4, 2, EY); p.rect(14, 11, 4, 2, EY);
      p.rect(8, 15, 9, 3, EY); p.rect(9, 15, 7, 2, WH); p.rect(12, 15, 1, 2, EY);
    } else {
      if (kind === "blink") { p.rect(7, 13, 4, 1, EY); p.rect(14, 13, 4, 1, EY); }
      else { p.rect(8, 11, 3, 4, EY); p.rect(14, 11, 3, 4, EY); p.dot(8, 11, WH); p.dot(14, 11, WH); }
      p.rect(10, 16, 5, 1, EY); p.dot(9, 15, EY); p.dot(15, 15, EY);
    }
  });
}

export function handTex(suit, dark) {
  return tex(44, 24, [suit, dark, "#ffd9b0", "#c9956a", "#7a5030"], (p) => {
    const [SU, DK, SK, SD, OL] = [1, 2, 3, 4, 5];
    p.rect(10, 18, 24, 6, SU); p.rect(10, 18, 24, 2, DK);
    p.disc(22, 14, 11, OL); p.disc(22, 14, 10, SK);
    p.rect(8, 8, 8, 9, OL); p.rect(9, 9, 6, 7, SK);
    for (const x of [12, 18, 24, 30]) { p.disc(x, 8, 4.5, OL); p.disc(x, 8, 3.5, SK); p.rect(x - 1, 9, 2, 3, SD); }
  });
}

export function bigBombTex() {
  return tex(30, 32, ["#14141c", "#2a2a38", "#8a8aa0", "#b5703a", "#ffd23c", "#ffffff"], (p) => {
    p.disc(15, 19, 13, 1); p.disc(12, 16, 8.5, 2); p.disc(9, 12, 3, 3);
    p.rect(17, 3, 3, 6, 4); p.rect(16, 0, 5, 4, 5); p.rect(17, 1, 2, 2, 6);
  });
}
