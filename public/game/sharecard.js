export const CARD_W = 1200, CARD_H = 630;
export const FONT = '"Press Start 2P", monospace';
const BOMB = ["..........", "......ooo.", ".....o.yo.", "...ddd.o..", "..dddddd..", ".ddhdddddd", ".ddhdddddd", ".dddddddd.", "..dddddd..", "...dddd..."];

// Press Start 2P is monospaced (advance = font size), so layout needs no canvas.
export function wrap(text, max, lines = 3) {
  const out = [];
  let cur = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const word = w.length > max ? `${w.slice(0, max - 1)}.` : w;
    if (cur && cur.length + 1 + word.length > max) { out.push(cur); cur = word; } else cur = cur ? `${cur} ${word}` : word;
  }
  if (cur) out.push(cur);
  if (out.length > lines) { out.length = lines; out[lines - 1] = `${out[lines - 1].slice(0, max - 1)}.`; }
  return out;
}

// info: { kind: "daily" | "match", head, title, rules, big, bigLabel, line, extra, fighter, fighterName, host }
export function cardLayout(info, colour = "#ffd23c") {
  const ops = [], R = (x, y, w, h, c) => ops.push({ t: "rect", x, y, w, h, c }), T = (x, y, s, c, str, align = "left") => ops.push({ t: "text", x, y, s, c, str, align });
  R(0, 0, CARD_W, CARD_H, "#14141f");
  for (let y = 0; y < CARD_H; y += 6) R(0, y, CARD_W, 2, "#ffffff08");
  R(12, 12, CARD_W - 24, 6, colour);
  R(12, CARD_H - 18, CARD_W - 24, 6, colour);
  R(12, 12, 6, CARD_H - 24, colour);
  R(CARD_W - 18, 12, 6, CARD_H - 24, colour);
  T(56, 56, 48, "#ffd23c", "KABOOM");
  T(56 + 6 * 48 + 24, 56 + 14, 28, "#e8453c", "ARENA");
  T(56, 128, 18, "#ffffffb0", String(info.head ?? "").toUpperCase().slice(0, 34));
  let y = 176;
  for (const l of wrap(info.title ?? "", 19, 2)) { T(56, y, 36, "#ffffff", l); y += 52; }
  y += 6;
  for (const l of wrap(info.rules ?? "", 42, 3)) { T(56, y, 16, "#ffffffc0", l); y += 28; }
  y = Math.max(y + 14, 372);
  T(56, y, 18, "#ffffffa0", String(info.bigLabel ?? "SCORE"));
  T(56, y + 34, 72, colour, String(info.big ?? "").slice(0, 9));
  y += 34 + 72 + 22;
  for (const l of wrap(info.line ?? "", 30, 1)) { T(56, y, 22, "#ffffff", l); y += 36; }
  if (info.extra) T(56, y, 22, "#8be04a", String(info.extra).slice(0, 30));
  const px = 820, py = 150, size = 300;
  R(px - 10, py - 10, size + 20, size + 20, colour);
  R(px - 4, py - 4, size + 8, size + 8, "#000");
  if (info.fighter) ops.push({ t: "img", id: info.fighter, x: px, y: py, w: size, h: size });
  else {
    R(px, py, size, size, "#1d1450");
    const k = 24, ox = px + (size - 10 * k) / 2, oy = py + (size - 10 * k) / 2, pal = { o: "#b5703a", y: "#ffd23c", d: "#2b2b3d", h: "#6a6a8a" };
    BOMB.forEach((row, j) => [...row].forEach((c, i) => c !== "." && R(ox + i * k, oy + j * k, k, k, pal[c])));
  }
  if (info.fighterName) T(px + size / 2, py + size + 34, 18, "#ffffff", String(info.fighterName).slice(0, 16), "center");
  T(56, CARD_H - 58, 18, "#ffffffc0", String(info.host ?? "").slice(0, 40));
  T(CARD_W - 56, CARD_H - 58, 14, "#e8453c", "PRESS START", "right");
  return ops;
}

export function drawCard(ctx, ops, images = {}) {
  ctx.imageSmoothingEnabled = false;
  ctx.textBaseline = "top";
  for (const o of ops) {
    if (o.t === "rect") { ctx.fillStyle = o.c; ctx.fillRect(o.x, o.y, o.w, o.h); }
    else if (o.t === "text") { ctx.font = `${o.s}px ${FONT}`; ctx.textAlign = o.align; ctx.fillStyle = "#000"; ctx.fillText(o.str, o.x + Math.max(2, o.s / 12), o.y + Math.max(2, o.s / 12)); ctx.fillStyle = o.c; ctx.fillText(o.str, o.x, o.y); }
    else if (images[o.id]) ctx.drawImage(images[o.id], o.x, o.y, o.w, o.h);
    else { ctx.fillStyle = "#1d1450"; ctx.fillRect(o.x, o.y, o.w, o.h); }
  }
}

const loadImage = (src) => new Promise((res) => {
  const im = new Image();
  const t = setTimeout(() => res(null), 4000);
  im.onload = () => { clearTimeout(t); res(im); };
  im.onerror = () => { clearTimeout(t); res(null); };
  im.src = src;
});

export async function renderCard(info, colour) {
  try { await document.fonts.load(`16px ${FONT}`); } catch {}
  const img = info.fighter ? await loadImage(`/portraits/${encodeURIComponent(info.fighter)}.webp`) : null;
  const ops = cardLayout(info.fighter && !img ? { ...info, fighter: null } : info, colour);
  const cv = Object.assign(document.createElement("canvas"), { width: CARD_W, height: CARD_H });
  drawCard(cv.getContext("2d"), ops, img ? { [info.fighter]: img } : {});
  return cv;
}

// Web Share with the PNG where the browser can share files, otherwise a download.
export async function shareCard(info, { colour, text, url } = {}) {
  const cv = await renderCard(info, colour);
  const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
  if (!blob) return "failed";
  const file = new File([blob], "kaboom-arena.png", { type: "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Kaboom Arena", text, url }); return "shared"; } catch (e) { if (e?.name === "AbortError") return "cancelled"; }
  }
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "kaboom-arena.png" });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return "saved";
}
