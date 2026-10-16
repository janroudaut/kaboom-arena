// First-person controls for "Bomber Shooter": turns the merged {dx, dy, bomb} input into an axis-aligned sim input.
// left/right = 90 degree turn (edge-triggered, then repeats while held), up/down = forward/back along the facing axis.
import { FACES } from "./raycast.js";

export const REPEAT_DELAY = 20, REPEAT_EVERY = 12;

// Gamepad shoulder buttons (LB/RB) strafe.
export const padStrafe = (pads) => {
  for (const g of pads || []) if (g?.connected) { const d = (g.buttons[5]?.pressed ? 1 : 0) - (g.buttons[4]?.pressed ? 1 : 0); if (d) return d; }
  return 0;
};

export function createFps() {
  let turning = 0, hold = 0, last = -1, keys = 0;
  const f = {
    face: 1,
    pads: null,
    reset() { turning = hold = 0; last = -1; },
    turn(t) { f.face = (f.face + t + 4) & 3; },
    // Mutates and returns the input; call exactly once per sim step (repeat timing counts steps).
    map(inp, tick = 0, spawnFace = 1) {
      if (last < 0 || tick < last) f.face = spawnFace;
      last = tick;
      const t = Math.sign(inp.dx);
      if (t !== turning) { turning = t; hold = 0; if (t) f.turn(t); }
      else if (t && ++hold >= REPEAT_DELAY && (hold - REPEAT_DELAY) % REPEAT_EVERY === 0) f.turn(t);
      let mx = 0, my = 0;
      if (inp.dy) { const s = -Math.sign(inp.dy), d = FACES[f.face]; mx = d[0] * s; my = d[1] * s; }
      else {
        const sv = keys || (f.pads ? padStrafe(f.pads()) : 0);
        if (sv) { const d = FACES[(f.face + (sv > 0 ? 1 : 3)) & 3]; mx = d[0]; my = d[1]; }
      }
      inp.dx = mx || 0;
      inp.dy = my || 0;
      return inp;
    },
    // Strafe on physical Comma / Period and on the gamepad shoulders; call once.
    bind(target = globalThis) {
      const held = [], dir = { Comma: -1, Period: 1 };
      f.pads = () => target.navigator?.getGamepads?.();
      target.addEventListener("keydown", (e) => {
        if (dir[e.code] && e.target?.tagName !== "INPUT" && !held.includes(e.code)) { held.push(e.code); keys = dir[e.code]; }
      });
      target.addEventListener("keyup", (e) => {
        const i = held.indexOf(e.code);
        if (i >= 0) { held.splice(i, 1); keys = held.length ? dir[held.at(-1)] : 0; }
      });
      target.addEventListener("blur", () => { held.length = 0; keys = 0; });
    },
  };
  return f;
}

export const fps = createFps();
