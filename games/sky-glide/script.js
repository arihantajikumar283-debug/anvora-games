/* ==========================================================================
   SKY GLIDE — Game Engine
   Developed by Arihant — An Anvora Games Original
   Vanilla JS + HTML5 Canvas + Web Audio API + localStorage
   No external libraries, no external assets — fully self-contained.
   ==========================================================================
   TABLE OF CONTENTS
   1.  Storage helpers (localStorage)
   2.  Settings
   3.  Audio engine (Web Audio API generated SFX)
   4.  Skins / Hangar
   5.  Achievements
   6.  DOM / Screen management
   7.  Canvas + responsive sizing
   8.  Game constants & state
   9.  Background (sky gradient, day/night, parallax, weather)
   10. Player (airplane physics)
   11. Obstacles (procedural, original shapes — NOT pipes)
   12. Collectibles (stars / crystals)
   13. Power-ups
   14. Collision detection
   15. Difficulty scaling
   16. Scoring
   17. Input handling (keyboard, mouse, touch/pointer)
   18. Game loop (requestAnimationFrame, delta-time)
   19. Game flow (start / pause / resume / restart / game over)
   20. Boot
   ========================================================================== */

(() => {
  "use strict";

  /* ========================================================================
     1. STORAGE HELPERS
     ======================================================================== */
  const STORAGE_KEYS = {
    best: "skyglide_best_score",
    settings: "skyglide_settings",
    skins: "skyglide_unlocked_skins",
    selectedSkin: "skyglide_selected_skin",
    achievements: "skyglide_achievements",
    starsTotal: "skyglide_stars_total"
  };

  function loadJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* localStorage unavailable — game still works, just won't persist */
    }
  }

  /* ========================================================================
     2. SETTINGS
     ======================================================================== */
  const DEFAULT_SETTINGS = {
    sound: true,
    music: true,
    vibration: true,
    quality: "high", // low | medium | high
    showFps: false
  };

  let settings = Object.assign({}, DEFAULT_SETTINGS, loadJSON(STORAGE_KEYS.settings, {}));

  function saveSettings() {
    saveJSON(STORAGE_KEYS.settings, settings);
  }

  /* ========================================================================
     3. AUDIO ENGINE — all sounds generated with Web Audio API oscillators.
        No external audio files required.
     ======================================================================== */
  const AudioEngine = (() => {
    let ctx = null;
    let musicNode = null;
    let musicGain = null;

    function ensureContext() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (AC) ctx = new AC();
      }
      if (ctx && ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    function tone({ freq = 440, duration = 0.12, type = "sine", volume = 0.2, glideTo = null, delay = 0 }) {
      if (!settings.sound) return;
      const c = ensureContext();
      if (!c) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      const startTime = c.currentTime + delay;
      osc.frequency.setValueAtTime(freq, startTime);
      if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, startTime + duration);
      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start(startTime);
      osc.stop(startTime + duration + 0.02);
    }

    return {
      flap() { tone({ freq: 420, glideTo: 620, duration: 0.09, type: "triangle", volume: 0.16 }); },
      star() { tone({ freq: 700, glideTo: 1100, duration: 0.12, type: "sine", volume: 0.18 }); },
      powerup() { tone({ freq: 300, glideTo: 900, duration: 0.22, type: "sawtooth", volume: 0.12 }); },
      score() { tone({ freq: 880, duration: 0.08, type: "square", volume: 0.08 }); },
      achievement() {
        tone({ freq: 523, duration: 0.14, type: "sine", volume: 0.16 });
        tone({ freq: 659, duration: 0.14, type: "sine", volume: 0.16, delay: 0.1 });
        tone({ freq: 784, duration: 0.22, type: "sine", volume: 0.18, delay: 0.2 });
      },
      collision() { tone({ freq: 180, glideTo: 40, duration: 0.32, type: "sawtooth", volume: 0.22 }); },
      click() { tone({ freq: 500, duration: 0.05, type: "square", volume: 0.08 }); },
      startMusicDrone() {
        if (!settings.music) return;
        const c = ensureContext();
        if (!c || musicNode) return;
        musicGain = c.createGain();
        musicGain.gain.value = 0.02;
        musicGain.connect(c.destination);
        musicNode = c.createOscillator();
        musicNode.type = "sine";
        musicNode.frequency.value = 220;
        musicNode.connect(musicGain);
        musicNode.start();
      },
      stopMusicDrone() {
        if (musicNode) {
          try { musicNode.stop(); } catch (e) {}
          musicNode.disconnect();
          musicNode = null;
        }
        if (musicGain) { musicGain.disconnect(); musicGain = null; }
      },
      resume() { ensureContext(); }
    };
  })();

  /* ========================================================================
     4. SKINS / HANGAR
     ======================================================================== */
  const SKINS = [
    { id: "starter", name: "Starter Plane", emoji: "✈️", unlockScore: 0, colors: ["#ffffff", "#c7d4e6"] },
    { id: "blue-jet", name: "Blue Jet", emoji: "🛩️", unlockScore: 10, colors: ["#4fb3ea", "#1c6fa8"] },
    { id: "red-falcon", name: "Red Falcon", emoji: "🛫", unlockScore: 25, colors: ["#ff5c6c", "#a4222f"] },
    { id: "golden-jet", name: "Golden Jet", emoji: "🛬", unlockScore: 50, colors: ["#ffd15c", "#c98d1c"] },
    { id: "neon-jet", name: "Neon Jet", emoji: "🚀", unlockScore: 100, colors: ["#7cffc4", "#12b37a"] }
  ];

  let unlockedSkins = loadJSON(STORAGE_KEYS.skins, ["starter"]);
  let selectedSkinId = loadJSON(STORAGE_KEYS.selectedSkin, "starter");

  function unlockSkinsForScore(score) {
    const newlyUnlocked = [];
    SKINS.forEach((skin) => {
      if (score >= skin.unlockScore && !unlockedSkins.includes(skin.id)) {
        unlockedSkins.push(skin.id);
        newlyUnlocked.push(skin);
      }
    });
    if (newlyUnlocked.length) saveJSON(STORAGE_KEYS.skins, unlockedSkins);
    return newlyUnlocked;
  }

  function getSelectedSkin() {
    return SKINS.find((s) => s.id === selectedSkinId) || SKINS[0];
  }

  /* ========================================================================
     5. ACHIEVEMENTS
     ======================================================================== */
  const ACHIEVEMENT_DEFS = [
    { id: "first_flight", name: "First Flight", desc: "Play your first game.", icon: "🕊️" },
    { id: "score_10", name: "Score 10", desc: "Reach a score of 10.", icon: "🔟" },
    { id: "score_25", name: "Score 25", desc: "Reach a score of 25.", icon: "🎯" },
    { id: "score_50", name: "Score 50", desc: "Reach a score of 50.", icon: "🏅" },
    { id: "score_100", name: "Score 100", desc: "Reach a score of 100.", icon: "👑" },
    { id: "star_collector", name: "Star Collector", desc: "Collect 50 stars in total.", icon: "⭐" },
    { id: "perfect_run", name: "Perfect Run", desc: "Score 20+ without hitting a single obstacle edge closely.", icon: "💎" }
  ];

  let achievements = loadJSON(STORAGE_KEYS.achievements, {});
  let starsTotal = loadJSON(STORAGE_KEYS.starsTotal, 0);

  function unlockAchievement(id) {
    if (achievements[id]) return false;
    achievements[id] = true;
    saveJSON(STORAGE_KEYS.achievements, achievements);
    return true;
  }

  function showToast(text) {
    const toast = document.getElementById("toast");
    toast.textContent = text;
    toast.classList.remove("hidden");
    requestAnimationFrame(() => toast.classList.add("show"));
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      toast.classList.remove("show");
      setTimeout(() => toast.classList.add("hidden"), 250);
    }, 2200);
  }

  function grantAchievement(id) {
    const def = ACHIEVEMENT_DEFS.find((a) => a.id === id);
    if (!def) return;
    if (unlockAchievement(id)) {
      AudioEngine.achievement();
      showToast(`🏆 Achievement Unlocked: ${def.name}`);
    }
  }

  /* ========================================================================
     6. DOM / SCREEN MANAGEMENT
     ======================================================================== */
  const screens = {
    menu: document.getElementById("screen-menu"),
    howto: document.getElementById("screen-howto"),
    hangar: document.getElementById("screen-hangar"),
    achievements: document.getElementById("screen-achievements"),
    settings: document.getElementById("screen-settings"),
    about: document.getElementById("screen-about"),
    pause: document.getElementById("screen-pause"),
    gameover: document.getElementById("screen-gameover")
  };
  const hud = document.getElementById("hud");
  const tapLayer = document.getElementById("tap-layer");

  function hideAllScreens() {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
  }

  function showScreen(name) {
    hideAllScreens();
    if (name && screens[name]) screens[name].classList.remove("hidden");
  }

  /* ========================================================================
     7. CANVAS + RESPONSIVE SIZING
     ======================================================================== */
  const canvas = document.getElementById("game-canvas");
  const ctx2d = canvas.getContext("2d");
  let DPR = Math.min(window.devicePixelRatio || 1, 2);
  let W = 0, H = 0; // CSS pixel dimensions

  function resizeCanvas() {
    const wrapper = document.getElementById("game-wrapper");
    W = wrapper.clientWidth;
    H = wrapper.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, settings.quality === "low" ? 1 : 2);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx2d.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener("resize", resizeCanvas);
  window.addEventListener("orientationchange", resizeCanvas);

  /* ========================================================================
     8. GAME CONSTANTS & STATE
     ======================================================================== */
  const GRAVITY = 1500;          // px/s^2
  const FLAP_VELOCITY = -430;    // px/s (instant upward boost)
  const MAX_FALL_SPEED = 620;
  const PLANE_SIZE = 54;         // clearly visible but not oversized
  const BASE_SCROLL_SPEED = 190; // px/s
  const BASE_GAP = 230;          // px gap between top/bottom obstacle
  const MIN_GAP = 172;
  const OBSTACLE_WIDTH = 84;
  const BASE_SPAWN_DISTANCE = 360; // px between obstacles horizontally

  let state = "menu"; // menu | playing | paused | gameover
  let lastTime = 0;
  let fpsSamples = [];
  let fpsDisplay = 60;

  let plane, obstacles, collectibles, powerups, particles, weatherParticles;
  let score, distance, best, runStarsCollected;
  let scrollSpeed, spawnTimer, nextSpawnDistance;
  let dayNightTime; // seconds elapsed, drives sky cycle
  let activeEffects; // { shield, slowmo, scoreboost, magnet } each with timeLeft
  let shakeTime = 0;
  let hadCloseCall = false; // used for "perfect run" tracking (simplified)

  best = loadJSON(STORAGE_KEYS.best, 0);

  /* ========================================================================
     9. BACKGROUND — warm sunset sky gradient, gentle day/twilight cycle,
        parallax clouds, weather
     ======================================================================== */
  const DAY_CYCLE_DURATION = 110; // seconds for a full gentle cycle

  // Sky phases — kept in a warm, sunset-leaning palette throughout, with a
  // brief softer twilight dip rather than a full dark night. This keeps the
  // blue/purple obstacle pillars reading clearly against the sky at all times.
  const SKY_PHASES = [
    { t: 0.0, top: [255, 154, 86], bottom: [255, 217, 160] },   // golden day
    { t: 0.3, top: [255, 120, 84], bottom: [255, 179, 122] },   // sunset
    { t: 0.5, top: [120, 82, 120], bottom: [200, 140, 140] },   // soft twilight
    { t: 0.7, top: [255, 143, 107], bottom: [255, 201, 143] },  // sunrise
    { t: 1.0, top: [255, 154, 86], bottom: [255, 217, 160] }    // back to golden day
  ];

  function lerp(a, b, t) { return a + (b - a) * t; }
  function lerpColor(c1, c2, t) {
    return [Math.round(lerp(c1[0], c2[0], t)), Math.round(lerp(c1[1], c2[1], t)), Math.round(lerp(c1[2], c2[2], t))];
  }

  function getSkyColors(cycleT) {
    for (let i = 0; i < SKY_PHASES.length - 1; i++) {
      const a = SKY_PHASES[i], b = SKY_PHASES[i + 1];
      if (cycleT >= a.t && cycleT <= b.t) {
        const localT = (cycleT - a.t) / (b.t - a.t);
        return { top: lerpColor(a.top, b.top, localT), bottom: lerpColor(a.bottom, b.bottom, localT), phaseT: cycleT };
      }
    }
    return { top: SKY_PHASES[0].top, bottom: SKY_PHASES[0].bottom, phaseT: cycleT };
  }

  // Parallax cloud layers (simple circles, cheap to draw)
  let parallaxClouds = [];
  function initParallax() {
    parallaxClouds = [];
    const count = settings.quality === "low" ? 4 : settings.quality === "medium" ? 6 : 9;
    for (let i = 0; i < count; i++) {
      parallaxClouds.push({
        x: Math.random() * 1000,
        y: 30 + Math.random() * 220,
        scale: 0.5 + Math.random() * 1.1,
        speedFactor: 0.15 + Math.random() * 0.25,
        alpha: 0.35 + Math.random() * 0.35
      });
    }
  }

  function drawCloud(x, y, scale, alpha) {
    ctx2d.save();
    ctx2d.globalAlpha = alpha;
    ctx2d.fillStyle = "#ffffff";
    ctx2d.beginPath();
    ctx2d.ellipse(x, y, 26 * scale, 15 * scale, 0, 0, Math.PI * 2);
    ctx2d.ellipse(x + 18 * scale, y - 8 * scale, 18 * scale, 12 * scale, 0, 0, Math.PI * 2);
    ctx2d.ellipse(x - 20 * scale, y - 4 * scale, 16 * scale, 11 * scale, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();
  }

  function updateAndDrawBackground(dt, cycleT) {
    const { top, bottom } = getSkyColors(cycleT);
    const grad = ctx2d.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, `rgb(${top[0]},${top[1]},${top[2]})`);
    grad.addColorStop(1, `rgb(${bottom[0]},${bottom[1]},${bottom[2]})`);
    ctx2d.fillStyle = grad;
    ctx2d.fillRect(0, 0, W, H);

    // Stars at night
    const nightAmount = Math.max(0, 1 - Math.abs(cycleT - 0.5) * 5); // peaks at twilight phase, softer now
    if (nightAmount > 0.05 && settings.quality !== "low") {
      ctx2d.save();
      ctx2d.globalAlpha = nightAmount * 0.9;
      ctx2d.fillStyle = "#fff";
      for (let i = 0; i < 40; i++) {
        const sx = (i * 137.5) % W;
        const sy = (i * 71.3) % (H * 0.6);
        const tw = 0.5 + 0.5 * Math.sin(dayNightTime * 2 + i);
        ctx2d.globalAlpha = nightAmount * 0.9 * tw;
        ctx2d.fillRect(sx, sy, 2, 2);
      }
      ctx2d.restore();
    }

    // Sun/Moon glow near horizon during sunset/sunrise
    const sunsetAmount = Math.max(0, 1 - Math.abs(cycleT - 0.3) * 6);
    const sunriseAmount = Math.max(0, 1 - Math.abs(cycleT - 0.7) * 6);
    const glowAmount = Math.max(sunsetAmount, sunriseAmount);
    if (glowAmount > 0.05) {
      ctx2d.save();
      ctx2d.globalAlpha = glowAmount * 0.55;
      const gx = W * 0.78, gy = H * 0.28;
      const rg = ctx2d.createRadialGradient(gx, gy, 0, gx, gy, 90);
      rg.addColorStop(0, "rgba(255,220,150,0.9)");
      rg.addColorStop(1, "rgba(255,220,150,0)");
      ctx2d.fillStyle = rg;
      ctx2d.fillRect(0, 0, W, H);
      ctx2d.restore();
    }

    // Parallax clouds
    parallaxClouds.forEach((c) => {
      c.x -= scrollSpeed * c.speedFactor * dt;
      if (c.x < -60) c.x = W + 60;
      drawCloud(c.x, c.y, c.scale, c.alpha * (1 - nightAmount * 0.6));
    });
  }

  /* ---- Weather system: light rain + wind streaks, kept lightweight ---- */
  function initWeather() {
    weatherParticles = [];
  }
  let weatherMode = "clear"; // clear | rain | wind
  let weatherTimer = 0;

  function updateWeather(dt) {
    weatherTimer -= dt;
    if (weatherTimer <= 0) {
      // roll a new weather window
      const roll = Math.random();
      weatherMode = roll < 0.18 ? "rain" : roll < 0.32 ? "wind" : "clear";
      weatherTimer = 6 + Math.random() * 10;
      weatherParticles = [];
    }

    const maxParticles = settings.quality === "low" ? 12 : settings.quality === "medium" ? 22 : 34;

    if (weatherMode === "rain" && weatherParticles.length < maxParticles) {
      weatherParticles.push({ x: Math.random() * W, y: -10, len: 8 + Math.random() * 10, speed: 380 + Math.random() * 140 });
    }
    if (weatherMode === "wind" && weatherParticles.length < maxParticles * 0.6) {
      weatherParticles.push({ x: -10, y: Math.random() * H * 0.7, len: 22 + Math.random() * 20, speed: 260 + Math.random() * 120 });
    }

    weatherParticles.forEach((p) => {
      if (weatherMode === "rain") p.y += p.speed * dt;
      else p.x += p.speed * dt;
    });
    weatherParticles = weatherParticles.filter((p) => p.y < H + 20 && p.x < W + 20);
  }

  function drawWeather() {
    if (weatherMode === "clear") return;
    ctx2d.save();
    ctx2d.strokeStyle = weatherMode === "rain" ? "rgba(210,230,255,0.55)" : "rgba(255,255,255,0.35)";
    ctx2d.lineWidth = 1.4;
    weatherParticles.forEach((p) => {
      ctx2d.beginPath();
      if (weatherMode === "rain") {
        ctx2d.moveTo(p.x, p.y);
        ctx2d.lineTo(p.x - 3, p.y + p.len);
      } else {
        ctx2d.moveTo(p.x, p.y);
        ctx2d.lineTo(p.x + p.len, p.y);
      }
      ctx2d.stroke();
    });
    ctx2d.restore();
  }

  /* ========================================================================
     10. PLAYER — airplane physics
     ======================================================================== */
  function createPlane() {
    return {
      x: 0, // set relative to W in resetGame
      y: 0,
      vy: 0,
      rotation: 0,
      wingPhase: 0
    };
  }

  function flap() {
    if (state !== "playing") return;
    plane.vy = FLAP_VELOCITY;
    AudioEngine.flap();
    if (settings.vibration && navigator.vibrate) navigator.vibrate(12);
  }

  function updatePlane(dt) {
    plane.vy += GRAVITY * dt;
    if (plane.vy > MAX_FALL_SPEED) plane.vy = MAX_FALL_SPEED;
    plane.y += plane.vy * dt;

    // rotation follows velocity for a natural "nose up on boost, nose down on fall" feel
    const targetRotation = Math.max(-0.5, Math.min(1.1, plane.vy / 500));
    plane.rotation += (targetRotation - plane.rotation) * Math.min(1, dt * 10);

    plane.wingPhase += dt * 14;

    // floor / ceiling bounds (floor = crash, ceiling = clamp)
    if (plane.y < -10) { plane.y = -10; plane.vy = 0; }
  }

  function drawPlane() {
    const skin = getSelectedSkin();
    ctx2d.save();
    ctx2d.translate(plane.x, plane.y);
    ctx2d.rotate(plane.rotation * 0.6);

    // shield visual
    if (activeEffects.shield > 0) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.55 + 0.25 * Math.sin(dayNightTime * 10);
      ctx2d.strokeStyle = "#7cd8ff";
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(0, 0, PLANE_SIZE * 0.95, 0, Math.PI * 2);
      ctx2d.stroke();
      ctx2d.restore();
    }

    const bodyGrad = ctx2d.createLinearGradient(-PLANE_SIZE / 2, 0, PLANE_SIZE / 2, 0);
    bodyGrad.addColorStop(0, skin.colors[1]);
    bodyGrad.addColorStop(1, skin.colors[0]);

    // subtle drop shadow beneath the plane for a touch of depth
    ctx2d.save();
    ctx2d.globalAlpha = 0.18;
    ctx2d.fillStyle = "#000000";
    ctx2d.beginPath();
    ctx2d.ellipse(-2, PLANE_SIZE / 5, PLANE_SIZE / 2.4, PLANE_SIZE / 7, 0, 0, Math.PI * 2);
    ctx2d.fill();
    ctx2d.restore();

    // wing (subtle flap animation)
    const wingLift = Math.sin(plane.wingPhase) * 4;
    ctx2d.fillStyle = skin.colors[1];
    ctx2d.beginPath();
    ctx2d.moveTo(-4, 2);
    ctx2d.lineTo(-16, 12 + wingLift);
    ctx2d.lineTo(2, 6);
    ctx2d.closePath();
    ctx2d.fill();

    // fuselage
    ctx2d.fillStyle = bodyGrad;
    ctx2d.beginPath();
    ctx2d.moveTo(PLANE_SIZE / 2, 0);
    ctx2d.quadraticCurveTo(PLANE_SIZE / 4, -PLANE_SIZE / 4, -PLANE_SIZE / 2, -PLANE_SIZE / 8);
    ctx2d.quadraticCurveTo(-PLANE_SIZE / 3, 0, -PLANE_SIZE / 2, PLANE_SIZE / 8);
    ctx2d.quadraticCurveTo(PLANE_SIZE / 4, PLANE_SIZE / 4, PLANE_SIZE / 2, 0);
    ctx2d.closePath();
    ctx2d.fill();

    // cockpit
    ctx2d.fillStyle = "rgba(255,255,255,0.85)";
    ctx2d.beginPath();
    ctx2d.ellipse(PLANE_SIZE / 6, -2, 6, 4, 0, 0, Math.PI * 2);
    ctx2d.fill();

    // tail fin
    ctx2d.fillStyle = skin.colors[1];
    ctx2d.beginPath();
    ctx2d.moveTo(-PLANE_SIZE / 2 + 2, -PLANE_SIZE / 8);
    ctx2d.lineTo(-PLANE_SIZE / 2 - 8, -PLANE_SIZE / 2);
    ctx2d.lineTo(-PLANE_SIZE / 3, -PLANE_SIZE / 8);
    ctx2d.closePath();
    ctx2d.fill();

    // score-boost / slowmo glow trail
    if (activeEffects.scoreBoost > 0) {
      ctx2d.save();
      ctx2d.globalAlpha = 0.4;
      ctx2d.fillStyle = "#ffd15c";
      ctx2d.beginPath();
      ctx2d.ellipse(-PLANE_SIZE / 2 - 6, 0, 10, 5, 0, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
    }

    ctx2d.restore();
  }

  /* ========================================================================
     11. OBSTACLES — clean, solid pillar obstacles (blue/purple gradient body
         + a distinct cap band at the gap-facing edge). Deliberately simple:
         one consistent shape drawn the same way for every obstacle, top and
         bottom, so there are no stray decorative shapes, no extra glow
         layers, and the collision rectangle matches the drawn shape exactly.
     ======================================================================== */
  const CAP_HEIGHT = 22; // height of the distinct cap band at the gap edge

  function spawnObstacle() {
    const stage = getDifficultyStage();
    const gap = Math.max(MIN_GAP, BASE_GAP - stage * 6 + (Math.random() * 20 - 10));
    const margin = 70;
    const gapCenter = margin + Math.random() * (H - margin * 2 - gap) + gap / 2;

    obstacles.push({
      x: W + OBSTACLE_WIDTH,
      gapCenter,
      gap,
      width: OBSTACLE_WIDTH,
      passed: false
    });
  }

  function updateObstacles(dt, speed) {
    obstacles.forEach((o) => { o.x -= speed * dt; });
    obstacles = obstacles.filter((o) => o.x > -o.width - 20);
  }

  // Draws one solid pillar segment (top or bottom half of an obstacle).
  // x, yTop, height define the EXACT rectangle used for collision — the
  // drawing never extends past this rectangle, so visuals and hitbox
  // always match.
  function drawObstaclePiece(x, yTop, height, isTop) {
    if (height <= 0) return;
    ctx2d.save();

    // Main pillar body — clean vertical gradient, blue into violet.
    const bodyGrad = ctx2d.createLinearGradient(x, 0, x + OBSTACLE_WIDTH, 0);
    bodyGrad.addColorStop(0, "#6fa8ff");
    bodyGrad.addColorStop(0.5, "#5b7fe6");
    bodyGrad.addColorStop(1, "#7a5cd6");

    // Very subtle outer glow on the body only — no extra shapes, just a
    // soft shadow behind the single fill path.
    ctx2d.shadowColor = "rgba(90,110,230,0.35)";
    ctx2d.shadowBlur = 10;
    ctx2d.fillStyle = bodyGrad;
    ctx2d.fillRect(x, yTop, OBSTACLE_WIDTH, height);
    ctx2d.shadowBlur = 0;

    // Thin left-edge highlight for a touch of dimension.
    const highlightGrad = ctx2d.createLinearGradient(x, 0, x + 6, 0);
    highlightGrad.addColorStop(0, "rgba(255,255,255,0.35)");
    highlightGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx2d.fillStyle = highlightGrad;
    ctx2d.fillRect(x, yTop, 6, height);

    // Cap band at the gap-facing edge — same width as the body, so the
    // hitbox never differs from what's drawn.
    const capY = isTop ? yTop + height - CAP_HEIGHT : yTop;
    const capH = Math.min(CAP_HEIGHT, height);
    const capGrad = ctx2d.createLinearGradient(x, capY, x + OBSTACLE_WIDTH, capY);
    capGrad.addColorStop(0, "#8fc3ff");
    capGrad.addColorStop(1, "#9a86e8");
    ctx2d.fillStyle = capGrad;
    ctx2d.fillRect(x, capY, OBSTACLE_WIDTH, capH);

    // Clean, crisp outline around the whole pillar.
    ctx2d.strokeStyle = "rgba(255,255,255,0.45)";
    ctx2d.lineWidth = 2;
    ctx2d.strokeRect(x + 1, yTop + 1, OBSTACLE_WIDTH - 2, height - 2);

    ctx2d.restore();
  }

  function drawObstacles() {
    obstacles.forEach((o) => {
      const topHeight = o.gapCenter - o.gap / 2;
      const bottomY = o.gapCenter + o.gap / 2;
      const bottomHeight = H - bottomY;
      drawObstaclePiece(o.x, 0, topHeight, true);
      drawObstaclePiece(o.x, bottomY, bottomHeight, false);
    });
  }

  /* ========================================================================
     12. COLLECTIBLES — stars / crystals
     ======================================================================== */
  const COLLECTIBLE_TYPES = [
    { id: "star", points: 1, weight: 70, color: "#ffe98a", radius: 9, icon: "star" },
    { id: "goldstar", points: 5, weight: 22, color: "#ffd15c", radius: 11, icon: "star" },
    { id: "crystal", points: 10, weight: 8, color: "#7cf0ff", radius: 12, icon: "gem" }
  ];

  function pickCollectibleType() {
    const total = COLLECTIBLE_TYPES.reduce((s, c) => s + c.weight, 0);
    let r = Math.random() * total;
    for (const c of COLLECTIBLE_TYPES) {
      if (r < c.weight) return c;
      r -= c.weight;
    }
    return COLLECTIBLE_TYPES[0];
  }

  function maybeSpawnCollectible(obstacle) {
    if (Math.random() > 0.7) return; // not every obstacle gets one
    const type = pickCollectibleType();
    collectibles.push({
      x: obstacle.x + obstacle.width / 2,
      y: obstacle.gapCenter + (Math.random() * 40 - 20),
      type,
      phase: Math.random() * Math.PI * 2,
      collected: false
    });
  }

  function updateCollectibles(dt, speed) {
    collectibles.forEach((c) => {
      c.x -= speed * dt;
      c.phase += dt * 4;
      // magnet effect pulls nearby collectibles toward the plane
      if (activeEffects.magnet > 0) {
        const dx = plane.x - c.x, dy = plane.y - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 160 && dist > 1) {
          c.x += (dx / dist) * 260 * dt;
          c.y += (dy / dist) * 260 * dt;
        }
      }
    });
    collectibles = collectibles.filter((c) => c.x > -30 && !c.collected);
  }

  function drawStarShape(cx, cy, r, color, bob) {
    ctx2d.save();
    ctx2d.translate(cx, cy + Math.sin(bob) * 3);
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 8;
    ctx2d.beginPath();
    for (let i = 0; i < 5; i++) {
      const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const outerX = Math.cos(angle) * r;
      const outerY = Math.sin(angle) * r;
      const innerAngle = angle + Math.PI / 5;
      const innerX = Math.cos(innerAngle) * (r * 0.45);
      const innerY = Math.sin(innerAngle) * (r * 0.45);
      if (i === 0) ctx2d.moveTo(outerX, outerY); else ctx2d.lineTo(outerX, outerY);
      ctx2d.lineTo(innerX, innerY);
    }
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  }

  function drawGemShape(cx, cy, r, color, bob) {
    ctx2d.save();
    ctx2d.translate(cx, cy + Math.sin(bob) * 3);
    ctx2d.fillStyle = color;
    ctx2d.shadowColor = color;
    ctx2d.shadowBlur = 10;
    ctx2d.beginPath();
    ctx2d.moveTo(0, -r);
    ctx2d.lineTo(r * 0.8, -r * 0.1);
    ctx2d.lineTo(0, r);
    ctx2d.lineTo(-r * 0.8, -r * 0.1);
    ctx2d.closePath();
    ctx2d.fill();
    ctx2d.restore();
  }

  function drawCollectibles() {
    collectibles.forEach((c) => {
      if (c.type.icon === "gem") drawGemShape(c.x, c.y, c.type.radius, c.type.color, c.phase);
      else drawStarShape(c.x, c.y, c.type.radius, c.type.color, c.phase);
    });
  }

  /* ========================================================================
     13. POWER-UPS
     ======================================================================== */
  const POWERUP_TYPES = [
    { id: "shield", icon: "🛡️", color: "#7cd8ff", duration: 0 },      // instant: absorbs one hit
    { id: "slowmo", icon: "🐢", color: "#a6e3a1", duration: 5 },
    { id: "scoreboost", icon: "⚡", color: "#ffd15c", duration: 6 },
    { id: "magnet", icon: "🧲", color: "#ff8fa3", duration: 6 }
  ];

  function maybeSpawnPowerup(obstacle) {
    if (Math.random() > 0.14) return; // rare
    const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
    powerups.push({
      x: obstacle.x + obstacle.width / 2,
      y: obstacle.gapCenter,
      type,
      phase: Math.random() * Math.PI * 2,
      collected: false
    });
  }

  function updatePowerups(dt, speed) {
    powerups.forEach((p) => { p.x -= speed * dt; p.phase += dt * 3; });
    powerups = powerups.filter((p) => p.x > -30 && !p.collected);
  }

  function drawPowerups() {
    powerups.forEach((p) => {
      ctx2d.save();
      const bobY = p.y + Math.sin(p.phase) * 4;
      ctx2d.translate(p.x, bobY);
      ctx2d.fillStyle = "rgba(255,255,255,0.16)";
      ctx2d.beginPath();
      ctx2d.arc(0, 0, 17, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.strokeStyle = p.type.color;
      ctx2d.lineWidth = 2;
      ctx2d.stroke();
      ctx2d.font = "18px sans-serif";
      ctx2d.textAlign = "center";
      ctx2d.textBaseline = "middle";
      ctx2d.fillText(p.type.icon, 0, 1);
      ctx2d.restore();
    });
  }

  function applyPowerup(type) {
    AudioEngine.powerup();
    switch (type.id) {
      case "shield":
        activeEffects.shield = 1; // boolean-like flag (>0 means active, consumed on hit)
        break;
      case "slowmo":
        activeEffects.slowmo = type.duration;
        break;
      case "scoreboost":
        activeEffects.scoreBoost = type.duration;
        break;
      case "magnet":
        activeEffects.magnet = type.duration;
        break;
    }
    showToast(`${type.icon} ${type.id === "scoreboost" ? "Score Boost" : type.id.charAt(0).toUpperCase() + type.id.slice(1)} activated!`);
  }

  function updateActiveEffects(dt) {
    if (activeEffects.slowmo > 0) activeEffects.slowmo = Math.max(0, activeEffects.slowmo - dt);
    if (activeEffects.scoreBoost > 0) activeEffects.scoreBoost = Math.max(0, activeEffects.scoreBoost - dt);
    if (activeEffects.magnet > 0) activeEffects.magnet = Math.max(0, activeEffects.magnet - dt);
    // shield stays until consumed by a collision (not time based)
  }

  /* ========================================================================
     14. COLLISION DETECTION
     ======================================================================== */
  function circleRectOverlap(cx, cy, r, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX, dy = cy - closestY;
    return (dx * dx + dy * dy) < r * r;
  }

  function checkObstacleCollisions() {
    const r = PLANE_SIZE * 0.30; // slightly forgiving hitbox for fair, polished feel
    for (const o of obstacles) {
      const topHeight = o.gapCenter - o.gap / 2;
      const bottomY = o.gapCenter + o.gap / 2;
      const hitTop = circleRectOverlap(plane.x, plane.y, r, o.x, 0, o.width, topHeight);
      const hitBottom = circleRectOverlap(plane.x, plane.y, r, o.x, bottomY, o.width, H - bottomY);
      if (hitTop || hitBottom) {
        return true;
      }
      // near-miss tracking for "perfect run" style achievement calibration
      if (!o.passed && o.x + o.width < plane.x) {
        const distToEdge = Math.min(Math.abs(plane.y - topHeight), Math.abs(plane.y - bottomY));
        if (distToEdge < 14) hadCloseCall = true;
      }
    }
    // floor / ceiling crash
    if (plane.y > H + PLANE_SIZE) return true;
    return false;
  }

  function checkCollectibleCollisions() {
    const r = PLANE_SIZE * 0.4;
    collectibles.forEach((c) => {
      if (c.collected) return;
      const dist = Math.hypot(plane.x - c.x, plane.y - c.y);
      if (dist < r + c.type.radius) {
        c.collected = true;
        let pts = c.type.points;
        if (activeEffects.scoreBoost > 0) pts *= 2;
        score += pts;
        runStarsCollected++;
        starsTotal++;
        saveJSON(STORAGE_KEYS.starsTotal, starsTotal);
        AudioEngine.star();
        spawnParticles(c.x, c.y, c.type.color, 8);
        if (starsTotal >= 50) grantAchievement("star_collector");
      }
    });
  }

  function checkPowerupCollisions() {
    const r = PLANE_SIZE * 0.4;
    powerups.forEach((p) => {
      if (p.collected) return;
      const dist = Math.hypot(plane.x - p.x, plane.y - p.y);
      if (dist < r + 17) {
        p.collected = true;
        applyPowerup(p.type);
      }
    });
  }

  /* ---- lightweight particle burst for collect feedback ---- */
  function spawnParticles(x, y, color, count) {
    if (settings.quality === "low") return;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 90;
      particles.push({
        x, y, color,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7
      });
    }
  }

  function updateParticles(dt) {
    particles.forEach((p) => {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 300 * dt;
      p.life -= dt;
    });
    particles = particles.filter((p) => p.life > 0);
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx2d.save();
      ctx2d.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx2d.fillStyle = p.color;
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx2d.fill();
      ctx2d.restore();
    });
  }

  /* ========================================================================
     15. DIFFICULTY SCALING
     ======================================================================== */
  function getDifficultyStage() {
    // Smooth staged progression based on distance travelled (in "obstacle units")
    return Math.min(6, Math.floor(distance / 900));
  }

  function getScrollSpeed() {
    const stage = getDifficultyStage();
    let sp = BASE_SCROLL_SPEED + stage * 16;
    if (activeEffects.slowmo > 0) sp *= 0.55;
    return sp;
  }

  function getSpawnDistance() {
    const stage = getDifficultyStage();
    return Math.max(230, BASE_SPAWN_DISTANCE - stage * 12);
  }

  /* ========================================================================
     16. SCORING
     ======================================================================== */
  function addObstaclePassScore(o) {
    if (o.passed) return;
    if (o.x + o.width < plane.x) {
      o.passed = true;
      let pts = 1;
      if (activeEffects.scoreBoost > 0) pts *= 2;
      score += pts;
      AudioEngine.score();
      checkScoreMilestones();
    }
  }

  function checkScoreMilestones() {
    if (score >= 10) grantAchievement("score_10");
    if (score >= 25) grantAchievement("score_25");
    if (score >= 50) grantAchievement("score_50");
    if (score >= 100) grantAchievement("score_100");
  }

  function getMotivationalMessage(finalScore) {
    if (finalScore >= 100) return "Legendary flight! You're a true Sky Ace! 👑";
    if (finalScore >= 50) return "Incredible flying! The skies bow to you. 🏅";
    if (finalScore >= 25) return "Great run! You're really getting the hang of this. 🎯";
    if (finalScore >= 10) return "Nice work! Keep pushing further. 🔟";
    if (finalScore >= 1) return "Good start — try again and beat that score!";
    return "Tap to boost and try to clear your first obstacle!";
  }

  /* ========================================================================
     17. INPUT HANDLING
     ======================================================================== */
  let inputLocked = false; // prevents duplicate flap triggers from multiple event types

  function handlePrimaryInput(e) {
    if (e) e.preventDefault();
    AudioEngine.resume();
    if (state === "playing") {
      flap();
    } else if (state === "menu") {
      // no-op — menu buttons handle their own clicks
    }
  }

  function setupInput() {
    // Keyboard
    window.addEventListener("keydown", (e) => {
      if (e.code === "Space") {
        if (state === "playing") { e.preventDefault(); flap(); }
        else if (state === "paused") { e.preventDefault(); }
      }
      if (e.code === "Escape" && state === "playing") togglePause();
      if ((e.code === "KeyP")) {
        if (state === "playing" || state === "paused") { e.preventDefault(); togglePause(); }
      }
      if (e.code === "KeyR" && state === "gameover") { e.preventDefault(); AudioEngine.click(); restartGame(); }
    });

    // Mouse / pointer on canvas + tap layer (covers mobile taps reliably)
    const targets = [canvas, tapLayer];
    targets.forEach((el) => {
      el.addEventListener("pointerdown", (e) => {
        if (inputLocked) return;
        inputLocked = true;
        handlePrimaryInput(e);
        setTimeout(() => { inputLocked = false; }, 40);
      }, { passive: false });
    });

    // Prevent double-tap zoom / accidental scrolling within game area
    document.getElementById("game-wrapper").addEventListener("touchmove", (e) => {
      if (state === "playing") e.preventDefault();
    }, { passive: false });
  }

  /* ========================================================================
     18. GAME LOOP
     ======================================================================== */
  function loop(timestamp) {
    requestAnimationFrame(loop);
    if (!lastTime) lastTime = timestamp;
    let dt = (timestamp - lastTime) / 1000;
    lastTime = timestamp;
    dt = Math.min(dt, 0.05); // clamp to avoid huge jumps on tab-switch

    // FPS tracking
    if (dt > 0) {
      fpsSamples.push(1 / dt);
      if (fpsSamples.length > 30) fpsSamples.shift();
      fpsDisplay = Math.round(fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length);
    }

    if (state === "playing") {
      dayNightTime += dt;
      updateWeather(dt);
      updateActiveEffects(dt);

      scrollSpeed = getScrollSpeed();
      distance += scrollSpeed * dt;

      updatePlane(dt);
      updateObstacles(dt, scrollSpeed);
      updateCollectibles(dt, scrollSpeed);
      updatePowerups(dt, scrollSpeed);
      updateParticles(dt);

      // spawn obstacles based on distance-driven timer
      spawnTimer -= scrollSpeed * dt;
      if (spawnTimer <= 0) {
        spawnObstacle();
        const newest = obstacles[obstacles.length - 1];
        maybeSpawnCollectible(newest);
        maybeSpawnPowerup(newest);
        spawnTimer = getSpawnDistance();
      }

      // scoring for passed obstacles
      obstacles.forEach(addObstaclePassScore);

      checkCollectibleCollisions();
      checkPowerupCollisions();

      if (checkObstacleCollisions()) {
        handleCollision();
      }

      updateHUD();
    } else if (state === "menu" || state === "paused" || state === "gameover") {
      // keep ambient background alive
      dayNightTime += dt * 0.4;
      updateWeather(dt * 0.4);
      parallaxClouds.forEach((c) => { c.x -= 12 * c.speedFactor * dt; if (c.x < -60) c.x = W + 60; });
    }

    render(dt);
  }

  function handleCollision() {
    if (activeEffects.shield > 0) {
      activeEffects.shield = 0;
      // consume the obstacle that was hit so player doesn't repeatedly collide this frame
      obstacles = obstacles.filter((o) => {
        const topHeight = o.gapCenter - o.gap / 2;
        const bottomY = o.gapCenter + o.gap / 2;
        const r = PLANE_SIZE * 0.30;
        const hitTop = circleRectOverlap(plane.x, plane.y, r, o.x, 0, o.width, topHeight);
        const hitBottom = circleRectOverlap(plane.x, plane.y, r, o.x, bottomY, o.width, H - bottomY);
        return !(hitTop || hitBottom);
      });
      showToast("🛡️ Shield absorbed the hit!");
      return;
    }
    AudioEngine.collision();
    if (settings.vibration && navigator.vibrate) navigator.vibrate([30, 40, 30]);
    shakeTime = 0.25;
    endGame();
  }

  /* ========================================================================
     19. RENDER
     ======================================================================== */
  function render(dt) {
    ctx2d.save();
    if (shakeTime > 0) {
      shakeTime -= dt;
      const mag = 6 * (shakeTime / 0.25);
      ctx2d.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    const cycleT = (dayNightTime % DAY_CYCLE_DURATION) / DAY_CYCLE_DURATION;
    updateAndDrawBackground(dt, cycleT);
    drawWeather();

    if (state === "playing" || state === "paused" || state === "gameover") {
      drawObstacles();
      drawCollectibles();
      drawPowerups();
      drawParticles();
      drawPlane();
    } else if (state === "menu") {
      // idle bobbing plane preview in the background
      plane.wingPhase += dt * 8;
      const bobY = H * 0.42 + Math.sin(dayNightTime * 1.6) * 14;
      const prevY = plane.y, prevX = plane.x, prevRot = plane.rotation;
      plane.y = bobY; plane.x = W * 0.5; plane.rotation = Math.sin(dayNightTime * 1.6) * 0.15;
      drawPlane();
      plane.y = prevY; plane.x = prevX; plane.rotation = prevRot;
    }

    ctx2d.restore();

    if (settings.showFps) {
      const badge = document.getElementById("fps-badge");
      badge.textContent = fpsDisplay + " FPS";
      badge.classList.remove("hidden");
    }
  }

  function updateHUD() {
    document.getElementById("hud-score").textContent = score;
    document.getElementById("hud-best").textContent = best;
  }

  /* ========================================================================
     20. GAME FLOW
     ======================================================================== */
  function resetGame() {
    plane = createPlane();
    plane.x = Math.max(70, W * 0.24);
    plane.y = H / 2;
    plane.vy = 0;
    plane.rotation = 0;

    obstacles = [];
    collectibles = [];
    powerups = [];
    particles = [];
    weatherParticles = [];
    weatherMode = "clear";
    weatherTimer = 4;

    score = 0;
    distance = 0;
    runStarsCollected = 0;
    hadCloseCall = false;
    scrollSpeed = BASE_SCROLL_SPEED;
    spawnTimer = 260; // small head start before first obstacle
    dayNightTime = Math.random() * DAY_CYCLE_DURATION * 0.3; // start near daytime
    activeEffects = { shield: 0, slowmo: 0, scoreBoost: 0, magnet: 0 };
    shakeTime = 0;

    updateHUD();
  }

  function startGame() {
    resetGame();
    state = "playing";
    hideAllScreens();
    hud.classList.remove("hidden");
    tapLayer.classList.remove("hidden");
    AudioEngine.resume();
    AudioEngine.startMusicDrone();
    grantAchievement("first_flight");
  }

  function togglePause() {
    if (state === "playing") {
      state = "paused";
      showScreen("pause");
      tapLayer.classList.add("hidden");
    } else if (state === "paused") {
      state = "playing";
      hideAllScreens();
      tapLayer.classList.remove("hidden");
    }
  }

  function restartGame() {
    resetGame();
    state = "playing";
    hideAllScreens();
    hud.classList.remove("hidden");
    tapLayer.classList.remove("hidden");
  }

  function endGame() {
    state = "gameover";
    hud.classList.add("hidden");
    tapLayer.classList.add("hidden");
    AudioEngine.stopMusicDrone();

    if (score > best) {
      best = score;
      saveJSON(STORAGE_KEYS.best, best);
    }

    if (score >= 20 && !hadCloseCall) grantAchievement("perfect_run");

    const newlyUnlocked = unlockSkinsForScore(best);

    document.getElementById("go-score").textContent = score;
    document.getElementById("go-best").textContent = best;
    document.getElementById("go-message").textContent = getMotivationalMessage(score);

    const unlockEl = document.getElementById("go-unlock");
    if (newlyUnlocked.length) {
      unlockEl.textContent = `✈️ New plane unlocked: ${newlyUnlocked.map((s) => s.name).join(", ")}!`;
      unlockEl.classList.remove("hidden");
    } else {
      unlockEl.classList.add("hidden");
    }

    showScreen("gameover");
  }

  function goToMenu() {
    state = "menu";
    hud.classList.add("hidden");
    tapLayer.classList.add("hidden");
    AudioEngine.stopMusicDrone();
    showScreen("menu");
  }

  /* ========================================================================
     UI WIRING — buttons, toggles, panels
     ======================================================================== */
  function renderHangar() {
    const grid = document.getElementById("skin-grid");
    grid.innerHTML = "";
    SKINS.forEach((skin) => {
      const unlocked = unlockedSkins.includes(skin.id);
      const card = document.createElement("div");
      card.className = "skin-card" + (unlocked ? "" : " locked") + (skin.id === selectedSkinId ? " selected" : "");
      card.innerHTML = `
        ${skin.id === selectedSkinId ? '<span class="skin-badge">EQUIPPED</span>' : ""}
        <span class="skin-emoji">${skin.emoji}</span>
        <span class="skin-name">${skin.name}</span>
        <div class="skin-req">${unlocked ? "Unlocked" : "Score " + skin.unlockScore + "+"}</div>
      `;
      if (unlocked) {
        card.addEventListener("click", () => {
          selectedSkinId = skin.id;
          saveJSON(STORAGE_KEYS.selectedSkin, selectedSkinId);
          AudioEngine.click();
          renderHangar();
        });
      }
      grid.appendChild(card);
    });
  }

  function renderAchievements() {
    const list = document.getElementById("achievements-list");
    list.innerHTML = "";
    ACHIEVEMENT_DEFS.forEach((a) => {
      const unlocked = !!achievements[a.id];
      const item = document.createElement("div");
      item.className = "ach-item" + (unlocked ? " unlocked" : "");
      item.innerHTML = `
        <div class="ach-icon">${unlocked ? a.icon : "🔒"}</div>
        <div>
          <div class="ach-name">${a.name}</div>
          <div class="ach-desc">${a.desc}</div>
        </div>
      `;
      list.appendChild(item);
    });
  }

  function renderSettingsUI() {
    setToggle("toggle-sound", settings.sound);
    setToggle("toggle-music", settings.music);
    setToggle("toggle-vibration", settings.vibration);
    setToggle("toggle-fps", settings.showFps);
    document.querySelectorAll("#segmented-quality button").forEach((b) => {
      b.classList.toggle("active", b.dataset.value === settings.quality);
    });
  }

  function setToggle(id, on) {
    const el = document.getElementById(id);
    el.dataset.on = on ? "true" : "false";
    el.textContent = on ? "ON" : "OFF";
  }

  function wireUI() {
    // Main menu
    document.getElementById("btn-play").addEventListener("click", () => { AudioEngine.click(); startGame(); });
    document.getElementById("btn-howto").addEventListener("click", () => { AudioEngine.click(); showScreen("howto"); });
    document.getElementById("btn-howto-back").addEventListener("click", () => { AudioEngine.click(); showScreen("menu"); });

    document.getElementById("btn-hangar").addEventListener("click", () => { AudioEngine.click(); renderHangar(); showScreen("hangar"); });
    document.getElementById("btn-hangar-back").addEventListener("click", () => { AudioEngine.click(); showScreen("menu"); });

    document.getElementById("btn-achievements").addEventListener("click", () => { AudioEngine.click(); renderAchievements(); showScreen("achievements"); });
    document.getElementById("btn-achievements-back").addEventListener("click", () => { AudioEngine.click(); showScreen("menu"); });

    document.getElementById("btn-settings").addEventListener("click", () => { AudioEngine.click(); renderSettingsUI(); showScreen("settings"); });
    document.getElementById("btn-settings-back").addEventListener("click", () => { AudioEngine.click(); showScreen("menu"); });

    document.getElementById("btn-about").addEventListener("click", () => { AudioEngine.click(); showScreen("about"); });
    document.getElementById("btn-about-back").addEventListener("click", () => { AudioEngine.click(); showScreen("menu"); });

    // Pause
    document.getElementById("pause-btn").addEventListener("click", () => { AudioEngine.click(); togglePause(); });
    document.getElementById("btn-resume").addEventListener("click", () => { AudioEngine.click(); togglePause(); });
    document.getElementById("btn-restart-pause").addEventListener("click", () => { AudioEngine.click(); restartGame(); });
    document.getElementById("btn-menu-pause").addEventListener("click", () => { AudioEngine.click(); goToMenu(); });

    // Game over
    document.getElementById("btn-play-again").addEventListener("click", () => { AudioEngine.click(); restartGame(); });
    document.getElementById("btn-menu-gameover").addEventListener("click", () => { AudioEngine.click(); goToMenu(); });

    // Settings toggles
    ["toggle-sound", "toggle-music", "toggle-vibration", "toggle-fps"].forEach((id) => {
      document.getElementById(id).addEventListener("click", (e) => {
        const key = id === "toggle-sound" ? "sound" : id === "toggle-music" ? "music" : id === "toggle-vibration" ? "vibration" : "showFps";
        settings[key] = !settings[key];
        saveSettings();
        renderSettingsUI();
        if (key === "showFps" && !settings.showFps) document.getElementById("fps-badge").classList.add("hidden");
        if (key === "music") { if (settings.music && state === "playing") AudioEngine.startMusicDrone(); else AudioEngine.stopMusicDrone(); }
        AudioEngine.click();
      });
    });

    document.querySelectorAll("#segmented-quality button").forEach((b) => {
      b.addEventListener("click", () => {
        settings.quality = b.dataset.value;
        saveSettings();
        renderSettingsUI();
        resizeCanvas();
        initParallax();
        AudioEngine.click();
      });
    });

    document.getElementById("btn-reset").addEventListener("click", () => {
      if (confirm("Reset all progress? This clears your best score, unlocked planes, and achievements.")) {
        localStorage.removeItem(STORAGE_KEYS.best);
        localStorage.removeItem(STORAGE_KEYS.skins);
        localStorage.removeItem(STORAGE_KEYS.selectedSkin);
        localStorage.removeItem(STORAGE_KEYS.achievements);
        localStorage.removeItem(STORAGE_KEYS.starsTotal);
        best = 0; unlockedSkins = ["starter"]; selectedSkinId = "starter"; achievements = {}; starsTotal = 0;
        updateHUD();
        AudioEngine.click();
        showToast("Progress reset.");
      }
    });

    // Visibility change — auto pause
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && state === "playing") togglePause();
    });
  }

  /* ========================================================================
     BOOT
     ======================================================================== */
  function boot() {
    resizeCanvas();
    initParallax();
    initWeather();
    plane = createPlane();
    plane.x = 0; plane.y = 0;
    activeEffects = { shield: 0, slowmo: 0, scoreBoost: 0, magnet: 0 };
    obstacles = []; collectibles = []; powerups = []; particles = [];
    dayNightTime = 0;
    score = 0; distance = 0; runStarsCollected = 0;

    document.getElementById("hud-best").textContent = best;
    renderSettingsUI();
    wireUI();
    setupInput();
    showScreen("menu");

    requestAnimationFrame(loop);
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
