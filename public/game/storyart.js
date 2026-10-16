// Ending art and the sidekick sprite, composed from rectangles (no assets). Static SVG, pixel-snapped.
const rect = (x, y, w, h, c) => ({ x, y, w, h, c });
const disc = (cx, cy, r, c) => {
  const out = [];
  for (let y = -r; y <= r; y++) {
    const w = Math.floor(Math.sqrt(r * r + 0.5 - y * y + r));
    out.push(rect(cx - w, cy + y, w * 2 + 1, 1, c));
  }
  return out;
};

export const ART = {
  sparky: { w: 16, h: 16, r: [
    rect(8, 3, 1, 2, "#8a6a3a"), rect(9, 2, 1, 1, "#8a6a3a"), rect(10, 1, 1, 1, "#ff8a1a"), rect(11, 0, 1, 1, "#ffd23c"), rect(9, 0, 1, 1, "#ffd23c"), rect(11, 2, 1, 1, "#ffd23c"), rect(10, 0, 1, 1, "#fff"),
    ...disc(8, 10, 5, "#14141f"), ...disc(8, 10, 4, "#ffe14a"),
    rect(4, 8, 2, 1, "#fff6c0"), rect(5, 7, 1, 1, "#fff6c0"),
    rect(5, 9, 2, 2, "#fff"), rect(9, 9, 2, 2, "#fff"), rect(6, 10, 1, 1, "#14141f"), rect(10, 10, 1, 1, "#14141f"),
    rect(7, 12, 3, 1, "#14141f"),
  ] },
  trophy: { w: 24, h: 24, r: [
    rect(3, 4, 3, 2, "#e0a416"), rect(3, 4, 2, 6, "#e0a416"), rect(3, 9, 4, 2, "#e0a416"),
    rect(18, 4, 3, 2, "#e0a416"), rect(19, 4, 2, 6, "#e0a416"), rect(17, 9, 4, 2, "#e0a416"),
    rect(6, 2, 12, 9, "#ffd23c"), rect(8, 11, 8, 2, "#ffd23c"), rect(10, 13, 4, 4, "#e0a416"),
    rect(7, 3, 2, 6, "#fff2a0"), rect(11, 5, 2, 2, "#fff"), rect(10, 6, 4, 1, "#fff"), rect(11, 4, 2, 4, "#fff"),
    rect(7, 17, 10, 3, "#8a5a10"), rect(5, 20, 14, 2, "#5a3a08"),
    rect(1, 1, 1, 1, "#fff"), rect(22, 2, 1, 1, "#fff"), rect(21, 15, 1, 1, "#fff"), rect(2, 14, 1, 1, "#fff"),
  ] },
  feast: { w: 24, h: 24, r: [
    rect(11, 4, 2, 2, "#ff8a1a"), rect(11, 6, 2, 3, "#fff"), rect(7, 9, 10, 5, "#ff9ec7"), rect(7, 9, 10, 1, "#fff"), rect(8, 12, 8, 1, "#e8453c"),
    rect(2, 14, 20, 2, "#c98a4a"), rect(3, 16, 2, 6, "#7a4a1a"), rect(19, 16, 2, 6, "#7a4a1a"),
    rect(3, 12, 4, 2, "#fff"), rect(17, 12, 4, 2, "#fff"), rect(5, 10, 1, 2, "#c0c0d0"), rect(18, 10, 1, 2, "#c0c0d0"),
    rect(5, 1, 2, 1, "#ff3b6b"), rect(8, 1, 2, 1, "#ff3b6b"), rect(5, 2, 5, 1, "#ff3b6b"), rect(6, 3, 3, 1, "#ff3b6b"), rect(7, 4, 1, 1, "#ff3b6b"),
  ] },
  tycoon: { w: 24, h: 24, r: [
    rect(7, 1, 10, 9, "#5a5a7e"), rect(7, 7, 10, 2, "#e8453c"), rect(4, 10, 16, 2, "#5a5a7e"), rect(8, 2, 2, 4, "#8a8ab0"),
    rect(2, 18, 8, 2, "#ffd23c"), rect(2, 20, 8, 2, "#e0a416"), rect(3, 16, 6, 2, "#ffd23c"), rect(4, 14, 4, 2, "#e0a416"),
    rect(14, 17, 8, 2, "#ffd23c"), rect(14, 19, 8, 2, "#e0a416"), rect(15, 21, 6, 1, "#8a5a10"),
    rect(10, 14, 4, 1, "#4ade80"), rect(11, 13, 2, 4, "#4ade80"), rect(10, 16, 4, 1, "#4ade80"),
    rect(20, 13, 1, 1, "#fff"), rect(1, 12, 1, 1, "#fff"),
  ] },
};

export function pixels(name, px = 8) {
  const a = ART[name];
  return `<svg class="pix" viewBox="0 0 ${a.w} ${a.h}" width="${a.w * px}" height="${a.h * px}" shape-rendering="crispEdges" aria-hidden="true">${a.r.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" fill="${r.c}"/>`).join("")}</svg>`;
}
