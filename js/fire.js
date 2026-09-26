'use strict';
// Fire. Flint and steel lights a fire on the face you click (unless it is a portal frame). Fires
// burn the flammable blocks around them (wood, leaves, wool, hay, plants...) and spread to air
// next to other flammable blocks, then die out; on netherrack they burn for ever. Rain puts out
// fires under the open sky; water and a punch put them out too. Standing in fire sets you (and
// mobs) alight. Online only the host's game spreads fire; the blocks it changes are shared.

// how readily each block catches: 0 never, 1 wood, 2 leaves / wool / hay, 3 plants
const FLAMMABLE = new Uint8Array(MAX_BLOCK);
{
  for (let id = 1; id < MAX_BLOCK; id++) {
    if (BLOCK_NAME[id] === undefined || id === B.FIRE || IS_LIQUID(id)) continue;
    const snd = BLOCK_SOUND[id];
    if (BLOCK_RT[id] === RT_CROSS && BLOCK_SUPPORT[id] === SUP_SOIL) FLAMMABLE[id] = 3;
    else if (snd === SND.WOOL) FLAMMABLE[id] = 2;
    else if (snd === SND.WOOD && BLOCK_SOLID[id]) FLAMMABLE[id] = 1;
  }
  for (const id of [...TAG.leaves, B.HAY_BALE, B.THATCH, B.BUSH, B.TALLGRASS]) if (id) FLAMMABLE[id] = 2;
  for (const id of [B.TNT, B.BOOKSHELF]) FLAMMABLE[id] = 2;
  for (const id of [B.NETHERRACK, B.SOUL_SAND]) FLAMMABLE[id] = 0;
}
const FIRE_ETERNAL = new Set([B.NETHERRACK, B.SOUL_SAND, B.CRIMSON_NYLIUM, B.WARPED_NYLIUM]);
const FIRE_NB = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

gen('fire', (d, rng, ctx) => {
  clearTile(d, [255, 150, 40]);
  const f = fbm(rng, 4, 3);
  // three tongues of flame rising from the bottom, hot white-yellow at the base, red at the tips
  const tongues = [[9, 26, 3.4], [17, 30, 4.6], [25, 24, 3.2], [13, 20, 2.4], [21, 21, 2.6]];
  fillTile(d, (x, y, k) => {
    const h = TS - y;                    // height above the bottom
    let best = 0;
    for (const [cx, top, w] of tongues) {
      const t = h / top;
      if (t > 1) continue;
      const half = w * (1 - t * t) * (1.1 + f[k] * 0.5) + (t < 0.3 ? 2.5 : 0);
      const dx = Math.abs(x + 0.5 - cx - Math.sin(t * 5 + cx) * 1.2);
      if (dx < half) best = Math.max(best, 1 - Math.max(t, dx / half * 0.6));
    }
    if (best <= 0.04) return;
    const heat = clamp(best * 1.3 - h / TS * 0.3, 0, 1);
    const c = heat > 0.75 ? mixc([255, 214, 90], [255, 250, 210], (heat - 0.75) * 4) : heat > 0.4 ? mixc([240, 110, 30], [255, 214, 90], (heat - 0.4) / 0.35) : mixc([170, 40, 20], [240, 110, 30], heat / 0.4);
    put(d, x, y, c);
    ctx.emit[k] = 0.55 + heat * 0.45;
  });
}, { smooth: 0.2, bump: 0 });

SYNTH.crackle = (ctx, o, t) => { for (let i = 0; i < 5; i++) Sound.noise(ctx, o, t + Math.random() * 0.4, 0.03, { type: 'bandpass', freq: 1500 + Math.random() * 2500, q: 2, gain: 0.18 }); };

const Fire = {
  active: new Map(),   // posKey -> { x, y, z, age, life }
  t: 0, fxT: 0,

  add(x, y, z) {
    const k = posKey(x, y, z);
    if (!this.active.has(k) && this.active.size < 600) this.active.set(k, { x, y, z, age: 0, life: rand(5, 9) });
  },

  // Flint and steel on a block: fire on the clicked face (on top of TNT it lights the TNT instead).
  light(hit) {
    const w = G.world;
    const x = hit.pos[0] + hit.normal[0], y = hit.pos[1] + hit.normal[1], z = hit.pos[2] + hit.normal[2];
    const cur = w.getBlock(x, y, z);
    if (!(cur === B.AIR || (BLOCK_REPLACE[cur] && !IS_LIQUID(cur)))) return false;
    // fire needs something under it or a flammable block beside it
    if (!BLOCK_SOLID[w.getBlock(x, y - 1, z)] && !this.fuelAround(x, y, z)) return false;
    editBlock(x, y, z, B.FIRE);
    this.add(x, y, z);
    sfx('ignite', [x + 0.5, y + 0.5, z + 0.5], 1, 1);
    if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
    G.ui.invDirty();
    Act.swingHand();
    return true;
  },

  fuelAround(x, y, z) {
    const w = G.world;
    for (const [dx, dy, dz] of FIRE_NB) if (FLAMMABLE[w.getBlock(x + dx, y + dy, z + dz)]) return true;
    return false;
  },

  raining() { return (Weather.kind === 'rain' || Weather.kind === 'storm') && Weather.amount > 0.35; },

  update(dt) {
    if (!G.world || !this.active.size) return;
    const w = G.world;
    // flickering light and smoke near the camera
    this.fxT -= dt;
    const fx = this.fxT <= 0;
    if (fx) this.fxT = 0.12;
    const p = G.player.pos;
    let near = 0;
    if (fx) for (const f of this.active.values()) {
      const d = Math.abs(f.x + 0.5 - p[0]) + Math.abs(f.z + 0.5 - p[2]);
      if (d > 28) continue;
      near++;
      if (Math.random() < 0.5) Particles.flame(f.x + rand(0.2, 0.8), f.y + rand(0.3, 0.9), f.z + rand(0.2, 0.8));
      if (Math.random() < 0.25) Particles.smoke(f.x + 0.5, f.y + 1, f.z + 0.5, 1, 0.4, false);
      if (Math.random() < 0.04) sfx('crackle', [f.x + 0.5, f.y + 0.5, f.z + 0.5], 1, 1);
    }
    void near;
    this.t -= dt;
    if (this.t > 0) return;
    const step = 0.25;
    this.t = step;
    // online, only one game decides how fire spreads
    const sim = !Net.on || !Net.server || !Net.isHost || Net.isHost();
    const wet = this.raining();
    for (const [k, f] of this.active) {
      const { x, y, z } = f;
      if (!w.isLoaded(x, z)) continue;
      if (w.getBlock(x, y, z) !== B.FIRE) { this.active.delete(k); continue; }
      f.age += step;
      const base = w.getBlock(x, y - 1, z);
      const eternal = FIRE_ETERNAL.has(base);
      // rain under the open sky
      if (wet && !eternal && (w.getLight(x, y, z) >> 4) >= 15 && Math.random() < 0.15) { this.out(k, f, true); continue; }
      if (!sim) continue;
      let fuel = false;
      for (const [dx, dy, dz] of FIRE_NB) {
        const nx = x + dx, ny = y + dy, nz = z + dz;
        const id = w.getBlock(nx, ny, nz);
        const fl = FLAMMABLE[id];
        if (!fl) continue;
        fuel = true;
        // the block itself catches and burns away (TNT goes off)
        if (Math.random() < [0, 0.018, 0.05, 0.12][fl] * (wet ? 0.3 : 1)) {
          if (id === B.TNT) { igniteTNT(nx, ny, nz); continue; }
          const into = Math.random() < 0.6 && (dy >= 0 || BLOCK_SOLID[w.getBlock(nx, ny - 1, nz)]) ? B.FIRE : B.AIR;
          editBlock(nx, ny, nz, into);
          if (into === B.FIRE) this.add(nx, ny, nz);
        }
      }
      // jumping to air beside another flammable block
      if (fuel && Math.random() < (wet ? 0.05 : 0.2)) {
        const nx = x + Math.floor(rand(-1, 2)), ny = y + Math.floor(rand(-1, 3)), nz = z + Math.floor(rand(-1, 2));
        if (w.getBlock(nx, ny, nz) === B.AIR && this.fuelAround(nx, ny, nz) && Math.abs(nx - p[0]) + Math.abs(nz - p[2]) < 120) { editBlock(nx, ny, nz, B.FIRE); this.add(nx, ny, nz); }
      }
      // with nothing left to burn it dies down; floating fire goes at once
      if (eternal) continue;
      if (!BLOCK_SOLID[base] && !fuel) { this.out(k, f, false); continue; }
      if (f.age > (fuel ? f.life * 3 : f.life)) this.out(k, f, false);
    }
    // standing in fire
    const pl = G.player;
    const feet = w.getBlock(Math.floor(pl.pos[0]), Math.floor(pl.pos[1] + 0.2), Math.floor(pl.pos[2]));
    if (feet === B.FIRE && G.mode === 'survival' && !G.vehicle) G.stats.fire = Math.max(G.stats.fire, 4);
    for (const m of Ents.mobs) {
      if (m.dead) continue;
      if (w.getBlock(Math.floor(m.pos[0]), Math.floor(m.pos[1] + 0.2), Math.floor(m.pos[2])) === B.FIRE) m.fire = Math.max(m.fire, 4);
    }
  },

  out(k, f, fizz) {
    this.active.delete(k);
    if (G.world.getBlock(f.x, f.y, f.z) === B.FIRE) editBlock(f.x, f.y, f.z, B.AIR);
    if (fizz) { sfx('fizz', [f.x + 0.5, f.y + 0.5, f.z + 0.5], 0.6, 1); Particles.smoke(f.x + 0.5, f.y + 0.5, f.z + 0.5, 3, 0.5, false); }
  },

  reset() { this.active.clear(); },
};

// old fires found by the random ticks start burning again
TICKABLE[B.FIRE] = 1;
{
  const rt = randomTick;
  // eslint-disable-next-line no-global-assign
  randomTick = function (x, y, z, id) { if (id === B.FIRE) { Fire.add(x, y, z); return; } rt(x, y, z, id); };
}

// Air of the other dimensions: drifting ash and embers in the Nether, violet sparks in the End,
// pale sculk spores in the Deep Dark (around the camera only).
const DimAir = {
  update(dt, cam, dim) {
    if (!dim || !G.world || !G.settings.wildlife) return;
    const n = Math.min(6, Math.floor(dt * 60 * (dim === DIM_NETHER ? 1.4 : 0.8) + Math.random()));
    for (let i = 0; i < n; i++) {
      const x = cam[0] + rand(-14, 14), y = cam[1] + rand(-5, 8), z = cam[2] + rand(-14, 14);
      if (G.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z)) !== B.AIR) continue;
      const l = rand(3, 6);
      if (dim === DIM_NETHER) {
        const ember = Math.random() < 0.25;
        Particles.add(Particles.base(x, y, z, { vx: rand(-0.3, 0.3), vy: ember ? rand(0.3, 0.9) : rand(-0.35, -0.1), vz: rand(-0.3, 0.3), life: l, max: l, size: ember ? 0.05 : rand(0.04, 0.08),
          layer: ember ? T.p_flame : T.p_smoke, glow: ember, r: ember ? 1 : 0.25, g: ember ? 0.6 : 0.22, b: ember ? 0.3 : 0.22, blend: !ember, drag: 0.995, collide: false }));
      } else if (dim === DIM_END) {
        Particles.add(Particles.base(x, y, z, { vx: rand(-0.1, 0.1), vy: rand(-0.05, 0.12), vz: rand(-0.1, 0.1), life: l, max: l, size: 0.05, layer: T.p_crit, glow: true, r: 0.8, g: 0.5, b: 1, drag: 0.99, collide: false }));
      } else if (dim === DIM_DEEP) {
        Particles.add(Particles.base(x, y, z, { vx: rand(-0.08, 0.08), vy: rand(0.02, 0.15), vz: rand(-0.08, 0.08), life: l, max: l, size: 0.04, layer: T.p_crit, glow: true, r: 0.35, g: 0.85, b: 0.9, drag: 0.99, collide: false }));
      }
    }
  },
};
