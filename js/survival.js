'use strict';
// Survival stats: health, hunger/saturation/exhaustion, air, fire, fall damage, regeneration,
// armour and death.

const DEATH_TEXT = {
  fall: 'fell from a high place', lava: 'tried to swim in lava', fire: 'burned to death', drown: 'drowned',
  starve: 'starved to death', cactus: 'was pricked to death', void: 'fell out of the world', explosion: 'blew up',
  arrow: 'was shot by a Skeleton', mob: 'was slain by', generic: 'died',
};

class Stats {
  constructor() { this.reset(); }

  reset() {
    this.health = 20; this.food = 20; this.sat = 5; this.exh = 0; this.air = 10;
    this.fire = 0; this.fireT = 0; this.lavaT = 0; this.cactusT = 0; this.voidT = 0; this.drownT = 0;
    this.regenT = 0; this.starveT = 0; this.invuln = 0; this.lastHurt = 0; this.regenEffect = 0; this.regenEffectT = 0;
    this.dead = false; this.deathMsg = ''; this.hurtFlash = 0; this.hurtTilt = 0; this.healFlash = 0;
  }

  get creative() { return G.mode !== 'survival'; }

  addExhaustion(x) { if (!this.creative && G.difficulty > 0) this.exh += x; }

  update(dt, p) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    this.hurtTilt *= Math.exp(-dt * 6);
    this.healFlash = Math.max(0, this.healFlash - dt * 3);
    this.invuln -= dt;
    if (this.dead) return;
    if (this.creative) {
      this.health = 20; this.food = 20; this.air = 10; this.fire = 0; p.landed = 0;
      if (p.pos[1] < -40) { p.pos[1] = CH + 10; p.vel[1] = 0; }
      return;
    }
    const w = G.world;
    // falling
    if (p.landed > 0) {
      const d = Math.floor(p.landed - 3);
      const soft = w.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] - 0.2), Math.floor(p.pos[2])) === B.HAY_BALE;
      if (d > 0) this.damage(soft ? Math.floor(d * 0.2) : d, { type: 'fall' });
      if (p.landed > 1.5) sfx('land', p.pos, Math.min(1, p.landed / 8), 1);
      p.landed = 0;
    }
    // hunger costs
    if (p.sprinting && p.onGround) this.addExhaustion(0.1 * Math.hypot(p.vel[0], p.vel[2]) * dt);
    else if (p.inWater && (p.vel[0] || p.vel[2])) this.addExhaustion(0.015 * Math.hypot(p.vel[0], p.vel[2]) * dt);
    if (p.jumped) this.addExhaustion(p.sprinting ? 0.2 : 0.05);
    while (this.exh >= 4) {
      this.exh -= 4;
      if (this.sat > 0) this.sat = Math.max(0, this.sat - 1);
      else if (G.difficulty > 0) this.food = Math.max(0, this.food - 1);
    }
    // air
    if (p.eyeInWater) {
      this.air -= dt / 1.5;
      if (this.air < 0) {
        this.air = 0;
        this.drownT += dt;
        if (this.drownT >= 1) { this.drownT = 0; this.damage(2, { type: 'drown' }); }
      }
      if (Math.random() < dt * 3) { const e = p.eyePos(); Particles.bubble(e[0] + rand(-0.3, 0.3), e[1] - 0.2, e[2] + rand(-0.3, 0.3)); }
    } else { this.air = Math.min(10, this.air + dt * 5); this.drownT = 0; }
    // lava and fire
    if (p.inLava) {
      this.fire = 7;
      this.lavaT -= dt;
      if (this.lavaT <= 0) { this.lavaT = 0.5; this.damage(4, { type: 'lava' }); }
    } else this.lavaT = 0;
    if (p.inWater && this.fire > 0) { this.fire = 0; sfx('fizz', p.pos, 0.7, 1); }
    if (this.fire > 0) {
      this.fire -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) { this.fireT = 1; if (!p.inLava) this.damage(1, { type: 'fire' }); }
    }
    // cactus contact
    this.cactusT -= dt;
    if (this.cactusT <= 0 && this.touching(p, B.CACTUS)) { this.cactusT = 0.5; this.damage(1, { type: 'cactus' }); }
    // void
    if (p.pos[1] < -30) { this.voidT -= dt; if (this.voidT <= 0) { this.voidT = 0.5; this.damage(4, { type: 'void', bypass: true }); } }
    // regeneration and starvation
    if (G.difficulty === 0) {
      this.regenT += dt;
      if (this.regenT >= 1) { this.regenT = 0; if (this.health < 20) this.heal(1); if (this.food < 20) this.food++; }
    } else if (this.food >= 18 && this.health < 20) {
      this.regenT += dt;
      if (this.regenT >= (this.food >= 20 && this.sat > 0 ? 1 : 4)) { this.regenT = 0; this.heal(1); this.addExhaustion(6); }
    } else if (this.food <= 0) {
      this.starveT += dt;
      if (this.starveT >= 4) {
        this.starveT = 0;
        const floor = [20, 10, 1, 0][G.difficulty];
        if (this.health > floor) this.damage(1, { type: 'starve', bypass: true });
      }
    } else { this.regenT = 0; this.starveT = 0; }
    if (this.regenEffect > 0) {
      this.regenEffect -= dt;
      this.regenEffectT += dt;
      if (this.regenEffectT >= 1.25) { this.regenEffectT = 0; this.heal(1); }
    }
  }

  touching(p, id) {
    const e = 0.06;
    const x0 = Math.floor(p.pos[0] - PLAYER_HALF_W - e), x1 = Math.floor(p.pos[0] + PLAYER_HALF_W + e);
    const y0 = Math.floor(p.pos[1] - e), y1 = Math.floor(p.pos[1] + PLAYER_H);
    const z0 = Math.floor(p.pos[2] - PLAYER_HALF_W - e), z1 = Math.floor(p.pos[2] + PLAYER_HALF_W + e);
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) if (G.world.getBlock(x, y, z) === id) return true;
    return false;
  }

  heal(n) {
    if (this.dead) return;
    const before = this.health;
    this.health = Math.min(20, this.health + n);
    if (this.health > before) this.healFlash = 1;
  }

  eat(id) {
    const d = ITEM_DEF[id];
    if (!d || !d.food) return;
    this.food = Math.min(20, this.food + d.food[0]);
    this.sat = Math.min(this.food, this.sat + d.food[1]);
    if (d.regen) { this.regenEffect = d.regen; this.regenEffectT = 0; }
  }

  // Returns the damage actually dealt.
  damage(amount, src = {}) {
    if (this.dead || this.creative || amount <= 0) return 0;
    if (G.difficulty === 0 && (src.type === 'mob' || src.type === 'arrow')) return 0;
    if (this.invuln > 0) {
      if (amount <= this.lastHurt) return 0;
      const extra = amount - this.lastHurt;
      this.lastHurt = amount;
      amount = extra;
    } else { this.lastHurt = amount; this.invuln = 0.5; }
    if (src.type === 'mob' || src.type === 'arrow' || src.type === 'explosion' || src.type === 'cactus') {
      const pts = G.inv.armorPoints();
      if (pts > 0) { amount *= 1 - Math.min(0.8, pts * 0.04); G.inv.damageArmor(amount); G.ui && G.ui.invDirty(); }
    }
    const dmg = Math.max(0.5, Math.round(amount * 2) / 2);
    this.health = Math.max(0, this.health - dmg);
    this.addExhaustion(0.1);
    this.hurtFlash = 1;
    const p = G.player;
    let tilt = rand(-1, 1) > 0 ? 1 : -1;
    if (src.from) {
      const dx = p.pos[0] - src.from[0], dz = p.pos[2] - src.from[2], l = Math.hypot(dx, dz) || 1;
      const kb = src.type === 'explosion' ? 0 : 5;
      p.vel[0] += (dx / l) * kb; p.vel[2] += (dz / l) * kb;
      if (p.onGround && kb) p.vel[1] = Math.max(p.vel[1], 4.5);
      const rel = Math.atan2(dx, dz) - p.yaw;
      tilt = Math.sin(rel) > 0 ? -1 : 1;
    }
    this.hurtTilt = tilt;
    sfx('hurt', null, 0.9, rand(0.9, 1.1));
    G.ui && G.ui.hurt();
    if (this.health <= 0) this.die(src);
    return dmg;
  }

  die(src) {
    this.dead = true;
    // remembered on the world map (last five)
    const pp = G.player.pos;
    G.deaths = (G.deaths || []).concat([[Math.round(pp[0]), Math.round(pp[1]), Math.round(pp[2]), Date.now()]]).slice(-5);
    this.fire = 0;
    const who = src.mob ? (src.mob.def ? src.mob.def.name : 'something') : '';
    let msg = DEATH_TEXT[src.type] || DEATH_TEXT.generic;
    if (src.type === 'mob') msg += ' ' + (who || 'a monster');
    if (src.type === 'explosion' && src.mob && src.mob.def) msg = 'was blown up by a ' + src.mob.def.name;
    this.deathMsg = 'You ' + msg.replace(/^was /, 'were ');
    if (!G.rules.keepInventory) {
      const p = G.player.pos;
      const all = [...G.inv.slots, ...G.inv.armor];
      for (const s of all) if (s) Ents.spawnItem(cloneStack(s), p[0], p[1] + 1, p[2], [rand(-3, 3), rand(2, 5), rand(-3, 3)], 1.5);
      G.inv.clear();
      if (G.ui) { G.ui.dropCursor(); G.ui.invDirty(); }
    }
    sfx('death', null, 1, 1);
    G.ui && G.ui.showDeath(this.deathMsg);
  }

  serialize() {
    return { health: this.health, food: this.food, sat: this.sat, exh: this.exh, air: this.air, dead: this.dead };
  }

  load(o) {
    this.reset();
    if (!o || typeof o !== 'object') return;
    const num = (v, lo, hi, d) => (Number.isFinite(v) ? clamp(v, lo, hi) : d);
    this.health = num(o.health, 0, 20, 20); this.food = num(o.food, 0, 20, 20); this.sat = num(o.sat, 0, 20, 5);
    this.exh = num(o.exh, 0, 4, 0); this.air = num(o.air, 0, 10, 10);
    if (this.health <= 0) this.health = 20;
  }
}
