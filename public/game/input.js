const SCHEMES = {
  kb1: { KeyW: [0, -1], KeyZ: [0, -1], KeyS: [0, 1], KeyA: [-1, 0], KeyQ: [-1, 0], KeyD: [1, 0], Space: "bomb", KeyE: "act", ShiftLeft: "act" },
  kb2: { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0], Enter: "bomb", ShiftRight: "act", Numpad0: "act", Digit0: "act" },
};

// The pad's X button is the ability key only while the game uses abilities (main.js sets it); otherwise every button still drops a bomb.
export const pads = { act: false };

export const sources = { kb1: blank(), kb2: blank(), touch: blank() };
export const SOURCE_LABEL = { kb1: "Keyboard WASD/ZQSD + Space", kb2: "Keyboard arrows + Enter", touch: "Touch" };

function blank() {
  return { dx: 0, dy: 0, bomb: false, act: false };
}

export function merge(names) {
  const out = blank();
  for (const n of names) {
    const s = sources[n];
    if (!s) continue;
    if (!out.dx && !out.dy) { out.dx = s.dx; out.dy = s.dy; }
    out.bomb ||= s.bomb;
    out.act ||= s.act;
  }
  return out;
}

export const clearBombs = () => { for (const s of Object.values(sources)) s.bomb = s.act = false; };

export function createInput(pad, bombBtn, actBtn, onPress, onChange, onPause) {
  const set = (name, dx, dy) => {
    const s = sources[name];
    if (s.dx === dx && s.dy === dy) return;
    s.dx = dx; s.dy = dy;
    onChange();
  };
  const press = (name) => { sources[name].bomb = true; onPress(name); onChange(); };

  const held = { kb1: [], kb2: [] };
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || (e.target.tagName === "BUTTON" && !e.target.closest("#game"))) return;
    for (const [name, map] of Object.entries(SCHEMES)) {
      const v = map[e.code];
      if (!v || (v === "act" && (e.ctrlKey || e.metaKey || e.altKey))) continue;
      e.preventDefault();
      if (v === "bomb") { if (!e.repeat) press(name); }
      else if (v === "act") { if (!e.repeat) sources[name].act = true; }
      else {
        if (!held[name].includes(e.code)) held[name].push(e.code);
        set(name, ...map[held[name].at(-1)]);
      }
    }
  });
  addEventListener("keyup", (e) => {
    for (const [name, map] of Object.entries(SCHEMES)) {
      const i = held[name].indexOf(e.code);
      if (i < 0) continue;
      held[name].splice(i, 1);
      set(name, ...(held[name].length ? map[held[name].at(-1)] : [0, 0]));
    }
  });
  addEventListener("blur", () => { for (const n of ["kb1", "kb2"]) { held[n].length = 0; set(n, 0, 0); } });

  let origin = null;
  const knob = pad.firstElementChild;
  pad.addEventListener("pointerdown", (e) => {
    pad.setPointerCapture(e.pointerId);
    origin = { x: e.clientX, y: e.clientY };
  });
  pad.addEventListener("pointermove", (e) => {
    if (!origin) return;
    const vx = e.clientX - origin.x, vy = e.clientY - origin.y;
    knob.style.transform = `translate(${Math.max(-30, Math.min(30, vx))}px,${Math.max(-30, Math.min(30, vy))}px)`;
    if (Math.hypot(vx, vy) < 14) return set("touch", 0, 0);
    if (Math.abs(vx) > Math.abs(vy)) set("touch", Math.sign(vx), 0);
    else set("touch", 0, Math.sign(vy));
  });
  const release = () => { origin = null; knob.style.transform = ""; set("touch", 0, 0); };
  pad.addEventListener("pointerup", release);
  pad.addEventListener("pointercancel", release);
  bombBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); press("touch"); });
  actBtn.addEventListener("pointerdown", (e) => { e.preventDefault(); sources.touch.act = true; });

  const prev = {};
  function poll() {
    const live = new Set();
    for (const g of navigator.getGamepads?.() || []) {
      if (!g?.connected) continue;
      const name = `pad${g.index}`;
      live.add(name);
      sources[name] ||= blank();
      prev[name] ||= { key: "0,0", bomb: false, start: false };
      const b = (i) => g.buttons[i]?.pressed;
      let dx = (b(15) ? 1 : 0) - (b(14) ? 1 : 0), dy = (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
      if (!dx && !dy) {
        const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
        if (Math.hypot(ax, ay) > 0.5) Math.abs(ax) > Math.abs(ay) ? (dx = Math.sign(ax)) : (dy = Math.sign(ay));
      }
      const key = `${dx},${dy}`;
      if (key !== prev[name].key) { prev[name].key = key; set(name, dx, dy); }
      const bomb = b(0) || b(1) || (!pads.act && b(2)) || b(3) || b(7);
      if (bomb && !prev[name].bomb) press(name);
      const act = pads.act && b(2);
      if (act && !prev[name].act) sources[name].act = true;
      prev[name].act = act;
      prev[name].bomb = bomb;
      const startBtn = b(9);
      if (startBtn && !prev[name].start) onPause?.();
      prev[name].start = startBtn;
    }
    for (const n of Object.keys(sources)) if (n.startsWith("pad") && !live.has(n)) delete sources[n];
  }
  return { poll };
}

export const labelOf = (n) => SOURCE_LABEL[n] || `Gamepad ${+n.slice(3) + 1}`;
