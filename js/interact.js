'use strict';
// Player actions: mining with tools, attacking, placing oriented blocks, eating, bows,
// buckets, hoes, bone meal, shears, dropping items, and the first-person hand animation.

const Act = {
  mine: { pos: null, id: 0, progress: 0, soundT: 0, partT: 0, normal: null, box: null },
  eat: null, bow: null, attackCd: 0, useCd: 0, stepAcc: 0,
  hand: { swing: 0, swinging: false, equip: 1, lastId: -1, eating: 0, bowPull: 0, bobX: 0, bobY: 0, swayYaw: 0, swayPitch: 0, prevYaw: 0, prevPitch: 0 },
  target: null,

  reach() { return G.mode === 'creative' ? 6 : 4.8; },
  mobReach() { return G.mode === 'creative' ? 5 : 3.6; },
  heldId() { const s = G.inv.held; return s ? s.id : 0; },

  swingHand() { const h = this.hand; if (!h.swinging || h.swing > 0.5) { h.swing = 0; h.swinging = true; } },

  // Raycast for blocks and mobs; the nearer one wins.
  pick() {
    const p = G.player;
    const hit = p.raycast(this.reach());
    const mob = Ents.raycastMob(p.eyePos(), p.lookDir(), this.mobReach());
    const veh = Vehicles.raycast(p.eyePos(), p.lookDir(), this.reach() + 1);
    const hd = hit ? hit.dist : Infinity, md = mob ? mob.dist : Infinity;
    if (veh && veh.dist < hd && veh.dist < md) return { vehicle: veh.vehicle, dist: veh.dist };
    if (mob && mob.dist < hd) return { mob: mob.mob, dist: mob.dist };
    return hit ? { block: hit } : null;
  },

  // ---------------------------------------------------------------- attack ----
  attack(mob) {
    const p = G.player, held = G.inv.held;
    const d = held && ITEM_DEF[held.id];
    let dmg = d && d.damage ? d.damage : 1;
    const crit = !p.onGround && p.vel[1] < -0.5 && !p.inWater && !p.onLadder;
    if (crit) { dmg *= 1.5; Particles.crit(mob.pos[0], mob.pos[1] + mob.h * 0.7, mob.pos[2]); sfx('crit', mob.pos, 0.8, 1); }
    const e = p.eyePos();
    const knock = p.sprinting ? 1.6 : 1;
    if (mob.damage(dmg, { player: true, from: [e[0], e[1], e[2]], knock })) {
      sfx('hit', mob.pos, 0.7, rand(0.9, 1.1));
      G.stats.addExhaustion(0.1);
      if (held && d && d.tool && G.mode === 'survival') {
        if (G.inv.damageHeld(d.tool === TOOL_SWORD ? 1 : 2)) sfx('tool_break', null, 0.8, 1);
        G.ui.invDirty();
      }
      if (p.sprinting) p.sprinting = false;
    }
    this.swingHand();
  },

  // ---------------------------------------------------------------- mining ----
  breakTime(id) {
    const hard = BLOCK_HARD[id];
    if (hard < 0) return Infinity;
    if (hard === 0) return 0;
    const held = this.heldId();
    const d = ITEM_DEF[held];
    let speed = 1;
    if (d && d.tool && d.tool === BLOCK_TOOL[id]) speed = d.speed || 1;
    if (d && d.tool === TOOL_SWORD && (BLOCK_TOOL[id] === TOOL_SHEARS || id === B.MELON || id === B.PUMPKIN)) speed = 1.5;
    if (d && d.tool === TOOL_SHEARS && BLOCK_TOOL[id] === TOOL_SHEARS) speed = BLOCK_RT[id] === RT_CUTOUT ? 15 : 5;
    let t = hard * (canHarvest(id, held) ? 1.5 : 5) / speed;
    const p = G.player;
    if (p.eyeInWater) t *= 5;
    if (!p.onGround && !p.onLadder && !p.inWater && !p.flying) t *= 2.5;
    return t;
  },

  finishBreak(x, y, z, id) {
    const held = this.heldId();
    const d = ITEM_DEF[held];
    destroyBlock(x, y, z, { drops: G.mode === 'survival', tool: held });
    if (G.mode === 'survival') {
      G.stats.addExhaustion(0.005);
      if (d && d.dur && BLOCK_HARD[id] > 0) {
        if (G.inv.damageHeld(d.tool === TOOL_SWORD ? 2 : 1)) sfx('tool_break', null, 0.8, 1);
        G.ui.invDirty();
      }
    }
  },

  updateMining(dt, now) {
    const m = this.mine;
    const reset = () => { m.pos = null; m.progress = 0; };
    if (!G.mouse.left || G.screenOpen || G.stats.dead) { reset(); return; }
    const t = this.target;
    if (this.attackCd > 0) this.attackCd -= dt;
    if (t && t.mob) {
      reset();
      if (this.attackCd <= 0) { this.attack(t.mob); this.attackCd = 0.45; }
      return;
    }
    if (!t || !t.block) { reset(); return; }
    const hit = t.block;
    const [x, y, z] = hit.pos;
    if (G.mode === 'creative') {
      reset();
      if (now >= G.mouse.nextBreak) {
        if (hit.id === B.BEDROCK && y === 0 && false) return;
        destroyBlock(x, y, z, { drops: false });
        this.swingHand();
        G.mouse.nextBreak = now + 220;
      }
      return;
    }
    if (!m.pos || m.pos[0] !== x || m.pos[1] !== y || m.pos[2] !== z || m.id !== hit.id) {
      m.pos = [x, y, z]; m.id = hit.id; m.progress = 0; m.soundT = 0; m.partT = 0;
    }
    m.normal = hit.normal; m.box = hit.box;
    if (now < G.mouse.nextBreak) return;
    const bt = this.breakTime(hit.id);
    this.swingHand();
    if (bt === Infinity) return;
    m.progress += bt <= 0 ? 1 : dt / bt;
    m.soundT -= dt; m.partT -= dt;
    if (m.soundT <= 0) { m.soundT = 0.24; sfx('dig_' + BLOCK_SOUND[hit.id], [x + 0.5, y + 0.5, z + 0.5], 0.7, rand(0.8, 1)); }
    if (m.partT <= 0) { m.partT = 0.15; Particles.blockHit(x, y, z, hit.id, hit.normal); }
    if (m.progress >= 1) {
      this.finishBreak(x, y, z, hit.id);
      reset();
      G.mouse.nextBreak = now + (bt <= 0 ? 150 : 220);
    }
  },

  crackInfo() {
    const m = this.mine;
    if (!m.pos || m.progress <= 0) return null;
    return { pos: m.pos, box: m.box || [0, 0, 0, 1, 1, 1], progress: Math.min(0.999, m.progress), normal: m.normal };
  },

  // ------------------------------------------------------------ using items ----
  dirIndex(n) { return n[0] > 0 ? 0 : n[0] < 0 ? 1 : n[2] > 0 ? 4 : 5; },
  faceToward(x, z) {
    const p = G.player.pos;
    const dx = p[0] - (x + 0.5), dz = p[2] - (z + 0.5);
    return Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? 0 : 1) : (dz > 0 ? 4 : 5);
  },

  // Orientation of a shaped block, slab or lantern being placed (see arch.js): the high side
  // points where you look, and anything placed against a ceiling or the upper half of a wall
  // goes upside down.
  shapeFacing(id, hit, n) {
    const lk = G.player.lookDir();
    const upper = n[1] < 0 || (n[1] === 0 && hit.point && hit.point[1] - Math.floor(hit.point[1]) > 0.5);
    const flip = upper ? 8 : 0;
    if (id === B.LANTERN) return n[1] < 0 ? 8 : 0;
    if (BLOCK_RT[id] === RT_SLAB) return flip;
    const look = Math.abs(lk[0]) > Math.abs(lk[2]) ? (lk[0] > 0 ? 0 : 1) : (lk[2] > 0 ? 4 : 5);
    const k = BLOCK_SHAPE[id];
    if (k === SH_OUTER || k === SH_INNER) {
      const sx = lk[0] >= 0, sz = lk[2] >= 0;
      return (sx ? (sz ? 4 : 0) : (sz ? 1 : 5)) | flip;
    }
    if ((k === SH_PANEL || k === SH_ARCH) && n[1] === 0) return this.dirIndex([-n[0], 0, -n[2]]) | (k === SH_ARCH ? 0 : flip);
    if (k === SH_PILLAR) return 0;
    if (k === SH_SEAT) return look;
    return look | flip;
  },

  entityBlocks(x, y, z, h) {
    if (G.player.intersectsBlock(x, y, z, h)) return true;
    for (const m of Ents.mobs) {
      if (m.dead) continue;
      if (m.pos[0] + m.hw > x && m.pos[0] - m.hw < x + 1 && m.pos[2] + m.hw > z && m.pos[2] - m.hw < z + 1 && m.pos[1] + m.h > y && m.pos[1] < y + h) return true;
    }
    return false;
  },

  consume(n = 1) { if (G.mode === 'survival') { G.inv.consumeHeld(n); G.ui.invDirty(); } },

  placeBlock(hit) {
    const w = G.world, held = G.inv.held;
    const d = held && ITEM_DEF[held.id];
    if (!d) return false;
    const placeId = d.block || d.places;
    if (!placeId) return false;
    let [x, y, z] = hit.pos;
    const n = hit.normal;
    // slab on slab -> full block (onto the top of a bottom slab or the underside of a top slab)
    const hitTop = hit.id === placeId && (w.getFacing(x, y, z) & 8);
    if (BLOCK_RT[placeId] === RT_SLAB && hit.id === placeId && ((n[1] === 1 && !hitTop) || (n[1] === -1 && hitTop))) {
      if (this.entityBlocks(x, y, z, 1)) return false;
      editBlock(x, y, z, SLAB_FULL[placeId]);
      sfx('place_' + BLOCK_SOUND[placeId], [x + 0.5, y + 0.5, z + 0.5], 1, 0.9);
      this.consume(); this.swingHand();
      return true;
    }
    if (!BLOCK_REPLACE[hit.id]) { x += n[0]; y += n[1]; z += n[2]; }
    if (y < 0 || y >= CH) return false;
    const cur = w.getBlock(x, y, z);
    if (BLOCK_RT[placeId] === RT_SLAB && cur === placeId) {
      if (this.entityBlocks(x, y, z, 1)) return false;
      editBlock(x, y, z, SLAB_FULL[placeId]);
      this.consume(); this.swingHand();
      return true;
    }
    if (!BLOCK_REPLACE[cur]) return false;
    let id = placeId, facing;
    if (placeId === B.TORCH) {
      if (n[1] < 0) return false;
      if (n[1] === 0 && !BLOCK_REPLACE[hit.id]) { id = B.WALL_TORCH; facing = this.dirIndex(n); }
    } else if (placeId === B.LADDER) {
      if (n[1] !== 0 || BLOCK_REPLACE[hit.id]) return false;
      facing = this.dirIndex(n);
    } else if (placeId === B.BED) {
      const lk = G.player.lookDir();
      facing = Math.abs(lk[0]) > Math.abs(lk[2]) ? (lk[0] > 0 ? 0 : 1) : (lk[2] > 0 ? 4 : 5);
    } else if (BLOCK_RT[placeId] === RT_SHAPE || BLOCK_RT[placeId] === RT_SLAB || placeId === B.LANTERN) {
      facing = this.shapeFacing(placeId, hit, n);
    } else if (FACING_BLOCKS.has(placeId)) facing = this.faceToward(x, z);
    if (placeId === B.DOOR) {
      // two blocks tall, standing on something solid
      if (y + 1 >= CH || !BLOCK_REPLACE[w.getBlock(x, y + 1, z)] || !BLOCK_SOLID[w.getBlock(x, y - 1, z)]) return false;
      if (this.entityBlocks(x, y, z, 2)) return false;
      editBlocks([[x, y, z, B.DOOR, facing], [x, y + 1, z, B.DOOR_TOP, facing]]);
      sfx('place_1', [x + 0.5, y + 0.5, z + 0.5], 1, 0.9);
      this.consume(); this.swingHand();
      return true;
    }
    if (BLOCK_SOLID[id] && this.entityBlocks(x, y, z, BLOCK_HEIGHT[id] / 16)) return false;
    if (BLOCK_SUPPORT[id] && !canStay(id, x, y, z, facing)) return false;
    if (cur === B.WATER && (BLOCK_RT[id] === RT_CROSS || id === B.TORCH || id === B.WALL_TORCH)) return false;
    editBlock(x, y, z, id, facing);
    sfx('place_' + BLOCK_SOUND[id], [x + 0.5, y + 0.5, z + 0.5], 1, rand(0.8, 0.95));
    this.consume();
    this.swingHand();
    checkFalling(x, y, z);
    return true;
  },

  // Ray march that stops at liquids too (buckets).
  liquidRay(maxDist) {
    const p = G.player, o = p.eyePos(), d = p.lookDir(), w = G.world;
    let prev = null;
    for (let t = 0; t < maxDist; t += 0.05) {
      const x = Math.floor(o[0] + d[0] * t), y = Math.floor(o[1] + d[1] * t), z = Math.floor(o[2] + d[2] * t);
      const id = w.getBlock(x, y, z);
      if (IS_LIQUID(id) || (id !== B.AIR && BLOCK_RT[id] !== RT_CROSS)) return { pos: [x, y, z], id, prev };
      prev = [x, y, z];
    }
    return null;
  },

  useItem(initial) {
    const held = G.inv.held;
    const d = held && ITEM_DEF[held.id];
    const p = G.player;
    const t = this.target;
    // climb into an aircraft
    if (t && t.vehicle) {
      if (initial) Vehicles.board(t.vehicle);
      return initial;
    }
    // put an aircraft down on the ground in front of the player
    if (held && held.id === I.JET && initial && t && t.block) {
      const [x, y, z] = t.block.pos;
      if (t.block.normal[1] !== 1) return false;
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      const top = y + BLOCK_HEIGHT[t.block.id] / 16;
      const j = Vehicles.spawnJet(x + 0.5 + fx * 4, top + JET_GEAR_H + 0.02, z + 0.5 + fz * 4, Math.atan2(fx, fz));
      Particles.poof(j.pos[0], j.pos[1], j.pos[2], 3, 2);
      sfx('place_8', j.pos, 1, 0.7);
      this.consume(); this.swingHand();
      return true;
    }
    // entity interactions
    if (t && t.mob) {
      const m = t.mob;
      if (initial && m.type === 'villager' && !m.dead) { G.ui.openTrade(m); this.swingHand(); return true; }
      if (initial && held && held.id === I.SHEARS && m.type === 'sheep' && !m.sheared) {
        m.sheared = true;
        Ents.spawnItem({ id: B.WOOL + m.woolColor, count: 1 + Math.floor(Math.random() * 3) }, m.pos[0], m.pos[1] + 1, m.pos[2]);
        sfx('place_6', m.pos, 1, 1.2);
        if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
        G.ui.invDirty();
        this.swingHand();
        return true;
      }
    }
    const hit = t && t.block;
    // block interactions (sneak to place against them instead)
    if (hit && initial && !p.sneaking) {
      const [x, y, z] = hit.pos;
      switch (hit.id) {
        case B.CRAFTING_TABLE: G.ui.openCrafting(); return true;
        case B.FURNACE: case B.FURNACE_LIT: G.ui.openFurnace(x, y, z); return true;
        case B.CHEST: case B.BARREL: G.ui.openChest(x, y, z); return true;
        case B.ARCH_TABLE: G.ui.open({ kind: 'arch' }); return true;
        case B.BED: trySleep(x, y, z); return true;
        case B.DOOR: case B.DOOR_TOP: case B.DOOR_OPEN: case B.DOOR_OPEN_TOP: case B.TRAPDOOR: case B.TRAPDOOR_OPEN:
          toggleDoor(x, y, z); this.swingHand(); return true;
        case B.TNT:
          if (held && held.id === I.FLINT_STEEL) {
            igniteTNT(x, y, z); sfx('ignite', [x + 0.5, y + 0.5, z + 0.5], 1, 1);
            if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
            G.ui.invDirty(); this.swingHand(); return true;
          }
          break;
        default: break;
      }
    }
    if (!held || !d) return false;
    // eating and bows are handled continuously while the button is held
    if (d.food && initial) {
      if (G.stats.food < 20 || d.always || G.mode === 'creative' || G.difficulty === 0) { this.eat = { t: 0, id: held.id, slot: G.inv.selected }; return true; }
    }
    if (held.id === I.BOW && initial) {
      if (G.mode === 'creative' || G.inv.count(I.ARROW) > 0) this.bow = { t: 0 };
      return true;
    }
    if (held.id === I.BUCKET || held.id === I.WATER_BUCKET || held.id === I.LAVA_BUCKET) {
      if (!initial) return false;
      const r = this.liquidRay(this.reach());
      if (!r) return false;
      if (held.id === I.BUCKET && IS_LIQUID(r.id)) {
        if (G.world.getFlow(r.pos[0], r.pos[1], r.pos[2]) > 0) return false;   // only still sources fill a bucket
        editBlock(r.pos[0], r.pos[1], r.pos[2], B.AIR);
        updateNeighbors(r.pos[0], r.pos[1], r.pos[2]);
        const full = mkStack(r.id === B.WATER ? I.WATER_BUCKET : I.LAVA_BUCKET, 1);
        if (G.mode === 'survival') {
          if (held.count === 1) G.inv.held = full;
          else { G.inv.consumeHeld(1); if (G.inv.add(full)) Ents.spawnItem(full, p.pos[0], p.pos[1] + 1, p.pos[2]); }
        }
        sfx('bucket', r.pos, 1, 1); this.swingHand(); G.ui.invDirty();
        return true;
      }
      if (held.id !== I.BUCKET && r.prev) {
        const pour = held.id === I.WATER_BUCKET ? B.WATER : B.LAVA;
        const into = r.id === pour && G.world.getFlow(r.pos[0], r.pos[1], r.pos[2]) > 0;   // top up a stream
        const [x, y, z] = (BLOCK_REPLACE[r.id] && !IS_LIQUID(r.id)) || into ? r.pos : r.prev;
        if (!BLOCK_REPLACE[G.world.getBlock(x, y, z)]) return false;
        if (into) { editBlock(x, y, z, B.AIR); }
        editBlock(x, y, z, pour);
        if (G.mode === 'survival') G.inv.held = mkStack(I.BUCKET, 1);
        sfx('bucket', [x, y, z], 1, 0.8); this.swingHand(); G.ui.invDirty();
        return true;
      }
      return false;
    }
    if (!hit) return false;
    const [x, y, z] = hit.pos;
    if (d.tool === TOOL_HOE && initial && (hit.id === B.GRASS || hit.id === B.DIRT) && G.world.getBlock(x, y + 1, z) === B.AIR) {
      editBlock(x, y, z, B.FARMLAND);
      sfx('step_9', [x + 0.5, y + 1, z + 0.5], 1, 0.8);
      if (G.mode === 'survival' && G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
      G.ui.invDirty(); this.swingHand();
      return true;
    }
    if (held.id === I.BONE_MEAL) {
      if (boneMeal(x, y, z)) {
        Particles.crit(x + 0.5, y + 0.8, z + 0.5, 8);
        this.consume(); this.swingHand();
        return true;
      }
      return false;
    }
    if (held.id === I.FLINT_STEEL) return false;
    return this.placeBlock(hit);
  },

  updateUse(dt, now) {
    const held = G.inv.held;
    // eating
    if (this.eat) {
      const e = this.eat;
      if (!G.mouse.right || !held || held.id !== e.id || G.inv.selected !== e.slot || G.screenOpen) { this.eat = null; }
      else {
        e.t += dt;
        if (Math.floor(e.t / 0.22) !== Math.floor((e.t - dt) / 0.22) && e.t > 0.3) {
          sfx('eat', null, 0.6, rand(0.8, 1.2));
          const eye = G.player.eyePos(), lk = G.player.lookDir();
          Particles.itemCrumbs(eye[0] + lk[0] * 0.4, eye[1] - 0.15, eye[2] + lk[2] * 0.4, e.id, 3);
        }
        if (e.t >= 1.6) {
          G.stats.eat(e.id);
          const d = ITEM_DEF[e.id];
          this.consume();
          if (d.returns && G.mode === 'survival') { const b = mkStack(d.returns, 1); if (!G.inv.held) G.inv.held = b; else if (G.inv.add(b)) Ents.spawnItem(b, G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]); }
          sfx('burp', null, 0.5, 1);
          this.eat = null;
          G.ui.invDirty();
        }
      }
    }
    // bow
    if (this.bow) {
      if (!held || held.id !== I.BOW || G.screenOpen) this.bow = null;
      else if (G.mouse.right) this.bow.t += dt;
      else {
        const pull = Math.min(1, this.bow.t / 1.0);
        this.bow = null;
        if (pull > 0.12) this.shoot(pull);
      }
    }
    this.hand.eating = this.eat ? this.eat.t : 0;
    this.hand.bowPull = this.bow ? Math.min(1, this.bow.t) : 0;
    // repeated placing while holding the button
    if (G.mouse.right && !this.eat && !this.bow && now >= G.mouse.nextPlace && !G.screenOpen && !G.stats.dead) {
      if (this.useItem(false)) G.mouse.nextPlace = now + 220;
      else G.mouse.nextPlace = now + 60;
    }
  },

  shoot(pull) {
    const p = G.player;
    if (G.mode === 'survival') {
      if (!G.inv.count(I.ARROW)) return;
      G.inv.remove(I.ARROW, 1);
      if (G.inv.damageHeld(1)) sfx('tool_break', null, 0.8, 1);
      G.ui.invDirty();
    }
    const e = p.eyePos(), d = p.lookDir();
    const sp = 12 + 46 * pull;
    const a = new Arrow([e[0] + d[0] * 0.3, e[1] - 0.1 + d[1] * 0.3, e[2] + d[2] * 0.3], [d[0] * sp + p.vel[0], d[1] * sp, d[2] * sp + p.vel[2]], p, 2);
    Ents.arrows.push(a);
    sfx('bow', null, 0.9, 1 + pull * 0.2);
    if (pull >= 1) a.dmg = 2.2;
  },

  dropHeld(all) {
    const s = G.inv.held;
    if (!s) return;
    const n = all ? s.count : 1;
    const p = G.player, e = p.eyePos(), d = p.lookDir();
    Ents.spawnItem({ id: s.id, count: n, dmg: s.dmg }, e[0] + d[0] * 0.3, e[1] - 0.3, e[2] + d[2] * 0.3, [d[0] * 5, d[1] * 5 + 2, d[2] * 5], 1.5);
    s.count -= n;
    if (s.count <= 0) G.inv.held = null;
    this.swingHand();
    G.ui.invDirty();
  },

  pickBlock() {
    const t = this.target;
    if (!t || !t.block) return;
    let id = t.block.id;
    if (id === B.WALL_TORCH) id = B.TORCH;
    if (id === B.FURNACE_LIT) id = B.FURNACE;
    if (id >= B.WHEAT_0 && id <= B.WHEAT_3) id = I.SEEDS;
    if (id === B.FARMLAND) id = B.DIRT;
    if (!isItem(id)) return;
    const idx = G.inv.slots.findIndex((s, i) => i < 9 && s && s.id === id);
    if (idx >= 0) { G.ui.selectSlot(idx); return; }
    if (G.mode !== 'creative') return;
    let slot = G.inv.selected;
    if (G.inv.held) { const empty = G.inv.slots.findIndex((s, i) => i < 9 && !s); if (empty >= 0) slot = empty; }
    G.inv.slots[slot] = mkStack(id, 1);
    G.ui.selectSlot(slot);
    G.ui.invDirty();
  },

  // ----------------------------------------------------------------- hand ----
  updateHand(dt) {
    const h = this.hand, p = G.player;
    if (h.swinging) {
      h.swing += dt / 0.28;
      if (h.swing >= 1) { h.swing = 0; h.swinging = false; }
    }
    const id = this.heldId();
    if (id !== h.lastId) { h.lastId = id; h.equip = 0.2; }
    h.equip = Math.min(1, h.equip + dt * 5);
    const bob = G.settings.bobbing ? p.bobAmount : 0;
    h.bobX = Math.sin(p.bobPhase) * 0.028 * bob;
    h.bobY = Math.abs(Math.cos(p.bobPhase)) * 0.032 * bob;
    let dy = p.yaw - h.prevYaw;
    if (dy > Math.PI) dy -= Math.PI * 2; else if (dy < -Math.PI) dy += Math.PI * 2;
    const dp = p.pitch - h.prevPitch;
    h.prevYaw = p.yaw; h.prevPitch = p.pitch;
    const k = 1 - Math.exp(-dt * 10);
    h.swayYaw += (clamp(-dy * 1.5, -0.25, 0.25) - h.swayYaw) * k;
    h.swayPitch += (clamp(dp * 1.5, -0.2, 0.2) - h.swayPitch) * k;
  },

  handState() {
    const h = this.hand;
    return { itemId: this.heldId(), swing: h.swinging ? h.swing : 0, equip: h.equip, eating: h.eating, bowPull: h.bowPull,
      bobX: h.bobX, bobY: h.bobY, swayYaw: h.swayYaw, swayPitch: h.swayPitch };
  },

  // footsteps, splashes, swimming
  updateSounds(dt) {
    const p = G.player;
    if (p.onGround && !p.sneaking && p.stepDist > 1.9) {
      p.stepDist = 0;
      const id = G.world.getBlock(Math.floor(p.pos[0]), Math.floor(p.pos[1] - 0.1), Math.floor(p.pos[2]));
      if (id) sfx('step_' + BLOCK_SOUND[id], [p.pos[0], p.pos[1], p.pos[2]], 0.9, rand(0.9, 1.1));
    } else if (p.sneaking) p.stepDist = Math.min(p.stepDist, 1.0);
    if (p.inWater && !this.wasInWater && p.vel[1] < -4) { sfx('splash', null, 0.8, 1); Particles.splash(p.pos[0], p.pos[1] + 0.8, p.pos[2]); }
    this.wasInWater = p.inWater;
    if (p.inWater && Math.hypot(p.vel[0], p.vel[2]) > 1) { this.stepAcc += dt; if (this.stepAcc > 0.7) { this.stepAcc = 0; sfx('swim', null, 0.6, rand(0.9, 1.1)); } }
  },
};
