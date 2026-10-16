import { ICONS } from "./render.js";

const $ = (id) => document.getElementById(id);
const ITEMS = [
  ["Bomb", "+1 bomb at once"], ["Range", "longer blasts"], ["Speed", "run faster"], ["Kick", "walk into a bomb to push it"],
  ["Remote", "press bomb again to detonate"], ["Bomb pass", "walk through bombs"], ["Shield", "survive blasts for a few seconds"], ["Skull", "curse: a random handicap"],
];
const SEEN = "helpSeen";

export function initHelp(openers) {
  const dlg = $("help"), done = $("helpDone");
  $("helpItems").replaceChildren(...ITEMS.map(([name, text], i) => {
    const cv = Object.assign(document.createElement("canvas"), { width: 28, height: 28 });
    cv.getContext("2d").drawImage(ICONS[i], 0, 0, 28, 28);
    cv.setAttribute("aria-hidden", "true");
    const li = document.createElement("li");
    li.append(cv, Object.assign(document.createElement("span"), { innerHTML: `<b>${name}</b> ${text}` }));
    return li;
  }));
  let from = null;
  const open = () => {
    from = document.activeElement;
    dlg.hidden = false;
    dlg.scrollTop = 0;
    done.focus();
    try { localStorage.setItem(SEEN, "1"); } catch {}
  };
  const close = () => {
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

export function watchUpdates() {
  if (!("serviceWorker" in navigator)) return;
  const toast = $("toast");
  $("toastReload").onclick = () => location.reload();
  $("toastClose").onclick = () => (toast.hidden = true);
  navigator.serviceWorker.register("/sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      w?.addEventListener("statechange", () => {
        if (w.state === "installed" && navigator.serviceWorker.controller) toast.hidden = false;
      });
    });
    document.addEventListener("visibilitychange", () => document.hidden || reg.update().catch(() => {}));
  }).catch(() => {});
}
