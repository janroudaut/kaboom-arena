import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { W, H, T, SUDDEN, FLAME } from "./sim.js";
import { ICONS } from "./render.js";
import { esc } from "./lobby.js";
import { themeOf, teamInfo, teamsOf, curseText, hudEntries, bombPos, palette, view } from "./look.js";

const MOBILE = matchMedia("(pointer: coarse)").matches;
const FLAME_LIGHTS = MOBILE ? 2 : 6, MAX_PARTICLES = 400;
const FACE_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];

const FINISH_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 resolution; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * 0.02;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      vec2 px = 1.0 / resolution;
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
      col += (col - blur) * 1.4;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.4);
      col = (col - 0.5) * 1.1 + 0.5;
      col *= 1.0 - d * 0.9;
      col += (rnd(vUv * resolution + time) - 0.5) * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

function canvasTexture(w, h, paint) {
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  paint(cv.getContext("2d"));
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const groundTexture = (d3) => canvasTexture(W * 32, H * 32, (c) => {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      c.fillStyle = d3.ground[(x + y) % 2];
      c.fillRect(x * 32, y * 32, 32, 32);
      for (let i = 0; i < 24; i++) {
        c.fillStyle = d3.speck[Math.random() < 0.5 ? 0 : 1];
        c.fillRect(x * 32 + Math.random() * 30, y * 32 + Math.random() * 30, 2, 3);
      }
    }
  }
});

const brickTexture = ([base, hue, sat, light]) => canvasTexture(128, 128, (c) => {
  c.fillStyle = base; c.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 6; row++) {
    const off = row % 2 ? 0 : 32;
    for (let x = -32 + off; x < 128; x += 64) {
      c.fillStyle = `hsl(${hue} ${sat + Math.random() * 12}% ${light + Math.random() * 10}%)`;
      c.fillRect(x + 2, row * 21 + 2, 60, 17);
    }
  }
});

function makePlayer(id, skullMat, auraMat, tagMat) {
  const root = new THREE.Group();
  const suit = new THREE.MeshStandardMaterial({ color: palette().suit[id], roughness: 0.35, metalness: 0.15 });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xffd9b0, roughness: 0.5 });
  const black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
  const add = (geo, mat, x, y, z, parent = root) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  add(new THREE.CapsuleGeometry(0.2, 0.26, 4, 12), suit, 0, 0.5, 0);
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0);
  root.add(head);
  add(new THREE.SphereGeometry(0.31, 24, 18), suit, 0, 0, 0, head);
  const face = add(new THREE.SphereGeometry(0.22, 20, 16), skin, 0, -0.02, 0.15, head);
  face.scale.set(1, 0.95, 0.8);
  const eyes = [-1, 1].map((s) => add(new THREE.SphereGeometry(0.045, 12, 10), black, s * 0.085, 0.02, 0.31, head));
  add(new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6), black, 0, 0.35, 0, head);
  add(new THREE.SphereGeometry(0.06, 12, 10), new THREE.MeshStandardMaterial({ color: 0xe8453c, emissive: 0xe8453c, emissiveIntensity: 0.6 }), 0, 0.42, 0, head);

  const limb = (geo, mat, x, y, pivotY) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, pivotY, 0);
    root.add(pivot);
    add(geo, mat, 0, y - pivotY, 0, pivot);
    return pivot;
  };
  const legs = [-1, 1].map((s) => limb(new THREE.BoxGeometry(0.14, 0.22, 0.2), black, s * 0.11, 0.11, 0.22));
  const arms = [-1, 1].map((s) => limb(new THREE.SphereGeometry(0.075, 12, 10), skin, s * 0.27, 0.46, 0.62));

  const neural = new THREE.Group();
  head.add(neural);
  const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xff2d6a, roughness: 0.1, clearcoat: 1 });
  add(new THREE.SphereGeometry(0.05, 12, 10), lipMat, 0, -0.1, 0.3, neural).scale.set(1.4, 0.6, 0.6);
  const blush = new THREE.MeshBasicMaterial({ color: 0xff6fa5, transparent: true, opacity: 0.45 });
  for (const s of [-1, 1]) {
    add(new THREE.CircleGeometry(0.06, 14), blush, s * 0.16, -0.05, 0.3, neural).lookAt(s * 0.4, -0.05, 1);
    for (const k of [0, 1]) {
      const lash = add(new THREE.BoxGeometry(0.07, 0.012, 0.01), black, s * 0.1 + s * k * 0.03, 0.075 + k * 0.012, 0.325, neural);
      lash.rotation.z = s * (0.35 + k * 0.4);
    }
  }
  neural.visible = false;

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), new THREE.MeshPhysicalMaterial({ color: 0x5fe0ff, emissive: 0x2090c0, emissiveIntensity: 0.5, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }));
  bubble.position.y = 0.6;
  const skull = new THREE.Sprite(skullMat);
  skull.position.y = 1.9;
  skull.scale.setScalar(0.5);
  const aura = new THREE.Sprite(auraMat);
  aura.position.y = 0.8;
  aura.scale.setScalar(1.6);
  const tag = new THREE.Sprite(tagMat);
  tag.position.y = 1.55;
  tag.scale.setScalar(0.4);
  for (const o of [ring, bubble, skull, aura, tag]) o.visible = false;
  root.add(ring, bubble, skull, aura, tag);

  root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  root.userData = { head, eyes, legs, arms, neural, skin, suit, ring, bubble, skull, aura, tag, lastWalk: 0 };
  root.scale.setScalar(1.15);
  return root;
}

function makeBomb() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.36, 24, 18), new THREE.MeshStandardMaterial({ color: 0x15151c, roughness: 0.2, metalness: 0.8 }));
  body.position.y = 0.38;
  body.castShadow = true;
  const fuse = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8), new THREE.MeshStandardMaterial({ color: 0x8a5a2a }));
  fuse.position.set(0.08, 0.78, 0);
  fuse.rotation.z = -0.4;
  const spark = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0xffd23c, emissive: 0xffa000, emissiveIntensity: 4 }));
  spark.position.set(0.14, 0.88, 0);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color: 0xff463c, transparent: true }));
  halo.rotation.x = Math.PI / 2;
  halo.position.y = 0.06;
  halo.visible = false;
  g.add(body, fuse, spark, halo);
  g.userData = { body, spark, halo };
  return g;
}

const FIRE_OUTER = new THREE.MeshStandardMaterial({ color: 0xff5a10, emissive: 0xff4a00, emissiveIntensity: 1.4, transparent: true, opacity: 0.9 });
const FIRE_CORE = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2b0, emissiveIntensity: 2.2 });
const UNIT_SPHERE = new THREE.SphereGeometry(1, 20, 14);

function makeJet() {
  const g = new THREE.Group();
  const outer = new THREE.Mesh(UNIT_SPHERE, FIRE_OUTER);
  const core = new THREE.Mesh(UNIT_SPHERE, FIRE_CORE);
  g.add(outer, core);
  g.userData = { outer, core };
  return g;
}

// Groups adjacent flame cells of the same explosion into straight runs so the blast reads as one continuous jet.
function flameRuns(flames) {
  const cells = new Map();
  for (const f of flames) cells.set(`${f.x},${f.y}`, Math.max(f.t, cells.get(`${f.x},${f.y}`) ?? 0));
  const same = (x, y, t) => cells.get(`${x},${y}`) === t;
  const runs = [];
  const hit = new Set();
  for (const [key, t] of cells) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      if (same(x - dx, y - dy, t)) continue;
      let len = 1;
      while (same(x + dx * len, y + dy * len, t)) len++;
      if (len > 1) {
        runs.push({ x: x + 0.5 + (dx * (len - 1)) / 2, z: y + 0.5 + (dy * (len - 1)) / 2, len, horiz: !!dx, t });
        for (let i = 0; i < len; i++) {
          const k = `${x + dx * i},${y + dy * i}`;
          if (hit.has(`${k}|${dx ? "v" : "h"}`)) hit.add(`${k}|x`);
          hit.add(`${k}|${dx ? "h" : "v"}`);
        }
      }
    }
  }
  const balls = [];
  for (const [key, t] of cells) {
    if (hit.has(`${key}|x`) || (!hit.has(`${key}|h`) && !hit.has(`${key}|v`))) {
      const [x, y] = key.split(",").map(Number);
      balls.push({ x: x + 0.5, z: y + 0.5, t });
    }
  }
  return { runs, balls };
}

export function createRenderer3D(canvas, hudParent) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !MOBILE, powerPreference: "high-performance" });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = MOBILE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x16162b);
  if (!MOBILE) {
    scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.6;
  }
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const center = new THREE.Vector3(W / 2, 0, H / 2);

  const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x66785a, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffecc8, 2.8);
  sun.position.set(center.x - 7, 15, center.z + 9);
  sun.target.position.copy(center);
  sun.castShadow = true;
  sun.shadow.mapSize.setScalar(MOBILE ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -11, right: 11, top: 11, bottom: -11, near: 1, far: 40 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const rimLights = [[0xff3df0, -3, 3, -2], [0x3df0ff, W + 3, 3, H + 2]].map(([col, x, y, z]) => {
    const l = new THREE.PointLight(col, 90, 26);
    l.position.set(x, y, z);
    l.visible = false;
    scene.add(l);
    return l;
  });
  const flameLights = Array.from({ length: FLAME_LIGHTS }, () => {
    const l = new THREE.PointLight(0xff7a20, 0, 6);
    scene.add(l);
    return l;
  });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshStandardMaterial({ map: groundTexture(themeOf().d3), roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(W / 2, 0, H / 2);
  ground.receiveShadow = true;
  scene.add(ground);

  const hardMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1.1, 1, 3, 0.08), new THREE.MeshStandardMaterial({ color: 0x9a9fb8, metalness: MOBILE ? 0.15 : 0.7, roughness: MOBILE ? 0.5 : 0.28 }), W * H);
  const softMesh = new THREE.InstancedMesh(new RoundedBoxGeometry(0.94, 0.94, 0.94, 3, 0.06), new THREE.MeshStandardMaterial({ map: brickTexture(themeOf().d3.soft), roughness: 0.85 }), W * H);
  for (const m of [hardMesh, softMesh]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  const dummy = new THREE.Object3D();
  let themeKey = "grass";

  function applyTheme(th) {
    if (th.key === themeKey) return;
    themeKey = th.key;
    const d = th.d3;
    ground.material.map.dispose();
    ground.material.map = groundTexture(d);
    softMesh.material.map.dispose();
    softMesh.material.map = brickTexture(d.soft);
    hardMesh.material.color.setHex(d.hard);
    hardMesh.material.metalness = MOBILE ? 0.15 : d.metal;
    scene.background.setHex(d.bg);
    hemi.color.setHex(d.hemi[0]);
    hemi.groundColor.setHex(d.hemi[1]);
    hemi.intensity = d.hemi[2];
    sun.color.setHex(d.sun[0]);
    sun.intensity = d.sun[1];
  }

  const players = [], bombs = [], jets = [], balls = [], puffs = [], items = [];
  const grow = (pool, make, n, parent = scene) => {
    while (pool.length < n) { const o = make(); parent.add(o); pool.push(o); }
    pool.forEach((o, i) => (o.visible = i < n));
  };
  const itemMats = ICONS.map((cv) => {
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    return new THREE.SpriteMaterial({ map: tex });
  });

  const puffTex = canvasTexture(64, 64, (c) => {
    const grad = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "#fff"); grad.addColorStop(0.4, "#ffffff88"); grad.addColorStop(1, "#ffffff00");
    c.fillStyle = grad; c.fillRect(0, 0, 64, 64);
  });
  const tagMats = [1, 2, 3, 4].map((n) => new THREE.SpriteMaterial({
    map: canvasTexture(64, 64, (c) => {
      c.font = "bold 52px monospace"; c.textAlign = "center"; c.textBaseline = "middle";
      c.lineWidth = 10; c.strokeStyle = "#000"; c.strokeText(n, 32, 34);
      c.fillStyle = "#fff"; c.fillText(n, 32, 34);
    }),
    depthTest: false,
  }));
  const auraMat = new THREE.SpriteMaterial({ map: puffTex, color: 0xb040ff, opacity: 0.45, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  const puffMats = [0xff6a1a, 0xffc060].map((color) => new THREE.SpriteMaterial({ map: puffTex, color, opacity: 0.22, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const sparkGeo = new THREE.BufferGeometry();
  const sparkPos = new Float32Array(MAX_PARTICLES * 3).fill(-100);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, color: 0xffb040, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const spark = { vel: new Float32Array(MAX_PARTICLES * 3), life: new Float32Array(MAX_PARTICLES), next: 0 };

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);

  const hud = document.createElement("div");
  hud.id = "hud3";
  hud.innerHTML = '<div class="h3-scores"></div><button class="h3-badge"></button><div class="h3-banner"></div><div class="h3-spec">You\'re out – spectating</div>';
  hudParent.appendChild(hud);
  const [elScores, elBadge, elBanner, elSpec] = hud.children;

  let dlss = true, scale = MOBILE ? 0.7 : 1, w = 1, h = 1, shake = 0, still = false;
  const dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
  const MIN_SCALE = MOBILE ? 0.4 : 0.5;
  let frames = 0, acc = 0, fps = 60, lastNow = performance.now(), lastScale = lastNow;
  const seen = new Set();
  let lastHud = "";

  function resize() {
    w = innerWidth; h = innerHeight;
    renderer.setPixelRatio(dpr * scale);
    renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr * scale);
    composer.setSize(w, h);
    bloom.setSize((w * dpr * scale) >> 1, (h * dpr * scale) >> 1);
    finish.uniforms.resolution.value.set(w * dpr * scale, h * dpr * scale);
    camera.aspect = w / h;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const dist = Math.max(8.6 / (tanV * camera.aspect), 7.2 / tanV) * 1.04;
    const el = THREE.MathUtils.degToRad(72);
    camera.userData.base = new THREE.Vector3(center.x, Math.sin(el) * dist, center.z + Math.cos(el) * dist);
    camera.updateProjectionMatrix();
  }

  function emit(x, z) {
    if (still) return;
    for (let k = 0; k < 6; k++) {
      const i = spark.next++ % MAX_PARTICLES;
      sparkPos.set([x, 0.4, z], i * 3);
      spark.vel.set([(Math.random() - 0.5) * 3, 2 + Math.random() * 3, (Math.random() - 0.5) * 3], i * 3);
      spark.life[i] = 0.5 + Math.random() * 0.5;
    }
  }

  function setDlss(on) {
    dlss = on;
    renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    renderer.toneMappingExposure = on ? 1.3 : 1.15;
    for (const l of rimLights) l.visible = on;
    for (const p of players) {
      p.userData.neural.visible = on;
      p.userData.head.scale.setScalar(on ? 1.1 : 1);
      p.userData.eyes.forEach((e) => e.scale.setScalar(on ? 1.5 : 1));
      p.userData.skin.roughness = on ? 0.12 : 0.5;
      p.userData.skin.clearcoat = on ? 1 : 0;
    }
    itemMats.forEach((m) => m.color.setScalar(on ? 1.8 : 1));
  }

  function updateHud(g, now) {
    const s = g.s, tm = teamsOf(s);
    const one = (e) => `<span style="--c:${palette().suit[e.i]}" data-n="${view.cb ? e.i + 1 : ""}" class="${e.alive ? "" : "dead"} ${e.i === g.me ? "me" : ""}">${esc(e.name)} ${tm ? "" : e.score}${e.i === g.me ? " (you)" : ""}</span>`;
    const rows = hudEntries(g);
    const scores = tm
      ? [...new Set(rows.map((e) => e.team))].map((t) => {
        const mem = rows.filter((e) => e.team === t), ti = teamInfo(t);
        return `<span class="team" style="--c:${ti.col}"><b>${ti.name.toUpperCase()} ${mem[0].score}</b>${mem.map(one).join("")}</span>`;
      }).join("")
      : rows.map(one).join("");
    const me = g.me >= 0 ? s.players[g.me] : null;
    const cur = me?.alive ? curseText(me) : "";
    const sudden = s.tick >= SUDDEN - 300 && s.cfg?.suddenDeath !== false ? `<b class="h3-sudden">${s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON"}</b>` : g.win ? `<b class="h3-first">first to ${g.win}</b>` : "";
    const extra = sudden + (cur ? `<b class="h3-curse">${cur}</b>` : "");
    const badge = dlss
      ? `<b>DLSS 5 ON</b><br>Neural Faces™ · Frame Gen ×4<br>${Math.round(fps * 4)} FPS · AI res ${Math.round(scale * 100)}%`
      : `DLSS OFF · ${Math.round(fps)} FPS<br><small>click or press T to enable</small>`;
    const out = g.me >= 0 && !s.done && s.players[g.me]?.alive === false && !g.banner;
    const key = scores + extra + badge + g.banner + out + !!g.retro;
    if (key === lastHud) return;
    lastHud = key;
    elScores.innerHTML = scores + extra;
    elBadge.innerHTML = badge;
    elBadge.className = `h3-badge ${dlss ? "on" : ""}`;
    elBanner.textContent = g.banner || "";
    elBanner.className = g.retro ? "h3-banner retro" : "h3-banner";
    elBanner.style.display = g.banner ? "block" : "none";
    elSpec.style.display = out ? "block" : "none";
  }

  function draw(g) {
    const now = performance.now();
    const dt = Math.min((now - lastNow) / 1000, 0.1);
    lastNow = now;
    acc += dt; frames++;
    if (acc >= 0.5) {
      fps = frames / acc; frames = 0; acc = 0;
      if (now - lastScale > 1000) {
        const next = fps < 45 ? Math.max(MIN_SCALE, scale - 0.15) : fps > 57 && scale < 1 && now - lastScale > 4000 ? Math.min(1, scale + 0.1) : scale;
        if (next !== scale) { scale = next; resize(); lastScale = now; }
      }
    }

    const s = g.s, tm = teamsOf(s);
    applyTheme(themeOf(s.cfg));
    hardMesh.count = softMesh.count = 0;
    let nh = 0, ns = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = s.grid[y * W + x];
        if (!t) continue;
        const hgt = t === 1 ? 1.1 : 0.94;
        dummy.position.set(x + 0.5, hgt / 2, y + 0.5);
        dummy.updateMatrix();
        if (t === 1) hardMesh.setMatrixAt(nh++, dummy.matrix);
        else softMesh.setMatrixAt(ns++, dummy.matrix);
      }
    }
    hardMesh.count = nh; softMesh.count = ns;
    hardMesh.instanceMatrix.needsUpdate = softMesh.instanceMatrix.needsUpdate = true;

    s.players.forEach((p, i) => {
      if (!players[i]) { players[i] = makePlayer(i, itemMats[7], auraMat, tagMats[i]); scene.add(players[i]); setDlss(dlss); }
      const m = players[i], u = m.userData;
      m.visible = p.alive;
      if (!p.alive) return;
      u.tag.visible = view.cb;
      if (u.pal !== palette()) { u.pal = palette(); u.suit.color.set(u.pal.suit[i]); }
      u.ring.visible = !!tm;
      if (tm) u.ring.material.color.set(teamInfo(tm[i]).col);
      u.bubble.visible = p.shield > 0 && !(p.shield < 60 && p.shield % 10 < 5);
      u.skull.visible = u.aura.visible = !!p.curse;
      u.skull.position.y = 1.9 + Math.sin(now / 200) * 0.06;
      const moving = p.walk !== u.lastWalk;
      u.lastWalk = p.walk;
      const swing = moving ? Math.sin(p.walk * 0.45) * 0.7 : 0;
      m.position.set(p.x / T, moving ? Math.abs(Math.sin(p.walk * 0.45)) * 0.06 : 0, p.y / T);
      u.legs[0].rotation.x = swing; u.legs[1].rotation.x = -swing;
      u.arms[0].rotation.x = -swing; u.arms[1].rotation.x = swing;
      const target = FACE_ANGLE[p.face];
      let d = target - m.rotation.y;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      m.rotation.y += d * 0.3;
    });

    grow(bombs, makeBomb, s.bombs.length);
    s.bombs.forEach((b, i) => {
      const o = bombs[i];
      const rate = b.t < 40 ? 3 : 1;
      const [bx, by] = bombPos(b, s.grid), remote = !!s.players[b.owner]?.remote;
      o.position.set(bx + 0.5, 0, by + 0.5);
      const { halo, body } = o.userData;
      halo.visible = remote;
      halo.material.opacity = 0.55 + 0.4 * Math.sin(s.tick / 4);
      body.material.color.setHex(remote ? 0x4a0c10 : 0x15151c);
      body.material.emissive.setHex(remote ? 0x6a0a0a : 0);
      o.userData.body.scale.setScalar(1 + Math.sin((b.t * rate) / 5) * 0.07);
      o.userData.spark.visible = b.t % 8 < 5;
    });

    const fresh = [];
    for (const f of s.flames) if (!seen.has(`${f.x},${f.y}`)) fresh.push(f);
    seen.clear();
    s.flames.forEach((f) => seen.add(`${f.x},${f.y}`));

    const { runs, balls: blobs } = flameRuns(s.flames);
    const envelope = (t) => Math.min(1, (FLAME - t + 3) / 6, t / 8);
    grow(jets, makeJet, runs.length);
    runs.forEach((r, i) => {
      const o = jets[i], e = envelope(r.t), flick = 0.92 + Math.random() * 0.16;
      o.position.set(r.x, 0.5, r.z);
      o.rotation.y = r.horiz ? 0 : Math.PI / 2;
      const half = ((r.len - 1) / 2 + 0.42) * e;
      o.userData.outer.scale.set(half, 0.4 * e * flick, 0.4 * e * flick);
      o.userData.core.scale.set(half * 0.92, 0.2 * e * flick, 0.2 * e * flick);
    });
    grow(balls, makeJet, blobs.length);
    blobs.forEach((b, i) => {
      const o = balls[i], e = envelope(b.t), flick = 0.92 + Math.random() * 0.16;
      o.position.set(b.x, 0.5, b.z);
      o.rotation.y = 0;
      o.userData.outer.scale.setScalar(0.62 * e * flick);
      o.userData.core.scale.setScalar(0.4 * e * flick);
    });

    const puffSpots = [];
    for (const r of runs) {
      const n = Math.round(r.len * 1.6) + 1, e = envelope(r.t);
      for (let k = 0; k < n; k++) {
        const along = ((k + Math.random() * 0.6) / n - 0.5) * (r.len + 0.4);
        puffSpots.push([r.x + (r.horiz ? along : 0), r.z + (r.horiz ? 0 : along), e]);
      }
    }
    for (const b of blobs) puffSpots.push([b.x, b.z, envelope(b.t)]);
    grow(puffs, () => new THREE.Sprite(puffMats[0]), puffSpots.length);
    puffSpots.forEach(([x, z, e], i) => {
      const o = puffs[i];
      o.material = puffMats[i % 2];
      o.position.set(x + (Math.random() - 0.5) * 0.25, 0.45 + Math.random() * 0.3, z + (Math.random() - 0.5) * 0.25);
      o.scale.setScalar((0.8 + Math.random() * 0.5) * e);
    });
    for (const f of fresh) emit(f.x + 0.5, f.y + 0.5);
    if (fresh.length && !still) shake = Math.min(1, shake + 0.35);
    flameLights.forEach((l, i) => {
      const f = s.flames[Math.floor((i * s.flames.length) / FLAME_LIGHTS)];
      l.intensity = f ? 9 * Math.min(1, f.t / FLAME) : 0;
      if (f) l.position.set(f.x + 0.5, 1.2, f.y + 0.5);
    });

    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (spark.life[i] <= 0) { sparkPos[i * 3 + 1] = -100; continue; }
      spark.life[i] -= dt;
      spark.vel[i * 3 + 1] -= 9 * dt;
      for (let a = 0; a < 3; a++) sparkPos[i * 3 + a] += spark.vel[i * 3 + a] * dt;
    }
    sparkGeo.attributes.position.needsUpdate = true;

    grow(items, () => new THREE.Sprite(itemMats[0]), s.items.length);
    s.items.forEach((it, i) => {
      const o = items[i];
      const mat = itemMats[it.type];
      o.visible = !!mat;
      if (!mat) return;
      o.material = mat;
      o.position.set(it.x + 0.5, 0.6 + Math.sin(now / 300 + it.x) * 0.1, it.y + 0.5);
      o.scale.setScalar(0.85);
    });

    const base = camera.userData.base;
    shake *= 0.9;
    camera.position.set(base.x + (Math.random() - 0.5) * shake * 0.25, base.y + (Math.random() - 0.5) * shake * 0.25, base.z);
    camera.lookAt(center);

    finish.uniforms.time.value = now / 1000;
    if (dlss) composer.render();
    else renderer.render(scene, camera);
    updateHud(g, now);
  }

  elBadge.addEventListener("click", () => setDlss(!dlss));
  addEventListener("keydown", (e) => { if (e.code === "KeyT" && e.target.tagName !== "INPUT" && hud.offsetParent) setDlss(!dlss); });
  addEventListener("resize", resize);
  resize();
  return { draw, resize, setDlss, hud, setStill: (on) => { still = on; shake = 0; }, get dlss() { return dlss; } };
}
