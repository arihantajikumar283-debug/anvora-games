/* ============================================================
   VOIDRIFT - weapons.js
   Weapon definitions + WeaponSystem class handling firing,
   raycasting, reload timers, muzzle flashes and bullet impacts.
   ============================================================ */

const WEAPONS = {
  pistol: {
    name: 'PISTOL', icon: 'PST',
    damage: 18, fireRate: 260, magSize: 12, reserveMax: 96,
    reloadTime: 900, spread: 0.008, recoil: 0.02, auto: false,
    pellets: 1, sound: 'pistol', color: 0xffcc55
  },
  shotgun: {
    name: 'SHOTGUN', icon: 'SHG',
    damage: 14, fireRate: 780, magSize: 6, reserveMax: 48,
    reloadTime: 1600, spread: 0.09, recoil: 0.09, auto: false,
    pellets: 8, sound: 'shotgun', color: 0xff8844
  },
  rifle: {
    name: 'RIFLE', icon: 'RFL',
    damage: 11, fireRate: 95, magSize: 30, reserveMax: 180,
    reloadTime: 1400, spread: 0.02, recoil: 0.012, auto: true,
    pellets: 1, sound: 'rifle', color: 0x66ddff
  },
  plasma: {
    name: 'PLASMA', icon: 'PLS',
    damage: 55, fireRate: 520, magSize: 8, reserveMax: 40,
    reloadTime: 1800, spread: 0.005, recoil: 0.04, auto: false,
    pellets: 1, sound: 'plasma', color: 0x66ff99, splash: 2.5
  }
};

class WeaponSystem {
  constructor(game, camera, scene){
    this.game = game;
    this.camera = camera;
    this.scene = scene;
    this.order = ['pistol','shotgun','rifle','plasma'];
    this.currentIndex = 0;
    this.ammo = {};
    this.order.forEach(k=>{
      this.ammo[k] = { mag: WEAPONS[k].magSize, reserve: WEAPONS[k].reserveMax };
    });
    this.lastFireTime = 0;
    this.reloading = false;
    this.reloadEnd = 0;
    this.recoilOffset = 0;
    this.bobTime = 0;
    this._reloadDip = 0;   // 0..1 smoothed reload dip/tilt animation
    this._sprintBlend = 0; // 0..1 smoothed sprint lowered-weapon animation

    // Visual gun model (built in _buildGunMeshes) attached to camera
    this.gunGroup = new THREE.Group();
    this.camera.add(this.gunGroup);
    this._buildGunMeshes();

    // Muzzle flash light + sprite, positioned at the new barrel tip
    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 6);
    this.muzzleLight.position.set(0, 0, -0.55);
    this.gunGroup.add(this.muzzleLight);

    // Pools for tracers / impact particles
    this.tracerPool = [];
    this.impactPool = [];
    this.activeTracers = [];
    this.activeImpacts = [];
    this._initPools();

    // Raycaster reused every shot (avoids GC churn)
    this.raycaster = new THREE.Raycaster();
  }

  get current(){ return this.order[this.currentIndex]; }
  get def(){ return WEAPONS[this.current]; }

  _buildGunMeshes(){
    this.weaponMeshes = {};
    this.order.forEach((key)=>{
      const def = WEAPONS[key];
      const g = this._buildRifleModel(def);
      g.position.set(0.16,-0.15,-0.35);
      g.visible = false;
      this.gunGroup.add(g);
      this.weaponMeshes[key] = g;
    });
    this.weaponMeshes[this.current].visible = true;
  }

  // Builds one detailed futuristic weapon model: a rounded metallic
  // receiver, barrel with a glowing energy tip, magazine, grip, stock,
  // sight rail and small glowing accent details. Shared shapes keep
  // the mesh count low (~15 primitives) so it stays cheap to render -
  // it's built once per weapon at startup, never per frame.
  _buildRifleModel(def){
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color:0x3a4048, metalness:0.8, roughness:0.28 });
    const darkMat = new THREE.MeshStandardMaterial({ color:0x14161c, metalness:0.6, roughness:0.4 });
    const accentMat = new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity:1.1, metalness:0.3, roughness:0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: def.color });

    // Rounded receiver (main body) with smooth end caps
    const receiver = new THREE.Mesh(new THREE.CylinderGeometry(0.05,0.058,0.30,12), bodyMat);
    receiver.rotation.x = Math.PI/2;
    receiver.position.set(0,0,-0.06);
    g.add(receiver);
    const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.05,10,8), bodyMat);
    noseCap.scale.set(1,1,0.5);
    noseCap.position.set(0,0,-0.21);
    g.add(noseCap);
    const rearCap = new THREE.Mesh(new THREE.SphereGeometry(0.055,10,8), bodyMat);
    rearCap.scale.set(1,1,0.5);
    rearCap.position.set(0,0,0.09);
    g.add(rearCap);

    // Barrel + glowing muzzle ring
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.015,0.018,0.28,10), darkMat);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0,0.005,-0.40);
    g.add(barrel);
    const muzzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.02,0.006,6,12), accentMat);
    muzzleRing.position.set(0,0.005,-0.54);
    g.add(muzzleRing);

    // Top rail + sight
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.02,0.02,0.2), darkMat);
    rail.position.set(0,0.062,-0.06);
    g.add(rail);
    const rearSight = new THREE.Mesh(new THREE.BoxGeometry(0.018,0.03,0.02), darkMat);
    rearSight.position.set(0,0.09,0.02);
    g.add(rearSight);
    const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.01,0.03,0.01), darkMat);
    frontSight.position.set(0,0.088,-0.2);
    g.add(frontSight);
    const sightGlow = new THREE.Mesh(new THREE.SphereGeometry(0.006,6,6), glowMat);
    sightGlow.position.set(0,0.1,0.02);
    g.add(sightGlow);

    // Angled magazine + grip
    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.04,0.15,0.05), darkMat);
    magazine.position.set(0,-0.1,-0.02);
    magazine.rotation.x = 0.22;
    g.add(magazine);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.13,0.055), bodyMat);
    grip.position.set(0,-0.095,0.10);
    grip.rotation.x = -0.28;
    g.add(grip);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045,0.06,0.13), bodyMat);
    stock.position.set(0,-0.005,0.22);
    g.add(stock);

    // Glowing energy accent strip along the receiver + small power cell
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.006,0.018,0.22), accentMat);
    strip.position.set(0.053,0.01,-0.06);
    g.add(strip);
    const cell = new THREE.Mesh(new THREE.CylinderGeometry(0.022,0.022,0.05,8), accentMat);
    cell.rotation.x = Math.PI/2;
    cell.position.set(0,-0.03,-0.02);
    g.add(cell);
    const ventA = new THREE.Mesh(new THREE.OctahedronGeometry(0.012), glowMat);
    ventA.position.set(0.045,0.03,-0.13);
    g.add(ventA);
    const ventB = ventA.clone();
    ventB.position.set(0.045,0.03,0.0);
    g.add(ventB);

    // First-person viewmodel never needs to cast/receive shadows.
    g.traverse(o=>{ if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
    return g;
  }

  _initPools(){
    const tracerGeo = new THREE.CylinderGeometry(0.007,0.007,1,4);
    tracerGeo.rotateX(Math.PI/2);
    const tracerMat = new THREE.MeshBasicMaterial({ color:0xffffaa, transparent:true, opacity:0.9 });
    for(let i=0;i<40;i++){
      const m = new THREE.Mesh(tracerGeo, tracerMat.clone());
      m.visible = false;
      this.scene.add(m);
      this.tracerPool.push(m);
    }
    const impactGeo = new THREE.SphereGeometry(0.05,6,6);
    const impactMat = new THREE.MeshBasicMaterial({ color:0xffaa33 });
    for(let i=0;i<30;i++){
      const m = new THREE.Mesh(impactGeo, impactMat.clone());
      m.visible = false;
      this.scene.add(m);
      this.impactPool.push(m);
    }
  }

  switchWeapon(key){
    if(!WEAPONS[key] || key === this.current) return;
    this.weaponMeshes[this.current].visible = false;
    this.currentIndex = this.order.indexOf(key);
    this.weaponMeshes[this.current].visible = true;
    this.reloading = false;
  }

  cycleWeapon(dir){
    this.weaponMeshes[this.current].visible = false;
    this.currentIndex = (this.currentIndex + dir + this.order.length) % this.order.length;
    this.weaponMeshes[this.current].visible = true;
    this.reloading = false;
  }

  reload(){
    const a = this.ammo[this.current];
    if(this.reloading || a.mag >= this.def.magSize || a.reserve <= 0) return;
    this.reloading = true;
    this.reloadEnd = performance.now() + this.def.reloadTime;
    if(typeof AudioManager !== 'undefined') AudioManager.playReload();
  }

  canFire(now){
    if(this.reloading) return false;
    const a = this.ammo[this.current];
    if(a.mag <= 0) return false;
    return (now - this.lastFireTime) >= this.def.fireRate;
  }

  /**
   * Attempt to fire. Returns true if a shot was produced.
   * `colliders` = array of THREE.Object3D to hit-test against (level + enemies)
   * `onHit(obj, point)` callback invoked for each thing hit.
   */
  fire(now, colliders, onHit){
    if(!this.canFire(now)){
      if(this.ammo[this.current].mag <= 0 && !this.reloading){
        // dry fire click
      }
      return false;
    }
    const a = this.ammo[this.current];
    const def = this.def;
    a.mag--;
    this.lastFireTime = now;
    this.recoilOffset = Math.min(this.recoilOffset + def.recoil, def.recoil*3);

    if(typeof AudioManager !== 'undefined') AudioManager.playShot(def.sound);
    this.muzzleLight.intensity = 3.5;
    this._muzzleFlashTimer = 0.06;

    const origin = new THREE.Vector3();
    this.camera.getWorldPosition(origin);
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);

    for(let p=0; p<def.pellets; p++){
      const spread = def.spread;
      const dir = forward.clone();
      dir.x += (Math.random()-0.5)*spread;
      dir.y += (Math.random()-0.5)*spread;
      dir.z += (Math.random()-0.5)*spread;
      dir.normalize();

      this.raycaster.set(origin, dir);
      this.raycaster.far = 120;
      const hits = this.raycaster.intersectObjects(colliders, true);
      let endPoint = origin.clone().add(dir.clone().multiplyScalar(60));
      if(hits.length > 0){
        endPoint = hits[0].point;
        if(onHit) onHit(hits[0], def.damage, def);
        this._spawnImpact(hits[0].point, hits[0].face ? hits[0].face.normal : new THREE.Vector3(0,1,0), hits[0].object);
      }
      this._spawnTracer(origin, endPoint);
    }
    return true;
  }

  _spawnTracer(from, to){
    const m = this.tracerPool.find(t=>!t.visible) || this.tracerPool[0];
    const dist = from.distanceTo(to);
    m.position.copy(from).lerp(to, 0.5);
    m.scale.set(1,1,Math.max(dist,0.01));
    m.lookAt(to);
    m.visible = true;
    m.material.opacity = 0.9;
    m.userData.life = 0.06;
    this.activeTracers.push(m);
  }

  _spawnImpact(point, normal, obj){
    const m = this.impactPool.find(t=>!t.visible) || this.impactPool[0];
    m.position.copy(point);
    m.visible = true;
    m.scale.set(1,1,1);
    m.material.opacity = 1;
    m.userData.life = 0.4;
    this.activeImpacts.push(m);
  }

  update(dt){
    // recoil recovery
    this.recoilOffset = Math.max(0, this.recoilOffset - dt*0.15);
    this.gunGroup.position.z = -0.35 + this.recoilOffset*2;

    // weapon bob while moving handled externally via setBob()

    // muzzle flash decay
    if(this.muzzleLight.intensity > 0){
      this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - dt*20);
    }

    // reload completion
    if(this.reloading && performance.now() >= this.reloadEnd){
      const a = this.ammo[this.current];
      const need = this.def.magSize - a.mag;
      const take = Math.min(need, a.reserve);
      a.mag += take;
      a.reserve -= take;
      this.reloading = false;
    }

    // Reload dip animation - the weapon tilts down and swings back up
    // over the reload duration (peaks at the midpoint).
    if(this.reloading){
      const total = this.def.reloadTime;
      const remaining = this.reloadEnd - performance.now();
      const progress = 1 - Math.max(0, Math.min(1, remaining/total));
      this._reloadDip = Math.sin(progress*Math.PI);
    } else {
      this._reloadDip = Math.max(0, this._reloadDip - dt*6);
    }

    // Combine recoil kick + reload tilt + sprint lowered-weapon pose.
    // These are applied additively on top of whatever setBob()/setAiming()
    // already set this frame, so none of the animations fight each other.
    this.gunGroup.position.y += -this._reloadDip*0.07 - this._sprintBlend*0.09;
    this.gunGroup.rotation.x = -this.recoilOffset*1.1 - this._reloadDip*0.55;
    this.gunGroup.rotation.z = this._sprintBlend*0.22;

    // tracer fade
    for(let i=this.activeTracers.length-1;i>=0;i--){
      const t = this.activeTracers[i];
      t.userData.life -= dt;
      t.material.opacity = Math.max(0, t.userData.life / 0.06);
      if(t.userData.life <= 0){ t.visible = false; this.activeTracers.splice(i,1); }
    }
    // impact fade
    for(let i=this.activeImpacts.length-1;i>=0;i--){
      const im = this.activeImpacts[i];
      im.userData.life -= dt;
      const s = Math.max(0.001, im.userData.life/0.4);
      im.scale.set(s*3,s*3,s*3);
      im.material.opacity = s;
      if(im.userData.life <= 0){ im.visible=false; this.activeImpacts.splice(i,1); }
    }
  }

  setBob(offset){
    this.gunGroup.position.x = 0.16 + offset.x;
    this.gunGroup.position.y = -0.15 + offset.y;
  }

  setAiming(isAiming, dt){
    const targetFov = isAiming ? 45 : 75;
    const cam = this.camera;
    cam.fov += (targetFov - cam.fov) * Math.min(1, dt*10);
    cam.updateProjectionMatrix();
    const targetX = isAiming ? 0.0 : 0.16;
    this.gunGroup.position.x += (targetX - this.gunGroup.position.x) * Math.min(1,dt*10);
  }

  // Smoothly lowers and tilts the weapon while sprinting, for a
  // natural "running with gun down" feel.
  setSprinting(isSprinting, dt){
    const target = isSprinting ? 1 : 0;
    this._sprintBlend += (target - this._sprintBlend) * Math.min(1, dt*8);
  }
}
