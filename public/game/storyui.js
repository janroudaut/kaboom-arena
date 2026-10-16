import { ROSTER, BY_ID, ladder, fightOf, load, save, begin, advance, continued, playable, actor, pendingChoice, endingsOf, effectNotes, ENDINGS } from "./campaign.js";
import { TEXT, PREMISE, banter, DUO, sideLine, sideCheer, sideLose, CHOICE_TEXT, ENDING_TEXT, fillText } from "./story.js";
import { pixels } from "./storyart.js";

let store = {};
try { store = localStorage; } catch {}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
const img = (id) => `<img src="/portraits/${id}.webp" width="256" height="256" alt="" data-p="${id}">`;
const mini = (id) => `<img class="mini" src="/portraits/${id}.webp" width="48" height="48" alt="" data-p="${id}">`;
const cap = (id) => `${esc(BY_ID[id].name)}<small>${esc(TEXT[id].epithet)}</small>`;
const SECRETS = ENDINGS.slice(1);

// Static screens: timers only run while text is typing and during the 9..1 continue countdown.
// `coopOk()` says whether a second input source is plausible, `label(source)` names one, `auto` fast-forwards choices (dev flag).
export function createStoryUI({ root, show, fight, home, reduced, blip = () => {}, sfx = () => {}, coopOk = () => false, label = String, auto = null }) {
  let st = load(store), sel = ROSTER[0].id, view = "", tid = 0, cd = 0, typing = null, texts = [], who = [], after = null, humans = [], armed = null;
  const endType = () => { clearInterval(tid); typing = null; };
  const stop = () => { endType(); clearTimeout(cd); };
  const on = () => root.classList.contains("on");
  const co = () => !!st.run?.co;

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
    rows = rows.filter(Boolean);
    texts = rows.map((r) => r.text);
    who = rows.map((r) => r.id);
    return `<div class="dlg px">${rows.map((r) => `<p>${r.id ? `<b class="who" style="--c:${actor(r.id).color}">${esc(actor(r.id).name)}</b>` : ""}<span class="t"></span><span class="t h"></span></p>`).join("")}</div>`;
  };

  // Keep the caret visible when the dialogue box scrolls on its own.
  function follow() {
    const d = root.querySelector(".dlg");
    if (!d || d.scrollHeight <= d.clientHeight) return;
    let last = null;
    for (const el of root.querySelectorAll(".t:not(.h)")) if (el.textContent) last = el;
    last?.scrollIntoView({ block: "nearest" });
  }

  function typeOut() {
    const a = root.querySelectorAll(".t:not(.h)"), b = root.querySelectorAll(".t.h"), ts = texts;
    const total = ts.reduce((n, t) => n + t.length, 0);
    const paint = (n) => ts.forEach((t, k) => { const m = Math.max(0, Math.min(n, t.length)); n -= m; a[k].textContent = t.slice(0, m); b[k].textContent = t.slice(m); });
    if (reduced()) return paint(total);
    let n = 0;
    paint(0);
    typing = () => { paint(total); follow(); endType(); };
    tid = setInterval(() => {
      paint(++n);
      follow();
      if (n % 2 === 0) { let k = 0, m = n; while (k < ts.length - 1 && m > ts[k].length) m -= ts[k++].length; if (ts[k][m - 1] > " ") blip(who[k] ?? "narrator"); }
      if (n >= total) endType();
    }, 28);
  }

  const btn = (act, label, o = "") => `<button class="arc ${o.includes("alt") ? "alt" : ""}" data-act="${act}" ${o.includes("pri") ? "data-pri" : ""} ${o.includes("adv") ? "data-adv" : ""}>${label}</button>`;
  const run = () => fightOf(st.run.id, st.run.i, st.run);
  const fightNow = () => fight({ ...run(), humans: [...humans] });

  function select() {
    armed = null;
    go("sel", `<h2 class="st-head">Select your fighter</h2>
      <div class="st-wrap"><div class="st-grid">${ROSTER.map((f) => {
        const lock = !playable(st, f.id);
        return `<button class="card ${lock ? "lock" : ""}" data-act="pick" data-id="${f.id}" style="--c:${f.color}" aria-pressed="false" aria-label="${lock ? "Locked fighter" : esc(f.name)}">${img(f.id)}<span>${lock ? "???" : esc(f.name)}</span>${st.cleared.includes(f.id) ? "<i>★</i>" : ""}${st.coop.includes(f.id) ? `<i class="co">2P</i>` : ""}</button>`;
      }).join("")}</div><div class="st-info px" id="stInfo"></div></div>
      <div class="st-btns" id="stOpts"></div><div class="st-btns" id="stBtns"></div><div class="dim">Insert coin · 1 credit</div>`);
    paintSel();
  }

  function paintSel() {
    const f = BY_ID[sel], t = TEXT[sel], lock = !playable(st, sel), run = st.run;
    for (const c of root.querySelectorAll(".card")) c.setAttribute("aria-pressed", c.dataset.id === sel);
    const info = root.querySelector("#stInfo");
    info.style.setProperty("--c", f.color);
    const saved = run && run.id !== sel ? `<p class="dim">Saved run: ${esc(BY_ID[run.id].name)}, fight ${run.i + 1}/${ladder(run.id).length}${run.co ? ", 2 players" : ""}. A new run replaces it.</p>` : "";
    const badge = st.cleared.includes(sel) ? `<p class="dim">★ Cleared${st.coop.includes(sel) ? " · also in co-op" : ""}</p>` : "";
    info.innerHTML = lock
      ? `<h2>???</h2><p>A mysterious challenger waits in the crypt. Clear the story once with anyone.</p>`
      : `<h2>${esc(f.name)}</h2><small>${esc(t.epithet)} · AGE ${esc(t.age)}</small><p>${esc(t.bio)}</p>${badge}${saved}`;
    const ok = coopOk();
    root.querySelector("#stOpts").innerHTML = ok
      ? btn("co", `Players: ${st.co ? "2 (co-op)" : "1"}`, "alt") + (st.co ? btn("ff", `Friendly fire: ${st.ff ? "on" : "off"}`, "alt") : "")
      : "";
    root.querySelector("#stBtns").innerHTML = (lock ? "" : run?.id === sel
      ? btn("cont", `Continue · fight ${run.i + 1}/${ladder(sel).length}${run.co ? " · 2P" : ""}`, "pri") + btn("start", "New run", "alt")
      : btn("start", "Start", "pri")) + btn("log", "Story log", "alt") + btn("back", "Back", "alt");
  }

  function pick(id, focus) {
    sel = id;
    paintSel();
    if (focus) root.querySelector(`.card[data-id="${id}"]`).focus();
  }

  function claimView() {
    const slot = (k) => `<li>${humans[k] ? `<b>P${k + 1}</b> ${esc(label(humans[k]))} ✓` : `<b>P${k + 1}</b> press your bomb key or a pad button…`}</li>`;
    const ready = humans.length === 2;
    go("claim", `<h2 class="st-head">Two heroes</h2><div class="pixwrap">${pixels("sparky", 6)}</div>
      <ul class="slots px">${slot(0)}${slot(1)}</ul>
      <div class="dim">${ready ? "Press a bomb key again to start" : "Space = WASD player · Enter = arrows player"}</div>
      <div class="st-btns">${ready ? btn("go", "Let's go", "alt") : ""}${matchMedia("(pointer: coarse)").matches ? btn("claimtouch", "Use touch", "alt") : ""}${btn("reset", "Reset", "alt")}${btn("giveup", "Back", "alt")}</div>`);
  }

  function claimThen(next) {
    humans = [];
    armed = next;
    claimView();
  }

  // Called with a source name when it presses its bomb key; true when the press was used here.
  function claim(name) {
    if (view !== "claim" || !on()) return false;
    if (humans.includes(name)) { if (humans.length === 2) acts.go(); return true; }
    if (humans.length < 2) { humans.push(name); sfx("nav"); claimView(); }
    return true;
  }

  function intro() {
    const f = BY_ID[sel];
    go("intro", `<h2 class="st-head">Kaboom Arena Tournament</h2><div class="one" style="--c:${f.color}">${img(sel)}</div>
      <h2>${esc(f.name)}${co() ? " &amp; Sparky" : ""}</h2>${box([{ text: PREMISE }, { id: sel, text: TEXT[sel].intro }, co() && { id: "sparky", text: sideLine(sel) }])}${btn("step", "Enter the arena", "pri adv")}`, { c: f.color });
  }

  function step() {
    const c = pendingChoice(st.run);
    if (!c) return vs();
    if (auto != null) return answer(c, Math.min(auto, c.opts.length - 1), true);
    choice(c);
  }

  const names = (c) => ({ me: BY_ID[st.run.id].name, foe: BY_ID[ladder(st.run.id)[st.run.i]].name, prev: BY_ID[ladder(st.run.id)[Math.max(0, st.run.i - 1)]].name });

  function choice(c) {
    const t = CHOICE_TEXT[c.id], v = names(c), f = BY_ID[st.run.id];
    go("pick", `<h2 class="st-head">${esc(t.title)}</h2>${box([{ text: fillText(t.text, v) }])}
      <div class="st-btns pick">${t.opts.map((o, k) => `<button class="arc" data-act="ans" data-k="${k}" ${k === 0 ? "data-pri" : ""}>${esc(fillText(o, v))}</button>`).join("")}</div>`, { c: f.color });
  }

  function answer(c, k, quiet) {
    st.run.p[c.id] = k;
    save(store, st);
    if (quiet) return step();
    sfx("choice");
    const t = CHOICE_TEXT[c.id], notes = effectNotes(c.opts[k]);
    go("res", `<h2 class="st-head">${esc(t.title)}</h2>${box([{ text: fillText(t.res[k], names(c)) }])}
      <div class="dim">${notes.length ? esc(`Next fight: ${notes.join(" · ").toLowerCase()}`) : "Nothing changes. Or does it?"}</div>${btn("vs", "Next", "pri adv")}`);
  }

  function vs() {
    const f = run(), { id, i } = st.run, a = BY_ID[id], b = BY_ID[f.foe], [la, lb] = banter(id, f.foe);
    const duo = f.co, tag = duo ? ` · 2v${f.ally ? 2 : 1}` : "";
    const side = duo ? `<div class="sub">${pixels("sparky", 3)}<span>+ Sparky</span></div>` : "";
    const ally = f.ally ? `<div class="sub">${mini(f.ally)}<span>+ ${esc(BY_ID[f.ally].name)}</span></div>` : "";
    const notes = f.notes.length ? ` · ${esc(f.notes.join(" · "))}` : "";
    go("vs", `<h2 class="st-head ${f.boss ? "red" : ""}">${f.boss ? "Final boss" : `Fight ${i + 1}/${f.n}`}${tag}</h2><div class="dim">Stage: ${esc(f.stage.name)}${notes}</div>
      <div class="vs"><figure style="--c:${a.color}">${img(id)}<figcaption>${cap(id)}</figcaption>${side}</figure><b class="big">VS</b>
      <figure class="flip" style="--c:${b.color}">${img(f.foe)}<figcaption>${cap(f.foe)}</figcaption>${ally}</figure></div>
      ${box(duo ? [{ id: f.foe, text: DUO[f.foe] }, f.ally && { id: f.ally, text: TEXT[f.ally].taunt }, { id: "sparky", text: sideLine(id + i) }] : [{ id, text: la }, { id: f.foe, text: lb }])}${btn("fight", "Fight!", "pri adv")}`, { ca: a.color, cb: b.color });
  }

  function won(id, foe, out, secrets, two) {
    after = out.done ? () => ending(id, out.fresh, secrets, two) : step;
    const next = out.done ? "" : `<div class="dim">Next: ${esc(BY_ID[ladder(id)[st.run.i]].name)}</div>`;
    go("win", `<h2 class="big">${out.done ? "Champion!" : "Stage clear"}</h2><div class="one" style="--c:${BY_ID[id].color}">${img(id)}</div>
      ${box([{ id, text: TEXT[id].victory }, { id: foe, text: TEXT[foe].defeat }, two && { id: "sparky", text: sideCheer(id + foe) }])}${next}${btn("next", out.done ? "Epilogue" : "Next fight", "pri adv")}`);
  }

  function lost(id, foe) {
    continued(st);
    save(store, st);
    go("lose", `<h2 class="big red">Continue?</h2><div class="big" id="cdn">9</div><div class="one" style="--c:${BY_ID[foe].color}">${img(foe)}</div>
      ${box([{ id, text: TEXT[id].defeat }, { id: foe, text: TEXT[foe].victory }, co() && { id: "sparky", text: sideLose(id + foe) }])}
      <div class="st-btns">${btn("fight", "Retry fight", "pri adv")}${btn("giveup", "Give up", "alt")}</div>`);
    const num = root.querySelector("#cdn");
    let n = 9;
    const tick = () => { num.textContent = n || "GAME OVER"; if (n) cd = setTimeout(() => { n--; tick(); }, 1000); };
    tick();
  }

  function ending(id, fresh, secrets, twoP) {
    after = () => (secrets.length ? secret(secrets, 0, () => theEnd(fresh)) : theEnd(fresh));
    const lines = TEXT[id].ending.map((text) => ({ text }));
    if (twoP) lines.push({ text: "Sparky was promoted to Player One. In his own mind. We let him." });
    go("end", `<h2 class="st-head">${esc(BY_ID[id].name)}'s ending</h2><div class="one" style="--c:${BY_ID[id].color}">${img(id)}</div>
      ${box(lines)}${btn("next", "Next", "pri adv")}`);
  }

  const ART_OF = { flawless: "trophy", peace: "feast", tycoon: "tycoon" };
  function secret(list, k, then) {
    const e = list[k], t = ENDING_TEXT[e];
    after = () => (k + 1 < list.length ? secret(list, k + 1, then) : then());
    sfx("secret");
    go("secret", `<h2 class="st-head gold">Secret ending</h2><div class="pixwrap">${pixels(ART_OF[e], 8)}</div><h2 class="big">${esc(t.title)}</h2>
      ${box(t.lines.map((text) => ({ text })))}${btn("next", "Next", "pri adv")}`);
  }

  function log() {
    const n = ROSTER.length, row = (e) => {
      const found = st.ends.includes(e), t = ENDING_TEXT[e];
      return `<li class="${found ? "got" : ""}"><b>${found ? esc(t.title) : "???"}</b><small>${found ? esc(t.note) : SECRETS.includes(e) ? "Secret ending" : "Not yet"}</small>${found && SECRETS.includes(e) ? `<button class="arc alt" data-act="view" data-e="${e}">View</button>` : ""}</li>`;
    };
    go("log", `<h2 class="st-head">Story log</h2>
      <ul class="lg px">${ENDINGS.map(row).join("")}</ul>
      <div class="dim">Cleared ${st.cleared.length}/${n} · in co-op ${st.coop.length}/${n} · endings ${st.ends.length}/${ENDINGS.length}</div>
      <div class="st-btns">${btn("giveup", "Back", "pri alt")}</div>`);
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
    start: () => {
      if (!begin(st, sel, { co: st.co && coopOk(), ff: st.ff })) return;
      save(store, st);
      if (st.run.co) claimThen(intro);
      else intro();
    },
    cont: () => (st.run.co ? claimThen(step) : step()),
    co: () => { st.co = !st.co; save(store, st); paintSel(); root.querySelector('[data-act="co"]').focus(); },
    ff: () => { st.ff = !st.ff; save(store, st); paintSel(); root.querySelector('[data-act="ff"]').focus(); },
    log,
    view: (d) => secret([d.e], 0, log),
    ans: (d) => answer(pendingChoice(st.run), +d.k),
    back: home,
    step,
    vs,
    go: () => { const n = armed; armed = null; n?.(); },
    reset: () => claimThen(armed),
    claimtouch: () => claim("touch"),
    fight: fightNow,
    next: () => after(),
    giveup: select,
    "pick-sel": select,
  };

  // A portrait that fails on a flaky connection is retried (the error event does not bubble: capture it).
  root.addEventListener("error", (e) => {
    const im = e.target, n = +(im.dataset?.retry || 0);
    if (im.tagName !== "IMG" || !im.dataset.p || n >= 3) return;
    im.dataset.retry = n + 1;
    setTimeout(() => { im.src = `/portraits/${im.dataset.p}.webp?r=${n + 1}`; }, 700 * (n + 1));
  }, true);
  root.addEventListener("click", (e) => {
    if (typing && e.target.closest("[data-adv], .dlg")) { typing(); e.stopPropagation(); }
  }, true);
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]");
    if (b) acts[b.dataset.act](b.dataset);
  });
  addEventListener("gamepadconnected", () => view === "sel" && on() && paintSel());

  const KEYS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyQ: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], KeyZ: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
  function nav(dx, dy) {
    if (!on()) return;
    if (view === "pick") {
      const bs = [...root.querySelectorAll(".pick .arc")], i = bs.indexOf(document.activeElement), j = Math.max(0, Math.min(bs.length - 1, (i < 0 ? 0 : i) + dx + dy));
      bs[j]?.focus();
      return;
    }
    if (view !== "sel") return;
    const i = ROSTER.findIndex((f) => f.id === sel), j = Math.max(0, Math.min(ROSTER.length - 1, i + dx + dy * 3));
    if (j !== i) pick(ROSTER[j].id, true);
  }
  addEventListener("keydown", (e) => {
    if (!on() || e.repeat) return;
    if (e.code === "Escape" && view === "sel") home();
    else if (e.code === "Escape" && (view === "claim" || view === "log")) select();
    else if (KEYS[e.code] && (view === "sel" || view === "pick")) { e.preventDefault(); nav(...KEYS[e.code]); }
  });

  return {
    open() { st = load(store); sel = st.run?.id ?? sel; humans = []; select(); },
    // ok = the heroes won the fight; lost = rounds the opponents took.
    result(ok, lostRounds = 0) {
      const { id, i } = st.run, foe = ladder(id)[i];
      if (!ok) return lost(id, foe);
      const r = st.run, out = advance(st, lostRounds);
      save(store, st);
      won(id, foe, out, out.done ? endingsOf(r) : [], r.co);
    },
    nav,
    claim,
    press() { if (on()) (view === "pick" && root.querySelector(".pick button:focus") || root.querySelector("[data-pri]"))?.click(); },
  };
}
