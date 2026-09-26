'use strict';
// Entities: mobs with simple AI, dropped items, arrows, primed TNT, falling sand/gravel and
// particles. Spawning and despawning around the player also live here.

const MOB_TYPES = {
  pig: { name: 'Pig', hw: 0.45, h: 0.9, hp: 10, speed: 2.2, drops: [[I.RAW_PORK, 1, 3]], cooked: { [I.RAW_PORK]: I.COOKED_PORK } },
  cow: { name: 'Cow', hw: 0.45, h: 1.4, hp: 10, speed: 2.0, drops: [[I.RAW_BEEF, 1, 3], [I.LEATHER, 0, 2]], cooked: { [I.RAW_BEEF]: I.STEAK } },
  sheep: { name: 'Sheep', hw: 0.45, h: 1.3, hp: 8, speed: 2.1, drops: [[I.RAW_MUTTON, 1, 2]], cooked: { [I.RAW_MUTTON]: I.COOKED_MUTTON } },
  chicken: { name: 'Chicken', hw: 0.22, h: 0.7, hp: 4, speed: 2.1, drops: [[I.RAW_CHICKEN, 1, 1], [I.FEATHER, 0, 2]], cooked: { [I.RAW_CHICKEN]: I.COOKED_CHICKEN } },
  zombie: { name: 'Zombie', hw: 0.3, h: 1.95, hp: 20, speed: 2.5, hostile: true, dmg: [2, 3, 4], drops: [[I.ROTTEN_FLESH, 0, 2]], undead: true },
  skeleton: { name: 'Skeleton', hw: 0.3, h: 1.95, hp: 20, speed: 2.5, hostile: true, ranged: true, drops: [[I.BONE, 0, 2], [I.ARROW, 0, 2]], undead: true },
  spider: { name: 'Spider', hw: 0.65, h: 0.9, hp: 16, speed: 3.3, hostile: true, dmg: [2, 2, 3], drops: [[I.STRING, 0, 2]], climbs: true },
  villager: { name: 'Villager', hw: 0.3, h: 1.95, hp: 20, speed: 1.9, villager: true, drops: [] },
  fusecap: { name: 'Fusecap', hw: 0.3, h: 1.7, hp: 20, speed: 2.4, hostile: true, explodes: true, drops: [[I.GUNPOWDER, 0, 2]] },
};
const PASSIVE_TYPES = ['pig', 'cow', 'sheep', 'chicken'];
const HOSTILE_WEIGHTS = [['zombie', 30], ['skeleton', 24], ['spider', 20], ['fusecap', 18]];

function isDaytime() { return Math.sin(G.dayTime * Math.PI * 2) > 0.06; }
function rand(a, b) { return a + Math.random() * (b - a); }
function sfx(name, pos, vol, pitch) { if (typeof Sound !== 'undefined') Sound.play(name, pos, vol, pitch); }

// ---------------------------------------------------------------- mobs ----
class Mob {
  constructor(type, x, y, z) {
    const t = MOB_TYPES[type];
    this.type = type; this.def = t;
    this.pos = [x, y, z]; this.vel = [0, 0, 0];
    this.hw = t.hw; this.h = t.h;
    this.health = t.hp;
    this.bodyYaw = Math.random() * Math.PI * 2; this.headYaw = this.bodyYaw; this.headPitch = 0;
    this.onGround = false; this.collidedH = false;
    this.walkPhase = 0; this.walkAmt = 0;
    this.hurtTime = 0; this.invuln = 0; this.dead = false; this.deathTime = 0; this.removed = false;
    this.age = 0; this.fire = 0; this.fireTick = 0; this.envTick = 0;
    this.ai = { state: 'idle', timer: rand(0.5, 3), tx: x, tz: z, target: null, losT: 0, attackCd: 0, shootCd: rand(1, 2) };
    this.fallStart = null; this.farTime = 0;
    this.fuse = 0; this.sheared = false; this.woolColor = 0; this.aiming = 0; this.flap = 0;
    this.soundT = rand(4, 12);
    if (type === 'sheep') { const r = Math.random(); this.woolColor = r < 0.8 ? 0 : r < 0.88 ? 7 : r < 0.94 ? 8 : r < 0.97 ? 15 : 12; }
  }

  get center() { return [this.pos[0], this.pos[1] + this.h / 2, this.pos[2]]; }

  damage(amount, src = {}) {
    if (this.dead || this.invuln > 0 || amount <= 0) return false;
    if (this.remote && src.player) {
      // the host applies the hit; show it here right away
      Net.mobHit(this, amount, src);
      this.hurtTime = 0.4; this.invuln = 0.45;
      sfx(this.type + '_hurt', this.pos, 1, rand(0.9, 1.1));
      return true;
    }
    this.health -= amount;
    this.hurtTime = 0.4;
    this.invuln = 0.45;
    sfx(this.type + '_hurt', this.pos, 1, rand(0.9, 1.1));
    if (src.from) {
      const dx = this.pos[0] - src.from[0], dz = this.pos[2] - src.from[2], l = Math.hypot(dx, dz) || 1;
      const kb = src.knock !== undefined ? src.knock : 1;
      this.vel[0] += (dx / l) * 6 * kb; this.vel[2] += (dz / l) * 6 * kb;
      if (this.onGround) this.vel[1] = 4.6 * Math.min(1.2, kb);
    }
    if (src.player && !this.def.hostile) { this.ai.state = 'panic'; this.ai.timer = rand(3, 5); this.pickTarget(10, src.from); }
    if (src.player && this.def.hostile) this.ai.target = G.player;
    if (src.player && this.type === 'spider') this.ai.target = G.player;
    if (this.health <= 0) this.die(src);
    return true;
  }

  die(src) {
    this.dead = true;
    this.deathTime = 0;
    this.health = 0;
    sfx(this.type + '_death', this.pos, 1, rand(0.9, 1.1));
    if (!src.noDrops && (src.player || src.fire || src.explosion || src.env)) {
      for (const [id, a, b] of this.def.drops) {
        let n = a + Math.floor(Math.random() * (b - a + 1));
        if (src.looting) n += Math.floor(Math.random() * (src.looting + 1));
        const out = this.fire > 0 && this.def.cooked && this.def.cooked[id] ? this.def.cooked[id] : id;
        if (n > 0) Ents.spawnItem({ id: out, count: n }, this.pos[0], this.pos[1] + 0.5, this.pos[2]);
      }
      if (this.type === 'sheep' && !this.sheared) Ents.spawnItem({ id: B.WOOL + this.woolColor, count: 1 }, this.pos[0], this.pos[1] + 0.5, this.pos[2]);
    }
  }

  // Random walk target that avoids water and cliffs.
  pickTarget(range, awayFrom) {
    const w = G.world;
    for (let tries = 0; tries < 8; tries++) {
      let a = Math.random() * Math.PI * 2;
      if (awayFrom) a = Math.atan2(this.pos[2] - awayFrom[2], this.pos[0] - awayFrom[0]) + rand(-0.8, 0.8);
      const d = rand(range * 0.4, range);
      const tx = this.pos[0] + Math.cos(a) * d, tz = this.pos[2] + Math.sin(a) * d;
      const h = w.surfaceHeight(Math.floor(tx), Math.floor(tz));
      if (h < 0) continue;
      const top = w.getBlock(Math.floor(tx), h, Math.floor(tz));
      if (IS_LIQUID(top) && !awayFrom) continue;
      if (Math.abs(h + 1 - this.pos[1]) > 6 && !awayFrom) continue;
      this.ai.tx = tx; this.ai.tz = tz;
      // villagers keep to their village
      if (this.home && !awayFrom && Math.hypot(tx - this.home[0], tz - this.home[1]) > this.homeR) {
        const a2 = Math.random() * Math.PI * 2, d2 = Math.random() * this.homeR * 0.6;
        this.ai.tx = this.home[0] + Math.cos(a2) * d2; this.ai.tz = this.home[1] + Math.sin(a2) * d2;
      }
      return true;
    }
    this.ai.tx = this.pos[0]; this.ai.tz = this.pos[2];
    return false;
  }

  canSee(p) {
    const e = [this.pos[0], this.pos[1] + this.h * 0.85, this.pos[2]];
    const t = p.eyePos();
    const dx = t[0] - e[0], dy = t[1] - e[1], dz = t[2] - e[2];
    const n = Math.ceil(Math.hypot(dx, dy, dz) * 3);
    for (let i = 1; i < n; i++) {
      const id = G.world.getBlock(Math.floor(e[0] + dx * i / n), Math.floor(e[1] + dy * i / n), Math.floor(e[2] + dz * i / n));
      if (BLOCK_OPAQUE[id]) return false;
    }
    return true;
  }

  update(dt) {
    this.age += dt;
    if (this.remote) {
      // another player (the server's host) runs this villager: glide to where it says
      const n = this.net;
      if (!n || performance.now() - n.t > 3000) { this.remote = false; this.net = null; }
      else {
        const k = 1 - Math.exp(-dt * 8);
        const ox = this.pos[0], oz = this.pos[2];
        this.pos[0] += (n.x - this.pos[0]) * k; this.pos[1] += (n.y - this.pos[1]) * k; this.pos[2] += (n.z - this.pos[2]) * k;
        let d = n.yaw - this.bodyYaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        this.bodyYaw += d * k;
        this.headYaw = this.bodyYaw;
        const hs = Math.hypot(this.pos[0] - ox, this.pos[2] - oz) / Math.max(dt, 1e-3);
        this.walkAmt += (Math.min(1, hs / 2.5) - this.walkAmt) * Math.min(1, dt * 10);
        this.walkPhase += dt * hs * 3.2;
        this.hurtTime = Math.max(0, this.hurtTime - dt);
        this.invuln -= dt;
        return;
      }
    }
    if (this.dead) {
      this.deathTime += dt;
      this.vel[0] *= 0.9; this.vel[2] *= 0.9;
      this.physics(dt, 0, 0, false, 0);
      if (this.deathTime > 0.9) {
        this.removed = true;
        Particles.poof(this.pos[0], this.pos[1] + this.h / 2, this.pos[2], this.hw * 2, this.h);
      }
      return;
    }
    this.hurtTime = Math.max(0, this.hurtTime - dt);
    this.invuln -= dt;
    this.ai.attackCd -= dt;
    const p = G.player;
    const w = G.world;
    const def = this.def;
    const survival = G.mode === 'survival' && !G.stats.dead;
    const dx = p.pos[0] - this.pos[0], dz = p.pos[2] - this.pos[2], dy = p.pos[1] - this.pos[1];
    const distP = Math.hypot(dx, dy, dz);

    // ambient sounds
    this.soundT -= dt;
    if (this.soundT <= 0) { this.soundT = rand(6, 16); if (distP < 20) sfx(this.type + '_say', this.pos, 0.8, rand(0.9, 1.1)); }

    // --- AI ---
    let mx = 0, mz = 0, speed = def.speed, jump = false;
    const ai = this.ai;
    if (def.hostile) {
      const nightOrDark = !isDaytime() || ((w.getLight(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 1), Math.floor(this.pos[2])) >> 4) < 10);
      const aggressive = this.type !== 'spider' || nightOrDark || ai.target;
      ai.losT -= dt;
      if (!survival || G.difficulty === 0) ai.target = null;
      else if (!ai.target && aggressive && distP < 16 && ai.losT <= 0) { ai.losT = 0.5; if (this.canSee(p)) ai.target = p; }
      else if (ai.target && distP > 28) ai.target = null;
    }
    if (ai.target) {
      const hd = Math.hypot(dx, dz) || 1;
      this.headYaw = Math.atan2(dx, dz);
      this.headPitch = Math.atan2(dy + 1.2 - this.h * 0.85, hd);
      if (def.ranged) {
        ai.losT -= dt;
        if (ai.losT <= 0) { ai.losT = 0.4; ai.see = this.canSee(p); }
        const want = hd > 11 ? 1 : hd < 5 ? -1 : 0;
        mx = (dx / hd) * want; mz = (dz / hd) * want;
        if (!want) { mx = -dz / hd * 0.5 * Math.sin(this.age * 0.7); mz = dx / hd * 0.5 * Math.sin(this.age * 0.7); }
        ai.shootCd -= dt;
        this.aiming = Math.max(0, this.aiming - dt);
        if (ai.see && hd < 16) {
          this.aiming = 1;
          if (ai.shootCd <= 0) {
            ai.shootCd = rand(1.4, 2.4) - G.difficulty * 0.2;
            this.shoot(p);
          }
        }
      } else if (def.explodes) {
        if (hd > 2.2 || this.fuse <= 0) { mx = dx / hd; mz = dz / hd; }
        if (distP < 3 && this.canSee(p)) {
          if (this.fuse === 0) sfx('fuse', this.pos, 1, 1);
          this.fuse += dt;
        } else if (distP > 6) this.fuse = Math.max(0, this.fuse - dt);
        if (this.fuse >= 1.5) {
          this.removed = true; this.dead = true;
          explode(this.pos[0], this.pos[1] + 0.8, this.pos[2], 3, this);
          return;
        }
      } else {
        mx = dx / hd; mz = dz / hd;
        speed *= this.type === 'zombie' ? 1.1 : 1.15;
        // spiders pounce
        if (this.type === 'spider' && this.onGround && hd > 2 && hd < 4.5 && Math.random() < dt * 1.5) {
          this.vel[1] = 6; this.vel[0] += (dx / hd) * 4; this.vel[2] += (dz / hd) * 4;
        }
        const reach = this.hw + PLAYER_HALF_W + 0.55;
        if (hd < reach && dy > -this.h && dy < 1.6 && ai.attackCd <= 0) {
          ai.attackCd = 1.0;
          const dmg = def.dmg[Math.max(0, G.difficulty - 1)] || def.dmg[1];
          G.stats.damage(dmg, { type: 'mob', mob: this, from: this.pos });
        }
      }
      if (this.fuse > 0 && ai.target === null) this.fuse = Math.max(0, this.fuse - dt);
    } else {
      this.fuse = Math.max(0, this.fuse - dt);
      this.aiming = Math.max(0, this.aiming - dt);
      ai.timer -= dt;
      if (ai.state === 'panic') {
        speed *= 1.7;
        if (ai.timer <= 0) { ai.state = 'idle'; ai.timer = rand(1, 3); }
        else if (Math.hypot(ai.tx - this.pos[0], ai.tz - this.pos[2]) < 1) this.pickTarget(8, null);
      } else if (ai.timer <= 0) {
        if (def.villager && this.trading) { ai.state = 'idle'; ai.timer = 1; }
        else if (def.villager && !isDaytime() && Math.random() < 0.7) { ai.state = 'idle'; ai.timer = rand(4, 10); }
        else if (ai.state === 'walk' || Math.random() < 0.35) { ai.state = 'idle'; ai.timer = rand(2, 6); }
        else { ai.state = 'walk'; ai.timer = rand(4, 9); this.pickTarget(def.hostile ? 6 : 9, null); }
      }
      if (ai.state === 'walk' || ai.state === 'panic') {
        const tx = ai.tx - this.pos[0], tz = ai.tz - this.pos[2], l = Math.hypot(tx, tz);
        if (l > 0.7) { mx = tx / l; mz = tz / l; if (ai.state === 'walk') speed *= 0.6; }
        else if (ai.state === 'walk') { ai.state = 'idle'; ai.timer = rand(2, 5); }
      }
      // passive mobs glance at a nearby player
      if (this.trading) { this.headYaw = Math.atan2(dx, dz); this.headPitch = Math.atan2(dy + 1.5 - this.h, Math.hypot(dx, dz)); this.bodyYaw = this.headYaw; }
      else if (!def.hostile && distP < 7 && ai.state === 'idle') {
        this.headYaw = Math.atan2(dx, dz);
        this.headPitch = Math.atan2(dy + 1.5 - this.h, Math.hypot(dx, dz));
      } else if (mx || mz) { this.headYaw = Math.atan2(mx, mz); this.headPitch *= 0.9; }
    }

    // cliff and liquid avoidance when strolling
    if ((mx || mz) && !ai.target && this.onGround) {
      const ax = Math.floor(this.pos[0] + mx * (this.hw + 0.5)), az = Math.floor(this.pos[2] + mz * (this.hw + 0.5));
      const fy = Math.floor(this.pos[1]);
      let drop = 0;
      while (drop < 4 && !solidHeight(w, ax, fy - 1 - drop, az) && !IS_LIQUID(w.getBlock(ax, fy - 1 - drop, az))) drop++;
      const liquidAhead = IS_LIQUID(w.getBlock(ax, fy, az)) || IS_LIQUID(w.getBlock(ax, fy - 1, az));
      if (drop >= 3 || (liquidAhead && !this.inLiquid) || w.getBlock(ax, fy, az) === B.LAVA) { mx = 0; mz = 0; ai.state = 'idle'; ai.timer = rand(0.5, 2); }
    }
    if (mx || mz) {
      const want = Math.atan2(mx, mz);
      let d = want - this.bodyYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.bodyYaw += d * Math.min(1, dt * 8);
    }
    if (this.collidedH && (mx || mz) && this.onGround) jump = true;

    this.physics(dt, mx * speed, mz * speed, jump, speed);

    // walk animation
    const hs = Math.hypot(this.vel[0], this.vel[2]);
    this.walkAmt += (Math.min(1, hs / 2.5) - this.walkAmt) * Math.min(1, dt * 10);
    this.walkPhase += dt * hs * 3.2;
    this.flap = this.onGround ? this.flap * 0.8 : this.flap + dt * 18;

    // environment
    this.envTick -= dt;
    if (this.envTick <= 0) {
      this.envTick = 0.5;
      const bx = Math.floor(this.pos[0]), by = Math.floor(this.pos[1] + 0.3), bz = Math.floor(this.pos[2]);
      const feet = w.getBlock(bx, by, bz);
      if (feet === B.LAVA) { this.fire = 8; this.damage(4, { fire: true, env: true }); }
      if (feet === B.CACTUS || w.getBlock(bx + 1, by, bz) === B.CACTUS) this.damage(1, { env: true });
      if (def.undead && isDaytime() && !this.inLiquid) {
        const L = w.getLight(bx, Math.floor(this.pos[1] + this.h - 0.2), bz);
        if ((L >> 4) >= 15) this.fire = Math.max(this.fire, 3);
      }
      if (this.fire > 0) {
        if (this.inLiquid && feet === B.WATER) this.fire = 0;
        else { this.damage(1, { fire: true, env: true }); }
      }
      if (this.type === 'sheep' && this.sheared && w.getBlock(bx, by - 1, bz) === B.GRASS && Math.random() < 0.02) {
        this.sheared = false; editBlock(bx, by - 1, bz, B.DIRT);
      }
      if (this.pos[1] < -20) this.damage(100, { env: true });
    }
    if (this.fire > 0) {
      this.fire -= dt;
      if (Math.random() < dt * 12) Particles.flame(this.pos[0] + rand(-this.hw, this.hw), this.pos[1] + rand(0, this.h), this.pos[2] + rand(-this.hw, this.hw));
    }
  }

  physics(dt, wx, wz, jump, speed) {
    const w = G.world, v = this.vel;
    const feet = w.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.3), Math.floor(this.pos[2]));
    this.inLiquid = IS_LIQUID(feet);
    if (this.inLiquid) {
      const r = 1 - Math.exp(-dt * 4);
      v[0] += (wx * 0.6 - v[0]) * r; v[2] += (wz * 0.6 - v[2]) * r;
      v[1] += (2.2 - v[1]) * (1 - Math.exp(-dt * 3)); // float
      if (this.collidedH && (wx || wz)) v[1] = 5;
    } else {
      const r = 1 - Math.exp(-dt * (this.onGround ? 12 : 1.5));
      if (wx || wz || this.onGround) { v[0] += (wx - v[0]) * r; v[2] += (wz - v[2]) * r; }
      v[1] -= GRAVITY * dt;
      if (this.type === 'chicken' && v[1] < -3) v[1] = -3;
      if (v[1] < -50) v[1] = -50;
      if (jump) v[1] = 8.4;
      if (this.def.climbs && this.collidedH && (wx || wz)) v[1] = 3.2;
    }
    if (!w.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]))) { v[0] = v[1] = v[2] = 0; return; }
    const y0 = this.pos[1];
    bodyMove(w, this, v[0] * dt, v[1] * dt, v[2] * dt, 0.6, null);
    // fall damage
    if (this.onGround || this.inLiquid) {
      if (this.fallStart !== null && this.onGround && !this.inLiquid) {
        const fall = this.fallStart - this.pos[1];
        if (fall > 3.5 && this.type !== 'chicken') this.damage(Math.floor(fall - 3), { env: true });
      }
      this.fallStart = null;
    } else if (this.fallStart === null || this.pos[1] > this.fallStart) this.fallStart = Math.max(this.pos[1], y0);
    void speed;
  }

  shoot(p) {
    const e = [this.pos[0], this.pos[1] + 1.5, this.pos[2]];
    const t = p.eyePos();
    const dx = t[0] - e[0], dz = t[2] - e[2], dy = t[1] - 0.4 - e[1];
    const hd = Math.hypot(dx, dz);
    const sp = 24;
    const tFlight = hd / sp;
    const inacc = [0.35, 0.25, 0.14][Math.max(0, G.difficulty - 1)] || 0.25;
    const vy = dy / tFlight + 0.5 * 20 * tFlight;
    const v = [dx / hd * sp + rand(-1, 1) * inacc * sp * 0.1, vy + rand(-1, 1) * inacc, dz / hd * sp + rand(-1, 1) * inacc * sp * 0.1];
    Ents.arrows.push(new Arrow(e, v, this, 2 + G.difficulty * 0.5));
    sfx('bow', this.pos, 0.9, rand(0.9, 1.2));
  }
}

// ---------------------------------------------------------- dropped items ----
class ItemEntity {
  constructor(stack, x, y, z) {
    this.stack = { id: stack.id, count: stack.count || 1, dmg: stack.dmg || 0 };
    if (stack.ench) this.stack.ench = Object.assign({}, stack.ench);
    this.pos = [x, y, z];
    this.vel = [rand(-1.2, 1.2), rand(2, 4), rand(-1.2, 1.2)];
    this.hw = 0.125; this.h = 0.25;
    this.onGround = false; this.collidedH = false;
    this.age = 0; this.pickupDelay = 0.5; this.spin = Math.random() * 6.28;
    this.removed = false; this.collecting = 0;
  }
  update(dt) {
    this.age += dt;
    this.pickupDelay -= dt;
    const w = G.world, v = this.vel;
    if (this.collecting > 0) {
      const e = G.player.pos;
      const t = Math.min(1, dt * 18);
      this.pos[0] += (e[0] - this.pos[0]) * t; this.pos[1] += (e[1] + 0.8 - this.pos[1]) * t; this.pos[2] += (e[2] - this.pos[2]) * t;
      this.collecting -= dt;
      if (this.collecting <= 0) this.removed = true;
      return;
    }
    if (!w.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]))) return;
    const inside = w.getBlock(Math.floor(this.pos[0]), Math.floor(this.pos[1] + 0.1), Math.floor(this.pos[2]));
    if (inside === B.LAVA) { this.removed = true; sfx('fizz', this.pos, 0.6, 1.2); Particles.smoke(this.pos[0], this.pos[1] + 0.3, this.pos[2], 4); return; }
    if (inside === B.WATER) { v[1] += (1.2 - v[1]) * Math.min(1, dt * 4); v[0] *= 0.96; v[2] *= 0.96; }
    else v[1] -= 18 * dt;
    if (this.onGround) { v[0] *= Math.pow(0.02, dt); v[2] *= Math.pow(0.02, dt); }
    // pushed out of blocks
    if (boxCollides(w, this.pos[0], this.pos[1], this.pos[2], this.hw, this.h)) { this.pos[1] += dt * 3; v[1] = 0; }
    else bodyMove(w, this, v[0] * dt, v[1] * dt, v[2] * dt, 0, null);
    if (this.age > 300 || this.pos[1] < -30) this.removed = true;
  }
}

// ------------------------------------------------------------------ arrows ----
class Arrow {
  constructor(pos, vel, shooter, dmg) {
    this.pos = pos.slice(); this.vel = vel.slice(); this.shooter = shooter; this.dmg = dmg;
    this.stuck = false; this.age = 0; this.removed = false; this.pickup = shooter === G.player && G.mode === 'survival';
  }
  update(dt) {
    this.age += dt;
    if (this.stuck) {
      if (this.age > 60) this.removed = true;
      // stuck arrows fall when their block is removed
      if (!BLOCK_SOLID[G.world.getBlock(Math.floor(this.pos[0] + this.dir[0] * 0.1), Math.floor(this.pos[1] + this.dir[1] * 0.1), Math.floor(this.pos[2] + this.dir[2] * 0.1))]) { this.stuck = false; this.vel = [0, 0, 0]; }
      return;
    }
    const v = this.vel;
    v[1] -= 20 * dt;
    const drag = Math.pow(0.97, dt * 20);
    v[0] *= drag; v[1] *= drag; v[2] *= drag;
    const sp = Math.hypot(v[0], v[1], v[2]);
    const len = sp * dt, n = Math.max(1, Math.ceil(len / 0.2));
    const d = [v[0] / sp, v[1] / sp, v[2] / sp];
    this.dir = d;
    for (let i = 0; i < n; i++) {
      const step = len / n;
      const nx = this.pos[0] + d[0] * step, ny = this.pos[1] + d[1] * step, nz = this.pos[2] + d[2] * step;
      // entities
      const targets = this.shooter === G.player ? Ents.mobs : [G.player, ...Ents.mobs.filter((m) => m !== this.shooter)];
      for (const t of targets) {
        if (t.dead || (t === G.player && (G.mode !== 'survival' || G.stats.dead))) continue;
        const hw = t.hw + 0.05;
        if (nx > t.pos[0] - hw && nx < t.pos[0] + hw && nz > t.pos[2] - hw && nz < t.pos[2] + hw && ny > t.pos[1] && ny < t.pos[1] + t.h) {
          const dmg = Math.ceil(sp * 0.16 * this.dmg / 2);
          if (t === G.player) G.stats.damage(dmg, { type: 'arrow', from: this.pos, mob: this.shooter });
          else t.damage(dmg, { player: this.shooter === G.player, from: [this.pos[0] - d[0], this.pos[1], this.pos[2] - d[2]], knock: 0.6 });
          sfx('arrow_hit', this.pos, 0.8, rand(1, 1.3));
          this.removed = true;
          return;
        }
      }
      const id = G.world.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz));
      if (BLOCK_SOLID[id] && ny - Math.floor(ny) < BLOCK_HEIGHT[id] / 16) {
        this.stuck = true; this.age = 0;
        sfx('arrow_hit', this.pos, 0.6, rand(0.8, 1));
        if (id === B.TNT && this.fireArrow) igniteTNT(Math.floor(nx), Math.floor(ny), Math.floor(nz));
        return;
      }
      this.pos[0] = nx; this.pos[1] = ny; this.pos[2] = nz;
    }
    if (this.age > 30 || this.pos[1] < -20) this.removed = true;
  }
}

// ------------------------------------------------------------ primed TNT ----
class PrimedTNT {
  constructor(x, y, z, fuse) {
    this.pos = [x + 0.5, y, z + 0.5]; this.vel = [rand(-0.6, 0.6), 3, rand(-0.6, 0.6)];
    this.hw = 0.49; this.h = 0.98; this.onGround = false; this.collidedH = false;
    this.fuse = fuse; this.removed = false; this.age = 0;
  }
  update(dt) {
    this.age += dt;
    const v = this.vel;
    v[1] -= 20 * dt;
    if (this.onGround) { v[0] *= 0.8; v[2] *= 0.8; }
    bodyMove(G.world, this, v[0] * dt, v[1] * dt, v[2] * dt, 0, null);
    if (Math.random() < dt * 10) Particles.smoke(this.pos[0], this.pos[1] + 1.05, this.pos[2], 1, 0.4);
    this.fuse -= dt;
    // a TNT shown for someone else's chain reaction vanishes: their blast arrives over the network
    if (this.fuse <= 0) { this.removed = true; if (!this.fake || !Net.on) explode(this.pos[0], this.pos[1] + 0.5, this.pos[2], 4, this); }
  }
}

// -------------------------------------------------- falling sand / gravel ----
class FallingBlock {
  constructor(id, x, y, z) {
    this.id = id; this.pos = [x + 0.5, y, z + 0.5]; this.vel = [0, 0, 0];
    this.hw = 0.49; this.h = 0.98; this.onGround = false; this.collidedH = false; this.removed = false; this.age = 0;
  }
  update(dt) {
    this.age += dt;
    this.vel[1] = Math.max(this.vel[1] - 24 * dt, -40);
    bodyMove(G.world, this, 0, this.vel[1] * dt, 0, 0, null);
    const x = Math.floor(this.pos[0]), y = Math.floor(this.pos[1] + 0.02), z = Math.floor(this.pos[2]);
    if (this.onGround || this.age > 20) {
      this.removed = true;
      const cur = G.world.getBlock(x, y, z);
      if (BLOCK_REPLACE[cur] || BLOCK_RT[cur] === RT_CROSS) {
        editBlock(x, y, z, this.id);
        sfx('place_' + BLOCK_SOUND[this.id], [x + 0.5, y, z + 0.5], 0.8, 0.9);
        checkFalling(x, y, z);
      } else Ents.spawnItem({ id: this.id, count: 1 }, x + 0.5, y + 0.5, z + 0.5);
    }
    if (this.pos[1] < -20) this.removed = true;
  }
}
const FALLING = new Set([B.SAND, B.GRAVEL, B.WHITE_SAND, B.RED_SAND, B.ASH]);
function checkFalling(x, y, z) {
  const w = G.world;
  const id = w.getBlock(x, y, z);
  if (!FALLING.has(id) || y <= 0) return;
  const below = w.getBlock(x, y - 1, z);
  if (BLOCK_REPLACE[below] || (BLOCK_RT[below] === RT_CROSS)) {
    editBlock(x, y, z, B.AIR);
    Ents.falling.push(new FallingBlock(id, x, y, z));
  }
}

// --------------------------------------------------------------- particles ----
const Particles = {
  list: [],
  add(p) { if (this.list.length < 2500) this.list.push(p); },
  base(x, y, z, o) {
    return Object.assign({ x, y, z, vx: 0, vy: 0, vz: 0, life: 1, max: 1, size: 0.1, layer: T.p_smoke, u0: 0, v0: 0, us: 1,
      r: 1, g: 1, b: 1, grav: 0, blend: false, glow: false, drag: 0.98, collide: true }, o);
  },
  blockBreak(x, y, z, id) {
    const layer = BLOCK_TEX[id * 6 + (BLOCK_RT[id] === RT_CROSS ? 2 : 0)];
    const tint = BLOCK_TINT[id] ? [0.62, 0.86, 0.46] : [1, 1, 1];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) for (let k = 0; k < 4; k++) {
      if (Math.random() < 0.45) continue;
      const px = x + (i + 0.5) / 4, py = y + (j + 0.5) / 4, pz = z + (k + 0.5) / 4;
      const l = rand(0.5, 1.1);
      this.add(this.base(px, py, pz, {
        vx: (px - x - 0.5) * 4 + rand(-0.5, 0.5), vy: (py - y - 0.5) * 4 + rand(0.5, 2.5), vz: (pz - z - 0.5) * 4 + rand(-0.5, 0.5),
        life: l, max: l, size: rand(0.035, 0.07), layer, u0: Math.random() * 0.75, v0: Math.random() * 0.75, us: 0.25,
        r: tint[0], g: tint[1], b: tint[2], grav: 18,
      }));
    }
  },
  blockHit(x, y, z, id, n) {
    const layer = BLOCK_TEX[id * 6 + (BLOCK_RT[id] === RT_CROSS ? 2 : 0)];
    const tint = BLOCK_TINT[id] ? [0.62, 0.86, 0.46] : [1, 1, 1];
    for (let i = 0; i < 3; i++) {
      const px = x + 0.5 + n[0] * 0.52 + (n[0] ? 0 : rand(-0.45, 0.45)), py = y + 0.5 + n[1] * 0.52 + (n[1] ? 0 : rand(-0.45, 0.45)), pz = z + 0.5 + n[2] * 0.52 + (n[2] ? 0 : rand(-0.45, 0.45));
      const l = rand(0.3, 0.7);
      this.add(this.base(px, py, pz, { vx: n[0] * 1.5 + rand(-1, 1), vy: rand(0.5, 2), vz: n[2] * 1.5 + rand(-1, 1), life: l, max: l,
        size: rand(0.03, 0.05), layer, u0: Math.random() * 0.75, v0: Math.random() * 0.75, us: 0.25, r: tint[0], g: tint[1], b: tint[2], grav: 18 }));
    }
  },
  itemCrumbs(x, y, z, itemId, n = 5) {
    const d = ITEM_DEF[itemId];
    if (!d) return;
    const layer = d.layer !== undefined ? d.layer : BLOCK_TEX[(d.block || 1) * 6 + 2];
    for (let i = 0; i < n; i++) {
      const l = rand(0.4, 0.8);
      this.add(this.base(x + rand(-0.1, 0.1), y + rand(-0.1, 0.1), z + rand(-0.1, 0.1), { vx: rand(-1.2, 1.2), vy: rand(1, 3), vz: rand(-1.2, 1.2),
        life: l, max: l, size: rand(0.05, 0.08), layer, u0: 0.25 + Math.random() * 0.4, v0: 0.25 + Math.random() * 0.4, us: 0.2, grav: 16 }));
    }
  },
  smoke(x, y, z, n = 6, spread = 0.3, dark = false) {
    for (let i = 0; i < n; i++) {
      const l = rand(0.8, 1.6);
      const g = dark ? rand(0.15, 0.3) : rand(0.55, 0.85);
      this.add(this.base(x + rand(-spread, spread), y + rand(-spread, spread), z + rand(-spread, spread), {
        vx: rand(-0.3, 0.3), vy: rand(0.4, 1.2), vz: rand(-0.3, 0.3), life: l, max: l, size: rand(0.15, 0.3),
        layer: T.p_smoke, r: g, g, b: g, blend: true, drag: 0.94, grow: 1.6, collide: false,
      }));
    }
  },
  poof(x, y, z, w, h) {
    for (let i = 0; i < 16; i++) {
      const l = rand(0.5, 1.0);
      this.add(this.base(x + rand(-w, w) * 0.6, y + rand(-h, h) * 0.4, z + rand(-w, w) * 0.6, {
        vx: rand(-0.8, 0.8), vy: rand(0.2, 1.2), vz: rand(-0.8, 0.8), life: l, max: l, size: rand(0.12, 0.24),
        layer: T.p_smoke, r: 0.95, g: 0.95, b: 0.95, blend: true, drag: 0.92, grow: 1.4, collide: false,
      }));
    }
  },
  flame(x, y, z) {
    const l = rand(0.3, 0.6);
    this.add(this.base(x, y, z, { vy: rand(0.4, 1), life: l, max: l, size: rand(0.06, 0.12), layer: T.p_flame, glow: true, drag: 0.95, shrink: true, collide: false }));
  },
  crit(x, y, z, n = 10) {
    for (let i = 0; i < n; i++) {
      const l = rand(0.4, 0.8);
      this.add(this.base(x, y, z, { vx: rand(-3, 3), vy: rand(0, 3), vz: rand(-3, 3), life: l, max: l, size: rand(0.05, 0.09),
        layer: T.p_crit, r: 1, g: 0.9, b: 0.6, glow: true, drag: 0.9, grav: 4, collide: false }));
    }
  },
  bubble(x, y, z) {
    const l = rand(0.6, 1.4);
    this.add(this.base(x, y, z, { vx: rand(-0.2, 0.2), vy: rand(0.8, 1.6), vz: rand(-0.2, 0.2), life: l, max: l, size: rand(0.04, 0.08),
      layer: T.p_bubble, drag: 0.97, bubble: true, collide: false }));
  },
  splash(x, y, z, n = 20) {
    for (let i = 0; i < n; i++) {
      const l = rand(0.4, 0.9);
      this.add(this.base(x + rand(-0.5, 0.5), y, z + rand(-0.5, 0.5), { vx: rand(-1.5, 1.5), vy: rand(2, 5), vz: rand(-1.5, 1.5), life: l, max: l,
        size: rand(0.04, 0.08), layer: T.water, u0: Math.random() * 0.8, v0: Math.random() * 0.8, us: 0.2, r: 0.8, g: 0.9, b: 1, grav: 16 }));
    }
  },
  // volcano plume: big dark puffs that rise and spread
  plume(x, y, z) {
    const l = rand(6, 11);
    const g = rand(0.18, 0.34);
    this.add(this.base(x, y, z, { vx: rand(-0.6, 0.6) + 0.8, vy: rand(3, 5.5), vz: rand(-0.6, 0.6), life: l, max: l, size: rand(2.2, 3.6),
      layer: T.p_smoke, r: g, g, b: g * 1.05, blend: true, drag: 0.995, grow: 3.2, collide: false }));
  },
  ash(x, y, z) {
    const l = rand(3, 6);
    const g = rand(0.25, 0.45);
    this.add(this.base(x, y, z, { vx: rand(-0.4, 0.4), vy: rand(-0.9, -0.5), vz: rand(-0.4, 0.4), life: l, max: l, size: rand(0.025, 0.045),
      layer: T.p_smoke, r: g, g, b: g, drag: 0.99 }));
  },
  firefly(x, y, z) {
    const l = rand(3, 6);
    this.add(this.base(x, y, z, { vx: rand(-0.4, 0.4), vy: rand(-0.1, 0.3), vz: rand(-0.4, 0.4), life: l, max: l, size: rand(0.035, 0.05),
      layer: T.p_crit, r: 0.9, g: 1, b: 0.35, glow: true, drag: 0.999, wander: true, collide: false }));
  },
  explosion(x, y, z, power) {
    for (let i = 0; i < 26 + power * 6; i++) {
      const a = Math.random() * Math.PI * 2, e = rand(-0.5, 1), s = rand(1, power * 1.6);
      const l = rand(0.8, 2.2);
      const g = rand(0.35, 0.9);
      this.add(this.base(x, y, z, { vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 1, vz: Math.sin(a) * Math.cos(e) * s,
        life: l, max: l, size: rand(0.35, 0.8), layer: T.p_smoke, r: g, g, b: g, blend: true, drag: 0.9, grow: 2.2, collide: false }));
    }
    for (let i = 0; i < 18; i++) {
      const l = rand(0.2, 0.45);
      this.add(this.base(x + rand(-1, 1) * power * 0.4, y + rand(-1, 1) * power * 0.3, z + rand(-1, 1) * power * 0.4, {
        vx: rand(-2, 2), vy: rand(0, 2), vz: rand(-2, 2), life: l, max: l, size: rand(0.5, 1.1), layer: T.p_flame, glow: true, drag: 0.9, grow: 1.5, collide: false }));
    }
  },
  update(dt) {
    const w = G.world;
    const L = this.list;
    let j = 0;
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) continue;
      p.vy -= p.grav * dt;
      if (p.drift) { p.vx += (Math.random() - 0.5) * dt * 3; p.vz += (Math.random() - 0.5) * dt * 3; }
      if (p.wander) { p.vx += (Math.random() - 0.5) * dt * 4; p.vy += (Math.random() - 0.5) * dt * 3; p.vz += (Math.random() - 0.5) * dt * 4; }
      const dr = Math.pow(p.drag, dt * 20);
      p.vx *= dr; p.vy *= dr; p.vz *= dr;
      const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt, nz = p.z + p.vz * dt;
      if (p.bubble && w.getBlock(Math.floor(nx), Math.floor(ny), Math.floor(nz)) !== B.WATER) continue;
      if (p.trail && Math.random() < dt * 12) this.list.length < 2400 && this.add(this.base(p.x, p.y, p.z, { vy: 0.4, life: 1.4, max: 1.4, size: rand(0.25, 0.45),
        layer: T.p_smoke, r: 0.25, g: 0.23, b: 0.22, blend: true, drag: 0.95, grow: 2.2, collide: false }));
      if (p.collide) {
        const id = w.getBlock(Math.floor(nx), Math.floor(ny - p.size * 0.5), Math.floor(nz));
        const liquid = (p.splash || p.melt) && IS_LIQUID(id);
        if (liquid || (BLOCK_SOLID[id] && (ny - p.size * 0.5) - Math.floor(ny - p.size * 0.5) < BLOCK_HEIGHT[id] / 16)) {
          // rain vanishes on impact, snow settles and melts, lava bombs burst
          if (p.splash) {
            // a raindrop hitting the ground throws up a couple of tiny droplets
            if (!liquid && Math.random() < 0.45 && L.length < 3000) {
              const top = Math.floor(ny - p.size * 0.5) + BLOCK_HEIGHT[id] / 16 + 0.02;
              for (let k = 0; k < 2; k++) {
                const a = Math.random() * Math.PI * 2, s = 0.6 + Math.random() * 0.8;
                this.add(this.base(nx, top, nz, { vx: Math.cos(a) * s, vy: 1.6 + Math.random() * 1.4, vz: Math.sin(a) * s, life: 0.22, max: 0.22, size: 0.022,
                  layer: T.p_smoke, r: p.r, g: p.g, b: p.b, blend: true, grav: 20, drag: 1, collide: false }));
              }
            }
            continue;
          }
          if (p.trail) { this.smoke(p.x, p.y + 0.3, p.z, 3, 0.4, true); continue; }
          if (p.melt) { p.melt = false; p.wander = false; p.vx = p.vz = 0; p.life = Math.min(p.life, 1.2); }
          p.vy = 0; p.vx *= 0.6; p.vz *= 0.6;
          p.x += p.vx * dt; p.z += p.vz * dt;
          L[j++] = p;
          continue;
        }
      }
      p.x = nx; p.y = ny; p.z = nz;
      L[j++] = p;
    }
    L.length = j;
  },
};

// ------------------------------------------------------------------ manager ----
const Ents = {
  mobs: [], items: [], arrows: [], tnts: [], falling: [],
  spawnTimer: 0, passiveTimer: 1,

  clear() { this.stashed = []; this.mobs.length = 0; this.items.length = 0; this.arrows.length = 0; this.tnts.length = 0; this.falling.length = 0; Particles.list.length = 0; Vehicles.clear(); },

  spawnItem(stack, x, y, z, vel, delay) {
    if (!stack || !stack.id || stack.count <= 0) return null;
    const e = new ItemEntity(stack, x, y, z);
    if (vel) e.vel = vel.slice();
    if (delay !== undefined) e.pickupDelay = delay;
    this.items.push(e);
    return e;
  },

  spawnMob(type, x, y, z) {
    const m = new Mob(type, x, y, z);
    this.mobs.push(m);
    return m;
  },

  // ---- animals are kept: out of range they wait in `stashed` and come back when their chunk
  // loads again; both lists go into the save ----
  stashed: [],
  keepable(m) { return !m.dead && !m.def.hostile && !m.vid && !m.remote && !m.def.custom; },
  mobRecord(m) {
    return { t: m.type, p: m.pos.map((v) => Math.round(v * 100) / 100), y: Math.round(m.bodyYaw * 100) / 100, h: Math.round(m.health), s: m.sheared ? 1 : 0, w: m.woolColor | 0 };
  },
  stash(m) {
    if (!this.keepable(m)) return;
    this.stashed.push(this.mobRecord(m));
    if (this.stashed.length > 400) this.stashed.shift();
  },
  unstash() {
    if (!this.stashed.length) return;
    const w = G.world;
    this.stashed = this.stashed.filter((r) => {
      const c = w.getChunk(Math.floor(r.p[0]) >> 4, Math.floor(r.p[2]) >> 4);
      if (!c || !c.mesh) return true;
      const pl = G.player.pos;
      if (Math.hypot(r.p[0] - pl[0], r.p[2] - pl[2]) > 110) return true;
      const m = this.spawnMob(r.t, r.p[0], r.p[1] + 0.01, r.p[2]);
      m.bodyYaw = m.headYaw = r.y;
      m.health = clamp(r.h, 1, m.def.hp);
      m.sheared = !!r.s; m.woolColor = clamp(r.w | 0, 0, 15);
      return false;
    });
  },
  serializeMobs() {
    return [...this.mobs.filter((m) => !m.removed && this.keepable(m)).map((m) => this.mobRecord(m)), ...this.stashed].slice(-400);
  },
  loadMobs(arr) {
    this.stashed = Array.isArray(arr) ? arr.filter((r) => r && MOB_TYPES[r.t] && !MOB_TYPES[r.t].hostile && Array.isArray(r.p) && r.p.length === 3 && r.p.every(Number.isFinite)).slice(-400) : [];
  },

  // Nearest mob hit by a ray (for melee attacks and shears).
  raycastMob(o, d, maxDist) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      if (m.dead) continue;
      const hit = rayBox(o, d, m.pos[0] - m.hw, m.pos[1], m.pos[2] - m.hw, m.pos[0] + m.hw, m.pos[1] + m.h, m.pos[2] + m.hw);
      if (hit && hit.t < bestT) { bestT = hit.t; best = m; }
    }
    return best ? { mob: best, dist: bestT } : null;
  },

  update(dt) {
    const p = G.player;
    for (const list of [this.mobs, this.items, this.arrows, this.tnts, this.falling]) {
      for (const e of list) e.update(dt);
    }
    // push overlapping mobs apart, and away from the player
    const M = this.mobs;
    for (let i = 0; i < M.length; i++) {
      const a = M[i];
      if (a.dead) continue;
      for (let j = i + 1; j < M.length; j++) {
        const b = M[j];
        if (b.dead) continue;
        const dx = b.pos[0] - a.pos[0], dz = b.pos[2] - a.pos[2], r = a.hw + b.hw;
        if (Math.abs(dx) < r && Math.abs(dz) < r && Math.abs(b.pos[1] - a.pos[1]) < Math.max(a.h, b.h)) {
          const l = Math.hypot(dx, dz) || 0.01, push = (r - l) * 2.5 * dt;
          a.vel[0] -= dx / l * push * 10; a.vel[2] -= dz / l * push * 10;
          b.vel[0] += dx / l * push * 10; b.vel[2] += dz / l * push * 10;
        }
      }
      const dx = a.pos[0] - p.pos[0], dz = a.pos[2] - p.pos[2], r = a.hw + PLAYER_HALF_W;
      if (Math.abs(dx) < r && Math.abs(dz) < r && a.pos[1] < p.pos[1] + PLAYER_H && a.pos[1] + a.h > p.pos[1]) {
        const l = Math.hypot(dx, dz) || 0.01;
        a.vel[0] += dx / l * 8 * dt * 10; a.vel[2] += dz / l * 8 * dt * 10;
      }
    }
    // item pickup and merging
    const alive = !(G.stats && G.stats.dead);
    for (const it of this.items) {
      if (it.removed || it.collecting > 0) continue;
      const dx = it.pos[0] - p.pos[0], dz = it.pos[2] - p.pos[2], dy = it.pos[1] - p.pos[1];
      if (alive && it.pickupDelay <= 0 && Math.abs(dx) < 1.3 && Math.abs(dz) < 1.3 && dy > -0.8 && dy < 2.2) {
        const left = G.inv.add(it.stack);
        if (left < it.stack.count) {
          sfx('pop', it.pos, 0.5, rand(1.3, 1.9));
          if (left === 0) it.collecting = 0.12;
          else it.stack.count = left;
          G.ui && G.ui.invDirty();
        }
      }
    }
    if ((G.frameCount & 15) === 0) {
      const I2 = this.items;
      for (let i = 0; i < I2.length; i++) {
        const a = I2[i];
        if (a.removed || a.collecting > 0 || maxStack(a.stack.id) === 1) continue;
        for (let j = i + 1; j < I2.length; j++) {
          const b = I2[j];
          if (b.removed || b.collecting > 0 || !sameItem(a.stack, b.stack)) continue;
          if (Math.abs(a.pos[0] - b.pos[0]) < 0.8 && Math.abs(a.pos[1] - b.pos[1]) < 0.6 && Math.abs(a.pos[2] - b.pos[2]) < 0.8) {
            const room = maxStack(a.stack.id) - a.stack.count;
            const n = Math.min(room, b.stack.count);
            a.stack.count += n; b.stack.count -= n;
            if (b.stack.count <= 0) b.removed = true;
          }
        }
      }
    }
    // stuck player arrows can be picked up
    for (const a of this.arrows) {
      if (!a.stuck || !a.pickup || a.removed || !alive) continue;
      if (Math.abs(a.pos[0] - p.pos[0]) < 1.2 && Math.abs(a.pos[2] - p.pos[2]) < 1.2 && a.pos[1] > p.pos[1] - 0.5 && a.pos[1] < p.pos[1] + 2.2) {
        if (G.inv.add({ id: I.ARROW, count: 1 }) === 0) { a.removed = true; sfx('pop', a.pos, 0.5, 1.6); G.ui && G.ui.invDirty(); }
      }
    }
    for (const list of [this.mobs, this.items, this.arrows, this.tnts, this.falling]) {
      let j = 0;
      for (let i = 0; i < list.length; i++) if (!list[i].removed) list[j++] = list[i];
      list.length = j;
    }
    Particles.update(dt);
    this.despawn(dt);
    this.spawn(dt);
  },

  despawn(dt) {
    const p = G.player.pos;
    this.unstash();
    for (const m of this.mobs) {
      const d = Math.hypot(m.pos[0] - p[0], m.pos[2] - p[2]);
      if (!G.world.isLoaded(Math.floor(m.pos[0]), Math.floor(m.pos[2]))) { m.removed = true; this.stash(m); continue; }
      if (!m.def.hostile && d > (m.persistent ? 175 : 120)) { m.removed = true; this.stash(m); continue; }
      if (m.def.hostile) {
        if (G.difficulty === 0 || d > 100) m.removed = true;
        else if (d > 40) { m.farTime += dt; if (m.farTime > 30) m.removed = true; }
        else m.farTime = 0;
        // burned-out daylight stragglers
      } else if (d > (m.persistent ? 175 : 120)) m.removed = true;
    }
  },

  spawn(dt) {
    if (!G.rules.mobSpawning) return;
    const w = G.world, p = G.player;
    this.spawnTimer -= dt;
    this.passiveTimer -= dt;
    if (this.spawnTimer <= 0 && G.difficulty > 0) {
      this.spawnTimer = 1;
      const cap = [0, 10, 14, 18][G.difficulty];
      let hostiles = 0;
      for (const m of this.mobs) if (m.def.hostile && !m.dead) hostiles++;
      for (let attempt = 0; attempt < 6 && hostiles < cap; attempt++) {
        const a = Math.random() * Math.PI * 2, d = rand(20, 44);
        const x = Math.floor(p.pos[0] + Math.cos(a) * d), z = Math.floor(p.pos[2] + Math.sin(a) * d);
        const c = w.getChunk(x >> 4, z >> 4);
        if (!c || !c.light) continue;
        const h = w.surfaceHeight(x, z);
        const y = Math.random() < 0.5 ? h + 1 : 5 + Math.floor(Math.random() * Math.max(1, h - 8));
        if (!this.spawnable(x, y, z, true)) continue;
        let r = Math.random() * HOSTILE_WEIGHTS.reduce((s, e) => s + e[1], 0), type = 'zombie';
        for (const [t, wt] of HOSTILE_WEIGHTS) { if ((r -= wt) <= 0) { type = t; break; } }
        if (type === 'spider' && (!this.spawnable(x + 1, y, z, true) || !this.spawnable(x, y, z + 1, true))) continue;
        this.spawnMob(type, x + 0.5, y, z + 0.5);
        hostiles++;
      }
    }
    if (this.passiveTimer <= 0) {
      this.passiveTimer = 3;
      let passive = 0;
      for (const m of this.mobs) if (!m.def.hostile) passive++;
      if (passive >= 12) return;
      for (let attempt = 0; attempt < 4; attempt++) {
        const a = Math.random() * Math.PI * 2, d = rand(18, 48);
        const x = Math.floor(p.pos[0] + Math.cos(a) * d), z = Math.floor(p.pos[2] + Math.sin(a) * d);
        const c = w.getChunk(x >> 4, z >> 4);
        if (!c || !c.light) continue;
        const h = w.surfaceHeight(x, z);
        if (w.getBlock(x, h, z) !== B.GRASS && !(BLOCK_RT[w.getBlock(x, h, z)] === RT_CROSS && w.getBlock(x, h - 1, z) === B.GRASS)) continue;
        const y = w.getBlock(x, h, z) === B.GRASS ? h + 1 : h;
        const type = PASSIVE_TYPES[Math.floor(Math.random() * PASSIVE_TYPES.length)];
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const sx = x + Math.floor(rand(-2, 3)), sz = z + Math.floor(rand(-2, 3));
          const sh = w.surfaceHeight(sx, sz);
          const sy = BLOCK_RT[w.getBlock(sx, sh, sz)] === RT_CROSS ? sh : sh + 1;
          if (Math.abs(sy - y) > 2 || !this.spawnable(sx, sy, sz, false)) continue;
          this.spawnMob(type, sx + 0.5, sy, sz + 0.5);
        }
        break;
      }
    }
  },

  spawnable(x, y, z, hostile) {
    const w = G.world;
    if (y < 1 || y > CH - 3) return false;
    const below = w.getBlock(x, y - 1, z);
    if (!BLOCK_OPAQUE[below] || below === B.BEDROCK && hostile === false) return false;
    const a = w.getBlock(x, y, z), b = w.getBlock(x, y + 1, z);
    if (BLOCK_SOLID[a] || BLOCK_SOLID[b] || IS_LIQUID(a) || IS_LIQUID(b)) return false;
    if (a !== B.AIR && BLOCK_RT[a] !== RT_CROSS) return false;
    const L = w.getLight(x, y, z);
    if (hostile) {
      const sky = L >> 4, blk = L & 15;
      const dayF = isDaytime() ? 1 : 0.25;
      if (blk > 0 || sky * dayF > 7) return false;
    }
    const pp = G.player.pos;
    if (Math.hypot(x + 0.5 - pp[0], y - pp[1], z + 0.5 - pp[2]) < 18) return false;
    return true;
  },
};
