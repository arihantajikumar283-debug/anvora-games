/* ============================================================
   VOIDRIFT - main.js
   Game orchestrator: Three.js scene setup, procedural level
   generation (grid-based corridors/rooms), lighting, the
   render/update loop, input binding (desktop + mobile), pickups,
   explosive barrels, checkpoints/save, score, and difficulty.
   Developed by Arihant - AnvoraGames.
   ============================================================ */

const CELL = 6; // world units per grid cell
const MAX_LEVELS = 5;

const DIFFICULTY = {
  easy:      { enemyHealthMult: 0.7,  enemyDamageMult: 0.55, enemySpeedMult: 0.85, enemyFireRateMult: 1.4, enemyDetectMult: 0.75, enemyCountMult: 0.8, playerHealthStart: 130, playerArmorStart: 75, ammoMult: 1.6, accuracyMult: 0.6,  reactionDelay: 0.6  },
  normal:    { enemyHealthMult: 1.0,  enemyDamageMult: 1.0,  enemySpeedMult: 1.0,  enemyFireRateMult: 1.0, enemyDetectMult: 1.0,  enemyCountMult: 1.0, playerHealthStart: 100, playerArmorStart: 50, ammoMult: 1.0, accuracyMult: 1.0,  reactionDelay: 0.25 },
  hard:      { enemyHealthMult: 1.4,  enemyDamageMult: 1.35, enemySpeedMult: 1.15, enemyFireRateMult: 0.75, enemyDetectMult: 1.25, enemyCountMult: 1.25, playerHealthStart: 100, playerArmorStart: 35, ammoMult: 0.75, accuracyMult: 1.15, reactionDelay: 0.12 },
  nightmare: { enemyHealthMult: 1.9,  enemyDamageMult: 1.8,  enemySpeedMult: 1.35, enemyFireRateMult: 0.5, enemyDetectMult: 1.6,  enemyCountMult: 1.6, playerHealthStart: 90,  playerArmorStart: 15, ammoMult: 0.5, accuracyMult: 1.3,  reactionDelay: 0.05 }
};

/* ================= LEVEL ================= */
class Level {
  constructor(scene, floorIndex){
    this.scene = scene;
    this.floorIndex = floorIndex || 1;
    this.width = 9; this.height = 9; // 7x7 interior layout + a 1-cell solid margin shell on every side (see note below)
    this.grid = Array.from({length:this.height}, ()=>Array(this.width).fill(1));
    this.walls = []; // for minimap {x,z,w,d}
    this.roomRects = []; // {x0,z0,w,d,tag} - used for per-room ceilings/props
    this.sceneObjects = []; // every object this level adds, for clean disposal
    this.staticColliders = [];
    this.circleColliders = []; // {x,z,radius} - pillars/statues/altar the player can't walk through
    this.barrels = [];
    this.pickups = [];
    this.enemySpawns = [];
    this.spawnPoint = new THREE.Vector3(0,1.7,0);
    this.elevatorZone = null;
    this.secretZone = null;
    this._buildLayout();
    this._buildMeshes();
  }

  fillRect(x0,z0,w,d){
    for(let z=z0; z<z0+d; z++){
      for(let x=x0; x<x0+w; x++){
        if(this.grid[z] && this.grid[z][x] !== undefined) this.grid[z][x] = 0;
      }
    }
  }

  // Fills the rect AND remembers it so we can build a matching
  // ceiling patch / place themed props for that room later.
  addRoom(x0,z0,w,d,tag){
    this.fillRect(x0,z0,w,d);
    this.roomRects.push({ x0,z0,w,d,tag });
  }

  _buildLayout(){
    // ONE compact enclosed arena - a central hall with small alcoves
    // notched directly into its own walls. Interior hall is 5x5 cells
    // = 30x30 units (the actual requested "25-35m compact arena").
    //
    // IMPORTANT: every room is offset +1,+1 from the grid origin and
    // the grid itself is 2 cells larger in each dimension than the
    // rooms need. That 1-cell gap is a solid margin "shell" - without
    // it, the shrine/west/east/entrance notches would touch the grid
    // array's own edge, and since wall meshes only exist for in-bounds
    // cells, there'd be collision (blocking the player) but literally
    // no wall drawn there. That mismatch - not fog, not the sky, not
    // the ceiling - was the actual cause of the "black void at the map
    // edge" that kept resurfacing across previous fixes.
    //
    //        [SHRINE NOTCH]
    //   [W] [   CENTRAL HALL   ] [E]
    //        [ENTRANCE NOTCH]
    this.addRoom(2,2,5,5, 'hub');      // central hall (30x30 interior)
    this.addRoom(3,1,3,1, 'shrine');   // shrine/altar notch (north wall)
    this.addRoom(1,3,2,3, 'westroom'); // small side alcove (west wall)
    this.addRoom(6,3,2,3, 'eastroom'); // small side alcove (east wall)
    this.addRoom(3,7,3,1, 'spawn');    // entrance notch (south wall)

    this.spawnPoint = this._gridToWorld(4,6.3);
    this.elevatorZone = { center: this._gridToWorld(4,1.3), radius: 3 };
    this.secretZone = { center: this._gridToWorld(1.3,4), radius: 2.5, discovered:false };

    // Feature placement - deliberately sparse for a room this size.
    this.barrelSpots = [ [2,5],[6,5] ];
    this.pickupSpots = [
      {gx:4,gz:7,type:'ammo_pistol'}, {gx:3,gz:5,type:'health'},
      {gx:5,gz:5,type:'armor'}, {gx:1,gz:5,type:'ammo_shotgun'},
      {gx:7,gz:4,type:'ammo_rifle'}, {gx:3,gz:1,type:'powerup_damage'}
    ];
    this.enemySpawnDefs = [
      {gx:3,gz:4,type:'guardian'}, {gx:5,gz:4,type:'spearguard'},
      {gx:4,gz:3,type:'drone'}, {gx:1,gz:4,type:'archer'},
      {gx:4,gz:2,type:'elite'}
    ];
  }

  _gridToWorld(gx,gz){ return new THREE.Vector3(gx*CELL, 0, gz*CELL); }

  // Every mesh/light this level creates goes through here so it can be
  // fully torn down later - otherwise each new floor would pile its
  // pillars/statues/torches/rift on top of the previous one's.
  _add(obj){
    this.scene.add(obj);
    this.sceneObjects.push(obj);
    return obj;
  }

  dispose(){
    // Removing from the scene graph alone leaves geometries/materials/
    // textures resident on the GPU. None of this level's materials are
    // shared with anything outside the Level, so it's safe to fully
    // free them here before the next floor is built.
    this.sceneObjects.forEach(obj=>{
      this.scene.remove(obj);
      if(obj.traverse){
        obj.traverse(child=>{
          if(child.geometry) child.geometry.dispose();
          if(child.material){
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m=>{
              if(m.map) m.map.dispose();
              if(m.emissiveMap) m.emissiveMap.dispose();
              m.dispose();
            });
          }
        });
      }
    });
    this.sceneObjects = [];
  }

  isSolid(gx,gz){
    if(gz<0||gz>=this.height||gx<0||gx>=this.width) return true;
    return this.grid[gz][gx] === 1;
  }

  _carvedTexture(){
    // Procedural canvas texture giving the stone walls an ancient
    // carved look: a key-pattern border plus a mandala roundel per
    // tile, in warm bronze - no external image assets needed.
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = 'rgba(255,180,90,0.6)'; ctx.lineWidth = 2;
    for(let i=0; i<128; i+=32){
      ctx.strokeRect(i+5,5,22,22);
      ctx.beginPath(); ctx.moveTo(i+16,5); ctx.lineTo(i+16,27); ctx.stroke();
    }
    // Mandala roundel motif (matches the carved sunburst medallion look
    // of traditional temple stonework)
    ctx.strokeStyle = 'rgba(255,150,60,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(64,64,22,0,Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.arc(64,64,14,0,Math.PI*2); ctx.stroke();
    for(let a=0; a<12; a++){
      const ang = (a/12)*Math.PI*2;
      ctx.beginPath();
      ctx.moveTo(64+Math.cos(ang)*14, 64+Math.sin(ang)*14);
      ctx.lineTo(64+Math.cos(ang)*22, 64+Math.sin(ang)*22);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(90,190,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0,110); ctx.lineTo(128,110); ctx.stroke();
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  }

  _floorTileTexture(){
    // Irregular ancient flagstone: staggered rows of varying-width
    // stone slabs with natural tone variation and a few hairline
    // cracks - NOT a uniform grid/checkerboard (an earlier pass used
    // evenly-spaced square tiles with grid lines at a fixed interval,
    // which is exactly what read as a "checkerboard floor"). Real
    // flagstone never lines up into a repeating grid, so the slab
    // widths and row heights are randomized and each row is offset
    // from the one above it.
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgb(80,60,40)';
    ctx.fillRect(0,0,128,128);

    let y = 0;
    while(y < 128){
      const rowH = 16 + Math.random()*12;
      let x = -(Math.random()*18); // stagger each row so seams don't align vertically
      while(x < 128){
        const w = 20 + Math.random()*26;
        const r = 90 + Math.floor(Math.random()*30);
        const g = 66 + Math.floor(Math.random()*22);
        const b = 42 + Math.floor(Math.random()*16);
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, y, w-1.5, rowH-1.5);
        x += w;
      }
      y += rowH;
    }
    // A handful of fine cracks rather than a uniform grout grid
    ctx.strokeStyle = 'rgba(20,12,6,0.35)'; ctx.lineWidth = 1;
    for(let i=0;i<7;i++){
      ctx.beginPath();
      ctx.moveTo(Math.random()*128, Math.random()*128);
      ctx.lineTo(Math.random()*128, Math.random()*128);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(this.width*0.7, this.height*0.7);
    return tex;
  }

  _buildMeshes(){
    const carved = this._carvedTexture();
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xa9793f, roughness:0.88, metalness:0.08,
      emissiveMap: carved, emissive: 0xffb060, emissiveIntensity:0.16
    });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: this._floorTileTexture(), roughness:0.92, metalness:0.05 });
    // FrontSide, not BackSide: after this ceiling plane's rotation.x =
    // +PI/2 (below), its face normal ends up pointing DOWN - toward the
    // camera, which is always below it inside the temple. BackSide only
    // renders a face whose normal points AWAY from the camera, so with
    // BackSide this entire plane was being culled and was never
    // visible from inside the temple at all - only the separate
    // decorative beam/lamp meshes were ever rendering up there, which
    // is exactly "floating disconnected beams with no roof".
    const ceilMat = new THREE.MeshStandardMaterial({
      color: 0x4a3820, roughness:0.92, side: THREE.FrontSide,
      emissiveMap: carved, emissive: 0xcc8a45, emissiveIntensity:0.14
    });
    // Wall height deliberately overlaps the ceiling height (4.3) by a
    // margin rather than stopping exactly at it - two coplanar surfaces
    // meeting edge-to-edge with zero tolerance is exactly how you get a
    // thin open seam. Walls now span y=0 to y=4.45, so the ceiling
    // plane at y=4.3 sits safely inside that span with 0.15 units of
    // overlap - the seam between wall-top and ceiling is physically
    // sealed, not just visually close.
    const boxGeo = new THREE.BoxGeometry(CELL, 4.45, CELL);

    // Collect solid cells adjacent to a floor cell (reduces geometry count)
    const instances = [];
    for(let z=0; z<this.height; z++){
      for(let x=0; x<this.width; x++){
        if(this.grid[z][x] !== 1) continue;
        const neighborsFloor =
          !this.isSolid(x-1,z) || !this.isSolid(x+1,z) ||
          !this.isSolid(x,z-1) || !this.isSolid(x,z+1);
        if(neighborsFloor){
          instances.push({x,z});
          this.walls.push({ x: x*CELL, z: z*CELL, w: CELL, d: CELL });
        }
      }
    }

    const wallMesh = new THREE.InstancedMesh(boxGeo, wallMat, instances.length);
    wallMesh.castShadow = true; wallMesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    instances.forEach((cell, i)=>{
      m.makeTranslation(cell.x*CELL, 2.225, cell.z*CELL);
      wallMesh.setMatrixAt(i, m);
    });
    wallMesh.instanceMatrix.needsUpdate = true;
    this._add(wallMesh);
    this.staticColliders.push(wallMesh);
    this.wallMesh = wallMesh;

    // Floor: one big plane spanning the grid bounds (worn temple stone)
    const floorGeo = new THREE.PlaneGeometry(this.width*CELL, this.height*CELL);
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI/2;
    floor.position.set((this.width*CELL)/2 - CELL/2, 0, (this.height*CELL)/2 - CELL/2);
    floor.receiveShadow = true;
    this._add(floor);
    this.staticColliders.push(floor);

    // Ceiling: ONE plane covering the whole footprint, exactly like the
    // floor above. This used to be built per-room, but in this compact
    // single-hub-plus-notches layout the notch rooms (shrine/west/east/
    // entrance) deliberately overlap the hub's own boundary to form
    // doorways - so their separate ceiling pieces ended up stacked on
    // top of the hub's ceiling at the same height, which is textbook
    // z-fighting. A single plane sized to the full grid, like the
    // floor, covers every room with zero gaps and zero overlap.
    const ceil = new THREE.Mesh(floorGeo, ceilMat);
    ceil.rotation.x = Math.PI/2;
    ceil.position.set(floor.position.x, 4.3, floor.position.z);
    this._add(ceil);

    this._buildElevatorAndRift();
    this._buildPillarsAndGateways();
    this._buildStatues();
    this._buildFloorAndCeilingMedallions();
    this._buildSkylight();
  }

  // Small glowing skylight patch + soft light shaft over the entrance -
  // "sunlight entering through an opening" without actually opening the
  // roof to a huge outdoor sky/mountain backdrop.
  _buildSkylight(){
    const center = this._gridToWorld(4,7);
    const glowMat = new THREE.MeshBasicMaterial({ color:0xfff4d0 });
    const patch = new THREE.Mesh(new THREE.PlaneGeometry(2.2,2.2), glowMat);
    patch.rotation.x = Math.PI/2;
    patch.position.set(center.x, 4.25, center.z);
    this._add(patch);

    const beamMat = new THREE.MeshBasicMaterial({ color:0xfff4d0, transparent:true, opacity:0.12, depthWrite:false, side:THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.ConeGeometry(1.4,4.2,10,1,true), beamMat);
    beam.position.set(center.x, 2.1, center.z);
    this._add(beam);

    const skyLight = new THREE.PointLight(0xfff2d0, 1.4, 8);
    skyLight.position.set(center.x, 3.8, center.z);
    this._add(skyLight);
  }

  // "Rift Machine" chamber: the elevator pad IS the sci-fi rift portal -
  // ancient stone base fused with glowing blue/cyan tech and a swirling
  // energy ring. Kept as a single co-located set-piece (fewer objects,
  // more coherent theme) instead of two separate monuments.
  _buildElevatorAndRift(){
    const baseMat = new THREE.MeshStandardMaterial({ color:0x6b5a42, roughness:0.9 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7,1.9,0.5,14), baseMat);
    base.position.copy(this.elevatorZone.center).setY(-0.05);
    base.receiveShadow = true;
    this._add(base);

    const padGeo = new THREE.CylinderGeometry(1.3,1.3,0.25,14);
    const padMat = new THREE.MeshStandardMaterial({ color:0x21e6ff, emissive:0x0d5560, emissiveIntensity:0.6, metalness:0.6, roughness:0.3 });
    this.elevatorPad = new THREE.Mesh(padGeo, padMat);
    this.elevatorPad.position.copy(this.elevatorZone.center).setY(0.25);
    this._add(this.elevatorPad);

    // Swirling dimensional rift rings hovering above the pad
    this.riftGroup = new THREE.Group();
    const ringGeo = new THREE.TorusGeometry(0.75,0.07,8,20);
    const ringA = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color:0xff2e4d, transparent:true, opacity:0.85 }));
    const ringB = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color:0x21e6ff, transparent:true, opacity:0.85 }));
    ringB.scale.set(0.65,0.65,0.65);
    ringB.rotation.x = Math.PI/2.3;
    this.riftGroup.add(ringA, ringB);
    this.riftGroup.position.copy(this.elevatorZone.center).setY(2.2);
    this._add(this.riftGroup);

    const elevLight = new THREE.PointLight(0x21e6ff, 2.0, 10);
    elevLight.position.copy(this.elevatorZone.center).setY(2.2);
    this._add(elevLight);
    const riftLightA = new THREE.PointLight(0xff2e4d, 1.2, 8);
    riftLightA.position.copy(this.elevatorZone.center).setY(1.1);
    this._add(riftLightA);

    const techMat = new THREE.MeshStandardMaterial({ color:0x1a2530, emissive:0x21e6ff, emissiveIntensity:0.55, metalness:0.8, roughness:0.3 });
    [[-1.0,0],[1.0,0]].forEach(([ox,oz])=>{
      const monolith = new THREE.Mesh(new THREE.BoxGeometry(0.4,1.6,0.4), techMat);
      monolith.position.set(this.elevatorZone.center.x+ox, 0.8, this.elevatorZone.center.z+oz);
      monolith.castShadow = false; // decorative - keep shadow pass cheap
      this._add(monolith);
      this.circleColliders.push({ x:this.elevatorZone.center.x+ox, z:this.elevatorZone.center.z+oz, radius:0.3 });
    });

    // Hidden nook - a small glowing stash marker, not a full set-piece.
    const stashLight = new THREE.PointLight(0xffcc33, 1.1, 6);
    stashLight.position.copy(this.secretZone.center).setY(1.6);
    this._add(stashLight);
  }

  // Carved stone pillars - built individually with a few different
  // shaft/capital designs (not identical copies), plus one gateway
  // arch at the shrine threshold. Their base positions are recorded
  // as simple circle colliders so the player (and enemies) can't walk
  // straight through them - cheap collision, no per-pillar mesh test.
  _buildPillar(gx, gz, variant){
    const stoneMat = new THREE.MeshStandardMaterial({ color:0x9a8464, roughness:0.85, emissive:0x2a1f10, emissiveIntensity:0.12 });
    const trimMat = new THREE.MeshStandardMaterial({ color:0x7a5030, roughness:0.8, emissive:0xff8833, emissiveIntensity:0.08 });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.55,0.3,variant===1?8:6), stoneMat);
    base.position.y = 0.15;
    g.add(base);

    let shaft, capital;
    if(variant === 0){ // plain round column
      shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.32,0.36,3.6,10), stoneMat);
      capital = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.34,0.35,10), trimMat);
    } else if(variant === 1){ // faceted/octagonal column
      shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.3,0.34,3.6,8), stoneMat);
      capital = new THREE.Mesh(new THREE.BoxGeometry(0.85,0.35,0.85), trimMat);
    } else { // tapered fluted column with a banded ring
      shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.26,0.4,3.6,12), stoneMat);
      capital = new THREE.Mesh(new THREE.ConeGeometry(0.5,0.5,10), trimMat);
    }
    shaft.position.y = 2.05;
    capital.position.y = 3.95;
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.34,0.05,6,12), trimMat);
    band.position.y = 2.75;
    band.rotation.x = Math.PI/2;
    g.add(shaft, capital, band);
    g.traverse(o=>{ if(o.isMesh) o.castShadow = false; }); // decorative - keep shadow pass cheap
    g.position.set(gx*CELL, 0, gz*CELL);
    this._add(g);
    this.circleColliders.push({ x:gx*CELL, z:gz*CELL, radius:0.55 });
  }

  _buildPillarsAndGateways(){
    // 4 pillars, 3 distinct designs between them - just enough to mark
    // out the central hall without cluttering a 30x30 room.
    this._buildPillar(3,3,0);
    this._buildPillar(5,3,1);
    this._buildPillar(3,5,2);
    this._buildPillar(5,5,0);
    this._buildPillar(2.6,4,1);
    this._buildPillar(5.4,4,2);

    this._buildGateArch(4,2,'x');
  }

  _buildGateArch(gx, gz, axis){
    const group = new THREE.Group();
    const postMat = new THREE.MeshStandardMaterial({ color:0x8a7355, roughness:0.85, emissive:0x2a1f10, emissiveIntensity:0.15 });
    const postGeo = new THREE.BoxGeometry(0.8,4.6,0.8);
    const lintelGeo = axis === 'x' ? new THREE.BoxGeometry(CELL*1.4,0.8,0.8) : new THREE.BoxGeometry(0.8,0.8,CELL*1.4);
    const offset = CELL*0.7;
    const p1 = new THREE.Mesh(postGeo, postMat);
    const p2 = new THREE.Mesh(postGeo, postMat);
    if(axis === 'x'){ p1.position.set(-offset,2.3,0); p2.position.set(offset,2.3,0); }
    else { p1.position.set(0,2.3,-offset); p2.position.set(0,2.3,offset); }
    const lintel = new THREE.Mesh(lintelGeo, postMat);
    lintel.position.y = 4.5;
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), new THREE.MeshStandardMaterial({ color:0x21e6ff, emissive:0x21e6ff, emissiveIntensity:1.2 }));
    gem.position.y = 4.5;
    group.add(p1,p2,lintel,gem);

    // Simplified gopuram-style tower above the lintel - a few tapering
    // tiers, cheap (4 boxes) but reads as a temple gateway tower.
    const tierMat = new THREE.MeshStandardMaterial({ color:0xc99a5e, roughness:0.8, emissive:0x3a2410, emissiveIntensity:0.1 });
    for(let t=0; t<4; t++){
      const s = 1.9 - t*0.4;
      const tier = new THREE.Mesh(new THREE.BoxGeometry(s, 0.55, s*0.8), tierMat);
      tier.position.y = 5.0 + t*0.6;
      group.add(tier);
    }
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.35,0.9,6), tierMat);
    finial.position.y = 5.0 + 4*0.6 + 0.3;
    group.add(finial);

    // Saffron temple flag fluttering beside the gate
    const flagMat = new THREE.MeshStandardMaterial({ color:0xff9933, roughness:0.7, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6,0.9), flagMat);
    flag.position.set(offset*0.6, 4.0, 0.5);
    flag.userData.isFlag = true;
    group.add(flag);

    group.traverse(o=>{ if(o.isMesh) o.castShadow = false; }); // decorative gateway - keep shadow pass cheap
    group.position.set(gx*CELL, 0, gz*CELL);
    this._add(group);
    this.flags = this.flags || [];
    this.flags.push(flag);

    // The two posts are solid-looking stone blocks sitting right in a
    // doorway the player walks through constantly - they need colliders
    // just as much as a free-standing pillar does (this was previously
    // missing entirely, so the player could walk straight through them).
    if(axis === 'x'){
      this.circleColliders.push({ x:gx*CELL-offset, z:gz*CELL, radius:0.45 });
      this.circleColliders.push({ x:gx*CELL+offset, z:gz*CELL, radius:0.45 });
    } else {
      this.circleColliders.push({ x:gx*CELL, z:gz*CELL-offset, radius:0.45 });
      this.circleColliders.push({ x:gx*CELL, z:gz*CELL+offset, radius:0.45 });
    }
  }

  // A couple of weathered idol statues watching over the courtyard -
  // faint blue glow in the eyes hints at the buried technology beneath.
  // Seated shrine idols flanking the courtyard threshold, each backed
  // by a carved stone relief panel (matching the shrine-niche look of
  // the reference art). These are deliberately generic ancient-idol
  // forms rather than a specific named deity - see chat summary for why.
  _buildStatues(){
    const stoneMat = new THREE.MeshStandardMaterial({ color:0x6b4e30, roughness:0.92, metalness:0.05 });
    const glowMat = new THREE.MeshStandardMaterial({ color:0xffb060, emissive:0xffb060, emissiveIntensity:1.1 });
    const reliefTex = this._carvedTexture();
    const reliefMat = new THREE.MeshStandardMaterial({
      color:0x8a6238, roughness:0.9, emissiveMap:reliefTex, emissive:0xffb060, emissiveIntensity:0.35, side:THREE.DoubleSide
    });
    const spots = [[3,2],[5,2]]; // flanking the shrine notch from inside the hall
    spots.forEach(([gx,gz])=>{
      const g = new THREE.Group();

      // Carved relief backdrop panel
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.8,2.6), reliefMat);
      panel.position.set(0, 1.4, -0.4);
      g.add(panel);

      // Seated idol: pedestal, cross-legged base, torso, head, halo glow
      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(1.0,0.35,0.9), stoneMat);
      pedestal.position.y = 0.18;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48,0.54,0.35,10), stoneMat);
      base.position.y = 0.5;
      const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28,0.42,0.8,10), stoneMat);
      torso.position.y = 1.05;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.24,10,10), stoneMat);
      head.position.y = 1.65;
      const crown = new THREE.Mesh(new THREE.ConeGeometry(0.17,0.3,8), stoneMat);
      crown.position.y = 1.94;
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.34,0.4,16), glowMat);
      halo.position.set(0, 1.65, -0.13);
      const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.045,6,6), glowMat);
      glowCore.position.y = 1.05;
      g.add(pedestal, base, torso, head, crown, halo, glowCore);

      g.traverse(o=>{ if(o.isMesh) o.castShadow = false; }); // decorative shrine - keep shadow pass cheap
      g.position.set(gx*CELL, 0, gz*CELL);
      this._add(g);
      this.circleColliders.push({ x:gx*CELL, z:gz*CELL, radius:0.55 });
    });
  }

  // Central circular stone floor mandala + a matching painted ceiling
  // medallion overhead, plus a couple of decorative ceiling beams -
  // this is the "central combat room" focal point, replacing what used
  // to be an open-air jungle courtyard (the level is fully indoors now).
  _buildFloorAndCeilingMedallions(){
    const center = this._gridToWorld(4,4);
    const carved = this._carvedTexture();

    const floorMedMat = new THREE.MeshStandardMaterial({ color:0x6b4a28, roughness:0.82, emissiveMap:carved, emissive:0xffb060, emissiveIntensity:0.22 });
    const floorMed = new THREE.Mesh(new THREE.CircleGeometry(2.2,20), floorMedMat);
    floorMed.rotation.x = -Math.PI/2;
    floorMed.position.set(center.x, 0.02, center.z);
    this._add(floorMed);

    const ringMat = new THREE.MeshStandardMaterial({ color:0xc9a35a, roughness:0.6, metalness:0.35 });
    const ring = new THREE.Mesh(new THREE.RingGeometry(2.2,2.4,24), ringMat);
    ring.rotation.x = -Math.PI/2;
    ring.position.set(center.x, 0.025, center.z);
    this._add(ring);

    const ceilMedMat = new THREE.MeshStandardMaterial({ color:0x8a6238, roughness:0.8, emissiveMap:carved, emissive:0xffb060, emissiveIntensity:0.3, side:THREE.DoubleSide });
    const ceilMed = new THREE.Mesh(new THREE.CircleGeometry(1.8,20), ceilMedMat);
    ceilMed.rotation.x = Math.PI/2;
    ceilMed.position.set(center.x, 4.27, center.z);
    this._add(ceilMed);

    // Roof support beams - deliberately built to connect the four
    // corner pillars into a rectangular frame (rather than floating
    // free in the middle of the room), so the roof reads as something
    // that's actually resting on the architecture beneath it.
    const beamMat = new THREE.MeshStandardMaterial({ color:0x4a3320, roughness:0.9 });
    const beamY = 4.12;
    const p1 = this._gridToWorld(3,3), p2 = this._gridToWorld(5,3);
    const p3 = this._gridToWorld(3,5), p4 = this._gridToWorld(5,5);
    const spanX = p2.x - p1.x, spanZ = p3.z - p1.z;

    // North/south beams (running along X, connecting left/right pillars)
    [p1.z, p3.z].forEach(z=>{
      const beam = new THREE.Mesh(new THREE.BoxGeometry(spanX+0.6,0.28,0.32), beamMat);
      beam.position.set(center.x, beamY, z);
      this._add(beam);
    });
    // East/west beams (running along Z, connecting front/back pillars)
    [p1.x, p2.x].forEach(x=>{
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.32,0.28,spanZ+0.6), beamMat);
      beam.position.set(x, beamY, center.z);
      this._add(beam);
    });
    // Small carved corbel blocks where each beam meets a pillar top -
    // sells the "resting on the pillar" read rather than just crossing
    // over it.
    [p1,p2,p3,p4].forEach(p=>{
      const corbel = new THREE.Mesh(new THREE.BoxGeometry(0.5,0.22,0.5), beamMat);
      corbel.position.set(p.x, beamY-0.02, p.z);
      this._add(corbel);
    });

    this._buildHangingLamps();
  }

  // Ceiling-hung oil lamps - visual only (no new dynamic lights, so
  // this doesn't cost anything against the "few dynamic lights"
  // performance budget). Suspended by a thin chain from the ceiling,
  // hanging low enough to read clearly as roof furniture rather than
  // just another wall fixture.
  _buildHangingLamps(){
    const chainMat = new THREE.MeshStandardMaterial({ color:0x3a2f22, roughness:0.7, metalness:0.4 });
    const lampMat = new THREE.MeshStandardMaterial({ color:0x2a1f14, roughness:0.6, metalness:0.5, emissive:0xff9944, emissiveIntensity:0.5 });
    const spots = [
      this._gridToWorld(4,1),   // over the shrine
      this._gridToWorld(1.5,4), // west room
      this._gridToWorld(6.5,4), // east room
      this._gridToWorld(4,7)    // over the entrance
    ];
    spots.forEach(p=>{
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.02,0.02,0.9,4), chainMat);
      chain.position.set(p.x, 3.75, p.z);
      const lamp = new THREE.Mesh(new THREE.OctahedronGeometry(0.22), lampMat);
      lamp.position.set(p.x, 3.25, p.z);
      this._add(chain);
      this._add(lamp);
    });
  }

  resolveCollisions(pos, radius){
    const gx = Math.floor(pos.x/CELL), gz = Math.floor(pos.z/CELL);
    for(let dz=-1; dz<=1; dz++){
      for(let dx=-1; dx<=1; dx++){
        const cx = gx+dx, cz = gz+dz;
        if(!this.isSolid(cx,cz)) continue;
        const minX = cx*CELL - CELL/2, maxX = cx*CELL + CELL/2;
        const minZ = cz*CELL - CELL/2, maxZ = cz*CELL + CELL/2;
        const closestX = Math.max(minX, Math.min(pos.x, maxX));
        const closestZ = Math.max(minZ, Math.min(pos.z, maxZ));
        const dxp = pos.x - closestX, dzp = pos.z - closestZ;
        const distSq = dxp*dxp + dzp*dzp;
        if(distSq < radius*radius){
          const dist = Math.sqrt(distSq) || 0.0001;
          const overlap = radius - dist;
          pos.x += (dxp/dist) * overlap;
          pos.z += (dzp/dist) * overlap;
        }
      }
    }
    // Pillars/statues/altar - simple circle-vs-circle push-out. Cheap
    // (only a handful of these in a room this size) and means the
    // player and enemies can no longer walk straight through them.
    for(let i=0;i<this.circleColliders.length;i++){
      const c = this.circleColliders[i];
      const dxp = pos.x - c.x, dzp = pos.z - c.z;
      const minDist = radius + c.radius;
      const distSq = dxp*dxp + dzp*dzp;
      if(distSq < minDist*minDist){
        const dist = Math.sqrt(distSq) || 0.0001;
        const overlap = minDist - dist;
        pos.x += (dxp/dist) * overlap;
        pos.z += (dzp/dist) * overlap;
      }
    }
  }

  getFloorHeight(){ return 0; }
}

/* ================= PICKUP ================= */
class Pickup {
  constructor(spot, scene){
    this.type = spot.type;
    this.scene = scene;
    this.collected = false;
    const colorMap = {
      health:0xff3355, armor:0x21e6ff, ammo_pistol:0xffcc55, ammo_shotgun:0xff8844,
      ammo_rifle:0x66ddff, ammo_plasma:0x66ff99, powerup_damage:0xff00ff, powerup_speed:0xffff00
    };
    const geo = spot.type.startsWith('powerup') ? new THREE.OctahedronGeometry(0.35) : new THREE.BoxGeometry(0.4,0.4,0.4);
    const mat = new THREE.MeshStandardMaterial({ color: colorMap[spot.type], emissive: colorMap[spot.type], emissiveIntensity:1.1 });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.set(spot.gx*CELL, 1.0, spot.gz*CELL);
    scene.add(this.mesh);
  }
  update(dt){
    if(this.collected) return;
    this.mesh.rotation.y += dt*1.5;
    this.mesh.position.y = 1.0 + Math.sin(performance.now()*0.002)*0.15;
  }
  apply(player, game){
    if(this.collected) return;
    let msg = '';
    switch(this.type){
      case 'health': player.heal(35); msg = '+35 HEALTH'; break;
      case 'armor': player.addArmor(35); msg = '+35 ARMOR'; break;
      case 'ammo_pistol': game.weapons.ammo.pistol.reserve = Math.min(WEAPONS.pistol.reserveMax, game.weapons.ammo.pistol.reserve+24); msg='+PISTOL AMMO'; break;
      case 'ammo_shotgun': game.weapons.ammo.shotgun.reserve = Math.min(WEAPONS.shotgun.reserveMax, game.weapons.ammo.shotgun.reserve+12); msg='+SHOTGUN AMMO'; break;
      case 'ammo_rifle': game.weapons.ammo.rifle.reserve = Math.min(WEAPONS.rifle.reserveMax, game.weapons.ammo.rifle.reserve+60); msg='+RIFLE AMMO'; break;
      case 'ammo_plasma': game.weapons.ammo.plasma.reserve = Math.min(WEAPONS.plasma.reserveMax, game.weapons.ammo.plasma.reserve+15); msg='+PLASMA AMMO'; break;
      case 'powerup_damage': game.activatePowerup('damage'); msg='DAMAGE BOOST ACTIVE'; break;
      case 'powerup_speed': game.activatePowerup('speed'); msg='SPEED BOOST ACTIVE'; break;
    }
    this.collected = true;
    this.mesh.visible = false;
    if(typeof AudioManager !== 'undefined') AudioManager.playPickup();
    game.ui.showToast(msg);
  }
}

/* ================= BARREL (ancient sealed energy urn) ================= */
// Shared geometries/materials - built once and reused by every barrel
// instance across every floor, instead of each barrel allocating its
// own copies.
const BARREL_GEO_BODY = new THREE.CylinderGeometry(0.42,0.5,1.05,10);
const BARREL_GEO_LID = new THREE.CylinderGeometry(0.3,0.42,0.14,10);
const BARREL_GEO_RING = new THREE.TorusGeometry(0.44,0.03,6,16);
const BARREL_MAT_BODY = new THREE.MeshStandardMaterial({ color:0x8a5a35, roughness:0.8, metalness:0.15 });
const BARREL_MAT_CRACK = new THREE.MeshStandardMaterial({ color:0xff5522, emissive:0xff3300, emissiveIntensity:1.1 });

class Barrel {
  constructor(gx,gz,scene){
    this.scene = scene;
    this.health = 40;
    this.alive = true;
    const group = new THREE.Group();
    const body = new THREE.Mesh(BARREL_GEO_BODY, BARREL_MAT_BODY);
    body.position.y = 0.52;
    const lid = new THREE.Mesh(BARREL_GEO_LID, BARREL_MAT_BODY);
    lid.position.y = 1.08;
    const crackRing = new THREE.Mesh(BARREL_GEO_RING, BARREL_MAT_CRACK);
    crackRing.position.y = 0.55; crackRing.rotation.x = Math.PI/2;
    crackRing.userData.barrelRef = this;
    group.add(body, lid, crackRing);
    group.traverse(o=>{ if(o.isMesh) o.castShadow = false; }); // decorative urn - keep shadow pass cheap
    this.mesh = group;
    this.mesh.position.set(gx*CELL, 0, gz*CELL);
    this.mesh.userData.barrelRef = this;
    body.userData.barrelRef = this;
    lid.userData.barrelRef = this;
    scene.add(this.mesh);
  }
  takeDamage(amount, game){
    if(!this.alive) return;
    this.health -= amount;
    if(this.health <= 0) this.explode(game);
  }
  explode(game){
    this.alive = false;
    this.scene.remove(this.mesh);
    if(typeof AudioManager !== 'undefined') AudioManager.playExplosion();
    game.spawnExplosion(this.mesh.position, 4.5);
    let hitEnemy = false;
    game.enemies.forEach(e=>{
      if(e.alive && e.position.distanceTo(this.mesh.position) < 4.5){
        e.takeDamage(70, game);
        hitEnemy = true;
      }
    });
    if(game.player.position.distanceTo(this.mesh.position) < 4.5){
      game.player.takeDamage(35);
    }
    // chain reaction
    game.barrels.forEach(b=>{
      if(b.alive && b !== this && b.mesh.position.distanceTo(this.mesh.position) < 3.5){
        setTimeout(()=> b.explode(game), 140);
      }
    });
    if(hitEnemy) unlockAchievement('demolitionist');
  }
}

/* ================= GAME ================= */
class Game {
  constructor(){
    this.state = 'loading';
    this.isMobile = this._detectMobile();
    this.clock = new THREE.Clock();
    this.difficulty = 'normal';
    this.floorIndex = 1;
    this.elapsedRunTime = 0;
    this.weaponsFiredTypes = new Set();
    this.powerups = {};
  }

  _detectMobile(){
    const ua = navigator.userAgent;
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    return /Android|iPhone|iPad|iPod/i.test(ua) || (touch && window.matchMedia('(pointer:coarse)').matches);
  }

  async init(){
    UI.init(this);
    UI.setLoadingProgress(10, 'BUILDING RENDERER...');

    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: !this.isMobile });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if(THREE.sRGBEncoding !== undefined) this.renderer.outputEncoding = THREE.sRGBEncoding;
    // Filmic tone mapping compresses bright highlights instead of
    // clipping them to flat white - this is what fixes the washed-out
    // look while keeping the scene genuinely bright and colorful.
    if(THREE.ACESFilmicToneMapping !== undefined){
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 0.95;
    }

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x241b10, 0.014);

    // Far plane only needs to cover this one small enclosed room now
    // (42x42 units, ~59 unit diagonal) - not the 220 units it needed
    // when there was still a distant sky dome/mountain backdrop.
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth/window.innerHeight, 0.1, 100);
    // Camera must be part of the scene graph so its children (the
    // first-person gun model + muzzle flash light) actually render.
    this.scene.add(this.camera);

    UI.setLoadingProgress(30, 'GENERATING LEVEL...');
    this._setupLighting();
    this._buildSkyAndHorizon();
    this._initExplosionPool();

    this.player = new Player(this.camera, this);
    this.weapons = new WeaponSystem(this, this.camera, this.scene);
    this.enemies = [];
    this.barrels = [];
    this.pickups = [];

    UI.setLoadingProgress(55, 'CALIBRATING DIFFICULTY...');
    this.setGraphicsQuality('auto');

    UI.setLoadingProgress(75, 'ARMING WEAPONS...');
    this._bindInput();

    window.addEventListener('resize', ()=> this._onResize());

    UI.setLoadingProgress(100, 'READY');
    await new Promise(r=>setTimeout(r, 250));

    this.state = 'menu';
    UI.showScreen('main-menu');
    document.getElementById('btn-continue').style.display = localStorage.getItem('voidrift_save') ? 'block' : 'none';

    if(this.isMobile){
      this.mobileInput = UI.setupMobileControls();
    }

    this._loop();
  }

  _setupLighting(){
    // Global fill light kept modest - this was the main cause of the
    // "washed out" look: high ambient/hemisphere/sun intensity flattens
    // all the carved detail and color into flat white. The warm lantern
    // point lights below now do most of the actual illumination work,
    // giving proper warm pools of light with natural darker in-between
    // areas ("ancient + mysterious + well lit" rather than flat/pale).
    const hemi = new THREE.HemisphereLight(0xa8cdE8, 0x5a4526, 0.42);
    this.scene.add(hemi);
    const ambient = new THREE.AmbientLight(0xffe0b0, 0.30);
    this.scene.add(ambient);

    // No global directional "sun" here on purpose - the temple is now
    // fully enclosed with a ceiling on every room, so a directional
    // light (which ignores ceiling occlusion) would flatten the indoor
    // lighting right back to washed-out. The dedicated skylight point
    // light in _buildSkylight() gives a proper *localized* sunbeam over
    // the entrance instead.

    this._flameTexture = this._buildFlameTexture();

    this.flickerLights = [];
    this.torchFlames = [];
    // Old-fashioned wall lanterns/oil lamps along every room (one glows
    // blue energy near the rift machine). Tighter range than before so
    // each lamp casts a warm local pool rather than blanket-lighting
    // the whole room - that contrast is what reads as "beautifully lit"
    // instead of flat. Still all non-shadow-casting for performance.
    const spots = [
      [4,7,'fire'], [1,4,'fire'], [7,4,'fire'], [3,4,'fire'],
      [5,4,'fire'], [4,4,'fire'], [4,2,'energy']
    ];
    spots.forEach(([gx,gz,kind])=>{
      const color = kind === 'energy' ? 0x33ccff : 0xff8833;
      const light = new THREE.PointLight(color, 1.3, 10, 2);
      light.position.set(gx*CELL, 3.0, gz*CELL);
      this.scene.add(light);
      this.flickerLights.push(light);

      const sconce = new THREE.Mesh(
        new THREE.BoxGeometry(0.3,0.5,0.3),
        new THREE.MeshStandardMaterial({ color:0x5a4a35, roughness:0.9 })
      );
      sconce.position.set(gx*CELL, 2.7, gz*CELL);
      this.scene.add(sconce);

      const flameMat = new THREE.SpriteMaterial({ map:this._flameTexture, color, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending });
      const flame = new THREE.Sprite(flameMat);
      flame.scale.set(0.6,0.9,1);
      flame.position.set(gx*CELL, 3.15, gz*CELL);
      this.scene.add(flame);
      this.torchFlames.push(flame);
    });
  }

  _buildFlameTexture(){
    const c = document.createElement('canvas'); c.width = 64; c.height = 64;
    const ctx = c.getContext('2d');
    const grad = ctx.createRadialGradient(32,40,2,32,32,30);
    grad.addColorStop(0,'rgba(255,255,220,1)');
    grad.addColorStop(0.4,'rgba(255,170,60,0.9)');
    grad.addColorStop(1,'rgba(255,60,20,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,64,64);
    return new THREE.CanvasTexture(c);
  }

  // The temple is now fully enclosed (every room including the entrance
  // has a ceiling - see _buildSkylight()), so a distant outdoor sky
  // dome/mountains/clouds would never actually be visible during
  // gameplay. Removed entirely rather than left running unseen - that's
  // real GPU/draw-call cost for zero visual benefit. A dark warm stone
  // clear color plus the cheap indoor dust motes are all that's left.
  _buildSkyAndHorizon(){
    this.scene.background = new THREE.Color(0x241b10);

    const dustCount = this.isMobile ? 20 : 40;
    const dustGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(dustCount*3);
    this._dustVelocities = [];
    const cx = 18, cz = 18; // hall center - matches the new compact arena
    for(let i=0;i<dustCount;i++){
      positions[i*3] = cx + (Math.random()-0.5)*22;
      positions[i*3+1] = Math.random()*3 + 0.5;
      positions[i*3+2] = cz + (Math.random()-0.5)*22;
      this._dustVelocities.push((Math.random()-0.5)*0.08);
    }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(positions,3));
    const dustMat = new THREE.PointsMaterial({ color:0xffe9b0, size:0.05, transparent:true, opacity:0.4, depthWrite:false, blending:THREE.AdditiveBlending });
    this.dustPoints = new THREE.Points(dustGeo, dustMat);
    this.scene.add(this.dustPoints);
  }

  _updateSky(dt){
    if(this.dustPoints){
      const pos = this.dustPoints.geometry.attributes.position;
      const t = performance.now()*0.0005;
      for(let i=0;i<pos.count;i++){
        pos.array[i*3+1] += Math.sin(t+i)*0.0006 + 0.0004;
        pos.array[i*3] += this._dustVelocities[i]*dt;
        if(pos.array[i*3+1] > 9) pos.array[i*3+1] = 0.5;
      }
      pos.needsUpdate = true;
    }
    if(this.level && this.level.flags){
      const t = performance.now()*0.004;
      this.level.flags.forEach((flag,i)=>{ flag.rotation.y = Math.sin(t+i)*0.35; });
    }
  }


  setGraphicsQuality(mode){
    let quality = mode;
    if(mode === 'auto') quality = this.isMobile ? 'low' : (navigator.hardwareConcurrency > 4 ? 'high' : 'medium');
    this.quality = quality;
    // Shadows are the single most expensive thing this renderer does -
    // only the top quality tier gets ONE shadow-casting light. Medium/
    // low/mobile skip dynamic shadows entirely and rely on the strong
    // ambient/hemisphere/sun fill light for visibility instead.
    const shadowsOn = quality === 'high';
    this.renderer.shadowMap.enabled = shadowsOn;
    this.flickerLights && this.flickerLights.forEach((l,i)=>{
      l.castShadow = shadowsOn && i === 0;
      if(l.castShadow) l.shadow.mapSize.set(512,512);
    });
    this.renderer.setPixelRatio(quality === 'high' ? Math.min(window.devicePixelRatio,1.75) : (quality==='medium' ? 1.15 : 1));
    this.scene && (this.scene.fog.density = quality === 'low' ? 0.022 : 0.014);
  }

  /* ---------------- Input ---------------- */
  _bindInput(){
    const canvas = this.renderer.domElement;

    // Keys the game uses - always preventDefault on these while playing
    // so the browser never scrolls the page, re-clicks a focused button,
    // or otherwise steals the input (this was part of "controls broken").
    const GAME_KEYS = new Set([
      'KeyW','KeyA','KeyS','KeyD','Space','ShiftLeft','ShiftRight',
      'KeyR','Digit1','Digit2','Digit3','Digit4','Escape'
    ]);

    document.addEventListener('keydown', e=>{
      if(this.state !== 'playing'){
        if(e.code === 'Escape' && this.state === 'paused'){ this.resumeGame(); }
        return;
      }
      if(GAME_KEYS.has(e.code)) e.preventDefault();
      switch(e.code){
        case 'KeyW': this.player.moveState.forward = true; break;
        case 'KeyS': this.player.moveState.back = true; break;
        case 'KeyA': this.player.moveState.left = true; break;
        case 'KeyD': this.player.moveState.right = true; break;
        case 'Space': if(!e.repeat) this.player.wantsJump = true; break;
        case 'ShiftLeft': case 'ShiftRight': this.player.isSprinting = true; break;
        case 'KeyR': this.weapons.reload(); break;
        case 'Digit1': this.weapons.switchWeapon('pistol'); break;
        case 'Digit2': this.weapons.switchWeapon('shotgun'); break;
        case 'Digit3': this.weapons.switchWeapon('rifle'); break;
        case 'Digit4': this.weapons.switchWeapon('plasma'); break;
        case 'Escape': this.togglePause(); break;
      }
    }, { passive:false });

    // keyup is NEVER gated on game state - a key released while paused
    // or after a menu steals focus must still clear moveState, or the
    // player keeps walking forever ("stuck key" bug).
    document.addEventListener('keyup', e=>{
      if(GAME_KEYS.has(e.code)) e.preventDefault();
      switch(e.code){
        case 'KeyW': this.player.moveState.forward = false; break;
        case 'KeyS': this.player.moveState.back = false; break;
        case 'KeyA': this.player.moveState.left = false; break;
        case 'KeyD': this.player.moveState.right = false; break;
        case 'ShiftLeft': case 'ShiftRight': this.player.isSprinting = false; break;
      }
    }, { passive:false });

    // If the browser tab/window loses focus (alt-tab, notification,
    // switching apps) we will never receive the matching keyup - reset
    // everything so the player doesn't run off on its own.
    window.addEventListener('blur', ()=>{
      this.player && this.player.resetInputState();
      this.mouseFireHeld = false;
      if(this.state === 'playing') this.pauseGame();
    });

    canvas.addEventListener('click', ()=>{
      // Also drops focus from any menu button so Space/Enter can't
      // "re-click" it while playing.
      if(document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if(this.state === 'playing' && !this.isMobile && document.pointerLockElement !== canvas){
        canvas.requestPointerLock();
      }
    });
    document.addEventListener('mousemove', e=>{
      if(this.state === 'playing' && document.pointerLockElement === canvas){
        this.player.applyMouseLook(e.movementX, e.movementY);
      }
    });
    document.addEventListener('mousedown', e=>{
      if(this.state !== 'playing') return;
      if(e.button === 0) this.mouseFireHeld = true;
      if(e.button === 2) this.player.isAiming = true;
    });
    document.addEventListener('mouseup', e=>{
      if(e.button === 0) this.mouseFireHeld = false;
      if(e.button === 2) this.player.isAiming = false;
    });
    document.addEventListener('contextmenu', e=>{ if(this.state==='playing') e.preventDefault(); });
    document.addEventListener('wheel', e=>{
      if(this.state !== 'playing') return;
      this.weapons.cycleWeapon(e.deltaY > 0 ? 1 : -1);
    }, { passive:true });

    document.addEventListener('pointerlockchange', ()=>{
      if(this.state === 'playing' && document.pointerLockElement !== canvas && !this.isMobile){
        this.pauseGame();
      }
    });
  }

  _onResize(){
    this.camera.aspect = window.innerWidth/window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    UI.checkOrientation();
  }

  /* ---------------- Level lifecycle ---------------- */
  _buildLevel(floorIndex){
    if(this.level){
      this.level.dispose(); // removes every wall/pillar/statue/torch prop/rift/etc.
    }
    this.enemies.forEach(e=> e.mesh && this.scene.remove(e.mesh));
    this.barrels.forEach(b=> b.alive && this.scene.remove(b.mesh));
    this.pickups.forEach(p=> this.scene.remove(p.mesh));

    this.level = new Level(this.scene, floorIndex);
    this.enemies = [];
    this.barrels = [];
    this.pickups = [];

    const diff = DIFFICULTY[this.difficulty];
    const floorMult = 1 + (floorIndex-1)*0.25;

    // Enemy count now genuinely varies by difficulty instead of the
    // multiplier being defined but never read: easy drops the archer,
    // hard/nightmare add reinforcements at safe, verified floor spots.
    let spawnList = this.level.enemySpawnDefs.slice();
    if(diff.enemyCountMult < 1){
      spawnList = spawnList.filter(d => d.type !== 'archer');
    } else if(diff.enemyCountMult > 1.5){
      spawnList = spawnList.concat([
        {gx:5.5,gz:2.6,type:'spearguard'}, {gx:3,gz:6,type:'guardian'}, {gx:5,gz:6,type:'archer'}
      ]);
    } else if(diff.enemyCountMult > 1){
      spawnList = spawnList.concat([{gx:5.5,gz:2.6,type:'spearguard'}]);
    }

    spawnList.forEach(def=>{
      if(def.type === 'boss' && floorIndex < 1) return;
      const pos = this.level._gridToWorld(def.gx, def.gz);
      pos.y = 0;
      const e = new Enemy(def.type, pos, this.scene);
      e.health = e.maxHealth = Math.round(e.def.health * diff.enemyHealthMult * floorMult);
      // Per-instance multipliers (never mutate e.def - it's a shared
      // reference to ENEMY_TYPES[type], reused by every enemy of that
      // type across every floor and difficulty for the whole session).
      e.damageMult = diff.enemyDamageMult;
      e.speedMult = diff.enemySpeedMult;
      e.fireRateMult = diff.enemyFireRateMult;
      e.detectMult = diff.enemyDetectMult;
      e.accuracyMult = diff.accuracyMult;
      e.reactionDelay = diff.reactionDelay;
      this.enemies.push(e);
    });

    this.level.barrelSpots.forEach(([gx,gz])=>{
      this.barrels.push(new Barrel(gx,gz,this.scene));
    });

    this.level.pickupSpots.forEach(spot=>{
      this.pickups.push(new Pickup(spot, this.scene));
    });

    UI.setObjective('CLEAR THE TEMPLE AND ACTIVATE THE RIFT');
  }

  /* ---------------- State transitions ---------------- */
  startNewGame(){
    AudioManager.init(); AudioManager.resume(); AudioManager.playMusic();
    this.difficulty = UI.els['difficulty-select'].value;
    const diff = DIFFICULTY[this.difficulty];
    this.floorIndex = 1;
    this.player.maxHealth = diff.playerHealthStart;
    this.player.health = diff.playerHealthStart;
    this.player.armor = diff.playerArmorStart;
    this.player.score = 0;
    this.player.alive = true;
    this.elapsedRunTime = 0;
    this._buildLevel(this.floorIndex);
    this.player.position.copy(this.level.spawnPoint).setY(this.player.height);
    this.player.yaw = 0; this.player.pitch = 0;
    // Starting ammo reserves scale with difficulty too (Easy: generous,
    // Nightmare: scarce - "less ammunition" was previously just text).
    Object.keys(this.weapons.ammo).forEach(k=>{
      this.weapons.ammo[k].reserve = Math.round(WEAPONS[k].reserveMax * diff.ammoMult);
    });
    UI.setDifficultyLabel(this.difficulty);
    this._enterPlaying();
  }

  continueGame(){
    const raw = localStorage.getItem('voidrift_save');
    if(!raw) return this.startNewGame();
    AudioManager.init(); AudioManager.resume(); AudioManager.playMusic();
    const save = JSON.parse(raw);
    this.difficulty = save.difficulty || 'normal';
    const diff = DIFFICULTY[this.difficulty];
    this.player.maxHealth = diff.playerHealthStart;
    this.floorIndex = save.floorIndex || 1;
    this._buildLevel(this.floorIndex);
    this.player.position.set(save.pos.x, save.pos.y, save.pos.z);
    this.player.health = save.health; this.player.armor = save.armor; this.player.score = save.score;
    this.player.alive = true;
    Object.keys(save.ammo || {}).forEach(k=>{ if(this.weapons.ammo[k]) this.weapons.ammo[k] = save.ammo[k]; });
    UI.setDifficultyLabel(this.difficulty);
    this._enterPlaying();
  }

  saveCheckpoint(){
    const save = {
      pos: { x:this.player.position.x, y:this.player.position.y, z:this.player.position.z },
      health: this.player.health, armor: this.player.armor, score: this.player.score,
      ammo: this.weapons.ammo, difficulty: this.difficulty, floorIndex: this.floorIndex
    };
    localStorage.setItem('voidrift_save', JSON.stringify(save));
    this.lastCheckpoint = save;
  }

  _enterPlaying(){
    this.state = 'playing';
    this.player.resetInputState();
    this.mouseFireHeld = false;
    UI.showScreen(null);
    UI.showHUDAndMobile();
    UI.checkOrientation();
    const canvas = this.renderer.domElement;
    if(!this.isMobile) canvas.requestPointerLock();
    this.saveCheckpoint();
  }

  togglePause(){
    if(this.state === 'playing') this.pauseGame();
    else if(this.state === 'paused') this.resumeGame();
  }
  pauseGame(){
    if(this.state !== 'playing') return;
    this.state = 'paused';
    this.player.resetInputState();
    this.mouseFireHeld = false;
    UI.showScreen('pause-menu');
    if(document.exitPointerLock) document.exitPointerLock();
  }
  resumeGame(){
    this.state = 'playing';
    UI.showScreen(null);
    if(!this.isMobile) this.renderer.domElement.requestPointerLock();
  }
  quitToMenu(){
    this.state = 'menu';
    this.player.resetInputState();
    this.mouseFireHeld = false;
    UI.showScreen('main-menu');
    UI.hideHUDAndMobile();
    document.getElementById('btn-continue').style.display = localStorage.getItem('voidrift_save') ? 'block' : 'none';
  }

  onPlayerDeath(){
    this.state = 'gameover';
    this.player.resetInputState();
    this.mouseFireHeld = false;
    document.getElementById('gameover-score').textContent = 'SCORE: ' + this.player.score;
    UI.showScreen('gameover-screen');
    if(document.exitPointerLock) document.exitPointerLock();
  }

  respawnAtCheckpoint(){
    const cp = this.lastCheckpoint;
    this.player.health = this.player.maxHealth * 0.6;
    this.player.armor = cp ? cp.armor : 25;
    this.player.alive = true;
    if(cp) this.player.position.set(cp.pos.x, cp.pos.y, cp.pos.z);
    else this.player.position.copy(this.level.spawnPoint).setY(this.player.height);
    this._enterPlaying();
  }

  onEnemyKilled(enemy){
    unlockAchievement('first_blood');
    if(enemy.def.isBoss) unlockAchievement('king_slayer');
    UI.showToast(enemy.def.label + ' ELIMINATED  +' + enemy.def.xp);
  }

  activatePowerup(type){
    this.powerups[type] = performance.now() + 15000;
  }

  triggerElevator(){
    if(this._elevatorCooldown) return;
    this._elevatorCooldown = true;
    this.player.resetInputState();
    this.mouseFireHeld = false;
    unlockAchievement('descend');
    const isFinal = this.floorIndex >= MAX_LEVELS;
    UI.showToast(isFinal ? 'SEALING THE RIFT...' : 'DESCENDING DEEPER INTO THE RUINS - LEVEL ' + (this.floorIndex+1) + '...');
    document.getElementById('complete-score').textContent = 'SCORE: ' + this.player.score;
    UI.setLevelCompleteTitle(isFinal ? 'THE RIFT IS SEALED' : 'RUINS CLEARED');
    document.getElementById('btn-next-level').textContent = isFinal ? 'CLAIM VICTORY' : 'DESCEND FURTHER';
    UI.showScreen('levelcomplete-screen');
    this.state = 'levelcomplete';
    if(document.exitPointerLock) document.exitPointerLock();
  }

  nextLevel(){
    if(this.floorIndex >= MAX_LEVELS){
      this.state = 'victory';
      this._elevatorCooldown = false;
      UI.showScreen('main-menu');
      UI.showToast('VOIDRIFT CONQUERED - FINAL SCORE ' + this.player.score);
      localStorage.removeItem('voidrift_save');
      document.getElementById('btn-continue').style.display = 'none';
      return;
    }
    this.floorIndex++;
    this._elevatorCooldown = false;
    this._buildLevel(this.floorIndex);
    this.player.position.copy(this.level.spawnPoint).setY(this.player.height);
    this._enterPlaying();
  }

  /* ---------------- Particles / Explosions ---------------- */
  // Pre-allocated pool: explosions used to create brand-new geometry
  // and materials for every particle on every blast (and barrels can
  // chain-react), which caused real allocation hitching. Now every
  // particle/light is built once and reused.
  _initExplosionPool(){
    const geo = new THREE.SphereGeometry(0.12,4,4);
    const baseA = new THREE.MeshBasicMaterial({ color:0xff6622, transparent:true });
    const baseB = new THREE.MeshBasicMaterial({ color:0xffaa33, transparent:true });
    this.explosionParticlePool = [];
    for(let i=0;i<60;i++){
      const p = new THREE.Mesh(geo, (i%2===0 ? baseA : baseB).clone());
      p.visible = false;
      p.userData.vel = new THREE.Vector3();
      this.scene.add(p);
      this.explosionParticlePool.push(p);
    }
    this._explosionParticleCursor = 0;
    this.explosionLightPool = [];
    for(let i=0;i<6;i++){
      const l = new THREE.PointLight(0xff6622, 0, 10);
      this.scene.add(l);
      this.explosionLightPool.push(l);
    }
    this._explosionLightCursor = 0;
    this.explosionFX = [];
  }

  spawnExplosion(position, radius){
    const count = this.quality === 'low' ? 8 : 18;
    const particles = [];
    for(let i=0;i<count;i++){
      const p = this.explosionParticlePool[this._explosionParticleCursor];
      this._explosionParticleCursor = (this._explosionParticleCursor+1) % this.explosionParticlePool.length;
      p.position.copy(position);
      p.scale.set(1,1,1);
      p.visible = true;
      p.material.opacity = 1;
      const dir = new THREE.Vector3((Math.random()-0.5),(Math.random()*0.8+0.2),(Math.random()-0.5)).normalize();
      p.userData.vel.copy(dir.multiplyScalar(3+Math.random()*4));
      p.userData.life = 0.6 + Math.random()*0.4;
      particles.push(p);
    }
    const light = this.explosionLightPool[this._explosionLightCursor];
    this._explosionLightCursor = (this._explosionLightCursor+1) % this.explosionLightPool.length;
    light.position.copy(position);
    light.intensity = 6;
    light.distance = radius*2.5;
    this.explosionFX.push({ particles, light, age:0 });
  }

  _updateExplosions(dt){
    if(!this.explosionFX) return;
    for(let i=this.explosionFX.length-1;i>=0;i--){
      const fx = this.explosionFX[i];
      fx.age += dt;
      fx.light.intensity = Math.max(0, 6 - fx.age*10);
      fx.particles.forEach(p=>{
        p.position.addScaledVector(p.userData.vel, dt);
        p.userData.vel.y -= dt*4;
        p.userData.life -= dt;
        p.material.opacity = Math.max(0, p.userData.life);
        p.scale.multiplyScalar(1 - dt*0.5);
      });
      if(fx.age > 0.8){
        fx.particles.forEach(p=> p.visible = false);
        this.explosionFX.splice(i,1);
      }
    }
  }

  /* ---------------- Combat ---------------- */
  _handleFiring(now){
    const wantsFire = this.isMobile ? this.mobileInput.fire : this.mouseFireHeld;
    if(!wantsFire) return;
    const collidables = [ ...this.level.staticColliders ];
    this.enemies.forEach(e=>{ if(e.alive) collidables.push(...e.hittableParts); });
    this.barrels.forEach(b=>{ if(b.alive) collidables.push(b.mesh); });

    const fired = this.weapons.fire(now, collidables, (hit, damage, def)=>{
      const enemyRef = hit.object.userData.enemyRef;
      const barrelRef = hit.object.userData.barrelRef;
      let dmg = damage;
      if(this.powerups.damage && performance.now() < this.powerups.damage) dmg *= 1.8;
      if(enemyRef){
        const headshot = hit.object.userData.isHeadshot;
        enemyRef.takeDamage(headshot ? dmg*1.8 : dmg, this);
        UI.showHitMarker();
      } else if(barrelRef){
        barrelRef.takeDamage(dmg, this);
      }
    });
    if(fired){
      this.weaponsFiredTypes.add(this.weapons.current);
      if(this.weaponsFiredTypes.size >= 4) unlockAchievement('arsenal');
    }
    if(!fired && this.weapons.def && this.weapons.ammo[this.weapons.current].mag <= 0){
      this.weapons.reload();
    }
  }

  /* ---------------- Main loop ---------------- */
  _loop(){
    requestAnimationFrame(()=>this._loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);

    if(this.state === 'playing'){
      this.elapsedRunTime += dt;
      if(this.elapsedRunTime > 300) unlockAchievement('survivor');

      if(this.isMobile && this.mobileInput){
        this.player.mobileJoystick.x = this.mobileInput.joyX;
        this.player.mobileJoystick.y = this.mobileInput.joyY;
        this.player.isSprinting = this.mobileInput.sprint;
        this.player.isAiming = this.mobileInput.aim;
        this.player.wantsJump = this.mobileInput.jump;
      }

      this.player.update(dt, this.level);
      this.weapons.update(dt);
      this.weapons.setAiming(this.player.isAiming, dt);
      this.weapons.setSprinting(this.player.isSprinting && !this.player.isAiming, dt);
      this._handleFiring(performance.now());

      this.enemies.forEach(e=> e.update(dt, this.player, this.level, this));
      this.enemies = this.enemies.filter(e=> !e._removed);

      this.pickups.forEach(p=>{
        p.update(dt);
        if(!p.collected && p.mesh.position.distanceTo(this.player.position) < 1.2) p.apply(this.player, this);
      });

      this._updateExplosions(dt);
      this._updateSky(dt);
      this._updateFlicker();
      this._updateRift(dt);

      // secret room discovery
      if(!this.level.secretZone.discovered && this.player.position.distanceTo(this.level.secretZone.center) < this.level.secretZone.radius){
        this.level.secretZone.discovered = true;
        UI.showToast('UNDERGROUND RIFT CHAMBER DISCOVERED');
      }

      // elevator trigger
      if(!this._elevatorCooldown && this.player.position.distanceTo(this.level.elevatorZone.center) < this.level.elevatorZone.radius){
        this.triggerElevator();
      }

      UI.updateHUD(this.player, this.weapons);
      this._minimapTimer = (this._minimapTimer||0) + dt;
      if(this._minimapTimer > 0.05){ // ~20fps is plenty smooth for a minimap
        this._minimapTimer = 0;
        UI.drawMinimap(this.player, this.enemies, this.level);
      }

      this._fpsAccum = (this._fpsAccum||0) + dt;
      this._fpsFrames = (this._fpsFrames||0) + 1;
      if(this._fpsAccum > 0.4){
        UI.updateFPS(this._fpsFrames/this._fpsAccum);
        this._fpsAccum = 0; this._fpsFrames = 0;
      }

      if(this._checkpointTimer === undefined) this._checkpointTimer = 0;
      this._checkpointTimer += dt;
      if(this._checkpointTimer > 8){ this._checkpointTimer = 0; this.saveCheckpoint(); }
    }

    if(this.scene && this.camera) this.renderer.render(this.scene, this.camera);
  }

  _updateFlicker(){
    if(!this.flickerLights) return;
    const t = performance.now()*0.001;
    this.flickerLights.forEach((l,i)=>{
      l.intensity = 1.0 + Math.sin(t*6 + i*3.1)*0.15 + (Math.random()<0.02 ? -0.6 : 0);
      if(l.intensity < 0.2) l.intensity = 0.2;
      const flame = this.torchFlames && this.torchFlames[i];
      if(flame){
        const s = 0.6 + Math.sin(t*10+i)*0.06 + (Math.random()-0.5)*0.03;
        flame.scale.set(s, s*1.5, 1);
      }
    });
  }

  _updateRift(dt){
    const rift = this.level && this.level.riftGroup;
    if(!rift) return;
    rift.rotation.y += dt*0.6;
    rift.children.forEach((ring,i)=> ring.rotation.z += dt*(i%2===0 ? 0.9 : -1.2));
  }
}

/* ================= BOOT ================= */
window.addEventListener('DOMContentLoaded', ()=>{
  const game = new Game();
  window.__VOIDRIFT__ = game;
  game.init();
});
