/* ============================================================
   VOIDRIFT - player.js
   Player controller: first-person movement with gravity/jump,
   simple collision against level colliders, health/armor
   systems and combined desktop (pointer-lock + WASD) / mobile
   (joystick + drag-look) input handling.
   ============================================================ */

class Player {
  constructor(camera, game){
    this.camera = camera;
    this.game = game;

    this.height = 1.7;
    this.radius = 0.35;
    this.position = new THREE.Vector3(0, this.height, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;

    this.maxHealth = 100; this.health = 100;
    this.maxArmor = 100; this.armor = 50;

    this.moveState = { forward:false, back:false, left:false, right:false };
    this.isSprinting = false;
    this.isAiming = false;
    this.wantsJump = false;
    this.onGround = true;
    this.walkSpeed = 4.2;
    this.sprintMult = 1.7;
    this.aimMult = 0.55;
    this.jumpPower = 6.2;
    this.gravity = -16;

    this.footstepTimer = 0;
    this.bobPhase = 0;

    this.sensitivity = 0.0022;
    this.invertY = false;

    this.mobileJoystick = { x:0, y:0 };
    this.mobileLookDelta = { x:0, y:0 };

    this.alive = true;
    this.score = 0;
  }

  takeDamage(amount){
    if(!this.alive) return;
    let remaining = amount;
    if(this.armor > 0){
      const absorbed = Math.min(this.armor, remaining*0.66);
      this.armor -= absorbed;
      remaining -= absorbed;
    }
    this.health -= remaining;
    if(this.health <= 0){
      this.health = 0;
      this.alive = false;
      this.game.onPlayerDeath();
    }
    this.game.ui && this.game.ui.flashDamage();
  }

  heal(amount){ this.health = Math.min(this.maxHealth, this.health + amount); }
  addArmor(amount){ this.armor = Math.min(this.maxArmor, this.armor + amount); }

  applyMouseLook(dx, dy){
    this.yaw -= dx * this.sensitivity;
    const dir = this.invertY ? -1 : 1;
    this.pitch -= dy * this.sensitivity * dir;
    this.pitch = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, this.pitch));
  }

  applyTouchLook(dx, dy){
    const touchSens = 0.0028;
    this.yaw -= dx * touchSens;
    const dir = this.invertY ? -1 : 1;
    this.pitch -= dy * touchSens * dir;
    this.pitch = Math.max(-Math.PI/2+0.05, Math.min(Math.PI/2-0.05, this.pitch));
  }

  // Clears all held-input state. MUST be called whenever we leave
  // active gameplay (pause, death, menu, window blur) - otherwise a
  // key held down when focus is lost stays "stuck" forever and the
  // player keeps sliding/sprinting/jumping uncontrollably.
  resetInputState(){
    this.moveState.forward = false;
    this.moveState.back = false;
    this.moveState.left = false;
    this.moveState.right = false;
    this.isSprinting = false;
    this.isAiming = false;
    this.wantsJump = false;
    this.mobileJoystick.x = 0;
    this.mobileJoystick.y = 0;
  }

  // Returns normalized { forward, right } input axes in the range
  // [-1, 1], where forward = +1 means "move toward where the camera
  // is looking" and right = +1 means "strafe to the camera's right".
  getMoveVector(){
    let inForward = 0, inRight = 0;
    if(this.game.isMobile){
      inForward = -this.mobileJoystick.y; // joystick pushed up = forward
      inRight = this.mobileJoystick.x;
    } else {
      if(this.moveState.forward) inForward += 1;
      if(this.moveState.back) inForward -= 1;
      if(this.moveState.right) inRight += 1;
      if(this.moveState.left) inRight -= 1;
    }
    const len = Math.hypot(inForward, inRight);
    const magnitude = Math.min(len, 1);
    if(len > 1){ inForward/=len; inRight/=len; }
    return { forward: inForward, right: inRight, magnitude };
  }

  update(dt, level){
    const mv = this.getMoveVector();
    const speedBase = this.walkSpeed *
      (this.isSprinting && !this.isAiming ? this.sprintMult : 1) *
      (this.isAiming ? this.aimMult : 1);

    // Build the ACTUAL world-space forward/right vectors that match
    // the camera's current yaw (three.js cameras look down -Z by
    // default, so forward on the XZ plane is (-sin(yaw), 0, -cos(yaw))
    // and right is (cos(yaw), 0, -sin(yaw))).
    const sinY = Math.sin(this.yaw), cosY = Math.cos(this.yaw);
    const forward = new THREE.Vector3(-sinY, 0, -cosY);
    const right = new THREE.Vector3(cosY, 0, -sinY);

    const desired = new THREE.Vector3();
    desired.addScaledVector(forward, mv.forward);
    desired.addScaledVector(right, mv.right);
    if(desired.lengthSq() > 0) desired.normalize().multiplyScalar(speedBase * mv.magnitude);

    this.velocity.x = desired.x;
    this.velocity.z = desired.z;

    // Gravity / jump
    if(this.onGround && this.wantsJump){
      this.velocity.y = this.jumpPower;
      this.onGround = false;
      this.wantsJump = false;
    }
    this.velocity.y += this.gravity * dt;

    // Integrate with simple collision resolution against level walls (AABB circle push-out)
    const nextPos = this.position.clone();
    nextPos.x += this.velocity.x * dt;
    nextPos.z += this.velocity.z * dt;
    if(level) level.resolveCollisions(nextPos, this.radius);
    nextPos.y += this.velocity.y * dt;

    // Ground / floor collision (per-room floor height via level query)
    const floorY = level ? level.getFloorHeight(nextPos.x, nextPos.z) : 0;
    if(nextPos.y <= floorY + this.height){
      nextPos.y = floorY + this.height;
      this.velocity.y = 0;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    this.position.copy(nextPos);

    // Head bob
    const moving = mv.magnitude > 0.05 && this.onGround;
    if(moving){
      this.bobPhase += dt * (this.isSprinting ? 14 : 9);
      this.footstepTimer -= dt;
      if(this.footstepTimer <= 0){
        this.footstepTimer = this.isSprinting ? 0.28 : 0.42;
        if(typeof AudioManager !== 'undefined') AudioManager.playFootstep();
      }
    } else {
      this.bobPhase += dt*2;
    }
    const bobY = moving ? Math.sin(this.bobPhase*2)*0.045 : Math.sin(this.bobPhase)*0.01;
    const bobX = moving ? Math.cos(this.bobPhase)*0.03 : 0;

    // Apply to camera
    this.camera.position.set(this.position.x, this.position.y + bobY, this.position.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if(this.game.weapons) this.game.weapons.setBob({x: bobX*0.4, y: bobY*0.6});
  }
}
