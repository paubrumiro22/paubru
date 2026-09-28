'use strict';
// The Banc Central is protected: its blocks cannot be broken. Try it in survival and the police
// come: the first time a fine (100 coins), again within ten minutes a stay in the cells under the
// bank (45 s, walls of bedrock, no teleports), and then back out at the bank door.
// In creative the blocks just stay put.

const POLICE_FINE = 100, JAIL_TIME = 45, CRIME_MEMORY = 600;

const Police = {
  rect: null, rectKey: '', warnT: 0, jail: null, cops: [],

  bank() {
    const w = G.world;
    const key = w && w.seed + ':' + w.genVer + ':' + w.type;
    if (key !== this.rectKey) {
      this.rectKey = key; this.rect = null;
      try {
        const st = typeof stucomVillage === 'function' && w.gen && w.gen.structs ? stucomVillage(w.gen) : null;
        const b = st && st.campus && st.campus.bank;
        if (b && [b.x0, b.z0, b.x1, b.z1, b.F].every(Number.isFinite)) this.rect = b;
      } catch (e) { this.rect = null; }
    }
    return this.rect;
  },
  inBank(x, y, z) {
    const b = this.bank();
    return !!b && x >= b.x0 - 1 && x <= b.x1 + 1 && z >= b.z0 - 1 && z <= b.z1 + 1 && y >= b.F - 16 && y <= b.F + 28;
  },

  // somebody tried to break a block of the bank
  caught(x, y, z) {
    if (this.warnT > 0) return;
    this.warnT = 3;
    if (G.mode !== 'survival') { G.ui.toast('🏦 The Banc Central is protected', 2000); return; }
    const pr = G.prog || (G.prog = {});
    const now = Date.now() / 1000;
    const again = pr.crime && now - pr.crime < CRIME_MEMORY;
    pr.crime = now;
    sfx('siren', null, 1, 1);
    this.arrive();
    if (!again) {
      const fine = Math.min(G.money | 0, POLICE_FINE);
      G.money = (G.money | 0) - fine;
      if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
      G.ui.banner('🚨', 'Police! Fine of ' + fine + ' coins for damaging the bank. Next time: jail.');
    } else { this.arrestAt = G.time + 1.6; G.ui.banner('🚨', 'Police! You are under arrest.'); }
  },

  // two officers appear next to you and face you
  arrive() {
    const p = G.player;
    for (const s of [-1, 1]) {
      const a = p.yaw + s * 0.9;
      const x = p.pos[0] - Math.sin(a) * 2.2, z = p.pos[2] - Math.cos(a) * 2.2;
      const m = Ents.spawnMob('villager', x, p.pos[1] + 0.2, z);
      m.prof = 'police'; m.skin = 0; m.tint = [0.2, 0.28, 0.62]; m.police = true; m.hideAt = G.time + 10;
      m.bodyYaw = m.headYaw = Math.atan2(p.pos[0] - x, p.pos[2] - z);
      this.cops.push(m);
    }
  },

  arrest() {
    const b = this.bank();
    if (!b) return;
    const cx = Math.floor((b.x0 + b.x1) / 2), cz = Math.floor((b.z0 + b.z1) / 2), y0 = b.F - 22;
    // the cell: bedrock all round, a glowstone light, a bench and bars on the corridor side
    const list = [];
    for (let dx = -3; dx <= 3; dx++) for (let dz = -3; dz <= 3; dz++) for (let dy = -1; dy <= 4; dy++) {
      const edge = Math.abs(dx) === 3 || Math.abs(dz) === 3 || dy === -1 || dy === 4;
      let id = edge ? B.BEDROCK : B.AIR;
      if (dy === 4 && dx === 0 && dz === 0) id = B.GLOWSTONE;
      if (!edge && dz === 2 && dy === 0 && Math.abs(dx) <= 1) id = shapeId('oak', 'stairs');
      if (edge && dz === -3 && Math.abs(dx) <= 1 && dy >= 1 && dy <= 2) id = B.IRON_BARS;
      list.push([cx + dx, y0 + dy, cz + dz, id, id === B.AIR || id === B.BEDROCK ? undefined : 5]);
    }
    for (let dx = -3; dx <= 3; dx++) for (let dz = -6; dz <= -4; dz++) for (let dy = -1; dy <= 4; dy++) {
      const edge = Math.abs(dx) === 3 || dz === -6 || dy === -1 || dy === 4;
      list.push([cx + dx, y0 + dy, cz + dz, edge ? B.BEDROCK : B.AIR]);
    }
    const was = Net.capture;
    Net.capture = false;
    try {
      prepareArea(cx, cz, 1);
      editBlocks(list);
    } finally { Net.capture = was; }
    if (G.vehicle) Vehicles.dismount(true);
    if (G.player.seat) Furniture.stand(G.player);
    const p = G.player;
    p.pos = [cx + 0.5, y0, cz + 0.5]; p.vel = [0, 0, 0]; p.flying = false; p.fallStart = null;
    this.jail = { until: G.time + JAIL_TIME, out: [b.x0 - 4 + 0.5, b.F + 0.05, cz + 0.5], cell: [cx, y0, cz] };
    for (const m of this.cops) m.removed = true;
    this.cops = [];
    G.ui.banner('🚔', 'Arrested for damaging the Banc Central · ' + JAIL_TIME + ' s in the cells');
    sfx('door_close', null, 1, 0.7);
    Net.teleported();
  },

  update(dt) {
    this.warnT -= dt;
    if (this.arrestAt && G.time >= this.arrestAt) { this.arrestAt = 0; this.arrest(); }
    for (const m of this.cops) if (G.time > m.hideAt || m.dead) m.removed = true;
    this.cops = this.cops.filter((m) => !m.removed);
    const j = this.jail, el = $('jailTag');
    if (el) el.classList.toggle('show', !!j);
    if (!j) return;
    const p = G.player, left = Math.max(0, Math.ceil(j.until - G.time));
    if (el) el.querySelector('b').textContent = left + ' s';
    // no leaving early
    if (Math.abs(p.pos[0] - (j.cell[0] + 0.5)) > 2.6 || Math.abs(p.pos[2] - (j.cell[2] + 0.5)) > 2.6 || Math.abs(p.pos[1] - j.cell[1]) > 3) {
      p.pos = [j.cell[0] + 0.5, j.cell[1], j.cell[2] + 0.5]; p.vel = [0, 0, 0];
    }
    if (G.time >= j.until) {
      this.jail = null;
      p.pos = j.out.slice(); p.vel = [0, 0, 0]; p.fallStart = null;
      prepareArea(p.pos[0], p.pos[2], 1);
      liftOutOfBlocks(p);
      Net.teleported();
      G.ui.banner('🔓', 'You are free. Behave!');
    }
  },
};

SYNTH.siren = (ctx, o, t) => {
  for (let i = 0; i < 4; i++) {
    Sound.tone(ctx, o, t + i * 0.5, 0.25, { wave: 'sawtooth', f0: 700, f1: 1000, gain: 0.07, filter: ['lowpass', 2400, 1] });
    Sound.tone(ctx, o, t + i * 0.5 + 0.25, 0.25, { wave: 'sawtooth', f0: 1000, f1: 700, gain: 0.07, filter: ['lowpass', 2400, 1] });
  }
};

// ---------------------------------------------------------------- hooks ----
{
  const mining = Act.updateMining;
  Act.updateMining = function (dt, now) {
    const t = this.target, b = t && t.block;
    if (G.mouse.left && b && Police.inBank(b.pos[0], b.pos[1], b.pos[2])) {
      this.mine.pos = null; this.mine.progress = 0;
      Police.caught(b.pos[0], b.pos[1], b.pos[2]);
      return;
    }
    return mining.call(this, dt, now);
  };
  // officers are not traders
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.police) { G.ui.toast('👮 Move along, nothing to see here'); this.swingHand(); return true; }
    return use.call(this, initial);
  };
  // no teleport commands from the cells
  if (typeof Commands !== 'undefined') {
    const run = Commands.run;
    Commands.run = function (text) {
      if (Police.jail && /^\/(home|spawn|tp)\b/i.test(text)) { this.sys('🚔 Not while you are in the cells'); return; }
      return run.call(this, text);
    };
  }
  const travel = typeof travelTo === 'function' ? travelTo : null;
  if (travel) {
    // eslint-disable-next-line no-global-assign
    travelTo = function (key) { if (Police.jail) { G.ui.toast('🚔 Not while you are in the cells'); return false; } return travel(key); };
  }
}
