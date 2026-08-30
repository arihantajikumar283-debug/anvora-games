/* =========================================================================
   PEN FIGHT — vanilla JS + Canvas2D rigid-body physics
   Developed by Arihant — AnvoraGames
   Pens are modelled as rigid rods (5 collision circles along their length)
   so WHERE you hit an opponent changes the outcome: center hits push
   straight, tip/end hits impart torque and spin, glancing hits deflect.
   Systems: Save, Audio, Physics, Input, AI, Renderer, UI, Game (state machine)
   ========================================================================= */
(() => {
"use strict";

/* ===================== WORLD / DESK (wide, landscape) ===================== */
// Enlarged from the previous 1000x620 / 80-unit pens: at typical viewport
// fit-scale the old pens rendered at only ~45-55px on screen — a token, not
// a recognizable pen. The world is now taller too, so the bigger pens still
// have real travel distance between baselines instead of crowding the desk.
const WORLD_W = 1080, WORLD_H = 760;
const ARENA = { left: 60, right: 1020, top: 60, bottom: 700 };
const PEN_LENGTH = 170;      // base pen length (world units) — was 80
const PEN_WIDTH = 20;        // base pen diameter — was 15 (ratio ~8.5:1, per spec)
const EDGE_CLEARANCE = PEN_LENGTH/2 + 30; // keeps a pen's rear end from resting past the desk edge
const PLAYER_BASE_Y = ARENA.bottom - EDGE_CLEARANCE;
const AI_BASE_Y = ARENA.top + EDGE_CLEARANCE;
const BASELINE_MIN_X = ARENA.left + 120, BASELINE_MAX_X = ARENA.right - 120;

const PEN_MASS = 1.0;
const CIRCLES = [            // collision points distributed along the pen's length
  { frac: -0.40, rMul: 0.80, end: true  }, // back/cap end
  { frac: -0.20, rMul: 1.00, end: false },
  { frac:  0.00, rMul: 1.05, end: false }, // center of mass — strongest push, least spin
  { frac:  0.20, rMul: 1.00, end: false },
  { frac:  0.40, rMul: 0.75, end: true  }, // front/tip end — weakest push, most spin
];

const MAX_DRAG = 190;                 // world units of pull = full power (scaled up with the bigger world)
const MIN_SHOOT_POWER = 0.08;
const SHOT_SPEED = 620;               // px/s at full power
const LINEAR_FRICTION = 0.982;        // per-frame decay factor @60fps
const ANGULAR_FRICTION = 0.90;
const WALL_RESTITUTION = 0.55;
const PEN_RESTITUTION = 0.82;
const OUT_SPEED_THRESHOLD = 280;      // speed that punches a pen straight off the desk
const STOP_EPS = 5;
const ANG_EPS = 0.06;
const HANG_DURATION = 0.55;           // seconds balanced on the edge before it tips over
const HANG_CREEP = 26;                // outward drift speed while hanging
const DROP_GRAVITY = 260;             // "falling off the desk" acceleration
const OUT_ANIM_TIME = 0.7;
const FIXED_DT = 1 / 60;

// Development-only diagnostics overlay (board rect / pen coords / canvas
// size / DPR / state). Leave this false for the shipped build.
const DEBUG = false;

/* ===================== DATA: PENS (realistic, original designs) ===================== */
// Original AnvoraGames pen designs inspired by everyday school/office ballpoints.
// Not affiliated with or representing any real pen brand.
const PENS = [
  { id:"classic",  name:"Trueline Classic", price:0,
    massMult:1.00, lengthMult:1.00, widthMult:1.00, maxSpeed:1.00, frictionMult:1.00, spin:1.00, knockback:1.00,
    barrel:"#e7ecf5", barrelAlpha:0.55, grip:"#2f6fce", cap:"#2f6fce", clip:"#1d4d9e", tip:"#4a4a4a", accent:"#ffffff",
    desc:"Balanced starter pen" },
  { id:"aerotip",  name:"AeroTip", price:120,
    massMult:0.85, lengthMult:0.95, widthMult:0.92, maxSpeed:1.16, frictionMult:1.06, spin:1.15, knockback:0.85,
    barrel:"#eaf7f5", barrelAlpha:0.45, grip:"#1fb8a6", cap:"#1fb8a6", clip:"#127f73", tip:"#3d3d3d", accent:"#ffffff",
    desc:"Light barrel, quick & agile" },
  { id:"smoothflow", name:"SmoothFlow", price:260,
    massMult:1.20, lengthMult:1.02, widthMult:1.08, maxSpeed:0.92, frictionMult:0.94, spin:0.85, knockback:1.25,
    barrel:"#fff3e0", barrelAlpha:0.9, grip:"#e0912c", cap:"#c9781a", clip:"#8a5410", tip:"#3d3d3d", accent:"#fff6e6",
    desc:"Heavier barrel, strong push" },
  { id:"slimline", name:"Slimline Pro", price:400,
    massMult:0.90, lengthMult:1.14, widthMult:0.82, maxSpeed:1.05, frictionMult:1.00, spin:1.35, knockback:0.95,
    barrel:"#f0f0f0", barrelAlpha:0.35, grip:"#333333", cap:"#1a1a1a", clip:"#000000", tip:"#c9c9c9", accent:"#e8e8e8",
    desc:"Long & slim — big torque on end hits" },
  { id:"gripmaster", name:"Grip Master", price:600,
    massMult:1.35, lengthMult:0.96, widthMult:1.18, maxSpeed:0.86, frictionMult:0.90, spin:0.75, knockback:1.45,
    barrel:"#eef1f3", barrelAlpha:0.7, grip:"#c8433a", cap:"#8f2c26", clip:"#5c1a16", tip:"#333333", accent:"#ffe3e0",
    desc:"Thick rubber grip, brutal knockback" },
  { id:"officeelite", name:"Office Elite", price:850,
    massMult:1.10, lengthMult:1.05, widthMult:1.00, maxSpeed:1.05, frictionMult:1.02, spin:1.05, knockback:1.10,
    barrel:"#dfe6ea", barrelAlpha:0.85, grip:"#4a4f57", cap:"#2b2f36", clip:"#c9a24a", tip:"#c9a24a", accent:"#f4f6f8",
    desc:"Premium metal-look barrel" },
];

const DESKS = [
  { id:"school",    name:"School Desk",      price:0,   base:"#8a6a3f", grain:"#77592f", edge:"#4f3a1c" },
  { id:"wooden",     name:"Wooden Study Table", price:0, base:"#8a5a34", grain:"#794c2a", edge:"#5c3a21" },
  { id:"bench",      name:"Classroom Bench",  price:180, base:"#a9773f", grain:"#8f6330", edge:"#5f4321" },
  { id:"office",     name:"Office Desk",      price:350, base:"#6b6156", grain:"#5a5148", edge:"#3a342d" },
  { id:"oldwood",    name:"Old Wooden Desk",  price:500, base:"#6e4a2a", grain:"#5a3b20", edge:"#3c2814" },
];

/* ===================== SAVE SYSTEM ===================== */
const Save = {
  KEY: "penfight_save_v2",
  data: null,
  load(){
    let raw = null;
    try { raw = JSON.parse(localStorage.getItem(this.KEY)); } catch(e){ raw = null; }
    this.data = Object.assign({
      coins: 150,
      unlockedPens: ["classic"],
      unlockedDesks: ["school","wooden"],
      selectedPen: "classic",
      selectedDesk: "wooden",
      matchFormat: "3",
      muted: false,
      aimGuide: true,
      firstShotRule: true,
      tutorialSeen: false,
    }, raw || {});
    return this.data;
  },
  persist(){
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch(e){ /* storage unavailable */ }
  },
  addCoins(n){ this.data.coins = Math.max(0, this.data.coins + n); this.persist(); },
  unlock(kind, id){
    const arr = kind === "pen" ? this.data.unlockedPens : this.data.unlockedDesks;
    if (!arr.includes(id)) arr.push(id);
    this.persist();
  },
  select(kind, id){
    if (kind === "pen") this.data.selectedPen = id; else this.data.selectedDesk = id;
    this.persist();
  },
  reset(){
    localStorage.removeItem(this.KEY);
    this.load();
  }
};

/* ===================== AUDIO (tiny synthesized SFX, no files) ===================== */
const Audio = {
  ctx: null, master: null,
  ensure(){
    // Must be invoked from a user gesture (pointerdown, click) — browsers
    // block audio started programmatically before any interaction.
    if (!this.ctx){
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.35;
        this.master.connect(this.ctx.destination);
      } catch(e){ this.ctx = null; }
    }
    if (this.ctx && this.ctx.state === "suspended"){
      this.ctx.resume().catch(()=>{});
    }
  },
  get muted(){ return Save.data && Save.data.muted; },
  tone(freq, dur, type, gainPeak, when=0){
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gainPeak, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(t0); osc.stop(t0 + dur + 0.02);
  },
  noise(dur, gainPeak, filterFreq){
    if (this.muted) return;
    this.ensure();
    if (!this.ctx) return;
    const bufSize = this.ctx.sampleRate * dur;
    const buf = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i=0;i<bufSize;i++) data[i] = (Math.random()*2-1) * (1 - i/bufSize);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filt = this.ctx.createBiquadFilter();
    filt.type = "lowpass"; filt.frequency.value = filterFreq || 2200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gainPeak, this.ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + dur);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
  },
  launch(power){ this.noise(0.10 + power*0.05, 0.18 + power*0.15, 3200); this.tone(300+power*220, 0.09, "triangle", 0.1); },
  slide(){ /* ambient — skipped to keep it light */ },
  collide(strength){
    const s = Math.min(1, strength/900);
    this.noise(0.05, 0.08+s*0.22, 1400+s*1200);
    this.tone(180+s*260, 0.06, "square", 0.05+s*0.08);
  },
  wallHit(strength){
    const s = Math.min(1, strength/500);
    this.noise(0.05, 0.06+s*0.12, 900);
  },
  fallOff(){ this.noise(0.28, 0.22, 700); this.tone(140, 0.22, "sine", 0.1); },
  click(){ this.tone(520, 0.05, "square", 0.06); },
  victory(){ [0,1,2].forEach(i=>this.tone(440+i*130, 0.18, "triangle", 0.12, i*0.11)); },
  defeat(){ [0,1].forEach(i=>this.tone(220-i*60, 0.28, "sawtooth", 0.08, i*0.14)); },
};

/* ===================== RIGID PEN BODY ===================== */
class PenBody {
  constructor(stats, x, y, angle, side){
    this.stats = stats;
    this.x = x; this.y = y; this.angle = angle;
    this.vx = 0; this.vy = 0; this.angVel = 0;
    this.length = PEN_LENGTH * stats.lengthMult;
    this.width  = PEN_WIDTH  * stats.widthMult;
    this.mass = PEN_MASS * stats.massMult;
    this.inertia = (this.mass * (this.length*this.length + this.width*this.width) / 12) / stats.spin;
    this.side = side; // 'player' | 'ai'
    this.state = "onboard"; // onboard | hanging | out
    this.hangTimer = 0;
    this.hangNormal = null;
    this.outVX = 0; this.outVY = 0; this.outAngVel = 0; this.outT = 0;
  }
  get speed(){ return Math.hypot(this.vx, this.vy); }
  circles(){
    const cs = new Array(CIRCLES.length);
    const cosA = Math.cos(this.angle), sinA = Math.sin(this.angle);
    for (let i=0;i<CIRCLES.length;i++){
      const c = CIRCLES[i];
      const off = c.frac * this.length;
      cs[i] = { x: this.x + cosA*off, y: this.y + sinA*off, r: (this.width/2)*c.rMul, off, end: c.end };
    }
    return cs;
  }
  reset(x, y, angle){
    this.x=x; this.y=y; this.angle=angle;
    this.vx=0; this.vy=0; this.angVel=0;
    this.state="onboard"; this.hangTimer=0; this.hangNormal=null; this.outT=0;
  }
  shoot(dirX, dirY, power){
    const spd = SHOT_SPEED * power * this.stats.maxSpeed;
    this.vx = dirX * spd; this.vy = dirY * spd;
    this.angVel += (Math.random()-0.5) * 0.6; // tiny natural release wobble
  }
}

/* ===================== PHYSICS ===================== */
const Physics = {
  step(pens, dt, fx){
    for (const p of pens){
      if (p.state === "out"){
        p.outT += dt;
        p.x += p.outVX * dt; p.y += p.outVY * dt;
        p.outVY += DROP_GRAVITY * dt;
        p.angle += p.outAngVel * dt;
        continue;
      }
      // integrate
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.angle += p.angVel * dt;

      // friction (frame-rate independent-ish)
      const lf = Math.pow(LINEAR_FRICTION / p.stats.frictionMult, dt*60);
      p.vx *= lf; p.vy *= lf;
      p.angVel *= Math.pow(ANGULAR_FRICTION, dt*60);
      if (p.speed < STOP_EPS){ p.vx = 0; p.vy = 0; }
      if (Math.abs(p.angVel) < ANG_EPS) p.angVel = 0;

      this.wallCheck(p, dt, fx);
    }
    if (pens.length === 2 && pens[0].state !== "out" && pens[1].state !== "out"){
      this.resolvePenCollision(pens[0], pens[1], fx);
    }
  },

  wallCheck(p, dt, fx){
    if (p.state === "out") return;
    const cs = p.circles();
    let best = null, bestOverlap = 0, endOverlapMax = 0, endNormal = null;

    for (const c of cs){
      let ov = 0, nx = 0, ny = 0;
      if (c.x - c.r < ARENA.left){ ov = ARENA.left - (c.x - c.r); nx = -1; ny = 0; }
      else if (c.x + c.r > ARENA.right){ ov = (c.x + c.r) - ARENA.right; nx = 1; ny = 0; }
      if (c.y - c.r < ARENA.top){ const o2 = ARENA.top - (c.y - c.r); if (o2 > ov){ ov = o2; nx = 0; ny = -1; } }
      else if (c.y + c.r > ARENA.bottom){ const o2 = (c.y + c.r) - ARENA.bottom; if (o2 > ov){ ov = o2; nx = 0; ny = 1; } }

      if (ov > 0){
        if (c.end && ov > endOverlapMax){ endOverlapMax = ov; endNormal = {x:nx, y:ny}; }
        if (ov > bestOverlap){ bestOverlap = ov; best = { cx:c.x, cy:c.y, r:c.r, overlap:ov, normal:{x:nx,y:ny} }; }
      }
    }

    if (!best){
      if (p.state === "hanging"){ p.state = "onboard"; p.hangTimer = 0; }
      return;
    }

    const speed = p.speed;
    if (speed > OUT_SPEED_THRESHOLD){
      p.state = "out"; p.outVX = p.vx; p.outVY = p.vy; p.outAngVel = p.angVel; p.outT = 0;
      if (fx) fx.onOut(p);
      return;
    }

    // an END circle deeply past the edge = the pen is genuinely hanging off the desk
    if (endNormal && endOverlapMax > p.width * 0.85){
      p.state = "hanging";
      p.hangTimer += dt;
      p.hangNormal = endNormal;
      p.vx += endNormal.x * HANG_CREEP * dt;
      p.vy += endNormal.y * HANG_CREEP * dt;
      p.angVel += (Math.random()-0.5) * 0.4 * dt * 60;
      if (p.hangTimer > HANG_DURATION){
        p.state = "out";
        p.outVX = endNormal.x * 90; p.outVY = endNormal.y * 90 + 40;
        p.outAngVel = p.angVel + (Math.random()-0.5)*2;
        p.outT = 0;
        if (fx) fx.onFallOff(p);
      }
      return;
    }

    // ordinary bounce off the desk edge, with rotation from off-center contact
    this.resolveWallImpulse(p, best);
    if (fx) fx.onWallHit(p, speed);
    if (p.state === "hanging"){ p.state = "onboard"; p.hangTimer = 0; }
  },

  resolveWallImpulse(p, hit){
    const n = hit.normal; // outward normal
    const rx = hit.cx - p.x, ry = hit.cy - p.y;
    const vAtX = p.vx - p.angVel * ry;
    const vAtY = p.vy + p.angVel * rx;
    const velAlongN = vAtX*n.x + vAtY*n.y;
    if (velAlongN > 0){
      const invMass = 1/p.mass, invI = 1/p.inertia;
      const rCrossN = rx*n.y - ry*n.x;
      const denom = invMass + rCrossN*rCrossN*invI;
      const j = -(1+WALL_RESTITUTION) * velAlongN / denom;
      const ix = n.x*j, iy = n.y*j;
      p.vx += ix*invMass; p.vy += iy*invMass;
      p.angVel += (rx*iy - ry*ix) * invI;
    }
    const corr = hit.overlap * 0.9;
    p.x -= n.x*corr; p.y -= n.y*corr;
  },

  resolvePenCollision(a, b, fx){
    const ca = a.circles(), cb = b.circles();
    const invMassA = 1/a.mass, invMassB = 1/b.mass, invIA = 1/a.inertia, invIB = 1/b.inertia;
    let maxImpulse = 0, hitHappened = false;

    for (const p1 of ca){
      for (const p2 of cb){
        const dx = p2.x - p1.x, dy = p2.y - p1.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        const minDist = p1.r + p2.r;
        if (dist >= minDist) continue;

        const nx = dx/dist, ny = dy/dist;
        const rax = p1.x - a.x, ray = p1.y - a.y;
        const rbx = p2.x - b.x, rby = p2.y - b.y;

        const vAx = a.vx - a.angVel*ray, vAy = a.vy + a.angVel*rax;
        const vBx = b.vx - b.angVel*rby, vBy = b.vy + b.angVel*rbx;
        const relX = vBx - vAx, relY = vBy - vAy;
        const velAlongN = relX*nx + relY*ny;
        if (velAlongN > 0) continue; // already separating

        const raCrossN = rax*ny - ray*nx;
        const rbCrossN = rbx*ny - rby*nx;
        const denom = invMassA + invMassB + raCrossN*raCrossN*invIA + rbCrossN*rbCrossN*invIB;
        let j = -(1+PEN_RESTITUTION) * velAlongN / denom;

        const speedA = Math.hypot(a.vx,a.vy), speedB = Math.hypot(b.vx,b.vy);
        const attacker = speedA > speedB ? a : b;
        j *= (0.85 + 0.3*attacker.stats.knockback);

        const ix = nx*j, iy = ny*j;
        a.vx -= ix*invMassA; a.vy -= iy*invMassA;
        b.vx += ix*invMassB; b.vy += iy*invMassB;
        a.angVel -= (rax*iy - ray*ix) * invIA;
        b.angVel += (rbx*iy - rby*ix) * invIB;

        const overlap = minDist - dist;
        const corr = overlap * 0.5;
        a.x -= nx*corr; a.y -= ny*corr;
        b.x += nx*corr; b.y += ny*corr;

        maxImpulse = Math.max(maxImpulse, Math.abs(j));
        hitHappened = true;
      }
    }
    if (hitHappened && fx) fx.onCollision(a, b, maxImpulse);
  }
};

/* ===================== AI ===================== */
const AI = {
  planShot(aiPen, targetPen, difficulty){
    const dx = targetPen.x - aiPen.x, dy = targetPen.y - aiPen.y;
    let angle = Math.atan2(dy, dx);
    const dist = Math.hypot(dx, dy);
    const maxDist = Math.hypot(ARENA.right-ARENA.left, ARENA.bottom-ARENA.top);

    let angleNoise, powerNoise, minPower;
    if (difficulty === "easy"){ angleNoise=0.36; powerNoise=0.32; minPower=0.30; }
    else if (difficulty === "medium"){ angleNoise=0.16; powerNoise=0.17; minPower=0.38; }
    else { angleNoise=0.05; powerNoise=0.09; minPower=0.42; }

    // occasional bank shot off the nearer side wall
    const bankChance = difficulty === "hard" ? 0.24 : difficulty === "medium" ? 0.09 : 0;
    if (Math.random() < bankChance){
      const wallX = (aiPen.x < (ARENA.left+ARENA.right)/2) ? ARENA.left : ARENA.right;
      const mirroredX = 2*wallX - targetPen.x;
      angle = Math.atan2(targetPen.y - aiPen.y, mirroredX - aiPen.x);
    }

    angle += (Math.random()*2-1) * angleNoise;
    let power = Math.min(1, Math.max(minPower, dist/maxDist + (Math.random()*2-1)*powerNoise));

    // edge-risk awareness: ease off if the AI pen sits close to a side wall already
    const distToSideWall = Math.min(aiPen.x - ARENA.left, ARENA.right - aiPen.x);
    if (distToSideWall < 90){
      const caution = difficulty === "hard" ? 0.92 : difficulty === "medium" ? 0.85 : 0.75;
      power *= caution;
    }

    return { dirX: Math.cos(angle), dirY: Math.sin(angle), power };
  }
};

/* ===================== RENDERER ===================== */
const Renderer = {
  canvas: null, ctx: null,
  scale: 1, offX: 0, offY: 0,
  deskCache: null, deskCacheKey: "",
  _lastW: 0, _lastH: 0,

  init(canvas){
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx){
      console.error("PEN FIGHT: 2D canvas context could not be created.");
      return;
    }
    this.resize();
    // BUGFIX: the canvas lives inside #screen-game, which is display:none
    // until the player presses PLAY. Measuring it here can yield 0x0 (and a
    // render scale of 0), and nothing ever re-measured it once the screen
    // became visible — that's why the board/pens rendered as nothing while
    // the HTML score/buttons (ordinary DOM, unaffected by canvas scale)
    // still showed up fine. checkResize() re-measures cheaply every frame
    // and only calls the real resize() when the size actually changed.
    window.addEventListener("resize", () => this.checkResize(true));
    window.addEventListener("orientationchange", () => setTimeout(()=>this.checkResize(true), 60));
  },

  // Cheap per-frame guard: two property reads, no canvas mutation unless
  // the measured size actually changed (covers window resizes AND the
  // screen becoming visible after being display:none).
  checkResize(force){
    const wrap = this.canvas.parentElement;
    const w = wrap.clientWidth, h = wrap.clientHeight;
    if (w <= 0 || h <= 0) return; // still hidden/unmeasured — try again next frame
    if (force || w !== this._lastW || h !== this._lastH){
      this.resize();
    }
  },

  resize(){
    const wrap = this.canvas.parentElement;
    const cssW = wrap.clientWidth, cssH = wrap.clientHeight;
    if (cssW <= 0 || cssH <= 0) return; // don't commit a 0x0 canvas
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.floor(cssW * dpr);
    this.canvas.height = Math.floor(cssH * dpr);
    this.canvas.style.width = cssW + "px";
    this.canvas.style.height = cssH + "px";
    this.scale = Math.min(cssW / WORLD_W, cssH / WORLD_H);
    this.offX = (cssW - WORLD_W*this.scale) / 2;
    this.offY = (cssH - WORLD_H*this.scale) / 2;
    this.dpr = dpr;
    this.deskCache = null;
    this._lastW = cssW; this._lastH = cssH;
  },

  worldToScreen(x,y){ return [this.offX + x*this.scale, this.offY + y*this.scale]; },

  buildDeskCache(desk){
    const w = Math.ceil(WORLD_W*this.scale), h = Math.ceil(WORLD_H*this.scale);
    const off = document.createElement("canvas");
    off.width = w; off.height = h;
    const c = off.getContext("2d");
    const s = this.scale;

    // desk surface
    c.fillStyle = desk.base;
    roundRectPath(c, 8*s, 8*s, w-16*s, h-16*s, 22*s);
    c.fill();

    // grain streaks (cheap procedural lines, seeded so it's stable per desk id)
    let seed = 0; for (const ch of desk.id) seed += ch.charCodeAt(0);
    let rng = mulberry32(seed);
    c.globalAlpha = 0.18; c.strokeStyle = desk.grain; c.lineWidth = Math.max(1, 1.4*s);
    for (let i=0;i<26;i++){
      const y = 20*s + rng()*(h-40*s);
      c.beginPath();
      c.moveTo(14*s, y);
      let x = 14*s;
      while (x < w-14*s){
        x += 30*s + rng()*40*s;
        c.lineTo(x, y + (rng()-0.5)*6*s);
      }
      c.stroke();
    }
    c.globalAlpha = 1;

    // arena playfield (slightly recessed look) with a beveled edge that has
    // real visible thickness — the boundary a pen has to actually go OVER
    // rather than a flat line it just crosses.
    const ax = this.offXlocal(ARENA.left), ay = ARENA.top*s, aw = (ARENA.right-ARENA.left)*s, ah = (ARENA.bottom-ARENA.top)*s;
    c.save();
    c.fillStyle = "rgba(0,0,0,0.05)";
    roundRectPath(c, ax, ay, aw, ah, 14*s);
    c.fill();
    // depth: a soft dark offset shadow first (the "drop" beyond the lip),
    // then the darker lip itself, then a thin bright highlight on the inner
    // top edge so the boundary reads as a raised rim with real thickness.
    c.globalAlpha = 0.30; c.strokeStyle = "#150d06"; c.lineWidth = Math.max(3, 6*s);
    roundRectPath(c, ax+2.5*s, ay+2.5*s, aw, ah, 14*s);
    c.stroke();
    c.globalAlpha = 0.75; c.strokeStyle = desk.edge; c.lineWidth = Math.max(2.5, 4.5*s);
    roundRectPath(c, ax, ay, aw, ah, 14*s);
    c.stroke();
    c.globalAlpha = 0.35; c.strokeStyle = "rgba(255,235,200,0.9)"; c.lineWidth = Math.max(0.8, 1.2*s);
    roundRectPath(c, ax+1.5*s, ay+1.5*s, aw-3*s, ah-3*s, 12*s);
    c.stroke();
    c.restore();

    // baselines
    c.save();
    c.setLineDash([6*s,6*s]);
    c.lineWidth = Math.max(1, 2*s);
    c.strokeStyle = "rgba(47,111,206,0.55)";
    c.beginPath(); c.moveTo(ax+10*s, PLAYER_BASE_Y*s); c.lineTo(ax+aw-10*s, PLAYER_BASE_Y*s); c.stroke();
    c.strokeStyle = "rgba(200,67,58,0.55)";
    c.beginPath(); c.moveTo(ax+10*s, AI_BASE_Y*s); c.lineTo(ax+aw-10*s, AI_BASE_Y*s); c.stroke();
    c.restore();

    // ===== "years of students writing on this desk" — deterministic per desk id =====
    let seed2 = 0; for (const ch of desk.id) seed2 += ch.charCodeAt(0) * 31;
    rng = mulberry32(seed2 + 101);

    // uneven wood coloring — a few soft irregular tint patches under everything else
    c.save();
    for (let i=0;i<5;i++){
      const cx = ARENA.left*s + rng()*aw, cy = ARENA.top*s + rng()*ah;
      const rad = (60+rng()*90)*s;
      const g = c.createRadialGradient(cx,cy,0,cx,cy,rad);
      const tint = rng() < 0.5 ? "rgba(40,25,10,0.10)" : "rgba(255,235,190,0.08)";
      g.addColorStop(0, tint); g.addColorStop(1, "rgba(0,0,0,0)");
      c.fillStyle = g;
      c.beginPath(); c.arc(cx,cy,rad,0,Math.PI*2); c.fill();
    }
    c.restore();

    // old stains (coffee/ink blotches)
    c.save();
    for (let i=0;i<3;i++){
      const cx = ARENA.left*s + rng()*aw, cy = ARENA.top*s + rng()*ah;
      const rad = (14+rng()*20)*s;
      const g = c.createRadialGradient(cx,cy,0,cx,cy,rad);
      g.addColorStop(0, "rgba(60,35,10,0.12)"); g.addColorStop(1, "rgba(60,35,10,0)");
      c.fillStyle = g;
      c.beginPath(); c.ellipse(cx,cy,rad,rad*0.7,rng()*Math.PI,0,Math.PI*2); c.fill();
    }
    // eraser smudges (lighter patches)
    for (let i=0;i<3;i++){
      const cx = ARENA.left*s + rng()*aw, cy = ARENA.top*s + rng()*ah;
      const rad = (18+rng()*24)*s;
      const g = c.createRadialGradient(cx,cy,0,cx,cy,rad);
      g.addColorStop(0, "rgba(255,248,225,0.10)"); g.addColorStop(1, "rgba(255,248,225,0)");
      c.fillStyle = g;
      c.beginPath(); c.ellipse(cx,cy,rad,rad*0.6,rng()*Math.PI,0,Math.PI*2); c.fill();
    }
    c.restore();

    // faint ruler-drawn lines (a student's underline/table lines, partial length)
    c.save();
    c.globalAlpha = 0.12; c.strokeStyle = "#3a2a18"; c.lineWidth = Math.max(0.6, 1*s);
    for (let i=0;i<3;i++){
      const x = ARENA.left*s + rng()*aw*0.6, y = ARENA.top*s + rng()*ah;
      const len = (40+rng()*70)*s;
      c.beginPath(); c.moveTo(x,y); c.lineTo(x+len, y + (rng()-0.5)*3*s); c.stroke();
    }
    c.restore();

    // handwriting — short, faded, varied opacity, scattered, never covering
    // the whole desk (keep the middle mostly clear so gameplay stays clean)
    const WORDS = ["RAHUL","AK","2026","2+2=4","LOL","BEST","HELLO","ABC","123","PRIYA","SK+RM","9-4=5","EXAM","CLASS 9","NO.7","OK"];
    c.save();
    c.textBaseline = "middle";
    for (let i=0;i<12;i++){
      // bias away from dead-center so the middle of the desk stays clean
      let x, y;
      do {
        x = ARENA.left*s + rng()*aw;
        y = ARENA.top*s + rng()*ah;
      } while (Math.hypot(x-(ax+aw/2), y-(ay+ah/2)) < Math.min(aw,ah)*0.16);
      const word = WORDS[Math.floor(rng()*WORDS.length)];
      const size = (10 + rng()*7) * s;
      const rot = (rng()-0.5) * 0.7;
      const inkPick = rng();
      const ink = inkPick < 0.55 ? "30,30,35" : inkPick < 0.85 ? "20,30,70" : "70,20,20";
      const alpha = 0.08 + rng()*0.16;
      c.save();
      c.translate(x,y); c.rotate(rot);
      c.font = `${rng()<0.5?"italic ":""}${size.toFixed(0)}px 'Comic Sans MS', 'Segoe Print', cursive, sans-serif`;
      c.fillStyle = `rgba(${ink},${alpha.toFixed(2)})`;
      c.fillText(word, 0, 0);
      // occasionally underline or cross out the word
      const deco = rng();
      const wWidth = c.measureText(word).width;
      if (deco < 0.22){
        c.strokeStyle = `rgba(${ink},${(alpha*0.9).toFixed(2)})`;
        c.lineWidth = Math.max(0.6, 1*s);
        c.beginPath(); c.moveTo(-2*s, size*0.42); c.lineTo(wWidth+2*s, size*0.42); c.stroke();
      } else if (deco < 0.32){
        c.strokeStyle = `rgba(${ink},${(alpha*0.9).toFixed(2)})`;
        c.lineWidth = Math.max(0.6, 1.1*s);
        c.beginPath(); c.moveTo(-2*s, -size*0.15); c.lineTo(wWidth+2*s, size*0.15); c.stroke();
      }
      c.restore();
    }
    c.restore();

    // small doodles: stars, hearts, circles, arrows — kept tiny and faint
    c.save();
    for (let i=0;i<7;i++){
      let x, y;
      do {
        x = ARENA.left*s + rng()*aw;
        y = ARENA.top*s + rng()*ah;
      } while (Math.hypot(x-(ax+aw/2), y-(ay+ah/2)) < Math.min(aw,ah)*0.14);
      const kind = Math.floor(rng()*4);
      const size = (6 + rng()*7) * s;
      const alpha = 0.10 + rng()*0.14;
      c.save();
      c.translate(x,y); c.rotate(rng()*Math.PI*2);
      if (kind === 0){ // star
        c.strokeStyle = `rgba(30,30,35,${alpha})`; c.lineWidth = Math.max(0.6, 0.9*s);
        c.beginPath();
        for (let k=0;k<5;k++){
          const a1 = (k*4*Math.PI)/5 - Math.PI/2;
          const px = Math.cos(a1)*size, py = Math.sin(a1)*size;
          k===0 ? c.moveTo(px,py) : c.lineTo(px,py);
        }
        c.closePath(); c.stroke();
      } else if (kind === 1){ // heart
        c.fillStyle = `rgba(160,40,40,${alpha})`;
        c.beginPath();
        c.moveTo(0, size*0.3);
        c.bezierCurveTo(-size, -size*0.4, -size*0.4, -size*1.1, 0, -size*0.3);
        c.bezierCurveTo(size*0.4, -size*1.1, size, -size*0.4, 0, size*0.3);
        c.fill();
      } else if (kind === 2){ // circled scribble
        c.strokeStyle = `rgba(30,30,35,${alpha})`; c.lineWidth = Math.max(0.6, 0.9*s);
        c.beginPath(); c.ellipse(0,0,size,size*0.7,0,0,Math.PI*2); c.stroke();
      } else { // small arrow
        c.strokeStyle = `rgba(20,30,70,${alpha})`; c.lineWidth = Math.max(0.6, 1*s);
        c.beginPath(); c.moveTo(-size,0); c.lineTo(size,0); c.stroke();
        c.beginPath(); c.moveTo(size,0); c.lineTo(size-size*0.5, -size*0.35); c.moveTo(size,0); c.lineTo(size-size*0.5, size*0.35); c.stroke();
      }
      c.restore();
    }
    c.restore();

    // small worn details: scratches, pencil marks, faint ink dot
    rng = mulberry32(seed+7);
    c.globalAlpha = 0.14; c.strokeStyle = "#2a1c10"; c.lineWidth = Math.max(0.6, 0.9*s);
    for (let i=0;i<9;i++){
      const x = ARENA.left*s + rng()*aw, y = ARENA.top*s + rng()*ah;
      const len = 8*s + rng()*14*s, ang = rng()*Math.PI;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x+Math.cos(ang)*len, y+Math.sin(ang)*len);
      c.stroke();
    }
    c.globalAlpha = 0.08; c.fillStyle = "#1c3a6b";
    for (let i=0;i<3;i++){
      const x = ARENA.left*s + rng()*aw, y = ARENA.top*s + rng()*ah;
      c.beginPath(); c.arc(x,y, (1+rng()*1.6)*s, 0, Math.PI*2); c.fill();
    }
    c.globalAlpha = 1;

    this.deskCache = off;
    this.deskCacheKey = desk.id;
  },
  offXlocal(worldX){ return worldX*this.scale; },

  drawBackground(desk){
    if (!this.deskCache || this.deskCacheKey !== desk.id) this.buildDeskCache(desk);
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    ctx.fillStyle = "#efe4cf";
    ctx.fillRect(0,0, this.canvas.width/this.dpr, this.canvas.height/this.dpr);
    ctx.drawImage(this.deskCache, this.offX, this.offY);
    ctx.restore();
  },

  drawPen(p){
    const ctx = this.ctx;
    const s = this.scale;
    const [sx, sy] = this.worldToScreen(p.x, p.y);
    const fallProgress = p.state === "out" ? Math.min(1, p.outT/OUT_ANIM_TIME) : 0;
    const alpha = p.state === "out" ? Math.max(0, 1 - fallProgress) : 1;
    if (alpha <= 0.02) return;
    // as it falls off the desk it visibly shrinks/recedes rather than just
    // fading in place — reads as "falling away" instead of "disappearing"
    const fallScale = 1 - fallProgress*0.45;

    // while genuinely hanging off the edge (about to tip over), cast a
    // soft dark shadow into the space beyond the desk — a visual cue that
    // part of the pen is already over open air.
    if (p.state === "hanging" && p.hangNormal){
      const t = Math.min(1, p.hangTimer / HANG_DURATION);
      const [hx, hy] = this.worldToScreen(
        p.x + p.hangNormal.x * p.length*0.35,
        p.y + p.hangNormal.y * p.length*0.35
      );
      ctx.save();
      ctx.globalAlpha = 0.10 + t*0.22;
      ctx.fillStyle = "#0c0704";
      ctx.beginPath();
      ctx.ellipse(hx, hy, (10+t*16)*s, (6+t*10)*s, Math.atan2(p.hangNormal.y,p.hangNormal.x), 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // soft shadow (offset slightly to suggest an object resting above the desk)
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(p.angle);
    ctx.fillStyle = "rgba(20,12,4,0.22)";
    roundRectPath(ctx, -p.length/2*s+2*s, -p.width/2*s+3*s, p.length*s, p.width*s, p.width/2*s);
    ctx.fill();
    ctx.restore();

    ctx.translate(sx, sy);
    ctx.rotate(p.angle);
    if (fallScale !== 1) ctx.scale(fallScale, fallScale);
    const st = p.stats;
    const L = p.length*s, W = p.width*s;
    const halfL = L/2, halfW = W/2;
    const tipLen = L*0.09, gripLen = L*0.24, capLen = L*0.26;
    const barrelStart = -halfL + capLen;
    const barrelEnd = halfL - tipLen - gripLen;

    // CAP (back end) + clip + end button
    ctx.fillStyle = st.cap;
    roundRectPath(ctx, -halfL, -halfW, capLen, W, halfW*0.9);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    roundRectPath(ctx, -halfL+capLen*0.15, -halfW*0.35, capLen*0.5, halfW*0.35, halfW*0.2);
    ctx.fill();
    // clip
    ctx.fillStyle = st.clip;
    ctx.beginPath();
    ctx.moveTo(-halfL+capLen*0.15, -halfW);
    ctx.lineTo(-halfL+capLen*0.55, -halfW - halfW*1.1);
    ctx.lineTo(-halfL+capLen*0.72, -halfW - halfW*1.1);
    ctx.lineTo(-halfL+capLen*0.62, -halfW);
    ctx.closePath();
    ctx.fill();
    // end button
    ctx.fillStyle = st.accent;
    ctx.beginPath(); ctx.arc(-halfL+2*s, 0, halfW*0.55, 0, Math.PI*2); ctx.fill();

    // BARREL (translucent) + refill line + brand stripe
    ctx.save();
    ctx.globalAlpha *= st.barrelAlpha;
    ctx.fillStyle = st.barrel;
    roundRectPath(ctx, barrelStart, -halfW*0.92, barrelEnd-barrelStart, halfW*1.84, halfW*0.5);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = st.grip;
    ctx.lineWidth = Math.max(0.6, halfW*0.14);
    ctx.beginPath();
    ctx.moveTo(barrelStart+ (barrelEnd-barrelStart)*0.08, halfW*0.12);
    ctx.lineTo(barrelStart+ (barrelEnd-barrelStart)*0.92, halfW*0.12);
    ctx.stroke();
    // tiny printed brand block
    ctx.fillStyle = "rgba(30,20,10,0.35)";
    const brandW = (barrelEnd-barrelStart)*0.28;
    ctx.fillRect(barrelStart + (barrelEnd-barrelStart)*0.35, -halfW*0.3, brandW, halfW*0.22);

    // GRIP (textured band near the tip)
    ctx.fillStyle = st.grip;
    roundRectPath(ctx, barrelEnd, -halfW*0.98, gripLen, halfW*1.96, halfW*0.35);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = Math.max(0.5, halfW*0.10);
    for (let i=1;i<=4;i++){
      const gx = barrelEnd + (gripLen*i/5);
      ctx.beginPath(); ctx.moveTo(gx, -halfW*0.9); ctx.lineTo(gx, halfW*0.9); ctx.stroke();
    }

    // TIP CONE
    const tipStart = barrelEnd + gripLen;
    ctx.fillStyle = st.tip;
    ctx.beginPath();
    ctx.moveTo(tipStart, -halfW*0.55);
    ctx.lineTo(halfL, 0);
    ctx.lineTo(tipStart, halfW*0.55);
    ctx.closePath();
    ctx.fill();
    // metal glint on tip
    ctx.fillStyle = "rgba(255,255,255,0.5)";
    ctx.beginPath(); ctx.ellipse(tipStart+ (halfL-tipStart)*0.4, -halfW*0.15, halfW*0.12, halfW*0.06, 0, 0, Math.PI*2); ctx.fill();

    // faint outline over whole silhouette for crispness
    ctx.globalAlpha = alpha*0.5;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = Math.max(0.6, halfW*0.10);
    roundRectPath(ctx, -halfL, -halfW, L, W, halfW*0.5);
    ctx.stroke();

    ctx.restore();
  },

  drawAimGuide(game){
    if (!game.aim.active || game.input.mode !== "aim") return;
    if (!Save.data.aimGuide) return;
    const ctx = this.ctx;
    const s = this.scale;
    const p = game.playerPen;
    const [ox, oy] = this.worldToScreen(p.x, p.y);
    const dirX = game.aim.dirX, dirY = game.aim.dirY;
    const guideLen = 46 + game.aim.power*130;
    ctx.save();
    ctx.strokeStyle = "rgba(47,111,206,0.75)";
    ctx.lineWidth = Math.max(1.5, 2.2*s);
    ctx.setLineDash([5*s, 7*s]);
    ctx.beginPath();
    ctx.moveTo(ox + dirX*p.length*0.5*s, oy + dirY*p.length*0.5*s);
    ctx.lineTo(ox + dirX*(p.length*0.5+guideLen)*s, oy + dirY*(p.length*0.5+guideLen)*s);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(47,111,206,0.85)";
    const tipX = ox + dirX*(p.length*0.5+guideLen)*s, tipY = oy + dirY*(p.length*0.5+guideLen)*s;
    ctx.beginPath(); ctx.arc(tipX, tipY, 3.5*s, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  },

  drawParticles(particles){
    const ctx = this.ctx;
    for (const pt of particles){
      const [sx, sy] = this.worldToScreen(pt.x, pt.y);
      ctx.save();
      ctx.globalAlpha = Math.max(0, pt.life/pt.maxLife);
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(sx, sy, pt.r*this.scale, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
  },

  render(game){
    const ctx = this.ctx;
    this.drawBackground(game.desk);
    ctx.save();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    if (game.shake > 0){
      const sh = game.shake;
      ctx.translate((Math.random()-0.5)*sh, (Math.random()-0.5)*sh);
    }
    this.drawAimGuide(game);
    // draw the pen further back (lower y) first isn't necessary since only 2 pens; draw by y order for subtle overlap correctness
    const pens = [game.playerPen, game.aiPen].sort((a,b)=>a.y-b.y);
    for (const p of pens) this.drawPen(p);
    this.drawParticles(game.particles);
    ctx.restore();
  },

  // DEV ONLY (gated by the DEBUG flag) — never runs in the shipped build.
  drawDebug(game){
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr,0,0,this.dpr,0,0);
    const [ax, ay] = this.worldToScreen(ARENA.left, ARENA.top);
    const aw = (ARENA.right-ARENA.left)*this.scale, ah = (ARENA.bottom-ARENA.top)*this.scale;
    ctx.strokeStyle = "#ff00ff"; ctx.lineWidth = 1.5;
    ctx.strokeRect(ax, ay, aw, ah);
    [game.playerPen, game.aiPen].forEach(p => {
      const [sx, sy] = this.worldToScreen(p.x, p.y);
      ctx.fillStyle = "#00ff00"; ctx.beginPath(); ctx.arc(sx, sy, 3, 0, Math.PI*2); ctx.fill();
    });
    ctx.fillStyle = "#000"; ctx.fillRect(6, 6, 250, 108);
    ctx.fillStyle = "#0f0"; ctx.font = "11px monospace";
    const lines = [
      `canvas: ${this.canvas.width}x${this.canvas.height} dpr:${this.dpr}`,
      `css: ${this._lastW}x${this._lastH} scale:${this.scale.toFixed(3)}`,
      `state: ${game.state} turn: ${game.turn}`,
      `player: ${game.playerPen.x.toFixed(0)},${game.playerPen.y.toFixed(0)} (${game.playerPen.state})`,
      `ai: ${game.aiPen.x.toFixed(0)},${game.aiPen.y.toFixed(0)} (${game.aiPen.state})`,
    ];
    lines.forEach((l,i)=> ctx.fillText(l, 12, 22+i*18));
    ctx.restore();
  }
};

function roundRectPath(ctx, x, y, w, h, r){
  const rr = Math.max(0, Math.min(r, Math.abs(w)/2, Math.abs(h)/2));
  ctx.beginPath();
  ctx.moveTo(x+rr, y);
  ctx.arcTo(x+w, y, x+w, y+h, rr);
  ctx.arcTo(x+w, y+h, x, y+h, rr);
  ctx.arcTo(x, y+h, x, y, rr);
  ctx.arcTo(x, y, x+w, y, rr);
  ctx.closePath();
}
function mulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ===================== UI / DOM WIRING ===================== */
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));

const UI = {
  els: {},
  init(){
    this.els.coinCounts = [$("#coin-count"), $("#coin-count-2")];
    $$("[data-nav]").forEach(btn => btn.addEventListener("click", () => {
      Audio.click();
      this.nav(btn.dataset.nav);
    }));
    $$(".diff-btn[data-diff]").forEach(btn => btn.addEventListener("click", () => {
      Audio.click();
      Game.startMatch(btn.dataset.diff);
    }));
    $$(".diff-btn[data-format]").forEach(btn => btn.addEventListener("click", () => {
      Audio.click();
      Save.data.matchFormat = btn.dataset.format;
      Save.persist();
      this.refreshMatchScreen();
    }));

    this.buildPenGrid();
    this.buildDeskGrid();
    this.refreshCoins();
    this.refreshMatchScreen();

    const soundBtn = $("#toggle-sound");
    soundBtn.addEventListener("click", () => {
      Save.data.muted = !Save.data.muted;
      Save.persist();
      soundBtn.textContent = Save.data.muted ? "OFF" : "ON";
      soundBtn.classList.toggle("off", Save.data.muted);
      $("#btn-mute").textContent = Save.data.muted ? "🔇" : "🔊";
    });
    soundBtn.textContent = Save.data.muted ? "OFF" : "ON";
    soundBtn.classList.toggle("off", Save.data.muted);

    const aimBtn = $("#toggle-aimguide");
    const syncAim = () => { aimBtn.textContent = Save.data.aimGuide ? "ON" : "OFF"; aimBtn.classList.toggle("off", !Save.data.aimGuide); };
    aimBtn.addEventListener("click", () => { Save.data.aimGuide = !Save.data.aimGuide; Save.persist(); syncAim(); });
    syncAim();

    const fsBtn = $("#toggle-firstshot");
    const syncFs = () => { fsBtn.textContent = Save.data.firstShotRule ? "ON" : "OFF"; fsBtn.classList.toggle("off", !Save.data.firstShotRule); };
    fsBtn.addEventListener("click", () => { Save.data.firstShotRule = !Save.data.firstShotRule; Save.persist(); syncFs(); });
    syncFs();

    $("#reset-progress").addEventListener("click", () => {
      if (confirm("Reset all progress and coins?")){
        Save.reset();
        this.buildPenGrid(); this.buildDeskGrid(); this.refreshCoins(); this.refreshMatchScreen();
        soundBtn.textContent = "ON"; soundBtn.classList.remove("off");
        syncAim(); syncFs();
      }
    });

    $("#btn-pause").addEventListener("click", () => Game.togglePause());
    $("#btn-mute").addEventListener("click", () => {
      Save.data.muted = !Save.data.muted; Save.persist();
      $("#btn-mute").textContent = Save.data.muted ? "🔇" : "🔊";
    });
    $("#btn-mute").textContent = Save.data.muted ? "🔇" : "🔊";

    $("#resume-btn").addEventListener("click", () => Game.togglePause());
    $("#restart-btn").addEventListener("click", () => { Game.togglePause(); Game.restartRound(true); });
    $("#quit-btn").addEventListener("click", () => Game.quitToMenu());
    $("#play-again-btn").addEventListener("click", () => Game.startMatch(Game.difficulty));
    $("#main-menu-btn").addEventListener("click", () => Game.quitToMenu());

    window.addEventListener("keydown", (e) => {
      if (!$("#screen-game").classList.contains("active")) return;
      if (e.key === "r" || e.key === "R") Game.restartRound(true);
      else if (e.key === "Escape") Game.togglePause();
      else if (e.key === "m" || e.key === "M") $("#btn-mute").click();
    });

    this.tutSteps = [
      { n:1, title:"AIM", text:"Touch and hold your pen, then pull backward in the direction you want to shoot from." },
      { n:2, title:"POWER", text:"Pull farther back for more power. A short pull is a light tap, a long pull is a hard flick." },
      { n:3, title:"RELEASE", text:"Let go to fire. The pen only moves once you release — it stays put while you aim." },
    ];
    this.tutIndex = 0;
    $("#tut-next").addEventListener("click", () => {
      this.tutIndex++;
      if (this.tutIndex >= this.tutSteps.length){ this.finishTutorial(); return; }
      this.renderTutStep();
    });
    $("#tut-skip").addEventListener("click", () => this.finishTutorial());
  },

  nav(name){
    $$(".screen").forEach(s => s.classList.remove("active"));
    if (name === "play"){ $("#play-format-label").textContent = Save.data.matchFormat; }
    $("#screen-" + name).classList.add("active");
  },

  refreshCoins(){
    this.els.coinCounts.forEach(el => { if (el) el.textContent = Save.data.coins; });
  },

  refreshMatchScreen(){
    $$(".diff-btn[data-format]").forEach(b => b.classList.toggle("selected", b.dataset.format === Save.data.matchFormat));
  },

  buildPenGrid(){
    const grid = $("#pen-grid");
    grid.innerHTML = "";
    for (const pen of PENS){
      const unlocked = Save.data.unlockedPens.includes(pen.id);
      const selected = Save.data.selectedPen === pen.id;
      const card = document.createElement("div");
      card.className = "pen-card" + (selected?" selected":"") + (unlocked?"":" locked");
      const cv = document.createElement("canvas");
      cv.width = 160; cv.height = 60;
      card.appendChild(cv);
      const nameEl = document.createElement("div"); nameEl.className = "p-name"; nameEl.textContent = pen.name;
      const descEl = document.createElement("div"); descEl.className = "p-desc"; descEl.textContent = pen.desc;
      card.appendChild(nameEl); card.appendChild(descEl);
      if (!unlocked){
        const priceEl = document.createElement("div"); priceEl.className = "p-price"; priceEl.textContent = "🪙 " + pen.price;
        card.appendChild(priceEl);
      }
      grid.appendChild(card);
      this.drawPenThumb(cv, pen);
      card.addEventListener("click", () => {
        Audio.click();
        if (unlocked){
          Save.select("pen", pen.id);
          this.buildPenGrid();
        } else if (Save.data.coins >= pen.price){
          Save.addCoins(-pen.price);
          Save.unlock("pen", pen.id);
          Save.select("pen", pen.id);
          this.refreshCoins();
          this.buildPenGrid();
        }
      });
    }
  },

  drawPenThumb(cv, pen){
    const ctx = cv.getContext("2d");
    ctx.clearRect(0,0,cv.width,cv.height);
    // Pen at world-origin; we scale+offset via the Renderer instead of
    // baking pixel coordinates into the body, so this keeps fitting the
    // card regardless of how big PEN_LENGTH/PEN_WIDTH are in world units.
    const fake = new PenBody(pen, 0, 0, 0, "player");
    const fitScale = (cv.width*0.8) / fake.length;
    const savedRenderer = { scale: Renderer.scale, offX: Renderer.offX, offY: Renderer.offY, ctx: Renderer.ctx, dpr: Renderer.dpr };
    Renderer.scale = fitScale; Renderer.offX = cv.width/2; Renderer.offY = cv.height/2; Renderer.ctx = ctx; Renderer.dpr = 1;
    Renderer.drawPen(fake);
    Renderer.scale = savedRenderer.scale; Renderer.offX = savedRenderer.offX; Renderer.offY = savedRenderer.offY;
    Renderer.ctx = savedRenderer.ctx; Renderer.dpr = savedRenderer.dpr;
  },

  buildDeskGrid(){
    const grid = $("#desk-grid");
    grid.innerHTML = "";
    for (const desk of DESKS){
      const unlocked = Save.data.unlockedDesks.includes(desk.id);
      const selected = Save.data.selectedDesk === desk.id;
      const card = document.createElement("div");
      card.className = "pen-card" + (selected?" selected":"") + (unlocked?"":" locked");
      const swatch = document.createElement("div");
      swatch.style.cssText = `width:100%;height:44px;border-radius:8px;background:${desk.base};border:2px solid ${desk.edge};`;
      card.appendChild(swatch);
      const nameEl = document.createElement("div"); nameEl.className = "p-name"; nameEl.textContent = desk.name;
      card.appendChild(nameEl);
      if (!unlocked){
        const priceEl = document.createElement("div"); priceEl.className = "p-price"; priceEl.textContent = "🪙 " + desk.price;
        card.appendChild(priceEl);
      }
      grid.appendChild(card);
      card.addEventListener("click", () => {
        Audio.click();
        if (unlocked){
          Save.select("desk", desk.id);
          this.buildDeskGrid();
        } else if (Save.data.coins >= desk.price){
          Save.addCoins(-desk.price);
          Save.unlock("desk", desk.id);
          Save.select("desk", desk.id);
          this.refreshCoins();
          this.buildDeskGrid();
        }
      });
    }
  },

  renderTutStep(){
    const s = this.tutSteps[this.tutIndex];
    $("#tut-card .tut-step-num").textContent = s.n;
    $("#tut-card h3").textContent = s.title;
    $("#tut-card p").textContent = s.text;
    $("#tut-next").textContent = this.tutIndex === this.tutSteps.length-1 ? "PLAY" : "NEXT";
  },

  finishTutorial(){
    Save.data.tutorialSeen = true; Save.persist();
    Game.beginMatchRound(true);
  },
};

/* ===================== GAME STATE MACHINE ===================== */
const Game = {
  difficulty: "medium",
  desk: DESKS[1],
  turn: "player",
  state: "menu", // aiming | simulating | resolve | paused | roundend | matchend
  playerScore: 0, aiScore: 0,
  matchTarget: 2,
  round: { number: 1, shotsTaken: 0, starter: "player" },
  particles: [],
  shake: 0,
  aim: { active:false, originX:0, originY:0, dirX:0, dirY:-1, power:0 },
  input: { dragging:false, mode:null, pointerId:null, anchorX:0, anchorY:0 },
  lastShooter: null,

  init(){
    Save.load();
    Renderer.init($("#game-canvas"));
    UI.init();
    this.wireInput();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  },

  startMatch(difficulty){
    this.difficulty = difficulty;
    this.desk = DESKS.find(d => d.id === Save.data.selectedDesk) || DESKS[1];
    this.matchTarget = Save.data.matchFormat === "5" ? 3 : 2;
    this.playerScore = 0; this.aiScore = 0;
    this.round = { number: 1, shotsTaken: 0, starter: "player" };
    $("#overlay-match").classList.add("hidden");
    $("#overlay-round").classList.add("hidden");
    const penStats = PENS.find(p => p.id === Save.data.selectedPen) || PENS[0];
    this.penStats = penStats;
    this.playerPen = new PenBody(penStats, (BASELINE_MIN_X+BASELINE_MAX_X)/2, PLAYER_BASE_Y, -Math.PI/2, "player");
    this.aiPen = new PenBody(penStats, (BASELINE_MIN_X+BASELINE_MAX_X)/2, AI_BASE_Y, Math.PI/2, "ai");
    UI.nav("game");
    if (!Save.data.tutorialSeen){
      UI.tutIndex = 0; UI.renderTutStep();
      UI.nav("tutorial");
      return;
    }
    this.beginMatchRound(true);
  },

  beginMatchRound(fresh){
    if (fresh){
      UI.nav("game");
      $("#screen-game").classList.add("active");
    }
    this.placePensForRound();
    this.round.shotsTaken = 0;
    this.turn = this.round.starter;
    this.updateScoreUI();
    if (this.turn === "player"){
      this.enterPlayerAim();
    } else {
      this.setState("ai_thinking"); // frozen — nothing moves until the AI actually shoots
      this.scheduleAiTurn(500);
    }
    this.banner(this.round.starter === "player" ? "YOUR BREAK" : "AI BREAKS");
  },

  // The one and only place player-turn velocity gets reset. Called every
  // time the player's turn begins — start of round, after AI's shot settles,
  // after a resolved first-shot break, etc. Guarantees the player pen can
  // never carry velocity/spin into a turn it didn't earn with its own flick.
  enterPlayerAim(){
    this.playerPen.vx = 0; this.playerPen.vy = 0; this.playerPen.angVel = 0;
    this.cancelActiveDrag();
    this.setState("aiming");
  },

  cancelActiveDrag(){
    this.input.dragging = false;
    this.input.mode = null;
    this.input.pointerId = null;
    this.aim.active = false;
    const meter = $("#power-meter-wrap");
    if (meter) meter.classList.remove("show");
  },

  placePensForRound(){
    const midX = (BASELINE_MIN_X+BASELINE_MAX_X)/2;
    const jitter = () => (Math.random()-0.5) * 60;
    const angleJitter = () => (Math.random()-0.5) * 0.18;
    this.playerPen.reset(clamp(midX+jitter(), BASELINE_MIN_X, BASELINE_MAX_X), PLAYER_BASE_Y, -Math.PI/2 + angleJitter());
    this.aiPen.reset(clamp(midX+jitter(), BASELINE_MIN_X, BASELINE_MAX_X), AI_BASE_Y, Math.PI/2 + angleJitter());
    this.particles = []; this.shake = 0;
  },

  restartRound(sameStarter){
    $("#overlay-round").classList.add("hidden");
    if (!sameStarter) this.round.starter = this.round.starter === "player" ? "ai" : "player";
    this.beginMatchRound(true);
  },

  setState(s){ this.state = s; },

  updateScoreUI(){
    $("#player-score").textContent = this.playerScore;
    $("#ai-score").textContent = this.aiScore;
    $("#round-label").textContent = "ROUND " + this.round.number;
    $("#turn-label").textContent = this.turn === "player" ? "YOUR TURN" : "AI TURN";
  },

  banner(text){
    const el = $("#banner");
    $("#banner-text").textContent = text;
    el.classList.add("show");
    clearTimeout(this._bannerT);
    this._bannerT = setTimeout(() => el.classList.remove("show"), 1400);
  },

  togglePause(){
    if (this.state === "paused"){
      this.state = this._prevState || "aiming";
      $("#overlay-pause").classList.add("hidden");
      // If we paused mid-way through the AI's "thinking" delay, that timer
      // was cancelled below — without this the AI's turn would be lost
      // forever and the game would sit frozen after resuming.
      if (this._aiTurnOwed) this.scheduleAiTurn(400);
    } else if (this.state !== "menu" && $("#screen-game").classList.contains("active")){
      this._prevState = this.state;
      this.state = "paused";
      $("#overlay-pause").classList.remove("hidden");
      // Freeze completely: drop any mid-drag aim (the physical touch/mouse
      // button can't reliably be "resumed" across a pause) and hold the AI's
      // pending shot rather than let it fire while paused.
      this.cancelActiveDrag();
      if (this._aiTimer){ clearTimeout(this._aiTimer); this._aiTimer = null; }
    }
  },

  // Pause-safe replacement for a raw setTimeout(aiTurn, delay): if the game
  // gets paused before this fires, togglePause() cancels the timer but
  // remembers the AI still owes a turn, and reschedules it on resume.
  scheduleAiTurn(delay){
    this._aiTurnOwed = true;
    if (this._aiTimer) clearTimeout(this._aiTimer);
    this._aiTimer = setTimeout(() => {
      this._aiTimer = null;
      this._aiTurnOwed = false;
      if (this.state === "paused") return; // shouldn't happen (cancelled above) — safety net only
      this.aiTurn();
    }, delay);
  },

  quitToMenu(){
    $("#overlay-pause").classList.add("hidden");
    $("#overlay-match").classList.add("hidden");
    $("#overlay-round").classList.add("hidden");
    // Drop any timer/aim state from the round in progress so nothing from
    // this game bleeds into the next one that gets started from the menu.
    if (this._aiTimer){ clearTimeout(this._aiTimer); this._aiTimer = null; }
    this._aiTurnOwed = false;
    this.cancelActiveDrag();
    this.state = "menu";
    UI.nav("menu");
    UI.refreshCoins();
  },

  aiTurn(){
    if (this.state === "paused") return;
    const shot = AI.planShot(this.aiPen, this.playerPen, this.difficulty);
    this.aiPen.shoot(shot.dirX, shot.dirY, shot.power);
    Audio.launch(shot.power);
    this.lastShooter = "ai";
    this.round.shotsTaken++;
    this.setState("simulating"); // physics only ever runs from here on
  },

  allSettled(){
    const check = p => {
      if (p.state === "out") return p.outT >= OUT_ANIM_TIME;
      if (p.state === "hanging") return false;
      return p.speed < STOP_EPS && Math.abs(p.angVel) < ANG_EPS;
    };
    return check(this.playerPen) && check(this.aiPen);
  },

  resolveTurn(){
    const outPlayer = this.playerPen.state === "out";
    const outAI = this.aiPen.state === "out";

    if (Save.data.firstShotRule && this.round.shotsTaken === 1 && (outPlayer || outAI)){
      if (outPlayer) this.playerPen.reset((BASELINE_MIN_X+BASELINE_MAX_X)/2 + (Math.random()-0.5)*50, PLAYER_BASE_Y, -Math.PI/2);
      if (outAI) this.aiPen.reset((BASELINE_MIN_X+BASELINE_MAX_X)/2 + (Math.random()-0.5)*50, AI_BASE_Y, Math.PI/2);
      this.banner("BREAK SHOT — NO KO ON THE OPENER");
      this.switchTurn();
      return;
    }

    if (outPlayer && outAI){
      this.banner("DOUBLE KO — REPLAY THE ROUND");
      setTimeout(() => this.beginMatchRound(true), 900);
      this.setState("roundend");
      return;
    }
    if (outAI){ this.roundWon("player"); return; }
    if (outPlayer){ this.roundWon("ai"); return; }
    this.switchTurn();
  },

  switchTurn(){
    this.turn = this.turn === "player" ? "ai" : "player";
    this.updateScoreUI();
    if (this.turn === "ai"){
      this.setState("ai_thinking"); // frozen — nothing moves until aiTurn() actually shoots
      this.scheduleAiTurn(550);
    } else {
      this.enterPlayerAim(); // hard-resets player velocity/angVel — never inherits anything from the turn that just ended
    }
  },

  roundWon(winner){
    if (winner === "player"){ this.playerScore++; Audio.victory(); }
    else { this.aiScore++; Audio.defeat(); }
    this.updateScoreUI();
    this.setState("roundend");

    const matchOver = this.playerScore >= this.matchTarget || this.aiScore >= this.matchTarget;
    $("#round-result-text").textContent = winner === "player" ? "ROUND WON!" : "ROUND LOST";
    $("#round-score-text").textContent = `${this.playerScore} — ${this.aiScore}`;
    $("#overlay-round").classList.remove("hidden");

    setTimeout(() => {
      $("#overlay-round").classList.add("hidden");
      if (matchOver){
        this.finishMatch(this.playerScore > this.aiScore ? "player" : "ai");
      } else {
        this.round.number++;
        this.round.starter = this.round.starter === "player" ? "ai" : "player";
        this.beginMatchRound(true);
      }
    }, 1200);
  },

  finishMatch(winner){
    this.setState("matchend");
    const coins = winner === "player" ? 60 : 15;
    Save.addCoins(coins);
    UI.refreshCoins();
    $("#match-result-text").textContent = winner === "player" ? "YOU WIN!" : "AI WINS!";
    $("#match-coins-text").textContent = `+${coins} coins`;
    $("#overlay-match").classList.remove("hidden");
    if (winner === "player") Audio.victory(); else Audio.defeat();
  },

  onCollision(a, b, impulse){
    Audio.collide(impulse);
    this.shake = Math.min(10, this.shake + impulse/220);
    this.spawnParticles((a.x+b.x)/2, (a.y+b.y)/2, Math.min(10, 3 + impulse/150), "#8a5a34");
  },
  onWallHit(p, speed){ Audio.wallHit(speed); },
  onOut(p){ Audio.wallHit(500); this.spawnParticles(p.x, p.y, 6, "#c8433a"); },
  onFallOff(p){ Audio.fallOff(); this.shake = Math.min(10, this.shake+6); this.spawnParticles(p.x, p.y, 10, "#5c3a21"); },

  spawnParticles(x, y, n, color){
    for (let i=0;i<n;i++){
      const ang = Math.random()*Math.PI*2, spd = 40+Math.random()*90;
      this.particles.push({ x, y, vx:Math.cos(ang)*spd, vy:Math.sin(ang)*spd, r:1.5+Math.random()*2, life:0.35+Math.random()*0.2, maxLife:0.5, color });
    }
  },

  updateParticles(dt){
    for (const p of this.particles){ p.x += p.vx*dt; p.y += p.vy*dt; p.vx*=0.92; p.vy*=0.92; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt*24);
  },

  accumulator: 0, lastTime: 0,
  loop(ts){
    if (!this.lastTime) this.lastTime = ts;
    let frameDt = (ts - this.lastTime) / 1000;
    this.lastTime = ts;
    if (frameDt > 0.25) frameDt = 0.25;

    // Cheap every-frame re-measure. Only mutates the canvas when the
    // measured box actually changed size (e.g. just became visible, or the
    // window/orientation changed) — never mutates canvas.width/height on a
    // frame where nothing changed.
    Renderer.checkResize(false);

    if (this.state !== "paused" && this.state !== "menu"){
      this.accumulator += frameDt;
      while (this.accumulator >= FIXED_DT){
        // CRITICAL: physics only ever integrates during an actual shot.
        // "aiming" and "ai_thinking" are frozen states — no velocity
        // integration, no friction, no wall checks, no pen-vs-pen collision
        // resolution — so nothing (not even sub-threshold residual velocity
        // or resting-contact positional correction) can nudge a pen while
        // it isn't actually mid-flight.
        if (this.state === "simulating"){
          Physics.step([this.playerPen, this.aiPen], FIXED_DT, this);
          this.validatePens();
        }
        this.updateParticles(FIXED_DT);
        this.accumulator -= FIXED_DT;
      }
      if (this.state === "simulating" && this.allSettled()){
        this.resolveTurn();
      }
    }

    if ($("#screen-game").classList.contains("active") && this.playerPen && Renderer.scale > 0){
      Renderer.render(this);
      if (DEBUG) Renderer.drawDebug(this);
    }
    requestAnimationFrame(this.loop);
  },

  // Safety net: a pen should never carry NaN/Infinity into rendering. If it
  // ever does (divide-by-zero edge case, runaway impulse, etc.) snap it back
  // to a safe on-board spot instead of corrupting the frame.
  validatePens(){
    const fix = (p, x, y, angle) => {
      const bad = !Number.isFinite(p.x) || !Number.isFinite(p.y) ||
                  !Number.isFinite(p.vx) || !Number.isFinite(p.vy) ||
                  !Number.isFinite(p.angle) || !Number.isFinite(p.angVel);
      if (bad){
        console.warn("PEN FIGHT: invalid pen state detected, resetting pen.", p.side);
        p.reset(x, y, angle);
      }
      // guard against runaway velocity from a degenerate collision
      const MAX_SPEED = SHOT_SPEED * 3;
      const sp = Math.hypot(p.vx, p.vy);
      if (sp > MAX_SPEED){ const k = MAX_SPEED/sp; p.vx *= k; p.vy *= k; }
      if (Math.abs(p.angVel) > 40) p.angVel = Math.sign(p.angVel) * 40;
    };
    fix(this.playerPen, (BASELINE_MIN_X+BASELINE_MAX_X)/2, PLAYER_BASE_Y, -Math.PI/2);
    fix(this.aiPen, (BASELINE_MIN_X+BASELINE_MAX_X)/2, AI_BASE_Y, Math.PI/2);
  },

  wireInput(){
    const canvas = $("#game-canvas");

    const toWorld = (clientX, clientY) => {
      const rect = canvas.getBoundingClientRect();
      const sx = clientX - rect.left, sy = clientY - rect.top;
      return [(sx - Renderer.offX) / Renderer.scale, (sy - Renderer.offY) / Renderer.scale];
    };

    canvas.addEventListener("pointerdown", (e) => {
      if (this.state !== "aiming" || this.turn !== "player") return;
      const [wx, wy] = toWorld(e.clientX, e.clientY);
      const dx0 = wx - this.playerPen.x, dy0 = wy - this.playerPen.y;
      if (Math.hypot(dx0, dy0) > this.playerPen.length*1.1) return; // must grab near own pen (generous hit area)
      canvas.setPointerCapture(e.pointerId);
      this.input.dragging = true;
      this.input.pointerId = e.pointerId;
      // Pure flick control: no positioning phase at all. The pen is fixed
      // the instant it's touched — this press can only ever aim and shoot.
      this.input.mode = "aim";
      this.input.anchorX = this.playerPen.x;
      this.input.anchorY = this.playerPen.y;
      this.aim.active = true;
      this.aim.power = 0;
      this.aim.dirX = 0; this.aim.dirY = -1;
      Audio.ensure();
    });

    canvas.addEventListener("pointermove", (e) => {
      if (this.state === "paused") return; // defense-in-depth — togglePause() already cancels the drag outright
      if (!this.input.dragging || e.pointerId !== this.input.pointerId) return;
      const [wx, wy] = toWorld(e.clientX, e.clientY);

      // The pen NEVER moves during this — only aim angle and power change,
      // both derived from the fixed anchor set on pointerdown.
      let pdx = wx - this.input.anchorX, pdy = wy - this.input.anchorY;
      let plen = Math.hypot(pdx,pdy);
      if (plen > MAX_DRAG){ pdx *= MAX_DRAG/plen; pdy *= MAX_DRAG/plen; plen = MAX_DRAG; }
      const power = plen / MAX_DRAG;
      const dirX = -pdx/(plen||1), dirY = -pdy/(plen||1); // shoot opposite the pull, any direction
      this.aim.originX = this.playerPen.x; this.aim.originY = this.playerPen.y;
      this.aim.dirX = dirX; this.aim.dirY = dirY; this.aim.power = power;
      this.playerPen.angle = Math.atan2(dirY, dirX);
      $("#power-meter-wrap").classList.add("show");
      $("#power-meter-fill").style.width = (power*100).toFixed(0) + "%";
    });

    const endDrag = (e) => {
      if (this.state === "paused") return; // defense-in-depth — see above
      if (!this.input.dragging || (e.pointerId !== undefined && e.pointerId !== this.input.pointerId)) return;
      this.input.dragging = false;
      $("#power-meter-wrap").classList.remove("show");
      // Minimum pull distance: power is proportional to pull distance, so
      // requiring a minimum power is exactly requiring a minimum pull — a
      // tiny/accidental touch cancels instead of firing a weak shot.
      if (this.input.mode === "aim" && this.state === "aiming" && this.aim.power >= MIN_SHOOT_POWER){
        this.playerPen.shoot(this.aim.dirX, this.aim.dirY, this.aim.power);
        Audio.launch(this.aim.power);
        this.lastShooter = "player";
        this.round.shotsTaken++;
        this.setState("simulating");
      }
      // No stale input: fully clear aiming/pointer state either way, so a
      // leftover pointer id or aim vector can never bleed into the next turn.
      this.aim.active = false;
      this.input.mode = null;
      this.input.pointerId = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("lostpointercapture", endDrag);

    canvas.addEventListener("touchstart", e=>e.preventDefault(), {passive:false});
    canvas.addEventListener("touchmove", e=>e.preventDefault(), {passive:false});
  },
};

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

/* ===================== BOOT ===================== */
window.addEventListener("DOMContentLoaded", () => Game.init());

})();
