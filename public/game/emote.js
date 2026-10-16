export const EMOTES = ["😀", "😡", "😂", "👍", "💣", "🔥", "😱", "GG"];
export const COOLDOWN_MS = 2000, SHOW_MS = 2000;

export const validEmote = (e) => Number.isInteger(e) && e >= 0 && e < EMOTES.length;

// Emotes shown above players 0..3 plus the sender-side cooldown; `now` is any monotonic ms clock.
export function createEmotes() {
  const shown = [null, null, null, null], out = [null, null, null, null];
  let next = 0;
  return {
    ready: (now) => now >= next,
    sent: (now) => (next = now + COOLDOWN_MS),
    show(pid, e, now, mine) {
      if (pid >= 0 && pid < 4 && validEmote(e)) shown[pid] = { e, at: now, until: now + SHOW_MS, mine };
    },
    // Reused array: entries are null or { e, at, until, mine }; others' emotes are hidden unless `others`.
    view(now, others) {
      for (let i = 0; i < 4; i++) {
        const s = shown[i];
        out[i] = s && s.until > now && (others || s.mine) ? s : null;
      }
      return out;
    },
    reset() {
      shown.fill(null);
      next = 0;
    },
  };
}

// Pop-in and fade-out of one shown emote; reduced motion = static for the whole duration. Writes into `out` = { k, a }.
export function emoteLook(out, em, now, still) {
  const age = now - em.at, left = em.until - now;
  out.k = still ? 1 : Math.min(1, 0.5 + age / 240);
  out.a = still ? 1 : Math.min(1, left / 300);
  return out;
}
