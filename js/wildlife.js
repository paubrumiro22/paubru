'use strict';
// Ambient wildlife that makes the world feel alive: flocks of birds wheeling overhead (gulls by
// the sea, swifts and crows inland), bees hopping between flowers, butterflies, schools of fish
// under the water, and their calls. They live only around the camera, are purely cosmetic
// (no collisions, no drops) and step aside for rain and night.

const WL_R = 64;           // they live within this distance of the camera
const wlWrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

const Wildlife = {
  flocks: [], bees: [], flies: [], fish: [],
  flowers: [],             // flower spots found near the camera: [x, y, z]
  scanT: 0, spawnT: 0, callT: 4, buzzT: 0,

  reset() { this.flocks = []; this.bees = []; this.flies = []; this.fish = []; this.flowers = []; },

  isFlower(id) { return id === B.ROSE || id === B.DANDELION || id === B.TULIP || id === B.BLUEBELL; },

  update(dt, cam) {
    if (!G.settings.wildlife && G.settings.wildlife !== undefined) { this.reset(); return; }
    const p = cam.pos;
    const day = isDaytime();
    const calm = Weather.kind === 'clear' || Weather.kind === 'fog' || Weather.amount < 0.3;
    this.scanT -= dt;
    if (this.scanT <= 0) { this.scanT = 0.5; this.scan(p); }
    this.spawnT -= dt;
    if (this.spawnT <= 0) { this.spawnT = 1.2; this.spawn(p, day, calm); }
    const far = (q) => Math.hypot(q[0] - p[0], q[2] - p[2]) > WL_R + 16;
    this.flocks = this.flocks.filter((f) => { this.updateFlock(f, dt, p, day, calm); return !f.gone && !far(f.c); });
    this.bees = this.bees.filter((b) => { this.updateBug(b, dt, 5.5, !day || !calm); return !b.gone && !far(b.pos); });
    this.flies = this.flies.filter((b) => { this.updateBug(b, dt, 2.2, !day || !calm); return !b.gone && !far(b.pos); });
    this.fish = this.fish.filter((f) => { this.updateFish(f, dt); return !far(f.pos); });
    this.sounds(dt, p, day, calm);
  },

  // look for flowers around the camera (a few random columns per scan)
  scan(p) {
    const w = G.world;
    this.flowers = this.flowers.filter((f) => this.isFlower(w.getBlock(f[0], f[1], f[2])) && Math.hypot(f[0] - p[0], f[2] - p[2]) < 40);
    for (let i = 0; i < 40 && this.flowers.length < 60; i++) {
      const x = Math.floor(p[0] + rand(-28, 28)), z = Math.floor(p[2] + rand(-28, 28));
      const h = w.surfaceHeight(x, z);
      if (h < 0) continue;
      for (let y = h; y >= h - 1; y--) if (this.isFlower(w.getBlock(x, y, z))) { this.flowers.push([x, y, z]); break; }
    }
  },

  spawn(p, day, calm) {
    const w = G.world;
    const own = G.world.gen && G.world.gen.regionOwner ? G.world.gen.regionOwner(Math.floor(p[0]), Math.floor(p[2])) : null;
    const seaside = own && (own.p === WORLD_PRESETS.beach || own.p === WORLD_PRESETS.islands);
    // birds
    if (day && calm && this.flocks.length < 3 && Math.random() < 0.5) {
      const a = rand(0, Math.PI * 2), d = rand(30, 60);
      const cx = p[0] + Math.cos(a) * d, cz = p[2] + Math.sin(a) * d;
      const ground = Math.max(w.surfaceHeight(Math.floor(cx), Math.floor(cz)), SEA);
      const kind = seaside || ground <= SEA + 1 ? 'gull' : Math.random() < 0.3 ? 'crow' : 'swift';
      const n = kind === 'crow' ? 3 + (Math.random() * 3 | 0) : 5 + (Math.random() * 6 | 0);
      const f = { kind, c: [cx, ground + rand(14, 28), cz], v: [rand(-1, 1), 0, rand(-1, 1)], turn: rand(-0.4, 0.4), t: 0, birds: [] };
      const sp = kind === 'gull' ? 6 : kind === 'crow' ? 7 : 10;
      const vl = Math.hypot(f.v[0], f.v[2]) || 1; f.v[0] *= sp / vl; f.v[2] *= sp / vl;
      for (let i = 0; i < n; i++) f.birds.push({ off: [rand(-4, 4), rand(-1.5, 1.5), rand(-4, 4)], pos: [cx, f.c[1], cz], vel: f.v.slice(), ph: rand(0, 6.28), glide: 0 });
      this.flocks.push(f);
    }
    // bees and butterflies around flowers
    if (day && calm && this.flowers.length) {
      if (this.bees.length < 10 && Math.random() < 0.7) {
        const fl = this.flowers[Math.random() * this.flowers.length | 0];
        this.bees.push({ kind: 'bee', pos: [fl[0] + 0.5, fl[1] + 1.5, fl[2] + 0.5], vel: [0, 0, 0], target: fl, t: 0, stay: rand(1, 3), ph: rand(0, 6) });
      }
      if (this.flies.length < 8 && Math.random() < 0.5) {
        const fl = this.flowers[Math.random() * this.flowers.length | 0];
        const hue = [[1, 0.62, 0.1], [0.95, 0.95, 0.9], [0.35, 0.55, 1], [1, 0.9, 0.25], [0.85, 0.3, 0.8]][Math.random() * 5 | 0];
        this.flies.push({ kind: 'fly', pos: [fl[0] + 0.5, fl[1] + 2.2, fl[2] + 0.5], vel: [0, 0, 0], target: fl, t: 0, stay: rand(1, 4), ph: rand(0, 6), hue });
      }
    }
    // fish in open water
    if (this.fish.length < 18 && Math.random() < 0.6) {
      const x = Math.floor(p[0] + rand(-24, 24)), z = Math.floor(p[2] + rand(-24, 24));
      const y = SEA - 1 - (Math.random() * 3 | 0);
      if (w.getBlock(x, y, z) === B.WATER && w.getBlock(x, y - 1, z) === B.WATER && w.getBlock(x, SEA, z) === B.WATER) {
        const tropical = own && (own.p === WORLD_PRESETS.beach || own.p === WORLD_PRESETS.islands);
        const n = 3 + (Math.random() * 5 | 0);
        const col = tropical ? [[1, 0.55, 0.1], [0.25, 0.6, 1], [1, 0.9, 0.2]][Math.random() * 3 | 0] : [0.62, 0.68, 0.72];
        const heading = rand(0, Math.PI * 2);
        for (let i = 0; i < n; i++) this.fish.push({ pos: [x + rand(-1.5, 1.5), y + rand(-0.4, 0.4), z + rand(-1.5, 1.5)], yaw: heading + rand(-0.3, 0.3), sp: rand(1, 1.8), ph: rand(0, 6), col, t: 0 });
      }
    }
  },

  updateFlock(f, dt, p, day, calm) {
    f.t += dt;
    // the flock wanders in lazy curves, drifting back if it strays too far
    f.turn += rand(-0.6, 0.6) * dt;
    f.turn = clamp(f.turn, -0.5, 0.5);
    const toC = Math.atan2(p[2] - f.c[2], p[0] - f.c[0]);
    const head = Math.atan2(f.v[2], f.v[0]);
    const dist = Math.hypot(p[0] - f.c[0], p[2] - f.c[2]);
    let dh = f.turn * dt;
    if (dist > WL_R * 0.8) dh += wlWrap(toC - head) * dt * 0.6;
    const sp = Math.hypot(f.v[0], f.v[2]);
    const nh = head + dh;
    f.v[0] = Math.cos(nh) * sp; f.v[2] = Math.sin(nh) * sp;
    f.c[0] += f.v[0] * dt; f.c[2] += f.v[2] * dt;
    const ground = Math.max(G.world.surfaceHeight(Math.floor(f.c[0]), Math.floor(f.c[2])), SEA);
    f.c[1] += ((ground + 18 + Math.sin(f.t * 0.3) * 5) - f.c[1]) * dt * 0.4;
    if (!day || !calm) { f.c[1] += dt * 6; if (f.t > 4) f.gone = f.c[1] > p[1] + 60; }
    for (const b of f.birds) {
      const tx = f.c[0] + b.off[0] + Math.sin(f.t * 0.7 + b.ph) * 1.5, ty = f.c[1] + b.off[1] + Math.sin(f.t * 1.1 + b.ph) * 0.8, tz = f.c[2] + b.off[2] + Math.cos(f.t * 0.6 + b.ph) * 1.5;
      for (let k = 0; k < 3; k++) {
        const t = [tx, ty, tz][k];
        b.vel[k] += ((t - b.pos[k]) * 1.6 + f.v[k] - b.vel[k]) * Math.min(1, dt * 2.5);
        b.pos[k] += b.vel[k] * dt;
      }
      // flap while climbing or catching up, glide otherwise
      const climb = b.vel[1];
      b.glide += ((climb > 0.4 || Math.sin(f.t * 0.9 + b.ph * 3) > 0.3 ? 0 : 1) - b.glide) * Math.min(1, dt * 3);
      b.ph += dt * (f.kind === 'swift' ? 16 : f.kind === 'gull' ? 7 : 9) * (1 - b.glide * 0.9);
    }
  },

  // bees and butterflies: dart or flutter from flower to flower
  updateBug(b, dt, speed, leave) {
    b.t += dt;
    const w = G.world;
    let tgt;
    if (leave) { tgt = [b.pos[0] + 5, b.pos[1] + 30, b.pos[2]]; if (b.t > 8) b.gone = true; }
    else {
      const fl = b.target;
      tgt = [fl[0] + 0.5 + Math.sin(b.t * 1.7 + b.ph) * 0.35, fl[1] + (b.kind === 'bee' ? 0.75 : 1.0) + Math.sin(b.t * 2.3) * 0.15, fl[2] + 0.5 + Math.cos(b.t * 1.3 + b.ph) * 0.35];
      const d = Math.hypot(tgt[0] - b.pos[0], tgt[1] - b.pos[1], tgt[2] - b.pos[2]);
      if (d < 0.6) {
        b.stay -= dt;
        if (b.stay <= 0 && this.flowers.length) {
          const near = this.flowers.filter((f) => Math.hypot(f[0] - fl[0], f[2] - fl[2]) < 12);
          b.target = near.length ? near[Math.random() * near.length | 0] : fl;
          b.stay = rand(1, b.kind === 'bee' ? 3 : 5);
        }
      }
      if (!this.isFlower(w.getBlock(fl[0], fl[1], fl[2]))) b.gone = true;
    }
    const jitter = b.kind === 'bee' ? 3 : 5;
    for (let k = 0; k < 3; k++) {
      const want = clamp(tgt[k] - b.pos[k], -1, 1) * speed + rand(-jitter, jitter) * (k === 1 && b.kind === 'fly' ? 1.6 : 1);
      b.vel[k] += (want - b.vel[k]) * Math.min(1, dt * (b.kind === 'bee' ? 5 : 2.5));
      b.pos[k] += b.vel[k] * dt;
    }
    b.ph += dt * (b.kind === 'bee' ? 90 : 11);
  },

  updateFish(f, dt) {
    f.t += dt;
    f.yaw += Math.sin(f.t * 0.7 + f.ph) * dt * 0.8;
    const nx = f.pos[0] + Math.cos(f.yaw) * f.sp * dt, nz = f.pos[2] + Math.sin(f.yaw) * f.sp * dt;
    const w = G.world;
    if (w.getBlock(Math.floor(nx), Math.floor(f.pos[1]), Math.floor(nz)) !== B.WATER) f.yaw += Math.PI * (0.6 + Math.random() * 0.5);
    else { f.pos[0] = nx; f.pos[2] = nz; }
    f.pos[1] += Math.sin(f.t * 1.3 + f.ph) * dt * 0.15;
    f.ph += dt * 9;
  },

  sounds(dt, p, day, calm) {
    this.callT -= dt;
    if (this.callT <= 0) {
      this.callT = rand(2.5, 7);
      const fl = this.flocks[0];
      if (fl && fl.birds.length) {
        const b = fl.birds[Math.random() * fl.birds.length | 0];
        sfx(fl.kind === 'gull' ? 'gull' : fl.kind === 'crow' ? 'crow' : 'chirp', b.pos, 0.9, rand(0.9, 1.15));
      } else if (day && calm && G.eyeSky > 0.5) {
        // birdsong from the trees
        const own = G.regionOwn;
        if (!own || own.p !== WORLD_PRESETS.volcano) sfx('chirp', [p[0] + rand(-14, 14), p[1] + rand(2, 6), p[2] + rand(-14, 14)], 0.6, rand(0.85, 1.3));
      } else if (!day && Weather.kind === 'clear' && Math.random() < 0.6) sfx('cricket', [p[0] + rand(-8, 8), p[1], p[2] + rand(-8, 8)], 0.5, rand(0.95, 1.05));
    }
    this.buzzT -= dt;
    if (this.buzzT <= 0) {
      this.buzzT = 0.9;
      let near = null, nd = 5;
      for (const b of this.bees) { const d = Math.hypot(b.pos[0] - p[0], b.pos[1] - p[1], b.pos[2] - p[2]); if (d < nd) { nd = d; near = b; } }
      if (near) sfx('buzz', near.pos, 0.5, rand(0.9, 1.1));
    }
  },

  // ------------------------------------------------------------ rendering ----
  render(cp) {
    const W = () => Vehicles.swatchUV('white');
    const box = (m, a, b, col) => { ER.color = col; ER.box(m, a[0], a[1], a[2], b[0], b[1], b[2], W); };
    const rel = (q) => [q[0] - cp[0], q[1] - cp[1], q[2] - cp[2]];
    const tooFar = (q) => { const r = rel(q); return r[0] * r[0] + r[1] * r[1] + r[2] * r[2] > 110 * 110; };
    for (const f of this.flocks) {
      const pal = f.kind === 'gull' ? { body: [0.95, 0.95, 0.93], wing: [0.78, 0.8, 0.84], tip: [0.15, 0.15, 0.17], beak: [0.95, 0.75, 0.2] }
        : f.kind === 'crow' ? { body: [0.1, 0.1, 0.12], wing: [0.12, 0.12, 0.15], tip: [0.06, 0.06, 0.08], beak: [0.2, 0.2, 0.22] }
          : { body: [0.22, 0.2, 0.24], wing: [0.26, 0.24, 0.3], tip: [0.18, 0.16, 0.2], beak: [0.3, 0.3, 0.3] };
      const s = f.kind === 'gull' ? 1.25 : f.kind === 'crow' ? 1.05 : 0.7;
      for (const b of f.birds) {
        if (tooFar(b.pos)) continue;
        ER.lightAt(b.pos[0], b.pos[1], b.pos[2]);
        const yaw = Math.atan2(b.vel[0], b.vel[2]);
        const pitch = Math.atan2(b.vel[1], Math.hypot(b.vel[0], b.vel[2]));
        const r = rel(b.pos);
        const base = XF.chain(XF.t(r[0], r[1], r[2]), XF.ry(yaw), XF.rx(-pitch * 0.6), XF.s(s));
        const flap = Math.sin(b.ph) * 0.9 * (1 - b.glide) + 0.08;
        box(base, [-0.09, -0.08, -0.28], [0.09, 0.08, 0.22], pal.body);
        box(base, [-0.07, -0.02, 0.2], [0.07, 0.11, 0.34], pal.body);
        box(base, [-0.025, 0.01, 0.34], [0.025, 0.05, 0.42], pal.beak);
        box(base, [-0.12, -0.02, -0.46], [0.12, 0.02, -0.26], pal.wing);
        for (const side of [-1, 1]) {
          const wing = XF.chain(base, XF.t(side * 0.08, 0.04, 0), XF.rz(side * flap));
          box(wing, side < 0 ? [-0.36, -0.015, -0.13] : [0, -0.015, -0.13], side < 0 ? [0, 0.015, 0.1] : [0.36, 0.015, 0.1], pal.wing);
          const tip = XF.chain(wing, XF.t(side * 0.36, 0, 0), XF.rz(side * flap * 0.6));
          box(tip, side < 0 ? [-0.3, -0.012, -0.12] : [0, -0.012, -0.12], side < 0 ? [0, 0.012, 0.06] : [0.3, 0.012, 0.06], pal.tip);
        }
      }
    }
    for (const b of this.bees) {
      if (tooFar(b.pos)) continue;
      ER.lightAt(b.pos[0], b.pos[1], b.pos[2]);
      const r = rel(b.pos);
      const base = XF.chain(XF.t(r[0], r[1], r[2]), XF.ry(Math.atan2(b.vel[0], b.vel[2])));
      box(base, [-0.045, -0.04, -0.07], [0.045, 0.045, 0.07], [1, 0.78, 0.12]);
      box(base, [-0.047, -0.042, -0.02], [0.047, 0.047, 0.015], [0.08, 0.06, 0.04]);
      box(base, [-0.047, -0.042, -0.07], [0.047, 0.047, -0.05], [0.08, 0.06, 0.04]);
      box(base, [-0.035, -0.03, 0.07], [0.035, 0.035, 0.1], [0.1, 0.08, 0.06]);
      const flap = Math.sin(b.ph) * 0.8;
      for (const side of [-1, 1]) {
        const wing = XF.chain(base, XF.t(side * 0.03, 0.05, 0), XF.rz(side * flap));
        box(wing, side < 0 ? [-0.1, 0, -0.03] : [0, 0, -0.03], side < 0 ? [0, 0.006, 0.05] : [0.1, 0.006, 0.05], [0.9, 0.95, 1]);
      }
    }
    for (const b of this.flies) {
      if (tooFar(b.pos)) continue;
      ER.lightAt(b.pos[0], b.pos[1], b.pos[2]);
      const r = rel(b.pos);
      const base = XF.chain(XF.t(r[0], r[1], r[2]), XF.ry(Math.atan2(b.vel[0], b.vel[2])));
      box(base, [-0.012, -0.012, -0.07], [0.012, 0.012, 0.07], [0.12, 0.1, 0.08]);
      const flap = 0.3 + Math.abs(Math.sin(b.ph)) * 1.2;
      for (const side of [-1, 1]) {
        const wing = XF.chain(base, XF.t(side * 0.012, 0, 0), XF.rz(side * flap));
        box(wing, side < 0 ? [-0.14, 0, -0.02] : [0, 0, -0.02], side < 0 ? [0, 0.004, 0.12] : [0.14, 0.004, 0.12], b.hue);
        box(wing, side < 0 ? [-0.1, 0, -0.12] : [0, 0, -0.12], side < 0 ? [0, 0.004, -0.02] : [0.1, 0.004, -0.02], b.hue.map((c) => c * 0.8));
      }
    }
    for (const f of this.fish) {
      if (tooFar(f.pos)) continue;
      ER.lightAt(f.pos[0], f.pos[1], f.pos[2]);
      const r = rel(f.pos);
      const vx = Math.cos(f.yaw), vz = Math.sin(f.yaw);
      const base = XF.chain(XF.t(r[0], r[1], r[2]), XF.ry(Math.atan2(vx, vz)), XF.ry(Math.sin(f.ph) * 0.15));
      box(base, [-0.04, -0.07, -0.14], [0.04, 0.07, 0.14], f.col);
      const tail = XF.chain(base, XF.t(0, 0, -0.14), XF.ry(Math.sin(f.ph + 1) * 0.5));
      box(tail, [-0.01, -0.07, -0.1], [0.01, 0.07, 0], f.col.map((c) => c * 0.8));
      box(base, [-0.041, 0.01, 0.07], [0.041, 0.03, 0.09], [0.05, 0.05, 0.05]);
    }
    ER.color = [1, 1, 1];
  },
};
