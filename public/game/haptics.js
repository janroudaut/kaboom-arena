// Pure: backends are injected. vib = phone pattern (ms, on/off alternating), rum = [duration ms, strong, weak] for gamepads, gap = min ms between two firings.
const KINDS = {
  bomb: { vib: [40], rum: [30, 0, 0.3], gap: 120 },
  item: { vib: [45], rum: [50, 0, 0.5], gap: 100 },
  blast: { vib: [60], rum: [110, 0.7, 0.4], gap: 250 },
  curse: { vib: [30, 40, 30, 40, 60], rum: [220, 0.4, 0.8], gap: 800 },
  die: { vib: [260], rum: [500, 1, 0.6], gap: 1500 },
  win: { vib: [40, 60, 40, 60, 140], rum: [380, 0.5, 0.5], gap: 3000 },
  test: { vib: [60, 80, 60], rum: [300, 0.6, 0.6], gap: 0 },
};
// Many phones only render pulses of ~40-50 ms or more; silent / Do Not Disturb mode mutes them entirely.
const MIN_PULSE = 40;
const LEVEL = { low: 0.6, normal: 1, strong: 1.6 };

export const effect = (kind, intensity, scale = 1) => {
  const k = KINDS[kind], f = (LEVEL[intensity] ?? 1) * scale, [d, strong, weak] = k.rum;
  return {
    vib: k.vib.map((v, i) => (i % 2 ? v : Math.max(MIN_PULSE, Math.round(v * f)))),
    rum: { duration: Math.round(d * Math.min(f, 1.6)), strongMagnitude: Math.min(1, strong * f), weakMagnitude: Math.min(1, weak * f) },
  };
};

// targets: { phone: bool, pads: ["pad0", ...] }; settings is read on every call.
export function createHaptics({ vibrate, rumble, settings, now = () => performance.now() }) {
  const last = new Map();
  const due = (key, gap) => {
    const t = now();
    if (t - (last.get(key) ?? -Infinity) < gap) return false;
    last.set(key, t);
    return true;
  };
  return {
    fire(kind, targets, scale = 1) {
      const set = settings();
      if (!KINDS[kind] || !targets) return;
      const { vib, rum } = effect(kind, set.intensity, scale);
      const gap = KINDS[kind].gap;
      try {
        if (set.vibrate && targets.phone && due(`${kind}:phone`, gap)) vibrate(vib);
        if (set.rumble) for (const pad of targets.pads ?? []) if (due(`${kind}:${pad}`, gap)) rumble(pad, rum);
      } catch {}
    },
  };
}

export const browserVibrate = (pattern) => {
  try { return !!globalThis.navigator?.vibrate?.(pattern); } catch { return false; }
};

// What a "Test vibration" tap can tell the user: null = nothing was sent.
export const vibrationReport = (sent) =>
  !globalThis.navigator?.vibrate ? "This browser has no vibration support (iPhone and iPad never do)."
    : sent === null ? "Phone vibration is switched off above."
    : sent ? "Sent. If you feel nothing, check the phone: touch/vibration feedback on, battery saver off, silent and Do Not Disturb off."
    : "The browser refused it. Tap the screen once, then try again.";

export const browserRumble = (name, { duration, strongMagnitude, weakMagnitude }) => {
  try {
    const g = globalThis.navigator?.getGamepads?.()[+name.slice(3)];
    if (g?.vibrationActuator?.playEffect) {
      g.vibrationActuator.playEffect("dual-rumble", { startDelay: 0, duration, strongMagnitude, weakMagnitude })?.catch?.(() => {});
    } else g?.hapticActuators?.[0]?.pulse?.(Math.max(strongMagnitude, weakMagnitude), duration)?.catch?.(() => {});
  } catch {}
};

// Compares two views of the game and returns the haptic events of each player: [{ id, kind, scale }].
// mem is the caller-owned previous view ({} at first), it is replaced in place.
export function observe(mem, s, T = 16, W = 15) {
  const tile = (v) => Math.floor(v / T);
  const flames = new Set(s.flames.map((f) => f.y * W + f.x));
  const out = [];
  if (mem.tick !== undefined && s.tick >= mem.tick && mem.n === s.players.length) {
    const fresh = s.flames.filter((f) => !mem.flames.has(f.y * W + f.x));
    s.players.forEach((p, id) => {
      const q = mem.players[id], px = tile(p.x), py = tile(p.y);
      if (q.alive && !p.alive) out.push({ id, kind: "die" });
      if (!p.alive) return;
      if (s.bombs.filter((b) => b.owner === id).length > q.bombs) out.push({ id, kind: "bomb" });
      if (mem.items.some((it) => it.x === px && it.y === py) && !s.items.some((it) => it.x === px && it.y === py)) out.push({ id, kind: "item" });
      if (p.curse && !q.curse) out.push({ id, kind: "curse" });
      const near = Math.min(...fresh.map((f) => Math.abs(f.x - px) + Math.abs(f.y - py)));
      if (near <= 5) out.push({ id, kind: "blast", scale: 1 - near / 7 });
    });
    if (s.done && !mem.done) {
      const tm = s.cfg?.teams;
      s.players.forEach((p, id) => (tm && s.winnerTeam >= 0 ? tm[id] === s.winnerTeam : id === s.winner) && out.push({ id, kind: "win" }));
    }
  }
  Object.assign(mem, {
    tick: s.tick, n: s.players.length, done: s.done, flames, items: s.items.slice(),
    players: s.players.map((p) => ({ alive: p.alive, curse: !!p.curse, bombs: s.bombs.filter((b) => b.owner === p.id).length })),
  });
  return out;
}
