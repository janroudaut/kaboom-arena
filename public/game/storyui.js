import { ROSTER, BY_ID, ladder, fightOf, load, save, begin, advance, playable } from "./campaign.js";
import { TEXT, PREMISE, banter } from "./story.js";

let store = {};
try { store = localStorage; } catch {}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const img = (id) => `<img src="/portraits/${id}.webp" width="256" height="256" alt="">`;
const cap = (id) => `${esc(BY_ID[id].name)}<small>${esc(TEXT[id].epithet)}</small>`;

// Static screens: timers only run while text is typing and during the 9..1 continue countdown.
export function createStoryUI({ root, show, fight, home, reduced }) {
  let st = load(store), sel = ROSTER[0].id, view = "", tid = 0, cd = 0, typing = null, texts = [], after = null;
  const endType = () => { clearInterval(tid); typing = null; };
  const stop = () => { endType(); clearTimeout(cd); };
  const on = () => root.classList.contains("on");

  function go(v, html, vars = {}) {
    stop();
    view = v;
    root.dataset.v = v;
    for (const [k, c] of Object.entries(vars)) root.style.setProperty(`--${k}`, c);
    root.innerHTML = html;
    show();
    root.scrollTop = 0;
    root.querySelector("[data-pri]")?.focus();
    if (texts.length) typeOut();
    texts = [];
  }

  const box = (rows) => {
    texts = rows.map((r) => r.text);
    return `<div class="dlg px">${rows.map((r) => `<p>${r.id ? `<b class="who" style="--c:${BY_ID[r.id].color}">${esc(BY_ID[r.id].name)}</b>` : ""}<span class="t"></span><span class="t h"></span></p>`).join("")}</div>`;
  };

  function typeOut() {
    const a = root.querySelectorAll(".t:not(.h)"), b = root.querySelectorAll(".t.h"), ts = texts;
    const total = ts.reduce((n, t) => n + t.length, 0);
    const paint = (n) => ts.forEach((t, k) => { const m = Math.max(0, Math.min(n, t.length)); n -= m; a[k].textContent = t.slice(0, m); b[k].textContent = t.slice(m); });
    if (reduced()) return paint(total);
    let n = 0;
    paint(0);
    typing = () => { paint(total); endType(); };
    tid = setInterval(() => { paint(++n); if (n >= total) endType(); }, 28);
  }

  const btn = (act, label, o = "") => `<button class="arc ${o.includes("alt") ? "alt" : ""}" data-act="${act}" ${o.includes("pri") ? "data-pri" : ""} ${o.includes("adv") ? "data-adv" : ""}>${label}</button>`;
  const fightNow = () => fight(fightOf(st.run.id, st.run.i));

  function select() {
    go("sel", `<h2 class="st-head">Select your fighter</h2>
      <div class="st-wrap"><div class="st-grid">${ROSTER.map((f) => {
        const lock = !playable(st, f.id);
        return `<button class="card ${lock ? "lock" : ""}" data-act="pick" data-id="${f.id}" style="--c:${f.color}" aria-pressed="false" aria-label="${lock ? "Locked fighter" : esc(f.name)}">${img(f.id)}<span>${lock ? "???" : esc(f.name)}</span>${st.cleared.includes(f.id) ? "<i>★</i>" : ""}</button>`;
      }).join("")}</div><div class="st-info px" id="stInfo"></div></div>
      <div class="st-btns" id="stBtns"></div><div class="dim">Insert coin · 1 credit</div>`);
    paintSel();
  }

  function paintSel() {
    const f = BY_ID[sel], t = TEXT[sel], lock = !playable(st, sel), run = st.run;
    for (const c of root.querySelectorAll(".card")) c.setAttribute("aria-pressed", c.dataset.id === sel);
    const info = root.querySelector("#stInfo");
    info.style.setProperty("--c", f.color);
    const saved = run && run.id !== sel ? `<p class="dim">Saved run: ${esc(BY_ID[run.id].name)}, fight ${run.i + 1}/${ladder(run.id).length}. A new run replaces it.</p>` : "";
    info.innerHTML = lock
      ? `<h2>???</h2><p>A mysterious challenger waits in the crypt. Clear the story once with anyone.</p>`
      : `<h2>${esc(f.name)}</h2><small>${esc(t.epithet)} · AGE ${esc(t.age)}</small><p>${esc(t.bio)}</p>${saved}`;
    root.querySelector("#stBtns").innerHTML = (lock ? "" : run?.id === sel
      ? btn("cont", `Continue · fight ${run.i + 1}/${ladder(sel).length}`, "pri") + btn("start", "New run", "alt")
      : btn("start", "Start", "pri")) + btn("back", "Back", "alt");
  }

  function pick(id, focus) {
    sel = id;
    paintSel();
    if (focus) root.querySelector(`.card[data-id="${id}"]`).focus();
  }

  function intro() {
    const f = BY_ID[sel];
    go("intro", `<h2 class="st-head">Kaboom Arena Tournament</h2><div class="one" style="--c:${f.color}">${img(sel)}</div>
      <h2>${esc(f.name)}</h2>${box([{ text: PREMISE }, { id: sel, text: TEXT[sel].intro }])}${btn("vs", "Enter the arena", "pri adv")}`, { c: f.color });
  }

  function vs() {
    const { id, i } = st.run, f = fightOf(id, i), a = BY_ID[id], b = BY_ID[f.foe], [la, lb] = banter(id, f.foe);
    go("vs", `<h2 class="st-head ${f.boss ? "red" : ""}">${f.boss ? "Final boss" : `Fight ${i + 1}/${f.n}`}</h2><div class="dim">Stage: ${esc(f.stage.name)}</div>
      <div class="vs"><figure style="--c:${a.color}">${img(id)}<figcaption>${cap(id)}</figcaption></figure><b class="big">VS</b>
      <figure class="flip" style="--c:${b.color}">${img(f.foe)}<figcaption>${cap(f.foe)}</figcaption></figure></div>
      ${box([{ id, text: la }, { id: f.foe, text: lb }])}${btn("fight", "Fight!", "pri adv")}`, { ca: a.color, cb: b.color });
  }

  function won(id, foe, out) {
    after = out.done ? () => ending(id, out.fresh) : vs;
    const next = out.done ? "" : `<div class="dim">Next: ${esc(BY_ID[ladder(id)[st.run.i]].name)}</div>`;
    go("win", `<h2 class="big">${out.done ? "Champion!" : "Stage clear"}</h2><div class="one" style="--c:${BY_ID[id].color}">${img(id)}</div>
      ${box([{ id, text: TEXT[id].victory }, { id: foe, text: TEXT[foe].defeat }])}${next}${btn("next", out.done ? "Epilogue" : "Next fight", "pri adv")}`);
  }

  function lost(id, foe) {
    go("lose", `<h2 class="big red">Continue?</h2><div class="big" id="cdn">9</div><div class="one" style="--c:${BY_ID[foe].color}">${img(foe)}</div>
      ${box([{ id, text: TEXT[id].defeat }, { id: foe, text: TEXT[foe].victory }])}
      <div class="st-btns">${btn("fight", "Retry fight", "pri adv")}${btn("giveup", "Give up", "alt")}</div>`);
    const num = root.querySelector("#cdn");
    let n = 9;
    const tick = () => { num.textContent = n || "GAME OVER"; if (n) cd = setTimeout(() => { n--; tick(); }, 1000); };
    tick();
  }

  function ending(id, fresh) {
    after = () => theEnd(fresh);
    go("end", `<h2 class="st-head">${esc(BY_ID[id].name)}'s ending</h2><div class="one" style="--c:${BY_ID[id].color}">${img(id)}</div>
      ${box(TEXT[id].ending.map((text) => ({ text })))}${btn("next", "Next", "pri adv")}`);
  }

  function theEnd(fresh) {
    after = fresh ? unlock : select;
    go("end", `<div class="big">The End</div><p>The Fuse dynasty will return.</p><div class="dim">Thanks for playing · Insert coin</div>${btn("next", "Continue", "pri")}`);
  }

  function unlock() {
    sel = "gunpowder";
    go("win", `<h2 class="big">New challenger!</h2><div class="one" style="--c:${BY_ID.gunpowder.color}">${img("gunpowder")}</div>
      <p>Grandpa Gunpowder is now playable.</p>${btn("pick-sel", "Select fighter", "pri")}`);
  }

  const acts = {
    pick: (d) => (d.id === sel && playable(st, sel) ? acts.start() : pick(d.id, true)),
    start: () => { if (begin(st, sel)) { save(store, st); intro(); } },
    cont: vs,
    back: home,
    vs,
    fight: fightNow,
    next: () => after(),
    giveup: select,
    "pick-sel": select,
  };

  root.addEventListener("click", (e) => {
    if (typing && e.target.closest("[data-adv], .dlg")) { typing(); e.stopPropagation(); }
  }, true);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) acts[b.dataset.act](b.dataset);
  });

  const KEYS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], KeyZ: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  function nav(dx, dy) {
    if (view !== "sel" || !on()) return;
    const i = ROSTER.findIndex((f) => f.id === sel), j = Math.max(0, Math.min(ROSTER.length - 1, i + dx + dy * 3));
    if (j !== i) pick(ROSTER[j].id, true);
  }
  addEventListener("keydown", (e) => {
    if (!on() || e.repeat) return;
    if (e.code === "Escape" && view === "sel") home();
    else if (KEYS[e.code] && view === "sel") { e.preventDefault(); nav(...KEYS[e.code]); }
  });

  return {
    open() { st = load(store); sel = st.run?.id ?? sel; select(); },
    result(ok) {
      const { id, i } = st.run, foe = ladder(id)[i];
      if (!ok) return lost(id, foe);
      const out = advance(st);
      save(store, st);
      won(id, foe, out);
    },
    nav,
    press() { if (on()) root.querySelector("[data-pri]")?.click(); },
  };
}
