import { newGame, step } from "./sim.js";
import { think } from "./ai.js";
import { draw, CW, CH } from "./render.js";
import { createInput, merge, sources, clearBombs, labelOf } from "./input.js";
import { joinRoom, newCode, cid } from "./net.js";
import { cleanName, displayNames, roomFromSearch, inviteUrl, admit, release } from "./lobby.js";
import { createInbox, createGuestNet, packSnap, unpackSnap } from "./netcode.js";

const $ = (id) => document.getElementById(id);
const canvas = $("c"), ctx = canvas.getContext("2d");
canvas.width = CW;
canvas.height = CH;

const WIN_SCORE = 2, SNAP_EVERY = 2, SEND_EVERY = 2, GRID_EVERY = 60, THINK_EVERY = 6;
let mode = null, game = null, room = null, slots = [], inboxes = {}, botMem = {};
let frame = 0, lastSnap = 0, joinTimer = 0, humans = [];
let names = [], pnames = [], joined = false, lostAt = 0, subOk = false, resub = false, rmShown = false;
const RECONNECT_MS = 30000;
let gnet = null, lastGrid = null, lastCfg = null, sentGrid = "", snapCount = 0, rtt = 0, pingTimer = 0;
const GFX = ["classic", "3d", "dlss"];
let gfx = "classic", r3 = null;
try { gfx = localStorage.getItem("gfx") || "classic"; } catch {}
if (!GFX.includes(gfx)) gfx = "classic";

const nick = $("nick");
try { nick.value = cleanName(localStorage.getItem("name")); } catch {}
nick.oninput = () => { try { localStorage.setItem("name", cleanName(nick.value)); } catch {} };
const myName = () => cleanName(nick.value);

function markGfx() {
  for (const b of $("gfx").children) b.setAttribute("aria-checked", b.dataset.gfx === gfx);
}

async function applyGfx() {
  markGfx();
  try { localStorage.setItem("gfx", gfx); } catch {}
  if (gfx !== "classic" && !r3) {
    try {
      const { createRenderer3D } = await import("./render3d.js");
      r3 = createRenderer3D($("c3"), $("game"));
    } catch (err) {
      console.error(err);
      gfx = "classic";
      markGfx();
      $("msg").textContent = "3D graphics unavailable (WebGL or offline).";
    }
  }
  const three = gfx !== "classic" && !!r3;
  canvas.hidden = three;
  $("c3").hidden = !three;
  if (r3) { r3.hud.style.display = three ? "" : "none"; if (three) r3.setDlss(gfx === "dlss"); r3.resize(); }
}

for (const b of $("gfx").children) {
  b.onclick = () => {
    gfx = b.dataset.gfx;
    applyGfx();
  };
}
applyGfx();

function show(id) {
  for (const el of document.querySelectorAll(".screen")) el.classList.toggle("on", el.id === id);
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

const allInputs = () => merge(Object.keys(sources));

const input = createInput(
  $("pad"),
  $("bombBtn"),
  (name) => mode === "local-lobby" && joinLocal(name),
  () => {},
  () => setPause(!paused),
);

let paused = false, dirty = true;

function setPause(on) {
  if (on && mode !== "solo" && mode !== "local") return;
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
$("pauseQuit").onclick = () => toMenu();

function joinLocal(name) {
  if (humans.includes(name) || humans.length >= 4) return;
  humans.push(name);
  renderLocalLobby();
}

function renderLocalLobby() {
  $("localList").innerHTML = humans.map((n, i) => `<li>P${i + 1}: ${labelOf(n)}</li>`).join("") || "<li>—</li>";
  $("localStart").disabled = humans.length < 2;
}

function startMatch(n) {
  const labels = mode === "local" ? [1, 2, 3, 4].map((i) => `P${i}`) : undefined;
  const who = mode === "local" ? humans.map(() => true) : mode === "host" ? slots.map(Boolean) : [true];
  game = {
    s: newGame(n), scores: Array(n).fill(0), banner: "", wait: 0, over: false, me: mode === "local" ? -1 : 0,
    names: displayNames(n, who, mode === "host" ? names : [myName()], labels),
  };
  botMem = {};
  sentGrid = "";
  $("pauseBtn").hidden = mode !== "solo" && mode !== "local";
  show("game");
}

function isBot(id) {
  if (mode === "local") return id >= humans.length;
  return id !== 0 && !(mode === "host" && slots[id] && inboxes[id]);
}

function tick() {
  if (paused || !game || game.rematch || (mode !== "solo" && mode !== "host" && mode !== "local")) return;
  const g = game, s = g.s;
  if (g.wait > 0) {
    if (--g.wait === 0) {
      if (g.over) { g.rematch = true; return; }
      g.banner = "";
      g.s = newGame(s.players.length);
      sentGrid = "";
    }
    return;
  }
  const allOut = mode === "solo" ? !s.players[0].alive : mode === "local" && s.players.every((p) => p.id >= humans.length || !p.alive);
  for (let k = 0; k < (allOut ? 3 : 1) && !s.done; k++) {
    const inputs = {};
    if (mode === "local") humans.forEach((n, i) => (inputs[i] = merge([n])));
    else inputs[0] = allInputs();
    for (const p of s.players) {
      if (mode === "local" ? p.id < humans.length : p.id === 0) continue;
      if (isBot(p.id)) {
        if (s.tick % THINK_EVERY === 0) botMem[p.id] = think(s, p.id);
        inputs[p.id] = { ...botMem[p.id] };
        if (botMem[p.id]) botMem[p.id].bomb = false;
      } else inputs[p.id] = inboxes[p.id].next();
    }
    step(s, inputs);
    clearBombs();
  }
  if (!s.done) return;
  if (s.winner >= 0) g.scores[s.winner]++;
  const champ = g.scores.findIndex((x) => x >= WIN_SCORE);
  g.over = champ >= 0;
  g.banner = g.over ? `${g.names[champ]} wins the match!` : s.winner >= 0 ? `${g.names[s.winner]} wins the round` : "Draw";
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
  room.send({ t: "snap", g: { s: packSnap(s, withGrid), a, scores, banner, r: !!game.rematch } });
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
    pnames = displayNames(4, [0, 1, 2, 3].map((i) => !!slots[i]), names);
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
    game = { s, scores: m.g.scores, banner: m.g.banner, me, names: pnames, rematch: !!m.g.r };
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
  if (!on) return;
  $("rematchTitle").textContent = game.banner;
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
$("lobbyBack").onclick = $("quit").onclick = $("rematchMenu").onclick = () => (mode === "host" ? endMatch() : toMenu());
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

let last = performance.now(), acc = 0;
function loop(now) {
  acc += Math.min(now - last, 100);
  last = now;
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
  syncRematch();
  if (game && (!paused || dirty)) {
    dirty = false;
    gfx !== "classic" && r3 ? r3.draw(game) : draw(ctx, game);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");

document.addEventListener("click", (e) => e.target.closest?.("button")?.blur());

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
