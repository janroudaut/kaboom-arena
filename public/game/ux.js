import { ICONS } from "./render.js";
import { ABILITIES, SLOT_ABILITY } from "./sim.js";
import { ROSTER } from "./campaign.js";

const $ = (id) => document.getElementById(id);
const ITEMS = [
  ["Bomb", "+1 bomb at once"], ["Range", "longer blasts"], ["Speed", "run faster"], ["Kick", "walk into a bomb to push it"],
  ["Remote", "press bomb again to detonate"], ["Bomb pass", "walk through bombs"], ["Shield", "survive blasts for a few seconds"], ["Skull", "curse: a random handicap"],
  ["Glove", "bomb key on a bomb throws it 3 tiles"], ["Punch", "bomb key facing a bomb knocks it 2 tiles"],
  ["Cluster", "next bombs also drop a ring of mini-blasts"], ["Mine", "next bombs are hidden traps for rivals"], ["Frost", "next bombs freeze instead of kill"],
];
const SEEN = "helpSeen";

export function initHelp(openers, layer = {}) {
  const dlg = $("help"), done = $("helpDone");
  const item = ([name, text], i) => {
    const cv = Object.assign(document.createElement("canvas"), { width: 28, height: 28 });
    cv.getContext("2d").drawImage(ICONS[i], 0, 0, 28, 28);
    cv.setAttribute("aria-hidden", "true");
    const li = document.createElement("li");
    li.append(cv, Object.assign(document.createElement("span"), { innerHTML: `<b>${name}</b> ${text}` }));
    return li;
  };
  $("helpItems").replaceChildren(...ITEMS.slice(0, 8).map(item));
  $("helpItemsX").replaceChildren(...ITEMS.slice(8).map((e, i) => item(e, i + 8)));
  const COLOURS = ["White", "Black", "Red", "Blue"];
  $("helpAbil").replaceChildren(...ABILITIES.flatMap((a, i) => {
    if (!a) return [];
    const who = [...SLOT_ABILITY.flatMap((ab, k) => (ab === i ? [COLOURS[k]] : [])), ...ROSTER.filter((f) => f.ability === a[0]).map((f) => f.name)];
    const li = document.createElement("li");
    li.append(Object.assign(document.createElement("b"), { textContent: a[1] }), `${a[3]} (${who.join(", ")})`);
    return [li];
  }));
  let from = null;
  const open = () => {
    from = document.activeElement;
    layer.open?.();
    dlg.hidden = false;
    dlg.scrollTop = 0;
    done.focus();
    try { localStorage.setItem(SEEN, "1"); } catch {}
  };
  const close = () => {
    layer.close?.();
    dlg.hidden = true;
    from?.isConnected && from.focus?.();
  };
  done.onclick = close;
  dlg.onclick = (e) => e.target === dlg && close();
  addEventListener("keydown", (e) => {
    if (dlg.hidden) return;
    if (e.code === "Escape") close();
    if (e.code === "Escape" || e.code === "Tab") { e.preventDefault(); e.stopPropagation(); }
  }, true);
  for (const b of openers) b.addEventListener("click", open);
  let seen = true;
  try { seen = !!localStorage.getItem(SEEN); } catch {}
  if (!seen) open();
  return { close };
}

export function initInstall() {
  const btn = $("installBtn"), ios = $("iosHint");
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const iosSafari = /iP(hone|ad|od)/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
  ios.hidden = !(iosSafari && !standalone);
  let deferred = null;
  addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e;
    btn.hidden = false;
  });
  addEventListener("appinstalled", () => { deferred = null; btn.hidden = true; });
  btn.onclick = () => {
    const d = deferred;
    deferred = null;
    btn.hidden = true;
    d?.prompt();
  };
}

export function watchUpdates(wantsOffline, onCache) {
  const ask = () => navigator.serviceWorker?.ready.then((r) => r.active?.postMessage({ t: "precache" })).catch(() => {});
  if (!("serviceWorker" in navigator)) return { ask };
  const toast = $("toast");
  $("toastReload").onclick = () => location.reload();
  $("toastClose").onclick = () => (toast.hidden = true);
  let waiting = false;
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.t !== "precached") return;
    onCache(e.data);
    if (waiting) toast.hidden = false;
  });
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    if (wantsOffline()) ask();
    reg.update().catch(() => {});
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (!navigator.serviceWorker.controller) return;
        if (!wantsOffline()) { if (w.state === "installed") toast.hidden = false; return; }
        if (w.state === "activated") { waiting = true; ask(); }
      });
    });
    document.addEventListener("visibilitychange", () => document.hidden || reg.update().catch(() => {}));
  }).catch(() => {});
  return { ask };
}
