import { newGame, step } from "./sim.js";
import { think } from "./ai.js";
import { draw, CW, CH } from "./render.js";

const menu = document.getElementById("menu");
const view = document.getElementById("attract");
const TOP = 16;
view.width = CW;
view.height = CH - TOP;
const vctx = view.getContext("2d");
const buf = Object.assign(document.createElement("canvas"), { width: CW, height: CH });
const bctx = buf.getContext("2d");
let still = false, raf = 0;

const FRAME_MS = matchMedia("(pointer: coarse)").matches ? 125 : 83;
let g, mem, acc = 0, last = performance.now(), restartAt = 0, drawnAt = 0;

function reset() {
  g = { s: newGame(4, Date.now()), scores: [0, 0, 0, 0], banner: "", me: -1 };
  mem = [{}, {}, {}, {}];
  restartAt = 0;
}

function tick(now) {
  raf = 0;
  if (menu.classList.contains("on") && !document.hidden && document.hasFocus()) {
    acc += Math.min(now - last, 100);
    while (acc >= 1000 / 60) {
      acc -= 1000 / 60;
      const s = g.s;
      if (s.done || s.tick > 60 * 100) {
        restartAt ||= now + 1500;
        if (now > restartAt) reset();
        break;
      }
      const inputs = {};
      for (const p of s.players) {
        if (s.tick % 6 === 0) mem[p.id] = think(s, p.id);
        inputs[p.id] = { ...mem[p.id] };
        mem[p.id].bomb = false;
      }
      step(s, inputs);
    }
    if (now - drawnAt >= FRAME_MS) {
      drawnAt = now;
      draw(bctx, g, false);
      vctx.drawImage(buf, 0, TOP, CW, CH - TOP, 0, 0, CW, CH - TOP);
      vctx.fillStyle = "#000a";
      vctx.fillRect(0, 0, CW, CH - TOP);
    }
  }
  last = now;
  if (!still) raf = requestAnimationFrame(tick);
}

export function setStill(on) {
  still = on;
  if (!on && !raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
}

reset();
raf = requestAnimationFrame(tick);
