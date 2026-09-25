'use strict';
// Life in the structures of structures.js: villagers (and penned animals) move in when you come
// near a village, port or castle and keep to it; each villager trades by profession for
// emeralds; generated chests and barrels fill with loot the first time they are opened.

// ---- loot ----
const LOOT = {
  house: [[I.BREAD, 1, 3, 0.6], [I.APPLE, 1, 3, 0.5], [I.STICK, 2, 6, 0.4], [B.TORCH, 2, 6, 0.4], [I.SEEDS, 2, 5, 0.3], [I.EMERALD, 1, 2, 0.3], [I.IRON_INGOT, 1, 2, 0.2], [I.BOOK, 1, 2, 0.2]],
  farm: [[I.WHEAT, 3, 8, 0.8], [I.SEEDS, 2, 8, 0.7], [I.BREAD, 1, 3, 0.5], [B.PUMPKIN, 1, 2, 0.3], [I.APPLE, 1, 4, 0.4], [I.EMERALD, 1, 2, 0.25]],
  fish: [[I.RAW_FISH, 2, 6, 0.8], [I.COOKED_FISH, 1, 3, 0.5], [I.STRING, 1, 4, 0.5], [I.EMERALD, 1, 2, 0.3]],
  smith: [[I.IRON_INGOT, 2, 6, 0.8], [I.COAL, 3, 8, 0.7], [I.TOOL0 + 10, 1, 1, 0.25], [I.TOOL0 + 13, 1, 1, 0.25], [I.ARMOR0 + 5, 1, 1, 0.2], [I.GOLD_INGOT, 1, 3, 0.3], [I.EMERALD, 1, 3, 0.4], [I.DIAMOND, 1, 1, 0.08]],
  castle: [[I.IRON_INGOT, 2, 6, 0.7], [I.ARROW, 4, 16, 0.6], [I.BOW, 1, 1, 0.3], [I.TOOL0 + 13, 1, 1, 0.35], [I.ARMOR0 + 4, 1, 1, 0.25], [I.ARMOR0 + 6, 1, 1, 0.25], [I.GOLD_INGOT, 2, 5, 0.4], [I.EMERALD, 2, 5, 0.5], [I.BREAD, 2, 5, 0.5]],
  treasure: [[I.DIAMOND, 1, 3, 0.6], [I.GOLD_INGOT, 3, 8, 0.8], [I.EMERALD, 3, 8, 0.8], [I.GOLDEN_APPLE, 1, 1, 0.4], [I.ENCHANTED_BOOK, 1, 1, 0.5], [I.TOOL0 + 23, 1, 1, 0.15]],
  mine: [[I.COAL, 3, 10, 0.7], [I.IRON_INGOT, 1, 5, 0.6], [I.GOLD_INGOT, 1, 4, 0.4], [I.DIAMOND, 1, 2, 0.15], [I.EMERALD, 1, 3, 0.35], [B.TORCH, 4, 12, 0.5], [I.BREAD, 1, 3, 0.4], [B.TNT, 1, 2, 0.15]],
  tower: [[I.ARROW, 4, 12, 0.7], [I.BOW, 1, 1, 0.35], [I.BREAD, 1, 4, 0.5], [I.IRON_INGOT, 1, 3, 0.4], [I.EMERALD, 1, 2, 0.3]],
  ruins: [[I.GOLD_INGOT, 1, 3, 0.4], [I.EMERALD, 1, 4, 0.5], [I.ROTTEN_FLESH, 1, 4, 0.5], [I.BONE, 1, 4, 0.5], [I.ENCHANTED_BOOK, 1, 1, 0.2], [I.GOLDEN_APPLE, 1, 1, 0.08]],
};
function rollLoot(kind, seed) {
  const table = LOOT[kind] || LOOT.house;
  const rng = mulberry32(seed | 0);
  const out = [];
  for (const [id, a, b, p] of table) {
    if (!ITEM_DEF[id] || rng() > p) continue;
    const s = mkStack(id, Math.min(maxStack(id), a + Math.floor(rng() * (b - a + 1))));
    if (id === I.ENCHANTED_BOOK) s.ench = randomBookEnch(rng);
    out.push(s);
  }
  if (!out.length) out.push(mkStack(I.BREAD, 1));
  return out;
}
// Called before a chest/barrel opens: a generated one (never edited) gets its loot once.
function fillGeneratedLoot(x, y, z) {
  const w = G.world, k = posKey(x, y, z);
  if (w.blockEntities.has(k)) return;
  const c = w.getChunk(x >> 4, z >> 4);
  const kind = c && c.gloot && c.gloot.get(k);
  if (!kind) return;
  const e = w.edits.get(chunkKey(x >> 4, z >> 4));
  if (e && e.has(blockIndex(x & 15, y, z & 15))) return;   // placed by a player
  const be = blockEntity(x, y, z, 'chest');
  const items = rollLoot(kind, hash3(x, y, z, w.seed) * 2147483647);
  const rng = mulberry32((x * 73856093) ^ (z * 19349663) ^ y);
  for (const s of items) {
    let i = Math.floor(rng() * 27);
    while (be.slots[i]) i = (i + 1) % 27;
    be.slots[i] = s;
  }
}

// ---- trades: [what you give, what you get] ----
const TRADES = {
  farmer: [[[I.WHEAT, 20], [I.EMERALD, 1]], [[I.EMERALD, 1], [I.BREAD, 6]], [[B.PUMPKIN, 4], [I.EMERALD, 1]], [[I.EMERALD, 1], [I.APPLE, 4]], [[I.EMERALD, 2], [B.HAY_BALE, 3]], [[I.EMERALD, 6], [I.GOLDEN_APPLE, 1]]],
  fisher: [[[I.RAW_FISH, 10], [I.EMERALD, 1]], [[I.EMERALD, 1], [I.COOKED_FISH, 6]], [[I.STRING, 12], [I.EMERALD, 1]], [[I.EMERALD, 2], [B.LANTERN, 1]], [[I.EMERALD, 1], [B.BARREL, 1]]],
  smith: [[[I.COAL, 15], [I.EMERALD, 1]], [[I.IRON_INGOT, 4], [I.EMERALD, 1]], [[I.EMERALD, 6], [I.TOOL0 + 13, 1]], [[I.EMERALD, 5], [I.TOOL0 + 10, 1]], [[I.EMERALD, 9], [I.ARMOR0 + 5, 1]], [[I.EMERALD, 16], [I.TOOL0 + 20, 1]]],
  librarian: [[[I.PAPER, 24], [I.EMERALD, 1]], [[I.EMERALD, 1], [B.BOOKSHELF, 1]], [[I.EMERALD, 5], [I.ENCHANTED_BOOK, 1]], [[I.BOOK, 4], [I.EMERALD, 1]], [[I.EMERALD, 1], [B.LANTERN, 1]]],
  cleric: [[[I.ROTTEN_FLESH, 24], [I.EMERALD, 1]], [[I.EMERALD, 1], [B.GLOWSTONE, 2]], [[I.BONE, 12], [I.EMERALD, 1]], [[I.EMERALD, 4], [I.GOLDEN_APPLE, 1]], [[I.GOLD_INGOT, 3], [I.EMERALD, 1]]],
  mason: [[[B.CLAY, 10], [I.EMERALD, 1]], [[I.EMERALD, 1], [B.PLASTER, 8]], [[I.EMERALD, 1], [B.ROOF_TILES, 8]], [[I.EMERALD, 1], [B.MARBLE, 6]], [[I.EMERALD, 1], [B.SLATE, 8]], [[I.EMERALD, 2], [B.ARCH_TABLE, 1]]],
  shepherd: [[[B.WOOL, 16], [I.EMERALD, 1]], [[I.EMERALD, 1], [B.WOOL + 14, 4]], [[I.EMERALD, 1], [B.WOOL + 11, 4]], [[I.EMERALD, 2], [I.SHEARS, 1]], [[I.EMERALD, 2], [B.BED, 1]]],
};
function villagerTrades(m) {
  const list = TRADES[m.prof] || TRADES.farmer;
  if (!m.offers) {
    // each villager offers four of their trade's deals
    const rng = mulberry32(m.seed || 1);
    const idx = list.map((_, i) => i).sort(() => rng() - 0.5).slice(0, Math.min(4, list.length)).sort((a, b) => a - b);
    m.offers = idx.map((i) => list[i]);
  }
  return m.offers;
}

const VILLAGER_NAMES = ['Aldo', 'Berta', 'Ciro', 'Dalia', 'Elio', 'Fina', 'Gael', 'Hana', 'Iker', 'Julia', 'Kai', 'Lola', 'Mateo', 'Nuria', 'Oto', 'Paz', 'Quim', 'Rosa', 'Saúl', 'Teo', 'Uma', 'Vera', 'Xoan', 'Yago', 'Zoe'];
const PROF_NAMES = { farmer: 'Farmer', fisher: 'Fisher', smith: 'Blacksmith', librarian: 'Librarian', cleric: 'Cleric', mason: 'Mason', shepherd: 'Shepherd' };

// ---- population ----
const Villages = {
  populated: new Map(),   // plan -> mobs
  t: 0,
  reset() { this.populated.clear(); this.t = 0; },

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1.5;
    const g = G.world && G.world.gen;
    if (!g || !g.structs || !G.rules.mobSpawning) return;
    const p = G.player.pos;
    for (const [plan, mobs] of this.populated) {
      const d = Math.hypot(plan.x - p[0], plan.z - p[2]);
      if (d > 170 || mobs.every((m) => m.removed)) { for (const m of mobs) m.removed = true; this.populated.delete(plan); }
    }
    for (const plan of structuresIn(g, p[0] - 100, p[2] - 100, p[0] + 100, p[2] + 100)) {
      if (this.populated.has(plan) || !plan.spawns.length) continue;
      if (Math.hypot(plan.x - p[0], plan.z - p[2]) > 96) continue;
      // wait for the ground under everyone to be loaded
      if (!plan.spawns.every((s) => { const c = G.world.getChunk(Math.floor(s.x) >> 4, Math.floor(s.z) >> 4); return c && c.mesh; })) continue;
      const mobs = [];
      plan.spawns.forEach((s, i) => {
        let y = Math.floor(s.y);
        const w = G.world;
        for (let k = 0; k < 8 && (BLOCK_SOLID[w.getBlock(Math.floor(s.x), y, Math.floor(s.z))] || BLOCK_SOLID[w.getBlock(Math.floor(s.x), y + 1, Math.floor(s.z))]); k++) y++;
        const m = Ents.spawnMob(s.kind, s.x, y + 0.01, s.z);
        m.persistent = true;
        m.seed = (hash3(plan.x, i, plan.z, w.seed) * 2147483647) | 0;
        if (s.kind === 'villager') {
          m.prof = s.prof;
          m.skin = VILLAGER_SKIN[s.prof] || VILLAGER_SKIN.farmer;
          m.home = [plan.x, plan.z];
          m.homeR = plan.type === 'castle' ? 12 : plan.type === 'port' ? 26 : Math.max(18, plan.radius * 0.8);
          m.name = VILLAGER_NAMES[Math.abs(m.seed) % VILLAGER_NAMES.length];
        } else { m.home = [s.x, s.z]; m.homeR = 2.5; }
        mobs.push(m);
      });
      this.populated.set(plan, mobs);
    }
  },
};
