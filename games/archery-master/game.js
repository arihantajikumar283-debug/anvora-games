/* ============================================================================
   ARCHERY MASTER — Anvora Games
   Developed by Arihant
   Single-file game engine built on three.js. No backend, no external assets:
   all textures are procedural (canvas) and all sounds are synthesized via
   the WebAudio API, so the game works completely offline once loaded.

   IMPORTANT: this is a classic script (loaded without type="module"), on purpose.
   THREE is a global provided by three.min.js, loaded via a plain <script> tag
   right before this file. Do NOT reintroduce `import`/`export` here — ES module
   scripts are blocked by Chrome when the page is opened directly via file://
   (double-clicking index.html), which is exactly the bug this file was fixed for.
============================================================================ */

/* ---------------------------------------------------------------------------
   0. DOM SHORTCUTS
--------------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const canvas = $('gameCanvas');
const els = {
  loading: $('loading'), rotateHint: $('rotateHint'),
  hud: $('hud'), mainMenu: $('mainMenu'), levelSelectMenu: $('levelSelectMenu'),
  howToPlayMenu: $('howToPlayMenu'),
  settingsMenu: $('settingsMenu'), preGameMenu: $('preGameMenu'), pauseMenu: $('pauseMenu'),
  levelCompleteMenu: $('levelCompleteMenu'), gameOverMenu: $('gameOverMenu'),
  hudScore: $('hudScore'), hudLevel: $('hudLevel'), hudArrows: $('hudArrows'),
  hudTimer: $('hudTimer'), hudAccuracy: $('hudAccuracy'),
  comboTag: $('comboTag'), objective: $('objective'), controlHint: $('controlHint'),
  crosshair: $('crosshair'), drawPowerWrap: $('drawPowerWrap'), drawPowerFill: $('drawPowerFill'),
  windSpeed: $('windSpeed'), windArrow: $('windArrow'), pauseBtn: $('pauseBtn'),
  levelGrid: $('levelGrid'), diffRowLevel: $('diffRowLevel'), diffRowPlay: $('diffRowPlay'),
  menuHighScore: $('menuHighScore'),
  lcTitle: $('lcTitle'), lcScore: $('lcScore'), lcAccuracy: $('lcAccuracy'), lcCombo: $('lcCombo'), lcStars: $('lcStars'),
  goScore: $('goScore'), goAccuracy: $('goAccuracy'),
  sensSlider: $('sensSlider'),
  mobileShootBtn: $('mobileShootBtn'), hudBest: $('hudBest'), hudDiff: $('hudDiff'), hudRound: $('hudRound'),
};

const IS_TOUCH = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;

// Global safety net: if ANY unexpected error slips through anywhere in the game
// (including async errors a try/catch around boot() wouldn't catch), never leave
// the player stuck looking at the loading screen — surface the main menu instead.
window.addEventListener('error', () => { try { dismissLoadingScreen(); } catch (e) {} });
window.addEventListener('unhandledrejection', () => { try { dismissLoadingScreen(); } catch (e) {} });

/* ---------------------------------------------------------------------------
   1. PERSISTENT STORAGE (settings, progress, high scores)
--------------------------------------------------------------------------- */
const STORE_KEY = 'archeryMaster.v2'; // bumped: v1 saves referenced a 10-level layout, now restructured to 5
function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = Object.assign(defaultStore(), JSON.parse(raw));
      // clamp any stale unlocked-level values to the current level count (defensive migration)
      DIFFICULTIES_SAFE.forEach((d) => {
        if (!parsed.unlockedLevel[d] || parsed.unlockedLevel[d] > 5) parsed.unlockedLevel[d] = Math.min(parsed.unlockedLevel[d] || 1, 5);
      });
      return parsed;
    }
  } catch (e) { /* ignore corrupt storage */ }
  return defaultStore();
}
const DIFFICULTIES_SAFE = ['easy', 'normal', 'hard', 'nightmare'];
function defaultStore() {
  return {
    sound: true, music: true, quality: IS_TOUCH ? 'medium' : 'high', sensitivity: 100,
    unlockedLevel: { easy: 1, normal: 1, hard: 1, nightmare: 1 },
    levelStars: {}, highScore: 0,
  };
}
let store = loadStore();
function saveStore() { try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) {} }

/* ---------------------------------------------------------------------------
   2. AUDIO ENGINE (synthesized — no external files)
--------------------------------------------------------------------------- */
class AudioEngine {
  constructor() { this.ctx = null; this.master = null; }
  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
  }
  get enabled() { return store.sound && this.ctx; }
  tone(freq, dur, type = 'sine', vol = 0.3, glideTo = null) {
    if (!store.sound) return;
    this.ensure();
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type; osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, glideTo), t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain); gain.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  }
  noise(dur, vol = 0.25, filterFreq = 1200) {
    if (!store.sound) return;
    this.ensure();
    const t0 = this.ctx.currentTime;
    const bufferSize = Math.floor(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter(); filter.type = 'bandpass'; filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain(); gain.gain.setValueAtTime(vol, t0); gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.master);
    src.start(t0); src.stop(t0 + dur);
  }
  draw() { this.tone(180, 0.35, 'sawtooth', 0.06, 260); }
  release() { this.noise(0.12, 0.35, 2200); this.tone(420, 0.08, 'triangle', 0.15, 180); }
  impact() { this.noise(0.09, 0.3, 500); }
  bullseye() { this.tone(880, 0.18, 'sine', 0.25, 1320); setTimeout(() => this.tone(1320, 0.22, 'sine', 0.2), 60); }
  miss() { this.tone(140, 0.2, 'sine', 0.12, 90); }
  click() { this.tone(650, 0.06, 'square', 0.08); }
  levelWin() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'triangle', 0.18), i * 90)); }
  levelLose() { [400, 320, 240].forEach((f, i) => setTimeout(() => this.tone(f, 0.3, 'sawtooth', 0.12), i * 110)); }
}
const audio = new AudioEngine();

/* ---------------------------------------------------------------------------
   3. UI STATE MACHINE
--------------------------------------------------------------------------- */
const SCREENS = ['loading', 'mainMenu', 'levelSelectMenu', 'settingsMenu', 'preGameMenu', 'howToPlayMenu', 'hud', 'pauseMenu', 'levelCompleteMenu', 'gameOverMenu'];
function showScreen(name, { keepHud } = {}) {
  SCREENS.forEach((s) => { if (s !== 'hud' || !keepHud) els[s].classList.add('hidden'); });
  els[name].classList.remove('hidden');
}

let currentDifficulty = 'normal';
const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
const DIFF_SCALE = {
  easy:      { size: 1.35, speed: 0.55, wind: 0.4, time: 1.4, arrowsDelta: 3, ring: 1.3 },
  normal:    { size: 1.0,  speed: 1.0,  wind: 1.0, time: 1.0, arrowsDelta: 1, ring: 1.0 },
  hard:      { size: 0.78, speed: 1.35, wind: 1.5, time: 0.8, arrowsDelta: 0, ring: 0.82 },
  nightmare: { size: 0.58, speed: 1.75, wind: 2.1, time: 0.6, arrowsDelta: -1, ring: 0.65 },
};

function buildDiffChips(container, onPick) {
  container.innerHTML = '';
  DIFFICULTIES.forEach((d) => {
    const chip = document.createElement('div');
    chip.className = 'diff-chip' + (d === currentDifficulty ? ' active' : '');
    chip.textContent = d;
    chip.onclick = () => { audio.click(); currentDifficulty = d; onPick(); };
    container.appendChild(chip);
  });
}

/* ---------------------------------------------------------------------------
   4. LEVEL DEFINITIONS
   Restructured to a clear 5-level progression per design brief:
   1 tutorial (close/large) -> 2 farther/smaller -> 3 moving/timing ->
   4 long-distance + wind begins -> 5 final challenge (long + moving + strong wind)
--------------------------------------------------------------------------- */
// Each target descriptor: {type, z(depth, negative=far), x(base horizontal offset), y(height), radius, moveRange, moveSpeed}
function T(type, z, x, y, radius, extra = {}) { return Object.assign({ type, z, x, y, radius }, extra); }

const LEVELS = [
  { id: 1, name: 'First Draw',       arrows: 6,  time: 60, wind: 0,   required: 120,
    targets: [T('standard', -10, 0, 1.6, 1.8)] },
  { id: 2, name: 'Longer Range',     arrows: 6,  time: 55, wind: 0,   required: 150,
    targets: [T('standard', -18, 0, 1.6, 1.35)] },
  { id: 3, name: 'On the Move',      arrows: 7,  time: 55, wind: 0,   required: 175,
    targets: [T('moving', -17, 0, 1.6, 1.15, { moveRange: 3.2, moveSpeed: 0.8 }), T('small', -14, -4.5, 1.5, 0.85)] },
  { id: 4, name: 'Windy Distance',   arrows: 8,  time: 60, wind: 3,   required: 210,
    targets: [T('long', -30, -2, 1.7, 1.25), T('standard', -22, 4, 1.6, 1.2)] },
  { id: 5, name: 'Final Challenge',  arrows: 10, time: 70, wind: 4.2, required: 280,
    targets: [
      T('long', -34, 3, 1.8, 1.05), T('moving', -24, -3, 1.6, 1.0, { moveRange: 3.8, moveSpeed: 1.3 }),
      T('small', -19, 1, 1.5, 0.8),
    ] },
];

/* ---------------------------------------------------------------------------
   5. THREE.JS SCENE SETUP
--------------------------------------------------------------------------- */
let renderer, scene, camera;
let bowRig, bowGroup, stringLine, arrowRestMesh;
let clock = new THREE.Clock();
let qualitySettings = {};

function computeQuality() {
  const q = store.quality;
  qualitySettings = {
    low:    { shadows: false, pixelRatio: Math.min(1.25, window.devicePixelRatio), trees: 6,  clouds: 4, shadowMap: 512 },
    medium: { shadows: true,  pixelRatio: Math.min(1.6, window.devicePixelRatio),  trees: 10, clouds: 6, shadowMap: 1024 },
    high:   { shadows: true,  pixelRatio: Math.min(2.0, window.devicePixelRatio),  trees: 16, clouds: 8, shadowMap: 2048 },
  }[q];
  return qualitySettings;
}

function initRenderer() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const q = computeQuality();
  renderer.setPixelRatio(q.pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
}

function makeSkyTexture() {
  const c = document.createElement('canvas'); c.width = 2; c.height = 256;
  const ctx = c.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, '#3f9bd6');
  grad.addColorStop(0.45, '#7cc0e6');
  grad.addColorStop(0.75, '#ffe6b0');
  grad.addColorStop(1, '#ffd28a');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 2, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeCloudSprite() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.filter = 'blur(6px)';
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 5; i++) {
    const x = 20 + Math.random() * 88, y = 22 + Math.random() * 20, r = 14 + Math.random() * 16;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGlowTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,248,224,1)');
  grad.addColorStop(0.35, 'rgba(255,240,190,0.7)');
  grad.addColorStop(1, 'rgba(255,240,190,0)');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#5c9a4a'; ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 3000; i++) {
    const x = Math.random() * 512, y = Math.random() * 512;
    const shade = Math.random() > 0.5 ? '#6bab57' : '#4f8a3f';
    ctx.fillStyle = shade;
    ctx.fillRect(x, y, 2, 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(14, 14);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeStoneTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b7a488'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = 'rgba(80,66,48,0.5)'; ctx.lineWidth = 3;
  for (let y = 0; y < 256; y += 32) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
    const offset = (y / 32) % 2 === 0 ? 0 : 32;
    for (let x = offset; x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeTargetTexture(kind) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d');
  const cx = 128, cy = 128;
  const rings = kind === 'bonus'
    ? [[128, '#f4c665'], [96, '#e8ac2e'], [64, '#c1592f'], [32, '#f4c665']]
    : [[128, '#f6ecd6'], [102, '#2f4f8a'], [76, '#c1382f'], [50, '#2f6e4f'], [24, '#f4c665'], [10, '#c1382f']];
  rings.forEach(([r, color]) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
  rings.forEach(([r]) => { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

let TARGET_TEX, TARGET_TEX_BONUS;

function buildEnvironment() {
  scene = new THREE.Scene();
  scene.background = makeSkyTexture();
  scene.fog = new THREE.Fog(0xffdca0, 40, 95);

  // Lights
  const hemi = new THREE.HemisphereLight(0xffe9c2, 0x4f8a3f, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1cf, 1.35);
  sun.position.set(-18, 26, 14);
  const q = qualitySettings;
  sun.castShadow = q.shadows;
  if (q.shadows) {
    sun.shadow.mapSize.set(q.shadowMap, q.shadowMap);
    sun.shadow.camera.left = -35; sun.shadow.camera.right = 35;
    sun.shadow.camera.top = 35; sun.shadow.camera.bottom = -35;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
    sun.shadow.bias = -0.0015;
  }
  scene.add(sun);
  scene.add(sun.target);

  // sun glow sprite
  const sunMat = new THREE.SpriteMaterial({ map: makeGlowTexture(), color: 0xfff4d6, transparent: true, opacity: 0.95, depthWrite: false });
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.set(14, 14, 1);
  sunSprite.position.set(-30, 30, -60);
  scene.add(sunSprite);

  // Ground (grass)
  const groundGeo = new THREE.PlaneGeometry(160, 160, 1, 1);
  const groundMat = new THREE.MeshStandardMaterial({ map: makeGroundTexture(), roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = q.shadows;
  scene.add(ground);

  // Stone arena platform under the archer
  const stoneTex = makeStoneTexture();
  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(7, 7.4, 0.4, 24),
    new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.9 })
  );
  platform.position.set(0, 0.2, 3);
  platform.receiveShadow = q.shadows;
  platform.castShadow = false;
  scene.add(platform);

  // Range lane (packed dirt strip toward targets)
  const lane = new THREE.Mesh(
    new THREE.PlaneGeometry(6, 46),
    new THREE.MeshStandardMaterial({ color: 0xcdb489, roughness: 1 })
  );
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.02, -18);
  lane.receiveShadow = q.shadows;
  scene.add(lane);

  // Stone pillars flanking the arena, each with a small waving banner
  const pillarMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.85 });
  const bannerColors = [0xc1592f, 0xd9a441, 0xc1592f, 0xd9a441];
  window.__flags = [];
  [[-6.5, 4], [6.5, 4], [-6.5, -14], [6.5, -14]].forEach(([x, z], idx) => {
    const pillar = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 4.2, 10), pillarMat);
    shaft.position.y = 2.1; shaft.castShadow = q.shadows; shaft.receiveShadow = q.shadows;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.3), pillarMat);
    cap.position.y = 4.35; cap.castShadow = q.shadows;
    pillar.add(shaft, cap);

    // banner: thin pole + cloth plane, gently swayed each frame via a stored ref
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), new THREE.MeshStandardMaterial({ color: 0x3a2f22 }));
    pole.position.y = 5.3;
    const bannerMat = new THREE.MeshStandardMaterial({ color: bannerColors[idx % bannerColors.length], roughness: 0.8, side: THREE.DoubleSide });
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.9), bannerMat);
    banner.position.set(0.32, 4.85, 0);
    banner.castShadow = false;
    pillar.add(pole, banner);
    window.__flags.push({ mesh: banner, phase: Math.random() * Math.PI * 2 });

    pillar.position.set(x, 0, z);
    scene.add(pillar);
  });

  // Ancient ruins — a couple of broken/fallen pillar fragments for atmosphere, kept
  // off to one side so they never sit in the flight path or block the view of targets
  const ruinsGroup = new THREE.Group();
  const stump1 = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 1.4, 10), pillarMat);
  stump1.position.set(-13, 0.7, -26); stump1.rotation.z = 0.06; stump1.castShadow = q.shadows; stump1.receiveShadow = q.shadows;
  const stump2 = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.46, 0.85, 10), pillarMat);
  stump2.position.set(-15.6, 0.42, -23.5); stump2.rotation.z = -0.1; stump2.castShadow = q.shadows; stump2.receiveShadow = q.shadows;
  const fallen = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 2.6, 10), pillarMat);
  fallen.rotation.z = Math.PI / 2; fallen.position.set(-11.5, 0.4, -24); fallen.castShadow = q.shadows; fallen.receiveShadow = q.shadows;
  ruinsGroup.add(stump1, stump2, fallen);
  for (let i = 0; i < 4; i++) {
    const rubble = new THREE.Mesh(new THREE.BoxGeometry(0.5 + Math.random() * 0.4, 0.3 + Math.random() * 0.3, 0.5 + Math.random() * 0.4), pillarMat);
    rubble.position.set(-13.5 + Math.random() * 4, 0.15, -25 + Math.random() * 3);
    rubble.rotation.y = Math.random() * Math.PI;
    rubble.castShadow = q.shadows; rubble.receiveShadow = q.shadows;
    ruinsGroup.add(rubble);
  }
  scene.add(ruinsGroup);

  // Small temple structure (decorative, off to the side)
  const temple = new THREE.Group();
  const templeMat = new THREE.MeshStandardMaterial({ color: 0xdcc79a, roughness: 0.9 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.6, 6), templeMat);
  base.position.y = 0.3; base.receiveShadow = q.shadows;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 3.2, 8), templeMat);
  body.position.y = 2.2; body.castShadow = q.shadows;
  const roofMat = new THREE.MeshStandardMaterial({ color: 0xc1592f, roughness: 0.7 });
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.9, 2.6, 8), roofMat);
  roof.position.y = 5.1; roof.castShadow = q.shadows;
  const spire = new THREE.Mesh(new THREE.ConeGeometry(0.25, 1.2, 6), new THREE.MeshStandardMaterial({ color: 0xf4c665, metalness: 0.4, roughness: 0.4 }));
  spire.position.y = 6.9;
  temple.add(base, body, roof, spire);
  temple.position.set(15, 0, -22);
  temple.rotation.y = -0.4;
  scene.add(temple);

  // Distant mountains (simple low-poly silhouette ring)
  const mtnMat = new THREE.MeshStandardMaterial({ color: 0x7f8fae, roughness: 1, fog: true });
  for (let i = -6; i <= 6; i++) {
    const h = 10 + Math.random() * 14;
    const mtn = new THREE.Mesh(new THREE.ConeGeometry(9 + Math.random() * 5, h, 5), mtnMat);
    mtn.position.set(i * 13 + (Math.random() * 4 - 2), h / 2 - 1, -78 - Math.random() * 10);
    mtn.rotation.y = Math.random() * Math.PI;
    scene.add(mtn);
  }

  // Trees scattered on either side (instanced-ish via simple loop, low count)
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a30, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x3f7a3a, roughness: 0.95 });
  const treeCount = q.trees;
  for (let i = 0; i < treeCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const x = side * (9 + Math.random() * 8);
    const z = -2 - Math.random() * 34;
    const tree = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 2.2, 6), trunkMat);
    trunk.position.y = 1.1; trunk.castShadow = q.shadows;
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(1.3, 2.6, 7), leafMat);
    leaf.position.y = 3.0; leaf.castShadow = q.shadows;
    tree.add(trunk, leaf);
    tree.position.set(x, 0, z);
    tree.scale.setScalar(0.8 + Math.random() * 0.5);
    scene.add(tree);
  }

  // Clouds
  const cloudTex = makeCloudSprite();
  window.__clouds = [];
  for (let i = 0; i < q.clouds; i++) {
    const mat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, opacity: 0.85, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    const scale = 8 + Math.random() * 8;
    spr.scale.set(scale, scale * 0.5, 1);
    spr.position.set(-40 + Math.random() * 80, 16 + Math.random() * 8, -50 - Math.random() * 30);
    scene.add(spr);
    window.__clouds.push(spr);
  }

  // Decorative low wall with simple pattern strip around platform edge
  const patternMat = new THREE.MeshStandardMaterial({ color: 0xc1592f, roughness: 0.8 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(7, 0.12, 6, 32), patternMat);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.42, 3);
  scene.add(ring);
}

function buildCameraAndBow() {
  camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 1.65, 6);

  bowRig = new THREE.Group(); // rotates for aiming
  camera.add(bowRig);
  scene.add(camera);

  bowGroup = new THREE.Group();
  bowGroup.position.set(0.32, -0.28, -0.7);
  bowRig.add(bowGroup);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.6 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2c1c10, roughness: 0.5 });

  // Bow limbs — curved via a tube along a quadratic curve
  const curveUp = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.16, 0.28, 0.04), new THREE.Vector3(0.02, 0.55, 0)
  );
  const curveDown = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.16, -0.28, 0.04), new THREE.Vector3(0.02, -0.55, 0)
  );
  const limbUp = new THREE.Mesh(new THREE.TubeGeometry(curveUp, 12, 0.018, 6, false), woodMat);
  const limbDown = new THREE.Mesh(new THREE.TubeGeometry(curveDown, 12, 0.018, 6, false), woodMat);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.22, 8), darkMat);
  bowGroup.add(limbUp, limbDown, grip);
  [limbUp, limbDown, grip].forEach((m) => { m.castShadow = false; });

  // Bowstring (dynamic — updated each frame based on draw amount)
  const stringGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0.02, 0.55, 0), new THREE.Vector3(0, 0, 0.18), new THREE.Vector3(0.02, -0.55, 0),
  ]);
  const stringMat = new THREE.LineBasicMaterial({ color: 0xe8e0cf });
  stringLine = new THREE.Line(stringGeo, stringMat);
  bowGroup.add(stringLine);

  // Nocked arrow (visual only, real arrows spawned into scene on shoot)
  arrowRestMesh = makeArrowMesh();
  arrowRestMesh.position.set(0, 0, 0.18);
  arrowRestMesh.rotation.y = Math.PI / 2;
  bowGroup.add(arrowRestMesh);

  // Simple forearm hint (low performance cost cylinder)
  const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.4, 6), new THREE.MeshStandardMaterial({ color: 0xcb9c72 }));
  arm.position.set(0.32, -0.55, -0.5);
  arm.rotation.z = 0.25;
  bowRig.add(arm);
}

function makeArrowMesh() {
  const g = new THREE.Group();
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x5a3c22, roughness: 0.6 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x9098a0, metalness: 0.6, roughness: 0.35 });
  const finMat = new THREE.MeshStandardMaterial({ color: 0xc1382f, roughness: 0.7, side: THREE.DoubleSide });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.62, 6), shaftMat);
  shaft.rotation.z = Math.PI / 2;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), tipMat);
  tip.rotation.z = -Math.PI / 2; tip.position.x = 0.35;
  g.add(shaft, tip);
  for (let i = 0; i < 3; i++) {
    const fin = new THREE.Mesh(new THREE.PlaneGeometry(0.08, 0.05), finMat);
    fin.position.x = -0.28;
    fin.rotation.x = (i * Math.PI * 2) / 3;
    fin.rotation.y = Math.PI / 2;
    g.add(fin);
  }
  g.castShadow = false;
  return g;
}

/* ---------------------------------------------------------------------------
   6. TARGET MANAGEMENT
--------------------------------------------------------------------------- */
let activeTargets = []; // {mesh, group, kind, radius, baseX, z, moveRange, moveSpeed, alive, spawnT, life}
let bonusTimer = 0;

function makeStandMesh() {
  const mat = new THREE.MeshStandardMaterial({ color: 0x8a6b45, roughness: 0.9 });
  const stand = new THREE.Group();
  const leg1 = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.8, 6), mat);
  leg1.rotation.z = 0.35; leg1.position.set(-0.35, -0.9, 0);
  const leg2 = leg1.clone(); leg2.rotation.z = -0.35; leg2.position.x = 0.35;
  stand.add(leg1, leg2);
  return stand;
}

function spawnTarget(desc, index) {
  const kind = desc.type;
  const tex = kind === 'bonus' ? TARGET_TEX_BONUS : TARGET_TEX;
  const group = new THREE.Group();
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(desc.radius, 24),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 })
  );
  disc.castShadow = qualitySettings.shadows; disc.receiveShadow = qualitySettings.shadows;
  const backing = new THREE.Mesh(new THREE.CircleGeometry(desc.radius, 24), new THREE.MeshStandardMaterial({ color: 0x3a2f22 }));
  backing.rotation.y = Math.PI; backing.position.z = -0.03;
  group.add(disc, backing);
  const stand = makeStandMesh();
  stand.position.y = -desc.y;
  group.add(stand);
  group.position.set(desc.x, desc.y, desc.z);
  scene.add(group);
  const t = {
    id: 'tg' + Math.random().toString(36).slice(2, 9),
    group, disc, kind, radius: desc.radius, baseX: desc.x, y: desc.y, z: desc.z,
    moveRange: desc.moveRange || 0, moveSpeed: desc.moveSpeed || 0, phase: Math.random() * Math.PI * 2,
    alive: true, life: kind === 'bonus' ? 4.5 : Infinity, age: 0,
  };
  activeTargets.push(t);
  return t;
}

function clearTargets() {
  activeTargets.forEach((t) => scene.remove(t.group));
  activeTargets = [];
}

function updateTargets(dt) {
  for (let i = activeTargets.length - 1; i >= 0; i--) {
    const t = activeTargets[i];
    if (!t.alive) continue;
    t.age += dt;
    if (t.moveRange > 0) {
      t.group.position.x = t.baseX + Math.sin(gameClockT * t.moveSpeed + t.phase) * t.moveRange * game.diffScale.speed;
    }
    if (t.kind === 'bonus') {
      t.life -= dt;
      const s = Math.max(0.05, Math.min(1, t.life / 0.6));
      t.group.scale.setScalar(s > 0.9 ? 1 : s);
      if (t.life <= 0) removeTarget(t);
    }
  }
  // spawn bonus targets periodically during PLAY mode (not practice) after level 3+
  if (game.mode === 'level' && game.levelDef.id >= 3 && game.state === 'playing') {
    bonusTimer -= dt;
    if (bonusTimer <= 0) {
      bonusTimer = 6 + Math.random() * 5;
      const x = (Math.random() * 8 - 4);
      const z = -14 - Math.random() * 16;
      spawnTarget({ type: 'bonus', x, y: 1.5 + Math.random() * 0.8, z, radius: 0.55 }, -1);
    }
  }
}

function removeTarget(t) {
  t.alive = false;
  scene.remove(t.group);
  const idx = activeTargets.indexOf(t);
  if (idx >= 0) activeTargets.splice(idx, 1);
}

/* ---------------------------------------------------------------------------
   6b. HIT PARTICLES (fixed pool — never allocates new objects during play)
--------------------------------------------------------------------------- */
const PARTICLE_POOL_SIZE = 36;
let particlePool = [];
function buildParticlePool() {
  const tex = makeGlowTexture();
  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const mat = new THREE.SpriteMaterial({ map: tex, color: 0xf4c665, transparent: true, opacity: 0, depthWrite: false });
    const spr = new THREE.Sprite(mat);
    spr.visible = false;
    scene.add(spr);
    particlePool.push({ sprite: spr, active: false, vel: new THREE.Vector3(), life: 0, maxLife: 0.001 });
  }
}
function spawnHitParticles(pos, big) {
  const count = big ? 14 : 7;
  let spawned = 0;
  for (let i = 0; i < particlePool.length && spawned < count; i++) {
    const p = particlePool[i];
    if (p.active) continue;
    p.active = true;
    p.sprite.visible = true;
    p.sprite.position.copy(pos);
    p.sprite.material.color.setHex(big ? 0xffe19a : 0xd9a441);
    const ang = Math.random() * Math.PI * 2;
    const spd = (big ? 2.6 : 1.6) * (0.6 + Math.random() * 0.8);
    p.vel.set(Math.cos(ang) * spd, Math.random() * 2 + 0.6, Math.sin(ang) * spd * 0.4);
    p.life = p.maxLife = big ? 0.55 : 0.4;
    p.sprite.scale.setScalar(big ? 0.55 : 0.32);
    spawned++;
  }
}
function updateParticles(dt) {
  for (const p of particlePool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) { p.active = false; p.sprite.visible = false; continue; }
    p.vel.y -= 3.2 * dt;
    p.vel.multiplyScalar(0.94);
    p.sprite.position.addScaledVector(p.vel, dt);
    const t = p.life / p.maxLife;
    p.sprite.material.opacity = t;
    p.sprite.scale.setScalar(p.sprite.scale.x * (1 + dt * 0.6));
  }
}

/* ---------------------------------------------------------------------------
   7. ARROW POOL & PHYSICS
--------------------------------------------------------------------------- */
const GRAVITY = 9.2;
let arrowPool = [];
let activeArrows = []; // {mesh, vel, pos, alive, stuck}

function getPooledArrow() {
  let a = arrowPool.pop();
  if (!a) {
    const mesh = makeArrowMesh();
    a = { mesh };
    scene.add(mesh);
  }
  a.mesh.visible = true;
  return a;
}
function releaseArrow(a) {
  a.mesh.visible = false;
  activeArrows = activeArrows.filter((x) => x !== a);
  arrowPool.push(a);
}

function fireArrow(originWorld, dirWorld, power) {
  const a = getPooledArrow();
  a.pos = originWorld.clone();
  const speed = 18 + power * 26; // m/s
  a.vel = dirWorld.clone().normalize().multiplyScalar(speed);
  a.alive = true; a.stuck = false; a.traveled = 0; a.ageMs = performance.now();
  a.mesh.position.copy(a.pos);
  activeArrows.push(a);
  return a;
}

const _tmpV = new THREE.Vector3();
function updateArrows(dt) {
  const windVec = new THREE.Vector3(game.wind, 0, 0);
  for (let i = activeArrows.length - 1; i >= 0; i--) {
    const a = activeArrows[i];
    if (!a.alive) continue;
    if (a.stuck) continue;
    // physics integrate
    a.vel.y -= GRAVITY * dt;
    a.vel.x += windVec.x * 0.35 * dt;
    a.pos.addScaledVector(a.vel, dt);
    a.traveled += a.vel.length() * dt;
    a.mesh.position.copy(a.pos);
    // orient along velocity
    _tmpV.copy(a.vel).normalize();
    a.mesh.lookAt(a.pos.x + _tmpV.x, a.pos.y + _tmpV.y, a.pos.z + _tmpV.z);
    a.mesh.rotateY(Math.PI / 2);

    // collision vs targets — interpolate the exact (x,y) at the moment the arrow's path
    // crosses the target's z-plane this frame (a straight-line sweep between last and
    // current position), instead of testing only the current frame's position. This is
    // what makes fast arrows / low frame-rate steps still register accurate hits instead
    // of tunnelling through a target.
    let hit = null;
    const prevX = a.pos.x - a.vel.x * dt;
    const prevY = a.pos.y - a.vel.y * dt;
    const prevZ = a.pos.z - a.vel.z * dt;
    for (const t of activeTargets) {
      if (!t.alive) continue;
      const tz = t.group.position.z;
      const crossing = (prevZ > tz && a.pos.z <= tz) || (Math.abs(a.pos.z - tz) < 0.4 && a.vel.z < 0);
      if (!crossing) continue;
      let ix = a.pos.x, iy = a.pos.y;
      const zSpan = prevZ - a.pos.z;
      if (Math.abs(zSpan) > 1e-5) {
        const frac = THREE.MathUtils.clamp((prevZ - tz) / zSpan, 0, 1);
        ix = prevX + (a.pos.x - prevX) * frac;
        iy = prevY + (a.pos.y - prevY) * frac;
      }
      const dx = ix - t.group.position.x;
      const dy = iy - t.group.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= t.radius * 1.05) { hit = { target: t, dx, dy, dist }; break; }
    }
    if (hit) {
      handleArrowHit(a, hit);
      continue;
    }
    // ground / out of range / safety timeout (guards against frame-rate hitches so an
    // arrow can never get stuck mid-air and stall level progression)
    if (a.pos.y <= 0.02 || a.pos.z < -90 || a.traveled > 140 || (performance.now() - a.ageMs) > 6000) {
      handleArrowMiss(a);
    }
  }
}

/* ---------------------------------------------------------------------------
   8. SCORING
--------------------------------------------------------------------------- */
function ringScore(distRatio, tightness = 1) {
  // tightness < 1 shrinks the effective bullseye/inner rings — used for harder
  // difficulties so scoring is genuinely less forgiving, on top of the smaller
  // physical target radius already applied via diffScale.size.
  const r = distRatio / tightness;
  if (r <= 0.13) return { pts: 100, label: 'BULLSEYE!' };
  if (r <= 0.35) return { pts: 75, label: 'INNER' };
  if (r <= 0.65) return { pts: 50, label: 'GOOD' };
  return { pts: 25, label: 'HIT' };
}

function handleArrowHit(a, hit) {
  a.stuck = true;
  a.alive = false;
  const t = hit.target;
  const distRatio = hit.dist / t.radius;
  let result = ringScore(distRatio, game.diffScale.ring);
  let pts = result.pts;
  if (t.kind === 'small') pts = Math.round(pts * 1.5);
  if (t.kind === 'bonus') pts = Math.round(pts * 1.3) + 50;
  if (t.kind === 'moving') pts += 10;
  if (t.kind === 'long') pts += 40;
  // distance bonus (covers any target placed far downrange, regardless of kind)
  const distanceBonus = Math.abs(t.z) > 24 ? 20 : 0;
  pts += distanceBonus;

  game.combo += 1;
  const comboMult = 1 + Math.min(game.combo - 1, 8) * 0.12;
  const finalPts = Math.round(pts * comboMult);
  game.score += finalPts;
  game.hits += 1;
  game.bestCombo = Math.max(game.bestCombo, game.combo);

  showFloatingScore(a.pos, `+${finalPts}`, result.pts === 100 ? '#f4c665' : '#f6ecd6');
  spawnHitParticles(a.pos, result.pts === 100);
  if (result.pts === 100) { audio.bullseye(); flashCombo(`${result.label}`); }
  else { audio.impact(); if (game.combo >= 2) flashCombo(`COMBO x${game.combo}`); }

  // stick arrow into target visually briefly then release
  a.mesh.position.set(t.group.position.x + hit.dx, t.group.position.y + hit.dy, t.group.position.z + 0.05);
  setTimeout(() => releaseArrow(a), 900);

  if (t.kind === 'bonus') removeTarget(t);
  updateHUD();
  checkLevelProgress();
}

function handleArrowMiss(a) {
  a.alive = false;
  audio.miss();
  game.combo = 0;
  game.misses += 1;
  releaseArrow(a);
  updateHUD();
  checkLevelProgress();
}

function showFloatingScore(worldPos, text, color) {
  const vec = worldPos.clone().project(camera);
  const x = (vec.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-vec.y * 0.5 + 0.5) * window.innerHeight;
  const el = document.createElement('div');
  el.className = 'float-score';
  el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.color = color; el.style.fontSize = '26px';
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function flashCombo(text) {
  els.comboTag.textContent = text;
  els.comboTag.classList.add('show');
  clearTimeout(flashCombo._t);
  flashCombo._t = setTimeout(() => els.comboTag.classList.remove('show'), 700);
}

/* ---------------------------------------------------------------------------
   9. GAME STATE / LEVEL FLOW
--------------------------------------------------------------------------- */
let gameClockT = 0;
const game = {
  mode: 'level', // 'level' | 'practice'
  state: 'idle',  // 'playing' | 'paused'
  levelDef: null, levelIndex: 0, diffScale: DIFF_SCALE.normal,
  score: 0, combo: 0, bestCombo: 0, hits: 0, misses: 0, arrowsLeft: 0, arrowsTotal: 0,
  timeLeft: 0, wind: 0, windBase: 0, windTarget: 0, windTargetChangeT: 0,
};

function startLevel(levelIndex, difficulty, mode = 'level') {
  currentDifficulty = difficulty;
  game.diffScale = DIFF_SCALE[difficulty];
  game.mode = mode;
  game.levelIndex = levelIndex;
  const def = LEVELS[levelIndex];
  game.levelDef = def;
  game.score = 0; game.combo = 0; game.bestCombo = 0; game.hits = 0; game.misses = 0;
  game.arrowsTotal = mode === 'practice' ? 9999 : Math.max(3, def.arrows + game.diffScale.arrowsDelta);
  game.arrowsLeft = game.arrowsTotal;
  game.timeLeft = mode === 'practice' ? Infinity : Math.round(def.time * game.diffScale.time);
  game.wind = mode === 'practice' ? 0 : def.wind * game.diffScale.wind;
  game.windBase = game.wind;
  game.windTarget = game.wind;
  game.windTargetChangeT = 2 + Math.random() * 2;
  game.state = 'playing';
  gameClockT = 0;
  bonusTimer = 5;

  clearTargets();
  def.targets.forEach((desc, i) => {
    const scaled = Object.assign({}, desc, {
      radius: desc.radius * game.diffScale.size,
      moveRange: (desc.moveRange || 0),
      moveSpeed: (desc.moveSpeed || 0) * game.diffScale.speed,
    });
    spawnTarget(scaled, i);
  });

  els.objective.textContent = mode === 'practice' ? 'Practice — unlimited arrows, no timer' : `Score ${def.required} pts to clear the range`;
  els.controlHint.textContent = IS_TOUCH ? 'Touch & drag back to draw — release to shoot' : 'Click & drag to draw the bow — release to shoot';
  els.hudLevel.textContent = mode === 'practice' ? '–' : def.id;
  showScreen('hud');
  updateHUD();
}

function checkLevelProgress() {
  if (game.mode === 'practice') return;
  if (game.state !== 'playing') return;
  if (game.score >= game.levelDef.required) {
    endLevel(true);
  } else if (game.arrowsLeft <= 0 && activeArrows.length === 0) {
    endLevel(false);
  }
}

function tickTimer(dt) {
  if (game.mode === 'practice' || game.state !== 'playing') return;
  game.timeLeft -= dt;
  if (game.timeLeft <= 0) {
    game.timeLeft = 0;
    if (game.score >= game.levelDef.required) endLevel(true);
    else if (activeArrows.length === 0) endLevel(false);
  }
  // Wind gusts: smoothly drift toward a new nearby target value every few seconds,
  // bounded around the level's base wind so it stays fair (never spikes instantly,
  // never goes wildly off the level's intended strength) while still feeling alive —
  // more so at higher difficulty ("strong changing wind" for Nightmare).
  if (game.windBase > 0) {
    game.windTargetChangeT -= dt;
    if (game.windTargetChangeT <= 0) {
      game.windTargetChangeT = 2.5 + Math.random() * 2.5;
      const gustAmplitude = game.windBase * (0.15 + 0.35 * (game.diffScale.wind - 0.4) / (2.1 - 0.4));
      game.windTarget = Math.max(0, game.windBase + (Math.random() * 2 - 1) * gustAmplitude);
    }
    game.wind += (game.windTarget - game.wind) * Math.min(1, dt * 0.5);
  }
}

function endLevel(success) {
  if (game.state !== 'playing') return;
  game.state = success ? 'won' : 'lost';
  const acc = game.hits + game.misses > 0 ? Math.round((game.hits / (game.hits + game.misses)) * 100) : 0;

  if (success) {
    audio.levelWin();
    store.unlockedLevel[currentDifficulty] = Math.max(store.unlockedLevel[currentDifficulty] || 1, game.levelDef.id + 1);
    const starKey = currentDifficulty + '_' + game.levelDef.id;
    const stars = acc >= 85 ? 3 : acc >= 60 ? 2 : 1;
    store.levelStars[starKey] = Math.max(store.levelStars[starKey] || 0, stars);
    store.highScore = Math.max(store.highScore, game.score);
    saveStore();

    els.lcTitle.textContent = `Level ${game.levelDef.id} Complete!`;
    els.lcScore.textContent = game.score;
    els.lcAccuracy.textContent = acc + '%';
    els.lcCombo.textContent = game.bestCombo;
    els.lcStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    showScreen('levelCompleteMenu');
  } else {
    audio.levelLose();
    store.highScore = Math.max(store.highScore, game.score);
    saveStore();
    els.goScore.textContent = game.score;
    els.goAccuracy.textContent = acc + '%';
    showScreen('gameOverMenu');
  }
}

function updateHUD() {
  els.hudScore.textContent = game.score;
  els.hudArrows.textContent = game.mode === 'practice' ? '∞' : Math.max(0, game.arrowsLeft);
  els.hudTimer.textContent = game.mode === 'practice' ? '--' : Math.max(0, Math.ceil(game.timeLeft));
  const acc = game.hits + game.misses > 0 ? Math.round((game.hits / (game.hits + game.misses)) * 100) : 0;
  els.hudAccuracy.textContent = acc + '%';
  els.windSpeed.textContent = game.wind.toFixed(1);
  els.windArrow.style.transform = `rotate(${game.wind > 0 ? 0 : 180}deg)`;
  els.hudBest.textContent = Math.max(store.highScore, game.score);
  els.hudDiff.textContent = currentDifficulty.charAt(0).toUpperCase() + currentDifficulty.slice(1);
  if (game.mode === 'practice') {
    els.hudRound.textContent = '–';
  } else {
    const shotsFired = game.arrowsTotal - game.arrowsLeft;
    els.hudRound.textContent = `${Math.min(shotsFired + (pointerActive ? 1 : 0), game.arrowsTotal)}/${game.arrowsTotal}`;
  }
}

/* ---------------------------------------------------------------------------
   10. INPUT — AIM / DRAW / SHOOT (mouse + touch, unified)
--------------------------------------------------------------------------- */
// Aim = current pointer position relative to screen center (continuous, like a reticle).
// Draw power = independent charge-up while the pointer is held down (plus an optional
// backward-drag boost on touch). Keeping these separate prevents "aiming down" from
// being misread as "more power", which was driving arrows straight into the ground.
const aim = { yaw: 0, pitch: 0 };
const AIM_LIMIT = 0.5;
let pointerActive = false;
let pointerDownAt = 0;
let pointerDownPos = { x: 0, y: 0 };
let drawPower = 0;
const DRAW_TIME_MS = 900; // full charge duration when holding still

function sensitivityFactor() { return store.sensitivity / 100; }

function updateAimFromPoint(p) {
  const cx = window.innerWidth / 2, cy = window.innerHeight / 2;
  const sens = sensitivityFactor();
  const nx = (p.x - cx) / cx;   // -1..1
  const ny = (p.y - cy) / cy;   // -1..1
  aim.yaw = THREE.MathUtils.clamp(-nx * AIM_LIMIT * sens, -AIM_LIMIT * 1.4, AIM_LIMIT * 1.4);
  aim.pitch = THREE.MathUtils.clamp(ny * AIM_LIMIT * 0.85 * sens, -AIM_LIMIT * 1.1, AIM_LIMIT * 1.1);
}

function onPointerDown(e) {
  audio.ensure();
  if (game.state !== 'playing' || game.arrowsLeft <= 0) return;
  pointerActive = true;
  pointerDownAt = performance.now();
  const p = getPoint(e);
  pointerDownPos.x = p.x; pointerDownPos.y = p.y;
  updateAimFromPoint(p);
  audio.draw();
  els.drawPowerWrap.classList.add('show');
}
// Same as onPointerDown but does NOT move the aim reticle — used by the dedicated
// mobile Shoot button, which sits in a fixed corner so pressing it shouldn't yank
// the crosshair over to that corner. Aiming is still done by dragging elsewhere.
function startDrawNoAim() {
  audio.ensure();
  if (game.state !== 'playing' || game.arrowsLeft <= 0) return;
  pointerActive = true;
  pointerDownAt = performance.now();
  audio.draw();
  els.drawPowerWrap.classList.add('show');
  els.mobileShootBtn?.classList.add('charging');
}
function onPointerMove(e) {
  const p = getPoint(e);
  if (!IS_TOUCH || pointerActive) updateAimFromPoint(p);
}
function onPointerUp() {
  if (!pointerActive) return;
  pointerActive = false;
  els.drawPowerWrap.classList.remove('show');
  els.mobileShootBtn?.classList.remove('charging');
  // Compute power directly from elapsed hold time at the moment of release, rather than
  // relying on the last value cached by the animate() loop — this guarantees a fast
  // down->up (faster than one rendered frame) still registers a valid shot.
  const held = performance.now() - pointerDownAt;
  drawPower = THREE.MathUtils.clamp(held / DRAW_TIME_MS, 0, 1);
  if (game.state === 'playing' && game.arrowsLeft > 0 && drawPower > 0.06) {
    shoot(drawPower);
  }
  drawPower = 0;
  updateBowDraw(0);
}
function getPoint(e) {
  if (e.touches && e.touches[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  if (e.changedTouches && e.changedTouches[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

canvas.addEventListener('mousedown', onPointerDown);
window.addEventListener('mousemove', onPointerMove);
window.addEventListener('mouseup', onPointerUp);
// Touch handlers: only intercept touches that start on the canvas (gameplay area) so
// that UI buttons elsewhere on the page keep receiving normal tap-to-click behavior.
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); onPointerDown(e); }, { passive: false });
window.addEventListener('touchmove', (e) => { if (pointerActive) { e.preventDefault(); onPointerMove(e); } }, { passive: false });
window.addEventListener('touchend', (e) => { if (pointerActive) { e.preventDefault(); onPointerUp(e); } }, { passive: false });

// Dedicated large mobile Shoot button — an explicit, comfortable-to-reach fire control
// that never sits over the target (bottom-right corner) as requested. Works alongside
// (not instead of) drag-anywhere-on-canvas aiming/drawing.
if (els.mobileShootBtn) {
  els.mobileShootBtn.addEventListener('touchstart', (e) => { e.preventDefault(); startDrawNoAim(); }, { passive: false });
  els.mobileShootBtn.addEventListener('touchend', (e) => { e.preventDefault(); onPointerUp(); }, { passive: false });
  els.mobileShootBtn.addEventListener('mousedown', (e) => { e.preventDefault(); startDrawNoAim(); });
  window.addEventListener('mouseup', () => { if (pointerActive) onPointerUp(); });
}

function updateBowDraw(power) {
  bowGroup.position.z = -0.7 + power * 0.22;
  arrowRestMesh.position.z = 0.18 + power * 0.22;
  const strPos = stringLine.geometry.attributes.position;
  strPos.setXYZ(1, 0, 0, 0.18 + power * 0.24);
  strPos.needsUpdate = true;
}

// Shared aim-direction math so the trajectory guide always shows exactly where the
// arrow will actually go — no drift between the preview and the real shot.
function computeAimDirection(power) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const yawAxis = new THREE.Vector3(0, 1, 0);
  const rightAxis = new THREE.Vector3().crossVectors(dir, yawAxis).normalize();
  dir.applyAxisAngle(yawAxis, aim.yaw);
  dir.applyAxisAngle(rightAxis, -aim.pitch);
  dir.normalize();
  dir.y += 0.05 + power * 0.02;
  dir.normalize();
  return dir;
}

function shoot(power) {
  audio.release();
  const dir = computeAimDirection(power);
  const origin = new THREE.Vector3();
  arrowRestMesh.getWorldPosition(origin);
  fireArrow(origin, dir, power);

  game.arrowsLeft -= 1;
  updateHUD();
  // recoil camera kick
  cameraKick = 1;
  setTimeout(() => checkLevelProgress(), 50);
}

/* ---------------------------------------------------------------------------
   10b. TRAJECTORY AIMING GUIDE (dotted arc preview shown while drawing)
--------------------------------------------------------------------------- */
const TRAJ_POINTS = 16;
let trajectoryGuide = null;
function buildTrajectoryGuide() {
  const geo = new THREE.BufferGeometry();
  const positions = new Float32Array(TRAJ_POINTS * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const tex = makeGlowTexture();
  const mat = new THREE.PointsMaterial({ map: tex, color: 0xfff6df, size: 0.16, transparent: true, opacity: 0.95, depthWrite: false, sizeAttenuation: true });
  trajectoryGuide = new THREE.Points(geo, mat);
  trajectoryGuide.visible = false;
  trajectoryGuide.frustumCulled = false;
  scene.add(trajectoryGuide);
}
function updateTrajectoryGuide() {
  if (!trajectoryGuide) return;
  if (!(pointerActive && game.state === 'playing' && game.arrowsLeft > 0)) { trajectoryGuide.visible = false; return; }
  const power = Math.max(drawPower, 0.12);
  const dir = computeAimDirection(power);
  const speed = 18 + power * 26;
  const origin = new THREE.Vector3();
  arrowRestMesh.getWorldPosition(origin);
  const vel = dir.clone().multiplyScalar(speed);
  const posAttr = trajectoryGuide.geometry.attributes.position;
  const stepDt = 0.09;
  const p = origin.clone();
  const v = vel.clone();
  let count = 0;
  for (let i = 0; i < TRAJ_POINTS; i++) {
    posAttr.setXYZ(i, p.x, p.y, p.z);
    count++;
    if (p.y <= 0.05) break;
    v.y -= GRAVITY * stepDt;
    v.x += game.wind * 0.35 * stepDt;
    p.addScaledVector(v, stepDt);
  }
  trajectoryGuide.geometry.setDrawRange(0, count);
  posAttr.needsUpdate = true;
  trajectoryGuide.visible = true;
}

let cameraKick = 0;

/* ---------------------------------------------------------------------------
   11. RESIZE / ORIENTATION
--------------------------------------------------------------------------- */
function onResize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  checkOrientation();
}
function checkOrientation() {
  const isPortrait = window.innerHeight > window.innerWidth;
  const shouldShow = IS_TOUCH && isPortrait && game.state === 'playing';
  els.rotateHint.classList.toggle('hidden', !shouldShow);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', () => setTimeout(onResize, 200));

/* ---------------------------------------------------------------------------
   12. MAIN LOOP
--------------------------------------------------------------------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  gameClockT += dt;

  // idle bow sway
  const sway = Math.sin(gameClockT * 1.3) * 0.01;
  bowRig.rotation.z = aim.yaw * 0.5 + sway;
  bowRig.rotation.x = -aim.pitch * 0.6;
  bowRig.rotation.y = aim.yaw;

  if (cameraKick > 0) { cameraKick = Math.max(0, cameraKick - dt * 4); camera.position.z = 6 + cameraKick * 0.08; camera.fov = 58 - cameraKick * 1.5; camera.updateProjectionMatrix(); }

  if (pointerActive) {
    const held = performance.now() - pointerDownAt;
    drawPower = THREE.MathUtils.clamp(held / DRAW_TIME_MS, 0, 1);
    els.drawPowerFill.style.width = (drawPower * 100) + '%';
    updateBowDraw(drawPower);
  }

  if (window.__clouds) window.__clouds.forEach((c, i) => { c.position.x += dt * (0.15 + (i % 3) * 0.05); if (c.position.x > 70) c.position.x = -70; });
  if (window.__flags) window.__flags.forEach((f) => { f.mesh.rotation.y = Math.sin(gameClockT * 2.2 + f.phase) * 0.35; f.mesh.rotation.z = Math.sin(gameClockT * 1.7 + f.phase) * 0.06; });
  updateParticles(dt);
  updateTrajectoryGuide();

  if (game.state === 'playing') {
    updateTargets(dt);
    updateArrows(dt);
    tickTimer(dt);
    updateHUD();
  }

  renderer.render(scene, camera);
}

/* ---------------------------------------------------------------------------
   13. MENU WIRING
--------------------------------------------------------------------------- */
function refreshMenuHighScore() { els.menuHighScore.textContent = store.highScore; }

function buildLevelGrid() {
  buildDiffChips(els.diffRowLevel, () => buildLevelGrid());
  els.levelGrid.innerHTML = '';
  const unlocked = store.unlockedLevel[currentDifficulty] || 1;
  LEVELS.forEach((lvl, idx) => {
    const tile = document.createElement('div');
    const isUnlocked = lvl.id <= unlocked;
    tile.className = 'level-tile ' + (isUnlocked ? 'unlocked' : 'locked');
    const stars = store.levelStars[currentDifficulty + '_' + lvl.id] || 0;
    tile.innerHTML = `<div>${lvl.id}</div><div class="star">${isUnlocked ? '★'.repeat(stars) + '☆'.repeat(3 - stars) : '🔒'}</div>`;
    if (isUnlocked) {
      tile.onclick = () => { audio.click(); startLevel(idx, currentDifficulty, 'level'); };
    }
    els.levelGrid.appendChild(tile);
  });
}

function applySettingsUI() {
  document.querySelectorAll('[data-set="sound"]').forEach((b) => b.classList.toggle('active', (b.dataset.val === 'on') === store.sound));
  document.querySelectorAll('[data-set="music"]').forEach((b) => b.classList.toggle('active', (b.dataset.val === 'on') === store.music));
  document.querySelectorAll('[data-set="quality"]').forEach((b) => b.classList.toggle('active', b.dataset.val === store.quality));
  els.sensSlider.value = store.sensitivity;
}

function wireMenus() {
  $('btnPlay').onclick = () => {
    audio.click();
    const rebuildPlayChips = () => buildDiffChips(els.diffRowPlay, rebuildPlayChips);
    rebuildPlayChips();
    showScreen('preGameMenu');
  };
  $('btnStartRun').onclick = () => {
    audio.click();
    const idx = Math.max(0, (store.unlockedLevel[currentDifficulty] || 1) - 1);
    startLevel(Math.min(idx, LEVELS.length - 1), currentDifficulty, 'level');
  };
  $('btnPreGameBack').onclick = () => { audio.click(); showScreen('mainMenu'); };

  $('btnLevelSelect').onclick = () => { audio.click(); buildLevelGrid(); showScreen('levelSelectMenu'); };
  $('btnLevelBack').onclick = () => { audio.click(); showScreen('mainMenu'); };

  $('btnPractice').onclick = () => { audio.click(); startLevel(0, currentDifficulty, 'practice'); };

  $('btnHowToPlay').onclick = () => { audio.click(); showScreen('howToPlayMenu'); };
  $('btnHowToPlayBack').onclick = () => { audio.click(); showScreen('mainMenu'); };

  $('btnSettings').onclick = () => { audio.click(); applySettingsUI(); showScreen('settingsMenu'); };
  $('btnSettingsBack').onclick = () => { audio.click(); saveStore(); showScreen('mainMenu'); };
  document.querySelectorAll('.toggle-btn[data-set]').forEach((btn) => {
    btn.onclick = () => {
      audio.click();
      const key = btn.dataset.set, val = btn.dataset.val;
      if (key === 'sound') store.sound = val === 'on';
      if (key === 'music') store.music = val === 'on';
      if (key === 'quality') { store.quality = val; computeQuality(); rebuildSceneQuality(); }
      applySettingsUI(); saveStore();
    };
  });
  els.sensSlider.oninput = () => { store.sensitivity = parseInt(els.sensSlider.value, 10); saveStore(); };
  $('btnFullscreen').onclick = () => {
    audio.click();
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  els.pauseBtn.onclick = () => { if (game.state === 'playing') { game.state = 'paused'; showScreen('pauseMenu', { keepHud: true }); } };
  $('btnResume').onclick = () => { audio.click(); game.state = 'playing'; showScreen('hud'); };
  $('btnRestartLevel').onclick = () => { audio.click(); startLevel(game.levelIndex, currentDifficulty, game.mode); };
  $('btnQuitToMenu').onclick = () => { audio.click(); backToMenu(); };

  $('btnNextLevel').onclick = () => {
    audio.click();
    const next = Math.min(game.levelIndex + 1, LEVELS.length - 1);
    startLevel(next, currentDifficulty, 'level');
  };
  $('btnReplayLevel').onclick = () => { audio.click(); startLevel(game.levelIndex, currentDifficulty, game.mode); };
  $('btnLcMenu').onclick = () => { audio.click(); backToMenu(); };

  $('btnGoRetry').onclick = () => { audio.click(); startLevel(game.levelIndex, currentDifficulty, game.mode); };
  $('btnGoMenu').onclick = () => { audio.click(); backToMenu(); };

  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && game.state === 'playing') els.pauseBtn.click();
    if (e.code === 'KeyP' && game.state === 'playing') els.pauseBtn.click();
  });
}

function backToMenu() {
  game.state = 'idle';
  clearTargets();
  activeArrows.forEach((a) => releaseArrow(a));
  refreshMenuHighScore();
  showScreen('mainMenu');
}

function rebuildSceneQuality() {
  // Lightweight approach: renderer settings can update live; full re-geometry rebuild
  // is deferred to next level start to avoid mid-game hitches.
  const q = computeQuality();
  renderer.setPixelRatio(q.pixelRatio);
  renderer.shadowMap.enabled = q.shadows;
}

/* ---------------------------------------------------------------------------
   14. BOOT
   Two independent safety nets ensure the loading screen can never get stuck,
   no matter what goes wrong during setup:
   1) boot() itself is wrapped in try/catch — any error during scene/asset
      setup is logged and the game still reaches the main menu instead of
      hanging (gameplay may be degraded, but the player is never stuck).
   2) An unconditional fallback timer (independent of boot() ever finishing)
      force-dismisses the loading screen after ~2.5s no matter what.
--------------------------------------------------------------------------- */
function boot() {
  computeQuality();
  initRenderer();
  buildEnvironment();
  buildCameraAndBow();
  buildParticlePool();
  buildTrajectoryGuide();
  TARGET_TEX = makeTargetTexture('standard');
  TARGET_TEX_BONUS = makeTargetTexture('bonus');

  wireMenus();
  applySettingsUI();
  refreshMenuHighScore();
  onResize();
  if (IS_TOUCH && els.mobileShootBtn) els.mobileShootBtn.classList.remove('hidden');

  dismissLoadingScreen();
  animate();
}

let loadingDismissed = false;
function dismissLoadingScreen() {
  if (loadingDismissed) return;
  loadingDismissed = true;
  els.loading.classList.add('hidden');
  // Only the main menu should be shown here if nothing else has already taken over
  // the screen (e.g. a very slow boot racing the fallback timer below).
  const anyOtherScreenVisible = SCREENS.some((s) => s !== 'loading' && s !== 'mainMenu' && !els[s].classList.contains('hidden'));
  if (!anyOtherScreenVisible) showScreen('mainMenu');
}

// Absolute fallback: no matter what happens above (a thrown error, a hung texture
// build, WebGL unavailable, anything) the loading screen is force-dismissed after
// a maximum of ~2.5s so the player can always reach the main menu.
setTimeout(dismissLoadingScreen, 2500);

try {
  boot();
} catch (err) {
  console.error('Archery Master: boot() failed, falling back to main menu.', err);
  dismissLoadingScreen();
}
