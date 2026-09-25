'use strict';
// Game state, chunk streaming, block edits (support, falling, drops), random ticks (crops,
// saplings, grass), furnaces and chests, explosions, sleeping, spawning and persistence.

const SAVE_KEY = 'blocklands.world.v2';
const SAVE_KEY_V1 = 'blocklands.world.v1';
const SETTINGS_KEY = 'blocklands.settings.v1';
const DAY_LENGTH = 1200; // seconds per full day

const DEFAULT_SETTINGS = {
  renderDistance: 8, shadows: 'medium', ssr: true, clouds: true, godrays: true, bloom: true, fxaa: true,
  renderScale: 1, fov: 75, sensitivity: 1, brightness: 1, dayCycle: true, volume: 0.7, bobbing: true, dynamicRes: true,
  weather: 'auto', events: true, wildlife: true, skin: 0, minimap: 'normal', autoTuned: false,
};

const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

const G = {
  canvas: $('game'),
  settings: Object.assign({}, DEFAULT_SETTINGS),
  renderer: null, world: null, player: null, inv: new Inventory(), stats: new Stats(), ui: null,
  input: { keys: new Set(), sprintHeld: false },
  mouse: { left: false, right: false, nextBreak: 0, nextPlace: 0 },
  playing: false, started: false, screenOpen: false, hudHidden: false, debug: false, dead: false,
  mode: 'survival', difficulty: 2, rules: { keepInventory: false, mobSpawning: true },
  dayTime: 0.08, time: 0, frameCount: 0,
  offsets: null, offsetsR: -1, lastSave: 0,
  fps: 0, frameMs: 0, fpsAcc: 0, fpsFrames: 0, lastDebug: 0,
  eyeSky: 1, lastTime: 0, shake: 0,
  worldSpawn: [0.5, 80, 0.5], spawnPoint: null, sleeping: null,
  vehicle: null, region: null, regionOwn: null, regionT: 0, online: false, onTitle: true,
  unlocked: false, lockPending: false, drag: { active: false, moved: 0, t: 0, mining: false },
  tickAcc: 0, furnaceAcc: 0, caveSoundT: 20,
};

// ---------- chunks ----------
function buildOffsets(R) {
  const out = [];
  // meshed chunks reach R + 0.5; their diagonal neighbours must exist too (R + 0.5 + sqrt 2)
  const lim = R + 3;
  for (let dz = -lim; dz <= lim; dz++) for (let dx = -lim; dx <= lim; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= R + 2) out.push([dx, dz, d]);
  }
  out.sort((a, b) => a[2] - b[2]);
  G.offsets = out;
  G.offsetsR = R;
}

function neighborsLoaded(cx, cz) {
  const w = G.world;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.getChunk(cx + dx, cz + dz)) return false;
  return true;
}

function meshChunk(c) {
  const res = buildChunkMesh(G.world, c);
  G.renderer.uploadChunk(c, res);
  c.needsMesh = false;
  // anything a worker is still building for this chunk is now out of date
  c.meshVer = (c.meshVer || 0) + 1;
  c.meshInFlight = false;
}

// Where terrain streams around: the player, or the aircraft they are flying.
function streamCenter() {
  const v = G.vehicle;
  if (v) {
    // look ahead along the flight path so the ground in front is ready in time
    const ahead = clamp(v.speed * 1.2, 0, 70);
    return [v.pos[0] + v.fwd[0] * ahead, v.pos[2] + v.fwd[2] * ahead];
  }
  return [G.player.pos[0], G.player.pos[2]];
}

function updateChunks(budgetMs) {
  // a jet in the air sees further: stream a wider ring and let the renderer fade it in; so does
  // the Camp Nou, whose far stand is ~140 m from the centre spot
  const boost = G.vehicle && !G.vehicle.onGround ? 3 : G.world.type === 'campnou' ? Math.max(0, 9 - G.settings.renderDistance) : 0;
  const r = G.renderer;
  r.rangeBoost = (r.rangeBoost || 0) + (boost - (r.rangeBoost || 0)) * 0.02;
  const R = G.settings.renderDistance + Math.round(r.rangeBoost);
  if (G.offsetsR !== R) buildOffsets(R);
  const c0 = streamCenter();
  const pcx = Math.floor(c0[0] / CS), pcz = Math.floor(c0[1] / CS);
  if (ChunkWorkers.ok) updateChunksAsync(R, pcx, pcz, budgetMs);
  else updateChunksSync(R, pcx, pcz, budgetMs);
  // unload far chunks now and then
  if ((G.frameCount & 63) === 0) {
    const w = G.world;
    const lim = R + 4;
    const ppx = Math.floor(G.player.pos[0] / CS), ppz = Math.floor(G.player.pos[2] / CS);
    for (const [key, c] of w.chunks) {
      const far = (cx, cz) => Math.abs(c.cx - cx) > lim || Math.abs(c.cz - cz) > lim;
      if (far(pcx, pcz) && far(ppx, ppz)) {
        G.renderer.freeChunk(c);
        w.chunks.delete(key);
      }
    }
  }
}

// Workers generate and mesh; the main thread only hands out jobs and uploads results.
function updateChunksAsync(R, pcx, pcz, budgetMs) {
  const t0 = performance.now();
  const w = G.world, CW = ChunkWorkers;
  for (const [dx, dz] of G.offsets) {
    if (!CW.canGen()) break;
    const cx = pcx + dx, cz = pcz + dz;
    if (!w.getChunk(cx, cz)) CW.gen(w, cx, cz);
  }
  let synced = 0;
  for (const [dx, dz, d] of G.offsets) {
    if (d > R + 0.5) break;
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (!c || !c.needsMesh || c.meshInFlight || !neighborsLoaded(c.cx, c.cz)) continue;
    // the few chunks right around the player are rebuilt at once (edits, explosions)
    if (d < 1.5 && synced < 2 && performance.now() - t0 < budgetMs) { meshChunk(c); synced++; continue; }
    if (!CW.canMesh()) break;
    CW.mesh(w, c);
  }
}

function updateChunksSync(R, pcx, pcz, budgetMs) {
  const t0 = performance.now();
  const w = G.world;
  let work = 0;
  for (const [dx, dz] of G.offsets) {
    if (work > 0 && performance.now() - t0 > budgetMs * 0.45) break;
    const cx = pcx + dx, cz = pcz + dz;
    if (!w.getChunk(cx, cz)) { w.generateChunk(cx, cz); work++; }
  }
  for (const [dx, dz, d] of G.offsets) {
    if (d > R + 0.5) break;
    if (work > 0 && performance.now() - t0 > budgetMs) break;
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (!c || !c.needsMesh || !neighborsLoaded(c.cx, c.cz)) continue;
    meshChunk(c);
    work++;
  }
}

// ---------- block edits ----------
function editBlock(x, y, z, id, facing) {
  const w = G.world;
  const old = w.getBlock(x, y, z);
  const list = w.setBlock(x, y, z, id, facing);
  if (!list) return false;
  Net.edit(x, y, z, id, facing);
  if (old !== id) cleanupBlockEntity(x, y, z, old, id);
  Fluids.touch(x, y, z);
  const c = list[0];
  const lx = x & 15, lz = z & 15;
  if (neighborsLoaded(c.cx, c.cz)) meshChunk(c); else c.needsMesh = true;
  for (let i = 1; i < list.length; i++) {
    const n = list[i];
    const dx = n.cx - c.cx, dz = n.cz - c.cz;
    const touchX = dx === 0 || (dx === -1 && lx === 0) || (dx === 1 && lx === 15);
    const touchZ = dz === 0 || (dz === -1 && lz === 0) || (dz === 1 && lz === 15);
    if (touchX && touchZ && neighborsLoaded(n.cx, n.cz)) meshChunk(n); else n.needsMesh = true;
  }
  return true;
}

// Many edits at once (explosions, trees): each chunk is re-meshed a single time.
function editBlocks(list) {
  const w = G.world;
  const dirty = new Set();
  for (const [x, y, z, id, facing] of list) {
    const old = w.getBlock(x, y, z);
    const res = w.setBlock(x, y, z, id, facing);
    if (!res) continue;
    Net.edit(x, y, z, id, facing);
    if (old !== id) cleanupBlockEntity(x, y, z, old, id);
    Fluids.touch(x, y, z);
    for (const c of res) dirty.add(c);
  }
  for (const c of dirty) c.needsMesh = true;
  const p = G.player.pos;
  const pcx = Math.floor(p[0] / CS), pcz = Math.floor(p[2] / CS);
  for (const c of dirty) if (Math.abs(c.cx - pcx) <= 1 && Math.abs(c.cz - pcz) <= 1 && neighborsLoaded(c.cx, c.cz)) meshChunk(c);
}

function cleanupBlockEntity(x, y, z, old, id) {
  const k = posKey(x, y, z);
  const be = G.world.blockEntities.get(k);
  if (!be) return;
  const keep = (be.type === 'furnace' && (id === B.FURNACE || id === B.FURNACE_LIT)) || (be.type === 'chest' && (id === B.CHEST || id === B.BARREL));
  if (keep) return;
  for (const s of be.slots || []) if (s && s.id) Ents.spawnItem(cloneStack(s), x + 0.5, y + 0.5, z + 0.5);
  G.world.blockEntities.delete(k);
  if (G.ui) G.ui.blockEntityRemoved(k);
}

function blockEntity(x, y, z, type) {
  const k = posKey(x, y, z);
  let be = G.world.blockEntities.get(k);
  if (!be || be.type !== type) {
    be = type === 'chest' ? { type, slots: new Array(27).fill(null) } : { type, slots: [null, null, null], burn: 0, burnMax: 0, cook: 0 };
    G.world.blockEntities.set(k, be);
  }
  return be;
}

const FACE_DIR = { 0: [1, 0, 0], 1: [-1, 0, 0], 4: [0, 0, 1], 5: [0, 0, -1] };

function canStay(id, x, y, z, facing) {
  const w = G.world;
  const below = w.getBlock(x, y - 1, z);
  switch (BLOCK_SUPPORT[id]) {
    case SUP_FLOOR: return BLOCK_SOLID[below] === 1 && BLOCK_HEIGHT[below] === 16;
    case SUP_WALL: {
      const d = FACE_DIR[facing !== undefined ? facing : w.getFacing(x, y, z)] || [0, 0, 1];
      const b = w.getBlock(x - d[0], y, z - d[2]);
      return BLOCK_SOLID[b] && BLOCK_HEIGHT[b] === 16;
    }
    case SUP_SOIL: return SOIL.has(below);
    case SUP_SAND: return below === B.SAND || below === B.DIRT || below === B.GRASS || below === B.TERRACOTTA;
    case SUP_SOLID: return BLOCK_OPAQUE[below] === 1;
    case SUP_FARMLAND: return below === B.FARMLAND;
    case SUP_CANE: {
      if (below === B.SUGAR_CANE) return true;
      if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND) return false;
      return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dz]) => w.getBlock(x + dx, y - 1, z + dz) === B.WATER);
    }
    case SUP_CACTUS: return below === B.SAND || below === B.CACTUS;
    default: return true;
  }
}

// Blocks around (x, y, z) that lost their support pop off; sand and gravel start falling.
function updateNeighbors(x, y, z, depth = 0) {
  if (depth > 64) return;
  const w = G.world;
  for (const [dx, dy, dz] of [[0, 1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
    const nx = x + dx, ny = y + dy, nz = z + dz;
    const id = w.getBlock(nx, ny, nz);
    if (BLOCK_SUPPORT[id] && !canStay(id, nx, ny, nz)) {
      if (G.mode === 'survival') for (const [it, n] of blockDrops(id, 0, Math.random)) Ents.spawnItem({ id: it, count: n }, nx + 0.5, ny + 0.3, nz + 0.5);
      Particles.blockBreak(nx, ny, nz, id);
      editBlock(nx, ny, nz, B.AIR);
      updateNeighbors(nx, ny, nz, depth + 1);
    }
  }
  checkFalling(x, y + 1, z);
}

// Opens or closes a door (both halves) or a trapdoor.
function toggleDoor(x, y, z) {
  const w = G.world;
  const id = w.getBlock(x, y, z);
  if (id === B.TRAPDOOR || id === B.TRAPDOOR_OPEN) {
    const open = id === B.TRAPDOOR;
    editBlock(x, y, z, open ? B.TRAPDOOR_OPEN : B.TRAPDOOR);
    sfx(open ? 'door_open' : 'door_close', [x + 0.5, y + 0.5, z + 0.5], 1, 1.15);
    return;
  }
  if (!DOOR_IDS.has(id)) return;
  const by = isDoorTop(id) ? y - 1 : y;
  const open = !isOpenDoor(id);
  const edits = [[x, by, z, open ? B.DOOR_OPEN : B.DOOR]];
  if (DOOR_IDS.has(w.getBlock(x, by + 1, z))) edits.push([x, by + 1, z, open ? B.DOOR_OPEN_TOP : B.DOOR_TOP]);
  editBlocks(edits);
  const c = w.getChunk(x >> 4, z >> 4);
  if (c && neighborsLoaded(c.cx, c.cz)) meshChunk(c);
  sfx(open ? 'door_open' : 'door_close', [x + 0.5, by + 1, z + 0.5], 1, 1);
}

// Removes a block like a player would: drops, particles, sound and neighbour updates.
function destroyBlock(x, y, z, opts = {}) {
  const w = G.world;
  const id = w.getBlock(x, y, z);
  if (id === B.AIR || IS_LIQUID(id)) return false;
  if (DOOR_IDS.has(id)) {
    // the other half of a door goes with it
    const oy = isDoorTop(id) ? y - 1 : y + 1;
    if (DOOR_IDS.has(w.getBlock(x, oy, z))) editBlock(x, oy, z, B.AIR);
  }
  let fill = B.AIR;   // liquid next to the hole flows in (fluids.js)
  if (id === B.ICE && G.mode === 'survival') fill = B.WATER;
  if (opts.drops) {
    for (const [it, n] of blockDrops(id, opts.tool || 0, Math.random)) {
      Ents.spawnItem({ id: it, count: n }, x + 0.5, y + 0.4, z + 0.5);
    }
  }
  if (!opts.silent) {
    Particles.blockBreak(x, y, z, id);
    sfx('break_' + BLOCK_SOUND[id], [x + 0.5, y + 0.5, z + 0.5], 1, rand(0.85, 1.05));
  }
  editBlock(x, y, z, fill);
  updateNeighbors(x, y, z);
  return true;
}

// ---------- growth ----------
function growTree(x, y, z, sapling) {
  const w = G.world;
  const kind = sapling === B.BIRCH_SAPLING ? 'birch' : sapling === B.SPRUCE_SAPLING ? 'spruce' : 'oak';
  const need = kind === 'spruce' ? 9 : 7;
  for (let i = 1; i < need; i++) {
    const id = w.getBlock(x, y + i, z);
    if (id !== B.AIR && BLOCK_RT[id] !== RT_CUTOUT) return false;
  }
  const edits = [[x, y, z, B.AIR]];
  const pending = new Map();
  const get = (wx, wy, wz) => {
    if (wy < 0 || wy >= CH || !w.isLoaded(wx, wz)) return -1;
    const k = posKey(wx, wy, wz);
    return pending.has(k) ? pending.get(k) : (wx === x && wy === y && wz === z ? B.AIR : w.getBlock(wx, wy, wz));
  };
  const set = (wx, wy, wz, id) => { pending.set(posKey(wx, wy, wz), id); edits.push([wx, wy, wz, id]); };
  buildTree(get, set, x, y, z, kind, Math.random(), G.world.seed);
  editBlocks(edits);
  return true;
}

function randomTick(x, y, z, id) {
  const w = G.world;
  const L = w.getLight(x, y, z);
  const light = Math.max((L >> 4) * (isDaytime() ? 1 : 0.3), L & 15);
  if (id >= B.WHEAT_0 && id < B.WHEAT_3) {
    if (light >= 8 && Math.random() < 0.5) editBlock(x, y, z, id + 1);
  } else if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING) {
    if (light >= 8 && Math.random() < 0.25) growTree(x, y, z, id);
  } else if (id === B.SUGAR_CANE || id === B.CACTUS) {
    if (w.getBlock(x, y + 1, z) === B.AIR && Math.random() < 0.35) {
      let h = 1;
      while (h < 4 && w.getBlock(x, y - h, z) === id) h++;
      if (h < 3) { editBlock(x, y + 1, z, id); }
    }
  } else if (id === B.DIRT) {
    const above = w.getBlock(x, y + 1, z);
    if (BLOCK_ATTEN[above] <= 1 && !IS_LIQUID(above) && (w.getLight(x, y + 1, z) >> 4) >= 9) {
      for (let k = 0; k < 4; k++) {
        const nx = x + Math.floor(rand(-1, 2)), ny = y + Math.floor(rand(-2, 2)), nz = z + Math.floor(rand(-1, 2));
        if (w.getBlock(nx, ny, nz) === B.GRASS) { editBlock(x, y, z, B.GRASS); break; }
      }
    }
  } else if (id === B.GRASS) {
    const above = w.getBlock(x, y + 1, z);
    if (BLOCK_OPAQUE[above] || IS_LIQUID(above)) editBlock(x, y, z, B.DIRT);
  } else if (id === B.FARMLAND) {
    const above = w.getBlock(x, y + 1, z);
    if (!(above >= B.WHEAT_0 && above <= B.WHEAT_3) && Math.random() < 0.12) editBlock(x, y, z, B.DIRT);
  }
}

const TICKABLE = new Uint8Array(256);
[B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING, B.SUGAR_CANE, B.CACTUS, B.DIRT, B.GRASS, B.FARMLAND].forEach((id) => { TICKABLE[id] = 1; });

function randomTicks(dt) {
  G.tickAcc += dt;
  if (G.tickAcc < 0.05) return;
  G.tickAcc = 0;
  // growth happens on every player's machine on its own: nothing to share
  Net.capture = false;
  try { randomTicksNow(); } finally { Net.capture = true; }
}

function randomTicksNow() {
  const w = G.world;
  const pcx = Math.floor(G.player.pos[0] / CS), pcz = Math.floor(G.player.pos[2] / CS);
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (!c || !c.mesh) continue;
    const sections = (c.maxY >> 4) + 1;
    for (let s = 0; s < sections; s++) for (let k = 0; k < 3; k++) {
      const r = (Math.random() * 4096) | 0;
      const lx = r & 15, lz = (r >> 4) & 15, y = (s << 4) + (r >> 8);
      const id = c.blocks[(y * CS + lz) * CS + lx];
      if (TICKABLE[id]) randomTick(c.cx * CS + lx, y, c.cz * CS + lz, id);
    }
  }
}

function boneMeal(x, y, z) {
  const w = G.world;
  const id = w.getBlock(x, y, z);
  if (id >= B.WHEAT_0 && id < B.WHEAT_3) { editBlock(x, y, z, Math.min(B.WHEAT_3, id + 1 + Math.floor(Math.random() * 3))); return true; }
  if (id === B.OAK_SAPLING || id === B.BIRCH_SAPLING || id === B.SPRUCE_SAPLING) { if (Math.random() < 0.45) growTree(x, y, z, id); return true; }
  if (id === B.GRASS) {
    for (let i = 0; i < 14; i++) {
      const nx = x + Math.floor(rand(-3, 4)), nz = z + Math.floor(rand(-3, 4));
      if (w.getBlock(nx, y, nz) === B.GRASS && w.getBlock(nx, y + 1, nz) === B.AIR) {
        const r = Math.random();
        editBlock(nx, y + 1, nz, r < 0.75 ? B.TALLGRASS : r < 0.85 ? B.DANDELION : r < 0.93 ? B.ROSE : B.TULIP);
      }
    }
    return true;
  }
  return false;
}

// ---------- furnaces ----------
function tickFurnaces(dt) {
  const w = G.world;
  for (const [k, be] of w.blockEntities) {
    if (be.type !== 'furnace') continue;
    const [x, y, z] = keyPos(k);
    if (!w.isLoaded(x, z)) continue;
    const s = be.slots;
    const input = s[0], fuel = s[1], out = s[2];
    const result = input ? SMELT[input.id] : undefined;
    const canSmelt = result !== undefined && (!out || (out.id === result && out.count < maxStack(result)));
    if (be.burn > 0) be.burn -= dt;
    let changed = false;
    if (be.burn <= 0 && canSmelt && fuel && ITEM_DEF[fuel.id] && ITEM_DEF[fuel.id].fuel) {
      be.burn = be.burnMax = ITEM_DEF[fuel.id].fuel;
      if (fuel.id === I.LAVA_BUCKET) s[1] = mkStack(I.BUCKET, 1);
      else { fuel.count--; if (fuel.count <= 0) s[1] = null; }
      changed = true;
    }
    if (be.burn > 0 && canSmelt) {
      be.cook += dt;
      if (be.cook >= SMELT_TIME) {
        be.cook = 0;
        input.count--; if (input.count <= 0) s[0] = null;
        if (out) out.count++; else s[2] = mkStack(result, 1);
        changed = true;
      }
    } else be.cook = Math.max(0, be.cook - dt * 2);
    if (be.burn < 0) be.burn = 0;
    const id = w.getBlock(x, y, z);
    const lit = be.burn > 0;
    Net.capture = false;
    if (lit && id === B.FURNACE) editBlock(x, y, z, B.FURNACE_LIT);
    else if (!lit && id === B.FURNACE_LIT) editBlock(x, y, z, B.FURNACE);
    Net.capture = true;
    if (changed && G.ui) G.ui.containerChanged(k);
    if (lit && Math.random() < dt * 2) Particles.smoke(x + 0.5, y + 1.05, z + 0.5, 1, 0.2, true);
  }
}

// ---------- TNT and explosions ----------
function igniteTNT(x, y, z, fuse = 4) {
  const w = G.world;
  if (w.getBlock(x, y, z) !== B.TNT) return;
  editBlock(x, y, z, B.AIR);
  Ents.tnts.push(new PrimedTNT(x, y, z, fuse));
  sfx('fuse', [x + 0.5, y + 0.5, z + 0.5], 1, 1);
}

// `seed` is given when replaying another player's explosion, so both craters match.
function explode(x, y, z, power, source, seed) {
  const remote = seed !== undefined;
  if (!remote) { seed = (Math.random() * 2147483647) | 0; Net.explosion(x, y, z, power, seed); }
  const was = Net.capture;
  Net.capture = false;
  try { explodeNow(x, y, z, power, source, mulberry32(seed), remote); } finally { Net.capture = was; }
}

function explodeNow(x, y, z, power, source, rng, remote) {
  const w = G.world;
  sfx('explode', [x, y, z], 1.5, rand(0.8, 1.05));
  Particles.explosion(x, y, z, power);
  const p = G.player;
  const pd = Math.hypot(p.pos[0] - x, p.pos[1] + 1 - y, p.pos[2] - z);
  G.shake = Math.max(G.shake, clamp(1.2 - pd / (power * 5), 0, 1));
  const destroyed = new Map();
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) for (let k = 0; k < 16; k++) {
    if (i && j && k && i < 15 && j < 15 && k < 15) continue;
    let dx = i / 15 * 2 - 1, dy = j / 15 * 2 - 1, dz = k / 15 * 2 - 1;
    const l = Math.hypot(dx, dy, dz);
    dx /= l; dy /= l; dz /= l;
    let inten = power * (0.7 + rng() * 0.6);
    let px = x, py = y, pz = z;
    while (inten > 0) {
      const bx = Math.floor(px), by = Math.floor(py), bz = Math.floor(pz);
      if (by < 0 || by >= CH) break;
      const id = w.getBlock(bx, by, bz);
      if (id !== B.AIR) {
        inten -= (BLOCK_BLAST[id] + 0.3) * 0.3;
        if (inten > 0 && BLOCK_HARD[id] >= 0 && !IS_LIQUID(id)) destroyed.set(posKey(bx, by, bz), [bx, by, bz, id]);
      }
      px += dx * 0.3; py += dy * 0.3; pz += dz * 0.3;
      inten -= 0.225;
    }
  }
  const edits = [];
  for (const [bx, by, bz, id] of destroyed.values()) {
    if (id === B.TNT) {
      edits.push([bx, by, bz, B.AIR]);
      // replayed blasts only show the fuse: the player who set it off shares the next boom
      const t = new PrimedTNT(bx, by, bz, 0.5 + rng());
      t.fake = remote;
      Ents.tnts.push(t);
      continue;
    }
    if (G.mode === 'survival' && !remote && Math.random() < 1 / power) {
      for (const [it, n] of blockDrops(id, 0, Math.random)) Ents.spawnItem({ id: it, count: n }, bx + 0.5, by + 0.5, bz + 0.5);
    }
    edits.push([bx, by, bz, B.AIR]);
  }
  editBlocks(edits);
  for (const [bx, by, bz] of destroyed.values()) updateNeighbors(bx, by, bz);
  // entities
  const R = power * 2;
  for (const m of Ents.mobs) {
    if (m === source || m.dead) continue;
    const d = Math.hypot(m.pos[0] - x, m.pos[1] + m.h / 2 - y, m.pos[2] - z);
    if (d > R) continue;
    const imp = 1 - d / R;
    m.damage(Math.floor((imp * imp + imp) / 2 * 7 * power + 1), { explosion: true, from: [x, y, z], knock: imp * 2.5 });
    m.vel[1] += imp * 6;
  }
  for (const it of Ents.items) {
    const d = Math.hypot(it.pos[0] - x, it.pos[1] - y, it.pos[2] - z);
    if (d < R) { const imp = (1 - d / R) * 8; it.vel[0] += (it.pos[0] - x) / (d || 1) * imp; it.vel[1] += imp * 0.6; it.vel[2] += (it.pos[2] - z) / (d || 1) * imp; }
  }
  if (pd < R) {
    const imp = 1 - pd / R;
    const dx = p.pos[0] - x, dz = p.pos[2] - z, l = Math.hypot(dx, dz) || 1;
    p.vel[0] += dx / l * imp * 12; p.vel[2] += dz / l * imp * 12; p.vel[1] += imp * 8;
    G.stats.damage(Math.floor((imp * imp + imp) / 2 * 7 * power + 1), { type: 'explosion', from: [x, y, z], mob: source && source.def ? source : null });
  }
}

// ---------- sleeping ----------
function trySleep(x, y, z) {
  if (Math.sin(G.dayTime * Math.PI * 2) > 0.1) { G.ui.toast('You can only sleep at night'); return; }
  for (const m of Ents.mobs) {
    if (m.def.hostile && !m.dead && Math.abs(m.pos[0] - x) < 8 && Math.abs(m.pos[1] - y) < 5 && Math.abs(m.pos[2] - z) < 8) {
      G.ui.toast('You may not rest now, there are monsters nearby'); return;
    }
  }
  G.spawnPoint = [x + 0.5, y + 1, z + 0.5];
  G.sleeping = { t: 0, bed: [x, y, z] };
  G.player.vel = [0, 0, 0];
  sfx('sleep', null, 0.8, 1);
  G.ui.toast('Respawn point set');
}

function updateSleep(dt) {
  const s = G.sleeping;
  if (!s) return;
  s.t += dt;
  if (s.t > 2.6) {
    G.dayTime = 0.015;
    G.sleeping = null;
    G.ui.toast('Good morning');
  }
}

// ---------- spawn / respawn ----------
function findSpawn(gen) {
  if (gen.preset) return gen.preset.spawn(gen).pos;
  for (let r = 0; r < 60; r++) {
    const n = Math.max(1, r * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r * 12), z = Math.round(Math.sin(a) * r * 12);
      const h = gen.height(x, z);
      if (h > SEA + 2 && h < SEA + 30) return [x + 0.5, h + 1, z + 0.5];
    }
  }
  return [0.5, gen.height(0, 0) + 2, 0.5];
}

function liftOutOfBlocks(p) {
  for (let i = 0; i < CH && p.collides(p.pos[0], p.pos[1], p.pos[2]); i++) p.pos[1] += 1;
}

function respawn() {
  let sp = G.worldSpawn;
  if (G.spawnPoint) {
    const [x, y, z] = G.spawnPoint.map(Math.floor);
    if (!G.world.isLoaded(x, z) || G.world.getBlock(x, y - 1, z) === B.BED) sp = G.spawnPoint;
    else { G.spawnPoint = null; G.ui.toast('Your bed was missing or obstructed'); }
  }
  G.stats.reset();
  const p = G.player;
  p.pos = sp.slice();
  p.vel = [0, 0, 0];
  p.fallStart = null; p.landed = 0;
  G.ui.hideDeath();
  G.ui.invDirty();
  prepareArea(p.pos[0], p.pos[2], 1);
  liftOutOfBlocks(p);
}

// Makes sure the chunks around a spot exist and are meshed (after a teleport or respawn).
function prepareArea(x, z, r = 1) {
  const w = G.world;
  const pcx = Math.floor(x / CS), pcz = Math.floor(z / CS);
  for (let dz = -r - 1; dz <= r + 1; dz++) for (let dx = -r - 1; dx <= r + 1; dx++) if (!w.getChunk(pcx + dx, pcz + dz)) w.generateChunk(pcx + dx, pcz + dz);
  for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (c && (c.needsMesh || !c.mesh)) meshChunk(c);
  }
}

// Teleport to one of the themed places of this world ("volcano", "beach"...).
function travelTo(key) {
  const g = G.world.gen;
  const sp = regionSpawn(g, key);
  if (!sp) { G.ui.toast('Themed places only exist in default worlds'); return false; }
  if (G.vehicle) Vehicles.dismount(true);
  const p = G.player;
  const x = Math.floor(sp.pos[0]), z = Math.floor(sp.pos[2]);
  p.pos = [x + 0.5, g.height(x, z) + 1, z + 0.5];
  p.vel = [0, 0, 0];
  p.yaw = sp.yaw; p.pitch = sp.pitch;
  p.fallStart = null; p.landed = 0;
  G.dayTime = sp.time;
  Particles.list.length = 0;
  prepareArea(p.pos[0], p.pos[2], 2);
  liftOutOfBlocks(p);
  G.region = null;
  sfx('portal', null, 0.8, 1);
  if (typeof Net !== 'undefined') Net.teleported();
  return true;
}

// Themed place the player stands in (for the arrival banner and ambience).
function updateRegion(dt) {
  G.regionT -= dt;
  if (G.regionT > 0) return;
  G.regionT = 0.3;
  const p = G.player.pos;
  const own = G.world.gen.regionOwner(Math.floor(p[0]), Math.floor(p[2]));
  const key = own && own.t < 0.45 ? Object.keys(WORLD_PRESETS).find((k) => WORLD_PRESETS[k] === own.p) : null;
  if (key !== G.region) {
    G.region = key;
    G.regionOwn = own;
    if (key && !G.world.gen.preset) G.ui.banner(WORLD_PRESETS[key].icon, WORLD_PRESETS[key].name);
  } else G.regionOwn = own;
}

function setGameMode(mode) {
  G.mode = mode === 'creative' ? 'creative' : 'survival';
  G.player.creative = G.mode === 'creative';
  if (G.mode === 'survival') G.player.flying = false;
  if (G.stats.dead && G.mode === 'creative') respawn();
  if (G.ui) { G.ui.invDirty(); G.ui.updateHud(true); }
}

// ---------- persistence ----------
function saveWorld() {
  if (!G.world || !G.player) return;
  const p = G.player;
  const ok = storageSet(G.slot ? 'blocklands.slot.' + G.slot : G.online ? Net.saveKey() : SAVE_KEY, {
    net: G.online && Net.server ? Net.serializeTimes() : undefined,
    v: 2, gen: G.world.genVer, seed: G.world.seed, type: G.world.type, cnv: G.slot === 'campnou' ? CN.ver : undefined, edits: G.world.serializeEdits(), extras: G.world.serializeExtras(),
    dayTime: G.dayTime, mode: G.mode, difficulty: G.difficulty, rules: G.rules, worldSpawn: G.worldSpawn, spawnPoint: G.spawnPoint,
    player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, flying: p.flying }, inv: G.inv.serialize(), stats: G.stats.serialize(),
    vehicles: Vehicles.serialize(),
    markers: G.markers || [], deaths: G.deaths || [],
  });
  if (!ok && G.ui) G.ui.toast('Could not save: browser storage is full');
  if (typeof MapStore !== 'undefined') MapStore.save();
  G.world.editsDirty = false;
}

function loadSave() {
  const s = storageGet(SAVE_KEY);
  if (s && s.v === 2 && Number.isInteger(s.seed)) return s;
  const old = storageGet(SAVE_KEY_V1);
  if (old && old.v === 1 && Number.isInteger(old.seed)) {
    // worlds from the first version were creative-only
    const inv = { slots: new Array(36).fill(0), armor: [0, 0, 0, 0], selected: old.slot | 0 };
    if (Array.isArray(old.hotbar)) old.hotbar.forEach((id, i) => { if (i < 9 && isItem(id)) inv.slots[i] = [id, 1, 0]; });
    return { v: 2, seed: old.seed, type: 'default', edits: old.edits, dayTime: old.dayTime, mode: 'creative', player: old.player, inv };
  }
  return null;
}

const STARTER_CREATIVE = [B.GRASS, B.COBBLE, B.PLANKS, B.GLASS, B.STONE_BRICKS, B.TORCH, B.DOOR, B.TNT, I.JET];

function newWorld(seed, save, opts = {}) {
  if (G.world) for (const c of G.world.chunks.values()) G.renderer.freeChunk(c);
  ChunkWorkers.reset();
  Weather.reset();
  Fluids.reset();
  Wildlife.reset();
  if (G.vehicle) G.vehicle = null;
  Ents.clear();
  if (typeof Villages !== 'undefined') Villages.reset();
  G.region = null;
  const type = save ? save.type : opts.type;
  // saves from before rivers and structures keep their original terrain (see WorldGen)
  const ver = save ? (Number.isInteger(save.gen) ? save.gen : 1) : (opts.gen || GEN_LATEST);
  G.world = new World(seed, type, ver);
  G.player = new Player(G.world);
  G.stats.reset();
  G.inv.clear();
  G.spawnPoint = null;
  G.sleeping = null;
  G.worldSpawn = findSpawn(G.world.gen);
  if (save) {
    G.world.loadEdits(save.edits);
    G.world.loadExtras(save.extras);
    const sp = save.player;
    if (sp && Array.isArray(sp.pos) && sp.pos.length === 3 && sp.pos.every(Number.isFinite)) {
      G.player.pos = sp.pos.slice();
      G.player.yaw = Number.isFinite(sp.yaw) ? sp.yaw : 0;
      G.player.pitch = Number.isFinite(sp.pitch) ? clamp(sp.pitch, -1.56, 1.56) : 0;
      G.player.flying = !!sp.flying;
    } else G.player.pos = G.worldSpawn.slice();
    if (Number.isFinite(save.dayTime)) G.dayTime = ((save.dayTime % 1) + 1) % 1;
    G.mode = save.mode === 'creative' ? 'creative' : 'survival';
    G.difficulty = Number.isInteger(save.difficulty) ? clamp(save.difficulty, 0, 3) : 2;
    if (save.rules && typeof save.rules === 'object') {
      G.rules.keepInventory = !!save.rules.keepInventory;
      G.rules.mobSpawning = save.rules.mobSpawning !== false;
    }
    if (Array.isArray(save.worldSpawn) && save.worldSpawn.every(Number.isFinite)) G.worldSpawn = save.worldSpawn;
    if (Array.isArray(save.spawnPoint) && save.spawnPoint.every(Number.isFinite)) G.spawnPoint = save.spawnPoint;
    G.inv.load(save.inv);
    G.stats.load(save.stats);
    Vehicles.load(save.vehicles);
    G.markers = Array.isArray(save.markers) ? save.markers.filter((m) => m && Number.isFinite(m.x) && Number.isFinite(m.z)).slice(0, 64) : [];
    G.deaths = Array.isArray(save.deaths) ? save.deaths.filter((d) => Array.isArray(d) && d.length >= 3 && d.every(Number.isFinite)).slice(-5) : [];
  } else {
    G.player.pos = G.worldSpawn.slice();
    G.player.yaw = -0.6;
    G.player.pitch = -0.05;
    G.dayTime = 0.08;
    const pr = G.world.gen.preset;
    if (pr) {
      const sp = pr.spawn(G.world.gen);
      G.player.yaw = sp.yaw; G.player.pitch = sp.pitch;
      G.dayTime = pr.time;
    }
    if (opts.mode) G.mode = opts.mode;
    if (G.mode === 'creative') STARTER_CREATIVE.forEach((id, i) => { G.inv.slots[i] = mkStack(id, 1); });
  }
  G.player.creative = G.mode === 'creative';
  if (!G.player.creative) G.player.flying = false;
  if (!save) { G.markers = []; G.deaths = []; }
  G.offsetsR = -1;
  if (typeof MapStore !== 'undefined') MapStore.reset(mapKeyForWorld(), seed + ':' + G.world.type);
  if (G.ui) { G.ui.invDirty(); G.ui.closeScreen(true); }
}
