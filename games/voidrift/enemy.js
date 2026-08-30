/* ============================================================
   VOIDRIFT - enemy.js
   Enemy types (Ancient Temple Guardian, Temple Drone, Elite) with a
   simple finite-state-machine AI: idle/patrol -> detect -> chase/attack
   -> die. Kept intentionally simple for performance - no pathfinding
   graph, just direct-line steering.
   ============================================================ */

const ENEMY_TYPES = {
  guardian: {
    label: 'TEMPLE SWORD GUARD', health: 60, speed: 3.4, damage: 14, fireRate: 750,
    detectRange: 16, attackRange: 2.5, color: 0x8a6a3a, scale: 1.0,
    xp: 60, flies:false
  },
  spearguard: {
    label: 'SPEAR GUARD', health: 55, speed: 2.6, damage: 10, fireRate: 900,
    detectRange: 17, attackRange: 5.5, color: 0x6a7a5a, scale: 1.02,
    xp: 70, flies:false
  },
  archer: {
    label: 'TEMPLE ARCHER', health: 40, speed: 2.0, damage: 8, fireRate: 1100,
    detectRange: 20, attackRange: 14, color: 0x5a4a7a, scale: 0.95,
    xp: 75, flies:false, usesCover:true
  },
  drone: {
    label: 'TEMPLE DRONE', health: 35, speed: 4.2, damage: 7, fireRate: 700,
    detectRange: 18, attackRange: 12, color: 0xd4af37, scale: 0.8,
    xp: 80, flies:true
  },
  elite: {
    // Scale kept modest (was 3.2 on the old boss, tall enough to poke
    // through the room's 4.3-unit ceiling) - this now fits comfortably
    // under the roof of the small enclosed shrine.
    label: 'TEMPLE OVERLORD', health: 260, speed: 2.1, damage: 20, fireRate: 850,
    detectRange: 20, attackRange: 9, color: 0x9922dd, scale: 1.6,
    xp: 400, flies:false, isBoss:true
  }
};

// Shared across every Enemy instance so line-of-sight checks don't
// allocate a new Raycaster/Vector3 every frame per enemy.
const _sharedLosRaycaster = new THREE.Raycaster();
const _sharedLosDir = new THREE.Vector3();
const _sharedLosOrigin = new THREE.Vector3();

class Enemy {
  constructor(type, position, scene){
    this.type = type;
    this.def = ENEMY_TYPES[type];
    this.scene = scene;
    this.health = this.def.health;
    this.maxHealth = this.def.health;
    this.alive = true;
    this.state = 'patrol';
    this.stateTimer = 0;
    this.lastAttack = 0;
    this.hoverPhase = Math.random()*Math.PI*2;
    this.coverTimer = 0;

    this.position = position.clone();
    this.homePosition = position.clone();
    this.patrolTarget = this._randomPatrolPoint();
    this.velocity = new THREE.Vector3();

    this._buildMesh();
  }

  _buildMesh(){
    const def = this.def;
    const s = def.scale;
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: def.color, roughness:0.45, metalness:0.55, emissive: def.color, emissiveIntensity:0.12 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22262e, roughness:0.5, metalness:0.65 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: def.color, emissiveIntensity:2.0 });
    const parts = [];

    if(def.flies){
      // TEMPLE DRONE - compact hovering orb with a glowing core and an
      // ornamental brass ring instead of a humanoid body.
      const ringMat = new THREE.MeshStandardMaterial({ color:0xd4af37, roughness:0.4, metalness:0.7, emissive:0xd4af37, emissiveIntensity:0.15 });
      const body = new THREE.Mesh(new THREE.SphereGeometry(0.34*s,10,8), mat);
      body.position.y = 1.5*s;
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.13*s,8,8), coreMat);
      core.position.y = 1.5*s;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.48*s,0.05*s,6,16), ringMat);
      ring.position.y = 1.5*s;
      ring.rotation.x = Math.PI/2;
      this.rotorRing = ring;
      const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.36*s,0.03*s,6,14), ringMat);
      ring2.position.y = 1.5*s;
      ring2.rotation.y = Math.PI/2;
      this.rotorRing2 = ring2;
      const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02*s,0.02*s,0.28*s,4), darkMat);
      antenna.position.y = 1.92*s;
      parts.push(body, core, ring, ring2, antenna);

      const finGeo = new THREE.BoxGeometry(0.52*s,0.04*s,0.16*s);
      const finMat = new THREE.MeshStandardMaterial({ color:0x88ffee, transparent:true, opacity:0.65, emissive:0x33ccaa, emissiveIntensity:0.6 });
      this.finL = new THREE.Mesh(finGeo, finMat); this.finL.position.set(0.42*s,1.5*s,0);
      this.finR = this.finL.clone(); this.finR.position.x = -0.42*s;
      parts.push(this.finL, this.finR);

      parts.forEach(p=>{ p.castShadow = false; g.add(p); });
      body.userData.enemyRef = this; body.userData.isHeadshot = true;
      this.hittableParts = [body];
    } else {
      // Humanoid robot base shared by guardian/elite - legs
      // ground it (the old design floated with no legs, a big part of
      // why it read as a "boxy blob"), a rounded head with a glowing
      // visor slit, and a glowing chest core.
      const legGeo = new THREE.CylinderGeometry(0.11*s,0.13*s,0.75*s,6);
      const legL = new THREE.Mesh(legGeo, darkMat); legL.position.set(0.16*s,0.38*s,0);
      const legR = legL.clone(); legR.position.x = -0.16*s;

      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28*s,0.36*s,0.85*s,8), mat);
      torso.position.y = 1.15*s;

      const core = new THREE.Mesh(new THREE.SphereGeometry(0.1*s,8,8), coreMat);
      core.position.set(0,1.2*s,0.28*s);
      this.core = core;

      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24*s,10,8), mat);
      head.position.y = 1.78*s;
      const visor = new THREE.Mesh(new THREE.BoxGeometry(0.32*s,0.07*s,0.06*s), coreMat);
      visor.position.set(0,1.8*s,0.2*s);

      const armGeo = new THREE.CylinderGeometry(0.08*s,0.09*s,0.6*s,6);
      this.armL = new THREE.Mesh(armGeo, darkMat); this.armL.position.set(0.42*s,1.15*s,0);
      this.armR = this.armL.clone(); this.armR.position.x = -0.42*s;

      const padGeo = new THREE.BoxGeometry(0.22*s,0.16*s,0.22*s);
      const padL = new THREE.Mesh(padGeo, darkMat); padL.position.set(0.42*s,1.5*s,0);
      const padR = padL.clone(); padR.position.x = -0.42*s;

      parts.push(legL, legR, torso, core, head, visor, this.armL, this.armR, padL, padR);

      // Type-specific silhouette details so each robot reads instantly
      if(this.type === 'guardian'){
        // Armored warrior: a bladed weapon arm plus a small round shield
        const bladeGeo = new THREE.ConeGeometry(0.06*s,0.4,4);
        const blade = new THREE.Mesh(bladeGeo, darkMat);
        blade.rotation.x = Math.PI/2;
        blade.position.set(-0.42*s,0.85*s,0.2*s);
        const shield = new THREE.Mesh(new THREE.CylinderGeometry(0.22*s,0.22*s,0.04*s,10), darkMat);
        shield.rotation.z = Math.PI/2;
        shield.position.set(0.44*s,1.05*s,0);
        parts.push(blade, shield);
      }
      if(this.type === 'spearguard'){
        // Long thin polearm held forward - reads very differently at a
        // glance from the sword guard's short blade.
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025*s,0.025*s,1.1*s,5), darkMat);
        shaft.rotation.x = Math.PI/2.1;
        shaft.position.set(-0.4*s,0.95*s,0.35*s);
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05*s,0.22*s,4), darkMat);
        tip.rotation.x = Math.PI/2.1;
        tip.position.set(-0.4*s,0.95*s,0.85*s);
        parts.push(shaft, tip);
      }
      if(this.type === 'archer'){
        // Curved bow silhouette (a thin partial torus) held out to the
        // side - clearly not a blade or a spear at a glance.
        const bow = new THREE.Mesh(new THREE.TorusGeometry(0.34*s,0.02*s,4,10,Math.PI*1.3), darkMat);
        bow.position.set(0.44*s,1.1*s,0.1*s);
        bow.rotation.y = Math.PI/2;
        const quiver = new THREE.Mesh(new THREE.CylinderGeometry(0.08*s,0.08*s,0.5*s,6), darkMat);
        quiver.position.set(-0.3*s,1.4*s,-0.2*s);
        quiver.rotation.z = 0.3;
        parts.push(bow, quiver);
      }
      if(this.type === 'elite'){
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06*s,0.06*s,0.55*s,6), darkMat);
        barrel.rotation.z = Math.PI/2;
        barrel.position.set(-0.44*s,1.0*s,0.35*s);
        padL.scale.set(1.5,1.5,1.5);
        padR.scale.set(1.5,1.5,1.5);
        const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.12*s,0.12*s,0.5*s,8), darkMat);
        cannon.rotation.x = Math.PI/2;
        cannon.position.set(0,0.95*s,0.5*s);
        const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16*s,0.3*s,6), coreMat);
        crown.position.y = 2.05*s;
        parts.push(barrel, cannon, crown);
      }

      parts.forEach(p=>{ p.castShadow = false; g.add(p); });
      torso.userData.enemyRef = this;
      head.userData.enemyRef = this;
      head.userData.isHeadshot = true;
      this.hittableParts = [torso, head];
    }

    this.mesh = g;
    this.mesh.position.copy(this.position);
    this.mesh.userData.enemyRef = this;
    this.scene.add(this.mesh);

    // health bar sprite (simple canvas-based)
    this._buildHealthBar();
  }

  _buildHealthBar(){
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 8;
    this._hbCanvas = canvas;
    this._hbCtx = canvas.getContext('2d');
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest:false });
    const spr = new THREE.Sprite(mat);
    spr.scale.set(1, 0.13, 1);
    spr.position.y = 1.9*this.def.scale;
    this.mesh.add(spr);
    this._hbSprite = spr;
    this._updateHealthBar();
  }

  _updateHealthBar(){
    const ctx = this._hbCtx;
    ctx.clearRect(0,0,64,8);
    ctx.fillStyle = '#220000'; ctx.fillRect(0,0,64,8);
    const pct = Math.max(0,this.health/this.maxHealth);
    ctx.fillStyle = pct > 0.5 ? '#ff3355' : '#ff8800';
    ctx.fillRect(1,1,62*pct,6);
    this._hbSprite.material.map.needsUpdate = true;
  }

  _randomPatrolPoint(){
    const r = 4 + Math.random()*4;
    const a = Math.random()*Math.PI*2;
    return new THREE.Vector3(this.homePosition.x + Math.cos(a)*r, this.homePosition.y, this.homePosition.z + Math.sin(a)*r);
  }

  takeDamage(amount, game){
    if(!this.alive) return;
    this.health -= amount;
    this._updateHealthBar();
    if(typeof AudioManager !== 'undefined') AudioManager.playHit();
    this.state = 'chase';
    if(this.health <= 0){
      this.die(game);
    }
  }

  die(game){
    this.alive = false;
    this.state = 'dead';
    if(typeof AudioManager !== 'undefined') AudioManager.playExplosion();
    if(game){
      game.player.score += this.def.xp;
      game.onEnemyKilled(this);
    }
    // simple death animation: sink and fade
    this._deathTimer = 1.2;
  }

  distanceToPlayer(player){
    return this.position.distanceTo(player.position);
  }

  hasLineOfSight(player, level){
    // Basic raycast against level static colliders only - reuses shared
    // scratch objects so this doesn't allocate every call.
    _sharedLosDir.subVectors(player.position, this.position);
    const dist = _sharedLosDir.length();
    _sharedLosDir.normalize();
    _sharedLosOrigin.copy(this.position).y += 1;
    _sharedLosRaycaster.set(_sharedLosOrigin, _sharedLosDir);
    _sharedLosRaycaster.far = dist;
    const hits = _sharedLosRaycaster.intersectObjects(level.staticColliders, true);
    return hits.length === 0;
  }

  // The raycast above is the single most expensive thing an enemy does
  // per frame. It only needs to be fresh a handful of times per second,
  // not all 60 - so we cache the result and re-check on a short timer
  // (staggered per-enemy so they don't all raycast on the same frame).
  _updateLOSCache(dt, player, level){
    if(this._losTimer === undefined) this._losTimer = Math.random()*0.15;
    this._losTimer -= dt;
    if(this._losTimer <= 0){
      this._losTimer = 0.15;
      this._losCached = this.hasLineOfSight(player, level);
    }
    return this._losCached;
  }

  update(dt, player, level, game){
    if(!this.alive){
      if(this._deathTimer !== undefined){
        this._deathTimer -= dt;
        this.mesh.position.y -= dt*0.4;
        this.mesh.rotation.z += dt*1.5;
        this.mesh.scale.multiplyScalar(1 - dt*0.6);
        if(this._deathTimer <= 0){
          this.scene.remove(this.mesh);
          this._removed = true;
        }
      }
      return;
    }

    const def = this.def;
    const detectMult = this.detectMult || 1;
    const effectiveDetectRange = def.detectRange * detectMult;
    const distToPlayer = this.distanceToPlayer(player);
    const canSee = distToPlayer < effectiveDetectRange*1.4 && this._updateLOSCache(dt, player, level);

    // ---- STATE TRANSITIONS ----
    if(this.state === 'patrol' || this.state === 'search'){
      if(canSee && distToPlayer < effectiveDetectRange){
        // "Reaction time" - the enemy doesn't snap to chasing the
        // instant it can technically see the player; it has to notice
        // first. Easy gives the player a longer window to react back;
        // Nightmare is nearly instant.
        this._reactionTimer = (this._reactionTimer||0) + dt;
        if(this._reactionTimer >= (this.reactionDelay!==undefined?this.reactionDelay:0.25)){
          this.state = 'chase';
          this._reactionTimer = 0;
          if(typeof AudioManager !== 'undefined' && Math.random()<0.5) AudioManager.playEnemyGrowl(this.type);
        }
      } else {
        this._reactionTimer = 0;
      }
    }
    if(this.state === 'chase'){
      if(distToPlayer < def.attackRange && canSee){
        this.state = (def.usesCover && Math.random()<0.3) ? 'cover' : 'attack';
      } else if(!canSee){
        this.stateTimer = 3;
        this.state = 'search';
      }
    }
    if(this.state === 'attack'){
      if(distToPlayer > def.attackRange*1.3 || !canSee){
        this.state = 'chase';
      }
    }
    if(this.state === 'cover'){
      this.coverTimer -= dt;
      if(this.coverTimer <= 0) this.state = 'attack';
    }
    if(this.state === 'search'){
      this.stateTimer -= dt;
      if(this.stateTimer <= 0) this.state = 'patrol';
    }

    // ---- BEHAVIOUR ----
    let targetPos = null;
    if(this.state === 'patrol'){
      if(this.position.distanceTo(this.patrolTarget) < 0.6) this.patrolTarget = this._randomPatrolPoint();
      targetPos = this.patrolTarget;
    } else if(this.state === 'search'){
      targetPos = this.patrolTarget;
    } else if(this.state === 'chase'){
      targetPos = player.position;
    } else if(this.state === 'attack'){
      // strafe a bit while attacking
      const strafe = Math.sin(performance.now()*0.001 + this.hoverPhase) * 2;
      const toPlayer = new THREE.Vector3().subVectors(player.position, this.position).normalize();
      const side = new THREE.Vector3(-toPlayer.z, 0, toPlayer.x);
      targetPos = this.position.clone().add(side.multiplyScalar(strafe*dt));
      this._tryAttack(player, game);
    } else if(this.state === 'cover'){
      targetPos = this.position; // hold position
    }

    if(targetPos && this.state !== 'attack' || (this.state==='attack' && targetPos)){
      const dir = new THREE.Vector3().subVectors(targetPos, this.position);
      dir.y = 0;
      const dist = dir.length();
      if(dist > 0.15){
        dir.normalize();
        const speed = def.speed * (this.speedMult || 1) * (this.state==='chase' ? 1.15 : 1);
        this.velocity.x = dir.x * speed;
        this.velocity.z = dir.z * speed;
      } else {
        this.velocity.x *= 0.8; this.velocity.z *= 0.8;
      }
    }

    // integrate movement with basic wall collision
    const next = this.position.clone();
    next.x += this.velocity.x * dt;
    next.z += this.velocity.z * dt;
    if(level) level.resolveCollisions(next, 0.4);

    if(def.flies){
      this.hoverPhase += dt*2;
      next.y = this.homePosition.y + 1.4 + Math.sin(this.hoverPhase)*0.3;
    } else {
      next.y = level ? level.getFloorHeight(next.x, next.z) : this.position.y;
    }
    this.position.copy(next);
    this.mesh.position.copy(this.position);

    // face movement / player direction
    const lookDir = this.state === 'attack' || this.state === 'chase' || this.state === 'cover'
      ? new THREE.Vector3().subVectors(player.position, this.position)
      : this.velocity.clone();
    if(lookDir.lengthSq() > 0.001){
      const angle = Math.atan2(lookDir.x, lookDir.z);
      this.mesh.rotation.y = angle;
    }

    // simple arm swing animation while moving (humanoid types only -
    // the flying drone has no arms)
    const moving = Math.hypot(this.velocity.x,this.velocity.z) > 0.2;
    if(moving && this.armL){
      const t = performance.now()*0.006;
      this.armL.rotation.x = Math.sin(t)*0.6;
      this.armR.rotation.x = -Math.sin(t)*0.6;
    }
    if(def.flies){
      const t = performance.now()*0.02;
      if(this.finL){
        this.finL.rotation.z = Math.sin(t)*0.4;
        this.finR.rotation.z = -Math.sin(t)*0.4;
      }
      if(this.rotorRing) this.rotorRing.rotation.z += dt*4;
    }
  }

  _tryAttack(player, game){
    const now = performance.now();
    const effectiveFireRate = this.def.fireRate * (this.fireRateMult || 1);
    if(now - this.lastAttack < effectiveFireRate) return;
    this.lastAttack = now;
    if(typeof AudioManager !== 'undefined') AudioManager.playEnemyGrowl(this.type);
    // hitscan-ish with falloff chance based on distance for fairness,
    // then scaled by difficulty accuracy (Easy misses more, Nightmare
    // rarely does).
    const dist = this.distanceToPlayer(player);
    const baseChance = Math.max(0.25, 1 - dist/this.def.attackRange);
    const hitChance = Math.min(0.95, baseChance * (this.accuracyMult!==undefined?this.accuracyMult:1));
    if(Math.random() < hitChance){
      player.takeDamage(this.def.damage * (this.damageMult || 1));
      game.ui && game.ui.showHitFromEnemy && game.ui.showHitFromEnemy();
    }
  }
}
