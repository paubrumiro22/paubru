'use strict';
// Pets and horses.
// - Wolves roam forests and snowy woods in pairs; a bone may tame one (a red collar appears). A
//   tamed wolf follows you, jumps to you when left far behind and bites monsters that come near.
// - Cats live around villages; raw or cooked fish may tame one (blue collar). They follow you too.
//   Right-click a tamed wolf or cat to make it sit and stay, again to have it follow.
// - Horses graze on plains in small herds, each coat a little different. Apples, wheat or a golden
//   apple may tame one; put a saddle on it and right-click to ride: W/S/A/D, Space to jump,
//   sprint to gallop, Shift to get off.
// Their state lives in mob.keep (saved with the animal: tamed, sit, saddle, coat).

Object.assign(I, { SADDLE: 432 });
Object.assign(MOB_TYPES, {
  wolf: { name: 'Wolf', hw: 0.3, h: 0.85, hp: 16, speed: 3.4, drops: [[I.BONE, 0, 1]], custom: 'pet', pet: 'wolf' },
  cat: { name: 'Cat', hw: 0.25, h: 0.7, hp: 10, speed: 3.2, drops: [[I.STRING, 0, 1]], custom: 'pet', pet: 'cat' },
  horse: { name: 'Horse', hw: 0.65, h: 1.6, hp: 30, speed: 2.6, drops: [[I.LEATHER, 0, 2]], custom: 'pet', pet: 'horse' },
});
Object.assign(MOB_SKIN_SLOT, { wolf: 60, cat: 61, horse: 62 });
Object.assign(MOB_MODELS, {
  wolf: [
    { id: 'body', box: [-3, 6, -5, 3, 12, 4] },
    { id: 'mane', box: [-4, 6, 1, 4, 14, 6] },
    { id: 'head', box: [-3, 9, 6, 3, 15, 11], pivot: [0, 11, 6], role: 'head' },
    { id: 'snout', box: [-1.5, 9, 11, 1.5, 12, 14], parent: 'head' },
    { id: 'earL', box: [-3, 15, 8, -1, 17, 9], parent: 'head', uv: 'ear' },
    { id: 'earR', box: [1, 15, 8, 3, 17, 9], parent: 'head', uv: 'ear' },
    { id: 'collar', box: [-3.5, 9.5, 5.2, 3.5, 11, 6.6], show: 'tamed' },
    { id: 'tail', box: [-1, 7, -12, 1, 9, -5], pivot: [0, 9, -5], role: 'tail' },
    { id: 'leg0', box: [-3, 0, 2, -1, 6, 4], pivot: [-2, 6, 3], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [1, 0, 2, 3, 6, 4], pivot: [2, 6, 3], uv: 'leg', role: 'legB' },
    { id: 'leg2', box: [-3, 0, -4, -1, 6, -2], pivot: [-2, 6, -3], uv: 'leg', role: 'legB' },
    { id: 'leg3', box: [1, 0, -4, 3, 6, -2], pivot: [2, 6, -3], uv: 'leg', role: 'legA' },
  ],
  cat: [
    { id: 'body', box: [-2, 4, -5, 2, 8, 5], tint: true },
    { id: 'head', box: [-2.5, 6, 5, 2.5, 10, 9], pivot: [0, 7, 5], role: 'head', tint: true },
    { id: 'earL', box: [-2.5, 10, 6, -1, 12, 7], parent: 'head', uv: 'ear', tint: true },
    { id: 'earR', box: [1, 10, 6, 2.5, 12, 7], parent: 'head', uv: 'ear', tint: true },
    { id: 'nose', box: [-1, 6, 9, 1, 8, 10], parent: 'head' },
    { id: 'collar', box: [-2.8, 6.2, 4.6, 2.8, 7.3, 5.5], show: 'tamed' },
    { id: 'tail', box: [-0.5, 6, -11, 0.5, 7, -5], pivot: [0, 7, -5], role: 'tail', tint: true },
    { id: 'leg0', box: [-2, 0, 2, -1, 4, 3], pivot: [-1.5, 4, 2.5], uv: 'leg', role: 'legA', tint: true },
    { id: 'leg1', box: [1, 0, 2, 2, 4, 3], pivot: [1.5, 4, 2.5], uv: 'leg', role: 'legB', tint: true },
    { id: 'leg2', box: [-2, 0, -4, -1, 4, -3], pivot: [-1.5, 4, -3.5], uv: 'leg', role: 'legB', tint: true },
    { id: 'leg3', box: [1, 0, -4, 2, 4, -3], pivot: [1.5, 4, -3.5], uv: 'leg', role: 'legA', tint: true },
  ],
  horse: [
    { id: 'body', box: [-5, 12, -11, 5, 22, 10], tint: true },
    { id: 'head', box: [-2.5, 19, 8, 2.5, 30, 13], pivot: [0, 20, 10], role: 'head', tint: true },
    { id: 'skull', box: [-3, 25, 12, 3, 31, 21], parent: 'head', tint: true },
    { id: 'mane', box: [-1, 21, 7, 1, 32, 9], parent: 'head' },
    { id: 'earL', box: [-3, 31, 12, -1, 34, 13], parent: 'head', uv: 'ear', tint: true },
    { id: 'earR', box: [1, 31, 12, 3, 34, 13], parent: 'head', uv: 'ear', tint: true },
    { id: 'saddle', box: [-5.4, 21, -4, 5.4, 23, 4], show: 'saddled' },
    { id: 'tail', box: [-1.5, 13, -15, 1.5, 21, -11], pivot: [0, 21, -11], role: 'tail', uv: 'tailh' },
    { id: 'leg0', box: [-4.5, 0, 6, -1.5, 12, 9], pivot: [-3, 12, 7.5], uv: 'leg', role: 'legA', tint: true },
    { id: 'leg1', box: [1.5, 0, 6, 4.5, 12, 9], pivot: [3, 12, 7.5], uv: 'leg', role: 'legB', tint: true },
    { id: 'leg2', box: [-4.5, 0, -10, -1.5, 12, -7], pivot: [-3, 12, -8.5], uv: 'leg', role: 'legB', tint: true },
    { id: 'leg3', box: [1.5, 0, -10, 4.5, 12, -7], pivot: [3, 12, -8.5], uv: 'leg', role: 'legA', tint: true },
  ],
});
const HORSE_COATS = [[0.62, 0.42, 0.26], [0.36, 0.24, 0.16], [0.86, 0.84, 0.8], [0.22, 0.2, 0.2], [0.78, 0.6, 0.36], [0.55, 0.52, 0.5]];
const CAT_COATS = [[1, 0.66, 0.34], [0.28, 0.28, 0.3], [0.92, 0.9, 0.86], [0.72, 0.62, 0.5]];

// fur for the new animals, painted into the model atlas
{
  const paint0 = paintSkins;
  // eslint-disable-next-line no-global-assign
  paintSkins = function () {
    const cv = paint0();
    const g = cv.getContext('2d');
    const img = g.getImageData(0, 0, ATLAS_W, ATLAS_H), D = img.data;
    const rng = mulberry32(777);
    const px = (x, y, c, f = 1) => { const i = (y * ATLAS_W + x) * 4; D[i] = clamp(c[0] * f, 0, 255); D[i + 1] = clamp(c[1] * f, 0, 255); D[i + 2] = clamp(c[2] * f, 0, 255); D[i + 3] = 255; };
    const rect = (r, fn) => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) { const c = fn(x, y, r[2], r[3]); if (c) px(r[0] + x, r[1] + y, c[0], c[1]); } };
    const faces = (type, id) => MOB_MODELS[type].find((p) => p.id === id || p.uv === id).faces;
    const all = (f, fn) => { for (const k of ['top', 'bottom', 'left', 'front', 'right', 'back']) rect(f[k], fn); };
    const fur = (base, v = 0.2) => (x, y) => [base, 1 - v / 2 + rng() * v - (y % 3 === 0 ? 0.05 : 0)];
    // wolf: grey back, pale belly and muzzle, dark nose and eyes
    for (const id of ['body', 'mane', 'head', 'ear', 'tail', 'leg']) all(faces('wolf', id), fur([150, 146, 140]));
    rect(faces('wolf', 'body').bottom, fur([214, 208, 196]));
    all(faces('wolf', 'snout'), fur([200, 194, 184]));
    { const f = faces('wolf', 'snout').front; for (let i = 0; i < 3; i++) px(f[0] + i, f[1], [30, 26, 24]); }
    { const f = faces('wolf', 'head').front; px(f[0] + 1, f[1] + 2, [30, 26, 24]); px(f[0] + 4, f[1] + 2, [30, 26, 24]); }
    all(faces('wolf', 'tail'), (x, y, w, h) => [y > h - 2 ? [230, 226, 218] : [140, 136, 130], 0.9 + rng() * 0.15]);
    all(faces('wolf', 'collar'), (x) => [x % 4 === 0 ? [230, 190, 60] : [200, 30, 36], 1]);
    // cat: light fur (the coat tints it) with darker tabby stripes, pink nose, green eyes
    for (const id of ['body', 'head', 'ear', 'tail', 'leg']) all(faces('cat', id), (x, y) => [[236, 232, 226], (x + y * 2) % 5 === 0 ? 0.72 : 0.95 + rng() * 0.08]);
    all(faces('cat', 'nose'), () => [[236, 168, 176], 1]);
    { const f = faces('cat', 'head').front; for (const ex of [0, 3]) { px(f[0] + ex, f[1] + 1, [90, 200, 90]); px(f[0] + ex + 1, f[1] + 1, [20, 30, 20]); } }
    all(faces('cat', 'collar'), (x) => [x % 3 === 0 ? [240, 220, 90] : [40, 90, 210], 1]);
    // horse: coat (tinted), darker mane, tail and hooves, eyes and nostrils; the saddle is leather
    for (const id of ['body', 'head', 'skull', 'ear']) all(faces('horse', id), fur([232, 228, 222], 0.12));
    all(faces('horse', 'leg'), (x, y, w, h) => [y > h - 3 ? [60, 52, 46] : [232, 228, 222], 0.9 + rng() * 0.1]);
    all(faces('horse', 'mane'), fur([46, 36, 30], 0.3));
    all(faces('horse', 'tailh'), fur([46, 36, 30], 0.3));
    { const f = faces('horse', 'skull'); const s = f.front; px(s[0] + 1, s[1] + 3, [30, 24, 20]); px(s[0] + 4, s[1] + 3, [30, 24, 20]);
      for (const k of ['left', 'right']) { const q = f[k]; px(q[0] + 2, q[1] + 1, [20, 16, 14]); } }
    all(faces('horse', 'saddle'), (x, y) => [x === 0 || y === 0 ? [70, 40, 22] : [120, 70, 36], 0.9 + rng() * 0.12]);
    g.putImageData(img, 0, 0);
    return cv;
  };
}

const PET_FOOD = {
  wolf: [I.BONE], cat: [I.RAW_FISH, I.COOKED_FISH], horse: [I.APPLE, I.WHEAT, I.GOLDEN_APPLE],
};
const PET_HEAL = { wolf: [I.RAW_BEEF, I.STEAK, I.RAW_PORK, I.COOKED_PORK, I.RAW_CHICKEN, I.COOKED_CHICKEN], cat: [I.RAW_FISH, I.COOKED_FISH], horse: [I.APPLE, I.WHEAT, I.GOLDEN_APPLE, I.BREAD] };

const Pets = {
  riding: null, spawnT: 5, exitT: 0,

  lift(m) { for (let i = 0; i < 8 && boxCollides(G.world, m.pos[0], m.pos[1], m.pos[2], m.hw, m.h); i++) m.pos[1] += 1; },

  state(m) {
    if (!m.keep) m.keep = { coat: Math.floor(Math.random() * (m.def.pet === 'horse' ? HORSE_COATS.length : CAT_COATS.length)) };
    const k = m.keep;
    m.tamed = !!k.tamed; m.saddled = !!k.saddle;
    if (m.def.pet === 'horse') m.tint = HORSE_COATS[k.coat % HORSE_COATS.length];
    else if (m.def.pet === 'cat') m.tint = CAT_COATS[k.coat % CAT_COATS.length];
    return k;
  },

  // ---------------------------------------------------------------- AI ----
  tick(m, dt) {
    DimMobs.begin(m, dt);
    const k = this.state(m), p = G.player, kind = m.def.pet;
    if (this.riding === m) { DimMobs.env(m, dt); return; }
    const dx = p.pos[0] - m.pos[0], dz = p.pos[2] - m.pos[2], d = Math.hypot(dx, dz);
    let mx = 0, mz = 0, speed = m.def.speed, jump = false;
    m.headYaw = m.bodyYaw;
    if (k.tamed && kind !== 'horse' && !k.sit) {
      // a wolf guards you: the nearest monster close to you
      let foe = null;
      if (kind === 'wolf') {
        let bd = 12;
        for (const o of Ents.mobs) {
          if (o.dead || !o.def.hostile || o.type === 'wyrm' || o.type === 'warden') continue;
          const od = Math.hypot(o.pos[0] - p.pos[0], o.pos[2] - p.pos[2]);
          if (od < bd) { bd = od; foe = o; }
        }
      }
      if (foe) {
        const fx = foe.pos[0] - m.pos[0], fz = foe.pos[2] - m.pos[2], fd = Math.hypot(fx, fz) || 1;
        mx = fx / fd; mz = fz / fd; speed *= 1.35;
        if (fd < m.hw + foe.hw + 0.7 && m.ai.attackCd <= 0) {
          m.ai.attackCd = 0.9;
          foe.damage(4, { player: true, from: m.pos, knock: 0.6 });
          sfx('wolf_growl', m.pos, 1, rand(0.9, 1.1));
        }
      } else if (d > 26 && !G.vehicle && !p.flying && p.onGround) {
        // left behind: appear next to you
        const a = Math.random() * Math.PI * 2;
        m.pos = [p.pos[0] + Math.cos(a) * 1.5, p.pos[1] + 0.1, p.pos[2] + Math.sin(a) * 1.5]; m.vel = [0, 0, 0];
        Pets.lift(m);
      } else if (d > 3.2) {
        mx = dx / d; mz = dz / d; speed *= d > 8 ? 1.5 : 1.1;
      } else if (Math.random() < dt * 0.3) sfx(kind + '_say', m.pos, 0.6, rand(0.9, 1.15));
      if (d < 6) m.headYaw = Math.atan2(dx, dz);
    } else if (k.sit) {
      m.walkAmt *= 0.9;
    } else {
      [mx, mz] = DimMobs.wander(m, dt, kind === 'horse' ? 8 : 10);
      if (Math.random() < dt * 0.05) sfx(kind + '_say', m.pos, 0.7, rand(0.9, 1.1));
    }
    DimMobs.move(m, dt, mx, mz, speed, jump);
    DimMobs.env(m, dt);
  },

  // ---------------------------------------------------------------- right-click ----
  interact(m, held) {
    const k = this.state(m), kind = m.def.pet, id = held ? held.id : 0;
    const eat = (n = 1) => { if (G.mode === 'survival') { G.inv.consumeHeld(n); G.ui.invDirty(); } sfx('eat', m.pos, 0.8, 1.2); };
    if (!k.tamed && PET_FOOD[kind].includes(id)) {
      eat();
      const chance = id === I.GOLDEN_APPLE ? 1 : kind === 'wolf' ? 0.35 : 0.4;
      if (Math.random() < chance) {
        k.tamed = true; k.owner = Net.name || 'you';
        this.hearts(m);
        sfx(kind + '_say', m.pos, 1, 1.2);
        G.ui.toast(kind === 'horse' ? 'The horse trusts you: put a saddle on it to ride' : 'Tamed! It follows you now · right-click to make it sit', 3500);
        if (typeof Progress !== 'undefined') Progress.event(kind === 'horse' ? 'tame_horse' : 'tame');
      } else Particles.smoke(m.pos[0], m.pos[1] + m.h, m.pos[2], 5, 0.3);
      return true;
    }
    if (k.tamed && PET_HEAL[kind].includes(id) && m.health < m.def.hp) { eat(); m.health = Math.min(m.def.hp, m.health + 6); this.hearts(m); return true; }
    if (kind === 'horse') {
      if (!k.tamed) { G.ui.toast('It will not let you ride yet: feed it apples or wheat'); sfx('horse_say', m.pos, 1, 1.3); return true; }
      if (!k.saddle && id === I.SADDLE) { k.saddle = true; if (G.mode === 'survival') { G.inv.consumeHeld(1); G.ui.invDirty(); } sfx('place_6', m.pos, 1, 1); G.ui.toast('Saddled! Right-click to ride'); return true; }
      if (!k.saddle) { G.ui.toast('It needs a saddle (leather and iron at the crafting table)'); return true; }
      this.mount(m);
      return true;
    }
    if (k.tamed) {
      k.sit = !k.sit;
      G.ui.toast(k.sit ? 'Sit! It stays here' : 'It follows you again');
      sfx(kind + '_say', m.pos, 0.9, k.sit ? 0.9 : 1.2);
      return true;
    }
    return false;
  },
  hearts(m) {
    for (let i = 0; i < 7; i++) Particles.add(Particles.base(m.pos[0] + rand(-0.4, 0.4), m.pos[1] + m.h + rand(0, 0.4), m.pos[2] + rand(-0.4, 0.4), {
      vy: rand(0.5, 1.2), life: 1, max: 1, size: 0.12, layer: T.p_crit, r: 1, g: 0.3, b: 0.4, glow: true, drag: 0.95, collide: false, shrink: true }));
  },

  // ---------------------------------------------------------------- riding ----
  mount(m) {
    if (G.vehicle) return;
    this.riding = m;
    this.exitT = 0.4;
    const p = G.player;
    p.flying = false; p.sneaking = false;
    sfx('horse_say', m.pos, 1, 1);
    G.ui.toast('W/S/A/D ride · sprint to gallop · Space jump · Shift to get off', 3500);
    if (typeof Progress !== 'undefined') Progress.event('horse');
  },
  dismount() {
    const m = this.riding;
    this.riding = null;
    if (!m) return;
    const p = G.player;
    const side = [Math.cos(m.bodyYaw) * 1.2, 0, -Math.sin(m.bodyYaw) * 1.2];
    p.pos = [m.pos[0] + side[0], m.pos[1] + 0.2, m.pos[2] + side[2]];
    p.vel = [0, 0, 0]; p.fallStart = null;
    liftOutOfBlocks(p);
  },
  ride(dt) {
    const m = this.riding, p = G.player;
    if (!m || m.dead || m.removed || G.stats.dead || G.vehicle) { this.dismount(); return; }
    const k = G.input.keys;
    this.exitT -= dt;
    if (this.exitT <= 0 && (k.has('ShiftLeft') || k.has('ShiftRight'))) { this.dismount(); return; }
    const fwd = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 0.6 : 0);
    const str = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const f = [-Math.sin(p.yaw), -Math.cos(p.yaw)], r = [Math.cos(p.yaw), -Math.sin(p.yaw)];
    let mx = f[0] * fwd + r[0] * str * 0.6, mz = f[1] * fwd + r[1] * str * 0.6;
    const l = Math.hypot(mx, mz);
    if (l > 1) { mx /= l; mz /= l; }
    const gallop = G.input.sprintHeld || p.sprinting;
    const speed = gallop ? 9.5 : 6;
    DimMobs.move(m, dt, mx, mz, speed, false);
    if (k.has('Space') && m.onGround) { m.vel[1] = 8.2; sfx('horse_say', m.pos, 0.5, 1.4); }
    m.headYaw = m.bodyYaw;
    // hooves
    m.stepT = (m.stepT || 0) - dt * Math.hypot(m.vel[0], m.vel[2]);
    if (m.stepT <= 0 && m.onGround && Math.hypot(m.vel[0], m.vel[2]) > 1) { m.stepT = 1.4; sfx('hoof', m.pos, 0.7, gallop ? 1.2 : 1); }
    // the rider sits on its back
    const h = m.pos[1] + 1.05;
    p.pos = [m.pos[0] - Math.sin(m.bodyYaw) * 0.1, h, m.pos[2] - Math.cos(m.bodyYaw) * 0.1];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
  },

  // ---------------------------------------------------------------- spawning ----
  update(dt) {
    if (this.riding) this.ride(dt);
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 8;
    const w = G.world, p = G.player;
    if (!w || G.slot || !G.rules.mobSpawning || w.type === 'flat' || dimOf(p.pos[0], p.pos[2]) !== DIM_OVER) return;
    const count = (type) => Ents.mobs.filter((m) => m.type === type && !m.dead && Math.hypot(m.pos[0] - p.pos[0], m.pos[2] - p.pos[2]) < 80).length;
    const a = Math.random() * Math.PI * 2, r = rand(26, 46);
    const x = Math.floor(p.pos[0] + Math.cos(a) * r), z = Math.floor(p.pos[2] + Math.sin(a) * r);
    if (!w.isLoaded(x, z)) return;
    const h = w.surfaceHeight(x, z);
    if (h < SEA || w.getBlock(x, h, z) !== B.GRASS && w.getBlock(x, h, z) !== B.SNOW && w.getBlock(x, h, z) !== B.PODZOL) return;
    const g = w.gen, { temp, hum } = g.climate(x, z), biome = g.biome(h, temp, hum);
    const group = (type, n) => { for (let i = 0; i < n; i++) { const m = Ents.spawnMob(type, x + 0.5 + rand(-2, 2), h + 1.05, z + 0.5 + rand(-2, 2)); m.persistent = true; Pets.lift(m); this.state(m); } };
    // cats by the villages
    if (g.structs && count('cat') < 2) {
      const vil = structuresIn(g, x - 40, z - 40, x + 40, z + 40).find((q) => q.type === 'village' && Math.hypot(q.x - x, q.z - z) < 40);
      if (vil) { group('cat', 1); return; }
    }
    if ((biome === BIOME.FOREST || biome === BIOME.SNOWY) && count('wolf') < 3 && Math.random() < 0.7) { group('wolf', 2); return; }
    if (biome === BIOME.PLAINS && count('horse') < 4 && Math.random() < 0.6) group('horse', 2 + (Math.random() < 0.4 ? 1 : 0));
  },
};

// ---------------------------------------------------------------- hooks ----
DimMobs.pet = (m, dt) => Pets.tick(m, dt);
{
  const use0 = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.def.pet && !t.mob.dead && Pets.interact(t.mob, G.inv.held)) { this.swingHand(); return true; }
    return use0.call(this, initial);
  };
}
defItem(I.SADDLE, 'Saddle', { sprite: 'i_saddle', stack: 1, cat: 'tools' });
shaped(I.SADDLE, 1, ['LLL', 'LIL'], { L: I.LEATHER, I: I.IRON_INGOT });
sprite('i_saddle', (d) => {
  sprPoly(d, [[5, 12], [11, 8], [21, 8], [27, 12], [26, 18], [6, 18]], [132, 76, 38]);
  sprPoly(d, [[9, 10], [23, 10], [22, 14], [10, 14]], [160, 98, 52]);
  sprSeg(d, 9, 18, 8, 26, 1, [60, 40, 26]); sprSeg(d, 23, 18, 24, 26, 1, [60, 40, 26]);
  sprRect(d, 6, 25, 11, 28, [190, 190, 196]); sprRect(d, 21, 25, 26, 28, [190, 190, 196]);
});
if (typeof ACHIEVEMENTS !== 'undefined') {
  for (const a of [
    { k: 'tame', name: 'Best Friend', desc: 'Tame a wolf or a cat', icon: I.BONE, coins: 30 },
    { k: 'tame_horse', name: 'Horse Whisperer', desc: 'Tame a horse', icon: I.APPLE, coins: 30 },
    { k: 'horse', name: 'Giddy Up', desc: 'Ride a horse', icon: I.SADDLE, coins: 30 },
  ]) { ACHIEVEMENTS.push(a); ACH_BY_KEY[a.k] = a; }
}

// ---------------------------------------------------------------- sounds ----
SYNTH.wolf_say = (ctx, o, t, p) => { for (let i = 0; i < 2; i++) Sound.tone(ctx, o, t + i * 0.16, 0.1, { wave: 'sawtooth', f0: 420 * p, f1: 260 * p, filter: ['lowpass', 1600, 2], gain: 0.28 }); };
SYNTH.wolf_growl = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.45, { wave: 'sawtooth', f0: 110 * p, f1: 90 * p, am: 30, filter: ['lowpass', 700, 2], gain: 0.35 }); };
SYNTH.wolf_hurt = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.22, { wave: 'triangle', f0: 900 * p, f1: 500 * p, gain: 0.3 }); };
SYNTH.wolf_death = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.7, { wave: 'triangle', f0: 700 * p, f1: 200 * p, gain: 0.3 }); };
SYNTH.cat_say = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.45, { wave: 'triangle', f0: 620 * p, f1: 900 * p, vib: [7, 30], gain: 0.22 }); Sound.tone(ctx, o, t + 0.25, 0.25, { wave: 'triangle', f0: 880 * p, f1: 560 * p, gain: 0.18 }); };
SYNTH.cat_hurt = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.25, { wave: 'sawtooth', f0: 1100 * p, f1: 700 * p, filter: ['lowpass', 2500, 1], gain: 0.22 }); };
SYNTH.cat_death = SYNTH.cat_hurt;
SYNTH.horse_say = (ctx, o, t, p) => {
  Sound.tone(ctx, o, t, 0.9, { wave: 'sawtooth', f0: 520 * p, f1: 300 * p, vib: [14, 60], filter: ['lowpass', 1800, 2], gain: 0.2 });
  Sound.noise(ctx, o, t + 0.7, 0.3, { type: 'bandpass', freq: 600, q: 1, gain: 0.25 });
};
SYNTH.horse_hurt = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 0.3, { wave: 'sawtooth', f0: 400 * p, f1: 250 * p, filter: ['lowpass', 1400, 2], gain: 0.3 }); };
SYNTH.horse_death = (ctx, o, t, p) => { Sound.tone(ctx, o, t, 1, { wave: 'sawtooth', f0: 380 * p, f1: 120 * p, filter: ['lowpass', 1200, 2], gain: 0.3 }); };
SYNTH.hoof = (ctx, o, t, p) => { for (let i = 0; i < 2; i++) Sound.noise(ctx, o, t + i * 0.09, 0.05, { type: 'bandpass', freq: 900 * p, q: 2, gain: 0.45 }); };
