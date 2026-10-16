import { newGame, step, W, T } from "./sim.js";
import { think } from "./ai.js";
import { draw, CW, CH } from "./render.js";
import { createInput, merge, sources, clearBombs, labelOf } from "./input.js";
import { joinRoom, newCode, cid } from "./net.js";
import { cleanName, displayNames, roomFromSearch, inviteUrl, admit, release } from "./lobby.js";
import { createInbox, createGuestNet, packSnap, unpackSnap } from "./netcode.js";
import { teamInfo, view, setSuits, palette } from "./look.js";
import { FIELDS, DEFAULTS, load as loadSettings, save as saveSettings, roundOpts, reduced } from "./settings.js";
import { createHaptics, browserVibrate, browserRumble, observe, vibrationReport } from "./haptics.js";
import { setStill } from "./home.js";
import { initHelp, initInstall, watchUpdates } from "./ux.js";
import { createNav } from "./nav.js";
import { createStoryUI } from "./storyui.js";
import { BY_ID } from "./campaign.js";
import { fightLine } from "./story.js";
import { createDirector, timeScale, recapView } from "./director.js";
import { fps } from "./fpsinput.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
canvas.width = CW;
canvas.height = CH;

const SNAP_EVERY = 2, SEND_EVERY = 2, GRID_EVERY = 60, THINK_EVERY = 6;
let mode = null, game = null, room = null, slots = [], inboxes = {}, botMem = {};
let frame = 0, lastSnap = 0, joinTimer = 0, humans = [];
let names = [], pnames = [], joined = false, lostAt = 0, subOk = false, resub = false, rmShown = false;
const RECONNECT_MS = 30000;
const PNUM = [1, 2, 3, 4].map((i) => `P${i}`);
let settings = loadSettings();
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let vibSent = null;
const haptics = createHaptics({ vibrate: (p) => (vibSent = browserVibrate(p)), rumble: browserRumble, settings: () => settings });
let feel = {};
const fd = createDirector();
let clock = 0, ts = 1, still = false, recapOn = false, recapOff = false;
const fx = {
  human: (i) => (mode === "local" ? i < humans.length : i === (game?.me ?? 0)),
  announce: true, timeFx: false, punch: false, chat: false, still: false, rand: Math.random,
  line: (i, ev) => fightLine(game?.story?.[i ? "foe" : "id"], ev),
};

function applyLook() {
  feel = {};
  view.cb = settings.cb;
  still = reduced(settings, motion.matches);
  setStill(still);
  r3?.setStill(still);
  rf?.setStill(still);
  dirty = true;
}
motion.addEventListener?.("change", applyLook);
let gnet = null, lastGrid = null, lastCfg = null, sentGrid = "", snapCount = 0, rtt = 0, pingTimer = 0;
const GFX = ["classic", "3d", "dlss", "fps"];
let gfx = "classic", r3 = null, rf = null;
try { gfx = localStorage.getItem("gfx") || "classic"; } catch {}
if (!GFX.includes(gfx)) gfx = "classic";

const nick = $("nick");
try { nick.value = cleanName(localStorage.getItem("name")); } catch {}
nick.oninput = () => { try { localStorage.setItem("name", cleanName(nick.value)); } catch {} };
const myName = () => cleanName(nick.value);

function markGfx() {
  for (const b of $("gfx").children) b.setAttribute("aria-checked", b.dataset.gfx === gfx);
}

const is3 = () => (gfx === "3d" || gfx === "dlss") && !!r3;
const fpsOn = () => gfx === "fps" && !!rf;

async function applyGfx() {
  markGfx();
  try { localStorage.setItem("gfx", gfx); } catch {}
  if (gfx === "fps" && !rf) {
    try {
      const { createRendererFps } = await import("./renderfps.js");
      rf = createRendererFps($("cf"));
      rf.setStill(reduced(settings, motion.matches));
      fps.bind();
    } catch (err) {
      console.error(err);
      gfx = "classic";
      markGfx();
      $("msg").textContent = "Bomber Shooter unavailable.";
    }
  }
  if ((gfx === "3d" || gfx === "dlss") && !r3) {
    try {
      const { createRenderer3D } = await import("./render3d.js");
      r3 = createRenderer3D($("c3"), $("game"));
      r3.setStill(reduced(settings, motion.matches));
    } catch (err) {
      console.error(err);
      gfx = "classic";
      markGfx();
      $("msg").textContent = "3D graphics unavailable (WebGL or offline).";
    }
  }
  const three = is3(), first = fpsOn();
  canvas.hidden = three || first;
  $("c3").hidden = !three;
  $("cf").hidden = !first;
  if (first) rf.resize();
  if (r3) { r3.hud.style.display = three ? "" : "none"; if (three) r3.setDlss(gfx === "dlss"); r3.resize(); }
}

for (const b of $("gfx").children) {
  b.onclick = () => {
    gfx = b.dataset.gfx;
    applyGfx();
  };
}
applyGfx();

// Browser Back closes the top layer (help overlay, or the current screen) instead of leaving the site.
let cur = "menu", help = null;
const nav = createNav({ history, onBack: (kind) => goBack(kind) });
addEventListener("popstate", () => nav.pop());

function goBack(kind) {
  if (kind === "help") return help?.close();
  const offline = mode === "solo" || mode === "local" || mode === "story";
  if (cur === "game" && !game?.rematch) {
    if (!offline) return nav.open("screen");
    if (!paused) { setPause(true); return nav.open("screen"); }
  }
  if (cur === "settings") return show("menu");
  if (mode === "story" || cur === "story") return leave();
  if (mode === "host") return endMatch();
  toMenu();
}

function show(id) {
  for (const el of document.querySelectorAll(".screen")) el.classList.toggle("on", el.id === id);
  cur = id;
  if (id === "menu") nav.close("screen");
  else nav.open("screen");
}

function toMenu(msg = "") {
  setPause(false);
  clearTimeout(joinTimer);
  room?.leave();
  room = mode = game = null;
  slots = [];
  inboxes = {};
  botMem = {};
  humans = [];
  feel = {};
  resetFeel();
  setSuits(null);
  gnet = lastGrid = lastCfg = null;
  names = pnames = [];
  joined = subOk = resub = false;
  lostAt = 0;
  $("reconn").classList.remove("on");
  syncRematch();
  clearInterval(pingTimer);
  rtt = 0;
  $("ping").textContent = "";
  $("msg").textContent = msg;
  show("menu");
}

const storyUi = createStoryUI({ root: $("story"), show: () => show("story"), fight: startStory, home: () => toMenu(), reduced: () => reduced(settings, motion.matches) });
$("storyBtn").onclick = () => storyUi.open();
const faceIn = (inp, id) => fps.map(inp, game.s.tick, (game.s.players[id]?.x ?? 0) < (W * T) / 2 ? 1 : 3);
const allInputs = () => (fpsOn() && game ? faceIn(merge(Object.keys(sources)), Math.max(game.me, 0)) : merge(Object.keys(sources)));

const input = createInput(
  $("pad"),
  $("bombBtn"),
  (name) => (mode === "local-lobby" ? joinLocal(name) : dismissRecap() || (name.startsWith("pad") && storyUi.press())),
  () => {
    for (const [n, src] of Object.entries(sources)) if (n.startsWith("pad") && (src.dx || src.dy)) storyUi.nav(src.dx, src.dy);
  },
  () => setPause(!paused),
);

let paused = false, dirty = true;

function setPause(on) {
  if (on && mode !== "solo" && mode !== "local" && mode !== "story") return;
  paused = on;
  $("pause").classList.toggle("on", on);
}

addEventListener("keydown", (e) => {
  if ((e.code === "KeyP" || e.code === "Escape") && !e.repeat && $("game").classList.contains("on")) setPause(!paused);
});
document.addEventListener("visibilitychange", () => document.hidden && setPause(true));
addEventListener("resize", () => (dirty = true));
$("pauseBtn").onclick = () => setPause(true);
$("resume").onclick = () => setPause(false);
$("pauseQuit").onclick = () => leave();

function joinLocal(name) {
  if (humans.includes(name) || humans.length >= 4) return;
  humans.push(name);
  renderLocalLobby();
}

function renderLocalLobby() {
  $("localList").innerHTML = humans.map((n, i) => `<li>P${i + 1}: ${labelOf(n)}</li>`).join("") || "<li>—</li>";
  $("localStart").disabled = humans.length < 2;
}

const FAST = new URLSearchParams(location.search).get("story");

function makeGame(n, story) {
  const { opts, theme } = story ?? roundOpts(settings, n);
  const s = newGame(n, Date.now(), opts);
  s.cfg.theme = theme;
  if (story && FAST) s.players[FAST === "lose" ? 0 : 1].alive = false;
  return s;
}

const INTRO = 80;
const roundBanner = (g) => `ROUND ${g.round} — FIGHT!`;

function startStory(spec) {
  const me = BY_ID[spec.id], foe = BY_ID[spec.foe];
  mode = "story";
  clearBombs();
  setSuits([me.color, foe.color]);
  startMatch(2, spec, [me.name, foe.name]);
}

function startMatch(n, story, storyNames) {
  const labels = mode === "local" || settings.cb ? PNUM : undefined;
  const who = mode === "local" ? humans.map(() => true) : mode === "host" ? slots.map(Boolean) : [true];
  game = {
    s: makeGame(n, story), scores: Array(n).fill(0), banner: "", wait: 0, over: false, me: mode === "local" ? -1 : 0, win: story ? story.win : settings.rounds,
    names: storyNames ?? displayNames(n, who, mode === "host" ? names : [myName()], labels),
    story, retro: !!story, round: 1, intro: story ? INTRO : 0,
  };
  if (story) game.banner = roundBanner(game);
  botMem = {};
  feel = {};
  resetFeel();
  fps.reset();
  sentGrid = "";
  $("pauseBtn").hidden = mode !== "solo" && mode !== "local" && mode !== "story";
  show("game");
}

function isBot(id) {
  if (mode === "local") return id >= humans.length;
  return id !== 0 && !(mode === "host" && slots[id] && inboxes[id]);
}

function tick() {
  if (paused || !game || game.rematch || (mode !== "solo" && mode !== "host" && mode !== "local" && mode !== "story")) return;
  const g = game, s = g.s;
  if (g.wait > 0) {
    // Hold on the recap until the player dismisses it (capped so a host never stalls the guests for long).
    if (g.wait === 1 && recapOn && (g.hold = (g.hold || 0) + 1) < (mode === "host" ? 900 : 5400)) return;
    if (--g.wait === 0) {
      g.hold = 0;
      if (g.over && g.story) {
        const ok = g.scores[0] > g.scores[1];
        toMenu();
        return storyUi.result(ok);
      }
      if (g.over) { g.rematch = true; return; }
      g.banner = "";
      g.s = makeGame(s.players.length, g.story);
      sentGrid = "";
      if (g.story) { g.round++; g.banner = roundBanner(g); g.intro = INTRO; }
    }
    return;
  }
  if (g.intro > 0) {
    if (--g.intro === 0) g.banner = "";
    return;
  }
  const allOut = mode === "solo" || mode === "story" ? !s.players[0].alive : mode === "local" && s.players.every((p) => p.id >= humans.length || !p.alive);
  for (let k = 0; k < (allOut ? 3 : 1) && !s.done; k++) {
    const inputs = {};
    if (mode === "local") humans.forEach((n, i) => (inputs[i] = i || !fpsOn() ? merge([n]) : faceIn(merge([n]), 0)));
    else inputs[0] = allInputs();
    for (const p of s.players) {
      if (mode === "local" ? p.id < humans.length : p.id === 0) continue;
      if (isBot(p.id)) {
        if (s.tick % THINK_EVERY === 0) botMem[p.id] = think(s, p.id, Math.random, g.story ? g.story.level : settings.bot);
        inputs[p.id] = { ...botMem[p.id] };
        if (botMem[p.id]) botMem[p.id].bomb = false;
      } else inputs[p.id] = inboxes[p.id].next();
    }
    step(s, inputs);
    clearBombs();
  }
  if (!s.done) return;
  const tm = s.cfg.teams, who = (id) => (tm ? `Team ${teamInfo(tm[id]).name}` : g.names[id]);
  if (s.winnerTeam >= 0) s.players.forEach((p) => tm[p.id] === s.winnerTeam && g.scores[p.id]++);
  else if (s.winner >= 0) g.scores[s.winner]++;
  const champ = g.scores.findIndex((x) => x >= g.win);
  g.over = champ >= 0;
  g.banner = g.story ? (g.over ? (champ === 0 ? "VICTORY!" : "YOU LOSE") : s.winner === 0 ? "KABOOM!" : s.winner > 0 ? "OUCH!" : "DRAW!") : g.over ? `${who(champ)} wins the match!` : s.winner >= 0 ? `${who(s.winner)} wins the round` : "Draw";
  g.wait = 180;
}

function endMatch() {
  room?.send({ t: "end" });
  toMenu();
}

function sendSnap() {
  const { s, scores, banner } = game;
  const grid = s.grid.join("");
  const withGrid = grid !== sentGrid || snapCount++ % GRID_EVERY === 0;
  sentGrid = grid;
  const a = slots.map((_, i) => inboxes[i]?.ack ?? null);
  room.send({ t: "snap", g: { s: packSnap(s, withGrid), a, scores, banner, r: !!game.rematch, w: settings.rounds } });
}

const pushLobby = () => room.send({ t: "lobby", slots, names });

function renderLobby() {
  const list = displayNames(slots.length, slots.map(Boolean), names);
  $("lobbyList").replaceChildren(...list.map((n) => Object.assign(document.createElement("li"), { textContent: n })));
  if (mode === "host") $("lobbyInfo").textContent = `${slots.length} player(s) – free slots will be bots`;
}

function onMsg(m) {
  if (m.t === "left") {
    if (mode === "host") {
      const pid = release(slots, names, m.from, !!game);
      if (pid > 0) delete inboxes[pid];
      if (pid > 0 && !game) { pushLobby(); renderLobby(); }
    } else if (mode === "guest" && m.from === slots[0]) toMenu("The host left the game.");
    return;
  }
  if (mode === "host") {
    if (m.t === "join") {
      const r = admit(slots, m.from, !!game);
      if (r === "full") return room.send({ t: "full", to: m.from });
      if (r === "new") slots.push(m.from);
      const pid = slots.indexOf(m.from);
      if (!game) names[pid] = cleanName(m.name);
      else if (!inboxes[pid]) inboxes[pid] = createInbox();
      pushLobby();
      renderLobby();
    } else if (m.t === "in") {
      inboxes[slots.indexOf(m.from)]?.push(m.n, m.d);
    } else if (m.t === "ping") room.send({ t: "pong", to: m.from, ts: +m.ts || 0 });
    return;
  }
  if (mode !== "guest") return;
  if (m.t === "full" && m.to === cid) toMenu("Room full or game in progress.");
  else if (m.t === "lobby") {
    if (!Array.isArray(m.slots) || !m.slots.includes(cid)) return;
    clearTimeout(joinTimer);
    joined = true;
    clearLost();
    slots = m.slots.slice(0, 4).map((c) => (typeof c === "string" ? c : null));
    names = Array.isArray(m.names) ? m.names.slice(0, 4).map(cleanName) : [];
    pnames = displayNames(4, [0, 1, 2, 3].map((i) => !!slots[i]), names, settings.cb ? PNUM : undefined);
    renderLobby();
    $("lobbyInfo").textContent = "Waiting for the host to start…";
    if (!game) show("lobby");
  } else if (m.t === "pong" && m.to === cid && typeof m.ts === "number") {
    const now = performance.now() - m.ts;
    rtt = rtt ? rtt * 0.7 + now * 0.3 : now;
    $("ping").textContent = `${Math.round(rtt)} ms`;
  } else if (m.t === "snap") {
    const s = unpackSnap(m.g?.s, lastGrid, lastCfg);
    const me = slots.indexOf(cid);
    if (!s || me < 0) return;
    lastGrid = s.grid;
    lastCfg = s.cfg;
    lastSnap = performance.now();
    clearLost();
    gnet ||= createGuestNet(me);
    gnet.onSnap(s, m.g.a?.[me], lastSnap);
    if (!game) show("game");
    game = { s, scores: m.g.scores, banner: m.g.banner, me, names: pnames, rematch: !!m.g.r, win: Math.min(3, m.g.w | 0) };
  } else if (m.t === "end") toMenu();
}

function clearLost() {
  lostAt = 0;
  $("reconn").classList.remove("on");
}

function lose() {
  lostAt ||= performance.now();
  $("reconn").classList.add("on");
}

function syncRematch() {
  const on = !!game?.rematch;
  if (on === rmShown) return;
  rmShown = on;
  $("rematch").classList.toggle("on", on);
  if (!on) return $("rematchRecap").replaceChildren();
  $("rematchTitle").textContent = game.banner;
  if (settings.recap) fillRecap($("rematchRecap"), game, true);
  $("again").hidden = $("rematchWait").hidden = false;
  if (mode === "guest") $("again").hidden = true;
  else $("rematchWait").hidden = true;
}

function showHostLobby() {
  const url = inviteUrl(location.origin, $("code").textContent);
  $("inviteLink").value = url;
  $("shareLink").hidden = !navigator.share;
  $("invite").hidden = false;
  import("./vendor/qrcode.mjs").then(({ default: qrcode }) => {
    const q = qrcode(0, "M"), px = 6, pad = 4;
    q.addData(url);
    q.make();
    const n = q.getModuleCount(), cv = $("qr"), c = cv.getContext("2d");
    cv.width = cv.height = (n + 2 * pad) * px;
    c.fillStyle = "#fff";
    c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = "#000";
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.isDark(y, x)) c.fillRect((x + pad) * px, (y + pad) * px, px, px);
  }).catch(console.error);
  show("lobby");
}

function openRoom(code, host) {
  mode = host ? "host" : "guest";
  slots = host ? [cid] : [];
  names = host ? [myName()] : [];
  joined = false;
  $("code").textContent = code;
  $("start").style.display = host ? "" : "none";
  $("invite").hidden = true;
  const sendJoin = () => room.send({ t: "join", name: myName() });
  room = joinRoom(code, host, {
    onMsg,
    onConnected: () => {
      subOk = true;
      if (host) return showHostLobby();
      sendJoin();
      if (!joined) joinTimer = setTimeout(() => toMenu("Room not found."), 3000);
      lastSnap = performance.now();
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (lostAt && resub) { resub = false; room.retry(); }
        else if (lostAt && subOk) sendJoin();
        room.send({ t: "ping", ts: performance.now() });
      }, 1000);
    },
    onLost: () => {
      subOk = false;
      if (mode === "guest" && joined) lose();
      else if (mode) toMenu("Connection lost.");
    },
    onRejected: () => {
      subOk = false;
      if (mode === "guest" && joined) { resub = true; lose(); }
      else toMenu(host ? "Could not create the room, try again." : "Room not found or full.");
    },
  });
  renderLobby();
}

for (const b of document.querySelectorAll("[data-solo]")) {
  b.onclick = () => { mode = "solo"; startMatch(1 + +b.dataset.solo); };
}
$("local").onclick = () => {
  mode = "local-lobby";
  humans = [];
  renderLocalLobby();
  show("localLobby");
};
$("localStart").onclick = () => {
  mode = "local";
  startMatch($("localBots").checked ? 4 : humans.length);
};
$("localBack").onclick = () => toMenu();
$("create").onclick = () => openRoom(newCode(), true);
$("join").onclick = () => {
  const code = $("joinCode").value.trim().toUpperCase();
  if (code.length === 4) openRoom(code, false);
};
$("start").onclick = () => {
  inboxes = {};
  slots.forEach((_, i) => i && (inboxes[i] = createInbox()));
  sentGrid = "";
  room.send({ t: "start" });
  startMatch(4);
};
const leave = () => {
  const inStory = mode === "story";
  toMenu();
  if (inStory) storyUi.open();
};
$("quit").onclick = () => (mode === "story" ? leave() : mode === "host" ? endMatch() : toMenu());
$("lobbyBack").onclick = $("rematchMenu").onclick = () => (mode === "host" ? endMatch() : toMenu());
$("again").onclick = () => game?.rematch && mode !== "guest" && startMatch(game.s.players.length);
$("copyLink").onclick = async () => {
  const link = $("inviteLink");
  try {
    await navigator.clipboard.writeText(link.value);
  } catch {
    link.select();
    try { document.execCommand("copy"); } catch {}
  }
  $("copyLink").textContent = "Copied!";
  setTimeout(() => ($("copyLink").textContent = "Copy link"), 1500);
};
$("shareLink").onclick = () => navigator.share({ title: "Kaboom Arena", text: "Join my Kaboom Arena room", url: $("inviteLink").value }).catch(() => {});

function online() {
  const ok = navigator.onLine;
  $("create").disabled = $("join").disabled = !ok;
  if (!ok) $("msg").textContent = "Offline: only solo mode is available.";
}
addEventListener("online", online);
addEventListener("offline", online);
online();

function fit() {
  const k = Math.min(innerWidth / CW, innerHeight / CH);
  const scale = k >= 2 ? Math.floor(k) : k;
  canvas.style.width = `${CW * scale}px`;
  canvas.style.height = `${CH * scale}px`;
}
addEventListener("resize", fit);
fit();

function guestTick() {
  gnet.tick(allInputs());
  clearBombs();
  const m = frame % SEND_EVERY === 0 && gnet.take();
  if (m) room.send({ t: "in", ...m });
}

function rumble(g) {
  if (!settings.vibrate && !settings.rumble) return;
  const pads = Object.keys(sources).filter((n) => n.startsWith("pad"));
  for (const { id, kind, scale } of observe(feel, g.s)) {
    if (mode === "local") {
      const src = humans[id];
      if (src) haptics.fire(kind, { phone: src === "touch", pads: src.startsWith("pad") ? [src] : [] }, scale);
    } else if (id === g.me) haptics.fire(kind, { phone: true, pads }, scale);
  }
}

function resetFeel() {
  fd.restart();
  ts = 1;
  hideRecap();
}

function hideRecap() {
  recapOn = recapOff = false;
  $("recap").classList.remove("on");
}

function dismissRecap() {
  if (!recapOn) return false;
  recapOff = true;
  clearBombs();
  syncRecap(game);
  return true;
}

function fillRecap(el, g, over) {
  const v = recapView(over ? fd.tracker.total() : fd.tracker.round(), g.s.players.length, g.names);
  const head = Object.assign(document.createElement("h3"), { textContent: over ? "Match recap" : "Round recap" });
  const table = document.createElement("table");
  const row = (cells, tag, c) => {
    const tr = document.createElement("tr");
    if (c) tr.style.setProperty("--c", c);
    for (const t of cells) tr.append(Object.assign(document.createElement(tag), { textContent: t }));
    table.append(tr);
  };
  row(["", "Bombs", "Kills", "Items", "Walls"], "th");
  const suit = palette().suit;
  for (const r of v.rows) row([r.name, ...r.cells], "td", suit[r.id]);
  const list = document.createElement("ul");
  for (const a of v.awards) {
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("b"), { textContent: a.title }), Object.assign(document.createElement("span"), { textContent: ` ${v.rows[a.who].name}: ${a.desc}` }));
    list.append(li);
  }
  el.classList.toggle("retro", !!g.retro);
  el.replaceChildren(head, table, list);
}

function syncRecap(g) {
  if (!g.s.done) recapOff = false;
  const want = settings.recap && g.s.done && !g.rematch && !recapOff;
  if (want === recapOn) return;
  recapOn = want;
  const el = $("recap");
  el.classList.toggle("on", want);
  if (!want) return;
  fillRecap(el, g, g.win > 0 && g.scores.some((x) => x >= g.win));
  el.append(Object.assign(document.createElement("small"), { textContent: "Tap or press a key to continue" }));
}

function punch({ x, y }) {
  if (gfx === "fps") return;
  if (is3()) return r3.punch(x, y);
  canvas.style.transformOrigin = `${(x / W) * 100}% ${((y * T + 16) / CH) * 100}%`;
  canvas.animate([{ transform: "scale(1)" }, { transform: "scale(1.07)", offset: 0.25 }, { transform: "scale(1)" }], { duration: 600, easing: "ease-out" });
}

function feelStep(g) {
  const fxOn = settings.slowmo && !still;
  fx.announce = settings.announcer;
  fx.still = still;
  fx.timeFx = fxOn && (mode === "solo" || mode === "local" || mode === "story");
  fx.punch = fxOn;
  fx.chat = settings.announcer && !still && mode === "story";
  g.call = fd.update(g.s, clock, fx);
  g.bub = fd.bub;
  g.clock = clock;
  g.ts = ts = fx.timeFx ? timeScale(fd, clock) : 1;
  if (fd.punch) { punch(fd.punch); fd.punch = null; }
  syncRecap(g);
}

let last = performance.now(), acc = 0, lastErr = "";
function loop(now) {
  const raw = Math.min(now - last, 100);
  last = now;
  if (!paused) clock += raw;
  acc += raw * ts;
  while (acc >= 1000 / 60) {
    acc -= 1000 / 60;
    frame++;
    input.poll();
    tick();
    if (mode === "host" && game && frame % SNAP_EVERY === 0) sendSnap();
    if (mode === "guest" && gnet) guestTick();
  }
  if (mode === "guest" && game && !lostAt && now - lastSnap > 4000) lose();
  if (lostAt && performance.now() - lostAt > RECONNECT_MS) toMenu("Connection lost.");
  if (mode === "guest" && game && gnet) game.s = gnet.frame(performance.now());
  if (game && !paused) feelStep(game);
  syncRematch();
  if (game && !paused) rumble(game);
  if (game && (!paused || dirty)) {
    dirty = false;
    try {
      is3() ? r3.draw(game) : fpsOn() ? rf.draw(game) : draw(ctx, game);
    } catch (err) {
      if (String(err) !== lastErr) console.error((lastErr = String(err)), err);
    }
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

applyLook();
watchUpdates();
initInstall();
help = initHelp([$("helpBtn"), $("pauseHelp")], { open: () => nav.open("help"), close: () => nav.close("help") });

$("recap").onclick = dismissRecap;
addEventListener("keydown", (e) => e.code !== "Escape" && e.code !== "KeyP" && !e.metaKey && !e.ctrlKey && dismissRecap());

document.addEventListener("click", (e) => {
  const b = e.target.closest?.("button");
  if (b && !b.closest("#settings, #story")) b.blur();
});

function markSettings() {
  for (const seg of document.querySelectorAll("#settings .seg")) {
    for (const b of seg.children) b.setAttribute("aria-checked", b.dataset.v === JSON.stringify(settings[seg.dataset.key]));
  }
}

for (const f of FIELDS) {
  const label = Object.assign(document.createElement("div"), { className: "label", id: `set-${f.key}`, textContent: f.label });
  const seg = Object.assign(document.createElement("div"), { className: "seg wrap" });
  seg.dataset.key = f.key;
  seg.setAttribute("role", "radiogroup");
  seg.setAttribute("aria-labelledby", label.id);
  seg.style.setProperty("--n", Math.min(f.opts.length, 3));
  for (const [v, text] of f.opts) {
    const b = Object.assign(document.createElement("button"), { textContent: text });
    b.setAttribute("role", "radio");
    b.dataset.v = JSON.stringify(v);
    b.onclick = () => { settings[f.key] = v; saveSettings(settings); markSettings(); applyLook(); };
    seg.append(b);
  }
  $(f.a11y ? "a11yList" : f.feel ? "feelList" : "setList").append(label, seg);
}
$("settingsBtn").onclick = () => { markSettings(); show("settings"); $("setBack").focus(); };
$("setBack").onclick = () => show("menu");
$("setReset").onclick = () => { settings = { ...DEFAULTS }; saveSettings(settings); markSettings(); applyLook(); };
$("vibTest").onclick = () => {
  vibSent = null;
  haptics.fire("test", { phone: true, pads: Object.keys(sources).filter((n) => n.startsWith("pad")) });
  $("vibStatus").textContent = vibrationReport(vibSent);
};
addEventListener("keydown", (e) => e.code === "Escape" && $("settings").classList.contains("on") && show("menu"));

const invite = roomFromSearch(location.search);
if (invite) {
  const u = new URL(location.href);
  u.searchParams.delete("room");
  history.replaceState(null, "", u);
  if (navigator.onLine) {
    $("msg").textContent = `Joining room ${invite}…`;
    openRoom(invite, false);
  }
}
