'use strict';
// Weather and world events. Rain or snow (snow where it is cold: snowy biomes, high mountains,
// the snowy peaks place) fall around the camera as particles; storms add lightning bolts,
// thunder and flashes. Events: meteor showers on clear nights and eruptions of the volcano.

const WEATHER_KINDS = ['clear', 'rain', 'storm', 'snow', 'fog'];

const Weather = {
  kind: 'clear', amount: 0, timer: 90,
  flash: 0, bolts: [], nextBolt: 4,
  event: null, eventTimer: 120,
  loop: null,
  wetness: 0,      // surfaces stay wet (and puddles stay) for a while after the rain stops
  snowCover: 0,    // snow settles on the ground while it snows and melts afterwards
  snowing: false,
  rainFx: 0,       // how much rain the camera sees falling right now (0 under a roof)

  // 0..1 overcast strength the renderer uses
  get overcast() { return this.amount * (this.kind === 'storm' ? 1 : this.kind === 'fog' ? 0.3 : 0.8); },
  get mist() { return this.kind === 'fog' ? this.amount : 0; },

  set(kind, silent) {
    if (!WEATHER_KINDS.includes(kind)) kind = 'clear';
    if (kind === this.kind) return;
    this.kind = kind;
    this.timer = rand(150, 420);
    if (!silent && G.ui && kind !== 'clear') G.ui.toast({ rain: '🌧️ It started raining', storm: '⛈️ A storm is coming', snow: '❄️ It is snowing', fog: '🌫️ Fog rolls in' }[kind]);
  },

  // Is the column around (x, z) cold enough for snow?
  cold(x, z) {
    const g = G.world.gen;
    if (g.type === 'flat') return false;
    const own = g.regionOwner(Math.floor(x), Math.floor(z));
    if (own) return own.p === WORLD_PRESETS.peaks;
    const h = g.height(Math.floor(x), Math.floor(z));
    const { temp, hum } = g.climate(x, z);
    const b = g.biome(h, temp, hum);
    return b === BIOME.SNOWY || (b === BIOME.MOUNTAIN && h > SEA + 30);
  },

  update(dt, cam) {
    const mode = G.settings.weather || 'auto';
    if (mode !== 'auto') { if (this.kind !== mode) this.set(mode, true); }
    else {
      this.timer -= dt;
      if (this.timer <= 0) {
        const r = Math.random();
        this.set(this.kind !== 'clear' ? 'clear' : r < 0.45 ? 'rain' : r < 0.7 ? 'storm' : r < 0.84 ? 'snow' : 'fog');
      }
    }
    const on = this.kind !== 'clear';
    const wet = on && this.kind !== 'fog';
    this.amount += ((on ? 1 : 0) - this.amount) * (1 - Math.exp(-dt * 0.35));
    const p = cam.pos;
    const snow = this.kind === 'snow' || (wet && this.cold(p[0], p[2]));
    this.snowing = wet && snow;
    if (this.amount > 0.05 && wet) this.precipitate(dt, p, snow);
    const raining = wet && !snow ? this.amount : 0;
    this.wetness = clamp(this.wetness + (raining > 0.3 ? dt / 25 : -dt / 150), 0, 1);
    this.snowCover = clamp(this.snowCover + (this.snowing && this.amount > 0.3 ? dt / 60 : -dt / 90), 0, 1);
    const covered = G.eyeSky < 0.3 ? 0 : 1;
    this.rainFx += (raining * covered * (this.kind === 'storm' ? 1 : 0.7) - this.rainFx) * (1 - Math.exp(-dt * 3));
    this.storm(dt, p);
    this.events(dt, p);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.sound(snow || !wet ? 0 : this.amount, p);
  },

  // Rain streaks or snow flakes spawned in a box around the camera, stopped by roofs.
  precipitate(dt, p, snow) {
    const w = G.world;
    const n = Math.floor((snow ? 420 : 900) * this.amount * dt * (this.kind === 'storm' ? 1.5 : 1));
    for (let i = 0; i < n; i++) {
      const x = p[0] + rand(-18, 18), z = p[2] + rand(-18, 18);
      const top = w.surfaceHeight(Math.floor(x), Math.floor(z));
      const y = p[1] + rand(4, 16);
      if (top >= 0 && top + 1 > y) continue;
      if (snow) {
        const l = rand(3, 6);
        Particles.add(Particles.base(x, y, z, { vx: rand(-0.6, 0.6), vy: rand(-1.8, -1.1), vz: rand(-0.6, 0.6), life: l, max: l, size: rand(0.07, 0.12),
          layer: T.p_smoke, r: 1.6, g: 1.65, b: 1.75, blend: true, drag: 1, drift: true, melt: true }));
      } else {
        const l = 1.2;
        const wind = this.kind === 'storm' ? 5 + Math.sin(G.time * 0.3) * 2 : 1.2;
        const b = rand(0.75, 1.05);
        Particles.add(Particles.base(x, y, z, { vx: wind, vy: rand(-28, -21), vz: wind * 0.4, life: l, max: l, size: rand(0.012, 0.02),
          layer: T.p_smoke, r: 1.25 * b, g: 1.35 * b, b: 1.5 * b, blend: true, drag: 1, streak: rand(0.035, 0.055), splash: true }));
      }
    }
  },

  storm(dt, p) {
    for (const b of this.bolts) b.t -= dt;
    this.bolts = this.bolts.filter((b) => b.t > 0);
    if (this.kind !== 'storm' || this.amount < 0.6) return;
    this.nextBolt -= dt;
    if (this.nextBolt > 0) return;
    this.nextBolt = rand(3, 11);
    this.strike(p[0] + rand(-110, 110), p[2] + rand(-110, 110));
  },

  // A lightning bolt from the clouds to the ground at (x, z), with flash and delayed thunder.
  strike(x, z) {
    const w = G.world;
    const ground = Math.max(w.surfaceHeight(Math.floor(x), Math.floor(z)) + 1, SEA + 1);
    const pts = [[x, ground + 110, z]];
    let cx = x, cz = z;
    for (let y = ground + 110; y > ground; y -= rand(4, 9)) {
      cx += rand(-2.5, 2.5); cz += rand(-2.5, 2.5);
      pts.push([cx, Math.max(ground, y), cz]);
    }
    pts.push([x, ground, z]);
    // a couple of forks
    const forks = [];
    for (let f = 0; f < 3; f++) {
      const s = 2 + Math.floor(Math.random() * (pts.length - 4));
      let [fx, fy, fz] = pts[s];
      const fork = [[fx, fy, fz]];
      for (let k = 0; k < 4; k++) { fx += rand(-5, 5); fy -= rand(3, 7); fz += rand(-5, 5); fork.push([fx, fy, fz]); }
      forks.push(fork);
    }
    this.bolts.push({ pts, forks, t: 0.35 });
    this.flash = 1;
    const cam = G.renderer && G.renderer.camPos ? G.renderer.camPos : G.player.pos;
    const d = Math.hypot(x - cam[0], z - cam[2]);
    setTimeout(() => sfx('thunder', null, clamp(1.4 - d / 200, 0.3, 1.2), rand(0.85, 1.1)), Math.min(2500, d * 6));
    if (d < 40) G.shake = Math.max(G.shake, 0.4);
    Particles.smoke(x, ground + 0.5, z, 10, 0.8, true);
    for (let i = 0; i < 10; i++) Particles.flame(x + rand(-0.6, 0.6), ground + rand(0, 1), z + rand(-0.6, 0.6));
  },

  events(dt, p) {
    if (!G.settings.events) { this.event = null; return; }
    const e = this.event;
    if (e) {
      e.t += dt;
      if (e.kind === 'meteors') {
        if (Math.random() < dt * 9) this.meteor(p);
        if (e.t > 40 || isDaytime()) this.event = null;
      } else if (e.kind === 'eruption') {
        this.eruptionTick(dt, e);
        if (e.t > 22) this.event = null;
      }
      return;
    }
    this.eventTimer -= dt;
    if (this.eventTimer > 0) return;
    this.eventTimer = rand(150, 300);
    const own = G.regionOwn;
    if (own && own.p === WORLD_PRESETS.volcano) this.start('eruption');
    else if (!isDaytime() && this.kind === 'clear') this.start('meteors');
  },

  start(kind) {
    if (kind === 'eruption') {
      const r = G.world.gen.regions.find((q) => q.key === 'volcano');
      const ox = r ? r.x : 0, oz = r ? r.z : 0;
      this.event = { kind, t: 0, x: ox + VOLC.x, z: oz + VOLC.z };
      G.ui && G.ui.banner('🌋', 'Eruption!');
      sfx('explode', null, 1.2, 0.5);
      G.shake = Math.max(G.shake, 0.6);
    } else {
      this.event = { kind: 'meteors', t: 0 };
      G.ui && G.ui.banner('☄️', 'Meteor shower');
    }
  },

  meteor(p) {
    const a = rand(0, Math.PI * 2), d = rand(80, 200);
    const x = p[0] + Math.cos(a) * d, z = p[2] + Math.sin(a) * d, y = p[1] + rand(90, 150);
    const dir = rand(0, Math.PI * 2), sp = rand(70, 120);
    const l = rand(0.6, 1.2);
    Particles.add(Particles.base(x, y, z, { vx: Math.cos(dir) * sp, vy: -rand(15, 40), vz: Math.sin(dir) * sp, life: l, max: l, size: rand(0.5, 0.9),
      layer: T.p_crit, r: 1, g: 0.95, b: 0.8, glow: true, drag: 1, collide: false, streak: 0.12, shrink: true }));
  },

  eruptionTick(dt, e) {
    const top = VOLC.crater + 6;
    for (let i = 0; i < 3; i++) if (Math.random() < dt * 20) Particles.plume(e.x + rand(-6, 6), VOLC.crater + 8, e.z + rand(-6, 6));
    // lava bombs arcing out of the crater
    if (Math.random() < dt * 14) {
      const a = rand(0, Math.PI * 2), s = rand(8, 22);
      const l = rand(2.5, 4.5);
      Particles.add(Particles.base(e.x + rand(-4, 4), top, e.z + rand(-4, 4), { vx: Math.cos(a) * s, vy: rand(22, 38), vz: Math.sin(a) * s, life: l, max: l,
        size: rand(0.5, 1.1), layer: T.p_flame, glow: true, grav: 18, drag: 1, collide: true, trail: true }));
    }
    if (Math.random() < dt * 1.5) { sfx('explode', [e.x, top, e.z], 1, rand(0.4, 0.6)); G.shake = Math.max(G.shake, 0.15); }
  },

  // continuous rain hiss
  sound(level, p) {
    const ctx = Sound.ctx;
    if (!ctx || ctx.state !== 'running') return;
    if (!this.loop && level > 0.05) {
      const src = ctx.createBufferSource(); src.buffer = Sound.noiseBuf; src.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600; f.Q.value = 0.5;
      const g = ctx.createGain(); g.gain.value = 0.0001;
      src.connect(f); f.connect(g); g.connect(Sound.master); src.start();
      this.loop = { src, g };
    }
    if (this.loop) {
      const covered = G.eyeSky < 0.3 ? 0.35 : 1;
      this.loop.g.gain.setTargetAtTime(0.0001 + level * 0.22 * covered * (this.kind === 'storm' ? 1.4 : 1), ctx.currentTime, 0.3);
    }
  },

  // bolts as self-lit segments
  render(cp) {
    if (!this.bolts.length) return;
    const uv = () => Vehicles.swatchUV('navWhite');
    for (const b of this.bolts) {
      const k = Math.min(1, b.t / 0.12);
      ER.light = [1, 1]; ER.color = [0.75, 0.82, 1]; ER.ov = 2 + 6 * k;
      for (const line of [b.pts, ...b.forks]) {
        for (let i = 0; i + 1 < line.length; i++) {
          const a = line[i], c = line[i + 1];
          const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]) || 1;
          const m = XF.chain(XF.t(a[0] - cp[0], a[1] - cp[1], a[2] - cp[2]), XF.ry(Math.atan2(d[0], d[2])), XF.rx(-Math.asin(d[1] / len)));
          const w = line === b.pts ? 0.16 : 0.08;
          ER.box(m, -w, -w, 0, w, w, len, uv);
        }
      }
    }
    ER.ov = 0; ER.color = [1, 1, 1];
  },

  reset() { this.bolts = []; this.flash = 0; this.event = null; this.wetness = 0; this.snowCover = 0; this.rainFx = 0; },
};
