const CACHE = "kaboom-v15";
const FILES = [
  "/", "/index.html", "/manifest.webmanifest", "/icons/icon.svg", "/icons/icon-192.png", "/icons/icon-512.png",
  "/game/main.js", "/game/home.js", "/game/sim.js", "/game/ai.js", "/game/render.js", "/game/input.js", "/game/net.js", "/game/netcode.js", "/game/lobby.js", "/game/look.js", "/game/settings.js",
  "/game/vendor/qrcode.mjs",
  "/game/vendor/actioncable.esm.js", "/game/render3d.js", "/game/vendor/three.module.min.js",
  "/game/vendor/three-addons/postprocessing/EffectComposer.js", "/game/vendor/three-addons/postprocessing/RenderPass.js",
  "/game/vendor/three-addons/postprocessing/ShaderPass.js", "/game/vendor/three-addons/postprocessing/UnrealBloomPass.js",
  "/game/vendor/three-addons/postprocessing/OutputPass.js", "/game/vendor/three-addons/postprocessing/Pass.js",
  "/game/vendor/three-addons/postprocessing/MaskPass.js", "/game/vendor/three-addons/postprocessing/ClearPass.js",
  "/game/vendor/three-addons/shaders/CopyShader.js", "/game/vendor/three-addons/shaders/LuminosityHighPassShader.js",
  "/game/vendor/three-addons/shaders/OutputShader.js", "/game/vendor/three-addons/geometries/RoundedBoxGeometry.js", "/game/vendor/three-addons/environments/RoomEnvironment.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Network-first: modules always load as one consistent version; cache only serves offline.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname === "/cable") return;
  e.respondWith(
    fetch(e.request).then((r) => {
      if (r.ok) caches.open(CACHE).then((c) => c.put(e.request, r.clone()));
      return r;
    }).catch(() => caches.match(e.request, { ignoreSearch: true })),
  );
});
