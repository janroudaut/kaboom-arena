export const MAX_NAME = 12;
const COLORS = ["White", "Black", "Red", "Blue"];

// Names come from other players: strip control/format chars, collapse spaces, cap length.
export const cleanName = (s) =>
  typeof s === "string" ? s.replace(/[\p{C}\p{Z}]+/gu, " ").trim().slice(0, MAX_NAME).trim() : "";

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// Display labels per player id: humans keep their name (or fallback), bots are numbered.
// `humans[i]` is truthy when player i is human, `names[i]` its raw nickname.
export function displayNames(n, humans, names, fallback = COLORS) {
  let bot = 0;
  return Array.from({ length: n }, (_, i) => (humans[i] ? cleanName(names[i]) || fallback[i] : `Bot ${++bot}`));
}

export function roomFromSearch(search) {
  const c = new URLSearchParams(search).get("room")?.trim().toUpperCase();
  return c && /^[A-Z0-9]{4}$/.test(c) ? c : null;
}

export const inviteUrl = (origin, code) => `${origin}/?room=${encodeURIComponent(code)}`;

// Host-side join policy. A started match keeps departed guests' slots reserved so the same cid can take them back.
export function admit(slots, cid, started, max = 4) {
  if (slots.includes(cid)) return "back";
  return started || slots.length >= max ? "full" : "new";
}

// Leaving before the start frees the slot; during a match it stays reserved (a bot plays it meanwhile).
export function release(slots, names, cid, started) {
  const i = slots.indexOf(cid);
  if (i > 0 && !started) { slots.splice(i, 1); names.splice(i, 1); }
  return i;
}
