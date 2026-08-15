/* ==========================================================================
   BRICK BY BRICK
   Anvora Games
   Original vanilla-JS canvas arcade brick-breaker. No frameworks, no
   external assets — every visual is drawn procedurally, every sound is
   synthesized with the Web Audio API.
   ========================================================================== */

'use strict';

/* ==========================================================================
   1. CONFIGURATION
   ---------------------------------------------------------------------
   All gameplay math happens in a fixed LOGICAL coordinate system
   (ARENA_W x ARENA_H). The canvas is scaled — never stretched — to fit
   whatever space the flex layout gives it, so physics behave identically
   on a phone or a monitor.
   ========================================================================== */
const CFG = {
  ARENA_W: 400,
  ARENA_H: 640,
  COLS: 8,
  BRICK_GAP: 4,
  BRICK_SIDE_MARGIN: 16,
  BRICK_TOP: 54,
  BRICK_H: 20,
  PADDLE_W: 78,
  PADDLE_H: 14,
  PADDLE_Y_OFFSET: 34, // distance from bottom of arena
  BALL_R: 6.5,
  BALL_BASE_SPEED: 230,
  MIN_VY_RATIO: 0.32,  // guarantees the ball always keeps real vertical speed
  TOTAL_LEVELS: 10,
  MAX_LIVES_START: 3
};

const ARENA_W = CFG.ARENA_W, ARENA_H = CFG.ARENA_H;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const arenaArea = document.getElementById('arenaArea');
const menuBgCanvas = document.getElementById('menuBg');
const menuBgCtx = menuBgCanvas.getContext('2d');

let DPR = 1, arenaScale = 1;

function resizeGameCanvas(){
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  const areaW = arenaArea.clientWidth, areaH = arenaArea.clientHeight;
  arenaScale = Math.min(areaW / ARENA_W, areaH / ARENA_H) || 1;
  const dispW = ARENA_W * arenaScale, dispH = ARENA_H * arenaScale;

  canvas.style.width = dispW + 'px';
  canvas.style.height = dispH + 'px';
  canvas.width = dispW * DPR;
  canvas.height = dispH * DPR;
  ctx.setTransform(arenaScale * DPR, 0, 0, arenaScale * DPR, 0, 0);
}

function resizeMenuCanvas(){
  const w = window.innerWidth, h = window.innerHeight;
  menuBgCanvas.width = w * Math.min(window.devicePixelRatio||1,2);
  menuBgCanvas.height = h * Math.min(window.devicePixelRatio||1,2);
  menuBgCanvas.style.width = w+'px';
  menuBgCanvas.style.height = h+'px';
  const dpr = Math.min(window.devicePixelRatio||1,2);
  menuBgCtx.setTransform(dpr,0,0,dpr,0,0);
}

function resizeAll(){ resizeGameCanvas(); resizeMenuCanvas(); }
window.addEventListener('resize', resizeAll);
window.addEventListener('orientationchange', () => setTimeout(resizeAll, 60));

/* ==========================================================================
   2. UTILITIES
   ========================================================================== */
const Util = {
  rand:(a,b) => Math.random()*(b-a)+a,
  randInt:(a,b) => Math.floor(Util.rand(a,b+1)),
  clamp:(v,a,b) => Math.max(a, Math.min(b,v)),
  lerp:(a,b,t) => a + (b-a)*t,
  choice:(arr) => arr[Math.floor(Math.random()*arr.length)],
  fmtTime:(sec) => `${Math.floor(sec/60)}m ${Math.floor(sec%60)}s`
};

/* ==========================================================================
   3. STORAGE
   ========================================================================== */
const STORAGE_KEY = 'anvora-brick-by-brick-save-v1';

const DEFAULT_SAVE = {
  highScore:0,
  highestLevel:1,
  settings:{ sound:true, music:true, particles:true, screenShake:true },
  stats:{
    gamesPlayed:0, gamesWon:0, bricksDestroyed:0, bestCombo:1,
    powerupsCollected:0, totalScore:0
  }
};

function loadSave(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return JSON.parse(JSON.stringify(DEFAULT_SAVE));
    const parsed = JSON.parse(raw);
    if(!parsed || typeof parsed !== 'object') throw new Error('corrupt save');
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_SAVE)),
      ...parsed,
      settings:{ ...DEFAULT_SAVE.settings, ...(parsed.settings||{}) },
      stats:{ ...DEFAULT_SAVE.stats, ...(parsed.stats||{}) }
    };
  }catch(e){
    // corrupted localStorage — fail safe back to defaults rather than crash
    return JSON.parse(JSON.stringify(DEFAULT_SAVE));
  }
}

let SAVE = loadSave();

function persistSave(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(SAVE)); }catch(e){ /* storage unavailable — game still works, just won't persist */ }
}

/* ==========================================================================
   4. AUDIO  — synthesized with the Web Audio API, no external files.
   Autoplay-policy safe: the AudioContext is created lazily and resumed on
   the first user gesture (click/touch/key), never on page load.
   ========================================================================== */
const AudioManager = {
  ctx:null,
  musicTimer:null,
  musicStep:0,

  ensureContext(){
    if(this.ctx) return this.ctx;
    try{
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }catch(e){ this.ctx = null; }
    return this.ctx;
  },

  unlock(){
    const ctx = this.ensureContext();
    if(ctx && ctx.state === 'suspended') ctx.resume().catch(()=>{});
  },

  tone(freq, dur, type='sine', vol=0.14, endFreq=null){
    if(!SAVE.settings.sound) return;
    const ctx = this.ensureContext();
    if(!ctx) return;
    try{
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      if(endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20,endFreq), ctx.currentTime+dur);
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime+dur);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime+dur+0.02);
    }catch(e){ /* ignore synthesis errors — never crash the game over audio */ }
  },

  play(key){
    switch(key){
      case 'brickHit':      this.tone(330,0.06,'square',0.09); break;
      case 'brickDestroy':  this.tone(560,0.12,'triangle',0.15,190); break;
      case 'paddleHit':     this.tone(220,0.07,'sine',0.13); break;
      case 'wallHit':       this.tone(180,0.05,'sine',0.07); break;
      case 'powerup':       this.tone(680,0.18,'triangle',0.15,1000); break;
      case 'combo':         this.tone(780,0.1,'triangle',0.13,1150); break;
      case 'levelComplete':
        this.tone(523,0.14,'triangle',0.16); setTimeout(()=>this.tone(659,0.14,'triangle',0.16),120);
        setTimeout(()=>this.tone(784,0.22,'triangle',0.16),240); break;
      case 'lifeLost':      this.tone(180,0.24,'sawtooth',0.14,60); break;
      case 'gameOver':      this.tone(220,0.3,'sawtooth',0.14,80); break;
      case 'explosive':     this.tone(120,0.22,'sawtooth',0.18,40); break;
      case 'click':         this.tone(440,0.05,'square',0.08); break;
    }
  },

  // Lightweight generative ambient loop — a slow arpeggio pad. Purely
  // optional atmosphere; gated by the Music setting and only ever
  // scheduled a few notes ahead so it can be started/stopped instantly.
  MUSIC_NOTES:[220,261.6,329.6,392,329.6,261.6],
  startMusic(){
    if(!SAVE.settings.music) return;
    const ctx = this.ensureContext();
    if(!ctx) return;
    this.stopMusic();
    const step = () => {
      if(!SAVE.settings.music) return;
      const freq = this.MUSIC_NOTES[this.musicStep % this.MUSIC_NOTES.length];
      this.musicStep++;
      try{
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, ctx.currentTime);
        gain.gain.setValueAtTime(0.0001, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.035, ctx.currentTime+0.4);
        gain.gain.linearRampToValueAtTime(0.0001, ctx.currentTime+1.6);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(); osc.stop(ctx.currentTime+1.7);
      }catch(e){ /* ignore */ }
      this.musicTimer = setTimeout(step, 900);
    };
    step();
  },
  stopMusic(){
    if(this.musicTimer){ clearTimeout(this.musicTimer); this.musicTimer = null; }
  }
};

// Resume/unlock audio on the first real user gesture anywhere on the page.
['pointerdown','touchstart','keydown'].forEach(evt => {
  window.addEventListener(evt, () => AudioManager.unlock(), { once:true, passive:true });
});

/* ==========================================================================
   5. INPUT
   ========================================================================== */
const Input = {
  keys:{},
  pointerX:null,        // logical-space x from mouse OR active touch drag
  touchDir:0,            // -1 / 0 / 1 from on-screen ◀ ▶ buttons
  launchRequested:false,

  init(){
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if(['ArrowLeft','ArrowRight','Space'].includes(e.code) && Game.state === 'playing') e.preventDefault();
      if(e.code === 'Space') this.launchRequested = true;
      if(e.code === 'Escape') Game.togglePause();
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    // mouse movement over the canvas (converted to logical coordinates)
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.pointerX = (e.clientX - rect.left) / arenaScale;
    });

    // touch drag directly on the arena
    const toLogicalX = (clientX) => {
      const rect = canvas.getBoundingClientRect();
      return (clientX - rect.left) / arenaScale;
    };
    canvas.addEventListener('touchstart', (e) => {
      this.pointerX = toLogicalX(e.touches[0].clientX);
      this.launchRequested = true;
    }, { passive:true });
    canvas.addEventListener('touchmove', (e) => {
      this.pointerX = toLogicalX(e.touches[0].clientX);
    }, { passive:true });

    // on-screen ◀ ▶ buttons
    document.querySelectorAll('.touch-btn').forEach(btn => {
      const dir = btn.dataset.side === 'left' ? -1 : 1;
      const set = (v) => { this.touchDir = v; };
      btn.addEventListener('touchstart', (e) => { e.preventDefault(); set(dir); }, { passive:false });
      btn.addEventListener('touchend', (e) => { e.preventDefault(); set(0); }, { passive:false });
      btn.addEventListener('mousedown', () => set(dir));
      btn.addEventListener('mouseup', () => set(0));
      btn.addEventListener('mouseleave', () => set(0));
    });

    document.getElementById('touchLaunchBtn').addEventListener('touchstart', (e) => {
      e.preventDefault(); this.launchRequested = true;
    }, { passive:false });
    document.getElementById('touchLaunchBtn').addEventListener('click', () => { this.launchRequested = true; });

    // show touch bar only on touch-capable devices
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    document.getElementById('touchBar').hidden = !isTouch;
  },

  keyboardAxis(){
    let x = 0;
    if(this.keys['ArrowLeft'] || this.keys['KeyA']) x -= 1;
    if(this.keys['ArrowRight'] || this.keys['KeyD']) x += 1;
    return x + this.touchDir;
  },

  consumeLaunch(){
    if(this.launchRequested){ this.launchRequested = false; return true; }
    return false;
  }
};

/* ==========================================================================
   6. GAMESTATE — a simple, explicit state machine.
   Only one of these is ever "current"; menus and gameplay never run
   simultaneously because UI.showScreen() is the only thing that toggles
   #gameLayer's visibility, and Game.update() bails out unless state
   is exactly 'playing'.
   ========================================================================== */
const GameState = {
  STATES:['menu','playing','paused','levelComplete','gameOver','howto','settings','stats'],
  current:'menu'
};

/* ==========================================================================
   7. LEVEL MANAGER
   ---------------------------------------------------------------------
   Ten hand-authored layouts (never randomly generated — every level is
   visually distinct and hand-tuned for difficulty). Legend:
     .  empty        N normal (1hp)     S strong (2hp)
     H  heavy (3hp)  A armored (4hp)    P special (drops a power-up)
     E  explosive (destroys nearby bricks on death)
   ========================================================================== */
const BRICK_DEFS = {
  N:{ hp:1, score:100, color:'#3fd8ff', name:'Normal' },
  S:{ hp:2, score:200, color:'#7c8bff', name:'Strong' },
  H:{ hp:3, score:300, color:'#ffb648', name:'Heavy' },
  A:{ hp:4, score:500, color:'#ff5f7e', name:'Armored' },
  P:{ hp:1, score:150, color:'#ffd76a', name:'Special', special:true },
  E:{ hp:1, score:250, color:'#33e39a', name:'Explosive', explosive:true }
};

const LevelManager = {
  LEVELS:[
    { // 1 — simple rectangle
      name:'Rectangle', ballSpeedMult:0.88,
      rows:[
        'NNNNNNNN','NNNNNNNN','NNNNNNNN','NNNNNNNN','NNNNNNNN'
      ]
    },
    { // 2 — pyramid
      name:'Pyramid', ballSpeedMult:0.92,
      rows:[
        '...NN...','..NNNN..','.NNSSNN.','NNSSSSNN','SSSSSSSS'
      ]
    },
    { // 3 — diamond
      name:'Diamond', ballSpeedMult:0.96,
      rows:[
        '...NN...','..NSSN..','.NSSSSN.','..NSSN..','...NN...','...PP...'
      ]
    },
    { // 4 — checkerboard
      name:'Checkerboard', ballSpeedMult:1.0,
      rows:[
        'S.S.S.S.','.H.H.H.H','S.S.S.S.','.H.H.H.H','S.S.S.S.','.H.H.H.H'
      ]
    },
    { // 5 — cross
      name:'Cross', ballSpeedMult:1.04,
      rows:[
        '...AA...','...AA...','HHHPPHHH','...AA...','...AA...','...AA...'
      ]
    },
    { // 6 — tunnel
      name:'Tunnel', ballSpeedMult:1.08,
      rows:[
        'AA....AA','AA.NE.AA','AA.SS.AA','AA.EN.AA','AA....AA'
      ]
    },
    { // 7 — multiple sections
      name:'Sections', ballSpeedMult:1.12,
      rows:[
        'SS.SS.SS','SN.PE.NS','HH.HH.HH','SN.EP.NS','SS.SS.SS'
      ]
    },
    { // 8 — armor formation
      name:'Armor Formation', ballSpeedMult:1.16,
      rows:[
        'AAAAAAAA','AAHHHHAA','AHHAAHHA','AAHHHHAA','AAAAAAAA'
      ]
    },
    { // 9 — complex formation
      name:'Complex Formation', ballSpeedMult:1.2,
      rows:[
        'NS.AA.SN','.HPEEPH.','SAAHHAAS','.HPEEPH.','NS.AA.SN','..AAAA..'
      ]
    },
    { // 10 — boss-style
      name:'Final Formation', ballSpeedMult:1.28, boss:true,
      rows:[
        '..AAAA..','.AAHHAA.','AAHEEHAA','AHHPPHHA','AAHEEHAA','.AAHHAA.','..AAAA..'
      ]
    }
  ],

  get(levelNum){
    return this.LEVELS[Util.clamp(levelNum,1,CFG.TOTAL_LEVELS)-1];
  }
};

/* ==========================================================================
   8. BRICK  (collection + per-brick behavior)
   ========================================================================== */
const Bricks = {
  list:[],
  totalBreakable:0,

  buildFromLevel(levelDef){
    this.list = [];
    const rows = levelDef.rows;
    const cellW = (ARENA_W - CFG.BRICK_SIDE_MARGIN*2 - (CFG.COLS-1)*CFG.BRICK_GAP) / CFG.COLS;

    rows.forEach((rowStr, r) => {
      for(let c=0;c<CFG.COLS;c++){
        const code = rowStr[c];
        if(!code || code === '.') continue;
        const def = BRICK_DEFS[code] || BRICK_DEFS.N;
        this.list.push({
          code, def,
          x: CFG.BRICK_SIDE_MARGIN + c*(cellW+CFG.BRICK_GAP),
          y: CFG.BRICK_TOP + r*(CFG.BRICK_H+CFG.BRICK_GAP),
          w: cellW, h: CFG.BRICK_H,
          hp: def.hp, maxHp: def.hp,
          alive:true, hitFlash:0
        });
      }
    });
    this.totalBreakable = this.list.length;
  },

  remainingCount(){ return this.list.filter(b => b.alive).length; },

  hit(brick, dmg){
    brick.hp -= dmg;
    brick.hitFlash = 0.12;
    if(brick.hp <= 0){
      this.destroy(brick);
      return true;
    }
    AudioManager.play('brickHit');
    Particles.spawnBrickHit(brick.x+brick.w/2, brick.y+brick.h/2, brick.def.color);
    return false;
  },

  destroy(brick, fromChain){
    if(!brick.alive) return;
    brick.alive = false;
    AudioManager.play('brickDestroy');
    Particles.spawnBrickBreak(brick.x+brick.w/2, brick.y+brick.h/2, brick.def.color);
    Combo.registerHit();
    const points = brick.def.score * Combo.multiplier;
    Player.addScore(Math.round(points));
    Stats.bricksDestroyed++;

    if(!fromChain && brick.def.special){
      PowerUps.spawn(brick.x+brick.w/2, brick.y+brick.h/2, null); // guaranteed random power-up
    } else if(!fromChain && !brick.def.explosive && Math.random() < 0.10){
      PowerUps.spawn(brick.x+brick.w/2, brick.y+brick.h/2, null);
    }

    if(brick.def.explosive){
      AudioManager.play('explosive');
      Game.shake(6, 0.2);
      const cx = brick.x+brick.w/2, cy = brick.y+brick.h/2;
      const radius = brick.w*1.6;
      this.list.forEach(other => {
        if(!other.alive || other === brick) return;
        const ocx = other.x+other.w/2, ocy = other.y+other.h/2;
        if(Math.hypot(ocx-cx, ocy-cy) <= radius){
          this.destroy(other, true);
        }
      });
    }
  },

  draw(){
    this.list.forEach(b => {
      if(!b.alive) return;
      const hpFrac = Util.clamp(b.hp/b.maxHp, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.5 + 0.5*hpFrac;
      ctx.fillStyle = b.def.color;
      ctx.shadowColor = b.def.color;
      ctx.shadowBlur = 6;
      roundRect(ctx, b.x, b.y, b.w, b.h, 4);
      ctx.fill();
      ctx.restore();

      // damage cracks for multi-hit bricks below half health
      if(b.maxHp > 1 && hpFrac <= 0.5){
        ctx.save();
        ctx.strokeStyle = 'rgba(4,5,13,0.55)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(b.x+b.w*0.2, b.y+2); ctx.lineTo(b.x+b.w*0.5, b.y+b.h-2);
        ctx.moveTo(b.x+b.w*0.75, b.y+3); ctx.lineTo(b.x+b.w*0.55, b.y+b.h-3);
        ctx.stroke();
        ctx.restore();
      }

      if(b.hitFlash > 0){
        ctx.save();
        ctx.globalAlpha = Util.clamp(b.hitFlash/0.12,0,1)*0.7;
        ctx.fillStyle = '#ffffff';
        roundRect(ctx, b.x, b.y, b.w, b.h, 4);
        ctx.fill();
        ctx.restore();
      }
    });
  },

  update(dt){
    this.list.forEach(b => { if(b.hitFlash>0) b.hitFlash = Math.max(0,b.hitFlash-dt*2); });
  }
};

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

/* ==========================================================================
   9. PADDLE
   ========================================================================== */
const Paddle = {
  x:0, y:0, w:CFG.PADDLE_W, h:CFG.PADDLE_H,
  speed:420,
  wideTimer:0,

  reset(){
    this.w = CFG.PADDLE_W;
    this.x = ARENA_W/2 - this.w/2;
    this.y = ARENA_H - CFG.PADDLE_Y_OFFSET;
    this.wideTimer = 0;
  },

  applyWide(duration){
    this.wideTimer = duration;
    this.w = CFG.PADDLE_W*1.6;
  },

  update(dt){
    if(this.wideTimer > 0){
      this.wideTimer -= dt;
      if(this.wideTimer <= 0){ this.w = CFG.PADDLE_W; }
    }

    const axis = Input.keyboardAxis();
    if(axis !== 0){
      this.x += axis * this.speed * dt;
    } else if(Input.pointerX !== null){
      const targetX = Input.pointerX - this.w/2;
      this.x = Util.lerp(this.x, targetX, 0.35);
    }
    this.x = Util.clamp(this.x, 0, ARENA_W - this.w);
  },

  centerX(){ return this.x + this.w/2; },

  draw(){
    ctx.save();
    ctx.shadowColor = 'rgba(63,216,255,0.65)';
    ctx.shadowBlur = 12;
    const grad = ctx.createLinearGradient(this.x,0,this.x+this.w,0);
    grad.addColorStop(0,'#3fd8ff'); grad.addColorStop(1,'#b565ff');
    ctx.fillStyle = grad;
    roundRect(ctx, this.x, this.y, this.w, this.h, 7);
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(ctx, this.x+this.w*0.15, this.y+3, this.w*0.7, 3, 2);
    ctx.fill();
  }
};

/* ==========================================================================
   10. BALL(S)
   ---------------------------------------------------------------------
   Movement is sub-stepped every frame so a fast ball can never tunnel
   through the paddle or a brick, and a minimum-vertical-velocity rule
   stops it from ever getting trapped in a near-horizontal loop.
   ========================================================================== */
const Balls = {
  list:[],

  reset(){
    this.list = [this.makeBall(true)];
  },

  makeBall(stuck){
    return {
      x: Paddle.centerX(), y: Paddle.y - CFG.BALL_R - 2,
      vx:0, vy:0, r:CFG.BALL_R,
      stuck: !!stuck, fire:0, brickBreaker:0, trail:[]
    };
  },

  currentSpeed(){
    const lvl = Level.def ? Level.def.ballSpeedMult : 1;
    const slow = Player.activePowerups.slow ? 0.6 : 1;
    const fast = Player.activePowerups.fast ? 1.5 : 1;
    return CFG.BALL_BASE_SPEED * lvl * slow * fast;
  },

  launch(ball){
    if(!ball.stuck) return;
    ball.stuck = false;
    const speed = this.currentSpeed();
    const angle = Util.rand(-0.5,0.5) - Math.PI/2;
    ball.vx = Math.cos(angle)*speed;
    ball.vy = Math.sin(angle)*speed;
    Collision.enforceMinAngle(ball);
  },

  addExtra(x,y){
    const speed = this.currentSpeed();
    const angle = Util.rand(-0.8,0.8) - Math.PI/2;
    this.list.push({
      x,y, vx:Math.cos(angle)*speed, vy:Math.sin(angle)*speed, r:CFG.BALL_R,
      stuck:false, fire:0, brickBreaker:0, trail:[]
    });
  },

  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const b = this.list[i];
      if(b.fire > 0){ b.fire -= dt; }
      if(b.brickBreaker > 0){ b.brickBreaker -= dt; }

      if(b.stuck){
        b.x = Paddle.centerX();
        b.y = Paddle.y - b.r - 2;
        if(Input.consumeLaunch()) this.launch(b);
        continue;
      }

      b.trail.push({x:b.x,y:b.y});
      if(b.trail.length > 7) b.trail.shift();

      const removed = Collision.moveBallWithSubsteps(b, dt);
      if(removed){
        this.list.splice(i,1);
        if(this.list.length === 0) Game.loseLife();
      }
    }
  },

  draw(){
    this.list.forEach(b => {
      // trail
      b.trail.forEach((t,i) => {
        const a = (i/b.trail.length) * 0.35;
        ctx.save();
        ctx.globalAlpha = a;
        ctx.fillStyle = b.fire > 0 ? '#ffb648' : '#8fe8ff';
        ctx.beginPath(); ctx.arc(t.x,t.y,b.r*0.7,0,Math.PI*2); ctx.fill();
        ctx.restore();
      });

      ctx.save();
      ctx.shadowColor = b.fire>0 ? 'rgba(255,182,72,0.9)' : 'rgba(63,216,255,0.85)';
      ctx.shadowBlur = 14;
      const grad = ctx.createRadialGradient(b.x,b.y,0,b.x,b.y,b.r);
      if(b.fire > 0){ grad.addColorStop(0,'#fff3c4'); grad.addColorStop(1,'#ff8a3d'); }
      else if(b.brickBreaker > 0){ grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#ffd76a'); }
      else { grad.addColorStop(0,'#ffffff'); grad.addColorStop(1,'#3fd8ff'); }
      ctx.fillStyle = grad;
      ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();
      ctx.restore();
    });
  }
};

/* ==========================================================================
   11. COLLISION
   ---------------------------------------------------------------------
   Pure collision-resolution helpers, kept separate from the objects
   that own the data. Every ball move is sub-stepped so a fast-moving
   ball is tested at small enough increments that it can never pass
   through a thin brick or the paddle in a single frame.
   ========================================================================== */
const Collision = {
  enforceMinAngle(ball){
    const speed = Math.hypot(ball.vx, ball.vy) || 1;
    const minVy = speed * CFG.MIN_VY_RATIO;
    if(Math.abs(ball.vy) < minVy){
      ball.vy = ball.vy < 0 ? -minVy : minVy;
      const vxSign = ball.vx < 0 ? -1 : 1;
      ball.vx = vxSign * Math.sqrt(Math.max(0, speed*speed - ball.vy*ball.vy));
    }
  },

  circleRectOverlap(cx,cy,r,rx,ry,rw,rh){
    const nx = Util.clamp(cx, rx, rx+rw);
    const ny = Util.clamp(cy, ry, ry+rh);
    return Math.hypot(cx-nx, cy-ny) <= r;
  },

  // Moves one ball for `dt`, sub-stepped, resolving wall / paddle / brick
  // collisions. Returns true if the ball fell below the arena (lost).
  moveBallWithSubsteps(ball, dt){
    const speed = Math.hypot(ball.vx, ball.vy);
    const steps = Util.clamp(Math.ceil((speed*dt) / (ball.r*1.5)), 1, 8);
    const stepDt = dt/steps;

    for(let s=0; s<steps; s++){
      ball.x += ball.vx*stepDt;
      ball.y += ball.vy*stepDt;

      // walls
      if(ball.x - ball.r < 0){ ball.x = ball.r; ball.vx *= -1; AudioManager.play('wallHit'); }
      if(ball.x + ball.r > ARENA_W){ ball.x = ARENA_W-ball.r; ball.vx *= -1; AudioManager.play('wallHit'); }
      if(ball.y - ball.r < 0){ ball.y = ball.r; ball.vy *= -1; AudioManager.play('wallHit'); }

      // paddle (only when travelling downward)
      if(ball.vy > 0 && this.circleRectOverlap(ball.x,ball.y,ball.r, Paddle.x,Paddle.y,Paddle.w,Paddle.h)){
        ball.y = Paddle.y - ball.r;
        const hitPos = Util.clamp((ball.x - Paddle.centerX())/(Paddle.w/2), -1, 1);
        const curSpeed = Math.max(speed, Balls.currentSpeed());
        const maxAngle = 1.15;
        const angle = hitPos*maxAngle - Math.PI/2;
        ball.vx = Math.cos(angle)*curSpeed;
        ball.vy = Math.sin(angle)*curSpeed;
        this.enforceMinAngle(ball);
        AudioManager.play('paddleHit');
        Particles.spawnPaddleHit(ball.x, Paddle.y);
      }

      // bricks
      for(let bi=0; bi<Bricks.list.length; bi++){
        const brick = Bricks.list[bi];
        if(!brick.alive) continue;
        if(!this.circleRectOverlap(ball.x,ball.y,ball.r, brick.x,brick.y,brick.w,brick.h)) continue;

        const dmg = 1 + (ball.brickBreaker>0 ? 3 : 0);
        Bricks.hit(brick, dmg);

        if(ball.fire > 0){
          // fireball passes straight through without bouncing
          continue;
        }

        // reposition outside the brick along the shallowest overlap axis
        const overlapLeft = (ball.x+ball.r) - brick.x;
        const overlapRight = (brick.x+brick.w) - (ball.x-ball.r);
        const overlapTop = (ball.y+ball.r) - brick.y;
        const overlapBottom = (brick.y+brick.h) - (ball.y-ball.r);
        const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);
        if(minOverlap === overlapTop || minOverlap === overlapBottom){ ball.vy *= -1; }
        else { ball.vx *= -1; }
        break; // one brick per substep keeps resolution stable
      }
    }

    return ball.y - ball.r > ARENA_H; // fell off the bottom
  }
};

/* ==========================================================================
   12. POWERUP
   ---------------------------------------------------------------------
   Letter-coded per the design brief:
   W=Wide Paddle  S=Slow Ball  F=Fast Ball  M=Multi Ball
   L=Extra Life   X=Fireball   B=Brick Breaker
   ========================================================================== */
const POWERUP_DEFS = {
  W:{ label:'Wide Paddle',   color:'#3fd8ff', duration:10 },
  S:{ label:'Slow Ball',     color:'#7c8bff', duration:8  },
  F:{ label:'Fast Ball',     color:'#ff5f7e', duration:8  },
  M:{ label:'Multi Ball',    color:'#33e39a', duration:0  },
  L:{ label:'Extra Life',    color:'#ffd76a', duration:0  },
  X:{ label:'Fireball',      color:'#ffb648', duration:8  },
  B:{ label:'Brick Breaker', color:'#b565ff', duration:10 }
};
const POWERUP_KEYS = Object.keys(POWERUP_DEFS);

const PowerUps = {
  list:[],
  reset(){ this.list = []; },

  spawn(x,y,forceKey){
    const key = forceKey || Util.choice(POWERUP_KEYS);
    this.list.push({ x,y, key, vy:110, t:0 });
  },

  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const p = this.list[i];
      p.t += dt;
      p.y += p.vy*dt;
      if(p.y > ARENA_H+20){ this.list.splice(i,1); continue; }
      if(Collision.circleRectOverlap(p.x,p.y,10, Paddle.x,Paddle.y,Paddle.w,Paddle.h)){
        this.collect(p);
        this.list.splice(i,1);
      }
    }
  },

  collect(p){
    AudioManager.play('powerup');
    Particles.spawnPowerupCollect(p.x,p.y, POWERUP_DEFS[p.key].color);
    Stats.powerupsCollected++;

    switch(p.key){
      case 'W': Paddle.applyWide(POWERUP_DEFS.W.duration); break;
      case 'S': Player.activePowerups.slow = POWERUP_DEFS.S.duration; Player.activePowerups.fast = 0; break;
      case 'F': Player.activePowerups.fast = POWERUP_DEFS.F.duration; Player.activePowerups.slow = 0; break;
      case 'M': {
        const src = Balls.list.find(b => !b.stuck) || Balls.list[0];
        if(src){ Balls.addExtra(src.x, src.y); Balls.addExtra(src.x, src.y); }
        break;
      }
      case 'L': Player.lives++; break;
      case 'X': Balls.list.forEach(b => b.fire = POWERUP_DEFS.X.duration); break;
      case 'B': Balls.list.forEach(b => b.brickBreaker = POWERUP_DEFS.B.duration); break;
    }
  },

  draw(){
    this.list.forEach(p => {
      const def = POWERUP_DEFS[p.key];
      ctx.save();
      ctx.translate(p.x, p.y + Math.sin(p.t*4)*3);
      ctx.shadowColor = def.color; ctx.shadowBlur = 12;
      ctx.fillStyle = def.color;
      ctx.beginPath(); ctx.arc(0,0,11,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#04050d';
      ctx.font = '700 12px Space Grotesk, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(p.key, 0, 1);
      ctx.restore();
    });
  }
};

/* ==========================================================================
   13. PARTICLE
   ---------------------------------------------------------------------
   Capped, lightweight, canvas-drawn. Fully disable-able via Settings.
   ========================================================================== */
const Particles = {
  list:[],
  MAX:140,

  spawn(x,y,vx,vy,r,life,color){
    if(!SAVE.settings.particles) return;
    if(this.list.length >= this.MAX) this.list.shift();
    this.list.push({ x,y,vx,vy,r,life,age:0,color });
  },

  spawnBrickHit(x,y,color){
    for(let i=0;i<3;i++){
      const a = Util.rand(0,Math.PI*2);
      this.spawn(x,y, Math.cos(a)*60, Math.sin(a)*60, Util.rand(1,2), 0.25, color);
    }
  },
  spawnBrickBreak(x,y,color){
    const n = SAVE.settings.particles ? 12 : 0;
    for(let i=0;i<n;i++){
      const a = Util.rand(0,Math.PI*2), spd = Util.rand(40,180);
      this.spawn(x,y, Math.cos(a)*spd, Math.sin(a)*spd, Util.rand(1.5,3), Util.rand(0.3,0.6), color);
    }
  },
  spawnPaddleHit(x,y){
    for(let i=0;i<4;i++){
      this.spawn(x,y, Util.rand(-50,50), Util.rand(-80,-20), Util.rand(1,2), 0.2, '#8fe8ff');
    }
  },
  spawnPowerupCollect(x,y,color){
    for(let i=0;i<10;i++){
      const a = Util.rand(0,Math.PI*2);
      this.spawn(x,y, Math.cos(a)*90, Math.sin(a)*90, Util.rand(1.5,3), 0.4, color);
    }
  },
  spawnCombo(x,y){
    for(let i=0;i<8;i++){
      const a = Util.rand(0,Math.PI*2);
      this.spawn(x,y, Math.cos(a)*70, Math.sin(a)*70, Util.rand(1,2.5), 0.35, '#ffb648');
    }
  },
  spawnLevelComplete(){
    for(let i=0;i<40;i++){
      this.spawn(Util.rand(0,ARENA_W), Util.rand(0,ARENA_H*0.6),
        Util.rand(-40,40), Util.rand(20,120), Util.rand(1.5,3), Util.rand(0.6,1.2),
        Util.choice(['#3fd8ff','#b565ff','#ffd76a','#33e39a']));
    }
  },

  update(dt){
    for(let i=this.list.length-1;i>=0;i--){
      const p = this.list[i];
      p.age += dt;
      if(p.age >= p.life){ this.list.splice(i,1); continue; }
      p.x += p.vx*dt; p.y += p.vy*dt;
      p.vx *= 0.95; p.vy *= 0.95;
    }
  },

  draw(){
    this.list.forEach(p => {
      const t = 1 - p.age/p.life;
      ctx.globalAlpha = t;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r*t+0.4,0,Math.PI*2); ctx.fill();
      ctx.globalAlpha = 1;
    });
  }
};

/* ==========================================================================
   14. COMBO
   ========================================================================== */
const Combo = {
  count:0, multiplier:1, timer:0, best:1,
  TIMEOUT:2.2,

  reset(){ this.count = 0; this.multiplier = 1; this.timer = 0; },

  registerHit(){
    this.count++;
    this.timer = this.TIMEOUT;
    const newMult = 1 + Math.floor(this.count/3);
    if(newMult > this.multiplier){
      this.multiplier = newMult;
      this.best = Math.max(this.best, this.multiplier);
      AudioManager.play('combo');
      UI.showComboPopup(`COMBO x${this.multiplier}!`);
      Particles.spawnCombo(Paddle.centerX(), Paddle.y-20);
    }
  },

  breakCombo(){
    this.count = 0; this.multiplier = 1; this.timer = 0;
  },

  update(dt){
    if(this.timer > 0){
      this.timer -= dt;
      if(this.timer <= 0) this.breakCombo();
    }
  }
};

/* ==========================================================================
   15. PLAYER  (score / lives / active timed power-ups)
   ========================================================================== */
const Player = {
  score:0, lives:CFG.MAX_LIVES_START,
  activePowerups:{}, // slow / fast — countdown timers

  reset(){
    this.score = 0;
    this.lives = CFG.MAX_LIVES_START;
    this.activePowerups = {};
  },

  addScore(v){ this.score += v; Stats.totalScore += v; },

  update(dt){
    Object.keys(this.activePowerups).forEach(key => {
      this.activePowerups[key] -= dt;
      if(this.activePowerups[key] <= 0) delete this.activePowerups[key];
    });
  }
};

/* ==========================================================================
   16. STATS  (flushed into SAVE.stats)
   ========================================================================== */
const Stats = {
  bricksDestroyed:0, powerupsCollected:0, totalScore:0,

  resetRun(){ this.bricksDestroyed = 0; this.powerupsCollected = 0; this.totalScore = 0; },

  flushToSave(){
    SAVE.stats.bricksDestroyed += this.bricksDestroyed;
    SAVE.stats.powerupsCollected += this.powerupsCollected;
    SAVE.stats.totalScore += this.totalScore;
    SAVE.stats.bestCombo = Math.max(SAVE.stats.bestCombo, Combo.best);
    persistSave();
  }
};

/* ==========================================================================
   17. LEVEL (run-time state for the level currently being played)
   ========================================================================== */
const Level = {
  num:1, def:null, startTime:0, lostLifeThisLevel:false,

  start(num){
    this.num = Util.clamp(num,1,CFG.TOTAL_LEVELS);
    this.def = LevelManager.get(this.num);
    this.startTime = performance.now();
    this.lostLifeThisLevel = false;
    Bricks.buildFromLevel(this.def);
    Paddle.reset();
    Balls.reset();
    PowerUps.reset();
    Combo.reset();
    UI.showLevelBanner(this.def);
  },

  elapsedSeconds(){ return (performance.now()-this.startTime)/1000; }
};

/* ==========================================================================
   18. RENDERER — background + full-frame draw. Kept separate from
   game-state updates: Game.update() advances the simulation, then
   Renderer.draw() (called from the same loop) is the only place that
   touches the canvas for gameplay.
   ========================================================================== */
const Renderer = {
  shakeMag:0, shakeTime:0,

  shake(mag,time){
    if(!SAVE.settings.screenShake) return;
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeTime = Math.max(this.shakeTime, time);
  },

  drawArenaBackground(){
    const g = ctx.createLinearGradient(0,0,0,ARENA_H);
    g.addColorStop(0,'#070914'); g.addColorStop(1,'#03040c');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,ARENA_W,ARENA_H);

    // faint grid dots for depth — cheap, drawn once per frame, no images
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for(let x=10; x<ARENA_W; x+=26){
      for(let y=10; y<ARENA_H; y+=26){
        ctx.fillRect(x,y,1,1);
      }
    }
  },

  drawGame(){
    ctx.save();
    if(this.shakeTime > 0){
      ctx.translate(Util.rand(-this.shakeMag,this.shakeMag), Util.rand(-this.shakeMag,this.shakeMag));
    }
    this.drawArenaBackground();
    Bricks.draw();
    PowerUps.draw();
    Particles.draw();
    Paddle.draw();
    Balls.draw();
    ctx.restore();
  },

  updateShake(dt){
    if(this.shakeTime > 0){ this.shakeTime -= dt; } else { this.shakeMag = 0; }
  },

  // ---- animated main-menu background: drifting neon "bricks" + stars ----
  menuStars:[], menuBricksInit:false,
  initMenuBg(){
    this.menuStars = Array.from({length:60}, () => ({
      x:Util.rand(0,window.innerWidth), y:Util.rand(0,window.innerHeight),
      r:Util.rand(0.6,1.8), tw:Util.rand(0,Math.PI*2)
    }));
    this.menuBricks = Array.from({length:14}, () => ({
      x:Util.rand(0,window.innerWidth), y:Util.rand(-200,window.innerHeight),
      w:Util.rand(28,54), h:14, vy:Util.rand(8,22),
      color:Util.choice(['#3fd8ff','#b565ff','#ffb648','#33e39a','#ff5f7e']),
      rot:Util.rand(-0.2,0.2)
    }));
  },
  drawMenuBg(dt){
    const w = window.innerWidth, h = window.innerHeight;
    menuBgCtx.fillStyle = '#03040c';
    menuBgCtx.fillRect(0,0,w,h);
    this.menuStars.forEach(s => {
      s.tw += dt*2;
      menuBgCtx.fillStyle = `rgba(255,255,255,${0.3+0.4*Math.sin(s.tw)})`;
      menuBgCtx.beginPath(); menuBgCtx.arc(s.x,s.y,s.r,0,Math.PI*2); menuBgCtx.fill();
    });
    (this.menuBricks||[]).forEach(b => {
      b.y += b.vy*dt;
      if(b.y > h+30){ b.y = -30; b.x = Util.rand(0,w); }
      menuBgCtx.save();
      menuBgCtx.globalAlpha = 0.16;
      menuBgCtx.translate(b.x,b.y); menuBgCtx.rotate(b.rot);
      menuBgCtx.fillStyle = b.color;
      menuBgCtx.shadowColor = b.color; menuBgCtx.shadowBlur = 10;
      roundRect(menuBgCtx, -b.w/2, -b.h/2, b.w, b.h, 4);
      menuBgCtx.fill();
      menuBgCtx.restore();
    });
  }
};

/* ==========================================================================
   19. UI  — all DOM screen/HUD manipulation lives here.
   ========================================================================== */
const UI = {
  SCREEN_IDS:['screen-menu','screen-howto','screen-settings','screen-stats','screen-pause','screen-levelcomplete','screen-gameover'],

  showScreen(id){
    this.SCREEN_IDS.forEach(s => document.getElementById(s).classList.toggle('active', s === id));
    document.getElementById('gameLayer').hidden = (id !== null && id !== 'screen-pause');
  },

  updateHud(){
    document.getElementById('hudScore').textContent = Player.score;
    document.getElementById('hudHigh').textContent = Math.max(SAVE.highScore, Player.score);
    document.getElementById('hudLevel').textContent = Level.num;
    document.getElementById('hudLives').textContent = Player.lives;
    document.getElementById('hudCombo').textContent = 'x'+Combo.multiplier;
  },

  showLevelBanner(def){
    const el = document.getElementById('levelBanner');
    el.innerHTML = `LEVEL ${Level.num}<span class="sub">${def.name}</span>`;
    el.classList.toggle('boss', !!def.boss);
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 400);
    }, 1400);
  },

  showComboPopup(text){
    const el = document.getElementById('comboPopup');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth; // restart animation
    el.classList.add('show');
    clearTimeout(this._comboTimer);
    this._comboTimer = setTimeout(() => { el.classList.remove('show'); setTimeout(()=>{el.hidden=true;},300); }, 700);
  },

  flashLifeLost(){
    const el = document.getElementById('lifeLostFlash');
    el.hidden = false;
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => { el.hidden = true; }, 400);
    }, 120);
  },

  renderStats(){
    const s = SAVE.stats;
    document.querySelector('[data-stat="highScore"]').textContent = SAVE.highScore;
    document.querySelector('[data-stat="highestLevel"]').textContent = SAVE.highestLevel;
    document.querySelector('[data-stat="gamesPlayed"]').textContent = s.gamesPlayed;
    document.querySelector('[data-stat="gamesWon"]').textContent = s.gamesWon;
    document.querySelector('[data-stat="bricksDestroyed"]').textContent = s.bricksDestroyed;
    document.querySelector('[data-stat="bestCombo"]').textContent = 'x'+s.bestCombo;
    document.querySelector('[data-stat="powerupsCollected"]').textContent = s.powerupsCollected;
    document.querySelector('[data-stat="totalScore"]').textContent = s.totalScore;
  },

  bindSettingsInputs(){
    const s = SAVE.settings;
    document.getElementById('soundToggle').checked = s.sound;
    document.getElementById('musicToggle').checked = s.music;
    document.getElementById('particlesToggle').checked = s.particles;
    document.getElementById('shakeToggle').checked = s.screenShake;

    const save = () => persistSave();

    document.getElementById('soundToggle').onchange = (e) => { s.sound = e.target.checked; save(); };
    document.getElementById('musicToggle').onchange = (e) => {
      s.music = e.target.checked; save();
      if(s.music && GameState.current === 'playing') AudioManager.startMusic();
      else AudioManager.stopMusic();
    };
    document.getElementById('particlesToggle').onchange = (e) => { s.particles = e.target.checked; save(); };
    document.getElementById('shakeToggle').onchange = (e) => { s.screenShake = e.target.checked; save(); };
  }
};

/* ==========================================================================
   20. GAME — orchestrates state transitions and runs the main loop.
   Input -> Update -> Collision -> Particles -> Render -> requestAnimationFrame
   ========================================================================== */
const Game = {
  state:'menu',
  lastFrame:0,
  finalLevelClearedAsWin:false,

  init(){
    Input.init();
    Renderer.initMenuBg();
    UI.bindSettingsInputs();
    UI.renderStats();
    resizeAll();
    this.bindButtons();
    requestAnimationFrame(this.loop.bind(this));
  },

  bindButtons(){
    document.body.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-action]');
      if(!btn) return;
      AudioManager.play('click');
      switch(btn.dataset.action){
        case 'play': this.startNewGame(); break;
        case 'howto': this.setState('howto'); UI.showScreen('screen-howto'); break;
        case 'settings': this.setState('settings'); UI.showScreen('screen-settings'); break;
        case 'stats': UI.renderStats(); this.setState('stats'); UI.showScreen('screen-stats'); break;
        case 'back': this.returnFromSubmenu(); break;
        case 'pause': this.togglePause(); break;
        case 'resume': this.togglePause(); break;
        case 'restart-level': this.restartLevel(); break;
        case 'main-menu': this.quitToMenu(); break;
        case 'next-level': this.goToNextLevel(); break;
        case 'retry': this.startNewGame(); break;
      }
    });

    const resetBtn = document.getElementById('resetStatsBtn');
    let confirmArmed = false;
    resetBtn.addEventListener('click', () => {
      if(!confirmArmed){
        confirmArmed = true;
        resetBtn.textContent = 'Tap Again to Confirm';
        setTimeout(() => { confirmArmed = false; resetBtn.textContent = 'Reset Stats'; }, 3000);
        return;
      }
      SAVE = JSON.parse(JSON.stringify(DEFAULT_SAVE));
      persistSave();
      UI.renderStats();
      confirmArmed = false;
      resetBtn.textContent = 'Reset Stats';
    });
  },

  // 'howto' / 'settings' / 'stats' can be opened from the menu OR from
  // pause — remember which so Back returns to the right place.
  preSubmenuState:'menu',
  setState(s){
    if(['howto','settings','stats'].includes(s) && !['howto','settings','stats'].includes(this.state)){
      this.preSubmenuState = this.state;
    }
    this.state = s; GameState.current = s;
  },
  returnFromSubmenu(){
    if(this.preSubmenuState === 'paused'){
      this.state = 'paused'; GameState.current = 'paused';
      UI.showScreen('screen-pause');
    } else {
      this.state = 'menu'; GameState.current = 'menu';
      UI.showScreen('screen-menu');
    }
  },

  startNewGame(){
    Player.reset();
    Stats.resetRun();
    Combo.best = 1;
    this.finalLevelClearedAsWin = false;
    SAVE.stats.gamesPlayed++;
    persistSave();
    Level.start(1);
    this.state = 'playing'; GameState.current = 'playing';
    UI.showScreen(null);
    if(SAVE.settings.music) AudioManager.startMusic();
  },

  togglePause(){
    if(this.state === 'playing'){
      this.state = 'paused'; GameState.current = 'paused';
      UI.showScreen('screen-pause');
      AudioManager.stopMusic();
    } else if(this.state === 'paused'){
      this.state = 'playing'; GameState.current = 'playing';
      UI.showScreen(null);
      if(SAVE.settings.music) AudioManager.startMusic();
    }
  },

  restartLevel(){
    Level.start(Level.num);
    this.state = 'playing'; GameState.current = 'playing';
    UI.showScreen(null);
    if(SAVE.settings.music) AudioManager.startMusic();
  },

  quitToMenu(){
    AudioManager.stopMusic();
    this.state = 'menu'; GameState.current = 'menu';
    UI.showScreen('screen-menu');
  },

  goToNextLevel(){
    if(this.finalLevelClearedAsWin){ this.quitToMenu(); return; }
    Level.start(Level.num+1);
    this.state = 'playing'; GameState.current = 'playing';
    UI.showScreen(null);
    if(SAVE.settings.music) AudioManager.startMusic();
  },

  loseLife(){
    Player.lives--;
    Combo.breakCombo();
    AudioManager.play('lifeLost');
    UI.flashLifeLost();
    Renderer.shake(7, 0.3);
    if(Player.lives <= 0){
      this.gameOver();
    } else {
      Balls.reset();
      Paddle.reset();
    }
  },

  checkLevelComplete(){
    if(Bricks.remainingCount() === 0){
      this.levelComplete();
    }
  },

  levelComplete(){
    this.state = 'levelComplete'; GameState.current = 'levelComplete';
    AudioManager.stopMusic();
    AudioManager.play('levelComplete');
    Renderer.shake(5, 0.3);
    Particles.spawnLevelComplete();

    const bonus = Level.num*200 + Player.lives*200;
    Player.addScore(bonus);
    SAVE.highestLevel = Math.max(SAVE.highestLevel, Level.num);
    if(Player.score > SAVE.highScore) SAVE.highScore = Player.score;
    persistSave();

    document.getElementById('lcScore').textContent = Player.score;
    document.getElementById('lcBricks').textContent = Stats.bricksDestroyed;
    document.getElementById('lcCombo').textContent = 'x'+Combo.best;
    document.getElementById('lcBonus').textContent = bonus;

    const isFinal = Level.num >= CFG.TOTAL_LEVELS;
    this.finalLevelClearedAsWin = isFinal;
    document.querySelector('#screen-levelcomplete h2').textContent = isFinal ? 'YOU WIN!' : 'LEVEL COMPLETE!';
    document.querySelector('[data-action="next-level"]').textContent = isFinal ? 'FINISH' : 'NEXT LEVEL';
    if(isFinal){
      SAVE.stats.gamesWon++;
      Stats.flushToSave();
    }

    UI.showScreen('screen-levelcomplete');
  },

  gameOver(){
    this.state = 'gameOver'; GameState.current = 'gameOver';
    AudioManager.stopMusic();
    AudioManager.play('gameOver');

    const isNewHigh = Player.score > SAVE.highScore;
    if(isNewHigh) SAVE.highScore = Player.score;
    SAVE.highestLevel = Math.max(SAVE.highestLevel, Level.num);
    Stats.flushToSave();
    persistSave();

    document.getElementById('newHighTag').hidden = !isNewHigh;
    document.getElementById('goScore').textContent = Player.score;
    document.getElementById('goHigh').textContent = SAVE.highScore;
    document.getElementById('goLevel').textContent = Level.num;
    document.getElementById('goCombo').textContent = 'x'+Combo.best;
    document.getElementById('goBricks').textContent = Stats.bricksDestroyed;

    UI.showScreen('screen-gameover');
  },

  shake(mag,time){ Renderer.shake(mag,time); },

  update(dt){
    if(this.state !== 'playing') return;
    Paddle.update(dt);
    Balls.update(dt);
    PowerUps.update(dt);
    Bricks.update(dt);
    Particles.update(dt);
    Combo.update(dt);
    Player.update(dt);
    Renderer.updateShake(dt);
    UI.updateHud();
    this.checkLevelComplete();
  },

  loop(ts){
    const dt = Math.min((ts-(this.lastFrame||ts))/1000, 0.032);
    this.lastFrame = ts;

    if(this.state === 'menu' || this.state === 'howto' || this.state === 'settings' || this.state === 'stats'){
      Renderer.drawMenuBg(dt);
    }
    if(this.state === 'playing'){
      this.update(dt);
      Renderer.drawGame();
    }
    // paused / levelComplete / gameOver: intentionally do NOT update or
    // redraw the arena — the last frame stays frozen underneath the
    // overlay, satisfying "the game completely stops while paused".

    requestAnimationFrame(this.loop.bind(this));
  }
};

/* ==========================================================================
   21. INITIALIZATION
   ========================================================================== */
window.addEventListener('load', () => {
  Game.init();
});
