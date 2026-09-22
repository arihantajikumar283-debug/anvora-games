/* ============================================================
   VOIDRIFT - ui.js
   Handles all DOM/UI: menus, HUD updates, mobile touch controls
   (Free-Fire style joystick + drag-look + buttons), minimap
   drawing, toasts, and orientation lock detection.
   ============================================================ */

const UI = {
  game: null,
  els: {},

  init(game){
    this.game = game;
    const ids = [
      'loading-screen','loading-bar-fill','loading-text',
      'main-menu','settings-menu','achievements-menu','pause-menu',
      'gameover-screen','levelcomplete-screen','hud','mobile-controls',
      'orientation-overlay','tap-to-start',
      'btn-start','btn-continue','btn-settings','btn-achievements',
      'btn-settings-back','btn-achievements-back',
      'btn-resume','btn-pause-settings','btn-quit',
      'btn-respawn','btn-gameover-menu','btn-next-level','btn-complete-menu',
      'sens-slider','music-slider','sfx-slider','quality-select','invert-checkbox',
      'difficulty-select',
      'health-fill','armor-fill','health-val','armor-val',
      'weapon-icon','weapon-name','ammo-mag','ammo-reserve',
      'score-val','fps-counter','difficulty-label','minimap','objective-text',
      'toast-container','hitmarker','vignette-damage','vignette-lowhealth',
      'joystick-zone','joystick-base','joystick-knob','look-zone',
      'btn-fire','btn-aim','btn-jump','btn-reload','btn-sprint',
      'achievements-list','gameover-score','complete-score'
    ];
    ids.forEach(id => this.els[id] = document.getElementById(id));

    this._bindMenuEvents();
    this._bindSettingsEvents();
    this.checkOrientation();
    window.addEventListener('resize', ()=>this.checkOrientation());
    window.addEventListener('orientationchange', ()=>this.checkOrientation());
  },

  setLoadingProgress(pct, text){
    this.els['loading-bar-fill'].style.width = pct + '%';
    if(text) this.els['loading-text'].textContent = text;
  },

  showScreen(name){
    ['loading-screen','main-menu','settings-menu','achievements-menu','pause-menu','gameover-screen','levelcomplete-screen']
      .forEach(s => this.els[s].classList.add('hidden'));
    if(name) this.els[name].classList.remove('hidden');
  },

  showHUDAndMobile(){
    this.els['hud'].classList.remove('hidden');
    if(this.game.isMobile) this.els['mobile-controls'].classList.remove('hidden');
  },

  hideHUDAndMobile(){
    this.els['hud'].classList.add('hidden');
    this.els['mobile-controls'].classList.add('hidden');
  },

  _bindMenuEvents(){
    const g = this.game;
    this.els['btn-start'].onclick = ()=> g.startNewGame();
    this.els['btn-continue'].onclick = ()=> g.continueGame();
    this._settingsReturn = 'main-menu';
    this.els['btn-settings'].onclick = ()=> { this._settingsReturn = 'main-menu'; this.showScreen('settings-menu'); };
    this.els['btn-achievements'].onclick = ()=> { this.renderAchievements(); this.showScreen('achievements-menu'); };
    this.els['btn-settings-back'].onclick = ()=> {
      if(this._settingsReturn === 'pause-menu'){ this.showScreen('pause-menu'); }
      else { this.showScreen('main-menu'); }
    };
    this.els['btn-achievements-back'].onclick = ()=> this.showScreen('main-menu');

    this.els['btn-resume'].onclick = ()=> g.resumeGame();
    this.els['btn-pause-settings'].onclick = ()=> { this._settingsReturn = 'pause-menu'; this.showScreen('settings-menu'); };
    this.els['btn-quit'].onclick = ()=> g.quitToMenu();

    this.els['btn-respawn'].onclick = ()=> g.respawnAtCheckpoint();
    this.els['btn-gameover-menu'].onclick = ()=> g.quitToMenu();
    this.els['btn-next-level'].onclick = ()=> g.nextLevel();
    this.els['btn-complete-menu'].onclick = ()=> g.quitToMenu();
  },

  _bindSettingsEvents(){
    const g = this.game;
    this.els['sens-slider'].oninput = e => { g.player.sensitivity = e.target.value * 0.00028; };
    this.els['music-slider'].oninput = e => AudioManager.setMusicVolume(e.target.value/100);
    this.els['sfx-slider'].oninput = e => AudioManager.setSfxVolume(e.target.value/100);
    this.els['invert-checkbox'].onchange = e => { g.player.invertY = e.target.checked; };
    this.els['quality-select'].onchange = e => g.setGraphicsQuality(e.target.value);
  },

  /* ---------------- Mobile Controls ---------------- */
  setupMobileControls(){
    const input = { joyX:0, joyY:0, fire:false, aim:false, jump:false, sprint:false };
    this._mobileInput = input;
    const g = this.game;

    // Joystick
    const zone = this.els['joystick-zone'];
    const base = this.els['joystick-base'];
    const knob = this.els['joystick-knob'];
    let joyTouchId = null, baseRect = null, baseCenter = {x:0,y:0};

    const startJoy = (id, x, y) => {
      joyTouchId = id;
      baseRect = base.getBoundingClientRect();
      baseCenter = { x: baseRect.left + baseRect.width/2, y: baseRect.top + baseRect.height/2 };
    };
    const moveJoy = (x, y) => {
      let dx = x - baseCenter.x, dy = y - baseCenter.y;
      const max = 45;
      const dist = Math.min(Math.hypot(dx,dy), max);
      const angle = Math.atan2(dy,dx);
      const kx = Math.cos(angle)*dist, ky = Math.sin(angle)*dist;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      input.joyX = kx/max;
      input.joyY = ky/max;
    };
    const endJoy = () => {
      joyTouchId = null;
      knob.style.transform = 'translate(0px,0px)';
      input.joyX = 0; input.joyY = 0;
    };

    zone.addEventListener('touchstart', e=>{
      e.preventDefault();
      const t = e.changedTouches[0];
      startJoy(t.identifier, t.clientX, t.clientY);
      moveJoy(t.clientX, t.clientY);
    }, {passive:false});
    zone.addEventListener('touchmove', e=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        if(t.identifier === joyTouchId) moveJoy(t.clientX, t.clientY);
      }
    }, {passive:false});
    zone.addEventListener('touchend', e=>{
      for(const t of e.changedTouches) if(t.identifier === joyTouchId) endJoy();
    });
    zone.addEventListener('touchcancel', endJoy);

    // Look zone (drag anywhere on right side to rotate camera)
    const lookZone = this.els['look-zone'];
    let lookTouchId = null, lastX=0, lastY=0;
    lookZone.addEventListener('touchstart', e=>{
      for(const t of e.changedTouches){
        // ignore touches that started over buttons
        if(lookTouchId === null){
          lookTouchId = t.identifier;
          lastX = t.clientX; lastY = t.clientY;
        }
      }
    }, {passive:false});
    lookZone.addEventListener('touchmove', e=>{
      e.preventDefault();
      for(const t of e.changedTouches){
        if(t.identifier === lookTouchId){
          const dx = t.clientX - lastX, dy = t.clientY - lastY;
          lastX = t.clientX; lastY = t.clientY;
          if(g.player) g.player.applyTouchLook(dx, dy);
        }
      }
    }, {passive:false});
    lookZone.addEventListener('touchend', e=>{
      for(const t of e.changedTouches) if(t.identifier === lookTouchId) lookTouchId = null;
    });

    // Buttons
    const bind = (el, onDown, onUp) => {
      el.addEventListener('touchstart', e=>{ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
      el.addEventListener('touchend', e=>{ e.preventDefault(); e.stopPropagation(); if(onUp) onUp(); }, {passive:false});
    };
    bind(this.els['btn-fire'], ()=> input.fire = true, ()=> input.fire = false);
    bind(this.els['btn-aim'], ()=> input.aim = true, ()=> input.aim = false);
    bind(this.els['btn-jump'], ()=> input.jump = true, ()=> input.jump = false);
    bind(this.els['btn-sprint'], ()=> input.sprint = true, ()=> input.sprint = false);
    bind(this.els['btn-reload'], ()=> g.weapons && g.weapons.reload());

    document.querySelectorAll('.wswitch-btn').forEach(btn=>{
      btn.addEventListener('touchstart', e=>{
        e.preventDefault(); e.stopPropagation();
        g.weapons && g.weapons.switchWeapon(btn.dataset.weapon);
      }, {passive:false});
    });

    return input;
  },

  getMobileInput(){ return this._mobileInput; },

  /* ---------------- HUD ---------------- */
  updateHUD(player, weapons){
    const hp = Math.max(0, player.health);
    const ap = Math.max(0, player.armor);
    this.els['health-fill'].style.width = hp + '%';
    this.els['armor-fill'].style.width = ap + '%';
    this.els['health-val'].textContent = Math.round(hp);
    this.els['armor-val'].textContent = Math.round(ap);

    const def = weapons.def;
    const ammo = weapons.ammo[weapons.current];
    this.els['weapon-icon'].textContent = def.icon;
    this.els['weapon-name'].textContent = weapons.reloading ? 'RELOADING...' : def.name;
    this.els['ammo-mag'].textContent = ammo.mag;
    this.els['ammo-reserve'].textContent = ammo.reserve;

    this.els['score-val'].textContent = player.score;

    if(hp <= 25) this.els['vignette-lowhealth'].style.opacity = '1';
    else this.els['vignette-lowhealth'].style.opacity = '0';
  },

  updateFPS(fps){
    this.els['fps-counter'].textContent = Math.round(fps) + ' FPS';
  },

  setLevelCompleteTitle(text){
    const el = document.querySelector('#levelcomplete-screen .complete-title');
    if(el) el.textContent = text;
  },

  setObjective(text){ this.els['objective-text'].textContent = 'OBJECTIVE: ' + text; },
  setDifficultyLabel(diff){ this.els['difficulty-label'].textContent = diff.toUpperCase(); },

  flashDamage(){
    const el = this.els['vignette-damage'];
    el.style.opacity = '1';
    clearTimeout(this._dmgTimeout);
    this._dmgTimeout = setTimeout(()=> el.style.opacity = '0', 260);
  },

  showHitMarker(){
    const el = this.els['hitmarker'];
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  },

  showToast(msg){
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    this.els['toast-container'].appendChild(t);
    setTimeout(()=> t.remove(), 3200);
  },

  /* ---------------- Minimap ---------------- */
  drawMinimap(player, enemies, level){
    const canvas = this.els['minimap'];
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    ctx.save();
    ctx.translate(w/2, h/2);
    ctx.rotate(-player.yaw);

    const scale = 4;
    ctx.strokeStyle = 'rgba(33,230,255,0.5)';
    ctx.lineWidth = 1.5;
    if(level && level.walls){
      level.walls.forEach(wall=>{
        const x = (wall.x - player.position.x) * scale;
        const z = (wall.z - player.position.z) * scale;
        ctx.strokeRect(x - wall.w*scale/2, z - wall.d*scale/2, wall.w*scale, wall.d*scale);
      });
    }

    enemies.forEach(e=>{
      if(!e.alive) return;
      const x = (e.position.x - player.position.x) * scale;
      const z = (e.position.z - player.position.z) * scale;
      if(Math.hypot(x,z) > w/2) return;
      ctx.fillStyle = '#ff3344';
      ctx.beginPath(); ctx.arc(x, z, 3, 0, Math.PI*2); ctx.fill();
    });

    ctx.restore();
    // player arrow (fixed, pointing up)
    ctx.fillStyle = '#21e6ff';
    ctx.beginPath();
    ctx.moveTo(w/2, h/2-6); ctx.lineTo(w/2-5, h/2+6); ctx.lineTo(w/2+5, h/2+6);
    ctx.closePath(); ctx.fill();
  },

  /* ---------------- Achievements ---------------- */
  renderAchievements(){
    const list = this.els['achievements-list'];
    list.innerHTML = '';
    const unlocked = JSON.parse(localStorage.getItem('voidrift_achievements') || '{}');
    ACHIEVEMENTS.forEach(a=>{
      const div = document.createElement('div');
      const got = !!unlocked[a.id];
      div.className = 'achievement-item' + (got ? '' : ' locked');
      div.innerHTML = `<strong>${a.name}</strong><br><span>${got ? a.desc : '???'}</span>`;
      list.appendChild(div);
    });
  },

  /* ---------------- Orientation ---------------- */
  checkOrientation(){
    const g = this.game;
    if(!g || !g.isMobile){ this.els['orientation-overlay'].classList.add('hidden'); return; }
    const portrait = window.innerHeight > window.innerWidth;
    if(portrait && g.state === 'playing'){
      this.els['orientation-overlay'].classList.remove('hidden');
    } else {
      this.els['orientation-overlay'].classList.add('hidden');
    }
  }
};

const ACHIEVEMENTS = [
  { id:'first_blood', name:'FIRST BLOOD', desc:'Kill your first enemy.' },
  { id:'survivor', name:'SURVIVOR', desc:'Reach 5 minutes survival time in one run.' },
  { id:'arsenal', name:'ARSENAL', desc:'Fire all four weapon types.' },
  { id:'demolitionist', name:'DEMOLITIONIST', desc:'Destroy an explosive barrel near enemies.' },
  { id:'descend', name:'DESCENT', desc:'Reach the elevator and descend a level.' },
  { id:'king_slayer', name:'KING SLAYER', desc:'Defeat the Hollow King.' },
];

function unlockAchievement(id){
  const unlocked = JSON.parse(localStorage.getItem('voidrift_achievements') || '{}');
  if(unlocked[id]) return;
  unlocked[id] = true;
  localStorage.setItem('voidrift_achievements', JSON.stringify(unlocked));
  const a = ACHIEVEMENTS.find(x=>x.id===id);
  if(a) UI.showToast('ACHIEVEMENT UNLOCKED: ' + a.name);
}
