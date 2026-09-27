'use strict';
// Generative music, synthesised live like the rest of the sound. The world picks a mood (calm
// day, night, combat, the Nether, the End, the Deep Dark, the Void Wyrm, the Camp Nou) and a
// small composer writes pieces for it bar by bar: a chord progression, a bass line, pads, a
// melody built from a two-bar motif that repeats and varies, arpeggios and drums where they fit.
// Calm moods play a piece of 16-24 bars and then leave some silence, like the game's ambience;
// combat, the boss and the stadium keep going while they last. Moods change with a crossfade at
// the next bar. Its own "Music volume" setting sits under Sound & HUD.

const MIDI = (n) => 440 * Math.pow(2, (n - 69) / 12);
const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10], lydian: [0, 2, 4, 6, 7, 9, 11], penta: [0, 2, 4, 7, 9], whole: [0, 2, 4, 6, 8, 10],
};
// Each mood: key, scale, tempo, chord progressions (scale degrees), which parts play, loudness.
const MOODS = {
  day: { root: 60, scale: 'major', bpm: 76, progs: [[0, 4, 5, 3], [0, 3, 4, 0], [5, 3, 0, 4], [0, 5, 3, 4]], parts: { pad: 0.5, bass: 0.6, piano: 1, arp: 0 }, rest: [25, 60], bars: [16, 24] },
  night: { root: 57, scale: 'dorian', bpm: 62, progs: [[0, 5, 3, 4], [0, 3, 6, 4], [0, 6, 5, 4]], parts: { pad: 0.8, bass: 0.4, piano: 0.8, bell: 0.5 }, rest: [30, 70], bars: [16, 20] },
  combat: { root: 52, scale: 'minor', bpm: 132, progs: [[0, 5, 6, 4], [0, 0, 5, 6], [0, 3, 5, 4]], parts: { pad: 0.35, bass: 1, arp: 1, drums: 1, lead: 0.7 }, rest: null, bars: [8, 8] },
  nether: { root: 45, scale: 'phrygian', bpm: 68, progs: [[0, 1, 0, 6], [0, 5, 1, 0]], parts: { pad: 1, bass: 0.9, bell: 0.35, drums: 0.35 }, rest: [20, 45], bars: [16, 16] },
  end: { root: 62, scale: 'whole', bpm: 56, progs: [[0, 2, 1, 3], [0, 4, 2, 1]], parts: { pad: 0.9, bell: 1, piano: 0.35 }, rest: [25, 50], bars: [12, 16] },
  deep: { root: 40, scale: 'phrygian', bpm: 48, progs: [[0, 0, 1, 0]], parts: { pad: 0.55, heart: 1 }, rest: [30, 60], bars: [8, 12] },
  boss: { root: 50, scale: 'minor', bpm: 144, progs: [[0, 5, 3, 4], [0, 6, 5, 4], [0, 3, 6, 5]], parts: { choir: 0.8, bass: 1, arp: 0.8, drums: 1.2, lead: 1, brass: 0.8 }, rest: null, bars: [8, 8] },
  campnou: { root: 62, scale: 'major', bpm: 112, progs: [[0, 4, 5, 3], [0, 3, 4, 4], [3, 4, 0, 5]], parts: { brass: 1, bass: 0.9, drums: 1, pad: 0.4, lead: 0.9 }, rest: null, bars: [16, 16] },
};
const RHYTHMS = {
  calm: [[2, 1, 1], [1, 1, 2], [1.5, 0.5, 2], [3, 1], [1, 0.5, 0.5, 2], [4]],
  busy: [[0.5, 0.5, 1, 1, 1], [1, 0.5, 0.5, 1, 1], [0.75, 0.75, 0.5, 1, 1], [0.5, 0.5, 0.5, 0.5, 2]],
  march: [[1, 1, 1, 1], [1.5, 0.5, 1, 1], [1, 0.5, 0.5, 2], [2, 1, 1]],
};

const Music = {
  bus: null, wet: null, out: null, mood: null, want: 'day', piece: null, nextBar: 0, restUntil: 0, t: 0,
  holdCombat: 0, fade: 1,

  setup() {
    const S = Sound;
    if (this.bus || !S.ctx) return !!this.bus;
    const ctx = S.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(S.master);
    this.bus = ctx.createGain();
    this.bus.connect(this.out);
    // a soft hall: noise with a long decay as the impulse
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.4;
    this.bus.connect(conv); conv.connect(this.wet); this.wet.connect(this.out);
    return true;
  },

  level() { return clamp(G.settings.music === undefined ? 0.3 : G.settings.music, 0, 1) * 0.28; },   // quiet: it sits under the game

  // ---------------------------------------------------------------- which mood ----
  pickMood(dt) {
    if (!G.started || G.onTitle) return 'day';
    const p = G.player;
    if (typeof Wyrm !== 'undefined' && Wyrm.mob && !Wyrm.mob.removed && Math.hypot(Wyrm.mob.pos[0] - p.pos[0], Wyrm.mob.pos[2] - p.pos[2]) < 200) return 'boss';
    if (G.slot === 'campnou') return 'campnou';
    let fight = false;
    for (const m of Ents.mobs) {
      if (m.dead || !m.def.hostile) continue;
      if (m.ai && m.ai.target === p && Math.hypot(m.pos[0] - p.pos[0], m.pos[2] - p.pos[2]) < 18) { fight = true; break; }
    }
    if (fight) this.holdCombat = 8; else this.holdCombat -= dt;
    if (this.holdCombat > 0 && G.mode === 'survival') return 'combat';
    const dim = typeof dimOf === 'function' ? dimOf(p.pos[0], p.pos[2]) : 0;
    if (dim === DIM_NETHER) return 'nether';
    if (dim === DIM_END) return 'end';
    if (dim === DIM_DEEP) return 'deep';
    return isDaytime() ? 'day' : 'night';
  },

  update(dt) {
    const S = Sound;
    if (!S.ctx || S.ctx.state !== 'running' || !this.setup()) return;
    const ctx = S.ctx, now = ctx.currentTime;
    this.t -= dt;
    if (this.t <= 0) { this.t = 1; this.want = this.pickMood(1); }
    // volume and crossfades
    const target = this.level() * this.fade;
    this.out.gain.setTargetAtTime(target, now, 0.4);
    if (this.want !== this.mood) {
      // fade out, then switch at the next bar
      this.fade = Math.max(0, this.fade - dt / 1.8);
      if (this.fade <= 0.02 || !this.mood) { this.mood = this.want; this.piece = null; this.restUntil = 0; this.nextBar = now + 0.1; this.fade = 0; }
    } else this.fade = Math.min(1, this.fade + dt / 2.5);
    if (this.level() <= 0) return;
    // compose ahead of time
    const M = MOODS[this.mood];
    if (!M) return;
    if (now < this.restUntil) return;
    if (this.nextBar < now) this.nextBar = now + 0.05;
    while (this.nextBar < now + 0.35) {
      if (!this.piece) this.piece = this.compose(M);
      const pc = this.piece;
      this.bar(M, pc, pc.bar, this.nextBar);
      this.nextBar += pc.barDur;
      pc.bar++;
      if (pc.bar >= pc.bars) {
        this.piece = null;
        if (M.rest) { this.restUntil = this.nextBar + rand(M.rest[0], M.rest[1]); break; }
      }
    }
  },

  // A piece: its progression, motifs and length.
  compose(M) {
    const prog = M.progs[Math.floor(Math.random() * M.progs.length)];
    const bars = Math.round(rand(M.bars[0], M.bars[1]) / 4) * 4;
    const style = M.bpm > 120 ? 'busy' : M.parts.brass ? 'march' : 'calm';
    const motif = () => {
      const out = [];
      for (let b = 0; b < 2; b++) {
        const r = RHYTHMS[style][Math.floor(Math.random() * RHYTHMS[style].length)];
        let at = 0;
        for (const d of r) { out.push({ bar: b, at, d, step: Math.floor(rand(-2, 3)), rest: Math.random() < 0.12 && at > 0 }); at += d; }
      }
      return out;
    };
    return { prog, bars, bar: 0, barDur: 240 / M.bpm, motifs: [motif(), motif()], deg: 4, oct: 0 };
  },

  // ---------------------------------------------------------------- one bar ----
  bar(M, pc, n, t) {
    const beat = 60 / M.bpm, sc = SCALES[M.scale], P = M.parts;
    const chordDeg = pc.prog[n % pc.prog.length];
    const note = (deg, oct = 0) => { const L = sc.length; const o = Math.floor(deg / L); return M.root + sc[((deg % L) + L) % L] + 12 * (o + oct); };
    const chord = [note(chordDeg), note(chordDeg + 2), note(chordDeg + 4)];
    const last = n === pc.bars - 1;
    if (P.pad) this.pad(t, chord.map((c) => MIDI(c)), pc.barDur * 1.05, P.pad);
    if (P.choir) this.choir(t, chord.map((c) => MIDI(c)), pc.barDur, P.choir);
    if (P.bass) {
      const b = MIDI(note(chordDeg, -1));
      if (M.bpm > 110) for (let i = 0; i < 8; i++) this.bass(t + i * beat / 2, i % 4 === 3 ? MIDI(note(chordDeg + 4, -1)) : b, beat * 0.45, P.bass);
      else { this.bass(t, b, beat * 2.2, P.bass); if (!last) this.bass(t + beat * 2, i2(b, 1.5), beat * 1.8, P.bass * 0.8); }
    }
    if (P.arp) for (let i = 0; i < 8; i++) this.pluck(t + i * beat / 2, MIDI(chord[[0, 1, 2, 1, 0, 2, 1, 2][i]] + 12), beat * 0.4, P.arp);
    if (P.bell && Math.random() < 0.6) this.bell(t + beat * Math.floor(rand(0, 4)), MIDI(chord[Math.floor(rand(0, 3))] + 24), P.bell);
    if (P.heart) { this.kick(t, 0.5 * P.heart, 70); this.kick(t + beat * 0.35, 0.35 * P.heart, 60); }
    if (P.drums) this.drums(M, t, beat, P.drums, last);
    // melody: the motif (A in the first half, B later), each note moved from the chord tone
    const lead = P.piano ? 'piano' : P.lead ? 'lead' : P.brass ? 'brass' : null;
    if (lead) {
      const mot = pc.motifs[Math.floor(n / 4) % 2 === 0 || n >= pc.bars - 4 ? 0 : 1];
      const half = n % 2;
      for (const e of mot) {
        if (e.bar !== half || e.rest) continue;
        const base = chordDeg + (e.at === 0 ? 0 : 2 * Math.floor(e.at) % 5);
        let deg = base + e.step + (Math.random() < 0.15 ? Math.floor(rand(-1, 2)) : 0);
        if (last && e.at + e.d >= 4) deg = chordDeg;
        const f = MIDI(note(deg, M.bpm > 110 ? 1 : 1));
        const vol = (P[lead] || 1) * (e.at === 0 ? 1 : 0.8);
        if (lead === 'piano') this.piano(t + e.at * beat, f, e.d * beat, vol);
        else if (lead === 'lead') this.lead(t + e.at * beat, f, e.d * beat * 0.9, vol);
        if (P.brass) this.brass(t + e.at * beat, lead === 'brass' ? f : f / 2, e.d * beat * 0.92, P.brass * (lead === 'brass' ? 1 : 0.5));
      }
    }
    function i2(f, r) { return f * r; }
  },

  drums(M, t, beat, v, last) {
    const march = !!M.parts.brass;
    for (let i = 0; i < 4; i++) {
      const b = t + i * beat;
      if (i % 2 === 0 || M.bpm > 130) this.kick(b, v * (i === 0 ? 0.6 : 0.4));
      if (i % 2 === 1) this.snare(b, v * 0.45);
      this.hat(b + beat / 2, v * 0.4);
      if (M.bpm > 120) this.hat(b, v * 0.25);
      if (march && i === 3) { this.snare(b + beat / 2, v * 0.45); this.snare(b + beat * 0.75, v * 0.45); }
    }
    if (last) this.crash(t + 3 * beat, v * 0.6);
  },

  // ---------------------------------------------------------------- voices ----
  env(g, t, a, hold, rel, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  },
  osc(type, f, t, dur, detune = 0) {
    const o = Sound.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    o.start(t); o.stop(t + dur + 0.1);
    return o;
  },
  chain(nodes, g) { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); nodes[nodes.length - 1].connect(g); g.connect(this.bus); },
  filter(type, f, q = 0.7) { const b = Sound.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; },
  gain() { return Sound.ctx.createGain(); },

  piano(t, f, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 2600);
    const len = Math.max(0.6, dur * 1.6);
    this.env(g, t, 0.006, 0.02, len, 0.09 * v);
    const a = this.osc('triangle', f, t, len), b = this.osc('sine', f * 2, t, len), c = this.osc('sine', f, t, len, 4);
    const gb = this.gain(); gb.gain.value = 0.3;
    a.connect(lp); c.connect(lp); b.connect(gb); gb.connect(lp);
    lp.connect(g); g.connect(this.bus);
  },
  lead(t, f, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 1800, 2);
    this.env(g, t, 0.02, dur * 0.6, 0.25, 0.05 * v);
    const a = this.osc('square', f, t, dur + 0.3), b = this.osc('sawtooth', f, t, dur + 0.3, 7);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(this.bus);
  },
  brass(t, f, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 500, 1.5);
    lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(2400, t + 0.08); lp.frequency.linearRampToValueAtTime(1300, t + Math.max(0.1, dur));
    this.env(g, t, 0.04, Math.max(0.02, dur - 0.08), 0.2, 0.06 * v);
    for (const d of [-6, 0, 6]) this.osc('sawtooth', f, t, dur + 0.3, d).connect(lp);
    lp.connect(g); g.connect(this.bus);
  },
  pad(t, fs, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 900);
    this.env(g, t, Math.min(0.9, dur * 0.3), dur * 0.5, 1.4, 0.022 * v);
    for (const f of fs) for (const d of [-9, 9]) this.osc('sawtooth', f, t, dur + 1.6, d).connect(lp);
    lp.connect(g); g.connect(this.bus);
  },
  choir(t, fs, dur, v) {
    const g = this.gain();
    this.env(g, t, 0.35, dur * 0.6, 0.8, 0.03 * v);
    for (const f of fs) {
      const src = this.osc('sawtooth', f, t, dur + 1.2, rand(-6, 6));
      for (const [ff, q] of [[700, 6], [1150, 8]]) { const bp = this.filter('bandpass', ff, q); src.connect(bp); bp.connect(g); }
    }
    g.connect(this.bus);
  },
  bass(t, f, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 420);
    this.env(g, t, 0.01, dur * 0.6, dur * 0.5, 0.13 * v);
    this.osc('sine', f, t, dur + 0.2).connect(lp); this.osc('triangle', f, t, dur + 0.2).connect(lp);
    lp.connect(g); g.connect(this.bus);
  },
  pluck(t, f, dur, v) {
    const g = this.gain(), lp = this.filter('lowpass', 3000);
    this.env(g, t, 0.004, 0.01, dur, 0.035 * v);
    this.osc('triangle', f, t, dur + 0.1).connect(lp);
    lp.connect(g); g.connect(this.bus);
  },
  bell(t, f, v) {
    for (const [r, a, d] of [[1, 0.05, 2.4], [2.76, 0.02, 1.2], [5.4, 0.012, 0.6]]) {
      const g = this.gain();
      this.env(g, t, 0.004, 0, d, a * v);
      this.osc('sine', f * r, t, d + 0.1).connect(g); g.connect(this.bus);
    }
  },
  kick(t, v, f0 = 120) {
    const g = this.gain(), o = this.osc('sine', f0, t, 0.3);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    this.env(g, t, 0.002, 0.02, 0.22, 0.4 * v);
    o.connect(g); g.connect(this.bus);
  },
  noise(t, dur, type, f, peak, q = 0.8) {
    const src = Sound.ctx.createBufferSource();
    src.buffer = Sound.noiseBuf; src.start(t, Math.random()); src.stop(t + dur + 0.05);
    const bf = this.filter(type, f, q), g = this.gain();
    this.env(g, t, 0.002, 0.005, dur, peak);
    src.connect(bf); bf.connect(g); g.connect(this.bus);
  },
  snare(t, v) { this.noise(t, 0.16, 'bandpass', 1900, 0.16 * v, 0.6); const g = this.gain(); this.env(g, t, 0.002, 0.01, 0.1, 0.08 * v); this.osc('triangle', 190, t, 0.15).connect(g); g.connect(this.bus); },
  hat(t, v) { this.noise(t, 0.05, 'highpass', 7000, 0.06 * v); },
  crash(t, v) { this.noise(t, 1.4, 'highpass', 4500, 0.08 * v); },
};

// the setting (its slider is in main.js, under Sound & HUD)
DEFAULT_SETTINGS.music = 0.3;
if (G.settings.music === undefined) G.settings.music = 0.3;
