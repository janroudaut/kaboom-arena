import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { W, H, T, SUDDEN, FLAME, FUSE, END_DELAY, ICE, CONV, SPIKE, TELE, SPIKE_ON, SPIKE_WARN, POTATO_TICKS, spikeIn } from "./sim.js";
import { ICONS } from "./render.js";
import { esc } from "./lobby.js";
import { createObserver } from "./fx.js";
import { loadPanel, savePanel, sanitizePanel, PANEL_DEFAULTS, bloomStrength, fpsLine, statLine, toastText, halluVariant, createCadence, createGovernor, flareDots, FLARE_N, DISCLAIMER, CATCHPHRASE } from "./dlss6.js";
import { placeBubble } from "./director.js";
import { themeOf, teamInfo, teamsOf, curseText, hudEntries, bombPos, palette, view, humansOf, foeLook, FLOORC, EVENT_INFO, spikePhase, eventText, modeText } from "./look.js";

const MOBILE = matchMedia("(pointer: coarse)").matches;
const FLAME_LIGHTS = MOBILE ? 2 : 6, MAX_PARTICLES = 400;
const FACE_ANGLE = [Math.PI, Math.PI / 2, 0, -Math.PI / 2];
const FX = { death: 0.8, drop: 0.35, crumble: 0.45, flourish: 1.4, debris: MOBILE ? 28 : 56, pieces: MOBILE ? 3 : 4, fuseRate: MOBILE ? 0.5 : 1 };
// DLSS parody gags: [min, max] seconds between occurrences (game time, so pauses do not count).
const PUNCH_S = 0.9, AI_TAGS = ["AI-enhanced", "+4 generated frames", "neural upscaled*"];
const GAG = { toast: [20, 40], toastShow: 3.5, halluc: [30, 60], halluShow: 0.6, shimmer: 1.2, reshimmer: [50, 90], gap: 6, checklist: 6, tickEvery: 0.45 };
const FAKE_FEATURES = ["Ray Reconstruction", "Frame Gen ×6", "Neural Faces™", "Super Resolution"];
const PIN = /[?&]dlss6=max\b/.test(location.search);
const FLARE_LIFE = 0.55, FLARE_COLS = [0xffd9a0, 0x6ad0ff, 0xff6ae0, 0xa0ffb0, 0xffa060];
const HOT = [1, 0.62, 0.2], GOLD = [1, 0.9, 0.35], SMOKE = [0.75, 0.75, 0.8];
const WHITE = new THREE.Color(1, 1, 1);
const pick = (a) => a[(Math.random() * a.length) | 0];

const FINISH_SHADER = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, boost: { value: 0 }, chroma: { value: 1 }, resolution: { value: new THREE.Vector2(1, 1) } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform float boost; uniform float chroma; uniform vec2 resolution; varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float d = dot(c, c);
      vec2 off = c * d * 0.02 * chroma;
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      vec2 px = 1.0 / resolution;
      vec3 blur = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
                 + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
      col += (col - blur) * (1.4 + boost * 3.0);
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(vec3(l), col, 1.4);
      col = (col - 0.5) * (1.1 + boost * 0.3) + 0.5;
      col *= 1.0 - d * 0.9;
      col += (rnd(vUv * resolution + time) - 0.5) * 0.03;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const SHAFT_SHADER = {
  uniforms: { tDiffuse: { value: null }, light: { value: new THREE.Vector2(0.2, 0.9) }, strength: { value: 0.4 } },
  vertexShader: FINISH_SHADER.vertexShader,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform vec2 light; uniform float strength; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 dir = light - vUv; float len = max(length(dir), 1e-4);
      vec2 stp = dir / len * min(len * 0.85, 0.2) / 16.0;
      vec2 uv = vUv; vec3 acc = vec3(0.0); float w = 1.0;
      for (int i = 0; i < 16; i++) {
        uv += stp;
        vec3 c = texture2D(tDiffuse, uv).rgb;
        acc += min(c, vec3(3.0)) * smoothstep(0.9, 2.2, max(c.r, max(c.g, c.b))) * w;
        w *= 0.88;
      }
      gl_FragColor = vec4(base.rgb + acc * (strength / 16.0), base.a);
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

const PG = {
  torso: new THREE.CapsuleGeometry(0.2, 0.26, 4, 12),
  skull: new THREE.SphereGeometry(0.31, 24, 18),
  face: new THREE.SphereGeometry(0.22, 20, 16),
  bezel: new THREE.SphereGeometry(0.24, 20, 16),
  eye: new THREE.SphereGeometry(0.045, 12, 10),
  glint: new THREE.SphereGeometry(0.02, 8, 6),
  stalk: new THREE.CylinderGeometry(0.015, 0.015, 0.1, 6),
  bulb: new THREE.SphereGeometry(0.06, 12, 10),
  leg: new THREE.BoxGeometry(0.14, 0.22, 0.2),
  shoe: new THREE.BoxGeometry(0.16, 0.09, 0.28),
  sleeve: new THREE.CapsuleGeometry(0.05, 0.06, 3, 8),
  hand: new THREE.SphereGeometry(0.085, 12, 10),
  lip: new THREE.SphereGeometry(0.05, 12, 10),
  blush: new THREE.CircleGeometry(0.06, 14),
  lash: new THREE.BoxGeometry(0.07, 0.012, 0.01),
  ring: new THREE.TorusGeometry(0.4, 0.045, 8, 32),
  bubble: new THREE.SphereGeometry(0.62, 24, 16),
  horn: new THREE.ConeGeometry(0.06, 0.22, 8),
};
const HORN = new THREE.MeshStandardMaterial({ color: 0xefe6d0, roughness: 0.5 });
const BLACK = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3 });
const GLOVE = new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.5 });
const BEZEL = new THREE.MeshStandardMaterial({ color: 0x20202c, roughness: 0.4 });
const BULB = new THREE.MeshStandardMaterial({ color: 0xe8453c, emissive: 0xe8453c, emissiveIntensity: 0.6 });
const GLINT = new THREE.MeshBasicMaterial({ color: 0xffffff });

function makePlayer(id, skullMat, auraMat, tagMat, foe) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const suit = new THREE.MeshStandardMaterial({ color: foe ? foeLook().suit : palette().suit[id], roughness: 0.35, metalness: 0.15 });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0xffd9b0, roughness: 0.5 });
  const add = (geo, mat, x, y, z, parent = body) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  };
  const torso = add(PG.torso, suit, 0, 0.5, 0);
  torso.castShadow = true;
  const head = new THREE.Group();
  head.position.set(0, 0.98, 0);
  body.add(head);
  add(PG.skull, suit, 0, 0, 0, head).castShadow = true;
  add(PG.bezel, BEZEL, 0, -0.02, 0.14, head).scale.set(1, 0.97, 0.72);
  const face = add(PG.face, skin, 0, -0.02, 0.15, head);
  face.scale.set(1, 0.95, 0.8);
  const eyes = [-1, 1].map((s) => add(PG.eye, BLACK, s * 0.085, 0.02, 0.31, head));
  const ant = new THREE.Group();
  ant.position.set(0, 0.3, 0);
  head.add(ant);
  add(PG.stalk, BLACK, 0, 0.05, 0, ant);
  add(PG.bulb, BULB, 0, 0.12, 0, ant);
  if (foe) for (const s of [-1, 1]) { const h = add(PG.horn, HORN, s * 0.2, 0.22, 0, head); h.rotation.z = -s * 0.5; }

  const pivot = (x, y, parent) => {
    const p = new THREE.Group();
    p.position.set(x, y, 0);
    parent.add(p);
    return p;
  };
  const legs = [-1, 1].map((s) => {
    const p = pivot(s * 0.11, 0.22, body);
    add(PG.leg, suit, 0, -0.11, 0, p).castShadow = true;
    add(PG.shoe, BLACK, 0, -0.175, 0.04, p).castShadow = true;
    return p;
  });
  const arms = [-1, 1].map((s) => {
    const p = pivot(s * 0.27, 0.62, body);
    add(PG.sleeve, suit, 0, -0.07, 0, p);
    add(PG.hand, GLOVE, 0, -0.17, 0, p).castShadow = true;
    return p;
  });

  const neural = new THREE.Group();
  head.add(neural);
  const lipMat = new THREE.MeshPhysicalMaterial({ color: 0xff2d6a, roughness: 0.1, clearcoat: 1 });
  add(PG.lip, lipMat, 0, -0.1, 0.3, neural).scale.set(1.4, 0.6, 0.6);
  const blush = new THREE.MeshBasicMaterial({ color: 0xff6fa5, transparent: true, opacity: 0.45 });
  const glints = [];
  for (const s of [-1, 1]) {
    add(PG.blush, blush, s * 0.16, -0.05, 0.3, neural).lookAt(s * 0.4, -0.05, 1);
    glints.push(add(PG.glint, GLINT, s * 0.085 + 0.025, 0.055, 0.366, neural));
    for (const k of [0, 1]) {
      const lash = add(PG.lash, BLACK, s * 0.1 + s * k * 0.03, 0.075 + k * 0.012, 0.325, neural);
      lash.rotation.z = s * (0.35 + k * 0.4);
    }
  }
  neural.visible = false;

  const ring = new THREE.Mesh(PG.ring, new THREE.MeshBasicMaterial({ color: foe ? foeLook().ring : 0xffffff }));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  const bubble = new THREE.Mesh(PG.bubble, new THREE.MeshPhysicalMaterial({ color: 0x5fe0ff, emissive: 0x2090c0, emissiveIntensity: 0.5, transparent: true, opacity: 0.28, roughness: 0.1, depthWrite: false }));
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

  root.userData = { body, torso, head, ant, eyes, glints, legs, arms, neural, skin, suit, ring, bubble, skull, aura, tag, lastWalk: 0, lean: 0, dieT: -1, foe };
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

// The re-imagined block must never hide a bomb, flame or player standing next to it.
const crowded = (s, x, y) => [...s.bombs, ...s.flames, ...s.players.filter((p) => p.alive).map((p) => ({ x: Math.floor(p.x / T), y: Math.floor(p.y / T) }))].some((o) => Math.abs(o.x - x) <= 1 && Math.abs(o.y - y) <= 1);

export function createRenderer3D(canvas, hudParent, { onPanel } = {}) {
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
  const dummy = new THREE.Object3D(), dummy2 = new THREE.Object3D();
  let themeKey = "grass";

  const debris = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), softMesh.material, FX.debris);
  debris.frustumCulled = false;
  scene.add(debris);
  const deb = { pos: new Float32Array(FX.debris * 3), vel: new Float32Array(FX.debris * 3), rot: new Float32Array(FX.debris * 3), spin: new Float32Array(FX.debris * 3), life: new Float32Array(FX.debris), size: new Float32Array(FX.debris), next: 0, live: 0 };
  dummy2.scale.setScalar(0);
  dummy2.updateMatrix();
  for (let i = 0; i < FX.debris; i++) debris.setMatrixAt(i, dummy2.matrix);

  const fingerGeo = new THREE.CylinderGeometry(0.05, 0.07, 0.5, 8).translate(0, 0.25, 0);
  const fingerMat = new THREE.MeshStandardMaterial({ color: 0xffc7a0, emissive: 0xff4fa0, emissiveIntensity: 0.5 });
  const fingers = new THREE.Group();
  const fingerPivots = Array.from({ length: 6 }, () => {
    const p = new THREE.Group();
    p.add(new THREE.Mesh(fingerGeo, fingerMat));
    fingers.add(p);
    return p;
  });
  fingers.visible = false;
  scene.add(fingers);
  const studs = new THREE.Group();
  const studGeo = new THREE.CylinderGeometry(0.09, 0.09, 0.12, 10);
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(studGeo, fingerMat);
    m.position.set((i % 3) * 0.28 - 0.28, 0, ((i / 3) | 0) * 0.28 - 0.28);
    studs.add(m);
  }
  studs.visible = false;
  scene.add(studs);


  function applyTheme(th) {
    if (th.key === themeKey) return;
    themeKey = th.key;
    const d = th.d3;
    ground.material.map.dispose();
    ground.material.map = groundTexture(d);
    if (hv) hv.under.material.map = ground.material.map;
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
  const sparkPos = new Float32Array(MAX_PARTICLES * 3).fill(-100), sparkCol = new Float32Array(MAX_PARTICLES * 3).fill(0.8);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute("color", new THREE.BufferAttribute(sparkCol, 3));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  sparks.frustumCulled = false;
  scene.add(sparks);
  const spark = { vel: new Float32Array(MAX_PARTICLES * 3), life: new Float32Array(MAX_PARTICLES), next: 0 };

  // ---- extras: floor tiles, chaos telegraphs, hill zone, hot potato (all hidden unless the state has them)
  const FLOOR_CAP = 40, flatPlane = new THREE.PlaneGeometry(0.96, 0.96).rotateX(-Math.PI / 2);
  const floorGrp = new THREE.Group();
  floorGrp.visible = false;
  scene.add(floorGrp);
  const iceTex = canvasTexture(64, 64, (c) => {
    c.fillStyle = FLOORC.ice.base; c.fillRect(0, 0, 64, 64);
    c.fillStyle = FLOORC.ice.hi;
    for (const [x, y, l] of [[10, 44, 22], [30, 24, 16], [40, 48, 12]]) for (let i = 0; i < l; i++) c.fillRect(x + i, y - i, 3, 3);
    c.fillStyle = FLOORC.ice.lo; c.fillRect(0, 60, 64, 4); c.fillRect(60, 0, 4, 64);
  });
  const beltTex = canvasTexture(64, 64, (c) => {
    c.fillStyle = FLOORC.conv.base; c.fillRect(0, 0, 64, 64);
    c.fillStyle = FLOORC.conv.edge; c.fillRect(0, 0, 6, 64); c.fillRect(58, 0, 6, 64);
    c.fillStyle = FLOORC.conv.arrow;
    for (const y of [4, 36]) for (let r = 0; r < 12; r++) { c.fillRect(32 - 2 - r * 2, y + r * 2, 5, 4); c.fillRect(32 - 2 + r * 2, y + r * 2, 5, 4); }
  });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
  const decal = (map, extra) => new THREE.MeshStandardMaterial({ map, polygonOffset: true, polygonOffsetFactor: -2, ...extra });
  const iceMesh = new THREE.InstancedMesh(flatPlane, decal(iceTex, { roughness: 0.08, metalness: 0.05 }), FLOOR_CAP);
  const beltMesh = new THREE.InstancedMesh(flatPlane, decal(beltTex, { roughness: 0.7 }), FLOOR_CAP);
  const SPIKE_CAP = 8;
  const plateMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.05, 0.9), new THREE.MeshStandardMaterial({ roughness: 0.6 }), SPIKE_CAP);
  const tipMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.09, 0.45, 6).translate(0, 0.225, 0), new THREE.MeshBasicMaterial(), SPIKE_CAP * 4);
  for (const m of [iceMesh, beltMesh, plateMesh, tipMesh]) { m.count = 0; m.frustumCulled = false; floorGrp.add(m); }
  for (const m of [iceMesh, beltMesh, plateMesh]) m.receiveShadow = true;
  const glintMat = new THREE.SpriteMaterial({ map: canvasTexture(32, 32, (c) => { c.fillStyle = "#fff"; c.fillRect(15, 2, 2, 28); c.fillRect(2, 15, 28, 2); c.fillRect(13, 13, 6, 6); }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const glints = Array.from({ length: 12 }, () => { const o = new THREE.Sprite(glintMat.clone()); o.scale.setScalar(0.3); o.visible = false; floorGrp.add(o); return o; });
  const padGrp = new THREE.Group();
  floorGrp.add(padGrp);
  const padRings = [0.34, 0.25, 0.16].map((r) => new THREE.TorusGeometry(r, 0.022, 6, 28).rotateX(Math.PI / 2));
  const padBase = new THREE.CircleGeometry(0.42, 24).rotateX(-Math.PI / 2), padDot = new THREE.SphereGeometry(0.05, 8, 6);
  const padBaseMat = new THREE.MeshStandardMaterial({ color: 0x14141f, roughness: 0.5 });
  const padMats = FLOORC.tele.map((col) => new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 1.4 }));
  const C_RET = new THREE.Color(0x6a6a7a), C_WARN = [new THREE.Color(FLOORC.spike.warn), new THREE.Color(0xff7a2a)], C_HOT = new THREE.Color(FLOORC.spike.hot);
  const P_RET = new THREE.Color(0x2e2e3a), P_WARN = new THREE.Color(0x5a4210), P_HOT = new THREE.Color(0x5a1812);
  const fl = { ref: null, key: "", ice: [], belt: [], spikes: [], pads: [] };
  const TIP = [[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]];

  function syncFloor(s) {
    const f = s.floor;
    if (f === fl.ref) return;
    fl.ref = f;
    const key = f ? f.join("") : "";
    if (key === fl.key) return;
    fl.key = key;
    fl.ice.length = fl.belt.length = fl.spikes.length = 0;
    for (const o of fl.pads) padGrp.remove(o);
    fl.pads.length = 0;
    floorGrp.visible = !!f;
    if (!f) return;
    f.forEach((code, i) => {
      if (code === ICE && fl.ice.length < FLOOR_CAP) fl.ice.push(i);
      else if (code >= CONV && code < CONV + 4 && fl.belt.length < FLOOR_CAP) fl.belt.push(i);
      else if (code === SPIKE && fl.spikes.length < SPIKE_CAP) fl.spikes.push(i);
      else if (code >= TELE && fl.pads.length < 8) {
        const k = (code - TELE) % padMats.length, g = new THREE.Group(), x = (i % W) + 0.5, z = Math.floor(i / W) + 0.5;
        g.position.set(x, 0.02, z);
        g.add(new THREE.Mesh(padBase, padBaseMat));
        for (let r = 0; r <= k && r < 3; r++) g.add(new THREE.Mesh(padRings[r], padMats[k])).position.y = 0.01;
        const dot = new THREE.Mesh(padDot, padMats[k]);
        dot.position.y = 0.06;
        g.add(dot);
        g.userData = { dot, ph: i };
        padGrp.add(g);
        fl.pads.push(g);
      }
    });
    fl.ice.forEach((i, j) => { dummy.position.set((i % W) + 0.5, 0.015, Math.floor(i / W) + 0.5); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); iceMesh.setMatrixAt(j, dummy.matrix); });
    fl.belt.forEach((i, j) => { dummy.position.set((i % W) + 0.5, 0.016, Math.floor(i / W) + 0.5); dummy.rotation.set(0, -(f[i] - CONV) * Math.PI / 2, 0); dummy.updateMatrix(); beltMesh.setMatrixAt(j, dummy.matrix); });
    dummy.rotation.set(0, 0, 0);
    iceMesh.count = fl.ice.length; beltMesh.count = fl.belt.length;
    iceMesh.instanceMatrix.needsUpdate = beltMesh.instanceMatrix.needsUpdate = true;
    plateMesh.count = fl.spikes.length; tipMesh.count = fl.spikes.length * 4;
  }

  function updateFloor(s) {
    if (!s.floor) return;
    if (fl.belt.length && !still) beltTex.offset.y = -((clk * 1.1) % 1);
    fl.ice.forEach((_, j) => {
      const o = glints[j % glints.length], i = fl.ice[j];
      o.visible = true;
      o.position.set((i % W) + 0.7, 0.12, Math.floor(i / W) + 0.3);
      o.material.opacity = still ? 0.8 : Math.max(0, Math.sin(clk * 2.2 + j * 1.9)) ** 6;
    });
    for (let j = fl.ice.length; j < glints.length; j++) glints[j].visible = false;
    for (const g of fl.pads) {
      const a = still ? g.userData.ph : clk * 2.4 + g.userData.ph;
      g.userData.dot.position.set(Math.cos(a) * 0.26, 0.06, Math.sin(a) * 0.26);
    }
    if (!fl.spikes.length) return;
    fl.spikes.forEach((i, j) => {
      const ph = spikePhase(s, i), cx = (i % W) + 0.5, cz = Math.floor(i / W) + 0.5;
      const sy = ph === 2 ? 1.05 : ph === 1 ? 0.3 + 0.5 * (1 - spikeIn(s, i) / (SPIKE_ON - SPIKE_WARN)) : 0.2;
      plateMesh.setColorAt(j, ph === 2 ? P_HOT : ph === 1 ? P_WARN : P_RET);
      dummy.position.set(cx, 0.025, cz); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      plateMesh.setMatrixAt(j, dummy.matrix);
      const col = ph === 2 ? C_HOT : ph === 1 ? C_WARN[still || s.tick % 8 < 4 ? 0 : 1] : C_RET;
      TIP.forEach(([dx, dz], k) => {
        dummy.position.set(cx + dx, 0.05, cz + dz); dummy.scale.set(1, sy, 1); dummy.updateMatrix();
        tipMesh.setMatrixAt(j * 4 + k, dummy.matrix);
        tipMesh.setColorAt(j * 4 + k, col);
      });
    });
    dummy.scale.set(1, 1, 1);
    plateMesh.instanceMatrix.needsUpdate = tipMesh.instanceMatrix.needsUpdate = true;
    if (plateMesh.instanceColor) plateMesh.instanceColor.needsUpdate = tipMesh.instanceColor.needsUpdate = true;
  }

  const zoneFill = new THREE.PlaneGeometry(3, 3).rotateX(-Math.PI / 2), zoneBar = [[3.1, 0.08, 0, -1.5], [3.1, 0.08, 0, 1.5], [0.08, 3.1, -1.5, 0], [0.08, 3.1, 1.5, 0]];
  function makeZone(col, opacity) {
    const g = new THREE.Group(), fill = new THREE.Mesh(zoneFill, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity, depthWrite: false }));
    const mat = new THREE.MeshBasicMaterial({ color: col });
    g.add(fill);
    for (const [w, d, x, z] of zoneBar) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, d), mat); b.position.set(x, 0.03, z); g.add(b); }
    g.visible = false;
    g.userData = { fill, mat };
    scene.add(g);
    return g;
  }
  const hillZ = makeZone(FLOORC.hill, 0.22), hillNext = makeZone(FLOORC.next, 0.1);
  const HOT_RED = new THREE.Color(0xe8453c), GOLD_C = new THREE.Color(FLOORC.hill);

  function updateHill(s) {
    const h = s.hill;
    hillZ.visible = !!h;
    hillNext.visible = !!(h && Array.isArray(h.next) && (still || Math.floor(clk * 4) % 3));
    if (!h) return;
    let n = 0;
    for (const p of s.players) if (p.alive && Math.abs(Math.floor(p.x / T) - h.x) <= 1 && Math.abs(Math.floor(p.y / T) - h.y) <= 1) n++;
    hillZ.position.set(h.x + 0.5, 0.03, h.y + 0.5);
    hillZ.userData.mat.color.copy(n > 1 ? HOT_RED : GOLD_C);
    hillZ.userData.fill.material.color.copy(n > 1 ? HOT_RED : GOLD_C);
    hillZ.userData.fill.material.opacity = n ? 0.5 : 0.32;
    if (hillNext.visible) hillNext.position.set(h.next[0] + 0.5, 0.035, h.next[1] + 0.5);
  }

  const markMat = new THREE.MeshBasicMaterial({ transparent: true }), markRing = new THREE.TorusGeometry(0.42, 0.04, 6, 24).rotateX(Math.PI / 2);
  const markBomb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), new THREE.MeshBasicMaterial({ color: 0x14141c }));
  const markGemMat = new THREE.MeshBasicMaterial({ color: 0xffe14a }), markCrackMat = new THREE.MeshBasicMaterial({ color: 0x1c120a });
  const marks = Array.from({ length: 8 }, () => {
    const g = new THREE.Group(), bomb = markBomb.clone(), gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.14), markGemMat), crack = new THREE.Group();
    for (const r of [0.6, -0.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.03, 0.07), markCrackMat); b.rotation.y = r; crack.add(b); }
    g.add(new THREE.Mesh(markRing, markMat), bomb, gem, crack);
    g.userData = { bomb, gem, crack };
    g.visible = false;
    scene.add(g);
    return g;
  });
  const swapMat = new THREE.MeshBasicMaterial({ color: 0xc06bff }), swapRing = new THREE.TorusGeometry(0.6, 0.05, 6, 28).rotateX(Math.PI / 2);
  const swapRings = [0, 1].map(() => { const m = new THREE.Mesh(swapRing, swapMat); m.visible = false; scene.add(m); return m; });
  const swapLine = new THREE.Line(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3)), new THREE.LineBasicMaterial({ color: 0xc06bff, transparent: true, opacity: 0.6 }));
  swapLine.frustumCulled = false;
  swapLine.visible = false;
  scene.add(swapLine);
  let markCol = "";

  function updateEvent(s) {
    const e = s.event, info = e && EVENT_INFO[e.type], tiles = info && Array.isArray(e.tiles) ? e.tiles : [];
    const lit = !e || still || e.t % 16 < 11;
    if (info && info.col !== markCol) { markCol = info.col; markMat.color.set(info.col); }
    marks.forEach((m, i) => {
      const t = tiles[i];
      m.visible = Array.isArray(t) && !!lit;
      if (!m.visible) return;
      const u = m.userData, quake = e.type === "quake";
      m.position.set(t[0] + 0.5, quake ? 1 : 0.06, t[1] + 0.5);
      m.scale.setScalar(still ? 1 : 1 + 0.12 * Math.sin(clk * 8));
      u.bomb.visible = e.type === "bombrain"; u.gem.visible = e.type === "itemrain"; u.crack.visible = quake;
      u.bomb.position.y = 0.16; u.gem.position.y = 0.4 + (still ? 0 : Math.sin(clk * 4) * 0.06); u.crack.position.y = 0.02;
    });
    const sw = e?.type === "swap" && s.players[e.a]?.alive && s.players[e.b]?.alive;
    for (let k = 0; k < 2; k++) {
      const p = sw && s.players[k ? e.b : e.a], r = swapRings[k];
      r.visible = !!p && !!lit;
      if (p) r.position.set(p.x / T, 0.06, p.y / T);
    }
    swapLine.visible = !!sw;
    if (sw) {
      const a = s.players[e.a], b = s.players[e.b], pos = swapLine.geometry.attributes.position;
      pos.setXYZ(0, a.x / T, 0.5, a.y / T); pos.setXYZ(1, b.x / T, 0.5, b.y / T);
      pos.needsUpdate = true;
    }
  }

  const potatoGrp = new THREE.Group();
  potatoGrp.visible = false;
  scene.add(potatoGrp);
  const potatoMesh = new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 10).scale(1.2, 0.9, 1), new THREE.MeshStandardMaterial({ color: 0xd9a24e, roughness: 0.7 }));
  const potatoSpark = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd23c }));
  const potatoAura = new THREE.Sprite(new THREE.SpriteMaterial({ map: puffTex, color: 0xff8a2a, opacity: 0.5, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  potatoAura.scale.setScalar(1.9);
  potatoAura.position.y = 0.7;
  const potatoRing = new THREE.Mesh(PG.ring, new THREE.MeshBasicMaterial({ color: 0xff8a2a }));
  potatoRing.rotation.x = Math.PI / 2;
  potatoRing.position.y = 0.05;
  potatoMesh.position.y = potatoSpark.position.y = 1.85;
  const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x000000, opacity: 0.75, transparent: true, depthTest: false }));
  const barFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x7bd34a, depthTest: false }));
  barBg.renderOrder = 10; barFill.renderOrder = 11;
  barBg.scale.set(0.9, 0.14, 1);
  barBg.position.y = barFill.position.y = 2.25;
  potatoGrp.add(potatoAura, potatoRing, potatoMesh, potatoSpark, barBg, barFill);
  const BAR_OK = new THREE.Color(0x7bd34a), BAR_MID = new THREE.Color(0xffb02a), BAR_LOW = new THREE.Color(0xff3b30);

  function updatePotato(s, dt) {
    const po = s.potato, h = po && s.players[po.holder];
    potatoGrp.visible = !!h?.alive;
    if (!potatoGrp.visible) return;
    const f = Math.max(0, Math.min(1, po.t / POTATO_TICKS)), x = h.x / T, z = h.y / T, flash = !still && f < 0.25 && s.tick % 8 < 4;
    potatoGrp.position.set(x, 0, z);
    potatoAura.material.opacity = flash ? 0.8 : 0.5;
    potatoAura.material.color.setHex(flash ? 0xff3b30 : 0xff8a2a);
    potatoRing.scale.setScalar(still ? 1 : 1 + 0.08 * Math.sin(clk * 8));
    potatoMesh.position.y = 1.85 + (still ? 0 : Math.sin(clk * 5) * 0.05);
    potatoSpark.position.set(0.2, potatoMesh.position.y + 0.2, 0);
    potatoSpark.visible = s.tick % 6 < 4;
    barFill.scale.set(0.84 * f + 0.001, 0.08, 1);
    barFill.position.x = -0.42 * (1 - f);
    barFill.material.color.copy(f > 0.5 ? BAR_OK : f > 0.25 ? BAR_MID : BAR_LOW);
    if (!still && Math.random() < dt * (6 + 50 * (1 - f))) emit(x + 0.2, potatoMesh.position.y + 0.2, z, 1, GOLD, 1.6, 0.5);
  }

  const ghostTex = canvasTexture(64, 64, (c) => {
    c.strokeStyle = "#ffd23c"; c.lineWidth = 4;
    c.beginPath(); c.ellipse(32, 8, 12, 4, 0, 0, 7); c.stroke();
    c.fillStyle = "#fff";
    c.beginPath(); c.moveTo(14, 58); c.lineTo(14, 32); c.quadraticCurveTo(14, 14, 32, 14); c.quadraticCurveTo(50, 14, 50, 32); c.lineTo(50, 58);
    for (let x = 50; x > 14; x -= 12) c.quadraticCurveTo(x - 3, 50, x - 6, 58);
    c.closePath(); c.fill();
    c.strokeStyle = "#222"; c.lineWidth = 3;
    for (const x of [25, 39]) { c.beginPath(); c.moveTo(x - 4, 28); c.lineTo(x + 4, 36); c.moveTo(x + 4, 28); c.lineTo(x - 4, 36); c.stroke(); }
  });
  const fxMat = (map) => new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false });
  const ghosts = Array.from({ length: 4 }, () => { const o = new THREE.Sprite(fxMat(ghostTex)); o.visible = false; o.userData = { t: -1, x: 0, y: 0, z: 0 }; scene.add(o); return o; });
  const fxs = Array.from({ length: MOBILE ? 8 : 16 }, () => { const o = new THREE.Sprite(fxMat(puffTex)); o.visible = false; o.userData = { t: -1 }; scene.add(o); return o; });
  let fxNext = 0;
  const drops = new Map();
  const observe = createObserver();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.5, 0.5, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const finish = new ShaderPass(FINISH_SHADER);
  composer.addPass(finish);

  const hud = document.createElement("div");
  hud.id = "hud3";
  hud.innerHTML = '<div class="h3-scores"></div><div class="h3-info"></div><div class="h3-frenzy"></div><div class="h3-left"><button class="h3-badge"></button><button class="h3-gear" hidden aria-label="DLSS 6 control panel (G)" title="DLSS 6 control panel (G)">⚙ RTX settings</button></div><div class="h3-toast"></div><div class="h3-banner"><span></span><small class="h3-stat"></small></div><div class="h3-spec">You\'re out – spectating</div><div class="h3-call"></div><div class="h3-bub"></div><div class="h3-bub"></div>';
  hudParent.appendChild(hud);
  const [elScores, elInfo, elFrenzy, elLeft, elToast, elBanner, elSpec, elCall, ...elBub] = hud.children;
  const [elBadge, elGear] = elLeft.children;
  const [elBannerText, elStat] = elBanner.children;

  let dlss = true, scale = MOBILE ? 0.7 : 1, w = 1, h = 1, shake = 0, still = false;
  const dpr = Math.min(window.devicePixelRatio || 1, MOBILE ? 1.5 : 2);
  const MIN_SCALE = MOBILE ? 0.4 : 0.5;
  let frames = 0, acc = 0, fps = 60, lastNow = performance.now(), lastScale = lastNow;
  const seen = new Set();
  let lastHud = "", lastBanner = "", statN = 0, frenzyCls = "";
  let clk = 0, dlssT = 0, toastHide = 0, halluEnd = 0, halluStart = 0, halluIdx = 0, halluCell = -1, halluKind = "fingers", shimT0 = 0, statK = 0;
  const store = () => { try { return localStorage; } catch { return null; } };
  let opt = loadPanel(store()), hv = null, flareAt = -1, flareNext = 0;
  const cadence = () => createCadence({ toast: GAG.toast, halluc: GAG.halluc, shimmer: GAG.reshimmer }, GAG.gap);
  let cad = cadence();
  const gov = createGovernor();
  const flareBuf = new Float32Array(FLARE_N * 4);
  let curS = null, colDirty = false, shownCall = null, pun = null;
  const tmpV = new THREE.Vector3(), tmpL = new THREE.Vector3(), spot = {}, aoM = new THREE.Matrix4();

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

  function emit(x, y, z, n, c = HOT, spd = 3, lf = 1) {
    if (still) return;
    for (let k = 0; k < n; k++) {
      const j = spark.next++ % MAX_PARTICLES, i = j * 3;
      sparkPos[i] = x; sparkPos[i + 1] = y; sparkPos[i + 2] = z;
      spark.vel[i] = (Math.random() - 0.5) * spd;
      spark.vel[i + 1] = spd * 0.6 + Math.random() * spd;
      spark.vel[i + 2] = (Math.random() - 0.5) * spd;
      sparkCol[i] = c[0]; sparkCol[i + 1] = c[1]; sparkCol[i + 2] = c[2];
      spark.life[j] = (0.5 + Math.random() * 0.5) * lf;
    }
    colDirty = true;
  }

  function spawnFx(x, y, z, map, color, s0, grow, vy, a0, dur) {
    const o = fxs[fxNext++ % fxs.length], f = o.userData;
    o.material.map = map;
    o.material.color.set(color);
    o.position.set(x, y, z);
    o.visible = true;
    Object.assign(f, { t: 0, s0, grow, vy, a0, dur });
    o.scale.setScalar(s0);
    o.material.opacity = a0;
  }

  function spawnDebris(x, z) {
    const n = FX.pieces + 1;
    for (let k = 0; k < n; k++) {
      const j = deb.next++ % FX.debris, i = j * 3, chunk = k === 0;
      deb.pos[i] = x + (chunk ? 0 : (Math.random() - 0.5) * 0.6); deb.pos[i + 1] = chunk ? 0.47 : 0.3 + Math.random() * 0.5; deb.pos[i + 2] = z + (chunk ? 0 : (Math.random() - 0.5) * 0.6);
      deb.vel[i] = chunk ? 0 : (Math.random() - 0.5) * 4; deb.vel[i + 1] = chunk ? 1.2 : 1.5 + Math.random() * 2; deb.vel[i + 2] = chunk ? 0 : (Math.random() - 0.5) * 4;
      for (let a = 0; a < 3; a++) { deb.rot[i + a] = 0; deb.spin[i + a] = (Math.random() - 0.5) * (chunk ? 4 : 16); }
      deb.size[j] = chunk ? 0.94 : 0.24 + Math.random() * 0.14;
      if (deb.life[j] <= 0) deb.live++;
      deb.life[j] = FX.crumble;
    }
  }

  function freeFx() {
    drops.clear();
    deb.life.fill(0); deb.live = 0;
    dummy2.scale.setScalar(0); dummy2.updateMatrix();
    for (let i = 0; i < FX.debris; i++) debris.setMatrixAt(i, dummy2.matrix);
    debris.instanceMatrix.needsUpdate = true;
    for (const o of [...fxs, ...ghosts]) { o.userData.t = -1; o.visible = false; }
    for (const m of players) { m.userData.dieT = -1; m.scale.setScalar(1.15); }
  }

  function onEvent(kind, a, b, c) {
    if (kind === "reset") return freeFx();
    if (still) return;
    if (kind === "wall") spawnDebris(a + 0.5, b + 0.5);
    else if (kind === "bomb") drops.set(b * W + a, clk);
    else if (kind === "pick") {
      spawnFx(a + 0.5, 0.7, b + 0.5, itemMats[c]?.map ?? puffTex, itemMats[c]?.color ?? WHITE, 0.85, 1, 0.9, 1, 0.5);
      emit(a + 0.5, 0.8, b + 0.5, MOBILE ? 6 : 12, GOLD, 5);
    } else if (kind === "die") {
      const m = players[a], p = curS.players[a];
      if (!m) return;
      const u = m.userData, x = p.x / T, z = p.y / T;
      u.dieT = 0;
      for (const o of [u.ring, u.bubble, u.skull, u.aura, u.tag]) o.visible = false;
      for (let k = 0; k < (MOBILE ? 2 : 3); k++) spawnFx(x + (Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.4, z + (Math.random() - 0.5) * 0.4, puffTex, 0x8a8a96, 0.5, 1.8, 0.6, 0.6, 0.7);
      emit(x, 0.8, z, MOBILE ? 8 : 16, SMOKE, 4);
      const gh = ghosts[a];
      if (!gh) return;
      const g = gh.userData;
      gh.material.color.set(palette().suit[a]).lerp(WHITE, 0.7);
      Object.assign(g, { t: 0, x, y: 1.1, z });
      gh.scale.setScalar(1);
      gh.visible = true;
    }
  }

  function updateFx(dt, ended) {
    for (const o of fxs) {
      const f = o.userData;
      if (f.t < 0) continue;
      f.t += dt;
      const k = f.t / f.dur;
      if (k >= 1) { f.t = -1; o.visible = false; continue; }
      o.position.y += f.vy * dt;
      o.scale.setScalar(f.s0 * (1 + f.grow * k));
      o.material.opacity = f.a0 * (1 - k);
    }
    for (const o of ghosts) {
      const g = o.userData;
      if (g.t < 0) continue;
      g.t += dt;
      const a = ended ? Math.min(1, g.t / 0.25) * 0.6 : Math.min(1, g.t / 0.2) * Math.max(0, 1 - Math.max(0, g.t - 0.3) / 1.2);
      if (a <= 0 && g.t > 0.3) { g.t = -1; o.visible = false; continue; }
      o.material.opacity = a;
      o.position.set(g.x + Math.sin(g.t * 3) * 0.08, g.y + Math.min(g.t, 1.2) * 0.8, g.z);
    }
    if (deb.live > 0) {
      for (let j = 0; j < FX.debris; j++) {
        if (deb.life[j] <= 0) continue;
        const i = j * 3;
        deb.life[j] -= dt;
        if (deb.life[j] <= 0) {
          deb.live--;
          dummy2.scale.setScalar(0);
        } else {
          deb.vel[i + 1] -= 10 * dt;
          for (let a = 0; a < 3; a++) { deb.pos[i + a] += deb.vel[i + a] * dt; deb.rot[i + a] += deb.spin[i + a] * dt; }
          dummy2.position.set(deb.pos[i], deb.pos[i + 1], deb.pos[i + 2]);
          dummy2.rotation.set(deb.rot[i], deb.rot[i + 1], deb.rot[i + 2]);
          dummy2.scale.setScalar(deb.size[j] * (deb.life[j] / FX.crumble));
        }
        dummy2.updateMatrix();
        debris.setMatrixAt(j, dummy2.matrix);
      }
      debris.instanceMatrix.needsUpdate = true;
    }
    debris.visible = deb.live > 0;
  }

  function applyFaces() {
    const f = dlss && opt.faces;
    for (const p of players) {
      if (!p) continue;
      p.userData.neural.visible = f;
      p.userData.head.scale.setScalar(f ? 1.1 : 1);
      p.userData.eyes.forEach((e) => e.scale.setScalar(f ? 1.5 : 1));
      p.userData.skin.roughness = f ? 0.12 : 0.5;
      p.userData.skin.clearcoat = f ? 1 : 0;
    }
  }

  function setDlss(on) {
    if (on && !dlss) { dlssT = 0; shimT0 = 0; cad = cadence(); gov.level = 3; }
    dlss = on;
    renderer.toneMapping = on ? THREE.ACESFilmicToneMapping : THREE.NeutralToneMapping;
    renderer.toneMappingExposure = on ? 1.3 : 1.15;
    for (const l of rimLights) l.visible = on;
    applyFaces();
    itemMats.forEach((m) => m.color.setScalar(on ? 1.8 : 1));
    elGear.hidden = !on;
    syncHeavy();
    lastHud = "";
  }

  // Desktop-only extras (floor reflections, contact shadows, light shafts, lens flares): built on entering DLSS, fully disposed on leaving.
  function syncHeavy() {
    const want = dlss && !MOBILE && !still;
    if (want && !hv) buildHeavy();
    else if (!want && hv) disposeHeavy();
    applyQuality();
  }

  function buildHeavy() {
    const mirror = new THREE.Group();
    mirror.scale.y = -1;
    const mh = new THREE.InstancedMesh(hardMesh.geometry, hardMesh.material, W * H), ms = new THREE.InstancedMesh(softMesh.geometry, softMesh.material, W * H);
    mh.instanceMatrix = hardMesh.instanceMatrix;
    ms.instanceMatrix = softMesh.instanceMatrix;
    mh.frustumCulled = ms.frustumCulled = false;
    mirror.add(mh, ms);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(W, H).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ground.material.map, color: 0x303030 }));
    under.position.set(W / 2, -1.3, H / 2);
    const aoTex = canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 4, 32, 32, 32);
      g.addColorStop(0, "rgba(0,0,0,0.9)"); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const ao = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.9, 1.9).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: aoTex, transparent: true, depthWrite: false, opacity: 0.6 }), W * H);
    ao.frustumCulled = false;
    ao.count = 0;
    const shafts = new ShaderPass(SHAFT_SHADER);
    composer.insertPass(shafts, 2);
    const dotTex = canvasTexture(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.35, "rgba(255,255,255,0.35)"); g.addColorStop(1, "rgba(255,255,255,0)");
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
    const streakTex = canvasTexture(128, 16, (c) => {
      const g = c.createLinearGradient(0, 0, 128, 0);
      g.addColorStop(0, "rgba(120,200,255,0)"); g.addColorStop(0.5, "rgba(190,230,255,1)"); g.addColorStop(1, "rgba(120,200,255,0)");
      c.fillStyle = g; c.fillRect(0, 7, 128, 2);
    });
    const flares = Array.from({ length: 2 }, () => ({ t: -1, sprites: Array.from({ length: FLARE_N + 1 }, (_, i) => {
      const m = new THREE.SpriteMaterial({ map: i < FLARE_N ? dotTex : streakTex, color: i < FLARE_N ? FLARE_COLS[i] : 0xffffff, blending: THREE.AdditiveBlending, transparent: true, depthTest: false, depthWrite: false, opacity: 0 });
      const sp = new THREE.Sprite(m);
      sp.renderOrder = 10;
      sp.visible = false;
      camera.add(sp);
      return sp;
    }) }));
    scene.add(mirror, under, ao, camera);
    hv = { mirror, mh, ms, under, ao, shafts, aoTex, dotTex, streakTex, flares, fnext: 0, rt: false, rr: false, fl: false };
    renderer.compile(scene, camera);
  }

  function disposeHeavy() {
    const { mirror, under, ao, shafts, aoTex, dotTex, streakTex, flares } = hv;
    scene.remove(mirror, under, ao, camera);
    composer.removePass(shafts);
    shafts.dispose();
    under.geometry.dispose(); under.material.dispose();
    ao.geometry.dispose(); ao.material.dispose(); ao.dispose();
    for (const f of flares) for (const sp of f.sprites) { camera.remove(sp); sp.material.dispose(); }
    aoTex.dispose(); dotTex.dispose(); streakTex.dispose();
    setGroundGloss(false);
    hv = null;
  }

  function setGroundGloss(on) {
    const m = ground.material;
    if (m.transparent === on) return;
    m.transparent = on;
    ground.renderOrder = on ? -1 : 0;
    m.opacity = on ? 0.76 : 1;
    m.needsUpdate = true;
  }

  function applyQuality() {
    bloom.strength = bloomStrength(opt.bloom);
    finish.uniforms.chroma.value = opt.chroma ? 1 : 0;
    if (!hv) return;
    const lv = PIN ? 3 : gov.level;
    hv.rt = opt.rt && lv >= 2;
    hv.rr = opt.rr && lv >= 3;
    hv.fl = opt.flare && lv >= 1;
    hv.mirror.visible = hv.under.visible = hv.ao.visible = hv.rt;
    hv.shafts.enabled = hv.rr;
    setGroundGloss(hv.rt);
    if (!hv.fl) for (const f of hv.flares) { f.t = -1; for (const sp of f.sprites) sp.visible = false; }
  }

  function updateHeavy(s, dt, fresh) {
    if (hv.rr) {
      tmpV.copy(sun.position).project(camera);
      hv.shafts.uniforms.light.value.set(tmpV.x * 0.5 + 0.5, tmpV.y * 0.5 + 0.5);
    }
    bloom.strength = bloomStrength(opt.bloom) * (hv.fl ? 1 + 0.6 * Math.min(1, s.flames.length / 12) : 1);
    if (!hv.fl) return;
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    if (fresh.length && clk > flareNext) {
      const f = fresh[0], fl = hv.flares[hv.fnext++ % 2];
      tmpV.set(f.x + 0.5, 0.5, f.y + 0.5).project(camera);
      fl.t = 0; fl.x = tmpV.x; fl.y = tmpV.y;
      flareNext = clk + 0.3;
    }
    for (const fl of hv.flares) {
      if (fl.t < 0) continue;
      fl.t += dt;
      const k = fl.t / FLARE_LIFE, off = k >= 1;
      if (!off) flareDots(flareBuf, fl.x, fl.y, k);
      fl.sprites.forEach((sp, i) => {
        sp.visible = !off;
        if (off) return;
        if (i === FLARE_N) {
          sp.position.set(fl.x * halfH * camera.aspect, fl.y * halfH, -1);
          sp.scale.set(halfH * 3 * (0.4 + k), halfH * 0.5, 1);
          sp.material.opacity = (1 - k) * (1 - k);
          return;
        }
        sp.position.set(flareBuf[i * 4] * halfH * camera.aspect, flareBuf[i * 4 + 1] * halfH, -1);
        sp.scale.setScalar(flareBuf[i * 4 + 2] * halfH);
        sp.material.opacity = flareBuf[i * 4 + 3];
      });
      if (off) fl.t = -1;
    }
  }

  function setOpt(k, v) {
    opt = sanitizePanel({ ...opt, [k]: v });
    savePanel(store(), opt);
    applyFaces();
    applyQuality();
    lastHud = "";
  }

  function resetOpt() {
    opt = { ...PANEL_DEFAULTS };
    savePanel(store(), opt);
    applyFaces();
    applyQuality();
    lastHud = "";
  }

  function updateHud(g, now) {
    const s = g.s, tm = teamsOf(s);
    const one = (e) => `<span style="--c:${palette().suit[e.i]}" data-n="${view.cb ? e.i + 1 : ""}" class="${e.alive ? "" : "dead"} ${e.i === g.me ? "me" : ""}">${esc(e.name)} ${tm || e.score < 0 ? "" : e.score}${e.pts >= 0 ? `·${e.pts}` : ""}${e.i === g.me ? " (you)" : ""}</span>`;
    const rows = hudEntries(g);
    const scores = tm
      ? [...new Set(rows.map((e) => e.team))].map((t) => {
        const mem = rows.filter((e) => e.team === t), ti = teamInfo(t);
        return `<span class="team" style="--c:${ti.col}"><b>${ti.name.toUpperCase()} ${mem[0].score}</b>${mem.map(one).join("")}</span>`;
      }).join("")
      : rows.map(one).join("");
    const me = g.me >= 0 ? s.players[g.me] : null;
    const cur = me?.alive ? curseText(me) : "";
    const sudden = s.tick >= SUDDEN - 300 && s.cfg?.suddenDeath !== false ? `<b class="h3-sudden">${s.tick >= SUDDEN ? "SUDDEN DEATH" : "SUDDEN DEATH SOON"}</b>` : g.win && !s.survival ? `<b class="h3-first">first to ${g.win}</b>` : "";
    const mt = modeText(s), et = eventText(s);
    const info = (mt ? `<b class="h3-mode">${esc(mt)}</b>` : "") + (et ? `<b class="h3-event" style="color:${EVENT_INFO[s.event.type].col}">${esc(et)}</b>` : "");
    const extra = sudden + (cur ? `<b class="h3-curse">${cur}</b>` : "");
    const live = `${opt.fgen ? fpsLine(fps) : `${Math.round(fps)} FPS`} · AI res ${Math.round(scale * 100)}%`;
    const ticks = Math.floor(dlssT / GAG.tickEvery);
    const badge = dlss
      ? `<b>DLSS 6 ON</b><br>${!still && dlssT < GAG.checklist ? FAKE_FEATURES.map((f, i) => `${i < ticks ? "✔" : "…"} ${f}`).join("<br>") : `${opt.faces ? "Neural Faces™ · " : ""}Frame Gen ×${opt.fgen ? 6 : 1}`}<br>${live}`
      : `DLSS OFF · ${Math.round(fps)} FPS<br><small>click or press T to enable</small>`;
    const out = g.me >= 0 && !s.done && s.players[g.me]?.alive === false && !g.banner;
    if (g.banner !== lastBanner) { lastBanner = g.banner; statN = 23 + ((Math.random() * 390) | 0); statK = (Math.random() * 3) | 0; }
    const stat = dlss && !g.retro && g.banner && (s.end >= 0 || s.done) ? statLine(statN, statK) : "";
    const key = scores + extra + info + badge + g.banner + stat + out + !!g.retro;
    if (key === lastHud) return;
    lastHud = key;
    elScores.innerHTML = scores + extra;
    elInfo.innerHTML = info;
    elBadge.innerHTML = badge;
    elBadge.className = `h3-badge ${dlss ? "on" : ""}`;
    elBadge.title = dlss ? `${CATCHPHRASE} ${DISCLAIMER}` : "";
    elBannerText.textContent = g.banner || "";
    elStat.textContent = stat;
    elBanner.className = g.retro ? "h3-banner retro" : "h3-banner";
    elBanner.style.display = g.banner ? "block" : "none";
    elSpec.style.display = out ? "block" : "none";
  }

  function updateCall(g) {
    const k = g.call ?? null;
    if (k === shownCall) return;
    shownCall = k;
    if (!k) { elCall.style.display = "none"; return; }
    elCall.textContent = k.text;
    if (dlss && !still && !g.retro && Math.random() < 0.3) elCall.append(Object.assign(document.createElement("small"), { textContent: pick(AI_TAGS) }));
    elCall.className = g.retro ? "h3-call retro" : "h3-call";
    elCall.style.display = "block";
    const fade = [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }];
    const pop = fade.map((f, i) => ({ ...f, transform: i === 0 ? "scale(1.7) rotate(-4deg)" : i === 1 ? "scale(1)" : "none" }));
    elCall.animate(k.still || still ? fade : pop, { duration: k.until - k.at, fill: "forwards" });
  }

  function updateBubbles(g) {
    for (let i = 0; i < 2; i++) {
      const el = elBub[i], b = g.bub?.[i], p = b && g.s.players[i];
      if (!p) {
        if (el._b) { el._b = null; el.style.display = "none"; }
        continue;
      }
      if (el._b !== b) {
        el._b = b;
        el.textContent = b.lines.join("\n");
        el.style.display = "block";
        el._w = el.offsetWidth; el._h = el.offsetHeight;
      }
      tmpV.set(p.x / T, 1.9, p.y / T).project(camera);
      const bx = [8, 56, w - 8, h - (MOBILE ? 170 : 8)], hole = [w * 0.38, h * 0.36, w * 0.62, h * 0.64];
      placeBubble(spot, (tmpV.x * 0.5 + 0.5) * w, (-tmpV.y * 0.5 + 0.5) * h, el._w, el._h, bx, hole, 4);
      el.style.transform = `translate(${spot.x | 0}px,${spot.y | 0}px)`;
      el.classList.toggle("notail", !spot.tail);
    }
  }

  function draw(g) {
    const now = performance.now();
    const rdt = Math.min((now - lastNow) / 1000, 0.1), dt = rdt * (g.ts ?? 1);
    lastNow = now;
    acc += rdt; frames++;
    clk += dt;
    if (dlss) dlssT += dt;
    if (acc >= 0.5) {
      fps = frames / acc;
      const quality = hv && !PIN ? gov.update(fps, acc, scale >= 1) : null;
      if (quality) { applyQuality(); lastScale = now; }
      frames = 0; acc = 0;
      if (now - lastScale > 1000 && !PIN) {
        const next = fps < 45 && !(hv && gov.level > 0) ? Math.max(MIN_SCALE, scale - 0.15) : fps > 57 && scale < 1 && now - lastScale > 4000 ? Math.min(1, scale + 0.1) : scale;
        if (next !== scale) { scale = next; resize(); lastScale = now; }
      }
    }

    const s = g.s, tm = teamsOf(s);
    curS = s;
    applyTheme(themeOf(s.cfg));
    const nHum = humansOf(s);
    s.players.forEach((p, i) => {
      if (players[i] && players[i].userData.foe !== (i >= nHum)) { scene.remove(players[i]); players[i] = null; }
      if (!players[i] && !p.dormant) { players[i] = makePlayer(i, itemMats[7], auraMat, tagMats[i], i >= nHum); scene.add(players[i]); setDlss(dlss); }
    });
    observe(s, onEvent);

    const gags = dlss && !still && opt.fgen;
    let halluW = 0;
    halluCell = -1;
    if (gags) {
      if (halluEnd) {
        if (clk > halluEnd) halluEnd = 0;
        else if (s.grid[halluIdx] === 2) { halluCell = halluIdx; halluW = Math.sin((Math.PI * (clk - halluStart)) / GAG.halluShow); }
      } else if (cad.due("halluc", dlssT)) {
        const from = (Math.random() * W * H) | 0;
        for (let k = 0; k < W * H && !halluEnd; k++) {
          const i = (from + k) % (W * H);
          if (s.grid[i] === 2 && !crowded(s, i % W, (i / W) | 0)) { halluIdx = i; halluStart = clk; halluEnd = clk + GAG.halluShow; halluKind = halluVariant(Math.random); }
        }
        if (!halluEnd) cad.defer("halluc", dlssT, 10);
      }
      if (cad.due("toast", dlssT)) {
        const name = g.names?.[(Math.random() * s.players.length) | 0] || "Player";
        elToast.textContent = toastText(Math.random, name);
        elToast.className = "h3-toast on";
        toastHide = clk + GAG.toastShow;
      }
      if (cad.due("shimmer", dlssT)) shimT0 = dlssT;
    } else halluEnd = 0;
    if (toastHide && (!gags || clk > toastHide)) { toastHide = 0; elToast.className = "h3-toast"; }
    fingers.visible = halluCell >= 0 && halluKind === "fingers";
    studs.visible = halluCell >= 0 && halluKind === "studs";
    if (studs.visible) {
      studs.position.set((halluCell % W) + 0.5, 0.94 * (1 + 0.5 * halluW) + 0.06 * halluW, Math.floor(halluCell / W) + 0.5);
      studs.rotation.y = Math.sin(clk * 30) * 0.5 * halluW;
      studs.scale.setScalar(halluW);
    }
    if (fingers.visible) {
      fingers.position.set((halluCell % W) + 0.5, 0.94 * (1 + 0.5 * halluW), Math.floor(halluCell / W) + 0.5);
      fingerPivots.forEach((f, i) => {
        const a = (i * Math.PI) / 3, wig = Math.sin(clk * 40 + i * 2) * 0.2;
        f.rotation.set(Math.cos(a) * 0.55 + wig, 0, Math.sin(a) * 0.55 - wig);
        f.scale.setScalar(halluW);
      });
    }

    hardMesh.count = softMesh.count = 0;
    let nh = 0, ns = 0;
    const ao = hv?.rt ? hv.ao : null;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = s.grid[y * W + x];
        if (!t) continue;
        const hgt = t === 1 ? 1.1 : 0.94, hal = y * W + x === halluCell;
        const sy = hal ? 1 + 0.5 * halluW : 1;
        dummy.position.set(x + 0.5, (hgt * sy) / 2, y + 0.5);
        if (hal) { dummy.scale.set(1 + 0.25 * halluW, sy, 1 + 0.25 * halluW); dummy.rotation.y = Math.sin(clk * 30) * 0.5 * halluW; }
        dummy.updateMatrix();
        if (hal) { dummy.scale.setScalar(1); dummy.rotation.y = 0; }
        if (t === 1) hardMesh.setMatrixAt(nh++, dummy.matrix);
        else softMesh.setMatrixAt(ns++, dummy.matrix);
        if (ao) ao.setMatrixAt(nh + ns - 1, aoM.makeTranslation(x + 0.5, 0.02, y + 0.5));
      }
    }
    hardMesh.count = nh; softMesh.count = ns;
    hardMesh.instanceMatrix.needsUpdate = softMesh.instanceMatrix.needsUpdate = true;
    if (hv) {
      hv.mh.count = nh; hv.ms.count = ns;
      if (ao) { ao.count = nh + ns; ao.instanceMatrix.needsUpdate = true; }
    }

    const winT = s.end >= 0 ? (END_DELAY - s.end) / 60 : -1;
    s.players.forEach((p, i) => {
      const m = players[i];
      if (!m) return;
      const u = m.userData;
      if (!p.alive) {
        const dying = u.dieT >= 0 && u.dieT < FX.death;
        m.visible = dying;
        if (dying) {
          u.dieT += dt;
          const k = Math.min(1, u.dieT / FX.death);
          m.position.set(p.x / T, k * 0.9, p.y / T);
          m.rotation.y += dt * 24;
          m.scale.setScalar(1.15 * (1 - k * k));
        }
        return;
      }
      if (u.dieT >= 0) { u.dieT = -1; m.scale.setScalar(1.15); }
      m.visible = true;
      u.tag.visible = view.cb && !u.foe;
      if (u.pal !== palette() || u.cb !== view.cb) {
        u.pal = palette(); u.cb = view.cb;
        u.suit.color.set(u.foe ? foeLook().suit : u.pal.suit[i]);
        if (u.foe) u.ring.material.color.set(foeLook().ring);
      }
      u.ring.visible = u.foe || !!tm;
      if (tm && !u.foe) u.ring.material.color.set(teamInfo(tm[i]).col);
      u.bubble.visible = p.shield > 0 && !(p.shield < 60 && p.shield % 10 < 5);
      u.skull.visible = u.aura.visible = !!p.curse;
      u.skull.position.y = 1.9 + Math.sin(now / 200) * 0.06;
      const moving = p.walk !== u.lastWalk;
      u.lastWalk = p.walk;
      const swing = moving ? Math.sin(p.walk * 0.45) * 0.7 : 0;
      const win = !still && winT >= 0 && winT < FX.flourish && (tm && s.winnerTeam >= 0 ? tm[i] === s.winnerTeam : s.winner === i);
      const k = win ? 1 - winT / FX.flourish : 0;
      const idle = still || moving || win ? 0 : Math.sin(clk * 2.4 + i);
      m.position.set(p.x / T, (moving ? Math.abs(Math.sin(p.walk * 0.45)) * 0.06 : 0) + (win ? Math.abs(Math.sin(winT * 9)) * 0.45 * k : 0), p.y / T);
      u.legs[0].rotation.x = swing; u.legs[1].rotation.x = -swing;
      u.arms[0].rotation.x = win ? -2.6 + Math.sin(winT * 25) * 0.25 : -swing;
      u.arms[1].rotation.x = win ? -2.6 - Math.sin(winT * 25) * 0.25 : swing;
      u.torso.scale.y = 1 + idle * 0.04;
      u.head.position.y = 0.98 + idle * 0.012;
      u.lean += ((moving && !still ? 0.2 : 0) - u.lean) * 0.25;
      u.body.rotation.x = u.lean;
      u.ant.rotation.z = still ? 0 : moving ? Math.sin(p.walk * 0.45 + 1) * 0.35 : Math.sin(clk * 2 + i) * 0.05;
      if (dlss && opt.faces) {
        u.head.scale.setScalar(1.1 * (1 + (win ? 0.15 * Math.sin(winT * 20) * k : 0)));
        const tw = still ? 1 : 1 + (win ? 1.2 * Math.abs(Math.sin(winT * 14)) : 0.5 * Math.max(0, Math.sin(clk * 3 + i * 2)));
        for (const gl of u.glints) gl.scale.setScalar(tw);
      }
      if (win) m.rotation.y += dt * 12 * k;
      else {
        let d = FACE_ANGLE[p.face] - m.rotation.y;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        m.rotation.y += d * 0.3;
      }
    });
    updateFx(dt, s.end >= 0);

    grow(bombs, makeBomb, s.bombs.length);
    s.bombs.forEach((b, i) => {
      const o = bombs[i];
      const rate = b.t < 40 ? 3 : 1;
      const [bx, by] = bombPos(b, s.grid), remote = !!s.players[b.owner]?.remote;
      let y = 0, sx = 1, sy = 1;
      const key = b.y * W + b.x, t0 = drops.get(key);
      if (t0 !== undefined) {
        const a = clk - t0;
        if (a >= FX.drop) drops.delete(key);
        else if (a < 0.14) { const q = a / 0.14; y = 0.9 * (1 - q * q); sx = 0.94; sy = 1.12; }
        else if (a < 0.21) { const w = Math.sin(((a - 0.14) / 0.07) * Math.PI); sx = 1 + 0.2 * w; sy = 1 - 0.3 * w; }
        else { const w = Math.sin(((a - 0.21) / 0.14) * Math.PI); y = 0.15 * w; sy = 1 + 0.08 * w; }
      }
      o.position.set(bx + 0.5, y, by + 0.5);
      o.scale.set(sx, sy, sx);
      const { halo, body } = o.userData;
      halo.visible = remote;
      halo.material.opacity = 0.55 + 0.4 * Math.sin(s.tick / 4);
      body.material.color.setHex(remote ? 0x4a0c10 : 0x15151c);
      body.material.emissive.setHex(remote ? 0x6a0a0a : 0);
      o.userData.body.scale.setScalar(1 + Math.sin((b.t * rate) / 5) * 0.07);
      o.userData.spark.visible = b.t % 8 < 5;
      if (!still && Math.random() < dt * (2 + 14 * (1 - Math.min(b.t, FUSE) / FUSE)) * FX.fuseRate) emit(bx + 0.64, y + 0.9 * sy, by + 0.5, 1, GOLD, 1.2, 0.5);
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
    for (const f of fresh) emit(f.x + 0.5, 0.4, f.y + 0.5, 6);
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
    if (colDirty) { sparkGeo.attributes.color.needsUpdate = true; colDirty = false; }

    grow(items, () => new THREE.Sprite(itemMats[0]), s.items.length);
    s.items.forEach((it, i) => {
      const o = items[i];
      const mat = itemMats[it.type];
      o.visible = !!mat;
      if (!mat) return;
      o.material = mat;
      o.position.set(it.x + 0.5, 0.6 + Math.sin(now / 300 + it.x) * 0.1, it.y + 0.5);
      o.scale.set(0.85 * (still ? 1 : 0.75 + 0.25 * Math.abs(Math.cos(now / 500 + it.x))), 0.85, 1);
    });

    syncFloor(s);
    updateFloor(s);
    updateHill(s);
    updateEvent(s);
    updatePotato(s, dt);
    const e = s.event, fcls = e?.type === "frenzy" ? (e.on > 0 ? "on" : still || e.t % 16 < 11 ? "warn" : "") : "";
    if (fcls !== frenzyCls) { frenzyCls = fcls; elFrenzy.className = `h3-frenzy ${fcls}`; }

    const base = camera.userData.base;
    shake *= 0.9;
    camera.position.set(base.x + (Math.random() - 0.5) * shake * 0.25, base.y + (Math.random() - 0.5) * shake * 0.25, base.z);
    let kp = 0;
    if (pun) { pun.t += rdt; if (pun.t >= PUNCH_S) pun = null; else kp = Math.sin((Math.PI * pun.t) / PUNCH_S); }
    if (kp) {
      tmpV.set(pun.x, 0.3, pun.z);
      camera.position.lerp(tmpV, 0.12 * kp);
      camera.lookAt(tmpL.copy(center).lerp(tmpV, 0.3 * kp));
    } else camera.lookAt(center);

    finish.uniforms.time.value = now / 1000;
    const sh = dlssT - shimT0;
    finish.uniforms.boost.value = gags && sh < GAG.shimmer ? Math.sin((Math.PI * sh) / GAG.shimmer) : 0;
    if (hv) updateHeavy(s, dt, fresh);
    if (dlss) composer.render();
    else renderer.render(scene, camera);
    updateHud(g, now);
    updateCall(g);
    updateBubbles(g);
  }

  elBadge.addEventListener("click", () => setDlss(!dlss));
  elGear.addEventListener("click", () => onPanel?.());
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.metaKey || e.ctrlKey || e.altKey || !hud.offsetParent) return;
    if (e.code === "KeyT") setDlss(!dlss);
    else if (e.code === "KeyG" && dlss && !e.repeat) onPanel?.();
  });
  addEventListener("resize", resize);
  resize();
  return { draw, resize, setDlss, hud, punch: (x, z) => { if (!still) pun = { x, z, t: 0 }; }, setStill: (on) => { still = on; shake = 0; if (on) { pun = null; freeFx(); } syncHeavy(); }, get dlss() { return dlss; }, get opt() { return opt; }, setOpt, resetOpt, info: renderer.info, mobile: MOBILE, get level() { return PIN ? 3 : gov.level; }, get heavy() { return !!hv; } };
}
