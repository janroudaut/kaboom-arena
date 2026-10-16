const CACHE = "kaboom-v26";
const FILES = [
  "/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png",
  "/game/main.js", "/game/nav.js", "/game/home.js", "/game/sim.js", "/game/ai.js", "/game/render.js", "/game/input.js", "/game/net.js", "/game/netcode.js", "/game/lobby.js", "/game/look.js", "/game/settings.js", "/game/haptics.js", "/game/ux.js", "/game/campaign.js", "/game/story.js", "/game/storyui.js", "/game/director.js", "/game/sound.js", "/game/music.js", "/game/audio.js",
  "/game/vendor/qrcode.mjs", "/game/vendor/press-start-2p.woff2",
  ...["ignatius", "dynamita", "baron", "mama", "dolores", "tony", "fizzle", "kapow", "gunpowder"].map((id) => `/portraits/${id}.webp`),
  "/game/vendor/actioncable.esm.js", "/game/render3d.js", "/game/fx.js", "/game/raycast.js", "/game/fpsinput.js", "/game/fpstex.js", "/game/renderfps.js", "/game/vendor/three.module.min.js",
  "/game/vendor/three-addons/postprocessing/EffectComposer.js", "/game/vendor/three-addons/postprocessing/RenderPass.js",
  "/game/vendor/three-addons/postprocessing/ShaderPass.js", "/game/vendor/three-addons/postprocessing/UnrealBloomPass.js",
  "/game/vendor/three-addons/postprocessing/OutputPass.js", "/game/vendor/three-addons/postprocessing/Pass.js",
  "/game/vendor/three-addons/postprocessing/MaskPass.js", "/game/vendor/three-addons/postprocessing/ClearPass.js",
  "/game/vendor/three-addons/shaders/CopyShader.js", "/game/vendor/three-addons/shaders/LuminosityHighPassShader.js",
  "/game/vendor/three-addons/shaders/OutputShader.js", "/game/vendor/three-addons/geometries/RoundedBoxGeometry.js", "/game/vendor/three-addons/environments/RoomEnvironment.js",
];

// Heavy or optional files are cached on first use instead of at install: a slow connection must not stall or fail the whole install.
const LAZY = (f) => f.startsWith("/portraits/") || f.startsWith("/game/vendor/three");

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => Promise.allSettled(FILES.filter((f) => !LAZY(f)).map((f) => c.add(f)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// "Offline" setting: fetch whatever is still missing from the cache (lazy files included) and report back.
self.addEventListener("message", (e) => {
  if (e.data?.t !== "precache") return;
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    const missing = (await Promise.all(FILES.map(async (f) => ((await c.match(f)) ? null : f)))).filter(Boolean);
    const done = await Promise.allSettled(missing.map((f) => c.add(f)));
    const failed = done.filter((r) => r.status === "rejected").length;
    e.source?.postMessage({ t: "precached", total: FILES.length, failed });
  })());
});

// Network-first: modules always load as one consistent version; cache only serves offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname === "/cable") return;
  const net = () => fetch(e.request, { cache: "no-cache" }).then((r) => {
    if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
    return r;
  });
  // Portraits and vendored libraries only change with a cache bump: serve them from the cache first.
  const stable = url.pathname.startsWith("/portraits/") || url.pathname.startsWith("/game/vendor/");
  e.respondWith(
    stable
      ? caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || net())
      : net().catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
