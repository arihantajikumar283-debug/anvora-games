/* ============================================================
   VOIDRIFT - audio.js
   All sound (music, weapon fire, footsteps, enemy growls,
   explosions) is synthesized in real time with the WebAudio
   API. This keeps the game a single self-contained project
   with zero external asset dependencies.
   ============================================================ */

const AudioManager = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  masterGain: null,
  musicNodes: [],
  musicPlaying: false,
  _noiseBuffer: null,

  // Must be called after a user gesture (tap/click) to satisfy
  // browser autoplay policies.
  init(){
    if(this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.4;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.masterGain);

    this._buildNoiseBuffer();
  },

  resume(){
    if(this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  setMusicVolume(v){ if(this.musicGain) this.musicGain.gain.value = v; },
  setSfxVolume(v){ if(this.sfxGain) this.sfxGain.gain.value = v; },

  _buildNoiseBuffer(){
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for(let i=0;i<len;i++) data[i] = Math.random()*2 - 1;
    this._noiseBuffer = buf;
  },

  _noiseSource(){
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer;
    src.loop = true;
    return src;
  },

  /* ---------------- Weapon sounds ---------------- */
  playShot(type){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const out = this.ctx.createGain();
    out.connect(this.sfxGain);

    if(type === 'pistol'){
      const osc = this.ctx.createOscillator();
      osc.type = 'square'; osc.frequency.setValueAtTime(220, t);
      osc.frequency.exponentialRampToValueAtTime(60, t+0.09);
      out.gain.setValueAtTime(0.5, t);
      out.gain.exponentialRampToValueAtTime(0.01, t+0.12);
      osc.connect(out); osc.start(t); osc.stop(t+0.13);
    } else if(type === 'shotgun'){
      const noise = this._noiseSource();
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass'; filt.frequency.setValueAtTime(2200, t);
      filt.frequency.exponentialRampToValueAtTime(200, t+0.25);
      out.gain.setValueAtTime(0.7, t);
      out.gain.exponentialRampToValueAtTime(0.01, t+0.3);
      noise.connect(filt); filt.connect(out); noise.start(t); noise.stop(t+0.3);
    } else if(type === 'rifle'){
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth'; osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(90, t+0.06);
      out.gain.setValueAtTime(0.45, t);
      out.gain.exponentialRampToValueAtTime(0.01, t+0.08);
      osc.connect(out); osc.start(t); osc.stop(t+0.09);
    } else if(type === 'plasma'){
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; osc.frequency.setValueAtTime(900, t);
      osc.frequency.exponentialRampToValueAtTime(140, t+0.18);
      const osc2 = this.ctx.createOscillator();
      osc2.type='sawtooth'; osc2.frequency.setValueAtTime(300,t);
      out.gain.setValueAtTime(0.4, t);
      out.gain.exponentialRampToValueAtTime(0.01, t+0.2);
      osc.connect(out); osc2.connect(out);
      osc.start(t); osc.stop(t+0.2);
      osc2.start(t); osc2.stop(t+0.2);
    }
  },

  playReload(){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    for(let i=0;i<2;i++){
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type='square'; osc.frequency.value = 500 + i*300;
      g.gain.setValueAtTime(0.15, t + i*0.12);
      g.gain.exponentialRampToValueAtTime(0.001, t + i*0.12 + 0.06);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t+i*0.12); osc.stop(t+i*0.12+0.07);
    }
  },

  playFootstep(){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this._noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type='lowpass'; filt.frequency.value = 300 + Math.random()*200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.09);
    noise.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    noise.start(t); noise.stop(t+0.1);
  },

  playEnemyGrowl(type){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type === 'heavy' ? 'sawtooth' : (type==='flyer' ? 'square' : 'triangle');
    const base = type === 'heavy' ? 90 : type === 'flyer' ? 500 : 180;
    osc.frequency.setValueAtTime(base, t);
    osc.frequency.linearRampToValueAtTime(base*0.6, t+0.4);
    g.gain.setValueAtTime(0.25, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.45);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t+0.46);
  },

  playHit(){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type='square'; osc.frequency.setValueAtTime(700,t);
    osc.frequency.exponentialRampToValueAtTime(200, t+0.08);
    g.gain.setValueAtTime(0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.09);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t+0.1);
  },

  playExplosion(){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const noise = this._noiseSource();
    const filt = this.ctx.createBiquadFilter();
    filt.type='lowpass'; filt.frequency.setValueAtTime(1200, t);
    filt.frequency.exponentialRampToValueAtTime(60, t+0.8);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.9);
    noise.connect(filt); filt.connect(g); g.connect(this.sfxGain);
    noise.start(t); noise.stop(t+0.9);
  },

  playPickup(){
    if(!this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type='sine'; osc.frequency.setValueAtTime(500,t);
    osc.frequency.linearRampToValueAtTime(900, t+0.15);
    g.gain.setValueAtTime(0.25,t);
    g.gain.exponentialRampToValueAtTime(0.001, t+0.18);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t+0.2);
  },

  /* ---------------- Ambient music loop ---------------- */
  playMusic(){
    if(!this.ctx || this.musicPlaying) return;
    this.musicPlaying = true;
    const t = this.ctx.currentTime;

    // Deep drone pad
    const drone = this.ctx.createOscillator();
    drone.type='sawtooth'; drone.frequency.value = 55;
    const droneGain = this.ctx.createGain(); droneGain.gain.value = 0.12;
    const droneFilt = this.ctx.createBiquadFilter();
    droneFilt.type='lowpass'; droneFilt.frequency.value = 300;
    drone.connect(droneFilt); droneFilt.connect(droneGain); droneGain.connect(this.musicGain);
    drone.start(t);

    // Slow LFO on filter for movement
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = this.ctx.createGain(); lfoGain.gain.value = 150;
    lfo.connect(lfoGain); lfoGain.connect(droneFilt.frequency);
    lfo.start(t);

    // Sparse pulsing bass hits
    const beatOsc = this.ctx.createOscillator();
    beatOsc.type='square'; beatOsc.frequency.value = 55;
    const beatGain = this.ctx.createGain(); beatGain.gain.value = 0;
    beatOsc.connect(beatGain); beatGain.connect(this.musicGain);
    beatOsc.start(t);

    this._beatInterval = setInterval(()=>{
      if(!this.ctx) return;
      const now = this.ctx.currentTime;
      beatGain.gain.cancelScheduledValues(now);
      beatGain.gain.setValueAtTime(0.18, now);
      beatGain.gain.exponentialRampToValueAtTime(0.001, now+0.3);
    }, 1400);

    this.musicNodes.push(drone, lfo, beatOsc);
  },

  stopMusic(){
    if(!this.musicPlaying) return;
    this.musicNodes.forEach(n=>{ try{ n.stop(); }catch(e){} });
    this.musicNodes = [];
    if(this._beatInterval) clearInterval(this._beatInterval);
    this.musicPlaying = false;
  }
};
