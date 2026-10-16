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

const MODES = ["classic", "hill", "potato", "survival"], TILES = ["off", "few", "many"];

// Public room list from the server: nothing is trusted, every field is rebuilt.
export function cleanRooms(raw) {
  if (!Array.isArray(raw)) return [];
  const int = (v, max) => (Number.isInteger(v) ? Math.min(Math.max(v, 0), max) : 0);
  return raw.slice(0, 20).flatMap((r) =>
    typeof r?.code === "string" && /^[A-Z0-9]{4}$/.test(r.code)
      ? [{
        code: r.code, host: cleanName(r.host), mode: MODES.includes(r.mode) ? r.mode : "classic", tiles: TILES.includes(r.tiles) ? r.tiles : "off",
        chaos: r.chaos === true, bombs: r.bombs === true, abilities: r.abilities === true,
        open: int(r.open, 3), specs: int(r.specs, 6), live: r.live === true,
      }]
      : [],
  );
}

// Quick play: rooms that can still take a player, fullest first (the server order breaks ties), at most `n` attempts.
export function quickPick(rooms, n = 3) {
  return rooms.filter((r) => !r.live && r.open > 0).sort((a, b) => a.open - b.open).slice(0, n);
}
