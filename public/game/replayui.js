import { linkText, fileText, fromFileText, unpack, pack, loadList, addEntry, saveList, titleOf } from "./replay.js";

const $ = (id) => document.getElementById(id);
const stamp = (ts) => new Date(ts).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
const clock = (ticks) => `${Math.floor(ticks / 3600)}:${String(Math.floor(ticks / 60) % 60).padStart(2, "0")}`;

export const ERR = {
  version: "This replay was made with an older version of the game and can't be played.",
  corrupt: "This replay is damaged or is not a Kaboom Arena replay.",
};

let noteTimer = 0;
export function notify(text) {
  const n = $("note");
  n.textContent = text;
  n.hidden = false;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(() => (n.hidden = true), 4500);
}

export function download(name, text, type) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function saveFile(match) {
  download(`kaboom-${match.ts.toString(36)}.kaboom`, await fileText(match), "application/json");
  notify("Saved as a .kaboom file.");
}

export async function shareReplay(match) {
  const r = await linkText(match);
  if (!r) { await saveFile(match); return notify("Too long for a link: saved as a .kaboom file instead."); }
  const url = `${location.origin}/#r=${r.text}`, tail = r.trimmed ? " (last round only)" : "";
  if (navigator.share) {
    try { await navigator.share({ title: "Kaboom Arena replay", text: `${titleOf(match)}${tail}`, url }); return; } catch (e) { if (e?.name === "AbortError") return; }
  }
  try {
    await navigator.clipboard.writeText(url);
    notify(`Replay link copied${tail}.`);
  } catch {
    prompt("Copy this replay link", url);
  }
}

export async function readFile(file) {
  if (!file || file.size > 3e6) return { error: "corrupt" };
  return fromFileText(await file.text());
}

// Replays screen: the last matches kept in localStorage.
export function createReplayList({ storage, watch }) {
  let list = loadList(storage);
  const root = $("repList");

  async function open(e, then) {
    const r = await unpack(e.data);
    if (r.match) then(r.match);
    else notify(ERR[r.error]);
  }

  function row(e) {
    const li = document.createElement("li");
    const head = document.createElement("div");
    head.append(Object.assign(document.createElement("b"), { textContent: e.title }), Object.assign(document.createElement("small"), { textContent: `${stamp(e.ts)} · ${e.res}` }));
    const btns = document.createElement("div");
    btns.className = "row";
    for (const [label, fn] of [["Watch", (m) => watch(m, "replays")], ["Link", shareReplay], ["File", saveFile]]) {
      btns.append(Object.assign(document.createElement("button"), { className: "chip", textContent: label, onclick: () => open(e, fn) }));
    }
    btns.append(Object.assign(document.createElement("button"), { className: "chip alt", textContent: "✕", ariaLabel: "Delete", onclick: () => { list = list.filter((x) => x !== e); saveList(storage, list); render(); } }));
    li.append(head, btns);
    return li;
  }

  function render() {
    list = loadList(storage);
    root.replaceChildren(...(list.length ? list.map(row) : [Object.assign(document.createElement("li"), { textContent: "No replay yet: finish a match and it shows up here." })]));
  }

  return {
    render,
    async add(match) {
      const entry = { id: `${match.ts.toString(36)}${Math.random().toString(36).slice(2, 5)}`, ts: match.ts, title: titleOf(match), res: match.rs, data: await pack(match) };
      list = addEntry(loadList(storage), entry);
      while (!saveList(storage, list) && list.length > 1) list.pop();
      return entry;
    },
  };
}

// Controls over the running replay: h exposes the playback state and the actions, this only draws and forwards.
export function createPlaybar(h) {
  const bar = $("playbar"), seek = $("rpSeek"), SPEEDS = [0.5, 1, 2, 4];
  let drag = false, shown = "";
  seek.oninput = () => { drag = true; h.seek(+seek.value); };
  seek.onchange = () => (drag = false);
  $("rpPlay").onclick = () => h.pause(!h.state().paused);
  $("rpSpeed").onclick = () => h.speed(SPEEDS[(SPEEDS.indexOf(h.state().speed) + 1) % SPEEDS.length]);
  $("rpRestart").onclick = h.restart;
  $("rpNext").onclick = h.next;
  return {
    show(on) { bar.hidden = !on; shown = ""; },
    sync() {
      const { pb, g, paused, speed } = h.state();
      if (!pb || !g) return;
      const t = Math.min(pb.total - 1, pb.at(g.s)) | 0, key = `${t}|${paused}|${speed}|${pb.r}`;
      if (key === shown) return;
      shown = key;
      seek.max = Math.max(1, pb.total - 1);
      if (!drag) seek.value = t;
      $("rpPlay").textContent = paused ? "Play" : "Pause";
      $("rpSpeed").textContent = `${speed}x`;
      $("rpNext").hidden = pb.rounds.length < 2;
      $("rpTime").textContent = `${pb.rounds.length > 1 ? `R${pb.r + 1}/${pb.rounds.length} ` : ""}${clock(t)} / ${clock(pb.total)}`;
    },
  };
}
