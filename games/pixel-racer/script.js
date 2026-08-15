/* ============================================================
   PIXEL RACER — GAME LOGIC
   An Anvora Games title | Created by Arihant
   © 2026 Arihant. All Rights Reserved.
   ------------------------------------------------------------
   Table of contents:
     1. CONFIG & CONSTANTS
     2. STORAGE / SAVE DATA
     3. SOUND (synthesized — no audio files required)
     4. CARS
     5. TRACKS
     6. UPGRADES
     7. MISSIONS
     8. ACHIEVEMENTS
     9. RUNTIME STATE
    10. WORLD (road curve + procedural spawning)
    11. ENTITY FACTORIES
    12. PHYSICS / UPDATE
    13. RENDERING
    14. HUD
    15. SCREEN MANAGEMENT + SCREEN BUILDERS
    16. INPUT (keyboard + touch)
    17. RACE FLOW (countdown / pause / finish / game over)
    18. GAME LOOP
    19. INITIALIZATION
    20. BOOT SEQUENCE (loading screen)
   ============================================================ */

(() => {
  'use strict';

  /* ============================================================
     1. CONFIG & CONSTANTS
  ============================================================ */

  const CONFIG = {
    W: 420, H: 760,               // logical canvas resolution (portrait)
    PLAYER_Y: 620,                 // player's fixed screen Y
    ROAD_WIDTH: 260,
    LANE_WIDTH: 70,
    PLAYER_W: 32, PLAYER_H: 52,
    COUNTDOWN_SECONDS: 3,
    MAX_HEALTH: 100,
    NITRO_MAX: 100,
  };

  const MODES = [
    { id: 'quick', name: 'Quick Race', hint: 'Race to the finish line. Beat your rivals to 1st place.', hasOpponents: true, hasFinish: true, hasTimer: false },
    { id: 'timeTrial', name: 'Time Trial', hint: 'Reach the finish line before time runs out.', hasOpponents: false, hasFinish: true, hasTimer: true },
    { id: 'endless', name: 'Endless', hint: 'No finish line — survive and score as long as you can.', hasOpponents: false, hasFinish: false, hasTimer: false },
    { id: 'trafficRun', name: 'Traffic Run', hint: 'Heavier traffic, no mercy. Rack up the highest score.', hasOpponents: false, hasFinish: false, hasTimer: false },
  ];

  const OPPONENT_PROFILES = [
    { id: 'speedster', name: 'Speedster', speedMult: 1.16, variance: 0.03, color: '#ff4d6d', shape: 'f1' },
    { id: 'aggressive', name: 'Aggressive', speedMult: 1.05, variance: 0.10, color: '#ff9f1c', shape: 'drift' },
    { id: 'balanced', name: 'Balanced', speedMult: 1.00, variance: 0.04, color: '#4ade80', shape: 'sedan' },
    { id: 'defensive', name: 'Defensive', speedMult: 0.92, variance: 0.03, color: '#8891ab', shape: 'truck' },
    { id: 'rookie', name: 'Rookie', speedMult: 0.85, variance: 0.12, color: '#ffd166', shape: 'sedan' },
  ];

  /* ============================================================
     2. STORAGE / SAVE DATA
  ============================================================ */

  const Storage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (err) { /* ignore */ }
    },
  };

  const SAVE_KEY = 'pixelRacer.save';

  function defaultSave() {
    return {
      coins: 0,
      bestScore: 0,
      bestDistanceEndless: 0,
      selectedCar: 'starter',
      selectedTrack: 'neonCity',
      unlockedCars: ['starter'],
      unlockedTracks: ['neonCity'],
      upgrades: { engine: 0, tires: 0, brakes: 0, nitro: 0, armor: 0 },
      achievements: {},
      missionsDate: '',
      missions: [],
      settings: { sound: true, music: true, vibration: true, quality: 'medium' },
      lifetime: {
        coinsCollected: 0, coinsEarnedTotal: 0, driftSeconds: 0, longestDrift: 0,
        nitroUses: 0, racesFinished: 0, racesWon: 0, trafficPassed: 0,
        distance: 0, powerupsCollected: 0, missionsClaimed: 0, topSpeed: 0,
      },
    };
  }

  const Save = {
    data: null,
    load() {
      const loaded = Storage.get(SAVE_KEY, null);
      this.data = loaded ? Object.assign(defaultSave(), loaded) : defaultSave();
      // Deep-merge nested objects so new fields introduced by an update
      // don't get lost when merging over an older save.
      const def = defaultSave();
      this.data.upgrades = Object.assign(def.upgrades, loaded && loaded.upgrades);
      this.data.settings = Object.assign(def.settings, loaded && loaded.settings);
      this.data.lifetime = Object.assign(def.lifetime, loaded && loaded.lifetime);
    },
    persist() { Storage.set(SAVE_KEY, this.data); },
  };

  /* ============================================================
     3. SOUND — everything is synthesized with the Web Audio API,
     so the game needs zero external audio files and can never
     fail to load because of a missing asset. If the browser has
     no Web Audio support (or blocks it before a user gesture),
     every call below is a safe no-op.
  ============================================================ */

  const Sound = {
    ctx: null,
    engine: null, // { osc, filter, gain } — the continuous engine hum, while a race is active

    ensureContext() {
      if (this.ctx) return this.ctx;
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this.ctx = new Ctx();
      } catch (err) { this.ctx = null; }
      return this.ctx;
    },

    // Call on the first user gesture — browsers require this before
    // any audio can actually play.
    unlock() {
      const ctx = this.ensureContext();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },

    tone(freq, duration, type = 'square', volume = 0.12, freqEnd = null) {
      if (!Save.data.settings.sound) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        if (freqEnd !== null) osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + duration + 0.02);
      } catch (err) { /* never let audio break gameplay */ }
    },

    noiseBurst(duration, volume = 0.15, filterFreq = 1200) {
      if (!Save.data.settings.sound) return;
      const ctx = this.ensureContext();
      if (!ctx) return;
      try {
        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = filterFreq;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(volume, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
        src.connect(filter).connect(gain).connect(ctx.destination);
        src.start();
      } catch (err) { /* ignore */ }
    },

    click() { this.tone(520, 0.06, 'square', 0.08); },
    accelBlip() { this.tone(90, 0.08, 'sawtooth', 0.05); },
    coin() { this.tone(880, 0.05, 'square', 0.09, 1400); },
    powerup() { this.tone(440, 0.18, 'triangle', 0.1, 880); },
    nitro() { this.tone(200, 0.3, 'sawtooth', 0.1, 700); },
    drift() { this.noiseBurst(0.12, 0.06, 700); },
    collision() { this.noiseBurst(0.25, 0.18, 500); this.tone(90, 0.2, 'square', 0.1); },
    countdownBeep(isGo) { this.tone(isGo ? 700 : 440, isGo ? 0.3 : 0.12, 'square', 0.12); },
    finish() { this.tone(523, 0.12, 'square', 0.1, 784); },
    achievement() { this.tone(660, 0.1, 'triangle', 0.1, 990); },

    // A full music bed was deliberately skipped in favor of short,
    // punchy SFX above — that keeps CPU/battery use minimal on
    // low-end phones. Instead, the "Music" setting gates a single
    // continuous, near-zero-cost engine oscillator: one osc + one
    // filter + one gain node, reused for the whole race (never
    // recreated per frame), with its pitch/tone riding the car's
    // speed. This is what actually changes when Nitro kicks in.

    startEngine() {
      if (!Save.data.settings.music) return;
      const ctx = this.ensureContext();
      if (!ctx || this.engine) return;
      try {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(60, ctx.currentTime);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(300, ctx.currentTime);
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, ctx.currentTime);
        osc.connect(filter).connect(gain).connect(ctx.destination);
        osc.start();
        gain.gain.setTargetAtTime(0.032, ctx.currentTime, 0.25);
        this.engine = { osc, filter, gain };
      } catch (err) { this.engine = null; }
    },

    // speedRatio: 0..~1.3 (can exceed 1 briefly under Nitro).
    // setTargetAtTime smooths every change, so this is safe to call
    // once per frame — it schedules a ramp, it doesn't do any
    // heavy work itself.
    setEngineIntensity(speedRatio, boosted) {
      if (!this.engine || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const r = clamp(speedRatio, 0, 1.3);
        this.engine.osc.frequency.setTargetAtTime(60 + r * 150, now, 0.08);
        this.engine.filter.frequency.setTargetAtTime(280 + r * 1100, now, 0.08);
        this.engine.gain.gain.setTargetAtTime(boosted ? 0.05 : 0.032, now, 0.15);
      } catch (err) { /* ignore */ }
    },

    stopEngine() {
      if (!this.engine) return;
      try {
        const ctx = this.ctx;
        const { osc, gain } = this.engine;
        gain.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
        osc.stop(ctx.currentTime + 0.3);
      } catch (err) { /* ignore */ }
      this.engine = null;
    },
  };

  /* ============================================================
     4. CARS — 5 unlockable cars, each with 5 stats (0-100).
     A single generic pixel-art drawing function (see RENDERING)
     is reused for every car, parameterized by these colors.
  ============================================================ */

  const CARS = [
    { id: 'starter', name: 'Starter', cost: 0, bonusHealth: 0, shape: 'sedan',
      color: '#c7cbe0', accent: '#7f8ab0',
      stats: { speed: 50, accel: 50, handling: 60, drift: 40, nitro: 40 } },
    { id: 'speed', name: 'Speed', cost: 500, bonusHealth: 0, shape: 'f1',
      color: '#ff4d6d', accent: '#ffd166',
      stats: { speed: 90, accel: 80, handling: 45, drift: 40, nitro: 55 } },
    { id: 'drift', name: 'Drift', cost: 800, bonusHealth: 0, shape: 'drift',
      color: '#00c2ff', accent: '#00f0ff',
      stats: { speed: 60, accel: 55, handling: 75, drift: 90, nitro: 50 } },
    { id: 'heavy', name: 'Heavy', cost: 1200, bonusHealth: 25, shape: 'truck',
      color: '#2f7a4a', accent: '#123b23',
      stats: { speed: 55, accel: 70, handling: 40, drift: 35, nitro: 45 } },
    { id: 'super', name: 'Super', cost: 2000, bonusHealth: 10, shape: 'super',
      color: '#ffd166', accent: '#ff2fd0',
      stats: { speed: 95, accel: 90, handling: 80, drift: 75, nitro: 85 } },
  ];

  function getCar(id) { return CARS.find((c) => c.id === id) || CARS[0]; }

  /* ============================================================
     5. TRACKS — 4 tracks, each with its own palette, curve
     character and finish distance.
  ============================================================ */

  const TRACKS = [
    { id: 'neonCity', name: 'Neon City', cost: 0, difficulty: 1,
      finishDistance: 3500, timeLimit: 75,
      curveFreq: 0.0026, curveAmp: 70,
      colors: { grass: '#170a26', road: '#241a3a', line: '#00f0ff', deco1: '#ff2fd0', deco2: '#00f0ff', sky: '#0d0620' },
      scenery: 'city' },
    { id: 'desertHighway', name: 'Desert Highway', cost: 400, difficulty: 2,
      finishDistance: 4000, timeLimit: 85,
      curveFreq: 0.0014, curveAmp: 100,
      colors: { grass: '#4a3520', road: '#5a4630', line: '#ffe9b0', deco1: '#8a6b3f', deco2: '#2e7d32', sky: '#3a2415' },
      scenery: 'desert' },
    { id: 'forestRoad', name: 'Forest Road', cost: 800, difficulty: 3,
      finishDistance: 4200, timeLimit: 90,
      curveFreq: 0.0022, curveAmp: 85,
      colors: { grass: '#123018', road: '#2b2620', line: '#e8e8d0', deco1: '#1d4d2b', deco2: '#0e2916', sky: '#0a1a10' },
      scenery: 'forest' },
    { id: 'nightCircuit', name: 'Night Circuit', cost: 1400, difficulty: 4,
      finishDistance: 4500, timeLimit: 95,
      curveFreq: 0.0032, curveAmp: 90,
      colors: { grass: '#050810', road: '#181c28', line: '#ffd166', deco1: '#ffd166', deco2: '#00f0ff', sky: '#02030a' },
      scenery: 'night' },
  ];

  function getTrack(id) { return TRACKS.find((t) => t.id === id) || TRACKS[0]; }

  /* ============================================================
     6. UPGRADES — 5 categories, 5 levels each. Each level adds a
     flat percentage bonus applied on top of the active car's
     base stats (see effectiveStats()).
  ============================================================ */

  const UPGRADE_DEFS = [
    { id: 'engine', name: 'Engine', desc: 'Acceleration & top speed', perLevel: 0.04, baseCost: 150 },
    { id: 'tires', name: 'Tires', desc: 'Handling & grip', perLevel: 0.04, baseCost: 150 },
    { id: 'brakes', name: 'Brakes', desc: 'Braking power', perLevel: 0.05, baseCost: 140 },
    { id: 'nitro', name: 'Nitro', desc: 'Nitro capacity & regen', perLevel: 0.05, baseCost: 180 },
    { id: 'armor', name: 'Armor', desc: 'Max health & collision resistance', perLevel: 0.06, baseCost: 200 },
  ];
  const UPGRADE_MAX_LEVEL = 5;

  function upgradeCost(def, currentLevel) {
    return Math.round(def.baseCost * (currentLevel + 1));
  }

  // Combines the active car's base stats with all current upgrade
  // levels into the numbers actually used by the physics step.
  function effectiveStats() {
    const car = getCar(Save.data.selectedCar);
    const u = Save.data.upgrades;
    const engineBoost = 1 + u.engine * UPGRADE_DEFS[0].perLevel;
    const tireBoost = 1 + u.tires * UPGRADE_DEFS[1].perLevel;
    const brakeBoost = 1 + u.brakes * UPGRADE_DEFS[2].perLevel;
    const nitroBoost = 1 + u.nitro * UPGRADE_DEFS[3].perLevel;
    const armorBoost = u.armor * UPGRADE_DEFS[4].perLevel; // used as damage reduction, not a multiplier
    return {
      car,
      maxSpeed: 200 + (car.stats.speed / 100) * 220 * engineBoost,
      accel: (260 + (car.stats.accel / 100) * 260) * engineBoost,
      brakeDecel: (260 + (car.stats.accel / 100) * 260) * 1.6 * brakeBoost,
      turnRate: (190 + (car.stats.handling / 100) * 160) * tireBoost,
      driftFactor: car.stats.drift / 100,
      nitroCapMult: nitroBoost,
      nitroBoostFactor: 0.35 + (car.stats.nitro / 100) * 0.35,
      nitroDrainDivisor: nitroBoost,
      maxHealth: CONFIG.MAX_HEALTH + car.bonusHealth,
      damageReduction: Math.min(0.5, armorBoost),
    };
  }

  /* ============================================================
     7. MISSIONS — a pool of possible missions; 4 are picked at
     random each real-world day (tracked via a stored date string,
     so this works fully offline with no server).
  ============================================================ */

  const MISSION_POOL = [
    { type: 'coinsCollected', target: 50, name: 'Collect 50 coins', reward: 80 },
    { type: 'driftSeconds', target: 10, name: 'Drift for 10 seconds total', reward: 90 },
    { type: 'nitroUses', target: 5, name: 'Use Nitro 5 times', reward: 70 },
    { type: 'racesFinished', target: 3, name: 'Finish 3 races', reward: 100 },
    { type: 'racesWon', target: 1, name: 'Win a race', reward: 120 },
    { type: 'trafficPassed', target: 20, name: 'Avoid 20 traffic cars', reward: 90 },
    { type: 'distance', target: 2000, name: 'Travel 2000m total', reward: 80 },
    { type: 'powerupsCollected', target: 3, name: 'Collect 3 power-ups', reward: 60 },
  ];

  function todayString() {
    return new Date().toDateString();
  }

  function ensureDailyMissions() {
    if (Save.data.missionsDate === todayString() && Save.data.missions.length > 0) return;
    const pool = MISSION_POOL.slice();
    const picked = [];
    for (let i = 0; i < 4 && pool.length > 0; i += 1) {
      const idx = Math.floor(Math.random() * pool.length);
      const def = pool.splice(idx, 1)[0];
      picked.push({
        type: def.type, target: def.target, name: def.name, reward: def.reward,
        base: Save.data.lifetime[def.type] || 0, claimed: false,
      });
    }
    Save.data.missionsDate = todayString();
    Save.data.missions = picked;
    Save.persist();
  }

  function missionProgress(mission) {
    const current = Save.data.lifetime[mission.type] || 0;
    return Math.max(0, Math.min(mission.target, current - mission.base));
  }

  /* ============================================================
     8. ACHIEVEMENTS
  ============================================================ */

  const ACHIEVEMENT_DEFS = [
    { id: 'first_race', icon: '🏁', name: 'First Race', desc: 'Complete your first race.', check: () => Save.data.lifetime.racesFinished >= 1 },
    { id: 'speed_demon', icon: '💨', name: 'Speed Demon', desc: 'Reach maximum speed.', check: () => Save.data.lifetime.topSpeed >= 260 },
    { id: 'drift_king', icon: '🌀', name: 'Drift King', desc: 'Perform a 5-second drift.', check: () => Save.data.lifetime.longestDrift >= 5 },
    { id: 'coin_collector', icon: '🪙', name: 'Coin Collector', desc: 'Collect 100 coins.', check: () => Save.data.lifetime.coinsCollected >= 100 },
    { id: 'nitro_master', icon: '🔥', name: 'Nitro Master', desc: 'Use Nitro 25 times.', check: () => Save.data.lifetime.nitroUses >= 25 },
    { id: 'champion', icon: '👑', name: 'Champion', desc: 'Win 10 races.', check: () => Save.data.lifetime.racesWon >= 10 },
    { id: 'full_garage', icon: '🚗', name: 'Full Garage', desc: 'Unlock every car.', check: () => Save.data.unlockedCars.length >= CARS.length },
    { id: 'world_tour', icon: '🗺️', name: 'World Tour', desc: 'Unlock every track.', check: () => Save.data.unlockedTracks.length >= TRACKS.length },
    { id: 'mission_master', icon: '📋', name: 'Mission Master', desc: 'Claim 10 missions.', check: () => Save.data.lifetime.missionsClaimed >= 10 },
    { id: 'survivor', icon: '⏳', name: 'Survivor', desc: 'Reach 5000m in a single Endless run.', check: () => Save.data.bestDistanceEndless >= 5000 },
    { id: 'flawless', icon: '✨', name: 'Flawless', desc: 'Finish a race without taking damage.', check: () => RunFlags.everFlawless },
    { id: 'wealthy', icon: '💰', name: 'Wealthy', desc: 'Earn 5000 coins lifetime.', check: () => Save.data.lifetime.coinsEarnedTotal >= 5000 },
  ];

  // A couple of achievement conditions need a small persisted flag
  // rather than a counter — kept separate from Save.data.lifetime
  // for clarity, but still saved.
  const RunFlags = { everFlawless: false };

  const Achievements = {
    checkAll() {
      let unlockedNew = false;
      ACHIEVEMENT_DEFS.forEach((def) => {
        if (Save.data.achievements[def.id]) return;
        if (def.check()) {
          Save.data.achievements[def.id] = true;
          unlockedNew = true;
          UI.showAchievementToast(def);
          Sound.achievement();
        }
      });
      if (unlockedNew) Save.persist();
    },
  };

  /* ============================================================
     9. RUNTIME STATE — everything that only exists during a race.
  ============================================================ */

  const State = {
    screen: 'start',
    mode: MODES[0],
    track: TRACKS[0],
    stats: null,          // effectiveStats() snapshot for the active run

    camera: { distance: 0 },
    player: null,
    traffic: [],
    opponents: [],
    coins: [],
    powerups: [],
    hazards: [],
    particles: [],
    scenery: [],

    nextTrafficY: 0,
    nextPickupY: 0,
    nextHazardY: 0,
    nextSceneryY: 0,

    score: 0,
    coinsThisRun: 0,
    driftScore: 0,
    driftTimer: 0,
    overtakes: 0,
    elapsedMs: 0,
    timeLeftMs: 0,
    finishOrder: [],
    raceFinished: false,
    tookDamageThisRace: false,

    activeEffects: {},    // { powerUpId: expiryMs }
    slowMoActive: false,
    shieldActive: false,
    magnetActive: false,

    shakeAmount: 0,
    flashAlpha: 0,
    invulnUntil: 0,
  };

  /* ============================================================
     10. WORLD — the road's lateral curve, and just-in-time
     procedural spawning of everything placed along it.
  ============================================================ */

  // Lateral offset (px) of the road's centerline at a given world Y.
  function roadCenterX(worldY) {
    const t = State.track;
    return CONFIG.W / 2 + Math.sin(worldY * t.curveFreq + t._seed) * t.curveAmp;
  }

  function difficultyScalar() {
    return 1 + Math.min(1.5, State.camera.distance / 5000);
  }

  function spawnTrafficIfNeeded() {
    const diff = difficultyScalar();
    const heavy = State.mode.id === 'trafficRun';
    const baseGap = (heavy ? 230 : 340) / diff;
    while (State.nextTrafficY < State.camera.distance + CONFIG.H * 2.2) {
      const lane = Math.floor(Math.random() * 3) - 1;
      const variant = TRAFFIC_VARIANTS[Math.floor(Math.random() * TRAFFIC_VARIANTS.length)];
      State.traffic.push({
        worldY: State.nextTrafficY, lane, laneTarget: lane,
        speed: (70 + Math.random() * 50) * (heavy ? 1.15 : 1),
        w: variant.w, h: variant.h, color: variant.color,
        laneChangeAt: State.nextTrafficY + 500 + Math.random() * 800,
        passed: false, hit: false,
      });
      State.nextTrafficY += baseGap * (0.7 + Math.random() * 0.6);
    }
  }

  function spawnPickupsIfNeeded() {
    while (State.nextPickupY < State.camera.distance + CONFIG.H * 2.2) {
      const lane = Math.floor(Math.random() * 3) - 1;
      const isPowerUp = Math.random() < 0.22;
      if (isPowerUp) {
        const def = POWERUP_DEFS[Math.floor(Math.random() * POWERUP_DEFS.length)];
        State.powerups.push({ worldY: State.nextPickupY, lane, id: def.id, taken: false });
      } else {
        State.coins.push({ worldY: State.nextPickupY, lane, taken: false });
      }
      State.nextPickupY += 160 + Math.random() * 140;
    }
  }

  function spawnHazardsIfNeeded() {
    while (State.nextHazardY < State.camera.distance + CONFIG.H * 2.2) {
      const lane = Math.floor(Math.random() * 3) - 1;
      const kind = Math.random() < 0.5 ? 'rock' : 'barrel';
      State.hazards.push({ worldY: State.nextHazardY, lane, kind, hit: false });
      State.nextHazardY += 700 + Math.random() * 700;
    }
  }

  function sceneryDefsFor(theme) {
    return SCENERY_THEMES[theme] || SCENERY_THEMES.city;
  }

  function spawnSceneryIfNeeded() {
    const defs = sceneryDefsFor(State.track.scenery);
    while (State.nextSceneryY < State.camera.distance + CONFIG.H * 2.2) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const kind = defs[Math.floor(Math.random() * defs.length)];
      const lateral = (CONFIG.ROAD_WIDTH / 2 + 20 + Math.random() * 60) * side;
      State.scenery.push({ worldY: State.nextSceneryY, lateral, kind, side });
      State.nextSceneryY += 90 + Math.random() * 90;
    }
  }

  // Removes anything far enough behind the player that it can no
  // longer be seen, so the arrays never grow without bound. This
  // is the main defense against memory growth over a long session.
  function pruneOffscreen() {
    const cutoff = State.camera.distance - 140;
    State.traffic = State.traffic.filter((o) => o.worldY > cutoff);
    State.coins = State.coins.filter((o) => o.worldY > cutoff && !o.taken);
    State.powerups = State.powerups.filter((o) => o.worldY > cutoff && !o.taken);
    State.hazards = State.hazards.filter((o) => o.worldY > cutoff);
    State.scenery = State.scenery.filter((o) => o.worldY > cutoff - 60);
    State.opponents.forEach(() => {}); // opponents persist for the whole race
  }

  const TRAFFIC_VARIANTS = [
    { w: 30, h: 46, color: '#3b6ea5', shape: 'sedan' },
    { w: 30, h: 46, color: '#a53b3b', shape: 'sedan' },
    { w: 34, h: 60, color: '#8a8a8a', shape: 'van' },
    { w: 30, h: 46, color: '#c9a227', shape: 'sedan' },
    { w: 30, h: 46, color: '#5a9e6f', shape: 'sedan' },
  ];

  // Roadside decoration "kinds" per track theme — purely cosmetic,
  // drawn as simple pixel shapes (see RENDERING).
  const SCENERY_THEMES = {
    city: ['building', 'building', 'sign', 'lamp'],
    desert: ['cactus', 'dune', 'sign'],
    forest: ['tree', 'tree', 'tree', 'rock'],
    night: ['lamp', 'building', 'lamp', 'sign'],
  };

  /* ============================================================
     11. ENTITY FACTORIES — power-ups + particle helpers
  ============================================================ */

  const POWERUP_DEFS = [
    { id: 'nitro', name: 'Nitro', icon: '⚡', color: '#ff2fd0', duration: 0 },
    { id: 'shield', name: 'Shield', icon: '🛡️', color: '#00f0ff', duration: 10000 },
    { id: 'magnet', name: 'Magnet', icon: '🧲', color: '#ffd166', duration: 8000 },
    { id: 'slowmo', name: 'Slow-Mo', icon: '⏱️', color: '#4ade80', duration: 6000 },
    { id: 'repair', name: 'Repair', icon: '🔧', color: '#ff4d6d', duration: 0 },
  ];

  function getPowerUpDef(id) { return POWERUP_DEFS.find((p) => p.id === id); }

  function spawnParticles(worldY, lane, colorHex, count, spreadSpeed) {
    if (Save.data.settings.quality === 'low' && count > 6) count = 6;
    const x = roadCenterX(worldY) + lane * CONFIG.LANE_WIDTH;
    const y = CONFIG.PLAYER_Y - (worldY - State.camera.distance);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = spreadSpeed * (0.4 + Math.random() * 0.6);
      State.particles.push({
        x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 40,
        life: 1, color: colorHex, size: 2 + Math.random() * 2.5,
      });
    }
  }

  function spawnFloatingText(worldY, lane, text, colorHex) {
    const layer = document.getElementById('popup-layer');
    const stage = document.getElementById('stage');
    if (!layer || !stage) return;
    const scale = stage.clientWidth / CONFIG.W;
    const x = roadCenterX(worldY) + lane * CONFIG.LANE_WIDTH;
    const y = CONFIG.PLAYER_Y - (worldY - State.camera.distance);
    const el = document.createElement('div');
    el.className = 'score-popup';
    el.textContent = text;
    el.style.left = `${x * scale}px`;
    el.style.top = `${y * scale}px`;
    if (colorHex) { el.style.color = colorHex; el.style.textShadow = `0 0 10px ${colorHex}`; }
    layer.appendChild(el);
    setTimeout(() => el.remove(), 850);
  }

  /* ============================================================
     12. PHYSICS / UPDATE
  ============================================================ */

  const Input = {
    left: false, right: false, accel: false, brake: false, nitro: false, drift: false,
  };

  function isPowerUpActive(id) {
    return !!State.activeEffects[id] && State.activeEffects[id] > performance.now();
  }

  function activatePowerUp(id, worldY, lane) {
    const def = getPowerUpDef(id);
    if (!def) return;
    if (id === 'nitro') {
      State.player.nitro = Math.min(CONFIG.NITRO_MAX * State.stats.nitroCapMult, State.player.nitro + 60);
    } else if (id === 'repair') {
      State.player.health = Math.min(State.stats.maxHealth, State.player.health + 40);
    } else {
      State.activeEffects[id] = performance.now() + def.duration;
    }
    Save.data.lifetime.powerupsCollected += 1;
    UI.setPowerUpAura(def.color);
    spawnFloatingText(worldY, lane, `${def.icon} ${def.name}`, def.color);
    spawnParticles(worldY, lane, def.color, 12, 90);
    Sound.powerup();
    UI.renderPowerUpStrip();
  }

  function updateActiveEffects() {
    const now = performance.now();
    let anyLeft = false;
    Object.keys(State.activeEffects).forEach((id) => {
      if (State.activeEffects[id] <= now) delete State.activeEffects[id];
      else anyLeft = true;
    });
    if (!anyLeft) UI.clearPowerUpAura();
  }

  function updatePlayer(dt) {
    const p = State.player;
    const s = State.stats;

    // --- Forward speed ---
    const nitroActive = Input.nitro && p.nitro > 1 && !p.crashed;
    let targetAccel = 0;
    if (Input.accel) targetAccel = s.accel;
    else if (Input.brake) targetAccel = -s.brakeDecel;
    else targetAccel = -s.accel * 0.35; // coasting friction

    const maxSpeed = nitroActive ? s.maxSpeed * (1 + s.nitroBoostFactor) : s.maxSpeed;
    p.speed += targetAccel * dt;
    if (Input.brake && p.speed > 0) p.speed = Math.max(0, p.speed - s.brakeDecel * dt);
    if (Input.brake && p.speed <= 0) p.speed = Math.max(-maxSpeed * 0.35, p.speed - s.accel * 0.6 * dt);
    p.speed = clamp(p.speed, -maxSpeed * 0.35, maxSpeed);
    if (!Input.brake && p.speed < 0) p.speed = Math.min(0, p.speed + s.accel * 0.5 * dt);

    if (nitroActive) {
      p.nitro = Math.max(0, p.nitro - (34 / s.nitroDrainDivisor) * dt);
      if (!p.nitroSoundedThisPress) { Sound.nitro(); p.nitroSoundedThisPress = true; Save.data.lifetime.nitroUses += 1; }
    } else {
      p.nitroSoundedThisPress = false;
      p.nitro = Math.min(CONFIG.NITRO_MAX * s.nitroCapMult, p.nitro + 6 * dt);
    }

    // --- Steering + drift ---
    const turnDir = (Input.left ? -1 : 0) + (Input.right ? 1 : 0);
    const speedFactor = clamp(1 - (Math.abs(p.speed) / s.maxSpeed) * 0.35, 0.55, 1);
    const wantsDrift = Input.drift && turnDir !== 0 && p.speed > s.maxSpeed * 0.28;

    if (wantsDrift) {
      p.slip = clamp(p.slip + turnDir * s.turnRate * 2.1 * dt, -(80 + s.driftFactor * 260), 80 + s.driftFactor * 260);
      p.x += p.slip * dt;
      p.x += turnDir * s.turnRate * 0.35 * speedFactor * dt;
      State.driftTimer += dt;
      if (!p.driftSoundCooldown || p.driftSoundCooldown <= 0) { Sound.drift(); p.driftSoundCooldown = 0.18; }
      p.driftSoundCooldown -= dt;
      spawnParticles(p.worldY - 14, p.lane, '#c9c9c9', 1, 20);
    } else {
      p.x += turnDir * s.turnRate * speedFactor * dt;
      p.slip *= Math.max(0, 1 - 5.5 * dt);
      p.x += p.slip * dt;
      if (State.driftTimer > 0.4) {
        const gain = Math.round(State.driftTimer * 40 * (0.6 + speedFactor));
        State.driftScore += gain;
        State.score += gain;
        Save.data.lifetime.driftSeconds += State.driftTimer;
        Save.data.lifetime.longestDrift = Math.max(Save.data.lifetime.longestDrift, State.driftTimer);
        spawnFloatingText(p.worldY, p.lane, `+${gain} Drift!`, '#00f0ff');
      }
      State.driftTimer = 0;
    }

    // --- Off-road handling ---
    const center = roadCenterX(p.worldY);
    const halfRoad = CONFIG.ROAD_WIDTH / 2;
    const offRoad = Math.abs(p.x - center) > halfRoad - CONFIG.PLAYER_W / 2;
    if (offRoad) {
      p.speed *= Math.max(0.9, 1 - 1.4 * dt);
      p.offRoadTimer = (p.offRoadTimer || 0) + dt;
      if (p.offRoadTimer > 1) { damagePlayer(3, false); p.offRoadTimer = 0; }
    } else {
      p.offRoadTimer = 0;
    }
    p.x = clamp(p.x, center - halfRoad - 26, center + halfRoad + 26);

    // --- Advance world position ---
    p.worldY += p.speed * dt;
    p.lane = (p.x - center) / CONFIG.LANE_WIDTH;
    State.camera.distance = p.worldY;

    Save.data.lifetime.topSpeed = Math.max(Save.data.lifetime.topSpeed, p.speed);
    Save.data.lifetime.distance = Save.data.lifetime.distance + p.speed * dt;

    // Nitro speed-line particles (purely decorative, canvas-only).
    if (nitroActive && Math.random() < 0.6) {
      spawnParticles(p.worldY - 30, p.lane, '#00f0ff', 1, 140);
    }

    // Engine pitch/tone rides along with speed — this is the part
    // of "engine sound changes" that responds to Nitro in real time.
    Sound.setEngineIntensity(Math.abs(p.speed) / s.maxSpeed, nitroActive);
  }

  function damagePlayer(amount, fromCollision) {
    if (performance.now() < State.invulnUntil) return;
    if (isPowerUpActive('shield')) {
      State.activeEffects.shield = 0;
      UI.clearPowerUpAura();
      State.invulnUntil = performance.now() + 600;
      spawnParticles(State.player.worldY, State.player.lane, '#00f0ff', 14, 100);
      return;
    }
    const reduced = amount * (1 - State.stats.damageReduction);
    State.player.health = Math.max(0, State.player.health - reduced);
    State.tookDamageThisRace = true;
    if (fromCollision) {
      State.invulnUntil = performance.now() + 500;
      State.shakeAmount = 8;
      State.flashAlpha = 0.35;
      Sound.collision();
      if (Save.data.settings.vibration && navigator.vibrate) { try { navigator.vibrate(60); } catch (err) { /* ignore */ } }
      spawnParticles(State.player.worldY, State.player.lane, '#ffb14e', 14, 130);
    }
  }

  function circlesOverlap(ax, ay, ar, bx, by, br) {
    const dx = ax - bx; const dy = ay - by;
    const rad = ar + br;
    return dx * dx + dy * dy < rad * rad;
  }

  function updateCollisions() {
    const p = State.player;
    const px = p.x; const py = CONFIG.PLAYER_Y;
    const pr = CONFIG.PLAYER_W * 0.4;

    State.traffic.forEach((car) => {
      const relY = p.worldY - car.worldY;
      if (Math.abs(relY) > 60) { if (relY > 40 && !car.passed && !car.hit) { car.passed = true; Save.data.lifetime.trafficPassed += 1; } return; }
      const cx = roadCenterX(car.worldY) + car.lane * CONFIG.LANE_WIDTH;
      const cy = CONFIG.PLAYER_Y + relY;
      if (!car.hit && circlesOverlap(px, py, pr, cx, cy, car.w * 0.4)) {
        car.hit = true;
        damagePlayer(18, true);
        p.speed *= 0.6;
      }
    });

    State.hazards.forEach((hz) => {
      const relY = p.worldY - hz.worldY;
      if (Math.abs(relY) > 50) return;
      const cx = roadCenterX(hz.worldY) + hz.lane * CONFIG.LANE_WIDTH;
      const cy = CONFIG.PLAYER_Y + relY;
      if (!hz.hit && circlesOverlap(px, py, pr, cx, cy, 16)) {
        hz.hit = true;
        damagePlayer(14, true);
        p.speed *= 0.7;
      }
    });

    State.opponents.forEach((op) => {
      const relY = p.worldY - op.worldY;
      if (Math.abs(relY) > 50) return;
      const cx = roadCenterX(op.worldY) + op.lane * CONFIG.LANE_WIDTH;
      const cy = CONFIG.PLAYER_Y + relY;
      if (circlesOverlap(px, py, pr, cx, cy, CONFIG.PLAYER_W * 0.4) && performance.now() > State.invulnUntil) {
        damagePlayer(20, true);
        p.speed *= 0.65;
      }
    });

    // Coins / power-ups — magnet pulls nearby coins toward the player.
    const magnetOn = isPowerUpActive('magnet');
    State.coins.forEach((coin) => {
      if (coin.taken) return;
      const relY = p.worldY - coin.worldY;
      const cx = roadCenterX(coin.worldY) + coin.lane * CONFIG.LANE_WIDTH;
      if (magnetOn && Math.abs(relY) < 160 && Math.abs(cx - px) < 160) {
        coin.lane += (px - cx) * 0.0009 * 60; // gently drift toward player's lane
      }
      if (Math.abs(relY) > 40) return;
      const cy = CONFIG.PLAYER_Y + relY;
      if (circlesOverlap(px, py, pr, cx, cy, 12)) {
        coin.taken = true;
        State.coinsThisRun += 1;
        Save.data.coins += 1;
        Save.data.lifetime.coinsCollected += 1;
        Save.data.lifetime.coinsEarnedTotal += 1;
        State.score += 10;
        // Not persisted here on purpose — localStorage writes are
        // synchronous and this runs inside the hot per-frame collision
        // loop, so writing on every single coin (e.g. several per
        // second under Magnet) would risk hitching low-end phones.
        // Coins are flushed to disk on pause/finish/game-over below,
        // plus a beforeunload safety net (see INITIALIZATION) covers
        // an abrupt tab close mid-race.
        spawnFloatingText(coin.worldY, coin.lane, '+1', '#ffd166');
        spawnParticles(coin.worldY, coin.lane, '#ffd166', 6, 70);
        Sound.coin();
      }
    });

    State.powerups.forEach((pu) => {
      if (pu.taken) return;
      const relY = p.worldY - pu.worldY;
      if (Math.abs(relY) > 40) return;
      const cx = roadCenterX(pu.worldY) + pu.lane * CONFIG.LANE_WIDTH;
      const cy = CONFIG.PLAYER_Y + relY;
      if (circlesOverlap(px, py, pr, cx, cy, 14)) {
        pu.taken = true;
        activatePowerUp(pu.id, pu.worldY, pu.lane);
      }
    });
  }

  function updateTraffic(dt) {
    const slow = isPowerUpActive('slowmo') ? 0.55 : 1;
    State.traffic.forEach((car) => {
      car.worldY += car.speed * slow * dt;
      if (car.worldY > car.laneChangeAt) {
        car.laneTarget = Math.floor(Math.random() * 3) - 1;
        car.laneChangeAt = car.worldY + 500 + Math.random() * 900;
      }
      car.lane += clamp(car.laneTarget - car.lane, -1, 1) * Math.min(1, dt * 1.2);
    });
  }

  function updateOpponents(dt) {
    const slow = isPowerUpActive('slowmo') ? 0.6 : 1;
    State.opponents.forEach((op) => {
      let mult = op.profile.speedMult;
      const gap = op.worldY - State.player.worldY;
      if (gap < -300) mult *= 1.16;
      else if (gap > 300) mult *= 0.9;
      mult *= 1 + (Math.random() - 0.5) * op.profile.variance;
      const targetSpeed = State.stats.maxSpeed * 0.82 * mult;
      op.speed += (targetSpeed - op.speed) * Math.min(1, dt * 1.5);
      const wasAhead = op.worldY > State.player.worldY;
      op.worldY += op.speed * slow * dt;
      const isAhead = op.worldY > State.player.worldY;
      if (wasAhead && !isAhead) { State.overtakes += 1; State.score += 50; spawnFloatingText(State.player.worldY, State.player.lane, '+50 Overtake!', '#4ade80'); }

      if (op.worldY > op.laneChangeAt) {
        op.laneTarget = clamp(op.laneTarget + (Math.random() < 0.5 ? -1 : 1), -1, 1);
        op.laneChangeAt = op.worldY + 700 + Math.random() * 900;
      }
      op.lane += clamp(op.laneTarget - op.lane, -1, 1) * Math.min(1, dt * 1.1);

      if (State.mode.hasFinish && !State.finishOrder.includes(op.id) && op.worldY >= State.track.finishDistance) {
        State.finishOrder.push(op.id);
      }
    });
  }

  function updateParticles(dt) {
    State.particles.forEach((pt) => {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= (1 - 2 * dt); pt.vy += 60 * dt;
      pt.life -= dt * 1.6;
    });
    State.particles = State.particles.filter((pt) => pt.life > 0);
  }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ============================================================
     13. RENDERING
  ============================================================ */

  const Renderer = {
    canvas: null, ctx: null,

    init() {
      this.canvas = document.getElementById('race-canvas');
      this.ctx = this.canvas.getContext('2d');
      this.applyDPR();
      window.addEventListener('resize', () => this.applyDPR());
    },

    applyDPR() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = CONFIG.W * dpr;
      this.canvas.height = CONFIG.H * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.imageSmoothingEnabled = false; // crisp pixel-art edges
    },

    screenY(worldY) { return CONFIG.PLAYER_Y + State.camera.distance - worldY; },

    renderFrame() {
      const ctx = this.ctx;
      const track = State.track;

      ctx.save();
      if (State.shakeAmount > 0.1) {
        ctx.translate((Math.random() - 0.5) * State.shakeAmount, (Math.random() - 0.5) * State.shakeAmount);
        State.shakeAmount *= 0.85;
      } else { State.shakeAmount = 0; }

      // Background
      ctx.fillStyle = track.colors.grass;
      ctx.fillRect(-20, -20, CONFIG.W + 40, CONFIG.H + 40);

      this.drawRoad();
      this.drawScenery();
      this.drawHazards();
      this.drawCoinsAndPowerUps();
      this.drawTraffic();
      this.drawOpponents();
      this.drawPlayer();
      this.drawParticles();

      if (State.flashAlpha > 0.01) {
        ctx.fillStyle = `rgba(255, 60, 60, ${State.flashAlpha})`;
        ctx.fillRect(0, 0, CONFIG.W, CONFIG.H);
        State.flashAlpha *= 0.88;
      } else { State.flashAlpha = 0; }

      ctx.restore();
    },

    drawRoad() {
      const ctx = this.ctx;
      const track = State.track;
      const strip = 12;
      ctx.fillStyle = track.colors.road;
      ctx.beginPath();
      for (let y = -strip; y <= CONFIG.H + strip; y += strip) {
        const worldY = State.camera.distance + (CONFIG.PLAYER_Y - y);
        const cx = roadCenterX(worldY);
        const left = cx - CONFIG.ROAD_WIDTH / 2;
        if (y === -strip) ctx.moveTo(left, y); else ctx.lineTo(left, y);
      }
      for (let y = CONFIG.H + strip; y >= -strip; y -= strip) {
        const worldY = State.camera.distance + (CONFIG.PLAYER_Y - y);
        const cx = roadCenterX(worldY);
        const right = cx + CONFIG.ROAD_WIDTH / 2;
        ctx.lineTo(right, y);
      }
      ctx.closePath();
      ctx.fill();

      // Dashed centerline + edge lines, following the same curve.
      ctx.strokeStyle = track.colors.line;
      ctx.lineWidth = 2;
      ctx.setLineDash([18, 16]);
      ctx.lineDashOffset = -(State.camera.distance % 34);
      ctx.beginPath();
      for (let y = -strip; y <= CONFIG.H + strip; y += strip) {
        const worldY = State.camera.distance + (CONFIG.PLAYER_Y - y);
        const cx = roadCenterX(worldY);
        if (y === -strip) ctx.moveTo(cx, y); else ctx.lineTo(cx, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 4;
      [-1, 1].forEach((side) => {
        ctx.beginPath();
        for (let y = -strip; y <= CONFIG.H + strip; y += strip) {
          const worldY = State.camera.distance + (CONFIG.PLAYER_Y - y);
          const cx = roadCenterX(worldY) + side * CONFIG.ROAD_WIDTH / 2;
          if (y === -strip) ctx.moveTo(cx, y); else ctx.lineTo(cx, y);
        }
        ctx.stroke();
      });
    },

    drawScenery() {
      const ctx = this.ctx;
      const track = State.track;
      State.scenery.forEach((s) => {
        const y = this.screenY(s.worldY);
        if (y < -60 || y > CONFIG.H + 60) return;
        const cx = roadCenterX(s.worldY) + s.lateral;
        ctx.save();
        ctx.translate(cx, y);
        switch (s.kind) {
          case 'building': {
            const h = 60 + (Math.abs(Math.round(s.worldY)) % 40);
            ctx.fillStyle = track.colors.deco1;
            ctx.fillRect(-16, -h, 32, h);
            ctx.fillStyle = track.colors.deco2;
            for (let wy = -h + 8; wy < -6; wy += 12) {
              for (let wx = -10; wx < 10; wx += 8) ctx.fillRect(wx, wy, 4, 5);
            }
            break;
          }
          case 'tree': {
            ctx.fillStyle = '#4a2f1a';
            ctx.fillRect(-3, -18, 6, 18);
            ctx.fillStyle = track.colors.deco1;
            ctx.beginPath(); ctx.arc(0, -26, 16, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'cactus': {
            ctx.fillStyle = track.colors.deco2;
            ctx.fillRect(-4, -30, 8, 30);
            ctx.fillRect(-12, -20, 8, 6);
            ctx.fillRect(4, -24, 8, 6);
            break;
          }
          case 'dune': {
            ctx.fillStyle = track.colors.deco1;
            ctx.beginPath(); ctx.ellipse(0, 0, 26, 10, 0, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'rock': {
            ctx.fillStyle = '#5c5c5c';
            ctx.fillRect(-10, -12, 20, 12);
            break;
          }
          case 'lamp': {
            ctx.fillStyle = '#333';
            ctx.fillRect(-2, -40, 4, 40);
            ctx.fillStyle = track.colors.deco1;
            ctx.shadowColor = track.colors.deco1;
            ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.arc(0, -42, 5, 0, Math.PI * 2); ctx.fill();
            break;
          }
          case 'sign': {
            ctx.fillStyle = '#888';
            ctx.fillRect(-2, -30, 4, 30);
            ctx.fillStyle = track.colors.deco2;
            ctx.fillRect(-14, -38, 28, 14);
            break;
          }
          default: break;
        }
        ctx.restore();
      });
    },

    drawHazards() {
      const ctx = this.ctx;
      State.hazards.forEach((hz) => {
        const y = this.screenY(hz.worldY);
        if (y < -30 || y > CONFIG.H + 30) return;
        const x = roadCenterX(hz.worldY) + hz.lane * CONFIG.LANE_WIDTH;
        ctx.save();
        ctx.translate(x, y);
        if (hz.kind === 'rock') {
          ctx.fillStyle = '#6b6b6b';
          ctx.fillRect(-11, -11, 22, 22);
          ctx.fillStyle = '#8a8a8a';
          ctx.fillRect(-11, -11, 22, 8);
        } else {
          ctx.fillStyle = '#ff8a00';
          ctx.fillRect(-9, -14, 18, 28);
          ctx.fillStyle = '#fff';
          ctx.fillRect(-9, -4, 18, 4);
        }
        ctx.restore();
      });
    },

    drawCoinsAndPowerUps() {
      const ctx = this.ctx;
      const t = performance.now();
      State.coins.forEach((c) => {
        if (c.taken) return;
        const y = this.screenY(c.worldY);
        if (y < -20 || y > CONFIG.H + 20) return;
        const x = roadCenterX(c.worldY) + c.lane * CONFIG.LANE_WIDTH;
        const bob = Math.sin(t / 200 + c.worldY) * 2;
        ctx.save();
        ctx.shadowColor = '#ffd166';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(x, y + bob, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#c9911e';
        ctx.beginPath();
        ctx.arc(x, y + bob, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      State.powerups.forEach((pu) => {
        if (pu.taken) return;
        const y = this.screenY(pu.worldY);
        if (y < -20 || y > CONFIG.H + 20) return;
        const x = roadCenterX(pu.worldY) + pu.lane * CONFIG.LANE_WIDTH;
        const def = getPowerUpDef(pu.id);
        const pulse = 1 + Math.sin(t / 160 + pu.worldY) * 0.12;
        ctx.save();
        ctx.translate(x, y);
        ctx.shadowColor = def.color;
        ctx.shadowBlur = 16;
        ctx.fillStyle = def.color;
        ctx.globalAlpha = 0.92;
        const r = 13 * pulse;
        ctx.beginPath();
        for (let i = 0; i < 6; i += 1) {
          const angle = (Math.PI / 3) * i - Math.PI / 2;
          const px = Math.cos(angle) * r; const py = Math.sin(angle) * r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill();
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(def.icon, 0, 1);
        ctx.restore();
      });
    },

    // Generic pixel-art top-down car — reused for player, traffic
    // and opponents so there's only one drawing routine to tune.
    // Every vehicle is drawn as a distinct blocky pixel-art silhouette
    // (not just a colored rectangle) — the `shape` argument picks
    // which one. All coordinates below are local to the car's own
    // origin (ctx is already translated to x,y before this runs),
    // with "front" always pointing toward -h/2 (up the screen, i.e.
    // ahead on the track) to match the existing headlight convention.
    drawCar(x, y, w, h, bodyColor, accentColor, glowColor, shape) {
      const ctx = this.ctx;
      ctx.save();
      ctx.translate(x, y);
      if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = 14; }
      switch (shape) {
        case 'f1': this.drawCarF1(w, h, bodyColor, accentColor); break;
        case 'drift': this.drawCarDrift(w, h, bodyColor, accentColor); break;
        case 'truck': this.drawCarTruck(w, h, bodyColor, accentColor); break;
        case 'super': this.drawCarSuper(w, h, bodyColor, accentColor); break;
        case 'van': this.drawCarVan(w, h, bodyColor, accentColor); break;
        default: this.drawCarSedan(w, h, bodyColor, accentColor); break;
      }
      ctx.restore();
    },

    // --- Starter car / plain traffic: boxy family sedan ---
    drawCarSedan(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 4, w, h);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2, -h / 2 + 3, w, h - 3);
      ctx.fillRect(-w / 2 + 3, -h / 2, w - 6, 10); // cabin roof, set back
      ctx.fillStyle = 'rgba(15,20,35,0.85)';
      ctx.fillRect(-w / 2 + 4, -h / 2 + 2, w - 8, 8); // windshield
      ctx.fillRect(-w / 2 + 4, h * 0.02, w - 8, 6); // rear window
      ctx.fillStyle = accentColor;
      ctx.fillRect(-2, -h / 2, 4, h);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 4, 4, 3);
      ctx.fillRect(w / 2 - 6, -h / 2 + 4, 4, 3);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-w / 2 + 2, h / 2 - 6, 4, 3);
      ctx.fillRect(w / 2 - 6, h / 2 - 6, 4, 3);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-w / 2 - 1, -h / 2 + 6, 3, 10);
      ctx.fillRect(w / 2 - 2, -h / 2 + 6, 3, 10);
      ctx.fillRect(-w / 2 - 1, h / 2 - 16, 3, 10);
      ctx.fillRect(w / 2 - 2, h / 2 - 16, 3, 10);
    },

    // --- "Speed" car: open-wheel formula-style racer ---
    // Narrow tapering nose, exposed wheels wider than the body,
    // front/rear wings — the classic F1 silhouette.
    drawCarF1(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      const bw = w * 0.62; // the body "tub" is much narrower than the wheel track
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-bw / 2 + 2, -h / 2 + 4, bw, h);
      // nose cone, tapering to a point at the very front
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-bw * 0.18, -h / 2, bw * 0.36, h * 0.14);
      ctx.fillRect(-bw * 0.3, -h / 2 + h * 0.12, bw * 0.6, h * 0.12);
      // main tub
      ctx.fillRect(-bw / 2, -h / 2 + h * 0.22, bw, h * 0.5);
      // cockpit
      ctx.fillStyle = 'rgba(15,20,35,0.9)';
      ctx.fillRect(-bw * 0.24, -h / 2 + h * 0.26, bw * 0.48, h * 0.16);
      // engine cover
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-bw * 0.4, -h / 2 + h * 0.7, bw * 0.8, h * 0.14);
      // front wing
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w * 0.36, -h / 2 - 2, w * 0.72, 3);
      // rear wing (wide, on endplates)
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2, h / 2 - 11, 3, 7);
      ctx.fillRect(w / 2 - 3, h / 2 - 11, 3, 7);
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2, h / 2 - 6, w, 4);
      // center stripe
      ctx.fillStyle = accentColor;
      ctx.fillRect(-1.5, -h / 2 + h * 0.12, 3, h * 0.55);
      // exposed wheels — sit OUTSIDE the tub, front and rear
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-w / 2, -h / 2 + 8, 5, 10);
      ctx.fillRect(w / 2 - 5, -h / 2 + 8, 5, 10);
      ctx.fillRect(-w / 2, h / 2 - 19, 5, 12);
      ctx.fillRect(w / 2 - 5, h / 2 - 19, 5, 12);
    },

    // --- "Drift" car: sporty coupe, wide rear haunches, big wing ---
    drawCarDrift(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 4, w, h);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w * 0.42, -h / 2 + 2, w * 0.84, h * 0.4); // narrower front
      ctx.fillRect(-w / 2, -h / 2 + h * 0.36, w, h * 0.52); // flared rear haunches
      ctx.fillRect(-w * 0.36, -h / 2 + 6, w * 0.72, h * 0.22); // cabin, set back
      ctx.fillStyle = 'rgba(15,20,35,0.85)';
      ctx.fillRect(-w * 0.32, -h / 2 + 8, w * 0.64, h * 0.16); // windshield
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2, h * 0.0, w, 4); // side swoosh
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 3, 4, 3);
      ctx.fillRect(w / 2 - 6, -h / 2 + 3, 4, 3);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-w / 2 + 2, h / 2 - 6, 4, 3);
      ctx.fillRect(w / 2 - 6, h / 2 - 6, 4, 3);
      // big rear wing on struts
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2 + 2, h / 2 - 9, 2, 6);
      ctx.fillRect(w / 2 - 4, h / 2 - 9, 2, 6);
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2 + 1, h / 2 - 3, w - 2, 3);
      // wide rear stance wheels
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-w * 0.42 - 2, -h / 2 + 6, 3, 9);
      ctx.fillRect(w * 0.42 - 1, -h / 2 + 6, 3, 9);
      ctx.fillRect(-w / 2 - 2, h / 2 - 17, 4, 11);
      ctx.fillRect(w / 2 - 2, h / 2 - 17, 4, 11);
    },

    // --- "Heavy" car: chunky pixel truck, cab + cargo bed ---
    drawCarTruck(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 4, w, h);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2, -h / 2, w, h * 0.34); // cab
      ctx.fillStyle = 'rgba(15,20,35,0.85)';
      ctx.fillRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.16); // windshield
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2, -h / 2 + h * 0.34, w, h * 0.62); // cargo box
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-w / 2, -h / 2 + h * 0.5, w, 2); // panel seams
      ctx.fillRect(-w / 2, -h / 2 + h * 0.68, w, 2);
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2, -h / 2 + h * 0.34 - 2, w, 3);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 1, 4, 3);
      ctx.fillRect(w / 2 - 6, -h / 2 + 1, 4, 3);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-w / 2 + 2, h / 2 - 5, 4, 3);
      ctx.fillRect(w / 2 - 6, h / 2 - 5, 4, 3);
      // chunky doubled wheels front + rear
      ctx.fillStyle = '#161616';
      ctx.fillRect(-w / 2 - 2, -h / 2 + 4, 4, 11);
      ctx.fillRect(w / 2 - 2, -h / 2 + 4, 4, 11);
      ctx.fillRect(-w / 2 - 2, h / 2 - 20, 4, 9);
      ctx.fillRect(-w / 2 - 2, h / 2 - 10, 4, 9);
      ctx.fillRect(w / 2 - 2, h / 2 - 20, 4, 9);
      ctx.fillRect(w / 2 - 2, h / 2 - 10, 4, 9);
    },

    // --- "Super" car: low, wide, angular supercar ---
    drawCarSuper(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 6, w, h - 4);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w * 0.2, -h / 2 + 2, w * 0.4, h * 0.12); // sharp nose tip
      ctx.fillRect(-w * 0.38, -h / 2 + h * 0.12, w * 0.76, h * 0.14); // widening
      ctx.fillRect(-w / 2, -h / 2 + h * 0.24, w, h * 0.6); // wide low body
      ctx.fillStyle = 'rgba(15,20,35,0.85)';
      ctx.fillRect(-w * 0.3, -h / 2 + h * 0.22, w * 0.6, h * 0.14); // low cabin bubble
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2, h * 0.02, w, 3); // side flare
      ctx.fillRect(-1.5, -h / 2 + h * 0.12, 3, h * 0.5); // center stripe
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(-w / 2 + 1, -h / 2 + 6, 5, 2); // slit headlights
      ctx.fillRect(w / 2 - 6, -h / 2 + 6, 5, 2);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-w / 2 + 2, h / 2 - 5, w - 4, 3); // full-width tail light bar
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w * 0.3, h / 2 - 9, w * 0.6, 3); // rear diffuser accent
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-w / 2 - 1, -h / 2 + 10, 3, 8);
      ctx.fillRect(w / 2 - 2, -h / 2 + 10, 3, 8);
      ctx.fillRect(-w / 2 - 1, h / 2 - 16, 3, 9);
      ctx.fillRect(w / 2 - 2, h / 2 - 16, 3, 9);
    },

    // --- Traffic "van": tall boxy cargo van ---
    drawCarVan(w, h, bodyColor, accentColor) {
      const ctx = this.ctx;
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 4, w, h);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(-w / 2, -h / 2, w, h); // full tall box
      ctx.fillStyle = 'rgba(15,20,35,0.85)';
      ctx.fillRect(-w / 2 + 3, -h / 2 + 4, w - 6, h * 0.14); // windshield
      ctx.fillRect(-w / 2 + 3, -h / 2 + h * 0.22, w - 6, h * 0.08); // side window strip
      ctx.fillStyle = accentColor;
      ctx.fillRect(-w / 2, h * 0.05, w, 4);
      ctx.fillStyle = '#fff9c4';
      ctx.fillRect(-w / 2 + 2, -h / 2 + 2, 4, 3);
      ctx.fillRect(w / 2 - 6, -h / 2 + 2, 4, 3);
      ctx.fillStyle = '#ff4d6d';
      ctx.fillRect(-w / 2 + 2, h / 2 - 5, 4, 3);
      ctx.fillRect(w / 2 - 6, h / 2 - 5, 4, 3);
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(-w / 2 - 2, -h / 2 + 6, 4, 11);
      ctx.fillRect(w / 2 - 2, -h / 2 + 6, 4, 11);
      ctx.fillRect(-w / 2 - 2, h / 2 - 17, 4, 11);
      ctx.fillRect(w / 2 - 2, h / 2 - 17, 4, 11);
    },

    drawPlayer() {
      const p = State.player;
      const car = State.stats.car;
      const auraActive = Object.keys(State.activeEffects).length > 0;
      const glow = auraActive ? (State.lastAuraColor || car.accent) : (Input.nitro && p.nitro > 0 ? '#00f0ff' : null);
      this.drawCar(p.x, CONFIG.PLAYER_Y, CONFIG.PLAYER_W, CONFIG.PLAYER_H, car.color, car.accent, glow, car.shape);

      if (isPowerUpActive('shield')) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 14;
        ctx.beginPath();
        ctx.arc(p.x, CONFIG.PLAYER_Y, CONFIG.PLAYER_H * 0.62, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    },

    drawTraffic() {
      State.traffic.forEach((car) => {
        const y = this.screenY(car.worldY);
        if (y < -60 || y > CONFIG.H + 60) return;
        const x = roadCenterX(car.worldY) + car.lane * CONFIG.LANE_WIDTH;
        this.drawCar(x, y, car.w, car.h, car.color, '#1a1a1a', null, car.shape);
      });
    },

    drawOpponents() {
      State.opponents.forEach((op) => {
        const y = this.screenY(op.worldY);
        if (y < -60 || y > CONFIG.H + 60) return;
        const x = roadCenterX(op.worldY) + op.lane * CONFIG.LANE_WIDTH;
        this.drawCar(x, y, CONFIG.PLAYER_W, CONFIG.PLAYER_H, op.profile.color, '#151b30', null, op.profile.shape);
      });
    },

    drawParticles() {
      const ctx = this.ctx;
      State.particles.forEach((pt) => {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life);
        ctx.fillStyle = pt.color;
        ctx.shadowColor = pt.color;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    },

    // Small static preview used on car cards in Garage/Race Setup.
    drawCarPreview(canvas, car) {
      const ctx = canvas.getContext('2d');
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
      const prevCtx = this.ctx; const prevCanvas = this.canvas;
      this.ctx = ctx; this.canvas = canvas;
      this.drawCar(canvas.clientWidth / 2, canvas.clientHeight / 2, 26, 42, car.color, car.accent, car.accent, car.shape);
      this.ctx = prevCtx; this.canvas = prevCanvas;
    },
  };

  /* ============================================================
     14. HUD
  ============================================================ */

  const UI = {
    els: {},
    _toastTimer: null,

    init() {
      const ids = [
        'hud', 'hud-score', 'hud-distance', 'hud-speed', 'hud-position-wrap', 'hud-position',
        'hud-time-wrap', 'hud-time', 'hud-coins', 'health-bar-fill', 'nitro-bar-fill', 'powerup-strip',
        'stage', 'race-canvas', 'countdown-overlay', 'countdown-number', 'pause-overlay', 'touch-controls',
        'screen-start', 'screen-race-setup', 'screen-garage', 'screen-upgrades', 'screen-tracks',
        'screen-missions', 'screen-achievements', 'screen-settings', 'screen-race-complete', 'screen-game-over',
        'menu-coins', 'menu-best-score',
        'rc-position', 'rc-new-record', 'rc-score', 'rc-best-score', 'rc-coins', 'rc-distance', 'rc-drift', 'rc-time',
        'go-reason', 'go-score', 'go-best-score', 'go-coins', 'go-distance',
        'achievement-toast', 'achievement-toast-icon', 'achievement-toast-text',
      ];
      ids.forEach((id) => { this.els[id] = document.getElementById(id); });
    },

    showScreen(name) {
      State.screen = name;
      const screenIds = [
        'screen-start', 'screen-race-setup', 'screen-garage', 'screen-upgrades', 'screen-tracks',
        'screen-missions', 'screen-achievements', 'screen-settings', 'screen-race-complete', 'screen-game-over',
      ];
      screenIds.forEach((id) => this.els[id].classList.add('hidden'));
      this.els.stage.classList.add('hidden');
      this.els.hud.classList.add('hidden');
      this.els['touch-controls'].classList.add('hidden');

      if (name === 'playing' || name === 'paused' || name === 'countdown') {
        this.els.stage.classList.remove('hidden');
        this.els.hud.classList.remove('hidden');
        if (isTouchDevice()) this.els['touch-controls'].classList.remove('hidden');
      } else if (screenIds.includes(`screen-${name}`)) {
        this.els[`screen-${name}`].classList.remove('hidden');
      }
      this.els['pause-overlay'].classList.toggle('hidden', name !== 'paused');
    },

    updateHUD() {
      const p = State.player;
      this.els['hud-score'].textContent = Math.round(State.score);
      // World units -> a friendlier "meters" scale, purely cosmetic.
      this.els['hud-distance'].textContent = `${Math.round(State.camera.distance / 8)}m`;
      this.els['hud-speed'].textContent = Math.round(Math.abs(p.speed) / 3);
      this.els['hud-coins'].textContent = Save.data.coins;

      const showPos = State.mode.hasOpponents;
      this.els['hud-position-wrap'].hidden = !showPos;
      if (showPos) this.els['hud-position'].textContent = ordinal(currentPosition());

      const showTime = State.mode.hasTimer;
      this.els['hud-time-wrap'].hidden = !showTime;
      if (showTime) this.els['hud-time'].textContent = formatTime(Math.max(0, State.timeLeftMs));

      this.els['health-bar-fill'].style.width = `${Math.max(0, (p.health / State.stats.maxHealth) * 100)}%`;
      this.els['nitro-bar-fill'].style.width = `${Math.max(0, (p.nitro / (CONFIG.NITRO_MAX * State.stats.nitroCapMult)) * 100)}%`;

      this.renderPowerUpStrip();
    },

    renderPowerUpStrip() {
      // Rebuilding this DOM every single frame (60x/sec) is wasted
      // work for a countdown that only needs whole-second resolution
      // — throttle the actual rebuild to a few times a second instead.
      const now = performance.now();
      if (this._lastStripRender && now - this._lastStripRender < 220) return;
      this._lastStripRender = now;

      const strip = this.els['powerup-strip'];
      strip.innerHTML = '';
      Object.keys(State.activeEffects).forEach((id) => {
        if (State.activeEffects[id] <= now) return;
        const def = getPowerUpDef(id);
        const secondsLeft = Math.ceil((State.activeEffects[id] - now) / 1000);
        const chip = document.createElement('div');
        chip.className = 'powerup-chip';
        chip.innerHTML = `<span>${def.icon} ${def.name}</span><span class="chip-time">${secondsLeft}s</span>`;
        strip.appendChild(chip);
      });
    },

    setPowerUpAura(colorHex) {
      State.lastAuraColor = colorHex;
      const stage = this.els.stage;
      if (stage) { stage.style.setProperty('--powerup-color', colorHex); stage.classList.add('stage-powered'); }
    },
    clearPowerUpAura() {
      const stage = this.els.stage;
      if (stage) stage.classList.remove('stage-powered');
    },

    showCountdown(n) {
      this.els['countdown-overlay'].classList.toggle('hidden', n === null);
      if (n !== null) {
        this.els['countdown-number'].textContent = n === 0 ? 'GO!' : String(n);
        const el = this.els['countdown-number'];
        el.style.animation = 'none';
        // eslint-disable-next-line no-unused-expressions
        el.offsetHeight;
        el.style.animation = '';
      }
    },

    showAchievementToast(def) {
      const toast = this.els['achievement-toast'];
      document.getElementById('achievement-toast-icon').textContent = def.icon;
      document.getElementById('achievement-toast-text').textContent = def.name;
      toast.classList.remove('hidden');
      toast.style.animation = 'none';
      // eslint-disable-next-line no-unused-expressions
      toast.offsetHeight;
      toast.style.animation = '';
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
    },
  };

  function ordinal(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]) + ' place'.replace(' place', '');
  }
  function ordinalSuffix(n) {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
  }
  function currentPosition() {
    const distances = State.opponents.map((o) => o.worldY);
    distances.push(State.player.worldY);
    distances.sort((a, b) => b - a);
    return distances.indexOf(State.player.worldY) + 1;
  }
  function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const m = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const s = (totalSeconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }
  function isTouchDevice() { return 'ontouchstart' in window || navigator.maxTouchPoints > 0; }

  /* ============================================================
     15. SCREEN BUILDERS — populate the menu/garage/upgrades/etc.
     screens from data. Called on demand each time a screen opens
     so they always reflect the latest save data.
  ============================================================ */

  function renderMenuHome() {
    document.getElementById('menu-coins').textContent = Save.data.coins;
    document.getElementById('menu-best-score').textContent = Save.data.bestScore;
  }

  let pendingMode = MODES[0];
  let pendingTrack = null;

  function buildRaceSetupScreen() {
    const modeWrap = document.getElementById('mode-select');
    modeWrap.innerHTML = '';
    MODES.forEach((m) => {
      const btn = document.createElement('button');
      btn.className = `segment${pendingMode.id === m.id ? ' active' : ''}`;
      btn.textContent = m.name;
      btn.addEventListener('click', () => { pendingMode = m; Sound.click(); buildRaceSetupScreen(); });
      modeWrap.appendChild(btn);
    });
    document.getElementById('mode-hint').textContent = pendingMode.hint;

    if (!pendingTrack || !Save.data.unlockedTracks.includes(pendingTrack.id)) {
      pendingTrack = getTrack(Save.data.selectedTrack);
    }

    const trackGrid = document.getElementById('race-setup-track-grid');
    trackGrid.innerHTML = '';
    TRACKS.forEach((t) => trackGrid.appendChild(buildTrackCard(t, pendingTrack.id === t.id, (track) => {
      if (!Save.data.unlockedTracks.includes(track.id)) return;
      pendingTrack = track;
      Save.data.selectedTrack = track.id;
      Save.persist();
      buildRaceSetupScreen();
    })));

    const carGrid = document.getElementById('race-setup-car-grid');
    carGrid.innerHTML = '';
    CARS.forEach((c) => carGrid.appendChild(buildCarCard(c, Save.data.selectedCar === c.id, (car) => {
      if (!Save.data.unlockedCars.includes(car.id)) return;
      Save.data.selectedCar = car.id;
      Save.persist();
      buildRaceSetupScreen();
    })));
  }

  function buildTrackCard(track, selected, onPick) {
    const unlocked = Save.data.unlockedTracks.includes(track.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `pick-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
    const stars = '★'.repeat(track.difficulty) + '☆'.repeat(4 - track.difficulty);
    card.innerHTML = `
      ${unlocked ? '' : `<span class="pick-card-lock">🔒</span>`}
      <div class="pick-card-preview" style="background:${track.colors.road}">
        <span style="color:${track.colors.line};font-size:11px;letter-spacing:0.05em;">${stars}</span>
      </div>
      <span class="pick-card-name">${track.name}</span>
      <span class="pick-card-meta">${unlocked ? `${Math.round(track.finishDistance / 8)}m` : `🪙 ${track.cost} to unlock`}</span>`;
    card.addEventListener('click', () => {
      if (!unlocked) {
        if (Save.data.coins >= track.cost) {
          Save.data.coins -= track.cost;
          Save.data.unlockedTracks.push(track.id);
          Save.persist();
          Achievements.checkAll();
          Sound.powerup();
        } else {
          Sound.click();
          return;
        }
      } else { Sound.click(); }
      onPick(track);
    });
    return card;
  }

  function buildCarCard(car, selected, onPick) {
    const unlocked = Save.data.unlockedCars.includes(car.id);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `pick-card${selected ? ' selected' : ''}${unlocked ? '' : ' locked'}`;
    const previewId = `car-preview-${car.id}-${Math.random().toString(36).slice(2, 7)}`;
    card.innerHTML = `
      ${unlocked ? '' : `<span class="pick-card-lock">🔒</span>`}
      <canvas class="pick-card-preview" id="${previewId}"></canvas>
      <span class="pick-card-name">${car.name}</span>
      <div class="mini-stats">
        ${statBar('SPD', car.stats.speed)}
        ${statBar('ACC', car.stats.accel)}
        ${statBar('HND', car.stats.handling)}
        ${statBar('DFT', car.stats.drift)}
        ${statBar('NTR', car.stats.nitro)}
      </div>
      <span class="pick-card-meta">${unlocked ? (selected ? 'Selected' : 'Tap to select') : `🪙 ${car.cost} to unlock`}</span>`;
    card.addEventListener('click', () => {
      if (!unlocked) {
        if (Save.data.coins >= car.cost) {
          Save.data.coins -= car.cost;
          Save.data.unlockedCars.push(car.id);
          Save.persist();
          Achievements.checkAll();
          Sound.powerup();
        } else { Sound.click(); return; }
      } else { Sound.click(); }
      onPick(car);
    });
    requestAnimationFrame(() => {
      const canvas = document.getElementById(previewId);
      if (canvas) Renderer.drawCarPreview(canvas, car);
    });
    return card;
  }

  function statBar(label, value) {
    return `<div class="mini-stat"><span>${label}</span><div class="mini-stat-bar"><div class="mini-stat-bar-fill" style="width:${value}%"></div></div></div>`;
  }

  function buildGarageScreen() {
    document.getElementById('garage-coins').textContent = Save.data.coins;
    const grid = document.getElementById('garage-grid');
    grid.innerHTML = '';
    CARS.forEach((c) => grid.appendChild(buildCarCard(c, Save.data.selectedCar === c.id, (car) => {
      Save.data.selectedCar = car.id;
      Save.persist();
      buildGarageScreen();
    })));
  }

  function buildUpgradesScreen() {
    document.getElementById('upgrades-coins').textContent = Save.data.coins;
    const list = document.getElementById('upgrades-list');
    list.innerHTML = '';
    UPGRADE_DEFS.forEach((def) => {
      const level = Save.data.upgrades[def.id];
      const maxed = level >= UPGRADE_MAX_LEVEL;
      const cost = maxed ? null : upgradeCost(def, level);
      const row = document.createElement('div');
      row.className = 'upgrade-row';
      const dots = Array.from({ length: UPGRADE_MAX_LEVEL }, (_, i) => `<span class="upgrade-dot${i < level ? ' filled' : ''}"></span>`).join('');
      row.innerHTML = `
        <div class="upgrade-info">
          <span class="upgrade-name">${def.name} <span class="field-hint">Lv ${level}/${UPGRADE_MAX_LEVEL}</span></span>
          <span class="field-hint">${def.desc}</span>
          <div class="upgrade-dots">${dots}</div>
        </div>`;
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-primary';
      btn.textContent = maxed ? 'MAX' : `Upgrade 🪙 ${cost}`;
      btn.disabled = maxed || Save.data.coins < cost;
      btn.addEventListener('click', () => {
        if (maxed || Save.data.coins < cost) { Sound.click(); return; }
        Save.data.coins -= cost;
        Save.data.upgrades[def.id] += 1;
        Save.persist();
        Sound.powerup();
        buildUpgradesScreen();
      });
      row.appendChild(btn);
      list.appendChild(row);
    });
  }

  function buildTracksScreen() {
    document.getElementById('tracks-coins').textContent = Save.data.coins;
    const grid = document.getElementById('tracks-grid');
    grid.innerHTML = '';
    TRACKS.forEach((t) => grid.appendChild(buildTrackCard(t, Save.data.selectedTrack === t.id, (track) => {
      Save.data.selectedTrack = track.id;
      Save.persist();
      buildTracksScreen();
    })));
  }

  function buildMissionsScreen() {
    ensureDailyMissions();
    const list = document.getElementById('missions-list');
    list.innerHTML = '';
    Save.data.missions.forEach((mission, idx) => {
      const progress = missionProgress(mission);
      const complete = progress >= mission.target;
      const li = document.createElement('li');
      li.className = `mission-item${mission.claimed ? ' claimed' : ''}`;
      li.innerHTML = `
        <div class="mission-top">
          <span class="mission-name">${mission.name}</span>
          <span class="mission-reward">🪙 ${mission.reward}</span>
        </div>
        <div class="mission-progress-bar"><div class="mission-progress-fill" style="width:${(progress / mission.target) * 100}%"></div></div>
        <div class="mission-bottom"><span>${progress} / ${mission.target}</span><span></span></div>`;
      if (complete && !mission.claimed) {
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary';
        btn.textContent = 'Claim';
        btn.addEventListener('click', () => {
          mission.claimed = true;
          Save.data.coins += mission.reward;
          Save.data.lifetime.missionsClaimed += 1;
          Save.persist();
          Achievements.checkAll();
          Sound.powerup();
          buildMissionsScreen();
        });
        li.querySelector('.mission-bottom').appendChild(btn);
      } else if (mission.claimed) {
        li.querySelector('.mission-bottom span:last-child').textContent = 'Claimed ✓';
      }
      list.appendChild(li);
    });
  }

  function buildAchievementsScreen() {
    const list = document.getElementById('achievements-list');
    list.innerHTML = '';
    let unlocked = 0;
    ACHIEVEMENT_DEFS.forEach((def) => {
      const isUnlocked = !!Save.data.achievements[def.id];
      if (isUnlocked) unlocked += 1;
      const li = document.createElement('li');
      li.className = `achievement-item${isUnlocked ? ' unlocked' : ''}`;
      li.innerHTML = `
        <span class="achievement-icon">${def.icon}</span>
        <div><div class="achievement-name">${def.name}</div><div class="achievement-desc">${isUnlocked ? def.desc : '???'}</div></div>`;
      list.appendChild(li);
    });
    document.getElementById('achievements-progress').textContent = `${unlocked} / ${ACHIEVEMENT_DEFS.length} unlocked`;
  }

  function syncSettingsUI() {
    setToggle('toggle-sound', Save.data.settings.sound);
    setToggle('toggle-music', Save.data.settings.music);
    setToggle('toggle-vibration', Save.data.settings.vibration);
    document.querySelectorAll('#quality-select .segment').forEach((btn) => {
      const match = btn.dataset.quality === Save.data.settings.quality;
      btn.classList.toggle('active', match);
      btn.setAttribute('aria-checked', String(match));
    });
  }
  function setToggle(id, value) { document.getElementById(id).setAttribute('aria-checked', String(value)); }

  /* ============================================================
     16. INPUT
  ============================================================ */

  const KEY_MAP = {
    ArrowUp: 'accel', KeyW: 'accel',
    ArrowDown: 'brake', KeyS: 'brake',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
    Space: 'nitro', ShiftLeft: 'drift', ShiftRight: 'drift',
  };

  function initInput() {
    // --- Pinch-zoom guard --------------------------------------------
    // The touch controls are several separate buttons (accelerate,
    // nitro, drift, ...) that are often pressed together with two
    // fingers. Some mobile browsers — iOS Safari in particular,
    // which ignores the viewport meta's user-scalable=no — can read
    // two simultaneous touches as a pinch-zoom gesture and zoom the
    // whole page in, then back out when the fingers lift. That's
    // what reads as the board "growing" when a power-up/nitro is
    // used and "shrinking" when it ends — it's the browser zooming
    // the page, not the game resizing anything. This blocks it at
    // the source, on top of the CSS touch-action: pan-y above.
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('gesturechange', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1) e.preventDefault();
    }, { passive: false });
    let lastTapTime = 0;
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - lastTapTime < 300) e.preventDefault(); // also blocks double-tap-to-zoom
      lastTapTime = now;
    }, { passive: false });

    document.addEventListener('keydown', (e) => {
      Sound.unlock();
      const action = KEY_MAP[e.code];
      if (action && State.screen === 'playing') { Input[action] = true; e.preventDefault(); return; }
      if (e.code === 'KeyP') { if (State.screen === 'playing') Race.pause(); else if (State.screen === 'paused') Race.resume(); }
      if (e.code === 'KeyR' && ['playing', 'paused', 'race-complete', 'game-over'].includes(State.screen)) Race.restart();
      if (e.code === 'Enter' && State.screen === 'start') Race.openSetup();
    });
    document.addEventListener('keyup', (e) => {
      const action = KEY_MAP[e.code];
      if (action) Input[action] = false;
    });

    const touchMap = {
      'touch-left': 'left', 'touch-right': 'right', 'touch-accel': 'accel',
      'touch-brake': 'brake', 'touch-nitro': 'nitro', 'touch-drift': 'drift',
    };
    Object.keys(touchMap).forEach((id) => {
      const el = document.getElementById(id);
      const action = touchMap[id];
      const start = (e) => { e.preventDefault(); Sound.unlock(); Input[action] = true; el.classList.add('is-active'); };
      const end = (e) => { e.preventDefault(); Input[action] = false; el.classList.remove('is-active'); };
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('touchcancel', end, { passive: false });
      // Also support mouse for desktop testing of the touch layout.
      el.addEventListener('mousedown', start);
      window.addEventListener('mouseup', end);
    });
  }

  function resetInput() { Object.keys(Input).forEach((k) => { Input[k] = false; }); }

  /* ============================================================
     17. RACE FLOW
  ============================================================ */

  const Race = {
    rafId: null, lastFrameTime: 0,

    openSetup() {
      Sound.click();
      buildRaceSetupScreen();
      UI.showScreen('race-setup');
    },

    setupNewRun(mode, track) {
      State.mode = mode;
      State.track = track;
      track._seed = track._seed !== undefined ? track._seed : Math.random() * 1000;
      State.stats = effectiveStats();

      State.camera.distance = 0;
      State.player = {
        x: roadCenterX(0), worldY: 0, lane: 0, speed: 0, slip: 0,
        health: State.stats.maxHealth, nitro: CONFIG.NITRO_MAX * State.stats.nitroCapMult,
        offRoadTimer: 0, driftSoundCooldown: 0, nitroSoundedThisPress: false,
      };
      State.traffic = []; State.opponents = []; State.coins = []; State.powerups = [];
      State.hazards = []; State.particles = []; State.scenery = [];
      State.nextTrafficY = 300; State.nextPickupY = 200; State.nextHazardY = 500; State.nextSceneryY = 0;
      State.score = 0; State.coinsThisRun = 0; State.driftScore = 0; State.driftTimer = 0;
      State.overtakes = 0; State.elapsedMs = 0; State.finishOrder = []; State.raceFinished = false;
      State.tookDamageThisRace = false;
      State.activeEffects = {}; State.invulnUntil = 0; State.shakeAmount = 0; State.flashAlpha = 0;
      RunFlags.everFlawless = false;

      if (mode.hasTimer) State.timeLeftMs = track.timeLimit * 1000;

      if (mode.hasOpponents) {
        const shuffled = OPPONENT_PROFILES.slice().sort(() => Math.random() - 0.5).slice(0, 4);
        State.opponents = shuffled.map((profile, i) => ({
          id: `op-${i}`, profile, worldY: 0, lane: (i % 3) - 1, laneTarget: (i % 3) - 1,
          speed: State.stats.maxSpeed * 0.7, laneChangeAt: 700 + Math.random() * 600,
        }));
      }
    },

    startCountdown() {
      Sound.unlock();
      UI.showScreen('countdown');
      UI.updateHUD();
      UI.clearPowerUpAura();
      let count = CONFIG.COUNTDOWN_SECONDS;
      UI.showCountdown(count);
      Sound.countdownBeep(false);
      const tick = () => {
        count -= 1;
        if (count >= 0) { UI.showCountdown(count); Sound.countdownBeep(count === 0); setTimeout(tick, 700); }
        else { UI.showCountdown(null); this.begin(); }
      };
      setTimeout(tick, 700);
    },

    begin() {
      resetInput();
      UI.showScreen('playing');
      Sound.startEngine();
      this.lastFrameTime = performance.now();
      this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    pause() {
      if (State.screen !== 'playing') return;
      resetInput();
      UI.showScreen('paused');
      cancelAnimationFrame(this.rafId);
      Sound.stopEngine();
      Sound.click();
      Save.persist(); // flush this run's coins so far — cheap here, it's a one-off user action, not a per-frame call
    },

    resume() {
      if (State.screen !== 'paused') return;
      UI.showScreen('playing');
      Sound.startEngine();
      this.lastFrameTime = performance.now();
      this.rafId = requestAnimationFrame((t) => this.loop(t));
    },

    restart() {
      cancelAnimationFrame(this.rafId);
      Sound.stopEngine();
      this.setupNewRun(State.mode, State.track);
      this.startCountdown();
    },

    goToMenu() {
      cancelAnimationFrame(this.rafId);
      Sound.stopEngine();
      renderMenuHome();
      UI.showScreen('start');
    },

    finishRace() {
      State.raceFinished = true;
      cancelAnimationFrame(this.rafId);
      Sound.stopEngine();
      Sound.finish();

      const position = State.mode.hasOpponents ? State.finishOrder.indexOf('player') + 1 : 1;
      const positionBonus = [0, 500, 300, 150, 50, 20][position] || 0;
      State.score += positionBonus;

      Save.data.lifetime.racesFinished += 1;
      if (position === 1) Save.data.lifetime.racesWon += 1;
      if (!State.tookDamageThisRace) RunFlags.everFlawless = true;

      const isNewRecord = State.score > Save.data.bestScore;
      if (isNewRecord) Save.data.bestScore = State.score;
      Save.persist();
      Achievements.checkAll();

      document.getElementById('rc-position').textContent = State.mode.hasOpponents ? `${ordinalSuffix(position)} Place` : 'Finished!';
      document.getElementById('rc-new-record').classList.toggle('hidden', !isNewRecord);
      document.getElementById('rc-score').textContent = Math.round(State.score);
      document.getElementById('rc-best-score').textContent = Save.data.bestScore;
      document.getElementById('rc-coins').textContent = State.coinsThisRun;
      document.getElementById('rc-distance').textContent = `${Math.round(State.camera.distance / 8)}m`;
      document.getElementById('rc-drift').textContent = Math.round(State.driftScore);
      document.getElementById('rc-time').textContent = formatTime(State.elapsedMs);

      UI.showScreen('race-complete');
    },

    gameOver(reason) {
      cancelAnimationFrame(this.rafId);
      Sound.stopEngine();
      Sound.collision();

      if (State.mode.id === 'endless' || State.mode.id === 'trafficRun') {
        const meters = Math.round(State.camera.distance / 8);
        if (meters > Save.data.bestDistanceEndless) Save.data.bestDistanceEndless = meters;
      }
      const isNewRecord = State.score > Save.data.bestScore;
      if (isNewRecord) Save.data.bestScore = State.score;
      Save.persist();
      Achievements.checkAll();

      document.getElementById('go-reason').textContent = reason;
      document.getElementById('go-score').textContent = Math.round(State.score);
      document.getElementById('go-best-score').textContent = Save.data.bestScore;
      document.getElementById('go-coins').textContent = State.coinsThisRun;
      document.getElementById('go-distance').textContent = `${Math.round(State.camera.distance / 8)}m`;

      UI.showScreen('game-over');
    },

    loop(timestamp) {
      this.rafId = requestAnimationFrame((t) => this.loop(t));
      let dt = (timestamp - this.lastFrameTime) / 1000;
      this.lastFrameTime = timestamp;
      // Clamp dt so a backgrounded tab regaining focus can't cause
      // a huge simulation jump (which would look like teleporting).
      dt = Math.min(dt, 1 / 20);

      if (State.screen !== 'playing') return;

      State.elapsedMs += dt * 1000;
      if (State.mode.hasTimer) {
        State.timeLeftMs -= dt * 1000;
        if (State.timeLeftMs <= 0) { this.gameOver("Time's up!"); return; }
      }

      updateActiveEffects();
      spawnTrafficIfNeeded();
      spawnPickupsIfNeeded();
      spawnHazardsIfNeeded();
      spawnSceneryIfNeeded();

      updatePlayer(dt);
      updateTraffic(dt);
      if (State.mode.hasOpponents) updateOpponents(dt);
      updateCollisions();
      updateParticles(dt);
      pruneOffscreen();

      State.score += State.player.speed * dt * 0.05;

      if (State.player.health <= 0) { this.gameOver('Your car took too much damage.'); return; }
      if (State.mode.hasFinish && !State.finishOrder.includes('player') && State.player.worldY >= State.track.finishDistance) {
        State.finishOrder.push('player');
        this.finishRace();
        return;
      }

      Renderer.renderFrame();
      UI.updateHUD();
    },
  };

  /* ============================================================
     18. GAME LOOP — driven entirely by Race.loop() above.
  ============================================================ */

  /* ============================================================
     19. INITIALIZATION
  ============================================================ */

  function bindMenu() {
    document.getElementById('btn-start-race').addEventListener('click', () => Race.openSetup());
    document.getElementById('btn-open-garage').addEventListener('click', () => { Sound.click(); buildGarageScreen(); UI.showScreen('garage'); });
    document.getElementById('btn-open-upgrades').addEventListener('click', () => { Sound.click(); buildUpgradesScreen(); UI.showScreen('upgrades'); });
    document.getElementById('btn-open-tracks').addEventListener('click', () => { Sound.click(); buildTracksScreen(); UI.showScreen('tracks'); });
    document.getElementById('btn-open-missions').addEventListener('click', () => { Sound.click(); buildMissionsScreen(); UI.showScreen('missions'); });
    document.getElementById('btn-open-achievements').addEventListener('click', () => { Sound.click(); buildAchievementsScreen(); UI.showScreen('achievements'); });
    document.getElementById('btn-open-settings').addEventListener('click', () => { Sound.click(); syncSettingsUI(); UI.showScreen('settings'); });

    document.getElementById('btn-garage-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-upgrades-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-tracks-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-missions-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-achievements-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-settings-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });
    document.getElementById('btn-race-setup-back').addEventListener('click', () => { Sound.click(); UI.showScreen('start'); renderMenuHome(); });

    document.getElementById('btn-go').addEventListener('click', () => {
      Sound.click();
      Race.setupNewRun(pendingMode, pendingTrack || getTrack(Save.data.selectedTrack));
      Race.startCountdown();
    });
  }

  function bindPauseOverlay() {
    document.getElementById('btn-pause').addEventListener('click', () => Race.pause());
    document.getElementById('btn-resume').addEventListener('click', () => { Sound.click(); Race.resume(); });
    document.getElementById('btn-pause-restart').addEventListener('click', () => { Sound.click(); Race.restart(); });
    document.getElementById('btn-pause-fullscreen').addEventListener('click', () => { Sound.click(); toggleFullscreen(); });
    document.getElementById('btn-pause-menu').addEventListener('click', () => { Sound.click(); Race.goToMenu(); });
  }

  function bindResultScreens() {
    document.getElementById('btn-race-again').addEventListener('click', () => { Sound.click(); Race.restart(); });
    document.getElementById('btn-rc-garage').addEventListener('click', () => { Sound.click(); buildGarageScreen(); UI.showScreen('garage'); });
    document.getElementById('btn-rc-menu').addEventListener('click', () => { Sound.click(); Race.goToMenu(); });
    document.getElementById('btn-go-retry').addEventListener('click', () => { Sound.click(); Race.restart(); });
    document.getElementById('btn-go-menu').addEventListener('click', () => { Sound.click(); Race.goToMenu(); });
  }

  function bindSettings() {
    document.getElementById('toggle-sound').addEventListener('click', () => { Save.data.settings.sound = !Save.data.settings.sound; Save.persist(); syncSettingsUI(); });
    document.getElementById('toggle-music').addEventListener('click', () => {
      Save.data.settings.music = !Save.data.settings.music;
      Save.persist();
      syncSettingsUI();
      Sound.click();
      // Reflect the change immediately if a race is already running,
      // instead of waiting for the next race to start.
      if (State.screen === 'playing') {
        if (Save.data.settings.music) Sound.startEngine(); else Sound.stopEngine();
      }
    });
    document.getElementById('toggle-vibration').addEventListener('click', () => { Save.data.settings.vibration = !Save.data.settings.vibration; Save.persist(); syncSettingsUI(); Sound.click(); });
    document.getElementById('quality-select').addEventListener('click', (e) => {
      const btn = e.target.closest('.segment');
      if (!btn) return;
      Save.data.settings.quality = btn.dataset.quality;
      Save.persist();
      syncSettingsUI();
      Sound.click();
    });
    document.getElementById('btn-settings-fullscreen').addEventListener('click', () => { Sound.click(); toggleFullscreen(); });
    document.getElementById('btn-reset-progress').addEventListener('click', () => {
      Sound.click();
      if (!window.confirm('Reset ALL progress? This clears your coins, cars, tracks, upgrades, achievements and missions.')) return;
      Save.data = defaultSave();
      Save.persist();
      syncSettingsUI();
      renderMenuHome();
    });
  }

  function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        (document.documentElement.requestFullscreen || function () {}).call(document.documentElement).catch(() => {});
      } else {
        (document.exitFullscreen || function () {}).call(document).catch(() => {});
      }
    } catch (err) { /* Fullscreen API unavailable — game still works fine without it. */ }
  }

  function init() {
    Save.load();
    ensureDailyMissions();
    UI.init();
    Renderer.init();
    Sound.ensureContext();
    initInput();

    bindMenu();
    bindPauseOverlay();
    bindResultScreens();
    bindSettings();

    renderMenuHome();
    UI.showScreen('start');

    // Safety net: coin pickups during a race aren't persisted on
    // every single one (see updateCollisions) to keep the hot loop
    // cheap, so make sure an abrupt tab close still flushes whatever
    // was earned so far.
    window.addEventListener('beforeunload', () => { try { Save.persist(); } catch (err) { /* ignore */ } });
  }

  /* ============================================================
     20. BOOT SEQUENCE
  ============================================================ */

  const Boot = {
    screenEl: null, fillEl: null, hintEl: null,

    run(onReady) {
      this.screenEl = document.getElementById('loading-screen');
      this.fillEl = document.getElementById('loading-bar-fill');
      this.hintEl = document.getElementById('loading-hint');
      if (!this.screenEl) { onReady(); return; }

      const stages = [
        { pct: 35, hint: 'Warming up the engine…', delay: 110 },
        { pct: 70, hint: 'Painting the track…', delay: 130 },
        { pct: 100, hint: 'Lights out and away we go!', delay: 130 },
      ];
      let i = 0;
      const next = () => {
        if (i >= stages.length) { this.finish(onReady); return; }
        const stage = stages[i]; i += 1;
        if (this.fillEl) this.fillEl.style.width = `${stage.pct}%`;
        if (this.hintEl) this.hintEl.textContent = stage.hint;
        setTimeout(next, stage.delay);
      };
      next();
    },

    finish(onReady) {
      onReady();
      const screen = this.screenEl;
      if (!screen) return;
      screen.classList.add('fade-out');
      setTimeout(() => screen.remove(), 480);
    },
  };

  function boot() { Boot.run(init); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
