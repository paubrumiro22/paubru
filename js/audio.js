'use strict';
// Procedural sound effects with WebAudio: materials (dig/break/place/step), player, mobs,
// weapons, explosions and a little ambience. Nothing is loaded from files.

const Sound = {
  ctx: null, master: null, volume: 0.7, noiseBuf: null, listener: { pos: [0, 0, 0], yaw: 0 }, last: new Map(),

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -12; comp.ratio.value = 6;
      comp.connect(this.ctx.destination);
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(comp);
      const len = this.ctx.sampleRate * 2;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },

  setVolume(v) { this.volume = v; if (this.master) this.master.gain.value = v; },
  setListener(pos, yaw) { this.listener.pos = pos; this.listener.yaw = yaw; },

  // pos = null plays at the listener.
  play(name, pos, vol = 1, pitch = 1) {
    if (!this.ctx || this.ctx.state !== 'running' || this.volume <= 0) return;
    const now = this.ctx.currentTime;
    const lastT = this.last.get(name) || 0;
    if (now - lastT < 0.03) return;
    this.last.set(name, now);
    let gain = vol, pan = 0;
    if (pos) {
      const L = this.listener.pos;
      const dx = pos[0] - L[0], dy = pos[1] - L[1], dz = pos[2] - L[2];
      const dist = Math.hypot(dx, dy, dz);
      if (dist > 32) return;
      gain *= Math.max(0, 1 - dist / 32) ** 1.6;
      const ang = Math.atan2(dx, dz) - (this.listener.yaw + Math.PI);
      pan = clamp(-Math.sin(ang), -1, 1) * Math.min(1, dist / 2) * 0.8;
    }
    if (gain < 0.01) return;
    const out = this.ctx.createGain();
    out.gain.value = gain;
    let node = out;
    if (this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = pan;
      out.connect(p);
      node = p;
    }
    node.connect(this.master);
    const fn = SYNTH[name] || (name.includes('_') ? materialSynth(name) : null);
    if (fn) { try { fn(this.ctx, out, now, pitch); } catch (e) { /* ignore audio errors */ } }
    setTimeout(() => { try { node.disconnect(); out.disconnect(); } catch (e) { /* ignore */ } }, 4000);
  },

  noise(ctx, dest, t, dur, o = {}) {
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = o.rate || 1;
    let n = src;
    if (o.type) {
      const f = ctx.createBiquadFilter();
      f.type = o.type; f.frequency.value = o.freq || 1000; f.Q.value = o.q || 1;
      if (o.freqEnd) f.frequency.exponentialRampToValueAtTime(o.freqEnd, t + dur);
      n.connect(f); n = f;
    }
    const g = ctx.createGain();
    env(g.gain, t, o.attack || 0.004, dur, o.gain || 0.5);
    n.connect(g); g.connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  },

  tone(ctx, dest, t, dur, o = {}) {
    const osc = ctx.createOscillator();
    osc.type = o.wave || 'sine';
    osc.frequency.setValueAtTime(o.f0 || 440, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + dur);
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = o.vib[1];
      l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + dur + 0.05);
    }
    let n = osc;
    if (o.filter) {
      const f = ctx.createBiquadFilter();
      f.type = o.filter[0]; f.frequency.value = o.filter[1]; f.Q.value = o.filter[2] || 1;
      n.connect(f); n = f;
    }
    const g = ctx.createGain();
    env(g.gain, t, o.attack || 0.005, dur, o.gain || 0.3);
    if (o.am) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.am; lg.gain.value = (o.gain || 0.3) * 0.5;
      l.connect(lg); lg.connect(g.gain); l.start(t); l.stop(t + dur + 0.05);
    }
    n.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + 0.05);
  },
};

function env(param, t, attack, dur, peak) {
  param.setValueAtTime(0.0001, t);
  param.exponentialRampToValueAtTime(peak, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + dur);
}

// Material sounds: names like "break_0", "place_3", "dig_1", "step_2" (index = SND value).
const MAT_PARAMS = [
  { type: 'bandpass', freq: 1300, q: 1.1, tone: 90 },   // stone
  { type: 'bandpass', freq: 520, q: 2.5, tone: 170 },   // wood
  { type: 'highpass', freq: 2200, q: 0.7 },             // grass
  { type: 'lowpass', freq: 2600, q: 0.5 },              // sand
  { type: 'bandpass', freq: 1700, q: 0.8, crunch: true }, // gravel
  { type: 'highpass', freq: 3000, q: 0.7, glass: true },  // glass
  { type: 'lowpass', freq: 900, q: 0.6 },               // wool
  { type: 'bandpass', freq: 3200, q: 1.4 },             // snow
  { type: 'bandpass', freq: 2200, q: 3, metal: true },  // metal
  { type: 'bandpass', freq: 800, q: 0.9, crunch: true },  // dirt
];
function materialSynth(name) {
  const [kind, idx] = name.split('_');
  const m = MAT_PARAMS[Number(idx)];
  if (!m || !['break', 'place', 'dig', 'step'].includes(kind)) return null;
  return (ctx, out, t, pitch) => {
    const dur = kind === 'break' ? 0.28 : kind === 'place' ? 0.16 : kind === 'dig' ? 0.09 : 0.1;
    const gain = kind === 'step' ? 0.16 : kind === 'dig' ? 0.3 : 0.5;
    const bursts = m.crunch ? (kind === 'break' ? 4 : 2) : 1;
    for (let i = 0; i < bursts; i++) {
      Sound.noise(ctx, out, t + i * 0.035, dur / bursts + 0.03, { type: m.type, freq: m.freq * pitch * (0.85 + Math.random() * 0.3), q: m.q, gain: gain * (i ? 0.7 : 1) });
    }
    if (m.tone && kind !== 'step') Sound.tone(ctx, out, t, dur * 0.8, { f0: m.tone * pitch, f1: m.tone * 0.6 * pitch, gain: gain * 0.5, wave: 'triangle' });
    if (m.glass && kind === 'break') for (let i = 0; i < 4; i++) Sound.tone(ctx, out, t + Math.random() * 0.08, 0.35, { f0: 2400 + Math.random() * 2600, gain: 0.12 });
    if (m.metal && kind !== 'step') [1, 1.51, 2.3].forEach((r) => Sound.tone(ctx, out, t, 0.35, { f0: 700 * r * pitch, gain: 0.08 }));
  };
}

function grunt(ctx, out, t, f, dur, n, gain = 0.3) {
  for (let i = 0; i < n; i++) Sound.tone(ctx, out, t + i * dur * 1.3, dur, { wave: 'sawtooth', f0: f * (1 + Math.random() * 0.1), f1: f * 0.8, am: 28, filter: ['bandpass', 700, 1.5], gain });
}

const SYNTH = {
  hurt(ctx, o, t, p) {
    Sound.tone(ctx, o, t, 0.2, { wave: 'sawtooth', f0: 260 * p, f1: 130 * p, filter: ['lowpass', 1100, 1], gain: 0.35 });
    Sound.noise(ctx, o, t, 0.08, { type: 'bandpass', freq: 1500, gain: 0.25 });
  },
  death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.6, { wave: 'sawtooth', f0: 220 * p, f1: 70 * p, filter: ['lowpass', 900, 1], gain: 0.4 }); },
  eat(ctx, o, t, p) { for (let i = 0; i < 2; i++) Sound.noise(ctx, o, t + i * 0.06, 0.06, { type: 'bandpass', freq: 1800 * p * (0.8 + Math.random() * 0.4), q: 2, gain: 0.35 }); },
  burp(ctx, o, t) { Sound.tone(ctx, o, t, 0.35, { wave: 'sawtooth', f0: 110, f1: 80, vib: [18, 12], filter: ['lowpass', 500, 1], gain: 0.35 }); },
  pop(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.08, { f0: 500 * p, f1: 1100 * p, gain: 0.3 }); },
  click(ctx, o, t) { Sound.tone(ctx, o, t, 0.05, { f0: 1500, f1: 900, gain: 0.15, wave: 'triangle' }); },
  land(ctx, o, t) { Sound.noise(ctx, o, t, 0.15, { type: 'lowpass', freq: 500, gain: 0.5 }); },
  splash(ctx, o, t) { Sound.noise(ctx, o, t, 0.6, { type: 'bandpass', freq: 1400, freqEnd: 400, q: 0.6, gain: 0.45 }); },
  swim(ctx, o, t) { Sound.noise(ctx, o, t, 0.3, { type: 'lowpass', freq: 900, gain: 0.12 }); },
  fizz(ctx, o, t) { Sound.noise(ctx, o, t, 0.4, { type: 'highpass', freq: 3000, gain: 0.3 }); },
  bow(ctx, o, t, p) {
    Sound.tone(ctx, o, t, 0.25, { wave: 'triangle', f0: 320 * p, f1: 140 * p, gain: 0.3 });
    Sound.noise(ctx, o, t, 0.12, { type: 'highpass', freq: 2500, gain: 0.2 });
  },
  arrow_hit(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.12, { f0: 180 * p, f1: 70, gain: 0.35, wave: 'triangle' }); Sound.noise(ctx, o, t, 0.05, { type: 'bandpass', freq: 2000, gain: 0.2 }); },
  hit(ctx, o, t, p) { Sound.noise(ctx, o, t, 0.1, { type: 'lowpass', freq: 900 * p, gain: 0.45 }); Sound.tone(ctx, o, t, 0.1, { f0: 140, f1: 60, gain: 0.3 }); },
  crit(ctx, o, t) { Sound.noise(ctx, o, t, 0.12, { type: 'highpass', freq: 2000, gain: 0.35 }); Sound.tone(ctx, o, t, 0.12, { f0: 900, f1: 300, gain: 0.15, wave: 'square' }); },
  swing(ctx, o, t) { Sound.noise(ctx, o, t, 0.12, { type: 'bandpass', freq: 900, freqEnd: 2400, q: 0.8, gain: 0.08 }); },
  tool_break(ctx, o, t) { [1, 1.34, 1.9].forEach((r) => Sound.tone(ctx, o, t, 0.4, { f0: 900 * r, f1: 500 * r, gain: 0.12, wave: 'square', filter: ['lowpass', 3000, 1] })); },
  explode(ctx, o, t) {
    Sound.noise(ctx, o, t, 2.2, { type: 'lowpass', freq: 1400, freqEnd: 120, gain: 1.0, attack: 0.005 });
    Sound.tone(ctx, o, t, 1.4, { f0: 70, f1: 30, gain: 0.8 });
  },
  fuse(ctx, o, t) { Sound.noise(ctx, o, t, 1.4, { type: 'highpass', freq: 2500, freqEnd: 6000, gain: 0.35, attack: 0.2 }); },
  chest_open(ctx, o, t) { Sound.tone(ctx, o, t, 0.35, { wave: 'sawtooth', f0: 90, f1: 140, filter: ['bandpass', 500, 4], gain: 0.25 }); },
  chest_close(ctx, o, t) { Sound.tone(ctx, o, t, 0.2, { wave: 'sawtooth', f0: 120, f1: 70, filter: ['bandpass', 400, 4], gain: 0.25 }); Sound.noise(ctx, o, t + 0.15, 0.08, { type: 'lowpass', freq: 600, gain: 0.4 }); },
  ignite(ctx, o, t) { Sound.noise(ctx, o, t, 0.25, { type: 'highpass', freq: 1800, gain: 0.35 }); },
  bucket(ctx, o, t) { Sound.noise(ctx, o, t, 0.4, { type: 'bandpass', freq: 900, freqEnd: 300, q: 1, gain: 0.35 }); },
  cave(ctx, o, t) {
    const f = 80 + Math.random() * 60;
    Sound.tone(ctx, o, t, 4, { f0: f, f1: f * 0.7, vib: [0.3, 4], gain: 0.12, attack: 1.2 });
    Sound.tone(ctx, o, t + 0.5, 3.5, { f0: f * 1.5, f1: f * 1.2, vib: [0.4, 3], gain: 0.06, attack: 1.2 });
  },
  sleep(ctx, o, t) { [392, 494, 587].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.25, 1.2, { f0: f, gain: 0.12 })); },
  pig_say(ctx, o, t, p) { grunt(ctx, o, t, 190 * p, 0.12, 2); },
  pig_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.25, { wave: 'sawtooth', f0: 520 * p, f1: 380 * p, filter: ['bandpass', 1200, 2], gain: 0.35 }); },
  pig_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.5, { wave: 'sawtooth', f0: 480 * p, f1: 200 * p, filter: ['bandpass', 1000, 2], gain: 0.35 }); },
  cow_say(ctx, o, t, p) { Sound.tone(ctx, o, t, 1.1, { wave: 'sawtooth', f0: 118 * p, f1: 96 * p, vib: [5, 3], filter: ['bandpass', 520, 2], gain: 0.4, attack: 0.08 }); },
  cow_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.4, { wave: 'sawtooth', f0: 150 * p, f1: 110 * p, filter: ['bandpass', 600, 2], gain: 0.4 }); },
  cow_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.8, { wave: 'sawtooth', f0: 130 * p, f1: 60 * p, filter: ['bandpass', 500, 2], gain: 0.4 }); },
  sheep_say(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.7, { wave: 'sawtooth', f0: 290 * p, f1: 270 * p, am: 13, filter: ['bandpass', 1300, 2], gain: 0.3, attack: 0.04 }); },
  sheep_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.3, { wave: 'sawtooth', f0: 360 * p, f1: 300 * p, am: 16, filter: ['bandpass', 1400, 2], gain: 0.35 }); },
  sheep_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.6, { wave: 'sawtooth', f0: 300 * p, f1: 160 * p, am: 12, filter: ['bandpass', 1200, 2], gain: 0.35 }); },
  chicken_say(ctx, o, t, p) { for (let i = 0; i < 3; i++) Sound.tone(ctx, o, t + i * 0.09, 0.06, { wave: 'square', f0: (1000 + Math.random() * 300) * p, f1: 800 * p, filter: ['bandpass', 1500, 2], gain: 0.12 }); },
  chicken_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.15, { wave: 'square', f0: 1400 * p, f1: 900 * p, filter: ['bandpass', 1600, 2], gain: 0.18 }); },
  chicken_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.3, { wave: 'square', f0: 1300 * p, f1: 500 * p, filter: ['bandpass', 1400, 2], gain: 0.18 }); },
  // villagers: a nasal "hmm" that rises or falls
  villager_say(ctx, o, t, p) {
    const up = Math.random() < 0.5;
    Sound.tone(ctx, o, t, 0.42, { wave: 'sawtooth', f0: (up ? 150 : 200) * p, f1: (up ? 205 : 140) * p, vib: [6, 4], filter: ['bandpass', 760, 3], gain: 0.32, attack: 0.05 });
  },
  villager_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.3, { wave: 'sawtooth', f0: 260 * p, f1: 180 * p, filter: ['bandpass', 900, 3], gain: 0.35 }); },
  villager_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.7, { wave: 'sawtooth', f0: 220 * p, f1: 90 * p, filter: ['bandpass', 700, 3], gain: 0.35 }); },
  villager_yes(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.18, { wave: 'sawtooth', f0: 170 * p, f1: 230 * p, filter: ['bandpass', 800, 3], gain: 0.3 }); Sound.tone(ctx, o, t + 0.2, 0.2, { wave: 'sawtooth', f0: 230 * p, f1: 260 * p, filter: ['bandpass', 800, 3], gain: 0.3 }); },
  villager_no(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.4, { wave: 'sawtooth', f0: 200 * p, f1: 120 * p, filter: ['bandpass', 700, 3], gain: 0.3 }); },
  zombie_say(ctx, o, t, p) {
    Sound.tone(ctx, o, t, 1.3, { wave: 'sawtooth', f0: 95 * p, f1: 70 * p, vib: [3, 6], filter: ['lowpass', 520, 3], gain: 0.4, attack: 0.15 });
    Sound.noise(ctx, o, t, 1.2, { type: 'bandpass', freq: 400, q: 2, gain: 0.12, attack: 0.2 });
  },
  zombie_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.35, { wave: 'sawtooth', f0: 140 * p, f1: 90 * p, filter: ['lowpass', 700, 2], gain: 0.45 }); },
  zombie_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 1.0, { wave: 'sawtooth', f0: 120 * p, f1: 50 * p, filter: ['lowpass', 600, 2], gain: 0.45 }); },
  skeleton_say(ctx, o, t) { for (let i = 0; i < 7; i++) Sound.noise(ctx, o, t + i * 0.05 + Math.random() * 0.02, 0.025, { type: 'highpass', freq: 2500, gain: 0.25 }); },
  skeleton_hurt(ctx, o, t) { for (let i = 0; i < 4; i++) Sound.noise(ctx, o, t + i * 0.04, 0.03, { type: 'bandpass', freq: 1800, gain: 0.4 }); },
  skeleton_death(ctx, o, t) { for (let i = 0; i < 12; i++) Sound.noise(ctx, o, t + i * 0.06 + Math.random() * 0.03, 0.03, { type: 'bandpass', freq: 1200 + Math.random() * 1500, gain: 0.35 }); },
  spider_say(ctx, o, t) { Sound.noise(ctx, o, t, 0.5, { type: 'bandpass', freq: 3200, q: 3, gain: 0.25 }); },
  spider_hurt(ctx, o, t) { Sound.noise(ctx, o, t, 0.25, { type: 'bandpass', freq: 2400, q: 4, gain: 0.35 }); },
  spider_death(ctx, o, t) { Sound.noise(ctx, o, t, 0.7, { type: 'bandpass', freq: 2000, freqEnd: 600, q: 3, gain: 0.35 }); },
  fusecap_say(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.2, { f0: 480 * p, f1: 720 * p, gain: 0.15 }); },
  fusecap_hurt(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.2, { f0: 700 * p, f1: 420 * p, gain: 0.2, wave: 'triangle' }); },
  fusecap_death(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.5, { f0: 600 * p, f1: 180 * p, gain: 0.2, wave: 'triangle' }); },
  portal(ctx, o, t) {
    Sound.noise(ctx, o, t, 1.3, { type: 'bandpass', freq: 300, freqEnd: 3800, q: 1.2, gain: 0.4, attack: 0.25 });
    [523, 659, 784, 1047].forEach((f, i) => Sound.tone(ctx, o, t + 0.1 + i * 0.09, 0.9, { f0: f, gain: 0.07, vib: [6, 4] }));
  },
  door_open(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.28, { wave: 'sawtooth', f0: 150 * p, f1: 210 * p, filter: ['bandpass', 650, 5], gain: 0.2 }); Sound.noise(ctx, o, t, 0.1, { type: 'bandpass', freq: 700, gain: 0.25 }); },
  door_close(ctx, o, t, p) { Sound.noise(ctx, o, t + 0.05, 0.12, { type: 'lowpass', freq: 700 * p, gain: 0.55 }); Sound.tone(ctx, o, t + 0.05, 0.12, { f0: 120, f1: 70, gain: 0.3, wave: 'triangle' }); },
  gun(ctx, o, t) {
    Sound.noise(ctx, o, t, 0.07, { type: 'bandpass', freq: 1400, q: 0.8, gain: 0.35 });
    Sound.tone(ctx, o, t, 0.06, { wave: 'square', f0: 140, f1: 70, gain: 0.12, filter: ['lowpass', 900, 1] });
  },
  missile(ctx, o, t) {
    Sound.noise(ctx, o, t, 1.6, { type: 'bandpass', freq: 900, freqEnd: 2400, q: 0.7, gain: 0.55, attack: 0.03 });
    Sound.tone(ctx, o, t, 0.25, { wave: 'sawtooth', f0: 90, f1: 40, gain: 0.3, filter: ['lowpass', 500, 1] });
  },
  beep(ctx, o, t, p) { Sound.tone(ctx, o, t, 0.09, { wave: 'square', f0: 1320 * p, gain: 0.06, filter: ['lowpass', 3000, 1] }); },
  canopy(ctx, o, t) { Sound.noise(ctx, o, t, 0.5, { type: 'bandpass', freq: 500, freqEnd: 1400, q: 2, gain: 0.25, attack: 0.05 }); Sound.tone(ctx, o, t + 0.4, 0.1, { f0: 300, f1: 180, gain: 0.2 }); },
  thunder(ctx, o, t, p) {
    Sound.noise(ctx, o, t, 0.25, { type: 'lowpass', freq: 2200 * p, gain: 0.9, attack: 0.003 });
    Sound.noise(ctx, o, t + 0.05, 3.2, { type: 'lowpass', freq: 520 * p, freqEnd: 90, gain: 1.0, attack: 0.08, rate: 0.6 });
    Sound.tone(ctx, o, t + 0.05, 2.2, { f0: 55 * p, f1: 32, gain: 0.5, attack: 0.1 });
  },
  // wildlife
  chirp(ctx, o, t, p = 1) {
    const n = 2 + (Math.random() * 4 | 0), base = (2600 + Math.random() * 1600) * p;
    for (let i = 0; i < n; i++) {
      const s = t + i * (0.09 + Math.random() * 0.05);
      Sound.tone(ctx, o, s, 0.07, { f0: base * (1 + Math.random() * 0.3), f1: base * (0.7 + Math.random() * 0.8), gain: 0.05, wave: 'sine' });
    }
  },
  gull(ctx, o, t, p = 1) {
    for (let i = 0; i < 3; i++) Sound.tone(ctx, o, t + i * 0.22, 0.2, { f0: 1500 * p, f1: 900 * p, gain: 0.06, wave: 'sawtooth', filter: ['bandpass', 1700 * p, 3], vib: [30, 60] });
  },
  crow(ctx, o, t, p = 1) {
    for (let i = 0; i < 2; i++) Sound.tone(ctx, o, t + i * 0.3, 0.22, { f0: 620 * p, f1: 480 * p, gain: 0.08, wave: 'sawtooth', filter: ['bandpass', 900, 2], vib: [45, 40] });
  },
  cricket(ctx, o, t, p = 1) {
    for (let i = 0; i < 3; i++) Sound.tone(ctx, o, t + i * 0.18, 0.1, { f0: 4400 * p, gain: 0.025, wave: 'sine', am: 60 });
  },
  buzz(ctx, o, t, p = 1) { Sound.tone(ctx, o, t, 0.8, { f0: 220 * p, f1: 240 * p, gain: 0.05, wave: 'sawtooth', filter: ['lowpass', 900, 1], vib: [9, 8], attack: 0.15 }); },
  chime(ctx, o, t) { [659, 784, 988, 1319].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.07, 0.8, { f0: f, gain: 0.06, wave: 'triangle' })); },
};

// Continuous turbine: a whine that follows the throttle, broadband roar and an afterburner rumble.
const Engine = {
  on: false, nodes: null,
  start() {
    const ctx = Sound.ctx;
    if (this.on || !ctx || ctx.state !== 'running') return;
    this.on = true;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.connect(Sound.master);
    const mk = (type, freq, q) => { const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; return f; };
    const roarSrc = ctx.createBufferSource(); roarSrc.buffer = Sound.noiseBuf; roarSrc.loop = true;
    const roarF = mk('lowpass', 700, 0.7), roarG = ctx.createGain(); roarG.gain.value = 0.5;
    roarSrc.connect(roarF); roarF.connect(roarG); roarG.connect(out);
    const hissSrc = ctx.createBufferSource(); hissSrc.buffer = Sound.noiseBuf; hissSrc.loop = true; hissSrc.playbackRate.value = 1.3;
    const hissF = mk('bandpass', 3500, 1.2), hissG = ctx.createGain(); hissG.gain.value = 0.1;
    hissSrc.connect(hissF); hissF.connect(hissG); hissG.connect(out);
    const whine = ctx.createOscillator(); whine.type = 'sawtooth'; whine.frequency.value = 400;
    const whineF = mk('bandpass', 1800, 6), whineG = ctx.createGain(); whineG.gain.value = 0.05;
    whine.connect(whineF); whineF.connect(whineG); whineG.connect(out);
    const burnSrc = ctx.createBufferSource(); burnSrc.buffer = Sound.noiseBuf; burnSrc.loop = true; burnSrc.playbackRate.value = 0.6;
    const burnF = mk('lowpass', 260, 0.9), burnG = ctx.createGain(); burnG.gain.value = 0.0001;
    burnSrc.connect(burnF); burnF.connect(burnG); burnG.connect(out);
    const t = ctx.currentTime;
    for (const s of [roarSrc, hissSrc, whine, burnSrc]) s.start(t);
    this.nodes = { out, roarF, roarG, hissG, whine, whineF, whineG, burnG, srcs: [roarSrc, hissSrc, whine, burnSrc] };
  },
  update(throttle, burner, speed, dist) {
    if (!this.on) return;
    const n = this.nodes, t = Sound.ctx.currentTime, k = 0.12;
    const near = clamp(1 - dist / 90, 0, 1);
    n.out.gain.setTargetAtTime(0.0001 + (0.25 + 0.55 * throttle) * near, t, k);
    n.roarF.frequency.setTargetAtTime(380 + throttle * 1100 + speed * 6, t, k);
    n.whine.frequency.setTargetAtTime(260 + throttle * 900, t, 0.4);
    n.whineF.frequency.setTargetAtTime(900 + throttle * 2600, t, 0.4);
    n.whineG.gain.setTargetAtTime(0.03 + throttle * 0.05, t, k);
    n.hissG.gain.setTargetAtTime(0.03 + Math.min(1, speed / 70) * 0.12, t, k);
    n.burnG.gain.setTargetAtTime(burner ? 0.9 : 0.0001, t, 0.18);
  },
  stop() {
    if (!this.on) return;
    this.on = false;
    const n = this.nodes, ctx = Sound.ctx;
    n.out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.25);
    setTimeout(() => { try { for (const s of n.srcs) s.stop(); n.out.disconnect(); } catch (e) { /* ignore */ } }, 1500);
    this.nodes = null;
  },
};
