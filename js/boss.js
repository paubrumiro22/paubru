'use strict';
// The Void Wyrm: the guardian of the End. It wakes when a player reaches the main island and
// fights in three phases:
//   1 (health > 60 %)  circles the pillars, spits void orbs and dives at you;
//   2 (60 % .. 30 %)   also lands on the exit portal to breathe a cone of void fire: that is the
//                      moment to hit it with a sword;
//   3 (< 30 %)         enraged: faster, three orbs at a time, calls two Voidwalkers once.
// The crystals on top of the obsidian pillars heal it with a violet beam while they last: break
// them (mine them, shoot them with arrows or blow them up). Beating it gives Void Wings (glide by
// holding jump in the air), scales, gems and coins, and rolls the credits. Progress is kept in
// G.prog (saved with the world). Each player fights their own Wyrm online.

Object.assign(I, { VOID_WINGS: 430, WYRM_SCALE: 431 });
MOB_TYPES.wyrm = { name: 'Void Wyrm', hw: 2.2, h: 2.4, hp: 400, speed: 18, hostile: true, drops: [], fireproof: true, custom: 'wyrm' };

const WYRM_SEG = [
  // [distance behind the head, half width, half height, colour] along the flight path
  ...[1.7, 2.9, 4.1].map((d, i) => [d, 0.55 + i * 0.12, 0.5 + i * 0.1, 0]),        // neck
  ...[5.6, 7.3, 9.0].map((d) => [d, 1.25, 1.05, 1]),                                // body
  ...[10.6, 12.0, 13.3, 14.5, 15.6, 16.6, 17.5, 18.3].map((d, i) => [d, 0.95 - i * 0.1, 0.8 - i * 0.08, 2]), // tail
];
const WYRM_SCALES = [[0.3, 0.17, 0.44], [0.24, 0.13, 0.36], [0.3, 0.18, 0.44]];
const WYRM_GLOW = [0.62, 0.34, 1];

const Wyrm = {
  mob: null, orbs: [], clouds: [], crystals: null, wakeT: 0, creditsT: 0, bar: null, lastAlive: null, healT: 0, glideSnd: 0,

  center() { return [-DIM_C + 0.5, 0.5]; },
  portalY() {
    const w = G.world, [cx, cz] = this.center();
    for (let y = CH - 1; y > 20; y--) if (w.getBlock(Math.floor(cx), y, Math.floor(cz)) === B.END_ROD) return y;
    return null;
  },
  crystalList() {
    if (!this.crystals) this.crystals = END_PILLARS.map((P) => [P.x - DIM_C, P.h + 2, P.z]);
    return this.crystals;
  },

  update(dt) {
    const p = G.player, w = G.world;
    if (!w || !G.prog) return;
    this.updateOrbs(dt);
    this.glide(dt);
    if (this.creditsT > 0) { this.creditsT -= dt; if (this.creditsT <= 0) showCredits(); }
    const inEnd = w.type === 'default' && dimOf(p.pos[0], p.pos[2]) === DIM_END;
    const [cx, cz] = this.center();
    const near = inEnd && Math.hypot(p.pos[0] - cx, p.pos[2] - cz) < 190;
    if (this.mob && (this.mob.removed || !Ents.mobs.includes(this.mob))) this.mob = null;
    // wake up
    if (near && !G.prog.wyrm && !this.mob && w.isLoaded(Math.floor(cx), Math.floor(cz))) {
      this.wakeT += dt;
      if (this.wakeT > 3) {
        const py = this.portalY() || 60;
        const m = Ents.spawnMob('wyrm', cx, py + 45, cz + 50);
        if (m) {
          this.mob = m;
          this.setup(m, py);
          G.ui.toast('The Void Wyrm awakens', 4000);
          sfx('wyrm_roar', null, 1, 0.9);
          this.lastAlive = null;
        }
        this.wakeT = 0;
      }
    } else this.wakeT = 0;
    if (!near && this.mob && !this.mob.ai.dying) { this.mob.removed = true; this.mob = null; }
    this.crystalWatch(dt);
    this.updateBar();
  },

  setup(m, py) {
    m.ai.state = 'circle'; m.ai.ang = Math.PI / 2; m.ai.orbT = 5; m.ai.diveT = 10; m.ai.perchT = 18; m.ai.t = 0;
    m.portalY = py;
    m.vel = [-12, 0, 0];
    m.flap = 0; m.jaw = 0; m.hitCd = 0; m.summoned = false;
    // a straight trail behind the head to start with
    m.trail = [];
    for (let i = 0; i < 40; i++) m.trail.push([m.pos[0] + i * 0.6, m.pos[1] + m.h / 2, m.pos[2]]);
  },

  // ------------------------------------------------------------------ AI ----
  tick(m, dt) {
    if (m.removed) return;
    const ai = m.ai, p = G.player;
    m.age += dt; m.hurtTime = Math.max(0, m.hurtTime - dt); m.invuln -= dt; m.hitCd -= dt; m.fire = 0;
    if (!m.trail) this.setup(m, this.portalY() || 60);
    const frac = m.health / m.def.hp;
    const phase = frac > 0.6 ? 1 : frac > 0.3 ? 2 : 3;
    const rage = phase === 3 ? 1.35 : 1;
    const [cx, cz] = this.center();
    const py = m.portalY || 60;
    const head = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    const tp = [p.pos[0], p.pos[1] + 1, p.pos[2]];
    const fighting = DimMobs.survivalTarget();
    let target, speed = 17 * rage, turn = 1.6;
    ai.t += dt;
    if (ai.dying) return this.dying(m, dt);
    switch (ai.state) {
      case 'circle': {
        ai.ang += dt * 0.3 * rage;
        const R = 58 + Math.sin(ai.t * 0.4) * 10;
        target = [cx + Math.cos(ai.ang) * R, py + 34 + Math.sin(ai.t * 0.7) * 9, cz + Math.sin(ai.ang) * R];
        if (fighting) {
          ai.orbT -= dt; ai.diveT -= dt; ai.perchT -= dt;
          const d = Math.hypot(tp[0] - head[0], tp[1] - head[1], tp[2] - head[2]);
          if (ai.orbT <= 0 && d < 110) { ai.orbT = rand(3.5, 5.5) / rage; this.spit(m, tp, phase === 3 ? 3 : 1); }
          if (ai.diveT <= 0 && d < 120) { ai.state = 'dive'; ai.t = 0; sfx('wyrm_roar', head, 1, 1.15); }
          if (phase >= 2 && ai.perchT <= 0) { ai.state = 'perch'; ai.t = 0; }
          if (phase === 3 && !m.summoned) {
            m.summoned = true;
            for (let i = 0; i < 2; i++) {
              const a = Math.random() * Math.PI * 2;
              const x = p.pos[0] + Math.cos(a) * 6, z = p.pos[2] + Math.sin(a) * 6;
              const y = G.world.surfaceHeight(Math.floor(x), Math.floor(z));
              if (y > 0) { const v = Ents.spawnMob('voidwalker', x, y + 1, z); if (v) { v.ai.target = p; DimMobs.puff(v.pos, [0.6, 0.2, 0.9]); } }
            }
            G.ui.toast('The Wyrm calls the Voidwalkers!', 3000);
          }
        }
        break;
      }
      case 'dive':
        target = tp; speed = 27 * rage; turn = 2.6;
        if (Math.hypot(tp[0] - head[0], tp[1] - head[1], tp[2] - head[2]) < 3.2 || ai.t > 5) { ai.state = 'rise'; ai.t = 0; }
        break;
      case 'rise':
        target = [head[0] + m.vel[0], py + 40, head[2] + m.vel[2]]; speed = 16;
        if (ai.t > 3) { ai.state = 'circle'; ai.t = 0; ai.diveT = rand(9, 14) / rage; ai.ang = Math.atan2(head[2] - cz, head[0] - cx); }
        break;
      case 'perch': {
        target = [cx, py + 4.2, cz]; speed = 14; turn = 2.2;
        const d = Math.hypot(target[0] - head[0], target[1] - head[1], target[2] - head[2]);
        if (d < 2.2) { ai.state = 'perched'; ai.t = 0; ai.breathT = 1.5; }
        if (ai.t > 14) { ai.state = 'rise'; ai.t = 0; }
        break;
      }
      case 'perched': {
        m.vel = [0, 0, 0];
        m.pos = [cx, py + 4.2 - m.h / 2, cz];
        // face the player
        m.bodyYaw = Math.atan2(-(tp[0] - cx), -(tp[2] - cz));
        m.lookPitch = Math.atan2(tp[1] - (py + 4.2), Math.hypot(tp[0] - cx, tp[2] - cz));
        ai.breathT -= dt;
        if (ai.breathT <= 0 && fighting) { ai.breathT = 3.2; ai.breath = 1.6; sfx('wyrm_breath', m.pos, 1, 1); }
        if (ai.breath > 0) { ai.breath -= dt; this.breathe(m, dt); }
        m.jaw += ((ai.breath > 0 ? 1 : 0) - m.jaw) * Math.min(1, dt * 8);
        if (ai.t > 13) { ai.state = 'rise'; ai.t = 0; ai.perchT = rand(22, 30); m.vel = [0, 8, 0]; sfx('wyrm_roar', m.pos, 1, 1); }
        this.trailStep(m);
        this.contact(m, head, tp);
        return;
      }
      default: ai.state = 'circle';
    }
    // steer towards the target
    const dx = target[0] - head[0], dy = target[1] - head[1], dz = target[2] - head[2], l = Math.hypot(dx, dy, dz) || 1;
    const k = Math.min(1, dt * turn);
    m.vel[0] += (dx / l * speed - m.vel[0]) * k;
    m.vel[1] += (dy / l * speed - m.vel[1]) * k;
    m.vel[2] += (dz / l * speed - m.vel[2]) * k;
    for (let i = 0; i < 3; i++) m.pos[i] += m.vel[i] * dt;
    const hs = Math.hypot(m.vel[0], m.vel[2]);
    m.bodyYaw = Math.atan2(-m.vel[0], -m.vel[2]);
    m.lookPitch = Math.atan2(m.vel[1], hs);
    m.jaw += ((ai.state === 'dive' ? 0.7 : 0) - m.jaw) * Math.min(1, dt * 6);
    // wings: strong beats when climbing, gliding when diving
    const beat = ai.state === 'dive' ? 0.6 : m.vel[1] > 2 ? 2.3 : 1.4;
    const before = Math.sin(m.flap);
    m.flap += dt * beat * Math.PI;
    if (before < 0 && Math.sin(m.flap) >= 0) sfx('wyrm_flap', head, 0.9, rand(0.9, 1.1));
    this.trailStep(m);
    this.contact(m, head, tp);
    // crystals heal it
    this.healT -= dt;
    if (this.healT <= 0) { this.healT = 0.15; this.heal(m, 0.15); }
  },

  trailStep(m) {
    const head = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    const t = m.trail, last = t[0];
    if (!last || Math.hypot(head[0] - last[0], head[1] - last[1], head[2] - last[2]) > 0.3) {
      t.unshift(head);
      if (t.length > 120) t.length = 120;
    }
  },
  // point `dist` blocks back along the trail
  along(m, dist) {
    const t = m.trail;
    let acc = 0, prev = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    for (let i = 0; i < t.length; i++) {
      const q = t[i], s = Math.hypot(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]);
      if (acc + s >= dist && s > 0) { const f = (dist - acc) / s; return [prev[0] + (q[0] - prev[0]) * f, prev[1] + (q[1] - prev[1]) * f, prev[2] + (q[2] - prev[2]) * f]; }
      acc += s; prev = q;
    }
    return prev;
  },

  contact(m, head, tp) {
    if (!DimMobs.survivalTarget() || m.hitCd > 0) return;
    const d = Math.hypot(tp[0] - head[0], (tp[1] - head[1]) * 0.8, tp[2] - head[2]);
    if (d > 3.4) return;
    m.hitCd = 1.2;
    const dmg = [6, 8, 12][Math.max(0, G.difficulty - 1)] || 8;
    G.stats.damage(dmg, { type: 'mob', mob: m, from: head });
    const p = G.player, l = Math.hypot(tp[0] - head[0], tp[2] - head[2]) || 1;
    p.vel[0] += (tp[0] - head[0]) / l * 14; p.vel[2] += (tp[2] - head[2]) / l * 14; p.vel[1] = 9;
  },

  // violet fire from the perched Wyrm's jaws, in a cone towards where it looks
  breathe(m, dt) {
    const hd = this.headFrame(m), o = hd.mouth, f = hd.f;
    for (let i = 0; i < 6; i++) {
      const s = rand(8, 16), l = rand(0.5, 0.9);
      Particles.add(Particles.base(o[0], o[1], o[2], { vx: (f[0] + rand(-0.25, 0.25)) * s, vy: (f[1] + rand(-0.2, 0.2)) * s, vz: (f[2] + rand(-0.25, 0.25)) * s,
        life: l, max: l, size: rand(0.25, 0.5), layer: T.p_smoke, r: 0.55, g: 0.2, b: 0.85, glow: true, blend: true, drag: 0.9, grow: 2.2, collide: true }));
    }
    const p = G.player, e = [p.pos[0], p.pos[1] + 1, p.pos[2]];
    const v = [e[0] - o[0], e[1] - o[1], e[2] - o[2]], d = Math.hypot(...v) || 1;
    if (d < 14 && (v[0] * f[0] + v[1] * f[1] + v[2] * f[2]) / d > 0.85 && DimMobs.survivalTarget()) {
      m.breathHit = (m.breathHit || 0) - dt;
      if (m.breathHit <= 0) { m.breathHit = 0.5; G.stats.damage(2 + G.difficulty, { type: 'mob', mob: m, from: o }); }
    }
  },

  spit(m, at, n) {
    const hd = this.headFrame(m), o = hd.mouth;
    for (let i = 0; i < n; i++) {
      const spread = n > 1 ? (i - 1) * 3 : 0;
      const tx = at[0] + spread * Math.cos(m.bodyYaw), tz = at[2] + spread * Math.sin(m.bodyYaw);
      const dx = tx - o[0], dy = at[1] - o[1], dz = tz - o[2], l = Math.hypot(dx, dy, dz) || 1;
      this.orbs.push({ pos: o.slice(), vel: [dx / l * 20, dy / l * 20, dz / l * 20], life: 8 });
    }
    sfx('wyrm_orb', o, 1, 1);
  },

  updateOrbs(dt) {
    const w = G.world, p = G.player;
    for (const b of this.orbs) {
      b.life -= dt;
      let hit = null;
      for (let s = 0; s < 4 && !hit; s++) {
        for (let k = 0; k < 3; k++) b.pos[k] += b.vel[k] * dt / 4;
        if (BLOCK_SOLID[w.getBlock(Math.floor(b.pos[0]), Math.floor(b.pos[1]), Math.floor(b.pos[2]))]) hit = 'ground';
        else if (Math.hypot(b.pos[0] - p.pos[0], (b.pos[1] - p.pos[1] - 0.9) * 0.7, b.pos[2] - p.pos[2]) < 1) hit = 'player';
      }
      if (b.life <= 0) hit = hit || 'air';
      if (hit) {
        b.life = 0;
        if (hit === 'player' && DimMobs.survivalTarget()) G.stats.damage(5 + G.difficulty, { type: 'mob', mob: this.mob, from: b.pos });
        if (hit !== 'air') { this.clouds.push({ pos: b.pos.slice(), t: 5 }); sfx('wyrm_burst', b.pos, 1, 1); }
        continue;
      }
      for (let i = 0; i < 2; i++) Particles.add(Particles.base(b.pos[0] + rand(-0.2, 0.2), b.pos[1] + rand(-0.2, 0.2), b.pos[2] + rand(-0.2, 0.2), {
        life: 0.5, max: 0.5, size: rand(0.25, 0.4), layer: T.p_crit, r: 0.7, g: 0.35, b: 1, glow: true, drag: 0.9, collide: false, shrink: true }));
    }
    this.orbs = this.orbs.filter((b) => b.life > 0);
    // lingering void clouds hurt whoever stands in them
    for (const c of this.clouds) {
      c.t -= dt;
      if (Math.random() < dt * 30) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * 3;
        Particles.add(Particles.base(c.pos[0] + Math.cos(a) * r, c.pos[1] + rand(0, 0.6), c.pos[2] + Math.sin(a) * r, {
          vy: rand(0.2, 0.8), life: 1.2, max: 1.2, size: rand(0.3, 0.6), layer: T.p_smoke, r: 0.45, g: 0.15, b: 0.7, glow: true, blend: true, drag: 0.95, grow: 1.4, collide: false }));
      }
      if (Math.hypot(p.pos[0] - c.pos[0], p.pos[2] - c.pos[2]) < 3 && Math.abs(p.pos[1] - c.pos[1]) < 2.5 && DimMobs.survivalTarget()) {
        c.hurt = (c.hurt || 0) - dt;
        if (c.hurt <= 0) { c.hurt = 0.7; G.stats.damage(2, { type: 'magic', from: c.pos }); }
      }
    }
    this.clouds = this.clouds.filter((c) => c.t > 0);
  },

  // ------------------------------------------------------------------ crystals ----
  crystalWatch(dt) {
    const w = G.world;
    this.cwT = (this.cwT || 0) - dt;
    if (this.cwT > 0) return;
    this.cwT = 0.25;
    const list = this.crystalList();
    const alive = list.map((c) => (w.isLoaded(c[0], c[2]) ? w.getBlock(c[0], c[1], c[2]) === B.END_CRYSTAL : null));
    // arrows stuck in a crystal shatter it
    for (const a of Ents.arrows) {
      if (!a.stuck) continue;
      const bx = Math.floor(a.pos[0] + a.dir[0] * 0.1), by = Math.floor(a.pos[1] + a.dir[1] * 0.1), bz = Math.floor(a.pos[2] + a.dir[2] * 0.1);
      if (w.getBlock(bx, by, bz) === B.END_CRYSTAL) { editBlock(bx, by, bz, B.AIR); a.stuck = false; a.vel = [0, 0, 0]; }
    }
    if (this.lastAlive) {
      list.forEach((c, i) => {
        if (this.lastAlive[i] === true && alive[i] === false) {
          explode(c[0] + 0.5, c[1] + 0.5, c[2] + 0.5, 2.5, null);
          const left = alive.filter((v) => v === true).length;
          G.ui.toast(left ? 'A crystal shattered · ' + left + ' left' : 'All the crystals are gone: the Wyrm can no longer heal', 3000);
          if (this.mob && this.mob.ai && !this.mob.ai.dying) this.mob.damage(10, { explosion: true });
        }
      });
    }
    this.lastAlive = alive;
  },

  heal(m, dt) {
    if (m.health >= m.def.hp || !this.lastAlive) return;
    const head = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    let best = null, bd = 80;
    this.crystalList().forEach((c, i) => {
      if (this.lastAlive[i] !== true) return;
      const d = Math.hypot(c[0] + 0.5 - head[0], c[1] + 0.5 - head[1], c[2] + 0.5 - head[2]);
      if (d < bd) { bd = d; best = c; }
    });
    if (!best) return;
    m.health = Math.min(m.def.hp, m.health + 4 * dt);
    // the beam
    const a = [best[0] + 0.5, best[1] + 0.5, best[2] + 0.5];
    for (let i = 0; i < 6; i++) {
      const f = Math.random();
      Particles.add(Particles.base(a[0] + (head[0] - a[0]) * f, a[1] + (head[1] - a[1]) * f, a[2] + (head[2] - a[2]) * f, {
        life: 0.35, max: 0.35, size: rand(0.12, 0.2), layer: T.p_crit, r: 0.85, g: 0.5, b: 1, glow: true, drag: 1, collide: false, shrink: true }));
    }
  },

  // ------------------------------------------------------------------ the end ----
  // Instead of dying at once it rises in a storm of light, then bursts.
  onDeath(m, src) {
    m.ai.dying = 0.001; m.health = 1; m.invuln = 1e9; m.vel = [0, 2, 0];
    sfx('wyrm_death', null, 1, 1);
    G.ui.toast('The Void Wyrm is falling!', 4000);
  },
  dying(m, dt) {
    const ai = m.ai;
    ai.dying += dt;
    m.pos[1] += dt * 2.5;
    m.bodyYaw += dt * 0.6;
    m.flap += dt * 6;
    m.jaw = 1;
    const c = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    for (let i = 0; i < 10; i++) {
      const a = Math.random() * Math.PI * 2, e = rand(-1, 1), s = rand(10, 24), l = rand(0.6, 1.2);
      Particles.add(Particles.base(c[0], c[1], c[2], { vx: Math.cos(a) * Math.sqrt(1 - e * e) * s, vy: e * s, vz: Math.sin(a) * Math.sqrt(1 - e * e) * s,
        life: l, max: l, size: rand(0.2, 0.45), layer: T.p_crit, r: rand(0.7, 1), g: rand(0.5, 0.9), b: 1, glow: true, drag: 0.94, collide: false, shrink: true }));
    }
    this.trailStep(m);
    if (ai.dying < 6) return;
    // burst and rewards
    for (let i = 0; i < 4; i++) Particles.poof(c[0] + rand(-3, 3), c[1] + rand(-2, 2), c[2] + rand(-3, 3), 4, 4);
    sfx('explode', null, 1, 0.6);
    m.removed = true;
    this.mob = null;
    G.prog.wyrm = Date.now();
    const py = m.portalY || this.portalY() || 60;
    const [cx, cz] = this.center();
    const drop = (id, n) => Ents.spawnItem({ id, count: n }, cx + rand(-1, 1), py + 7, cz + rand(-1, 1));
    drop(I.VOID_WINGS, 1); drop(I.WYRM_SCALE, 8); drop(I.DIAMOND, 8); drop(I.EMERALD, 16); drop(I.GOLDEN_APPLE, 2);
    G.money = (G.money | 0) + 1000;
    if (G.ui.updateHud) G.ui.updateHud(true);
    if (typeof Progress !== 'undefined') Progress.event('wyrm');
    this.banner();
    this.creditsT = 12;
    saveWorld();
  },

  banner() {
    const b = $('placeBanner');
    b.innerHTML = '';
    const i = document.createElement('div'); i.className = 'pb-icon'; i.textContent = '🏆';
    const n = document.createElement('div'); n.className = 'pb-name'; n.textContent = 'THE VOID WYRM IS DEFEATED';
    const s = document.createElement('div'); s.className = 'pb-sub'; s.textContent = 'Void Wings, scales, gems and 1000 coins wait by the portal';
    b.append(i, n, s);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    sfx('chime', null, 1, 0.7);
  },

  updateBar() {
    const m = this.mob, p = G.player;
    const show = m && !m.removed && Math.hypot(m.pos[0] - p.pos[0], m.pos[2] - p.pos[2]) < 200;
    if (!this.bar) {
      this.bar = document.createElement('div');
      this.bar.id = 'bossBar';
      this.bar.innerHTML = '<b>VOID WYRM</b><div class="bb"><i></i></div><span></span>';
      $('hud').append(this.bar);
    }
    this.bar.classList.toggle('hidden', !show);
    if (!show) return;
    const frac = m.ai.dying ? 0 : m.health / m.def.hp;
    this.bar.querySelector('i').style.width = (frac * 100).toFixed(1) + '%';
    const left = this.lastAlive ? this.lastAlive.filter((v) => v === true).length : 0;
    const ph = frac > 0.6 ? 'Phase 1' : frac > 0.3 ? 'Phase 2 · it lands on the portal' : 'Phase 3 · enraged';
    this.bar.querySelector('span').textContent = ph + (left ? ' · ' + left + ' healing crystals' : '');
  },

  // Void Wings: hold jump while falling to glide where you look.
  glide(dt) {
    const p = G.player, keys = G.input && G.input.keys;
    p.gliding = false;
    if (!keys || G.vehicle || p.flying || p.onGround || G.stats.dead || !G.inv.count || !G.inv.count(I.VOID_WINGS)) return;
    if (!keys.has('Space') || p.vel[1] > -1.5) return;
    p.gliding = true;
    const f = p.lookDir(), sp = 11 + Math.max(0, -f[1]) * 16;
    p.vel[0] += (f[0] * sp - p.vel[0]) * Math.min(1, dt * 2);
    p.vel[2] += (f[2] * sp - p.vel[2]) * Math.min(1, dt * 2);
    p.vel[1] = Math.max(p.vel[1], -2 + f[1] * 8);
    p.fallStart = p.pos[1];
    this.glideSnd -= dt;
    if (this.glideSnd <= 0) { this.glideSnd = 0.5; sfx('wyrm_flap', null, 0.25, 1.6); }
    if (Math.random() < dt * 20) Particles.add(Particles.base(p.pos[0] + rand(-0.6, 0.6), p.pos[1] + 1, p.pos[2] + rand(-0.6, 0.6), {
      life: 0.6, max: 0.6, size: 0.08, layer: T.p_crit, r: 0.7, g: 0.45, b: 1, glow: true, drag: 0.9, collide: false, shrink: true }));
  },

  // ------------------------------------------------------------------ drawing ----
  frameAt(pos, fwd) {
    const f = fwd, l = Math.hypot(...f) || 1;
    const fz = [f[0] / l, f[1] / l, f[2] / l];
    let r = [-fz[2], 0, fz[0]];
    const rl = Math.hypot(r[0], r[2]) || 1;
    r = [r[0] / rl, 0, r[2] / rl];
    const u = [r[1] * fz[2] - r[2] * fz[1], r[2] * fz[0] - r[0] * fz[2], r[0] * fz[1] - r[1] * fz[0]];
    return { r, u, f: fz };
  },
  headFrame(m) {
    const yaw = m.bodyYaw, pit = m.lookPitch || 0;
    const f = [-Math.sin(yaw) * Math.cos(pit), Math.sin(pit), -Math.cos(yaw) * Math.cos(pit)];
    const h = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    return { f, mouth: [h[0] + f[0] * 2.2, h[1] + f[1] * 2.2 - 0.2, h[2] + f[2] * 2.2] };
  },

  render(m, cp) {
    if (!m.trail) return;
    const head = [m.pos[0], m.pos[1] + m.h / 2, m.pos[2]];
    ER.lightAt(head[0], head[1], head[2]);
    const light = [Math.max(ER.light[0], 0.55), ER.light[1]];
    const hurt = m.hurtTime > 0 ? Math.min(1, m.hurtTime / 0.25) : 0;
    const sw = (n) => () => Vehicles.swatchUV(n);
    const put = (M, b, col, glow, swn) => {
      ER.light = light; ER.color = col; ER.ov = glow ? glow : hurt;
      ER.box(M, b[0], b[1], b[2], b[3], b[4], b[5], sw(swn || (glow ? 'glow' : 'hullDark')));
    };
    const mat = (pos, fr) => XF.mul(XF.t(pos[0] - cp[0], pos[1] - cp[1], pos[2] - cp[2]), XF.basis(fr.r, fr.u, fr.f));
    // body and tail along the flight path
    let prev = head;
    const segs = [];
    for (const s of WYRM_SEG) {
      const q = this.along(m, s[0]);
      const fr = this.frameAt(q, [prev[0] - q[0], prev[1] - q[1], prev[2] - q[2]]);
      segs.push({ q, fr, s });
      prev = q;
    }
    segs.forEach(({ q, fr, s }, i) => {
      const M = mat(q, fr), hw = s[1], hh = s[2], len = i < 3 ? 0.75 : i < 6 ? 1.05 : 0.8;
      put(M, [-hw, -hh, -len, hw, hh, len], WYRM_SCALES[s[3]]);
      // belly plates and a glowing spine ridge
      put(M, [-hw * 0.7, -hh - 0.08, -len * 0.8, hw * 0.7, -hh + 0.1, len * 0.8], [0.34, 0.24, 0.42]);
      const ridge = Math.max(0.15, hh * 0.45);
      put(M, [-0.1, hh, -len * 0.4, 0.1, hh + ridge, len * 0.3], WYRM_GLOW, 2.6);
      if (i === WYRM_SEG.length - 1) {
        // tail fin
        put(M, [-0.05, -0.9, 0.2, 0.05, 0.9, 1.8], WYRM_GLOW, 2.2);
      }
      if (s[3] === 1 && i === 3) this.wings(m, M, put);
      if (s[3] === 1 && (i === 4 || i === 5)) {
        // tucked legs with claws
        for (const sx of [-1, 1]) {
          put(M, [sx * hw * 0.6 - 0.18, -hh - 0.9, -0.2, sx * hw * 0.6 + 0.18, -hh, 0.25], WYRM_SCALES[0]);
          put(M, [sx * hw * 0.6 - 0.22, -hh - 1.05, -0.45, sx * hw * 0.6 + 0.22, -hh - 0.85, 0.2], [0.8, 0.78, 0.86], 0, 'white');
        }
      }
    });
    // head
    const hf = this.frameAt(head, (() => { const d = this.headFrame(m).f; return d; })());
    const H = mat(head, hf);
    put(H, [-0.75, -0.55, -1.1, 0.75, 0.6, 0.7], WYRM_SCALES[0]);                // skull
    put(H, [-0.5, -0.3, -2.3, 0.5, 0.25, -1.1], WYRM_SCALES[2]);                  // snout
    // lower jaw hinged at the back of the snout
    const J = XF.chain(H, XF.t(0, -0.3, -0.9), XF.rx(-(m.jaw || 0) * 0.55), XF.t(0, 0.3, 0.9));
    put(J, [-0.46, -0.62, -2.2, 0.46, -0.3, -0.9], WYRM_SCALES[1]);
    for (const sx of [-1, 1]) {
      put(J, [sx * 0.34 - 0.05, -0.34, -2.1, sx * 0.34 + 0.05, -0.18, -1.9], [0.9, 0.88, 0.92], 0, 'white');   // fangs
      put(H, [sx * 0.34 - 0.05, -0.45, -2.25, sx * 0.34 + 0.05, -0.3, -2.05], [0.9, 0.88, 0.92], 0, 'white');
      put(H, [sx * 0.5 - 0.14, 0.12, -1.25, sx * 0.5 + 0.14, 0.34, -1.02], WYRM_GLOW, 3.5);                   // eyes
      // swept-back horns
      const Hn = XF.chain(H, XF.t(sx * 0.5, 0.5, 0.2), XF.rx(-0.55), XF.rz(sx * -0.25));
      put(Hn, [-0.12, 0, -0.12, 0.12, 1.5, 0.12], [0.85, 0.8, 0.9], 0, 'white');
      put(Hn, [-0.07, 1.5, -0.07, 0.07, 1.9, 0.07], WYRM_GLOW, 2.4);
    }
    if (m.jaw > 0.3) put(H, [-0.3, -0.5, -2.05, 0.3, -0.35, -1.2], [0.8, 0.4, 1], 3.2);   // glowing throat
    ER.ov = 0; ER.color = [1, 1, 1];
  },

  // two great wings from the shoulders: arm, forearm and a membrane, beating with m.flap
  wings(m, M, put) {
    const a = Math.sin(m.flap) * 0.75 + (m.ai.state === 'dive' ? -0.45 : 0.1);
    for (const sx of [-1, 1]) {
      const S = XF.chain(M, XF.t(sx * 1.1, 0.8, -0.2), XF.rz(sx * a));
      put(S, sx > 0 ? [0, -0.15, -0.2, 5.2, 0.15, 0.2] : [-5.2, -0.15, -0.2, 0, 0.15, 0.2], [0.26, 0.16, 0.34]);
      const F = XF.chain(S, XF.t(sx * 5.1, 0, 0), XF.rz(sx * a * 0.6), XF.ry(sx * 0.25));
      put(F, sx > 0 ? [0, -0.1, -0.15, 5.5, 0.1, 0.15] : [-5.5, -0.1, -0.15, 0, 0.1, 0.15], [0.26, 0.16, 0.34]);
      put(F, sx > 0 ? [5.3, -0.12, -0.2, 5.9, 0.12, 0.25] : [-5.9, -0.12, -0.2, -5.3, 0.12, 0.25], WYRM_GLOW, 2.6);
      // membranes (thin slabs hanging back from each bone)
      put(S, sx > 0 ? [0.3, -0.05, 0.2, 5.1, 0.05, 3.6] : [-5.1, -0.05, 0.2, -0.3, 0.05, 3.6], [0.34, 0.14, 0.5]);
      put(F, sx > 0 ? [0, -0.05, 0.15, 5.4, 0.05, 2.6] : [-5.4, -0.05, 0.15, 0, 0.05, 2.6], [0.34, 0.14, 0.5]);
      // glowing trailing edges
      put(S, sx > 0 ? [0.3, -0.07, 3.5, 5.1, 0.07, 3.7] : [-5.1, -0.07, 3.5, -0.3, 0.07, 3.7], WYRM_GLOW, 1.8);
      put(F, sx > 0 ? [0, -0.07, 2.5, 5.4, 0.07, 2.7] : [-5.4, -0.07, 2.5, 0, 0.07, 2.7], WYRM_GLOW, 1.8);
    }
  },
};

// hook the Wyrm into the mob system
DimMobs.wyrm = (m, dt) => Wyrm.tick(m, dt);
{
  const die0 = Mob.prototype.die;
  Mob.prototype.die = function (src) {
    if (this.type === 'wyrm') return Wyrm.onDeath(this, src);
    return die0.call(this, src);
  };
  const mob0 = ER.mob;
  ER.mob = function (m0, mob, cp) {
    if (mob.type === 'wyrm') return Wyrm.render(mob, cp);
    return mob0.call(this, m0, mob, cp);
  };
}
MOB_MODELS.wyrm = [];

// ------------------------------------------------------------------ items and sounds ----
defItem(I.VOID_WINGS, 'Void Wings', { sprite: 'i_void_wings', stack: 1, cat: 'combat' });
defItem(I.WYRM_SCALE, 'Wyrm Scale', { sprite: 'i_wyrm_scale' });
sprite('i_void_wings', (d) => {
  for (const sx of [-1, 1]) {
    const x = (v) => 16 + sx * v;
    sprPoly(d, [[x(1), 8], [x(14), 4], [x(15), 9], [x(12), 22], [x(3), 26]], [58, 30, 86]);
    sprSeg(d, x(1), 8, x(14), 4, 1.2, [150, 90, 230]);
    sprSeg(d, x(14), 4, x(12), 22, 0.8, [110, 70, 170]);
    sprSeg(d, x(8), 6, x(7), 24, 0.7, [110, 70, 170]);
  }
  sprRect(d, 14, 6, 18, 12, [200, 150, 255]);
});
sprite('i_wyrm_scale', (d) => {
  sprPoly(d, [[16, 4], [26, 12], [22, 26], [10, 26], [6, 12]], [70, 36, 104]);
  sprPoly(d, [[16, 8], [22, 13], [19, 22], [13, 22], [10, 13]], [120, 70, 180]);
  sprSeg(d, 16, 7, 16, 23, 0.7, [190, 150, 250]);
});
// scales make a chestplate-strength armour piece? keep it simple: they trade well at the bank
if (typeof BANK_BUYS !== 'undefined') BANK_BUYS.push([I.WYRM_SCALE, 60]);

SYNTH.wyrm_roar = (ctx, o, t, p) => {
  Sound.tone(ctx, o, t, 1.8, { wave: 'sawtooth', f0: 95 * p, f1: 55 * p, am: 9, filter: ['lowpass', 700, 2], gain: 0.55 });
  Sound.tone(ctx, o, t + 0.1, 1.6, { wave: 'square', f0: 142 * p, f1: 70 * p, vib: [7, 12], filter: ['lowpass', 1200, 3], gain: 0.2 });
  Sound.noise(ctx, o, t, 1.6, { type: 'bandpass', freq: 600, freqEnd: 250, q: 0.8, gain: 0.4, attack: 0.1 });
};
SYNTH.wyrm_hurt = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.5, { wave: 'sawtooth', f0: 200 * p, f1: 110 * p, filter: ['lowpass', 1300, 2], gain: 0.45 }); };
SYNTH.wyrm_death = (ctx, o, t) => {
  Sound.tone(ctx, o, t, 5.5, { wave: 'sawtooth', f0: 160, f1: 30, am: 5, filter: ['lowpass', 900, 2], gain: 0.55 });
  [262, 330, 392, 523].forEach((f, i) => Sound.tone(ctx, o, t + 1 + i * 0.6, 3, { f0: f, gain: 0.08, vib: [5, 5], attack: 0.4 }));
};
SYNTH.wyrm_flap = (ctx, o, t, p) => { Sound.noise(ctx, o, t, 0.35, { type: 'lowpass', freq: 380 * p, gain: 0.6, attack: 0.05 }); };
SYNTH.wyrm_orb = (ctx, o, t) => { Sound.tone(ctx, o, t, 0.5, { wave: 'triangle', f0: 700, f1: 180, vib: [30, 40], gain: 0.25 }); };
SYNTH.wyrm_burst = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.6, { type: 'bandpass', freq: 900, freqEnd: 200, q: 0.7, gain: 0.5 }); Sound.tone(ctx, o, t, 0.4, { f0: 240, f1: 60, gain: 0.25 }); };
SYNTH.wyrm_breath = (ctx, o, t) => { Sound.noise(ctx, o, t, 1.6, { type: 'bandpass', freq: 500, freqEnd: 1400, q: 0.6, gain: 0.5, attack: 0.15 }); };
