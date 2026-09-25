'use strict';
// Item registry (blocks + items), tools, armour, food, fuel, smelting, drops and recipes.
// Block items share the block id; other items start at 256.

const I = {
  STICK: 256, COAL: 257, CHARCOAL: 258, IRON_INGOT: 259, GOLD_INGOT: 260, DIAMOND: 261, FLINT: 262,
  STRING: 263, FEATHER: 264, BONE: 265, GUNPOWDER: 266, LEATHER: 267, WHEAT: 268, SEEDS: 269,
  PAPER: 270, BOOK: 271, BOWL: 272, ARROW: 273, BOW: 274, FLINT_STEEL: 275, BUCKET: 276,
  WATER_BUCKET: 277, LAVA_BUCKET: 278, APPLE: 279, BREAD: 280, RAW_PORK: 281, COOKED_PORK: 282,
  RAW_BEEF: 283, STEAK: 284, RAW_CHICKEN: 285, COOKED_CHICKEN: 286, RAW_MUTTON: 287, COOKED_MUTTON: 288,
  ROTTEN_FLESH: 289, STEW: 290, BONE_MEAL: 291, SHEARS: 292, MELON_SLICE: 293, GOLDEN_APPLE: 294,
  TOOL0: 300,   // 300..324: material * 5 + type
  ARMOR0: 330,  // 330..345: material * 4 + slot
  JET: 350,
  EMERALD: 351, RAW_FISH: 352, COOKED_FISH: 353, ENCHANTED_BOOK: 354,
};

const TOOL_MATS = [
  { key: 'wood', name: 'Wooden', tier: 1, speed: 2, dur: 59, dmg: 0, head: [150, 112, 64] },
  { key: 'stone', name: 'Stone', tier: 2, speed: 4, dur: 131, dmg: 1, head: [128, 126, 124] },
  { key: 'iron', name: 'Iron', tier: 3, speed: 6, dur: 250, dmg: 2, head: [218, 218, 214] },
  { key: 'gold', name: 'Golden', tier: 1, speed: 12, dur: 32, dmg: 0, head: [250, 214, 70] },
  { key: 'diamond', name: 'Diamond', tier: 4, speed: 8, dur: 1561, dmg: 3, head: [96, 226, 214] },
];
const TOOL_KINDS = [
  { key: 'pickaxe', name: 'Pickaxe', tool: TOOL_PICK, dmg: 2 },
  { key: 'axe', name: 'Axe', tool: TOOL_AXE, dmg: 3 },
  { key: 'shovel', name: 'Shovel', tool: TOOL_SHOVEL, dmg: 1 },
  { key: 'sword', name: 'Sword', tool: TOOL_SWORD, dmg: 4 },
  { key: 'hoe', name: 'Hoe', tool: TOOL_HOE, dmg: 0 },
];
const ARMOR_MATS = [
  { key: 'leather', name: 'Leather', pts: [1, 3, 2, 1], mult: 5, color: [140, 84, 48] },
  { key: 'iron', name: 'Iron', pts: [2, 6, 5, 2], mult: 15, color: [210, 210, 206] },
  { key: 'gold', name: 'Golden', pts: [2, 5, 3, 1], mult: 7, color: [250, 212, 64] },
  { key: 'diamond', name: 'Diamond', pts: [3, 8, 6, 3], mult: 33, color: [90, 220, 210] },
];
const ARMOR_SLOTS = [
  { key: 'helmet', name: 'Helmet', dur: 11 }, { key: 'chest', name: 'Chestplate', dur: 16 },
  { key: 'legs', name: 'Leggings', dur: 15 }, { key: 'boots', name: 'Boots', dur: 13 },
];

const ITEM_DEF = [];
function defItem(id, name, o = {}) {
  ITEM_DEF[id] = Object.assign({ id, name, stack: 64, cat: 'materials' }, o);
  if (o.sprite) ITEM_DEF[id].layer = defTex(o.sprite);
  return ITEM_DEF[id];
}

// ---- block items ----
const NO_ITEM_BLOCKS = new Set([B.AIR, B.WATER, B.LAVA, B.FURNACE_LIT, B.WALL_TORCH, B.WHEAT_0, B.WHEAT_1, B.WHEAT_2, B.WHEAT_3,
  B.DOOR_TOP, B.DOOR_OPEN, B.DOOR_OPEN_TOP, B.TRAPDOOR_OPEN]);
for (let id = 1; id < 256; id++) {
  if (BLOCK_NAME[id] === undefined || NO_ITEM_BLOCKS.has(id)) continue;
  const rt = BLOCK_RT[id];
  const o = { block: id, cat: BLOCK_CAT[id] || 'building' };
  if (rt === RT_CROSS || rt === RT_TORCH || rt === RT_LADDER) { o.render = 'sprite'; o.layer = BLOCK_TEX[id * 6 + 2]; }
  else if (rt === RT_DOOR) { o.render = 'sprite'; o.layer = defTex('i_door'); }
  else if (rt === RT_TRAPDOOR) { o.render = 'sprite'; o.layer = BLOCK_TEX[id * 6 + 2]; }
  else if (rt === RT_SLAB) o.render = 'slab';
  else if (rt === RT_SHAPE) o.render = 'shape';
  else if (rt === RT_CONNECT) o.render = 'connect';
  else if (rt === RT_LANTERN) { o.render = 'sprite'; o.layer = defTex('i_lantern'); }
  else if (rt === RT_BED) o.render = 'bed';
  else o.render = 'cube';
  if (id === B.BED) o.stack = 1;
  defItem(id, BLOCK_NAME[id], o);
}

// ---- plain items ----
const M = 'materials', F = 'food', TL = 'tools', CB = 'combat';
defItem(I.STICK, 'Stick', { sprite: 'i_stick', fuel: 5 });
defItem(I.COAL, 'Coal', { sprite: 'i_coal', fuel: 80 });
defItem(I.CHARCOAL, 'Charcoal', { sprite: 'i_charcoal', fuel: 80 });
defItem(I.IRON_INGOT, 'Iron Ingot', { sprite: 'i_iron_ingot' });
defItem(I.GOLD_INGOT, 'Gold Ingot', { sprite: 'i_gold_ingot' });
defItem(I.DIAMOND, 'Diamond', { sprite: 'i_diamond' });
defItem(I.FLINT, 'Flint', { sprite: 'i_flint' });
defItem(I.STRING, 'String', { sprite: 'i_string' });
defItem(I.FEATHER, 'Feather', { sprite: 'i_feather' });
defItem(I.BONE, 'Bone', { sprite: 'i_bone' });
defItem(I.GUNPOWDER, 'Gunpowder', { sprite: 'i_gunpowder' });
defItem(I.LEATHER, 'Leather', { sprite: 'i_leather' });
defItem(I.WHEAT, 'Wheat', { sprite: 'i_wheat' });
defItem(I.SEEDS, 'Wheat Seeds', { sprite: 'i_seeds', places: B.WHEAT_0 });
defItem(I.PAPER, 'Paper', { sprite: 'i_paper' });
defItem(I.BOOK, 'Book', { sprite: 'i_book' });
defItem(I.BOWL, 'Bowl', { sprite: 'i_bowl', fuel: 5 });
defItem(I.ARROW, 'Arrow', { sprite: 'i_arrow', cat: CB });
defItem(I.BOW, 'Bow', { sprite: 'i_bow', stack: 1, dur: 384, cat: CB, fuel: 15, use: 'bow' });
defItem(I.FLINT_STEEL, 'Flint and Steel', { sprite: 'i_flint_steel', stack: 1, dur: 64, cat: TL });
defItem(I.BUCKET, 'Bucket', { sprite: 'i_bucket', stack: 16, cat: TL });
defItem(I.WATER_BUCKET, 'Water Bucket', { sprite: 'i_water_bucket', stack: 1, cat: TL });
defItem(I.LAVA_BUCKET, 'Lava Bucket', { sprite: 'i_lava_bucket', stack: 1, cat: TL, fuel: 1000 });
defItem(I.APPLE, 'Apple', { sprite: 'i_apple', food: [4, 2.4], cat: F });
defItem(I.BREAD, 'Bread', { sprite: 'i_bread', food: [5, 6], cat: F });
defItem(I.RAW_PORK, 'Raw Porkchop', { sprite: 'i_raw_pork', food: [3, 1.8], cat: F });
defItem(I.COOKED_PORK, 'Cooked Porkchop', { sprite: 'i_cooked_pork', food: [8, 12.8], cat: F });
defItem(I.RAW_BEEF, 'Raw Beef', { sprite: 'i_raw_beef', food: [3, 1.8], cat: F });
defItem(I.STEAK, 'Steak', { sprite: 'i_steak', food: [8, 12.8], cat: F });
defItem(I.RAW_CHICKEN, 'Raw Chicken', { sprite: 'i_raw_chicken', food: [2, 1.2], cat: F });
defItem(I.COOKED_CHICKEN, 'Cooked Chicken', { sprite: 'i_cooked_chicken', food: [6, 7.2], cat: F });
defItem(I.RAW_MUTTON, 'Raw Mutton', { sprite: 'i_raw_mutton', food: [2, 1.2], cat: F });
defItem(I.COOKED_MUTTON, 'Cooked Mutton', { sprite: 'i_cooked_mutton', food: [6, 9.6], cat: F });
defItem(I.ROTTEN_FLESH, 'Rotten Flesh', { sprite: 'i_rotten_flesh', food: [4, 0.8], cat: F });
defItem(I.STEW, 'Mushroom Stew', { sprite: 'i_stew', food: [6, 7.2], stack: 1, returns: I.BOWL, cat: F });
defItem(I.BONE_MEAL, 'Bone Meal', { sprite: 'i_bone_meal', cat: M });
defItem(I.SHEARS, 'Shears', { sprite: 'i_shears', stack: 1, dur: 238, tool: TOOL_SHEARS, speed: 5, tier: 0, cat: TL });
defItem(I.MELON_SLICE, 'Melon Slice', { sprite: 'i_melon_slice', food: [2, 1.2], cat: F });
defItem(I.GOLDEN_APPLE, 'Golden Apple', { sprite: 'i_golden_apple', food: [4, 9.6], always: true, regen: 5, cat: F });
defItem(I.JET, 'Fighter Jet', { sprite: 'i_jet', stack: 1, cat: 'transport' });
defItem(I.EMERALD, 'Emerald', { sprite: 'i_emerald' });
defItem(I.RAW_FISH, 'Raw Fish', { sprite: 'i_raw_fish', food: [2, 0.4], cat: F });
defItem(I.COOKED_FISH, 'Cooked Fish', { sprite: 'i_cooked_fish', food: [5, 6], cat: F });
defItem(I.ENCHANTED_BOOK, 'Enchanted Book', { sprite: 'i_enchanted_book', stack: 1, cat: M });

TOOL_MATS.forEach((m, mi) => TOOL_KINDS.forEach((k, ki) => {
  defItem(I.TOOL0 + mi * 5 + ki, m.name + ' ' + k.name, {
    sprite: 't_' + m.key + '_' + k.key, stack: 1, dur: m.dur, tool: k.tool, tier: m.tier, speed: m.speed,
    damage: 1 + (k.tool === TOOL_HOE ? 0 : k.dmg + m.dmg), cat: k.tool === TOOL_SWORD ? CB : TL,
    fuel: m.key === 'wood' ? 10 : 0, toolKind: k.key, mat: m.key,
  });
}));
ARMOR_MATS.forEach((m, mi) => ARMOR_SLOTS.forEach((s, si) => {
  defItem(I.ARMOR0 + mi * 4 + si, m.name + ' ' + s.name, {
    sprite: 'a_' + m.key + '_' + s.key, stack: 1, dur: s.dur * m.mult, armor: { slot: si, pts: m.pts[si] }, cat: CB, mat: m.key,
  });
}));

// fuel for wooden things
for (const id of [...LOGS, ...PLANKS_ALL, B.CRAFTING_TABLE, B.CHEST, B.BOOKSHELF, B.LADDER]) ITEM_DEF[id].fuel = 15;
ITEM_DEF[B.PLANK_SLAB].fuel = 7.5;
ITEM_DEF[B.COAL_BLOCK].fuel = 800;
for (const id of [B.OAK_SAPLING, B.BIRCH_SAPLING, B.SPRUCE_SAPLING]) ITEM_DEF[id].fuel = 5;
for (let i = 0; i < 16; i++) ITEM_DEF[B.WOOL + i].fuel = 5;
ITEM_DEF[B.SUGAR_CANE].places = B.SUGAR_CANE;

function itemDef(id) { return ITEM_DEF[id]; }
function isItem(id) { return Number.isInteger(id) && id > 0 && ITEM_DEF[id] !== undefined; }
function itemName(id) { return ITEM_DEF[id] ? ITEM_DEF[id].name : '?'; }
function maxStack(id) { return ITEM_DEF[id] ? ITEM_DEF[id].stack : 64; }
function maxDur(id) { return ITEM_DEF[id] && ITEM_DEF[id].dur ? ITEM_DEF[id].dur : 0; }

// ---- smelting ----
const SMELT = {
  [B.IRON_ORE]: I.IRON_INGOT, [B.GOLD_ORE]: I.GOLD_INGOT, [B.COAL_ORE]: I.COAL, [B.DIAMOND_ORE]: I.DIAMOND,
  [B.SAND]: B.GLASS, [B.COBBLE]: B.STONE, [B.STONE]: B.SMOOTH_STONE, [B.CLAY]: B.TERRACOTTA,
  [B.LOG]: I.CHARCOAL, [B.BIRCH_LOG]: I.CHARCOAL, [B.SPRUCE_LOG]: I.CHARCOAL, [B.PALM_LOG]: I.CHARCOAL,
  [B.WHITE_SAND]: B.GLASS, [B.RED_SAND]: B.GLASS, [B.ASH]: B.BASALT,
  [I.RAW_PORK]: I.COOKED_PORK, [I.RAW_FISH]: I.COOKED_FISH, [B.EMERALD_ORE]: I.EMERALD, [I.RAW_BEEF]: I.STEAK, [I.RAW_CHICKEN]: I.COOKED_CHICKEN, [I.RAW_MUTTON]: I.COOKED_MUTTON,
};
const SMELT_TIME = 8; // seconds per item

// ---- drops ----
function canHarvest(blockId, toolItem) {
  const need = BLOCK_TIER[blockId];
  if (!need) return true;
  const d = ITEM_DEF[toolItem];
  return !!(d && d.tool === BLOCK_TOOL[blockId] && d.tier >= need);
}

// Returns [[itemId, count], ...]
function blockDrops(id, toolItem, rnd) {
  if (!canHarvest(id, toolItem)) return [];
  const d = ITEM_DEF[toolItem];
  const shears = d && d.tool === TOOL_SHEARS;
  switch (id) {
    case B.AIR: case B.WATER: case B.LAVA: case B.BEDROCK: case B.GLASS: case B.ICE: return [];
    case B.GRASS: case B.SNOWY_GRASS: case B.FARMLAND: return [[B.DIRT, 1]];
    case B.STONE: return [[B.COBBLE, 1]];
    case B.COAL_ORE: return [[I.COAL, 1]];
    case B.DIAMOND_ORE: return [[I.DIAMOND, 1]];
    case B.EMERALD_ORE: return [[I.EMERALD, 1]];
    case B.COBWEB: return [[I.STRING, 1]];
    case B.DIRT_PATH: return [[B.DIRT, 1]];
    case B.FURNACE_LIT: return [[B.FURNACE, 1]];
    case B.WALL_TORCH: return [[B.TORCH, 1]];
    case B.DOOR: case B.DOOR_OPEN: return [[B.DOOR, 1]];
    case B.DOOR_TOP: case B.DOOR_OPEN_TOP: return [];
    case B.TRAPDOOR_OPEN: return [[B.TRAPDOOR, 1]];
    case B.GRAVEL: return [[rnd() < 0.12 ? I.FLINT : B.GRAVEL, 1]];
    case B.BOOKSHELF: return [[I.BOOK, 3]];
    case B.MELON: return [[I.MELON_SLICE, 3 + Math.floor(rnd() * 5)]];
    case B.DEAD_BUSH: { const n = Math.floor(rnd() * 3); return n ? [[I.STICK, n]] : []; }
    case B.TALLGRASS: case B.FERN:
      if (shears) return [[id, 1]];
      return rnd() < 0.14 ? [[I.SEEDS, 1]] : [];
    case B.WHEAT_0: case B.WHEAT_1: case B.WHEAT_2: return [[I.SEEDS, 1]];
    case B.WHEAT_3: return [[I.WHEAT, 1], [I.SEEDS, 1 + Math.floor(rnd() * 3)]];
    case B.PALM_LEAVES:
      if (shears) return [[id, 1]];
      return rnd() < 0.08 ? [[I.STICK, 1]] : [];
    case B.LEAVES: case B.BIRCH_LEAVES: case B.SPRUCE_LEAVES: {
      if (shears) return [[id, 1]];
      const out = [];
      const sap = id === B.LEAVES ? B.OAK_SAPLING : id === B.BIRCH_LEAVES ? B.BIRCH_SAPLING : B.SPRUCE_SAPLING;
      if (rnd() < 0.07) out.push([sap, 1]);
      if (id === B.LEAVES && rnd() < 0.02) out.push([I.APPLE, 1]);
      if (rnd() < 0.03) out.push([I.STICK, 1]);
      return out;
    }
    default: return ITEM_DEF[id] ? [[id, 1]] : [];
  }
}

// ---- recipes ----
const TAG = {
  planks: PLANKS_ALL, logs: LOGS, coal: [I.COAL, I.CHARCOAL],
  wool: Array.from({ length: 16 }, (_, i) => B.WOOL + i), leaves: [B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.PALM_LEAVES],
};
const RECIPES = [];
function ingMatches(ing, id) { return Array.isArray(ing) ? ing.includes(id) : ing === id; }
function shaped(result, count, pattern, key, group) {
  const h = pattern.length, w = Math.max(...pattern.map((r) => r.length));
  const cells = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = pattern[y][x] || ' ';
    cells.push(ch === ' ' ? 0 : key[ch]);
  }
  RECIPES.push({ shaped: true, w, h, cells, result, count, group });
}
function shapeless(result, count, ings, group) { RECIPES.push({ shaped: false, ings, result, count, group }); }

[[B.LOG, B.PLANKS], [B.BIRCH_LOG, B.BIRCH_PLANKS], [B.SPRUCE_LOG, B.SPRUCE_PLANKS], [B.PALM_LOG, B.PLANKS]].forEach(([l, p]) => shapeless(p, 4, [l]));
shaped(I.STICK, 4, ['P', 'P'], { P: TAG.planks });
shaped(B.CRAFTING_TABLE, 1, ['PP', 'PP'], { P: TAG.planks });
shaped(B.FURNACE, 1, ['CCC', 'C C', 'CCC'], { C: B.COBBLE });
shaped(B.CHEST, 1, ['PPP', 'P P', 'PPP'], { P: TAG.planks });
shaped(B.TORCH, 4, ['C', 'S'], { C: TAG.coal, S: I.STICK });
shaped(B.LADDER, 3, ['S S', 'SSS', 'S S'], { S: I.STICK });
shaped(B.BED, 1, ['WWW', 'PPP'], { W: TAG.wool, P: TAG.planks });
const TOOL_HEADS = [TAG.planks, B.COBBLE, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND];
TOOL_HEADS.forEach((mat, mi) => {
  const k = { X: mat, S: I.STICK };
  shaped(I.TOOL0 + mi * 5 + 0, 1, ['XXX', ' S ', ' S '], k, 'tools');
  shaped(I.TOOL0 + mi * 5 + 1, 1, ['XX', 'XS', ' S'], k, 'tools');
  shaped(I.TOOL0 + mi * 5 + 2, 1, ['X', 'S', 'S'], k, 'tools');
  shaped(I.TOOL0 + mi * 5 + 3, 1, ['X', 'X', 'S'], k, 'tools');
  shaped(I.TOOL0 + mi * 5 + 4, 1, ['XX', ' S', ' S'], k, 'tools');
});
[I.LEATHER, I.IRON_INGOT, I.GOLD_INGOT, I.DIAMOND].forEach((mat, mi) => {
  const k = { X: mat };
  shaped(I.ARMOR0 + mi * 4 + 0, 1, ['XXX', 'X X'], k, 'armor');
  shaped(I.ARMOR0 + mi * 4 + 1, 1, ['X X', 'XXX', 'XXX'], k, 'armor');
  shaped(I.ARMOR0 + mi * 4 + 2, 1, ['XXX', 'X X', 'X X'], k, 'armor');
  shaped(I.ARMOR0 + mi * 4 + 3, 1, ['X X', 'X X'], k, 'armor');
});
shaped(I.BOW, 1, [' SW', 'S W', ' SW'], { S: I.STICK, W: I.STRING });
shaped(I.ARROW, 4, ['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER });
shapeless(I.FLINT_STEEL, 1, [I.IRON_INGOT, I.FLINT]);
shaped(I.BUCKET, 1, ['X X', ' X '], { X: I.IRON_INGOT });
shaped(I.SHEARS, 1, [' X', 'X '], { X: I.IRON_INGOT });
shaped(I.BREAD, 1, ['WWW'], { W: I.WHEAT });
shaped(I.BOWL, 4, ['P P', ' P '], { P: TAG.planks });
shapeless(I.STEW, 1, [I.BOWL, B.RED_MUSHROOM, B.BROWN_MUSHROOM]);
shaped(I.GOLDEN_APPLE, 1, ['GGG', 'GAG', 'GGG'], { G: I.GOLD_INGOT, A: I.APPLE });
shaped(I.PAPER, 3, ['CCC'], { C: B.SUGAR_CANE });
shapeless(I.BOOK, 1, [I.PAPER, I.PAPER, I.PAPER, I.LEATHER]);
shaped(B.BOOKSHELF, 1, ['PPP', 'BBB', 'PPP'], { P: TAG.planks, B: I.BOOK });
shapeless(I.BONE_MEAL, 3, [I.BONE]);
shaped(B.TNT, 1, ['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND });
shaped(B.STONE_BRICKS, 4, ['SS', 'SS'], { S: B.STONE });
shaped(B.SANDSTONE, 1, ['SS', 'SS'], { S: [B.SAND, B.WHITE_SAND, B.RED_SAND] });
shaped(B.BRICKS, 4, ['TT', 'TT'], { T: B.TERRACOTTA });
shaped(B.SNOW, 1, ['SS', 'SS'], { S: B.ICE });
shapeless(B.MOSSY_COBBLE, 1, [B.COBBLE, TAG.leaves]);
shapeless(B.JACK_O_LANTERN, 1, [B.PUMPKIN, B.TORCH]);
shaped(B.HAY_BALE, 1, ['WWW', 'WWW', 'WWW'], { W: I.WHEAT });
shapeless(I.WHEAT, 9, [B.HAY_BALE]);
shaped(B.MELON, 1, ['MMM', 'MMM', 'MMM'], { M: I.MELON_SLICE });
[[I.EMERALD, B.EMERALD_BLOCK], [I.COAL, B.COAL_BLOCK], [I.IRON_INGOT, B.IRON_BLOCK], [I.GOLD_INGOT, B.GOLD_BLOCK], [I.DIAMOND, B.DIAMOND_BLOCK]].forEach(([it, blk]) => {
  shaped(blk, 1, ['XXX', 'XXX', 'XXX'], { X: it });
  shapeless(it, 9, [blk]);
});
[[B.STONE_SLAB, B.SMOOTH_STONE], [B.COBBLE_SLAB, B.COBBLE], [B.PLANK_SLAB, TAG.planks], [B.BRICK_SLAB, B.BRICKS],
  [B.STONE_BRICK_SLAB, B.STONE_BRICKS], [B.SANDSTONE_SLAB, B.SANDSTONE]].forEach(([slab, src]) => shaped(slab, 6, ['XXX'], { X: src }, 'slabs'));
shaped(B.GLOWSTONE, 1, ['GTG', 'TGT', 'GTG'], { G: I.GUNPOWDER, T: B.TORCH });
shapeless(B.WOOL, 1, [I.STRING, I.STRING, I.STRING, I.STRING]);
shaped(B.DOOR, 3, ['PP', 'PP', 'PP'], { P: TAG.planks });
shaped(B.TRAPDOOR, 2, ['PPP', 'PPP'], { P: TAG.planks });
shaped(I.JET, 1, [' G ', 'IFI', 'I I'], { G: B.GLASS, I: B.IRON_BLOCK, F: B.FURNACE });
// architecture (shaped blocks come from the Architect's Table)
shaped(B.ARCH_TABLE, 1, ['SS', 'PP'], { S: B.STONE_SLAB, P: TAG.planks });
shaped(B.PLASTER, 4, ['SC', 'CS'], { S: [B.SAND, B.WHITE_SAND], C: B.CLAY });
shaped(B.ROOF_TILES, 6, ['T T', ' T '], { T: [B.TERRACOTTA, B.TERRACOTTA_C, B.TERRACOTTA_C + 4] });
shaped(B.THATCH, 1, ['WW', 'WW'], { W: I.WHEAT });
shapeless(B.DIRT_PATH, 2, [B.DIRT, B.GRAVEL]);
shaped(B.OAK_FENCE, 3, ['PSP', 'PSP'], { P: B.PLANKS, S: I.STICK });
shaped(B.SPRUCE_FENCE, 3, ['PSP', 'PSP'], { P: B.SPRUCE_PLANKS, S: I.STICK });
shaped(B.COBBLE_WALL, 6, ['CCC', 'CCC'], { C: B.COBBLE });
shaped(B.STONE_BRICK_WALL, 6, ['CCC', 'CCC'], { C: B.STONE_BRICKS });
shaped(B.GLASS_PANE, 16, ['GGG', 'GGG'], { G: B.GLASS });
shaped(B.IRON_BARS, 16, ['III', 'III'], { I: I.IRON_INGOT });
shaped(B.LANTERN, 1, [' I ', 'ITI', ' I '], { I: I.IRON_INGOT, T: B.TORCH });
shaped(B.BARREL, 1, ['PSP', 'P P', 'PSP'], { P: TAG.planks, S: B.PLANK_SLAB });
SMELT[B.DIORITE] = B.MARBLE;
SMELT[B.ANDESITE] = B.SLATE;
for (let id = B.SHAPE0; id < B.SHAPE_END; id++) if (ARCH_MATS[BLOCK_SHAPE_MAT[id]].o === WOOD) ITEM_DEF[id].fuel = 10;
for (const id of [B.OAK_FENCE, B.SPRUCE_FENCE, B.BARREL, B.ARCH_TABLE]) ITEM_DEF[id].fuel = 15;
ITEM_DEF[B.THATCH].fuel = 20;

// Match a crafting grid (array of item ids, row-major, size gw x gh) against the recipes.
function matchRecipe(grid, gw, gh) {
  let minX = gw, minY = gh, maxX = -1, maxY = -1, n = 0;
  for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
    if (!grid[y * gw + x]) continue;
    n++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!n) return null;
  const w = maxX - minX + 1, h = maxY - minY + 1;
  const at = (x, y) => grid[(y + minY) * gw + (x + minX)];
  for (const r of RECIPES) {
    if (r.shaped) {
      if (r.w !== w || r.h !== h) continue;
      for (let mirror = 0; mirror < 2; mirror++) {
        let ok = true;
        for (let y = 0; y < h && ok; y++) for (let x = 0; x < w && ok; x++) {
          const ing = r.cells[y * w + (mirror ? w - 1 - x : x)];
          const id = at(x, y);
          if (!ing) { if (id) ok = false; } else if (!id || !ingMatches(ing, id)) ok = false;
        }
        if (ok) return r;
      }
    } else {
      if (r.ings.length !== n) continue;
      const used = new Array(n).fill(false);
      const ids = [];
      for (let i = 0; i < gw * gh; i++) if (grid[i]) ids.push(grid[i]);
      let ok = true;
      for (const ing of r.ings) {
        const k = ids.findIndex((id, j) => !used[j] && ingMatches(ing, id));
        if (k < 0) { ok = false; break; }
        used[k] = true;
      }
      if (ok) return r;
    }
  }
  return null;
}

// Ingredient list of a recipe as [{ ing, x, y }] positioned for a grid of width gw.
function recipeLayout(r, gw) {
  const out = [];
  if (r.shaped) {
    for (let y = 0; y < r.h; y++) for (let x = 0; x < r.w; x++) {
      const ing = r.cells[y * r.w + x];
      if (ing) out.push({ ing, slot: y * gw + x });
    }
  } else r.ings.forEach((ing, i) => out.push({ ing, slot: (Math.floor(i / 2) * gw) + (i % 2) + (i >= 4 ? 0 : 0) }));
  return out;
}
function recipeFits(r, gw) { return r.shaped ? r.w <= gw && r.h <= gw : r.ings.length <= gw * gw; }

// ---- creative tabs ----
const CREATIVE_TABS = [
  { key: 'building', name: 'Building' }, { key: 'architecture', name: 'Architecture' }, { key: 'nature', name: 'Nature' }, { key: 'functional', name: 'Functional' },
  { key: 'tools', name: 'Tools' }, { key: 'combat', name: 'Combat' }, { key: 'food', name: 'Food' },
  { key: 'materials', name: 'Materials' }, { key: 'transport', name: 'Vehicles' },
];
function creativeItems(tab) {
  const out = [];
  for (let id = 1; id < ITEM_DEF.length; id++) {
    const d = ITEM_DEF[id];
    if (!d) continue;
    if (tab === 'all' || d.cat === tab) out.push(id);
  }
  return out;
}
