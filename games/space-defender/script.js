/* ==========================================================================
   SPACE DEFENDER
   Developed by Arihant · Anvora Games · © 2026
   Original vanilla-JS canvas arcade shooter. No frameworks, no external
   assets — every visual is drawn procedurally on <canvas>.

   UPGRADE PASS: combo system, Star Strike special ability, choice-based
   upgrades, persistent ship upgrades, new enemy roster, boss phases +
   warning, missions, daily challenge, random events, risk/reward crystals,
   near-miss bonus, multiple environments, game modes (Arcade/Survival/
   Boss Rush), floating combat text. Original systems preserved.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CANVAS SETUP
   ========================================================================== */
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resizeCanvas(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * DPR;
  canvas.height = H * DPR;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

/* ==========================================================================
   2. UTILITIES
   ========================================================================== */
const Util = {
  rand:(a,b) => Math.random()*(b-a)+a,
  randInt:(a,b) => Math.floor(Util.rand(a,b+1)),
  clamp:(v,a,b) => Math.max(a, Math.min(b,v)),
  lerp:(a,b,t) => a + (b-a)*t,
  dist:(x1,y1,x2,y2) => Math.hypot(x2-x1, y2-y1),
  choice:(arr) => arr[Math.floor(Math.random()*arr.length)],
  aabb:(a,b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y,
  fmtTime:(sec) => {
    const m = Math.floor(sec/60), s = Math.floor(sec%60);
    return `${m}m ${s}s`;
  },
  todayKey(){
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()+1}-${d.getDate()}`;
  }
};

/* ==========================================================================
   3. AUDIO MANAGER  (missing files never throw — always caught)
   ========================================================================== */
const AudioManager = {
  sounds:{},
  musicEl:null,
  musicVol:0.6,
  sfxVol:0.7,

  files:{
    shoot:'sounds/shoot.mp3',
    hit:'sounds/hit.mp3',
    explosion:'sounds/explosion.mp3',
    powerup:'sounds/powerup.mp3',
    coin:'sounds/coin.mp3',
    combo:'sounds/combo.mp3',
    bossWarning:'sounds/boss_warning.mp3',
    bossDefeat:'sounds/boss_defeat.mp3',
    click:'sounds/click.mp3',
    music:'sounds/music.mp3',
    special:'sounds/special.mp3'
  },

  init(){
    Object.entries(this.files).forEach(([key, src]) => {
      try{
        const a = new Audio();
        a.src = src;
        a.preload = 'auto';
        a.addEventListener('error', () => { /* silently ignore missing audio */ }, { once:false });
        this.sounds[key] = a;
      }catch(e){ /* ignore */ }
    });
    this.musicEl = this.sounds.music;
    if(this.musicEl){ this.musicEl.loop = true; }
  },

  play(key){
    const src = this.sounds[key];
    if(!src) return;
    try{
      const node = src.cloneNode();
      node.volume = this.sfxVol;
      const p = node.play();
      if(p && p.catch) p.catch(() => {});
    }catch(e){ /* ignore playback errors from missing files */ }
  },

  startMusic(){
    if(!this.musicEl) return;
    try{
      this.musicEl.volume = this.musicVol;
      const p = this.musicEl.play();
      if(p && p.catch) p.catch(() => {});
    }catch(e){ /* ignore */ }
  },

  stopMusic(){
    if(!this.musicEl) return;
    try{ this.musicEl.pause(); }catch(e){}
  },

  setMusicVol(v){ this.musicVol = v; if(this.musicEl) this.musicEl.volume = v; },
  setSfxVol(v){ this.sfxVol = v; }
};
AudioManager.init();

/* ==========================================================================
   4. SAVE / LOAD SYSTEM
   ========================================================================== */
const STORAGE_KEY = 'anvora-space-defender-save-v2';

const DEFAULT_SAVE = {
  highScore:0,
  bankCoins:0,
  hasSavedRun:false,
  savedMode:'arcade',
  settings:{
    musicVol:60, sfxVol:70, screenShake:true, difficulty:'normal',
    graphics:'high', touchControls:false, highContrast:false,
    language:'en', showFps:false
  },
  stats:{
    gamesPlayed:0, highestScore:0, highestCombo:0, enemiesDestroyed:0, bossesDefeated:0,
    coinsCollected:0, totalTimePlayed:0, shotsFired:0, hitsLanded:0, powerupsCollected:0
  },
  achievements:{},
  upgrades:{ damage:0, fireRate:0, shield:0, health:0, speed:0, missileDamage:0, specialCharge:0, coinMultiplier:0 },
  unlockedModes:{ survival:false, bossRush:false },
  dailyChallenge:{ date:'', target:50, progress:0, completed:false, claimed:false, noHitRun:true }
};

function deepMerge(base, override){
  const out = Array.isArray(base) ? [...base] : { ...base };
  Object.keys(override||{}).forEach(k => {
    if(override[k] && typeof override[k] === 'object' && !Array.isArray(override[k]) && base[k]){
      out[k] = deepMerge(base[k], override[k]);
    } else {
      out[k] = override[k];
    }
  });
  return out;
}

function loadSave(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    const parsed = JSON.parse(raw);
    return deepMerge(JSON.parse(JSON.stringify(DEFAULT_SAVE)), parsed);
  }catch(e){
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }
}

let SAVE = loadSave();

function persistSave(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(SAVE)); }catch(e){ /* storage unavailable */ }
}

/* ==========================================================================
   5. ACHIEVEMENTS  (20+ unlockable)
   ========================================================================== */
const ACHIEVEMENTS = [
  { id:'first_flight',  name:'First Flight',    desc:'Complete your first game.',                icon:'✈' },
  { id:'first_blood',   name:'First Blood',     desc:'Destroy your first enemy.',                 icon:'★' },
  { id:'ace_pilot',     name:'Ace Pilot',       desc:'Reach 10,000 points.',                      icon:'✦' },
  { id:'score_1000',    name:'Rising Star',     desc:'Score 1,000 points.',                       icon:'✦' },
  { id:'score_50000',   name:'Legend',          desc:'Score 50,000 points.',                      icon:'♛' },
  { id:'boss_breaker',  name:'Boss Breaker',    desc:'Defeat your first boss.',                   icon:'☠' },
  { id:'boss_slayer',   name:'Boss Slayer',     desc:'Defeat 5 bosses total.',                    icon:'☠' },
  { id:'enemies_100',   name:'100 Enemies',     desc:'Destroy 100 enemies total.',                icon:'✹' },
  { id:'enemies_500',   name:'Exterminator',    desc:'Destroy 500 enemies total.',                icon:'✹' },
  { id:'untouchable',   name:'Untouchable',     desc:'Clear a wave without taking damage.',       icon:'◈' },
  { id:'collector',     name:'Collector',       desc:'Collect 1,000 coins total.',                icon:'●' },
  { id:'coin_hoarder',  name:'Coin Hoarder',    desc:'Collect 500 coins total.',                  icon:'●' },
  { id:'veteran',       name:'Veteran Pilot',   desc:'Play 10 games.',                             icon:'✈' },
  { id:'sharp_shooter', name:'Sharp Shooter',   desc:'80% accuracy in a run (50+ shots).',        icon:'⊕' },
  { id:'survivor',      name:'Survivor',        desc:'Survive 5 minutes in one run.',             icon:'⏱' },
  { id:'wave_master',   name:'Wave Master',     desc:'Reach wave 20.',                             icon:'🛡' },
  { id:'space_hero',    name:'Space Hero',      desc:'Reach wave 10.',                             icon:'🛡' },
  { id:'perfectionist', name:'Perfectionist',   desc:'Beat a boss without losing HP or shield.',  icon:'◆' },
  { id:'speed_demon',   name:'Speed Demon',     desc:'Collect 5 Speed Boosts in one run.',        icon:'➤' },
  { id:'shieldmaster',  name:'Shieldmaster',    desc:'Block 50 damage with shield in one run.',   icon:'◈' },
  { id:'triple_threat', name:'Triple Threat',   desc:'Destroy 3 enemies within 1 second.',        icon:'✹' },
  { id:'combo_master',  name:'Combo Master',    desc:'Reach a 20-kill combo streak.',             icon:'⚡' },
  { id:'last_stand',    name:'Last Stand',      desc:'Survive a hit that leaves you on 1 HP.',    icon:'❤' },
  { id:'elite_hunter',  name:'Elite Hunter',    desc:'Destroy 3 Elite ships in one run.',         icon:'♦' },
];

const AchievementManager = {
  toastQueue:[], toastShowing:false,
  isUnlocked(id){ return !!SAVE.achievements[id]; },
  unlock(id){
    if(SAVE.achievements[id]) return;
    SAVE.achievements[id] = true;
    persistSave();
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if(def) this.queueToast(def.name);
    UI.renderAchievements();
  },
  queueToast(name){ this.toastQueue.push(name); this.tryShowToast(); },
  tryShowToast(){
    if(this.toastShowing || this.toastQueue.length === 0) return;
    this.toastShowing = true;
    const name = this.toastQueue.shift();
    const toast = document.getElementById('achievementToast');
    document.getElementById('toastName').textContent = name;
    toast.hidden = false;
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => { toast.hidden = true; this.toastShowing = false; this.tryShowToast(); }, 500);
    }, 2600);
  }
};

function showMissionToast(name){
  const toast = document.getElementById('missionToast');
  document.getElementById('missionToastName').textContent = name;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { toast.hidden = true; }, 500);
  }, 2400);
}

/* ==========================================================================
   6. INPUT MANAGER
   ========================================================================== */
const Input = {
  keys:{}, touchDir:{x:0,y:0}, firing:false,

  init(){
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code)) e.preventDefault();
      if(e.code === 'KeyP') Game.togglePause();
      if(e.code === 'Enter' && Game.state === 'gameover') Game.restart();
      if(e.code === 'KeyE' && Game.state === 'playing') Player.activateSpecial();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    const dpad = document.getElementById('touchDpad');
    dpad.querySelectorAll('button').forEach(btn => {
      const dir = btn.dataset.dir;
      const set = (on) => {
        const v = on ? 1 : 0;
        if(dir === 'up') this.touchDir.y = -v;
        if(dir === 'down') this.touchDir.y = v;
        if(dir === 'left') this.touchDir.x = -v;
        if(dir === 'right') this.touchDir.x = v;
      };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); set(true); }, { passive:false });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); set(false); }, { passive:false });
      btn.addEventListener('mousedown', () => set(true));
      btn.addEventListener('mouseup', () => set(false));
      btn.addEventListener('mouseleave', () => set(false));
    });

    const fireBtn = document.getElementById('touchFireBtn');
    const setFire = (on) => { this.firing = on; };
    fireBtn.addEventListener('touchstart', (e) => { e.preventDefault(); setFire(true); }, { passive:false });
    fireBtn.addEventListener('touchend', (e) => { e.preventDefault(); setFire(false); }, { passive:false });
    fireBtn.addEventListener('mousedown', () => setFire(true));
    fireBtn.addEventListener('mouseup', () => setFire(false));

    const specialBtn = document.getElementById('touchSpecialBtn');
    specialBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if(Game.state==='playing') Player.activateSpecial(); }, { passive:false });
    specialBtn.addEventListener('click', () => { if(Game.state==='playing') Player.activateSpecial(); });

    let swipeStart = null;
    canvas.addEventListener('touchstart', (e) => {
      if(Game.state !== 'playing') return;
      swipeStart = { x:e.touches[0].clientX, y:e.touches[0].clientY, px:Player.x, py:Player.y };
    }, { passive:true });
    canvas.addEventListener('touchmove', (e) => {
      if(!swipeStart || Game.state !== 'playing') return;
      const t = e.touches[0];
      Player.targetX = swipeStart.px + (t.clientX - swipeStart.x);
      Player.targetY = swipeStart.py + (t.clientY - swipeStart.y);
      Player.useDrag = true;
    }, { passive:true });
    canvas.addEventListener('touchend', () => { swipeStart = null; Player.useDrag = false; });
  },

  axis(){
    let x = 0, y = 0;
    if(this.keys['ArrowLeft'] || this.keys['KeyA']) x -= 1;
    if(this.keys['ArrowRight'] || this.keys['KeyD']) x += 1;
    if(this.keys['ArrowUp'] || this.keys['KeyW']) y -= 1;
    if(this.keys['ArrowDown'] || this.keys['KeyS']) y += 1;
    x += this.touchDir.x; y += this.touchDir.y;
    return { x:Util.clamp(x,-1,1), y:Util.clamp(y,-1,1) };
  },

  isFiring(){ return !!this.keys['Space'] || this.firing; }
};

/* ==========================================================================
   7. BACKGROUND — parallax starfield, nebula, multiple environments
   ========================================================================== */
const ENVIRONMENTS = [
  { name:'Earth Orbit',       tint:'4,10,24',   hues:['rgba(63,216,255,',  'rgba(120,180,255,', 'rgba(90,140,255,'] },
  { name:'Asteroid Belt',     tint:'14,10,6',   hues:['rgba(255,182,72,', 'rgba(200,140,90,',  'rgba(170,150,120,'] },
  { name:'Deep Space',        tint:'3,4,12',    hues:['rgba(120,140,255,','rgba(90,100,220,',  'rgba(150,160,255,'] },
  { name:'Alien Nebula',      tint:'12,4,18',   hues:['rgba(181,101,255,','rgba(255,95,200,',  'rgba(200,80,255,'] },
  { name:'Space Station',     tint:'6,10,10',   hues:['rgba(51,227,154,', 'rgba(63,216,255,',  'rgba(100,220,200,'] },
  { name:'Black Hole Region', tint:'2,2,6',     hues:['rgba(255,95,126,', 'rgba(140,60,180,',  'rgba(80,20,100,'] },
];

const Background = {
  layers:[[],[],[]], nebulae:[], envIndex:0,

  init(){
    this.layers = [[],[],[]];
    const counts = [70, 45, 25];
    counts.forEach((count, li) => {
      for(let i=0;i<count;i++){
        this.layers[li].push({ x:Util.rand(0,W), y:Util.rand(0,H), r:Util.rand(0.6,1.6)*(li+1)*0.6, speed:(li+1)*14, tw:Util.rand(0,Math.PI*2) });
      }
    });
    this.setEnvironment(0);
  },

  setEnvironment(idx){
    this.envIndex = idx % ENVIRONMENTS.length;
    const env = ENVIRONMENTS[this.envIndex];
    this.nebulae = [];
    for(let i=0;i<4;i++){
      this.nebulae.push({ x:Util.rand(0,W), y:Util.rand(0,H), r:Util.rand(180,340), hue:Util.choice(env.hues), drift:Util.rand(-4,4) });
    }
    document.getElementById('envChip').textContent = env.name;
  },

  update(dt){
    this.layers.forEach(layer => {
      layer.forEach(s => {
        s.y += s.speed*dt; s.tw += dt*2;
        if(s.y > H+4){ s.y = -4; s.x = Util.rand(0,W); }
      });
    });
    this.nebulae.forEach(n => {
      n.x += n.drift*dt;
      if(n.x < -n.r) n.x = W+n.r;
      if(n.x > W+n.r) n.x = -n.r;
    });
  },

  draw(){
    const tint = ENVIRONMENTS[this.envIndex].tint;
    ctx.fillStyle = `rgb(${tint})`;
    ctx.fillRect(0,0,W,H);

    this.nebulae.forEach(n => {
      const g = ctx.createRadialGradient(n.x,n.y,0,n.x,n.y,n.r);
      g.addColorStop(0, n.hue+'0.10)');
      g.addColorStop(1, n.hue+'0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(n.x,n.y,n.r,0,Math.PI*2); ctx.fill();
    });

    this.layers.forEach((layer, li) => {
      layer.forEach(s => {
        const alpha = 0.4 + 0.5*Math.sin(s.tw) * (li===2?0.5:1);
        ctx.fillStyle = `rgba(255,255,255,${Util.clamp(alpha,0.15,1)})`;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI*2); ctx.fill();
      });
    });
  }
};

/* ==========================================================================
   8. PARTICLE SYSTEM
   ========================================================================== */
const Particles = {
  list:[],
  spawnExplosion(x,y,color,count){
    const n = Settings.graphics === 'low' ? Math.floor(count*0.5) : count;
    for(let i=0;i<n;i++){
      const a = Util.rand(0, Math.PI*2), speed = Util.rand(40,220);
      this.list.push({ x,y, vx:Math.cos(a)*speed, vy:Math.sin(a)*speed, r:Util.rand(1.5,4), life:Util.rand(0.35,0.8), age:0, color });
    }
  },
  spawnFlame(x,y,dirY){
    if(Settings.graphics === 'low' && Math.random() > 0.5) return;
    this.list.push({ x:x+Util.rand(-3,3), y, vx:Util.rand(-10,10), vy:dirY*Util.rand(60,140), r:Util.rand(1.5,3.2), life:Util.rand(0.15,0.3), age:0, color: Math.random()>0.5?'63,216,255':'181,101,255' });
  },
  spawnSpark(x,y,color){
    this.list.push({ x,y, vx:Util.rand(-40,40), vy:Util.rand(-40,40), r:Util.rand(1,2.4), life:0.3, age:0, color });
  },
  spawnMuzzle(x,y){
    if(Settings.graphics === 'low') return;
    this.list.push({ x,y, vx:Util.rand(-20,20), vy:-Util.rand(20,60), r:Util.rand(2,3.5), life:0.12, age:0, color:'200,240,255' });
  },
  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const p = this.list[i];
      p.age += dt;
      if(p.age >= p.life){ this.list.splice(i,1); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    if(this.list.length > 500) this.list.splice(0, this.list.length-500);
  },
  draw(){
    this.list.forEach(p => {
      const t = 1 - p.age/p.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = `rgb(${p.color})`;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*t+0.4,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
};

/* ==========================================================================
   9. FLOATING TEXT  (score popups, NEAR MISS!, COMBO bursts, damage numbers)
   ========================================================================== */
const FloatingText = {
  list:[],
  spawn(x,y,text,color='255,255,255',size=14,life=0.9,vy=-46){
    if(Settings.graphics === 'low' && this.list.length > 24) return;
    this.list.push({ x,y,text,color,size,life,age:0,vy });
  },
  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const f = this.list[i];
      f.age += dt;
      if(f.age >= f.life){ this.list.splice(i,1); continue; }
      f.y += f.vy*dt;
      f.vy *= 0.94;
    }
  },
  draw(){
    this.list.forEach(f => {
      const t = 1 - f.age/f.life;
      ctx.save();
      ctx.globalAlpha = Util.clamp(t*1.4,0,1);
      ctx.font = `700 ${f.size}px 'Space Grotesk', sans-serif`;
      ctx.fillStyle = `rgb(${f.color})`;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();
    });
  }
};

/* ==========================================================================
   10. SETTINGS bridge
   ========================================================================== */
const Settings = {
  screenShake:true, difficulty:'normal', graphics:'high', touchControls:false, showFps:false,
  load(){
    const s = SAVE.settings;
    this.screenShake = s.screenShake; this.difficulty = s.difficulty; this.graphics = s.graphics;
    this.touchControls = s.touchControls; this.showFps = s.showFps;
    AudioManager.setMusicVol(s.musicVol/100); AudioManager.setSfxVol(s.sfxVol/100);
    document.body.classList.toggle('high-contrast', !!s.highContrast);
    document.getElementById('fpsCounter').hidden = !this.showFps;
    this.applyTouchVisibility();
  },
  applyTouchVisibility(){
    const isTouchDevice = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    const show = this.touchControls || isTouchDevice;
    document.getElementById('touchControls').classList.toggle('active', show && Game.state === 'playing');
  }
};

const DIFFICULTY_MULT = {
  easy:  { enemySpeed:0.8, enemyHp:0.75, spawnRate:0.8, enemyDamage:0.7, aggression:0.7 },
  normal:{ enemySpeed:1,   enemyHp:1,    spawnRate:1,   enemyDamage:1,   aggression:1   },
  hard:  { enemySpeed:1.25,enemyHp:1.4,  spawnRate:1.3, enemyDamage:1.3, aggression:1.35}
};

/* ==========================================================================
   11. SHIP UPGRADES (persistent meta-progression, spent with bank coins)
   ========================================================================== */
const UPGRADE_DEFS = {
  damage:        { label:'Weapon Damage',   max:5, base:60,  desc:'+2 base laser damage per level' },
  fireRate:      { label:'Fire Rate',       max:5, base:60,  desc:'Faster trigger — shorter cooldown' },
  shield:        { label:'Shield Capacity', max:5, base:55,  desc:'+15 max shield per level' },
  health:        { label:'Max Health',      max:5, base:55,  desc:'+15 max health per level' },
  speed:         { label:'Movement Speed',  max:5, base:45,  desc:'+18 ship speed per level' },
  missileDamage: { label:'Missile Damage',  max:5, base:65,  desc:'+6 missile damage per level' },
  specialCharge: { label:'Special Charge',  max:5, base:70,  desc:'Star Strike charges faster' },
  coinMultiplier:{ label:'Coin Magnet',     max:5, base:50,  desc:'+10% coin gain per level' },
};

const Upgrades = {
  cost(key){
    const lvl = SAVE.upgrades[key] || 0;
    const def = UPGRADE_DEFS[key];
    return Math.round(def.base * Math.pow(lvl+1, 1.55));
  },
  canBuy(key){
    const lvl = SAVE.upgrades[key] || 0;
    return lvl < UPGRADE_DEFS[key].max && SAVE.bankCoins >= this.cost(key);
  },
  buy(key){
    if(!this.canBuy(key)) return false;
    SAVE.bankCoins -= this.cost(key);
    SAVE.upgrades[key] = (SAVE.upgrades[key]||0) + 1;
    persistSave();
    AudioManager.play('click');
    return true;
  }
};

/* ==========================================================================
   12. PLAYER
   ========================================================================== */
const Player = {
  x:0, y:0, w:36, h:40, speed:340, targetX:0, targetY:0, useDrag:false,
  maxHealth:100, health:100, maxShield:60, shield:0, maxEnergy:100, energy:100,
  lives:3, score:0, coins:0,
  fireRate:0.22, fireCooldown:0, weapon:'normal', weaponTimer:0,
  activePowerups:{}, powerupsCollectedRun:0, speedBoostCollectedRun:0, shieldDamageBlockedRun:0,
  tookDamageThisWave:true, bossFightDamaged:false, invuln:0,

  combo:0, comboMultiplier:1, comboTimer:0, comboBestRun:0,
  special:0, maxSpecial:100, specialGainMult:1,
  eliteKillsRun:0,
  tilt:0, hitFlash:0, shotsSinceCharge:0,

  reset(){
    const up = SAVE.upgrades;
    this.maxHealth = 100 + up.health*15; this.health = this.maxHealth;
    this.maxShield = 60 + up.shield*15; this.shield = 0;
    this.maxEnergy = 100; this.energy = 100;
    this.speed = 340 + up.speed*18;
    this.lives = 3; this.score = 0; this.coins = 0;
    this.fireRate = Math.max(0.09, 0.22 - up.fireRate*0.022);
    this.baseDamage = 10 + up.damage*2;
    this.missileBonus = up.missileDamage*6;
    this.specialGainMult = 1 + up.specialCharge*0.18;
    this.coinGainMult = 1 + up.coinMultiplier*0.10;

    this.x = W/2; this.y = H - 120; this.targetX = this.x; this.targetY = this.y;
    this.fireCooldown = 0; this.weapon = 'normal'; this.weaponTimer = 0;
    this.activePowerups = {};
    this.powerupsCollectedRun = 0; this.speedBoostCollectedRun = 0; this.shieldDamageBlockedRun = 0;
    this.tookDamageThisWave = false; this.bossFightDamaged = false; this.invuln = 1.2;
    this.combo = 0; this.comboMultiplier = 1; this.comboTimer = 0; this.comboBestRun = 0;
    this.special = 0; this.eliteKillsRun = 0;
    this.lastStandTriggered = false;
    this.tilt = 0; this.hitFlash = 0; this.shotsSinceCharge = 0;
  },

  update(dt){
    const axis = Input.axis();
    const speedMult = this.activePowerups.speedBoost ? 1.6 : 1;

    if(this.useDrag){
      this.x = Util.lerp(this.x, this.targetX, 0.25);
      this.y = Util.lerp(this.y, this.targetY, 0.25);
    } else {
      this.x += axis.x * this.speed * speedMult * dt;
      this.y += axis.y * this.speed * speedMult * dt;
    }
    this.x = Util.clamp(this.x, this.w/2, W - this.w/2);
    this.y = Util.clamp(this.y, this.h/2, H - this.h/2);

    // banking tilt toward horizontal movement (purely visual, no layout/canvas resize)
    this.tilt = Util.lerp(this.tilt, Util.clamp(axis.x, -1, 1) * 0.32, 0.15);
    if(this.hitFlash > 0) this.hitFlash = Math.max(0, this.hitFlash - dt*4);

    if(Math.random() > 0.35) Particles.spawnFlame(this.x + Math.sin(this.tilt)*4, this.y + this.h/2, 1);

    this.energy = Util.clamp(this.energy + 14*dt, 0, this.maxEnergy);
    this.shield = Util.clamp(this.shield + 3*dt, 0, this.maxShield);

    this.fireCooldown -= dt;
    const rapid = this.activePowerups.rapidFire ? 0.45 : 1;
    if(Input.isFiring() && this.fireCooldown <= 0){
      this.shoot();
      this.fireCooldown = this.fireRate * rapid;
    }

    if(this.weaponTimer > 0){
      this.weaponTimer -= dt;
      if(this.weaponTimer <= 0){ this.weapon = 'normal'; }
    }

    Object.keys(this.activePowerups).forEach(key => {
      this.activePowerups[key] -= dt;
      if(this.activePowerups[key] <= 0) delete this.activePowerups[key];
    });

    if(this.invuln > 0) this.invuln -= dt;

    // combo decay
    if(this.combo > 0){
      this.comboTimer -= dt;
      if(this.comboTimer <= 0){ this.combo = 0; this.comboMultiplier = 1; UI.updateComboDisplay(false); }
    }
  },

  shoot(){
    Stats.shotsFired++;
    AudioManager.play('shoot');
    Particles.spawnMuzzle(this.x, this.y-this.h/2);
    const dmg = (this.baseDamage||10) * (this.activePowerups.doubleDamage ? 2 : 1);

    const fireOne = (offsetX, angle=0) => Bullets.spawnPlayer(this.x+offsetX, this.y - this.h/2, angle, dmg);

    switch(this.weapon){
      case 'double': fireOne(-9); fireOne(9); break;
      case 'triple': fireOne(0); fireOne(-14,-0.12); fireOne(14,0.12); break;
      case 'spread': for(let a=-0.34; a<=0.34; a+=0.17) fireOne(0,a); break;
      case 'beam': Bullets.spawnPlayer(this.x, this.y-this.h/2, 0, dmg*1.6, true); break;
      case 'missiles': Bullets.spawnMissile(this.x, this.y-this.h/2, dmg*1.8 + (this.missileBonus||0)); break;
      case 'plasma': Bullets.spawnPlasma(this.x, this.y-this.h/2, dmg*2.6); break;
      default: fireOne(0);
    }

    // charged shot — unlocked once the player has invested in weapon damage upgrades.
    // Rewards sustained fire with a periodic, visibly stronger bolt (no extra input needed).
    const chargeUnlocked = (SAVE.upgrades.damage||0) >= 3;
    if(chargeUnlocked){
      this.shotsSinceCharge++;
      if(this.shotsSinceCharge >= 8){
        this.shotsSinceCharge = 0;
        AudioManager.play('special');
        Particles.spawnMuzzle(this.x, this.y-this.h/2);
        Bullets.spawnPlayer(this.x, this.y-this.h/2, 0, dmg*3.2, false, true);
        FloatingText.spawn(this.x, this.y-this.h-14, 'CHARGED SHOT', '255,215,106', 13, 0.6);
      }
    }
  },

  activateSpecial(){
    if(this.special < this.maxSpecial) return;
    this.special = 0;
    AudioManager.play('special');
    Game.flashScreen();
    Game.shake(10, 0.35);
    const flashEl = document.getElementById('screenFlash');
    flashEl.classList.add('flash');
    setTimeout(() => flashEl.classList.remove('flash'), 90);

    let hitCount = 0;
    const targets = Enemies.boss ? [...Enemies.list, Enemies.boss] : [...Enemies.list];
    targets.forEach(e => {
      Particles.spawnExplosion(e.x, e.y, e.color, 10);
      const dmg = e.type === 'boss' ? 260 : 9999;
      const killed = Enemies.applyDamageTo(e, dmg);
      hitCount++;
    });
    if(hitCount > 0){
      const bonus = hitCount * 40;
      this.addScore(bonus, this.x, this.y - 60);
      FloatingText.spawn(this.x, this.y-70, 'STAR STRIKE!', '255,215,106', 22, 1.1);
    }
  },

  gainSpecial(amount){
    this.special = Util.clamp(this.special + amount*(this.specialGainMult||1), 0, this.maxSpecial);
  },

  registerKill(x,y){
    this.combo++;
    this.comboTimer = 2.4;
    this.comboBestRun = Math.max(this.comboBestRun, this.combo);
    if(this.combo > SAVE.stats.highestCombo) SAVE.stats.highestCombo = this.combo;

    const prevMult = this.comboMultiplier;
    if(this.combo >= 15) this.comboMultiplier = 5;
    else if(this.combo >= 10) this.comboMultiplier = 4;
    else if(this.combo >= 6) this.comboMultiplier = 3;
    else if(this.combo >= 3) this.comboMultiplier = 2;
    else this.comboMultiplier = 1;

    if(this.comboMultiplier !== prevMult){
      AudioManager.play('combo');
      UI.updateComboDisplay(true, true);
      FloatingText.spawn(x, y-30, `COMBO x${this.comboMultiplier}`, '255,215,106', 18, 1);
    } else {
      UI.updateComboDisplay(true, false);
    }

    if(this.combo === 20) AchievementManager.unlock('combo_master');

    // combo reward thresholds
    if(this.combo === 10){ this.coins += 20; }
    if(this.combo === 15){ this.activePowerups.rapidFire = Math.max(this.activePowerups.rapidFire||0, 4); }
    if(this.combo === 20){ this.gainSpecial(30); }

    this.gainSpecial(7);
  },

  shoot_() {},

  applyDamage(amount){
    if(this.invuln > 0) return;
    amount *= DIFFICULTY_MULT[Settings.difficulty].enemyDamage;
    this.tookDamageThisWave = true;
    if(Game.bossActive) this.bossFightDamaged = true;

    if(this.shield > 0){
      const absorbed = Math.min(this.shield, amount);
      this.shield -= absorbed;
      this.shieldDamageBlockedRun += absorbed;
      amount -= absorbed;
    }
    if(amount > 0){
      this.health -= amount;
      Game.shake(6, 0.25);
      this.invuln = 0.6;
      this.hitFlash = 0.15;
      AudioManager.play('hit');
      FloatingText.spawn(this.x, this.y-30, `-${Math.round(amount)}`, '255,95,126', 14, 0.7);
    }
    if(this.health > 0 && this.health <= 5 && !this.lastStandTriggered){
      this.lastStandTriggered = true;
      AchievementManager.unlock('last_stand');
    }
    if(this.health <= 0){
      this.health = 0;
      this.loseLife();
    }
  },

  loseLife(){
    this.lives--;
    Particles.spawnExplosion(this.x, this.y, '63,216,255', 40);
    Game.shake(14, 0.4);
    if(this.lives <= 0){
      Game.gameOver();
    } else {
      this.health = this.maxHealth;
      this.shield = Math.min(this.shield, this.maxShield*0.5);
      this.invuln = 2;
      this.x = W/2; this.y = H - 120;
      this.combo = 0; this.comboMultiplier = 1;
    }
  },

  addScore(v, fx, fy){
    const total = Math.round(v * (this.comboMultiplier||1));
    this.score += total;
    if(this.score > SAVE.highScore){ SAVE.highScore = this.score; }
    if(fx !== undefined) FloatingText.spawn(fx, fy, `+${total}`, '143,232,255', 14, 0.7);
    Achievements_checkScore();
  },

  addCoins(v){
    const mult = (this.activePowerups.coinMultiplier ? 2 : 1) * (this.coinGainMult||1);
    const total = Math.round(v*mult);
    this.coins += total;
    Stats.coinsCollected += total;
  },

  draw(){
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.tilt || 0);
    if(this.invuln > 0 && Math.floor(this.invuln*10)%2===0){ ctx.globalAlpha = 0.4; }

    if(this.shield > 0){
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.1*Math.sin(performance.now()/150);
      ctx.strokeStyle = '#3fd8ff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(0,0, this.w*0.95, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }
    if(this.special >= this.maxSpecial){
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.2*Math.sin(performance.now()/120);
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(0,0, this.w*1.1, 0, Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    // ---- engine exhaust flame (drawn behind the hull, flickers each frame) ----
    const flicker = 0.7 + 0.3*Math.sin(performance.now()/60);
    const flameLen = this.h*0.5*flicker;
    const flameGrad = ctx.createLinearGradient(0, this.h*0.32, 0, this.h*0.32+flameLen);
    flameGrad.addColorStop(0, 'rgba(180,240,255,0.95)');
    flameGrad.addColorStop(0.55, 'rgba(63,216,255,0.5)');
    flameGrad.addColorStop(1, 'rgba(63,216,255,0)');
    ctx.fillStyle = flameGrad;
    ctx.beginPath();
    ctx.moveTo(-this.w*0.15, this.h*0.32);
    ctx.lineTo(this.w*0.15, this.h*0.32);
    ctx.lineTo(0, this.h*0.32+flameLen);
    ctx.closePath(); ctx.fill();

    // ---- hull silhouette (nose cone -> shoulders -> base), reused for shading + flash ----
    const hullPath = () => {
      ctx.beginPath();
      ctx.moveTo(0, -this.h/2);
      ctx.quadraticCurveTo(this.w*0.5, -this.h*0.12, this.w*0.36, this.h*0.22);
      ctx.lineTo(this.w*0.30, this.h*0.34);
      ctx.lineTo(-this.w*0.30, this.h*0.34);
      ctx.lineTo(-this.w*0.36, this.h*0.22);
      ctx.quadraticCurveTo(-this.w*0.5, -this.h*0.12, 0, -this.h/2);
      ctx.closePath();
    };

    const bodyGrad = ctx.createLinearGradient(-this.w/2,0,this.w/2,0);
    bodyGrad.addColorStop(0,'#2a8fb0');
    bodyGrad.addColorStop(0.5,'#8fe8ff');
    bodyGrad.addColorStop(1,'#6a3fa8');
    ctx.fillStyle = bodyGrad;
    hullPath(); ctx.fill();

    // sheen overlay for depth
    const sheen = ctx.createLinearGradient(0,-this.h/2,0,this.h/2);
    sheen.addColorStop(0, 'rgba(63,216,255,0.35)');
    sheen.addColorStop(1, 'rgba(181,101,255,0.25)');
    ctx.fillStyle = sheen;
    hullPath(); ctx.fill();

    // side fins
    ctx.fillStyle = '#b565ff';
    ctx.beginPath();
    ctx.moveTo(this.w*0.28, this.h*0.05);
    ctx.lineTo(this.w*0.62, this.h*0.36);
    ctx.lineTo(this.w*0.22, this.h*0.34);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-this.w*0.28, this.h*0.05);
    ctx.lineTo(-this.w*0.62, this.h*0.36);
    ctx.lineTo(-this.w*0.22, this.h*0.34);
    ctx.closePath(); ctx.fill();

    // panel line
    ctx.strokeStyle = 'rgba(4,5,13,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0,-this.h*0.14); ctx.lineTo(0,this.h*0.28); ctx.stroke();

    // cockpit window
    const winGrad = ctx.createRadialGradient(0,-this.h*0.1,1,0,-this.h*0.1,7);
    winGrad.addColorStop(0,'#ffffff'); winGrad.addColorStop(1,'#8fe8ff');
    ctx.fillStyle = winGrad;
    ctx.beginPath(); ctx.ellipse(0,-this.h*0.1,5.2,6.2,0,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = 'rgba(4,5,13,0.5)'; ctx.lineWidth = 1; ctx.stroke();

    // glowing engine nozzle core
    ctx.save();
    ctx.shadowColor = 'rgba(143,232,255,0.9)'; ctx.shadowBlur = 12;
    ctx.fillStyle = '#eafcff';
    ctx.beginPath(); ctx.ellipse(0, this.h*0.33, this.w*0.13, 3.2, 0, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // hit-flash — brief white silhouette pulse the instant damage lands
    if(this.hitFlash > 0){
      ctx.save();
      ctx.globalAlpha = Util.clamp(this.hitFlash/0.15, 0, 1) * 0.85;
      ctx.fillStyle = '#ffffff';
      hullPath(); ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }
};

/* ==========================================================================
   13. BULLETS (player, enemy, missiles, plasma)
   ========================================================================== */
const Bullets = {
  player:[], enemy:[], missiles:[], plasma:[],
  reset(){ this.player=[]; this.enemy=[]; this.missiles=[]; this.plasma=[]; },

  spawnPlayer(x,y,angle,dmg,isBeam=false,charged=false){
    const w = charged ? 9 : (isBeam?6:4), h = charged ? 24 : (isBeam?26:14);
    this.player.push({ x,y, w,h, vx:Math.sin(angle)*560, vy:-Math.cos(angle)*(charged?620:560), dmg, isBeam, charged });
  },
  spawnMissile(x,y,dmg){ this.missiles.push({ x,y, w:6, h:16, vy:-260, dmg, turnSpeed:3.2 }); },
  spawnPlasma(x,y,dmg){ this.plasma.push({ x,y, r:9, vy:-260, dmg, pierced:new Set() }); },
  spawnEnemy(x,y,vx,vy,dmg,color='255,95,126'){ this.enemy.push({ x,y, w:6,h:12, vx,vy, dmg, color, nearMissChecked:false }); },

  update(dt){
    for(let i=this.player.length-1;i>=0;i--){
      const b = this.player[i];
      b.x += b.vx*dt; b.y += b.vy*dt;
      if(b.y < -30 || b.x < -30 || b.x > W+30){ this.player.splice(i,1); continue; }
    }
    for(let i=this.plasma.length-1;i>=0;i--){
      const p = this.plasma[i];
      p.x += (p.vx||0)*dt; p.y += p.vy*dt;
      if(Math.random()>0.6) Particles.spawnSpark(p.x,p.y,'181,101,255');
      if(p.y < -40){ this.plasma.splice(i,1); }
    }
    for(let i=this.missiles.length-1;i>=0;i--){
      const m = this.missiles[i];
      const target = Enemies.nearestTo(m.x, m.y);
      if(target){
        const desiredAngle = Math.atan2(target.y-m.y, target.x-m.x);
        const curAngle = Math.atan2(m.vy, m.vx || 0.001);
        const newAngle = curAngle + Util.clamp(desiredAngle-curAngle, -m.turnSpeed*dt, m.turnSpeed*dt);
        const speed = 420;
        m.vx = Math.cos(newAngle)*speed; m.vy = Math.sin(newAngle)*speed;
      } else { m.vy = -420; m.vx = 0; }
      m.x += m.vx*dt; m.y += m.vy*dt;
      if(Math.random()>0.5) Particles.spawnFlame(m.x, m.y+6, 1);
      if(m.y < -30 || m.y > H+30 || m.x < -30 || m.x > W+30) this.missiles.splice(i,1);
    }
    for(let i=this.enemy.length-1;i>=0;i--){
      const b = this.enemy[i];
      // near-miss check
      if(!b.nearMissChecked && Game.state === 'playing'){
        const d = Util.dist(b.x,b.y,Player.x,Player.y);
        if(d < 40){
          b.nearMissChecked = true;
          if(d > 20){
            Player.addScore(25, Player.x, Player.y-40);
            FloatingText.spawn(Player.x, Player.y-50, 'NEAR MISS!', '63,216,255', 15, 0.8);
          }
        }
      }
      b.x += b.vx*dt; b.y += b.vy*dt;
      if(b.y > H+30 || b.y < -30 || b.x < -30 || b.x > W+30){ this.enemy.splice(i,1); continue; }
    }
  },

  draw(){
    this.player.forEach(b => {
      ctx.save();
      if(b.charged){
        ctx.shadowColor = 'rgba(255,215,106,0.95)'; ctx.shadowBlur = 22;
        const g = ctx.createLinearGradient(0,b.y-b.h/2,0,b.y+b.h/2);
        g.addColorStop(0,'#fff3c4'); g.addColorStop(1,'#ffb648');
        ctx.fillStyle = g;
      } else {
        ctx.shadowColor = 'rgba(63,216,255,0.8)'; ctx.shadowBlur = b.isBeam?16:8;
        ctx.fillStyle = b.isBeam ? '#b565ff' : '#8fe8ff';
      }
      ctx.beginPath();
      if(ctx.roundRect) ctx.roundRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h, b.w/2);
      else ctx.rect(b.x-b.w/2, b.y-b.h/2, b.w, b.h);
      ctx.fill();
      ctx.restore();
    });
    this.plasma.forEach(p => {
      ctx.save();
      ctx.shadowColor = 'rgba(181,101,255,0.9)'; ctx.shadowBlur = 18;
      const g = ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,p.r);
      g.addColorStop(0,'#e6c9ff'); g.addColorStop(1,'#8b3fd8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
    this.missiles.forEach(m => {
      ctx.save();
      ctx.translate(m.x,m.y);
      ctx.rotate(Math.atan2(m.vy,m.vx)+Math.PI/2);
      ctx.fillStyle = '#ffb648';
      ctx.beginPath(); ctx.moveTo(0,-8); ctx.lineTo(4,8); ctx.lineTo(-4,8); ctx.closePath(); ctx.fill();
      ctx.restore();
    });
    this.enemy.forEach(b => {
      ctx.save();
      ctx.shadowColor = `rgba(${b.color},0.8)`; ctx.shadowBlur = 8;
      ctx.fillStyle = `rgb(${b.color})`;
      ctx.fillRect(b.x-b.w/2, b.y-b.h/2, b.w, b.h);
      ctx.restore();
    });
  }
};

/* ==========================================================================
   14. ENEMIES — Scout, Fighter, Tank, Kamikaze, Sniper, Shield Drone,
       Splitter, Swarmling, Elite, Asteroid (event hazard), Boss
   ========================================================================== */
let enemyIdCounter = 1;

const ENEMY_DEFS = {
  scout:      { hp:14,  speed:190, score:12, coins:1, color:'255,182,72', size:19, contactDmg:8  },
  fighter:    { hp:24,  speed:80,  score:14, coins:1, color:'63,216,255', size:23, contactDmg:11 },
  tank:       { hp:100, speed:34,  score:36, coins:3, color:'150,220,150',size:35, contactDmg:23 },
  kamikaze:   { hp:16,  speed:115, score:20, coins:2, color:'255,95,126', size:20, contactDmg:27 },
  zigzag:     { hp:18,  speed:120, score:16, coins:1, color:'120,255,190',size:20, contactDmg:10 },
  sniper:     { hp:30,  speed:48,  score:26, coins:2, color:'181,101,255',size:24, contactDmg:12 },
  shieldDrone:{ hp:34,  speed:42,  score:22, coins:2, color:'63,216,255', size:22, contactDmg:10 },
  splitter:   { hp:40,  speed:56,  score:24, coins:2, color:'255,215,106',size:28, contactDmg:16 },
  splitling:  { hp:10,  speed:110, score:6,  coins:0, color:'255,215,106',size:14, contactDmg:8  },
  swarmling:  { hp:8,   speed:150, score:8,  coins:0, color:'255,182,72', size:14, contactDmg:7  },
  elite:      { hp:190, speed:60,  score:90, coins:6, color:'255,120,200',size:38, contactDmg:26 },
  asteroid:   { hp:55,  speed:70,  score:10, coins:1, color:'170,150,120',size:30, contactDmg:18 },
  miniboss:   { hp:260, speed:44,  score:120,coins:8, color:'255,120,200',size:46, contactDmg:24 },
};

const Enemies = {
  list:[], boss:null,
  reset(){ this.list = []; this.boss = null; },

  spawn(type, x, y){
    const def = ENEMY_DEFS[type];
    const mult = DIFFICULTY_MULT[Settings.difficulty];
    const e = {
      id: enemyIdCounter++, type, x, y,
      w:def.size, h:def.size,
      hp: def.hp * mult.enemyHp, maxHp: def.hp * mult.enemyHp,
      speed: def.speed * mult.enemySpeed,
      score: def.score, coinValue: def.coins,
      color: def.color, contactDmg: def.contactDmg * mult.enemyDamage,
      t:0, fireTimer: Util.rand(0.6,2), anchorX:x, phase:Util.rand(0,Math.PI*2), shielded:false
    };
    this.list.push(e);
  },

  nearestTo(x,y){
    let best=null, bd=Infinity;
    const pool = this.boss ? [...this.list, this.boss] : this.list;
    pool.forEach(e => { const d = Util.dist(x,y,e.x,e.y); if(d<bd){ bd=d; best=e; } });
    return best;
  },

  spawnBoss(waveNum){
    const mult = DIFFICULTY_MULT[Settings.difficulty];
    this.boss = {
      id: enemyIdCounter++, type:'boss', x: W/2, y: -120, w:96, h:80,
      hp: (900 + waveNum*90) * mult.enemyHp, maxHp: (900 + waveNum*90) * mult.enemyHp,
      speed: 60 * mult.enemySpeed, score: 520, coinValue: 45,
      color:'255,95,126', contactDmg: 40*mult.enemyDamage,
      t:0, phase:0, entering:true, attackTimer:2, summonTimer:6, currentPhase:1
    };
    document.getElementById('bossBarWrap').hidden = false;
    document.getElementById('bossName').textContent = `SECTOR ${waveNum} COMMANDER`;
  },

  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const e = this.list[i];
      e.t += dt;
      // shielded status: within radius of an alive shieldDrone
      e.shielded = this.list.some(o => o !== e && o.type === 'shieldDrone' && Util.dist(e.x,e.y,o.x,o.y) < 90);
      this.moveEnemy(e, dt);
      this.maybeFire(e, dt);
      if(e.y > H+60){ this.list.splice(i,1); continue; }
    }
    if(this.boss) this.updateBoss(dt);
  },

  moveEnemy(e, dt){
    switch(e.type){
      case 'scout': e.y += e.speed*dt; e.x += Math.sin(e.t*5)*20*dt*5; break;
      case 'fighter': e.y += e.speed*dt; e.x = e.anchorX + Math.sin(e.t*1.6)*36; break;
      case 'tank': e.y += e.speed*dt; break;
      case 'shieldDrone': e.y += e.speed*dt*0.8; e.x = e.anchorX + Math.sin(e.t)*24; break;
      case 'splitter': e.y += e.speed*dt; break;
      case 'splitling': case 'swarmling': e.y += e.speed*dt; e.x += Math.sin(e.t*6+e.phase)*30*dt; break;
      case 'elite': e.y += e.speed*dt*0.7; e.x = W/2 + Math.sin(e.t*0.6)*(W*0.28); break;
      case 'kamikaze': {
        const dx = Player.x - e.x, dy = Player.y - e.y, d = Math.hypot(dx,dy)||1;
        e.x += (dx/d)*e.speed*dt; e.y += (dy/d)*e.speed*dt*1.2;
        break;
      }
      case 'zigzag': {
        e.zTimer = (e.zTimer||0) + dt;
        if(e.zTimer > 0.4){ e.zDir = -(e.zDir||1); e.zTimer = 0; }
        e.y += e.speed*dt;
        e.x += (e.zDir||1) * 170 * dt;
        break;
      }
      case 'sniper':
        if(e.y < 130) e.y += e.speed*dt; else e.x += Math.sin(e.t*1.4)*30*dt;
        break;
      case 'asteroid':
        e.y += e.speed*dt*0.8; e.x += Math.sin(e.phase)*10*dt; e.rot = (e.rot||0)+dt*0.6;
        break;
      case 'miniboss':
        if(e.y < 110) e.y += e.speed*dt; else e.x = W/2 + Math.sin(e.t*0.8)*(W*0.3);
        break;
    }
    e.x = Util.clamp(e.x, e.w/2, W-e.w/2);
  },

  maybeFire(e, dt){
    if(!['sniper','tank','miniboss','elite'].includes(e.type)) return;
    if(e.y < 60) return;
    e.fireTimer -= dt;
    if(e.fireTimer <= 0){
      const dx = Player.x-e.x, dy = Player.y-e.y, d = Math.hypot(dx,dy)||1;
      const speed = 220;
      if(e.type === 'miniboss' || e.type === 'elite'){
        for(let a=-0.3;a<=0.3;a+=0.3){
          const ang = Math.atan2(dy,dx)+a;
          Bullets.spawnEnemy(e.x,e.y, Math.cos(ang)*speed, Math.sin(ang)*speed, e.contactDmg*0.5, e.color);
        }
        e.fireTimer = Util.rand(1.6,2.4);
      } else {
        Bullets.spawnEnemy(e.x,e.y, (dx/d)*speed, (dy/d)*speed, e.contactDmg*0.4, e.color);
        e.fireTimer = e.type==='tank' ? Util.rand(1.8,2.6) : Util.rand(1.1,1.8);
      }
    }
  },

  updateBoss(dt){
    const b = this.boss;
    b.t += dt;
    if(b.entering){
      b.y += 40*dt;
      if(b.y >= 110){ b.y = 110; b.entering = false; }
      return;
    }
    const hpPct = b.hp/b.maxHp;
    let phase = 1;
    if(hpPct <= 0.25) phase = 4;
    else if(hpPct <= 0.5) phase = 3;
    else if(hpPct <= 0.75) phase = 2;
    if(phase !== b.currentPhase){
      b.currentPhase = phase;
      document.getElementById('bossPhase').textContent = phase === 4 ? 'PHASE 4 — ENRAGED' : `PHASE ${phase}`;
      Game.showEventBanner(phase === 4 ? '⚠ COMMANDER ENRAGED ⚠' : `BOSS PHASE ${phase}`);
    }
    const enrage = phase === 4 ? 1.6 : phase === 3 ? 1.25 : 1;

    b.x = W/2 + Math.sin(b.t*0.5*enrage)*(W*0.32);

    b.attackTimer -= dt;
    if(b.attackTimer <= 0){
      const pattern = Util.randInt(0, phase >= 3 ? 3 : 1);
      if(pattern === 0){
        for(let a=-0.5;a<=0.5;a+=0.125){
          Bullets.spawnEnemy(b.x,b.y+30, Math.sin(a)*260*enrage, Math.cos(a)*260, b.contactDmg*0.35, b.color);
        }
      } else if(pattern === 1){
        const dx=Player.x-b.x, dy=Player.y-b.y, d=Math.hypot(dx,dy)||1;
        Bullets.spawnEnemy(b.x,b.y+30,(dx/d)*300,(dy/d)*300, b.contactDmg*0.5, '255,182,72');
        Bullets.spawnMissile ? null : null;
      } else if(pattern === 2){
        for(let i=0;i<3;i++) Bullets.spawnEnemy(b.x-40+i*40, b.y+30, Util.rand(-40,40), 260, b.contactDmg*0.3, b.color);
      } else {
        // phase 3+ special: radial burst
        for(let a=0;a<Math.PI*2;a+=Math.PI/8){
          Bullets.spawnEnemy(b.x,b.y, Math.cos(a)*220, Math.sin(a)*220, b.contactDmg*0.3, '255,95,126');
        }
      }
      b.attackTimer = Util.rand(1.2,2) / enrage;
    }

    b.summonTimer -= dt;
    const summonThreshold = phase >= 2 ? 14 : 10;
    if(b.summonTimer <= 0 && this.list.length < summonThreshold){
      this.spawn(Math.random()>0.5?'scout':'fighter', Util.rand(60,W-60), -30);
      b.summonTimer = Util.rand(4,7) / enrage;
    }
  },

  applyDamageTo(e, dmg){
    if(e.shielded && e !== this.boss) dmg *= 0.25;
    e.hp -= dmg;
    Particles.spawnSpark(e.x + Util.rand(-8,8), e.y + Util.rand(-8,8), e.color);
    AudioManager.play('hit');
    if(e.hp <= 0){ this.kill(e); return true; }
    return false;
  },

  kill(e){
    Particles.spawnExplosion(e.x, e.y, e.color, e.type==='boss'?90:24);
    AudioManager.play('explosion');
    Game.shake(e.type==='boss'?18:4, e.type==='boss'?0.5:0.15);
    Player.addScore(e.score, e.x, e.y);
    Player.addCoins(e.coinValue);
    Player.registerKill(e.x, e.y);
    Stats.enemiesDestroyed++;
    Stats.hitsLanded++;
    Game.registerKillTiming();
    Missions.notifyKill(e.type);

    if(e.type === 'elite'){
      Player.eliteKillsRun++;
      if(Player.eliteKillsRun >= 3) AchievementManager.unlock('elite_hunter');
    }

    if(e === this.boss){
      this.boss = null;
      document.getElementById('bossBarWrap').hidden = true;
      Stats.bossesDefeated++;
      AchievementManager.unlock('boss_breaker');
      if(SAVE.stats.bossesDefeated + Stats.bossesDefeated >= 5) AchievementManager.unlock('boss_slayer');
      if(!Player.bossFightDamaged) AchievementManager.unlock('perfectionist');
      if(!SAVE.unlockedModes.bossRush){ SAVE.unlockedModes.bossRush = true; persistSave(); }
      AudioManager.play('bossDefeat');
      Missions.notifyBossDefeated();
      // guaranteed reward drop — boss fights should always pay off
      PowerUps.spawn(e.x - 34, e.y);
      PowerUps.spawn(e.x + 34, e.y);
      if(Game.mode !== 'bossRush') Game.showWaveBanner('BOSS DEFEATED', true);
      Game.onBossDefeated();
    } else {
      const idx = this.list.indexOf(e);
      if(idx >= 0) this.list.splice(idx,1);

      if(e.type === 'splitter'){
        for(let i=0;i<2;i++) this.spawn('splitling', e.x+Util.rand(-14,14), e.y);
      }

      if(Math.random() < 0.16) PowerUps.spawn(e.x, e.y);
    }

    if(Stats.enemiesDestroyed === 1) AchievementManager.unlock('first_blood');
    if(Stats.enemiesDestroyed >= 100) AchievementManager.unlock('enemies_100');
    if(Stats.enemiesDestroyed >= 500) AchievementManager.unlock('enemies_500');
  },

  drawEnemy(e){
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.shadowColor = `rgba(${e.color},0.6)`; ctx.shadowBlur = 10;
    ctx.fillStyle = `rgb(${e.color})`;

    switch(e.type){
      case 'scout':
        ctx.beginPath(); ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,e.h/2); ctx.lineTo(-e.w/2,e.h/2); ctx.closePath(); ctx.fill();
        break;
      case 'fighter':
        ctx.beginPath(); ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,0); ctx.lineTo(0,e.h/2); ctx.lineTo(-e.w/2,0); ctx.closePath(); ctx.fill();
        break;
      case 'tank':
        ctx.beginPath();
        for(let i=0;i<6;i++){ const a=i*Math.PI/3; const px=Math.cos(a)*e.w/2, py=Math.sin(a)*e.h/2; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
        ctx.closePath(); ctx.fill();
        break;
      case 'kamikaze':
        ctx.rotate(Math.PI);
        ctx.beginPath(); ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,e.h/2); ctx.lineTo(0,e.h*0.2); ctx.lineTo(-e.w/2,e.h/2); ctx.closePath(); ctx.fill();
        break;
      case 'zigzag':
        ctx.rotate((e.zDir||1) * 0.28);
        ctx.beginPath();
        ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,e.h*0.15); ctx.lineTo(e.w*0.15,e.h/2);
        ctx.lineTo(-e.w*0.15,e.h/2); ctx.lineTo(-e.w/2,e.h*0.15);
        ctx.closePath(); ctx.fill();
        break;
      case 'sniper':
        ctx.beginPath();
        ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w*0.4,e.h*0.1); ctx.lineTo(e.w/2,e.h/2); ctx.lineTo(-e.w/2,e.h/2); ctx.lineTo(-e.w*0.4,e.h*0.1);
        ctx.closePath(); ctx.fill();
        break;
      case 'shieldDrone':
        ctx.beginPath(); ctx.arc(0,0,e.w/2,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = 'rgba(63,216,255,0.5)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(0,0,e.w*1.6,0,Math.PI*2); ctx.stroke();
        break;
      case 'splitter':
        ctx.beginPath();
        for(let i=0;i<5;i++){ const a=i*(Math.PI*2/5)-Math.PI/2; const px=Math.cos(a)*e.w/2, py=Math.sin(a)*e.h/2; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
        ctx.closePath(); ctx.fill();
        break;
      case 'splitling': case 'swarmling':
        ctx.beginPath(); ctx.arc(0,0,e.w/2,0,Math.PI*2); ctx.fill();
        break;
      case 'elite':
        ctx.beginPath();
        ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w*0.45,-e.h*0.05); ctx.lineTo(e.w/2,e.h/2); ctx.lineTo(0,e.h*0.22); ctx.lineTo(-e.w/2,e.h/2); ctx.lineTo(-e.w*0.45,-e.h*0.05);
        ctx.closePath(); ctx.fill();
        break;
      case 'asteroid':
        ctx.rotate(e.rot||0);
        ctx.beginPath();
        for(let i=0;i<7;i++){ const a=i*(Math.PI*2/7); const rad=(e.w/2)*(0.75+0.25*Math.sin(i*13.7)); const px=Math.cos(a)*rad, py=Math.sin(a)*rad; i===0?ctx.moveTo(px,py):ctx.lineTo(px,py); }
        ctx.closePath(); ctx.fill();
        break;
      case 'miniboss':
        ctx.beginPath();
        ctx.moveTo(0,-e.h/2); ctx.lineTo(e.w/2,0); ctx.lineTo(e.w*0.3,e.h/2); ctx.lineTo(-e.w*0.3,e.h/2); ctx.lineTo(-e.w/2,0);
        ctx.closePath(); ctx.fill();
        break;
    }
    ctx.restore();

    if(e.shielded){
      ctx.save();
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = '#3fd8ff'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(e.x,e.y,e.w*0.85,0,Math.PI*2); ctx.stroke();
      ctx.restore();
    }

    if(['tank','sniper','miniboss','elite','splitter'].includes(e.type)){
      const pct = Util.clamp(e.hp/e.maxHp,0,1);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(e.x-e.w/2, e.y-e.h/2-10, e.w, 4);
      ctx.fillStyle = pct>0.4 ? '#33e39a' : '#ff5f7e';
      ctx.fillRect(e.x-e.w/2, e.y-e.h/2-10, e.w*pct, 4);
    }
  },

  drawBoss(){
    const b = this.boss;
    if(!b) return;
    ctx.save();
    ctx.translate(b.x,b.y);
    const enraged = b.currentPhase === 4;
    ctx.shadowColor = enraged ? 'rgba(255,40,40,0.9)' : 'rgba(255,95,126,0.7)';
    ctx.shadowBlur = enraged ? 30 : 22;
    const grad = ctx.createLinearGradient(0,-b.h/2,0,b.h/2);
    grad.addColorStop(0, enraged ? '#ff2222' : '#ff5f7e'); grad.addColorStop(1,'#b565ff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0,-b.h/2); ctx.lineTo(b.w/2, b.h*0.1); ctx.lineTo(b.w*0.34, b.h/2); ctx.lineTo(-b.w*0.34, b.h/2); ctx.lineTo(-b.w/2, b.h*0.1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(0,0,10,0,Math.PI*2); ctx.fill();
    ctx.restore();

    document.getElementById('bossBarFill').style.width = `${Util.clamp(b.hp/b.maxHp,0,1)*100}%`;
  },

  draw(){ this.list.forEach(e => this.drawEnemy(e)); this.drawBoss(); }
};

/* ==========================================================================
   15. POWER-UPS + RISK/REWARD CRYSTAL
   ========================================================================== */
const POWERUP_DEFS = {
  shield:        { label:'Shield',        color:'63,216,255',  duration:0,  weapon:false },
  doubleDamage:  { label:'Double Damage', color:'255,95,126',  duration:10, weapon:false },
  speedBoost:    { label:'Speed Boost',   color:'255,182,72',  duration:8,  weapon:false },
  slowMotion:    { label:'Slow Motion',   color:'181,101,255', duration:6,  weapon:false },
  healthPack:    { label:'Health Pack',   color:'51,227,154',  duration:0,  weapon:false },
  magnet:        { label:'Magnet',        color:'255,215,106', duration:9,  weapon:false },
  coinMultiplier:{ label:'Coin x2',       color:'255,215,106', duration:12, weapon:false },
  rapidFire:     { label:'Rapid Fire',    color:'63,216,255',  duration:8,  weapon:false },
  double:        { label:'Double Laser',  color:'63,216,255',  duration:10, weapon:true },
  triple:        { label:'Triple Laser',  color:'181,101,255', duration:10, weapon:true },
  spread:        { label:'Spread Shot',   color:'181,101,255', duration:10, weapon:true },
  beam:          { label:'Laser Beam',    color:'255,95,126',  duration:8,  weapon:true },
  missiles:      { label:'Missiles',      color:'255,182,72',  duration:10, weapon:true },
  plasma:        { label:'Plasma Cannon', color:'181,101,255', duration:9,  weapon:true },
};
const POWERUP_KEYS = Object.keys(POWERUP_DEFS);

// Weapon "level" ladder shown in the HUD — normal is always Level 1.
const WEAPON_LEVELS = {
  normal:  { lvl:1, name:'Single Laser' },
  double:  { lvl:2, name:'Double Laser' },
  triple:  { lvl:3, name:'Triple Laser' },
  spread:  { lvl:4, name:'Spread Shot'  },
  plasma:  { lvl:5, name:'Plasma Cannon' },
  beam:    { lvl:5, name:'Laser Beam' },
  missiles:{ lvl:5, name:'Missiles' },
};

const PowerUps = {
  list:[], crystals:[],
  reset(){ this.list = []; this.crystals = []; },

  spawn(x,y){
    const key = Util.choice(POWERUP_KEYS);
    this.list.push({ x,y, key, vy:60, t:0 });
  },

  spawnCrystal(x,y){
    this.crystals.push({ x,y, vy:50, t:0 });
  },

  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const p = this.list[i];
      p.t += dt;
      if(Player.activePowerups.magnet || Util.dist(p.x,p.y,Player.x,Player.y) < 90){
        const dx=Player.x-p.x, dy=Player.y-p.y, d=Math.hypot(dx,dy)||1;
        p.x += (dx/d)*260*dt; p.y += (dy/d)*260*dt;
      } else { p.y += p.vy*dt; }
      if(p.y > H+30){ this.list.splice(i,1); continue; }
      if(Util.dist(p.x,p.y,Player.x,Player.y) < 26){ this.collect(p); this.list.splice(i,1); }
    }
    for(let i=this.crystals.length-1;i>=0;i--){
      const c = this.crystals[i];
      c.t += dt; c.y += c.vy*dt;
      if(c.y > H+30){ this.crystals.splice(i,1); continue; }
      if(Util.dist(c.x,c.y,Player.x,Player.y) < 28){
        Player.addScore(500, c.x, c.y);
        Player.addCoins(30);
        Player.combo += 3; Player.comboTimer = 2.4;
        FloatingText.spawn(c.x, c.y-20, 'CRYSTAL SECURED', '255,215,106', 16, 1);
        AudioManager.play('coin');
        this.crystals.splice(i,1);
      }
    }
  },

  collect(p){
    const def = POWERUP_DEFS[p.key];
    AudioManager.play('powerup');
    Player.powerupsCollectedRun++;
    Stats.powerupsCollected++;
    if(Player.powerupsCollectedRun >= 10) AchievementManager.unlock('collector');

    if(p.key === 'healthPack'){
      Player.health = Util.clamp(Player.health + 40, 0, Player.maxHealth);
    } else if(p.key === 'shield'){
      Player.shield = Util.clamp(Player.shield + 40, 0, Player.maxShield);
    } else if(def.weapon){
      Player.weapon = p.key; Player.weaponTimer = def.duration;
    } else {
      Player.activePowerups[p.key] = def.duration;
      if(p.key === 'speedBoost'){
        Player.speedBoostCollectedRun++;
        if(Player.speedBoostCollectedRun >= 5) AchievementManager.unlock('speed_demon');
      }
    }
    FloatingText.spawn(p.x, p.y-20, def.label, `rgb(${def.color})`.replace('rgb(','').replace(')',''), 13, 0.8);
  },

  draw(){
    this.list.forEach(p => {
      const def = POWERUP_DEFS[p.key];
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(p.t*4)*4);
      ctx.shadowColor = `rgba(${def.color},0.9)`; ctx.shadowBlur = 16;
      ctx.fillStyle = `rgb(${def.color})`;
      ctx.beginPath(); ctx.arc(0,0,12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#04050d';
      ctx.font = '600 11px Space Grotesk, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(def.label[0], 0, 1);
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.font = '600 11px Inter, sans-serif';
      ctx.fillStyle = '#f3f4fc';
      ctx.textAlign = 'center';
      ctx.fillText(def.label, p.x, p.y - 22);
      ctx.restore();
    });

    this.crystals.forEach(c => {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(c.t*3)*5);
      ctx.rotate(c.t*1.4);
      ctx.shadowColor = 'rgba(255,215,106,0.95)'; ctx.shadowBlur = 22;
      ctx.fillStyle = '#ffe9a8';
      ctx.beginPath();
      ctx.moveTo(0,-14); ctx.lineTo(10,0); ctx.lineTo(0,14); ctx.lineTo(-10,0);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.9;
      ctx.font = '700 11px Inter, sans-serif';
      ctx.fillStyle = '#ffd76a'; ctx.textAlign = 'center';
      ctx.fillText('ENERGY CRYSTAL', c.x, c.y - 26);
      ctx.restore();
    });
  }
};

/* ==========================================================================
   16. CHOICE-BASED UPGRADE POPUP
   ========================================================================== */
const CHOICE_POOL = [
  { key:'triple',       icon:'⋮', name:'Triple Laser',  desc:'Three-shot spread forward' },
  { key:'shieldBoost',  icon:'◈', name:'Energy Shield',  desc:'+50 shield instantly' },
  { key:'rapidFire',    icon:'➤', name:'Rapid Fire',     desc:'Faster trigger for 12s' },
  { key:'spread',       icon:'✺', name:'Spread Shot',    desc:'Wide five-way spray' },
  { key:'missiles',     icon:'☄', name:'Missiles',       desc:'Homing rockets' },
  { key:'plasma',       icon:'●', name:'Plasma Cannon',  desc:'Slow, heavy piercing orb' },
  { key:'doubleDamage', icon:'⚔', name:'Double Damage',  desc:'2x weapon damage for 12s' },
  { key:'healthBoost',  icon:'❤', name:'Repair Kit',     desc:'+50 hull health instantly' },
];

const ChoicePopup = {
  active:false,
  open(){
    this.active = true;
    Game.state = 'choice';
    const picks = [];
    const pool = [...CHOICE_POOL];
    while(picks.length < 3 && pool.length){
      picks.push(pool.splice(Util.randInt(0,pool.length-1),1)[0]);
    }
    const wrap = document.getElementById('choiceOptions');
    wrap.innerHTML = '';
    picks.forEach(opt => {
      const div = document.createElement('div');
      div.className = 'choice-option';
      div.innerHTML = `<span class="co-icon">${opt.icon}</span><span class="co-name">${opt.name}</span><span class="co-desc">${opt.desc}</span>`;
      div.addEventListener('click', () => this.select(opt.key));
      wrap.appendChild(div);
    });
    UI.showScreen('choicePopup');
  },
  select(key){
    if(key === 'shieldBoost') Player.shield = Util.clamp(Player.shield+50, 0, Player.maxShield);
    else if(key === 'healthBoost') Player.health = Util.clamp(Player.health+50, 0, Player.maxHealth);
    else if(key === 'doubleDamage') Player.activePowerups.doubleDamage = 12;
    else if(key === 'rapidFire') Player.activePowerups.rapidFire = 12;
    else if(['triple','spread','missiles','plasma'].includes(key)){ Player.weapon = key; Player.weaponTimer = 14; }
    AudioManager.play('powerup');
    this.active = false;
    Game.state = 'playing';
    UI.hideAllScreens();
  }
};

/* ==========================================================================
   17. MISSIONS  (per-run objectives)
   ========================================================================== */
const MISSION_POOL = [
  { id:'kill20',   text:'Destroy 20 enemies',   target:20, type:'kills',  reward:80  },
  { id:'survive60',text:'Survive 60 seconds',   target:60, type:'time',   reward:80  },
  { id:'combo10',  text:'Reach a x10 combo',    target:10, type:'combo',  reward:100 },
  { id:'elite3',   text:'Destroy 3 Elite ships',target:3,  type:'elite',  reward:120 },
  { id:'boss1',    text:'Defeat the boss',      target:1,  type:'boss',   reward:150 },
];

const Missions = {
  active:[],
  assign(){
    const pool = [...MISSION_POOL];
    this.active = [];
    for(let i=0;i<2 && pool.length;i++){
      const m = pool.splice(Util.randInt(0,pool.length-1),1)[0];
      this.active.push({ ...m, progress:0, complete:false });
    }
    UI.renderMissionTracker();
  },
  notifyKill(type){
    this.active.forEach(m => {
      if(m.complete) return;
      if(m.type === 'kills') m.progress++;
      if(m.type === 'elite' && type === 'elite') m.progress++;
      this.checkComplete(m);
    });
    UI.renderMissionTracker();
  },
  notifyBossDefeated(){
    this.active.forEach(m => { if(m.type==='boss' && !m.complete){ m.progress=1; this.checkComplete(m); } });
    UI.renderMissionTracker();
  },
  tick(dt){
    let changed = false;
    this.active.forEach(m => {
      if(m.complete) return;
      if(m.type === 'time'){ m.progress += dt; if(this.checkComplete(m)) changed = true; }
      if(m.type === 'combo' && Player.combo > m.progress){ m.progress = Player.combo; if(this.checkComplete(m)) changed = true; }
    });
    if(changed) UI.renderMissionTracker();
  },
  checkComplete(m){
    if(m.progress >= m.target && !m.complete){
      m.complete = true;
      Player.coins += m.reward;
      showMissionToast(`${m.text} (+${m.reward} coins)`);
      return true;
    }
    return false;
  }
};

/* ==========================================================================
   18. DAILY CHALLENGE
   ========================================================================== */
const DailyChallenge = {
  ensureToday(){
    const today = Util.todayKey();
    if(SAVE.dailyChallenge.date !== today){
      SAVE.dailyChallenge = { date:today, target:50, progress:0, completed:false, claimed:false, noHitRun:true };
      persistSave();
    }
  },
  notifyKill(){
    if(SAVE.dailyChallenge.completed) return;
    if(!SAVE.dailyChallenge.noHitRun) return;
    SAVE.dailyChallenge.progress++;
    if(SAVE.dailyChallenge.progress >= SAVE.dailyChallenge.target){
      SAVE.dailyChallenge.completed = true;
    }
    persistSave();
  },
  notifyDamageTaken(){
    if(!SAVE.dailyChallenge.completed){
      SAVE.dailyChallenge.noHitRun = false;
      SAVE.dailyChallenge.progress = 0;
      persistSave();
    }
  },
  claim(){
    if(!SAVE.dailyChallenge.completed || SAVE.dailyChallenge.claimed) return;
    SAVE.dailyChallenge.claimed = true;
    SAVE.bankCoins += 500;
    persistSave();
    UI.renderMissionsScreen();
    UI.renderMenuInfo();
  }
};

/* ==========================================================================
   19. RANDOM EVENTS
   ========================================================================== */
const RandomEvents = {
  timer:0,
  reset(){ this.timer = Util.rand(18,28); },
  update(dt){
    if(Game.mode === 'bossRush') return;
    this.timer -= dt;
    if(this.timer <= 0){
      this.trigger(Util.choice(['meteorStorm','alienSwarm','supplyDrop','eliteInvasion']));
      this.timer = Util.rand(24,36);
    }
  },
  trigger(kind){
    if(kind === 'meteorStorm'){
      Game.showEventBanner('☄ METEOR STORM');
      for(let i=0;i<8;i++) setTimeout(() => { if(Game.state==='playing') Enemies.spawn('asteroid', Util.rand(40,W-40), -40); }, i*180);
    } else if(kind === 'alienSwarm'){
      Game.showEventBanner('⚠ ALIEN SWARM INBOUND');
      for(let i=0;i<10;i++) setTimeout(() => { if(Game.state==='playing') Enemies.spawn('swarmling', Util.rand(40,W-40), -30); }, i*120);
    } else if(kind === 'supplyDrop'){
      Game.showEventBanner('◈ SUPPLY DROP');
      PowerUps.spawn(Util.rand(80,W-80), -30);
    } else if(kind === 'eliteInvasion'){
      Game.showEventBanner('♦ ELITE INVASION');
      Enemies.spawn('elite', W/2, -50);
    }
    // rare risk/reward crystal, independent chance
    if(Math.random() < 0.5) PowerUps.spawnCrystal(Util.rand(80,W-80), -50);
  }
};

/* ==========================================================================
   20. STATS
   ========================================================================== */
const Stats = {
  shotsFired:0, hitsLanded:0, enemiesDestroyed:0, bossesDefeated:0,
  coinsCollected:0, powerupsCollected:0, sessionTime:0, killTimestamps:[],

  resetRun(){
    this.shotsFired=0; this.hitsLanded=0; this.sessionTime=0; this.killTimestamps=[];
  },
  flushToSave(){
    SAVE.stats.shotsFired += this.shotsFired;
    SAVE.stats.enemiesDestroyed += this.enemiesDestroyed;
    SAVE.stats.bossesDefeated += this.bossesDefeated;
    SAVE.stats.coinsCollected += this.coinsCollected;
    SAVE.stats.powerupsCollected += this.powerupsCollected;
    SAVE.stats.totalTimePlayed += this.sessionTime;
    this.enemiesDestroyed=0; this.bossesDefeated=0; this.coinsCollected=0; this.powerupsCollected=0;
    persistSave();
  }
};

function Achievements_checkScore(){
  if(Player.score >= 1000) AchievementManager.unlock('score_1000');
  if(Player.score >= 10000) AchievementManager.unlock('ace_pilot');
  if(Player.score >= 50000) AchievementManager.unlock('score_50000');
  if(SAVE.stats.coinsCollected + Stats.coinsCollected >= 500) AchievementManager.unlock('coin_hoarder');
  if(SAVE.stats.coinsCollected + Stats.coinsCollected >= 1000) AchievementManager.unlock('collector');
}

/* ==========================================================================
   21. WAVE MANAGER  (branches by game mode)
   ========================================================================== */
const Waves = {
  wave:1, spawnQueue:[], spawnTimer:0, waveClearedPause:0, inBossWave:false, pendingBossWarning:false,

  reset(){
    this.wave = 1; this.spawnQueue = []; this.spawnTimer = 0; this.waveClearedPause = 0;
    this.inBossWave = false; this.pendingBossWarning = false;
    Background.setEnvironment(0);
    this.buildWave();
  },

  buildWave(){
    Player.tookDamageThisWave = false;

    if(Game.mode === 'bossRush'){
      this.inBossWave = true;
      Game.bossActive = true;
      this.triggerBossWithWarning();
      return;
    }

    this.inBossWave = (this.wave % 5 === 0);
    if(this.inBossWave){
      this.spawnQueue = [];
      Game.bossActive = true;
      this.triggerBossWithWarning();
      return;
    }

    Game.bossActive = false;
    const mult = DIFFICULTY_MULT[Settings.difficulty];
    const baseCount = Game.mode === 'survival' ? 8 + this.wave*2.4 : 6 + this.wave*2;
    const count = Math.round(baseCount * mult.spawnRate);
    const pool = this.enemyPoolForWave();
    this.spawnQueue = [];
    for(let i=0;i<count;i++) this.spawnQueue.push(Util.choice(pool));
    if(this.wave % 3 === 0) this.spawnQueue.push('miniboss');
    if(this.wave % 4 === 0) this.spawnQueue.push('elite');

    // cycle environment every 3 waves
    if(this.wave % 3 === 1) Background.setEnvironment(Math.floor(this.wave/3) % ENVIRONMENTS.length);
  },

  triggerBossWithWarning(){
    const warn = document.getElementById('bossWarning');
    warn.hidden = false;
    AudioManager.play('bossWarning');
    setTimeout(() => { warn.hidden = true; }, 1900);
    setTimeout(() => { if(Game.state==='playing') Enemies.spawnBoss(this.wave); }, 2000);
  },

  enemyPoolForWave(){
    const pool = ['fighter','fighter','scout'];
    if(this.wave >= 2) pool.push('kamikaze','zigzag');
    if(this.wave >= 3) pool.push('sniper','asteroid');
    if(this.wave >= 4) pool.push('tank','shieldDrone');
    if(this.wave >= 5) pool.push('splitter');
    return pool;
  },

  update(dt){
    if(this.inBossWave) return;

    this.spawnTimer -= dt;
    if(this.spawnTimer <= 0 && this.spawnQueue.length){
      const type = this.spawnQueue.shift();
      Enemies.spawn(type, Util.rand(50, W-50), -40);
      this.spawnTimer = Util.rand(0.45, 1.05);
    }

    if(this.spawnQueue.length === 0 && Enemies.list.length === 0){
      this.completeWave();
    }
  },

  completeWave(){
    if(this.waveClearedPause > 0) return;
    this.waveClearedPause = 1.6;
    if(!Player.tookDamageThisWave) AchievementManager.unlock('untouchable');
    Game.showWaveBanner(`WAVE ${this.wave} CLEARED`);

    if(!SAVE.unlockedModes.survival && this.wave >= 5){ SAVE.unlockedModes.survival = true; persistSave(); }

    setTimeout(() => {
      this.wave++;
      document.getElementById('waveNum').textContent = this.wave;
      if(this.wave >= 10) AchievementManager.unlock('space_hero');
      if(this.wave >= 20) AchievementManager.unlock('wave_master');

      const offerChoice = Game.mode !== 'survival' && !this.inBossWave && Math.random() < 0.55;
      this.buildWave();
      this.waveClearedPause = 0;

      if(offerChoice && Game.state === 'playing') ChoicePopup.open();
    }, 1500);
  }
};

/* ==========================================================================
   22. UI MANAGER
   ========================================================================== */
const UI = {
  screens:['mainMenu','modeMenu','upgradesMenu','missionsMenu','settingsMenu','statsMenu','achievementsMenu','instructionsMenu','creditsMenu','choicePopup','pauseMenu','gameOverMenu'],

  showScreen(id){ this.screens.forEach(s => document.getElementById(s).classList.toggle('active', s === id)); },
  hideAllScreens(){ this.screens.forEach(s => document.getElementById(s).classList.remove('active')); },

  renderMenuInfo(){
    document.getElementById('menuBestScore').textContent = SAVE.highScore;
    document.getElementById('menuBankCoins').textContent = SAVE.bankCoins;
    document.getElementById('continueBtn').disabled = !SAVE.hasSavedRun;
    this.renderDailyChip();
    this.renderModeLocks();
  },

  renderDailyChip(){
    DailyChallenge.ensureToday();
    const d = SAVE.dailyChallenge;
    document.getElementById('dailyDesc').textContent = d.completed
      ? (d.claimed ? 'Completed — claimed!' : 'Complete! Claim your reward.')
      : `Destroy ${d.target} enemies without losing a life (${d.progress}/${d.target})`;
  },

  renderModeLocks(){
    document.getElementById('survivalLock').style.display = SAVE.unlockedModes.survival ? 'none' : '';
    document.getElementById('bossRushLock').style.display = SAVE.unlockedModes.bossRush ? 'none' : '';
    document.getElementById('survivalBtn').classList.toggle('btn-primary', SAVE.unlockedModes.survival);
    document.getElementById('survivalBtn').classList.toggle('btn-ghost', !SAVE.unlockedModes.survival);
    document.getElementById('bossRushBtn').classList.toggle('btn-primary', SAVE.unlockedModes.bossRush);
    document.getElementById('bossRushBtn').classList.toggle('btn-ghost', !SAVE.unlockedModes.bossRush);
  },

  renderUpgrades(){
    document.getElementById('upgradesCoins').textContent = SAVE.bankCoins;
    const grid = document.getElementById('upgradeGrid');
    grid.innerHTML = '';
    Object.entries(UPGRADE_DEFS).forEach(([key, def]) => {
      const lvl = SAVE.upgrades[key] || 0;
      const maxed = lvl >= def.max;
      const cost = Upgrades.cost(key);
      const card = document.createElement('div');
      card.className = 'upgrade-card';
      const dots = Array.from({length:def.max}, (_,i) => `<span class="${i<lvl?'filled':''}"></span>`).join('');
      card.innerHTML = `
        <b>${def.label}</b>
        <div class="upgrade-dots">${dots}</div>
        <span class="upgrade-cost">${def.desc}</span>
        ${maxed
          ? `<span class="upgrade-maxed">MAX LEVEL</span>`
          : `<button class="btn btn-primary" data-upgrade="${key}" ${SAVE.bankCoins<cost?'disabled':''}>Upgrade — ${cost} coins</button>`}
      `;
      grid.appendChild(card);
    });
    grid.querySelectorAll('[data-upgrade]').forEach(btn => {
      btn.addEventListener('click', () => { if(Upgrades.buy(btn.dataset.upgrade)) this.renderUpgrades(); });
    });
  },

  renderMissionsScreen(){
    DailyChallenge.ensureToday();
    const d = SAVE.dailyChallenge;
    document.getElementById('missionsDailyDesc').textContent = `Destroy ${d.target} enemies in a single run without losing a life.`;
    document.getElementById('missionsDailyFill').style.width = `${Util.clamp(d.progress/d.target,0,1)*100}%`;
    document.getElementById('missionsDailyStatus').textContent = `${Math.min(d.progress,d.target)} / ${d.target}`;
    const claimBtn = document.getElementById('claimDailyBtn');
    claimBtn.disabled = !d.completed || d.claimed;
    claimBtn.textContent = d.claimed ? 'Claimed' : 'Claim +500';
  },

  bindSettingsInputs(){
    const s = SAVE.settings;
    document.getElementById('musicRange').value = s.musicVol;
    document.getElementById('sfxRange').value = s.sfxVol;
    document.getElementById('shakeToggle').checked = s.screenShake;
    document.getElementById('difficultySelect').value = s.difficulty;
    document.getElementById('graphicsSelect').value = s.graphics;
    document.getElementById('touchToggle').checked = s.touchControls;
    document.getElementById('darkToggle').checked = s.highContrast;
    document.getElementById('langSelect').value = s.language;
    document.getElementById('fpsToggle').checked = s.showFps;

    const save = () => { persistSave(); Settings.load(); };
    document.getElementById('musicRange').oninput = (e) => { s.musicVol = +e.target.value; save(); };
    document.getElementById('sfxRange').oninput = (e) => { s.sfxVol = +e.target.value; save(); };
    document.getElementById('shakeToggle').onchange = (e) => { s.screenShake = e.target.checked; save(); };
    document.getElementById('difficultySelect').onchange = (e) => { s.difficulty = e.target.value; save(); };
    document.getElementById('graphicsSelect').onchange = (e) => { s.graphics = e.target.value; save(); };
    document.getElementById('touchToggle').onchange = (e) => { s.touchControls = e.target.checked; save(); };
    document.getElementById('darkToggle').onchange = (e) => { s.highContrast = e.target.checked; save(); };
    document.getElementById('langSelect').onchange = (e) => { s.language = e.target.value; save(); };
    document.getElementById('fpsToggle').onchange = (e) => { s.showFps = e.target.checked; document.getElementById('fpsCounter').hidden = !s.showFps; save(); };
  },

  renderStats(){
    const s = SAVE.stats;
    const accuracy = s.shotsFired > 0 ? Math.round((s.hitsLanded/s.shotsFired)*100) : 0;
    document.querySelector('[data-stat="gamesPlayed"]').textContent = s.gamesPlayed;
    document.querySelector('[data-stat="highestScore"]').textContent = s.highestScore;
    document.querySelector('[data-stat="highestCombo"]').textContent = s.highestCombo;
    document.querySelector('[data-stat="enemiesDestroyed"]').textContent = s.enemiesDestroyed;
    document.querySelector('[data-stat="bossesDefeated"]').textContent = s.bossesDefeated;
    document.querySelector('[data-stat="coinsCollected"]').textContent = s.coinsCollected;
    document.querySelector('[data-stat="powerupsCollected"]').textContent = s.powerupsCollected;
    document.querySelector('[data-stat="totalTimePlayedDisplay"]').textContent = Util.fmtTime(s.totalTimePlayed);
    document.querySelector('[data-stat="shotsFired"]').textContent = s.shotsFired;
    document.querySelector('[data-stat="accuracyDisplay"]').textContent = accuracy + '%';
  },

  renderAchievements(){
    const grid = document.getElementById('achievementGrid');
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const unlocked = AchievementManager.isUnlocked(a.id);
      const card = document.createElement('div');
      card.className = 'ach-card' + (unlocked ? ' unlocked' : '');
      card.innerHTML = `<span class="ach-icon">${a.icon}</span><b>${a.name}</b><p>${unlocked ? a.desc : '???'}</p>`;
      grid.appendChild(card);
    });
  },

  renderMissionTracker(){
    const wrap = document.getElementById('missionTracker');
    wrap.innerHTML = '';
    Missions.active.forEach(m => {
      const row = document.createElement('div');
      row.className = 'mt-item' + (m.complete ? ' done' : '');
      const target = m.type === 'time' ? Math.ceil(m.target) : m.target;
      const progress = m.type === 'time' ? Math.min(Math.ceil(m.progress), target) : Math.min(Math.floor(m.progress), target);
      row.innerHTML = `<span class="mt-check"></span>${m.text} (${progress}/${target})`;
      wrap.appendChild(row);
    });
  },

  updateComboDisplay(show, pulse){
    const el = document.getElementById('comboDisplay');
    if(!show || Player.combo < 2){ el.classList.remove('show'); return; }
    document.getElementById('comboText').textContent = `COMBO x${Player.comboMultiplier} (${Player.combo})`;
    el.classList.add('show');
    if(pulse){ el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse'); }
  },

  updateHud(){
    document.getElementById('healthFill').style.width = `${Util.clamp(Player.health/Player.maxHealth,0,1)*100}%`;
    document.getElementById('shieldFill').style.width = `${Util.clamp(Player.shield/Player.maxShield,0,1)*100}%`;
    document.getElementById('energyFill').style.width = `${Util.clamp(Player.energy/Player.maxEnergy,0,1)*100}%`;
    document.getElementById('specialFill').style.width = `${Util.clamp(Player.special/Player.maxSpecial,0,1)*100}%`;
    document.getElementById('scoreDisp').textContent = Player.score;
    document.getElementById('bestDisp').textContent = Math.max(SAVE.highScore, Player.score);
    document.getElementById('coinsDisp').textContent = Player.coins;
    document.getElementById('waveNum').textContent = Waves.wave;
    document.getElementById('waveModeLabel').textContent = Game.mode === 'bossRush' ? 'BOSS' : 'WAVE';

    const wl = WEAPON_LEVELS[Player.weapon] || WEAPON_LEVELS.normal;
    document.getElementById('weaponChip').textContent = `LV${wl.lvl} · ${wl.name}`;

    document.getElementById('touchSpecialBtn').classList.toggle('ready', Player.special >= Player.maxSpecial);

    const timers = document.getElementById('powerupTimers');
    timers.innerHTML = '';
    Object.entries(Player.activePowerups).forEach(([key, remaining]) => {
      const def = POWERUP_DEFS[key];
      if(!def || !def.duration) return;
      const pct = Util.clamp(remaining/def.duration,0,1)*100;
      const row = document.createElement('div');
      row.className = 'pu-timer';
      row.innerHTML = `<span class="pu-dot" style="background:rgb(${def.color})"></span>${def.label}<div class="pu-bar"><div class="pu-bar-fill" style="width:${pct}%"></div></div>`;
      timers.appendChild(row);
    });
    if(Player.weapon !== 'normal'){
      const def = POWERUP_DEFS[Player.weapon];
      if(def){
        const pct = Util.clamp(Player.weaponTimer/def.duration,0,1)*100;
        const row = document.createElement('div');
        row.className = 'pu-timer';
        row.innerHTML = `<span class="pu-dot" style="background:rgb(${def.color})"></span>${def.label}<div class="pu-bar"><div class="pu-bar-fill" style="width:${pct}%"></div></div>`;
        timers.appendChild(row);
      }
    }
  }
};

/* ==========================================================================
   23. GAME STATE MACHINE + MAIN LOOP
   ========================================================================== */
const Game = {
  state:'menu', mode:'arcade', bossActive:false,
  shakeMag:0, shakeTime:0, lastKillTimes:[], lastFrame:0, fpsSmoothed:60,

  init(){
    Input.init();
    Settings.load();
    UI.renderMenuInfo();
    UI.bindSettingsInputs();
    UI.renderStats();
    UI.renderAchievements();
    Background.init();
    this.bindButtons();
    requestAnimationFrame(this.loop.bind(this));
  },

  bindButtons(){
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if(btn){
        AudioManager.play('click');
        const action = btn.dataset.action;
        switch(action){
          case 'open-modes': UI.renderModeLocks(); UI.showScreen('modeMenu'); break;
          case 'start-arcade': this.startNewGame('arcade'); break;
          case 'start-survival': if(SAVE.unlockedModes.survival) this.startNewGame('survival'); break;
          case 'start-bossrush': if(SAVE.unlockedModes.bossRush) this.startNewGame('bossRush'); break;
          case 'continue-game': this.startNewGame(SAVE.savedMode || 'arcade'); break;
          case 'open-upgrades': UI.renderUpgrades(); UI.showScreen('upgradesMenu'); break;
          case 'open-missions': UI.renderMissionsScreen(); UI.showScreen('missionsMenu'); break;
          case 'open-settings': UI.showScreen('settingsMenu'); break;
          case 'open-stats': UI.renderStats(); UI.showScreen('statsMenu'); break;
          case 'open-achievements': UI.renderAchievements(); UI.showScreen('achievementsMenu'); break;
          case 'open-credits': UI.showScreen('creditsMenu'); break;
          case 'open-instructions': UI.showScreen('instructionsMenu'); break;
          case 'back-to-menu':
            if(this.state === 'paused'){ UI.showScreen('pauseMenu'); }
            else { UI.showScreen('mainMenu'); UI.renderMenuInfo(); }
            break;
          case 'pause-game': this.togglePause(); break;
          case 'resume-game': this.togglePause(); break;
          case 'restart-game': this.startNewGame(this.mode); break;
          case 'quit-to-menu': this.quitToMenu(); break;
        }
      }
      if(e.target.id === 'claimDailyBtn'){ DailyChallenge.claim(); }
    });
  },

  startNewGame(mode){
    this.mode = mode || 'arcade';
    this.state = 'playing';
    this.bossActive = false;
    Player.reset();
    Bullets.reset();
    Enemies.reset();
    PowerUps.reset();
    Waves.reset();
    Stats.resetRun();
    Missions.assign();
    RandomEvents.reset();
    DailyChallenge.ensureToday();
    document.getElementById('bossBarWrap').hidden = true;
    document.getElementById('hud').classList.add('active');
    UI.hideAllScreens();
    Settings.applyTouchVisibility();
    AudioManager.startMusic();
    SAVE.stats.gamesPlayed++;
    SAVE.hasSavedRun = true;
    SAVE.savedMode = this.mode;
    persistSave();
    UI.renderMenuInfo();
    if(SAVE.stats.gamesPlayed >= 10) AchievementManager.unlock('veteran');
  },

  togglePause(){
    if(this.state === 'playing'){
      this.state = 'paused';
      UI.showScreen('pauseMenu');
      AudioManager.stopMusic();
    } else if(this.state === 'paused'){
      this.state = 'playing';
      UI.hideAllScreens();
      AudioManager.startMusic();
    }
  },

  quitToMenu(){
    this.state = 'menu';
    document.getElementById('hud').classList.remove('active');
    document.getElementById('touchControls').classList.remove('active');
    AudioManager.stopMusic();
    Stats.flushToSave();
    UI.renderMenuInfo();
    UI.showScreen('mainMenu');
  },

  gameOver(){
    this.state = 'gameover';
    document.getElementById('hud').classList.remove('active');
    document.getElementById('touchControls').classList.remove('active');
    document.getElementById('bossBarWrap').hidden = true;
    AudioManager.stopMusic();

    if(Player.score > SAVE.highScore) SAVE.highScore = Player.score;
    SAVE.stats.highestScore = Math.max(SAVE.stats.highestScore, Player.score);
    SAVE.bankCoins += Player.coins;
    Stats.flushToSave();
    persistSave();

    AchievementManager.unlock('first_flight');
    if(Stats.shotsFired >= 50){
      const acc = Stats.hitsLanded/Stats.shotsFired;
      if(acc >= 0.8) AchievementManager.unlock('sharp_shooter');
    }
    if(Stats.sessionTime >= 300) AchievementManager.unlock('survivor');
    if(Player.shieldDamageBlockedRun >= 50) AchievementManager.unlock('shieldmaster');

    document.getElementById('finalScoreDisp').textContent = Player.score;
    document.getElementById('finalBestDisp').textContent = SAVE.highScore;
    document.getElementById('finalEnemiesDisp').textContent = Stats.enemiesDestroyed || SAVE.stats.enemiesDestroyed;
    document.getElementById('finalComboDisp').textContent = `x${Math.max(1, Player.comboBestRun ? Math.min(5, Player.comboMultiplier) : 1)} (${Player.comboBestRun} kills)`;
    document.getElementById('finalCoinsDisp').textContent = Player.coins;
    UI.showScreen('gameOverMenu');
    UI.renderMenuInfo();
  },

  restart(){ this.startNewGame(this.mode); },

  onBossDefeated(){
    this.bossActive = false;
    if(this.mode === 'bossRush'){
      Waves.wave++;
      document.getElementById('waveNum').textContent = Waves.wave;
      Game.showWaveBanner('COMMANDER DOWN', true);
      setTimeout(() => { if(Game.state==='playing') ChoicePopup.open(); }, 1200);
      setTimeout(() => { if(Game.state==='playing' && !ChoicePopup.active) Waves.buildWave(); }, 1600);
      // ensure boss respawns after choice popup closes if it opened
      const check = setInterval(() => {
        if(Game.state !== 'playing'){ clearInterval(check); return; }
        if(!ChoicePopup.active && !Enemies.boss){ Waves.buildWave(); clearInterval(check); }
      }, 400);
    } else {
      Waves.completeWave();
    }
  },

  registerKillTiming(){
    const now = performance.now();
    this.lastKillTimes.push(now);
    this.lastKillTimes = this.lastKillTimes.filter(t => now - t < 1000);
    if(this.lastKillTimes.length >= 3) AchievementManager.unlock('triple_threat');
    DailyChallenge.notifyKill();
  },

  shake(mag, time){
    if(!Settings.screenShake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  },

  flashScreen(){ /* handled inline in Player.activateSpecial for timing precision */ },

  showWaveBanner(text, gold=false){
    const el = document.getElementById('waveBanner');
    el.textContent = text;
    el.classList.toggle('gold', gold);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; el.classList.remove('gold'); }, 400); }, 1300);
  },

  showEventBanner(text){
    const el = document.getElementById('eventBanner');
    el.textContent = text;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => { el.hidden = true; }, 400); }, 1800);
  },

  checkCollisions(){
    for(let i=Bullets.player.length-1;i>=0;i--){
      const b = Bullets.player[i];
      let hit = false;
      for(let j=Enemies.list.length-1;j>=0;j--){
        const e = Enemies.list[j];
        if(Util.dist(b.x,b.y,e.x,e.y) < (e.w/2 + b.w/2)){
          Enemies.applyDamageTo(e, b.dmg);
          hit = true;
          if(!b.isBeam) break;
        }
      }
      if(!hit && Enemies.boss && Util.dist(b.x,b.y,Enemies.boss.x,Enemies.boss.y) < (Enemies.boss.w/2)){
        Enemies.applyDamageTo(Enemies.boss, b.dmg);
        hit = true;
      }
      if(hit && !b.isBeam) Bullets.player.splice(i,1);
    }

    for(let i=Bullets.plasma.length-1;i>=0;i--){
      const p = Bullets.plasma[i];
      let hit = false;
      for(let j=Enemies.list.length-1;j>=0;j--){
        const e = Enemies.list[j];
        if(p.pierced.has(e.id)) continue;
        if(Util.dist(p.x,p.y,e.x,e.y) < (e.w/2+p.r)){
          Enemies.applyDamageTo(e, p.dmg);
          p.pierced.add(e.id);
          hit = true;
        }
      }
      if(Enemies.boss && !p.pierced.has(Enemies.boss.id) && Util.dist(p.x,p.y,Enemies.boss.x,Enemies.boss.y) < (Enemies.boss.w/2+p.r)){
        Enemies.applyDamageTo(Enemies.boss, p.dmg);
        p.pierced.add(Enemies.boss.id);
      }
    }

    for(let i=Bullets.missiles.length-1;i>=0;i--){
      const m = Bullets.missiles[i];
      let hit = false;
      for(let j=Enemies.list.length-1;j>=0;j--){
        const e = Enemies.list[j];
        if(Util.dist(m.x,m.y,e.x,e.y) < (e.w/2+6)){ Enemies.applyDamageTo(e, m.dmg); hit = true; break; }
      }
      if(!hit && Enemies.boss && Util.dist(m.x,m.y,Enemies.boss.x,Enemies.boss.y) < Enemies.boss.w/2){
        Enemies.applyDamageTo(Enemies.boss, m.dmg);
        hit = true;
      }
      if(hit){ Particles.spawnExplosion(m.x,m.y,'255,182,72',14); Bullets.missiles.splice(i,1); }
    }

    for(let i=Bullets.enemy.length-1;i>=0;i--){
      const b = Bullets.enemy[i];
      if(Util.dist(b.x,b.y,Player.x,Player.y) < 20){
        Player.applyDamage(b.dmg);
        DailyChallenge.notifyDamageTaken();
        Bullets.enemy.splice(i,1);
      }
    }

    Enemies.list.forEach(e => {
      if(Util.dist(e.x,e.y,Player.x,Player.y) < (e.w/2 + 16)){
        Player.applyDamage(e.contactDmg * 0.5);
        DailyChallenge.notifyDamageTaken();
      }
    });
    if(Enemies.boss && Util.dist(Enemies.boss.x,Enemies.boss.y,Player.x,Player.y) < (Enemies.boss.w/2+16)){
      Player.applyDamage(Enemies.boss.contactDmg*0.4);
      DailyChallenge.notifyDamageTaken();
    }
  },

  update(dt){
    if(this.state !== 'playing') return;

    Stats.sessionTime += dt;
    const slow = Player.activePowerups.slowMotion ? 0.45 : 1;

    Background.update(dt);
    Player.update(dt);
    Bullets.update(dt);
    Enemies.update(dt * slow);
    Waves.update(dt);
    PowerUps.update(dt);
    Particles.update(dt);
    FloatingText.update(dt);
    RandomEvents.update(dt);
    Missions.tick(dt);
    this.checkCollisions();
    UI.updateHud();

    if(this.shakeTime > 0){ this.shakeTime -= dt; } else { this.shakeMag = 0; }
  },

  draw(){
    ctx.save();
    if(this.shakeMag > 0){
      ctx.translate(Util.rand(-this.shakeMag,this.shakeMag), Util.rand(-this.shakeMag,this.shakeMag));
    }
    Background.draw();
    if(this.state === 'playing' || this.state === 'paused' || this.state === 'choice'){
      PowerUps.draw();
      Enemies.draw();
      Bullets.draw();
      Particles.draw();
      Player.draw();
      FloatingText.draw();
    }
    ctx.restore();
  },

  loop(ts){
    const dt = Math.min((ts - (this.lastFrame||ts))/1000, 0.05);
    this.lastFrame = ts;

    if(dt > 0){
      const fps = 1/dt;
      this.fpsSmoothed = Util.lerp(this.fpsSmoothed, fps, 0.1);
      if(Settings.showFps) document.getElementById('fpsCounter').textContent = `${Math.round(this.fpsSmoothed)} FPS`;
    }

    this.update(dt);
    this.draw();
    requestAnimationFrame(this.loop.bind(this));
  }
};

/* ==========================================================================
   24. INIT
   ========================================================================== */
window.addEventListener('load', () => {
  Game.init();
});
