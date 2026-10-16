import { CATCHPHRASE, DISCLAIMER, PANEL_FIELDS, BOOT_STAGES, BOOT_MS, bootState, valueText } from "./dlss6.js";

const CSS = `
#d6splash, #d6panel { position: fixed; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 12px; font-family: var(--pixel, monospace); color: #e5d2ff; }
#d6splash { background: #07050f; flex-direction: column; gap: 14px; text-align: center; cursor: pointer; }
#d6splash h2 { margin: 0; font-size: clamp(14px, 4.2vw, 30px); line-height: 1.5; color: #d6a8ff; text-shadow: 3px 3px #3c5cff; }
#d6splash .bar { width: min(80vw, 480px); height: 18px; border: 2px solid #b46cff; padding: 2px; }
#d6splash .bar i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #b46cff, #3c5cff); }
#d6splash p { margin: 0; font-size: 10px; line-height: 1.8; min-height: 2em; }
#d6splash small, #d6panel small.disc { font-size: 9px; color: #fffc; }
#d6panel { background: #0b0b12cc; }
#d6panel .win { width: min(94vw, 440px); max-height: 94vh; overflow-y: auto; background: #1b1a24; border: 2px solid #b46cff; box-shadow: 0 8px 40px #000c; }
#d6panel header { padding: 10px 12px; background: linear-gradient(90deg, #3c2a7a, #1b1a24); font-size: 11px; line-height: 1.6; }
#d6panel header b { display: block; font-size: 13px; color: #d6a8ff; }
#d6panel ul { list-style: none; margin: 0; padding: 8px 12px; display: grid; gap: 4px; }
#d6panel li { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; font-size: 10px; line-height: 1.6; }
#d6panel li span small { display: block; color: #d6a8ff; font-size: 9px; }
#d6panel button { min-width: 0; padding: 8px 12px; font-size: 10px; border-radius: 6px; border-bottom-width: 3px; }
#d6panel button[role=switch] { width: 52px; padding: 8px 0; background: #333348; }
#d6panel button[role=switch][aria-checked=true] { background: #b46cff; color: #14141f; }
#d6panel input[type=range] { width: 130px; min-width: 0; padding: 0; accent-color: #b46cff; text-transform: none; letter-spacing: 0; background: none; }
#d6panel footer { padding: 8px 12px 12px; display: grid; gap: 8px; }
#d6panel footer div { display: flex; gap: 8px; }
#d6panel footer button { flex: 1; }
#d6panel small.disc { text-align: center; font-size: 10px; color: #fff; }
`;

export function createDlssUi({ api, reduced, layer, holdPause, busy }) {
  let style = null, splashEl = null, panelEl = null, release = null, from = null, stopSplash = null;
  const ensureStyle = () => { if (!style) { style = Object.assign(document.createElement("style"), { textContent: CSS }); document.head.append(style); } };
  const el = (tag, props = {}, ...kids) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids); return e; };
  let seen = false;
  try { seen = sessionStorage.getItem("dlss6splash") === "1"; } catch {}

  function splash() {
    if (seen || splashEl) return;
    seen = true;
    try { sessionStorage.setItem("dlss6splash", "1"); } catch {}
    if (busy()) return;
    ensureStyle();
    const still = reduced();
    const bar = el("i"), stage = el("p");
    splashEl = el("div", { id: "d6splash", tabIndex: -1 }, el("h2", { textContent: CATCHPHRASE }), el("div", { className: "bar" }, bar), stage, el("small", { textContent: DISCLAIMER }), el("small", { textContent: "Press any key or tap to skip" }));
    splashEl.setAttribute("role", "dialog");
    splashEl.setAttribute("aria-label", "DLSS 6 shader compilation (parody)");
    document.activeElement?.blur?.();
    document.body.append(splashEl);
    splashEl.focus();
    let raf = 0, timer = 0;
    const done = () => {
      cancelAnimationFrame(raf); clearTimeout(timer);
      removeEventListener("keydown", skip, true);
      removeEventListener("keyup", swallow, true);
      splashEl?.remove(); splashEl = stopSplash = null;
    };
    const skip = (e) => { e.preventDefault(); e.stopPropagation(); done(); };
    const swallow = (e) => { e.preventDefault(); };
    stopSplash = done;
    addEventListener("keydown", skip, true);
    addEventListener("keyup", swallow, true);
    splashEl.addEventListener("pointerdown", skip);
    if (still) {
      bar.style.width = "100%";
      stage.textContent = BOOT_STAGES.at(-1);
      timer = setTimeout(done, 1500);
      return;
    }
    const t0 = performance.now();
    let last = -1;
    const tick = () => {
      const b = bootState(performance.now() - t0);
      if (b.done) return done();
      if (b.stage !== last) { last = b.stage; stage.textContent = `${BOOT_STAGES[b.stage]}…`; }
      bar.style.width = `${(b.pct * 100).toFixed(0)}%`;
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function open() {
    if (panelEl) return;
    ensureStyle();
    from = document.activeElement;
    release = holdPause();
    const rows = PANEL_FIELDS.filter((f) => !(f.heavy && api.mobile)).map((f) => {
      const val = el("small");
      const refresh = () => { val.textContent = valueText(f, api.opt[f.key]); };
      let ctl;
      if (f.kind === "switch") {
        ctl = el("button", { type: "button", textContent: "" });
        ctl.setAttribute("role", "switch");
        ctl.setAttribute("aria-label", f.label);
        ctl.onclick = () => api.setOpt(f.key, !api.opt[f.key]);
      } else {
        ctl = el("input", { type: "range", min: f.min, max: f.max, step: 1 });
        ctl.setAttribute("aria-label", f.label);
        ctl.oninput = () => api.setOpt(f.key, +ctl.value);
      }
      const sync = () => {
        refresh();
        if (f.kind === "switch") { ctl.setAttribute("aria-checked", String(api.opt[f.key])); ctl.textContent = api.opt[f.key] ? "ON" : "OFF"; }
        else ctl.value = api.opt[f.key];
      };
      ctl.addEventListener(f.kind === "switch" ? "click" : "input", sync);
      sync();
      return { li: el("li", {}, el("span", { textContent: f.label }, val), ctl), sync };
    });
    const reset = el("button", { type: "button", className: "alt", textContent: "Restore defaults" });
    reset.onclick = () => { api.resetOpt(); rows.forEach((r) => r.sync()); };
    const close = el("button", { type: "button", textContent: "Close" });
    close.onclick = shut;
    const win = el("div", { className: "win" },
      el("header", {}, el("b", { textContent: "DLSS 6 Control Panel" }), CATCHPHRASE),
      el("ul", {}, ...rows.map((r) => r.li)),
      el("footer", {}, el("div", {}, reset, close), el("small", { className: "disc", textContent: DISCLAIMER })));
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-label", "DLSS 6 control panel (parody)");
    panelEl = el("div", { id: "d6panel" }, win);
    panelEl.addEventListener("pointerdown", (e) => e.target === panelEl && shut());
    document.body.append(panelEl);
    addEventListener("keydown", trap, true);
    layer.open();
    (win.querySelector("button, input"))?.focus();
  }

  function shut() {
    if (!panelEl) return;
    removeEventListener("keydown", trap, true);
    panelEl.remove(); panelEl = null;
    layer.close();
    release?.(); release = null;
    from?.isConnected && from.focus?.();
  }

  // Esc and G close; every other key stays out of the game (keyups are not swallowed, so held keys still release).
  function trap(e) {
    if (e.code === "Escape" || (e.code === "KeyG" && !e.repeat)) { e.preventDefault(); e.stopPropagation(); shut(); return; }
    if (e.code === "Tab") {
      const c = [...panelEl.querySelectorAll("button, input")], i = c.indexOf(document.activeElement);
      if (e.shiftKey ? i <= 0 : i === c.length - 1) { e.preventDefault(); c[e.shiftKey ? c.length - 1 : 0].focus(); }
    }
    if (!e.metaKey && !e.ctrlKey) e.stopPropagation();
  }

  return {
    splash, open, close: shut, toggle: () => (panelEl ? shut() : open()),
    destroy() { stopSplash?.(); shut(); style?.remove(); style = null; },
  };
}
