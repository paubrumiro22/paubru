'use strict';
// Block registry: ids, texture layers, render types, lighting, mining and sound properties.

// ---- texture layers ----
// Block faces, item sprites and effect textures share one texture array. Layers are
// registered by name here (and in items.js); textures.js paints them by the same name.
const T = {};
const TEX_NAMES = [];
function defTex(name) {
  if (T[name] === undefined) { T[name] = TEX_NAMES.length; TEX_NAMES.push(name); }
  return T[name];
}

// effect layers painted in textures.js (mining cracks and particles)
['crack', 'p_smoke', 'p_flame', 'p_crit', 'p_bubble'].forEach(defTex);

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, WATER: 6, LOG: 7, LEAVES: 8,
  PLANKS: 9, GLASS: 10, SNOWY_GRASS: 11, BEDROCK: 12, GRAVEL: 13, COAL_ORE: 14, IRON_ORE: 15,
  GOLD_ORE: 16, DIAMOND_ORE: 17, BIRCH_LOG: 18, BIRCH_LEAVES: 19, SANDSTONE: 20, BRICKS: 21,
  CACTUS: 22, TALLGRASS: 23, ROSE: 24, DANDELION: 25, GLOWSTONE: 26, SPRUCE_LOG: 27,
  SPRUCE_LEAVES: 28, STONE_BRICKS: 29, SNOW: 30,
  LAVA: 31, BIRCH_PLANKS: 32, SPRUCE_PLANKS: 33, CRAFTING_TABLE: 34, FURNACE: 35, FURNACE_LIT: 36,
  CHEST: 37, TORCH: 38, WALL_TORCH: 39, LADDER: 40, BED: 41, FARMLAND: 42,
  WHEAT_0: 43, WHEAT_1: 44, WHEAT_2: 45, WHEAT_3: 46, OAK_SAPLING: 47, BIRCH_SAPLING: 48, SPRUCE_SAPLING: 49,
  MOSSY_COBBLE: 50, BOOKSHELF: 51, CLAY: 52, OBSIDIAN: 53, ICE: 54, PUMPKIN: 55, JACK_O_LANTERN: 56,
  MELON: 57, TNT: 58, GRANITE: 59, DIORITE: 60, ANDESITE: 61, COAL_BLOCK: 62, IRON_BLOCK: 63,
  GOLD_BLOCK: 64, DIAMOND_BLOCK: 65, SMOOTH_STONE: 66, RED_MUSHROOM: 67, BROWN_MUSHROOM: 68,
  DEAD_BUSH: 69, FERN: 70, TULIP: 71, BLUEBELL: 72, SUGAR_CANE: 73, HAY_BALE: 74, TERRACOTTA: 75,
  STONE_SLAB: 76, COBBLE_SLAB: 77, PLANK_SLAB: 78, BRICK_SLAB: 79, STONE_BRICK_SLAB: 80, SANDSTONE_SLAB: 81,
  WOOL: 82, // 82..97: sixteen colours
  WHITE_SAND: 98, RED_SAND: 99, PALM_LOG: 100, PALM_LEAVES: 101, BASALT: 102, MAGMA: 103, ASH: 104,
  CORAL: 105, // 105..107: pink, blue, yellow
  TERRACOTTA_C: 108, // 108..112: orange, yellow, white, brown, red
  DOOR: 113, DOOR_TOP: 114, DOOR_OPEN: 115, DOOR_OPEN_TOP: 116, TRAPDOOR: 117, TRAPDOOR_OPEN: 118,
};
const CORAL_COLORS = [['Pink', [238, 118, 160]], ['Blue', [66, 122, 232]], ['Yellow', [242, 204, 64]]];
const TERRACOTTA_COLORS = [['Orange', [166, 86, 40]], ['Yellow', [188, 136, 38]], ['White', [212, 180, 164]], ['Brown', [80, 54, 38]], ['Red', [146, 62, 48]]];

const WOOL_COLORS = [
  ['White', [234, 236, 237]], ['Orange', [240, 118, 20]], ['Magenta', [190, 70, 180]], ['Light Blue', [60, 176, 218]],
  ['Yellow', [248, 198, 40]], ['Lime', [112, 186, 26]], ['Pink', [238, 142, 172]], ['Gray', [64, 70, 74]],
  ['Light Gray', [144, 144, 136]], ['Cyan', [22, 138, 146]], ['Purple', [122, 44, 172]], ['Blue', [54, 58, 158]],
  ['Brown', [114, 72, 40]], ['Green', [84, 110, 28]], ['Red', [162, 40, 36]], ['Black', [22, 22, 26]],
];

const RT_NONE = 0, RT_CUBE = 1, RT_CUTOUT = 2, RT_CROSS = 3, RT_WATER = 4, RT_CACTUS = 5, RT_LAVA = 6,
  RT_SLAB = 7, RT_TORCH = 8, RT_WALL_TORCH = 9, RT_LADDER = 10, RT_BED = 11, RT_FARMLAND = 12, RT_DOOR = 13, RT_TRAPDOOR = 14;
const TINT_NONE = 0, TINT_GRASS = 1, TINT_FOLIAGE = 2;
// 5 bits travel with every vertex (shader flags)
const FLAG_WAVE_LEAVES = 1, FLAG_WAVE_PLANT = 2, FLAG_EMISSIVE = 4, FLAG_TRANSLUCENT = 8, FLAG_LAVA = 16;

const TOOL_NONE = 0, TOOL_PICK = 1, TOOL_AXE = 2, TOOL_SHOVEL = 3, TOOL_HOE = 4, TOOL_SHEARS = 5, TOOL_SWORD = 6;
const SND = { STONE: 0, WOOD: 1, GRASS: 2, SAND: 3, GRAVEL: 4, GLASS: 5, WOOL: 6, SNOW: 7, METAL: 8, DIRT: 9 };
// What a block needs underneath / behind it to stay in place
const SUP_NONE = 0, SUP_FLOOR = 1, SUP_WALL = 2, SUP_SOIL = 3, SUP_SAND = 4, SUP_SOLID = 5, SUP_FARMLAND = 6, SUP_CANE = 7, SUP_CACTUS = 8;

const BLOCK_NAME = [];
const BLOCK_RT = new Uint8Array(256);
const BLOCK_SOLID = new Uint8Array(256);   // collides with the player
const BLOCK_HEIGHT = new Uint8Array(256);  // collision box height in 1/16 (0 = none)
const BLOCK_OPAQUE = new Uint8Array(256);  // full opaque cube: culls faces, occludes AO, blocks light
const BLOCK_ATTEN = new Uint8Array(256);   // light attenuation (15 = blocks light)
const BLOCK_EMIT = new Uint8Array(256);
const BLOCK_TINT = new Uint8Array(256);
const BLOCK_FLAGS = new Uint8Array(256);
const BLOCK_TEX = new Uint16Array(256 * 6); // per face: +X -X +Y -Y +Z -Z (texture array layer)
const NO_LAYER = 0xffff;
const BLOCK_FRONT = new Uint16Array(256).fill(NO_LAYER); // front layer of blocks that face the player
const BLOCK_HARD = new Float32Array(256);  // seconds-ish; < 0 = unbreakable
const BLOCK_TOOL = new Uint8Array(256);
const BLOCK_TIER = new Uint8Array(256);    // minimum tool tier for drops (0 = hand is fine)
const BLOCK_SOUND = new Uint8Array(256);
const BLOCK_BLAST = new Float32Array(256); // explosion resistance
const BLOCK_REPLACE = new Uint8Array(256); // placing a block here overwrites it
const BLOCK_SUPPORT = new Uint8Array(256);
const BLOCK_CAT = [];                      // creative tab

function defBlock(id, name, rt, tex, o = {}) {
  BLOCK_NAME[id] = name;
  BLOCK_RT[id] = rt;
  let top, bottom, sx, sz, front = null;
  if (typeof tex === 'string') top = bottom = sx = sz = tex;
  else if (Array.isArray(tex)) { [top, bottom, sx] = tex; sz = sx; }
  else { top = tex.top; bottom = tex.bottom || tex.top; sx = tex.side; sz = tex.sideZ || tex.side; front = tex.front || null; }
  const faces = [sx, sx, top, bottom, sz, sz];
  for (let d = 0; d < 6; d++) BLOCK_TEX[id * 6 + d] = defTex(faces[d]);
  if (front) BLOCK_FRONT[id] = defTex(front);
  const cube = rt === RT_CUBE;
  const solidDefault = rt === RT_CUBE || rt === RT_CUTOUT || rt === RT_CACTUS || rt === RT_SLAB || rt === RT_BED || rt === RT_FARMLAND;
  BLOCK_SOLID[id] = o.solid !== undefined ? (o.solid ? 1 : 0) : (solidDefault ? 1 : 0);
  BLOCK_HEIGHT[id] = BLOCK_SOLID[id] ? (rt === RT_SLAB ? 8 : rt === RT_BED ? 9 : rt === RT_FARMLAND ? 15 : 16) : 0;
  BLOCK_OPAQUE[id] = cube ? 1 : 0;
  BLOCK_ATTEN[id] = o.atten !== undefined ? o.atten : (cube ? 15 : 1);
  BLOCK_EMIT[id] = o.emit || 0;
  BLOCK_TINT[id] = o.tint || TINT_NONE;
  BLOCK_FLAGS[id] = (o.flags || 0) | (o.emit ? FLAG_EMISSIVE : 0);
  BLOCK_HARD[id] = o.hard !== undefined ? o.hard : 1;
  BLOCK_TOOL[id] = o.tool || TOOL_NONE;
  BLOCK_TIER[id] = o.tier || 0;
  BLOCK_SOUND[id] = o.snd !== undefined ? o.snd : SND.STONE;
  BLOCK_BLAST[id] = o.blast !== undefined ? o.blast : Math.max(0.5, BLOCK_HARD[id] * 3);
  BLOCK_REPLACE[id] = o.replace ? 1 : 0;
  BLOCK_SUPPORT[id] = o.support || SUP_NONE;
  BLOCK_CAT[id] = o.cat || null;
}

const PLANT = { atten: 0, hard: 0, snd: SND.GRASS, flags: FLAG_WAVE_PLANT | FLAG_TRANSLUCENT, support: SUP_SOIL, cat: 'nature' };
const LEAF = { atten: 2, hard: 0.2, tool: TOOL_SHEARS, snd: SND.GRASS, cat: 'nature' };
const WOOD = { hard: 2, tool: TOOL_AXE, snd: SND.WOOD, cat: 'building' };
const ROCK = { hard: 1.5, tool: TOOL_PICK, tier: 1, snd: SND.STONE, blast: 6, cat: 'building' };
const with_ = (base, extra) => Object.assign({}, base, extra);

defBlock(B.AIR, 'Air', RT_NONE, 'stone', { atten: 0, hard: -1, replace: true, solid: false });
defBlock(B.GRASS, 'Grass Block', RT_CUBE, ['grass_top', 'dirt', 'grass_side'], { tint: TINT_GRASS, hard: 0.6, tool: TOOL_SHOVEL, snd: SND.GRASS, cat: 'nature' });
defBlock(B.DIRT, 'Dirt', RT_CUBE, 'dirt', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.DIRT, cat: 'nature' });
defBlock(B.STONE, 'Stone', RT_CUBE, 'stone', ROCK);
defBlock(B.COBBLE, 'Cobblestone', RT_CUBE, 'cobble', with_(ROCK, { hard: 2 }));
defBlock(B.SAND, 'Sand', RT_CUBE, 'sand', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.SAND, cat: 'nature' });
defBlock(B.WATER, 'Water', RT_WATER, 'water', { atten: 2, hard: -1, replace: true, blast: 500 });
defBlock(B.LOG, 'Oak Log', RT_CUBE, ['log_top', 'log_top', 'log_side'], WOOD);
defBlock(B.LEAVES, 'Oak Leaves', RT_CUTOUT, 'leaves', with_(LEAF, { tint: TINT_FOLIAGE, flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.PLANKS, 'Oak Planks', RT_CUBE, 'planks', WOOD);
defBlock(B.GLASS, 'Glass', RT_CUTOUT, 'glass', { atten: 1, hard: 0.3, snd: SND.GLASS, cat: 'building' });
defBlock(B.SNOWY_GRASS, 'Snowy Grass', RT_CUBE, ['snow_top', 'dirt', 'snow_side'], { hard: 0.6, tool: TOOL_SHOVEL, snd: SND.SNOW, cat: 'nature' });
defBlock(B.BEDROCK, 'Bedrock', RT_CUBE, 'bedrock', { hard: -1, blast: 1e9, cat: 'nature' });
defBlock(B.GRAVEL, 'Gravel', RT_CUBE, 'gravel', { hard: 0.6, tool: TOOL_SHOVEL, snd: SND.GRAVEL, cat: 'nature' });
defBlock(B.COAL_ORE, 'Coal Ore', RT_CUBE, 'coal_ore', with_(ROCK, { hard: 3, cat: 'nature' }));
defBlock(B.IRON_ORE, 'Iron Ore', RT_CUBE, 'iron_ore', with_(ROCK, { hard: 3, tier: 2, cat: 'nature' }));
defBlock(B.GOLD_ORE, 'Gold Ore', RT_CUBE, 'gold_ore', with_(ROCK, { hard: 3, tier: 3, cat: 'nature' }));
defBlock(B.DIAMOND_ORE, 'Diamond Ore', RT_CUBE, 'diamond_ore', with_(ROCK, { hard: 3, tier: 3, cat: 'nature' }));
defBlock(B.BIRCH_LOG, 'Birch Log', RT_CUBE, ['birch_top', 'birch_top', 'birch_side'], WOOD);
defBlock(B.BIRCH_LEAVES, 'Birch Leaves', RT_CUTOUT, 'birch_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.SANDSTONE, 'Sandstone', RT_CUBE, ['sandstone_top', 'sandstone_bottom', 'sandstone_side'], with_(ROCK, { hard: 0.8 }));
defBlock(B.BRICKS, 'Bricks', RT_CUBE, 'bricks', with_(ROCK, { hard: 2 }));
defBlock(B.CACTUS, 'Cactus', RT_CACTUS, ['cactus_top', 'cactus_bottom', 'cactus_side'], { atten: 1, hard: 0.4, snd: SND.WOOL, support: SUP_CACTUS, cat: 'nature' });
defBlock(B.TALLGRASS, 'Tall Grass', RT_CROSS, 'tallgrass', with_(PLANT, { tint: TINT_GRASS, replace: true }));
defBlock(B.ROSE, 'Rose', RT_CROSS, 'rose', PLANT);
defBlock(B.DANDELION, 'Dandelion', RT_CROSS, 'dandelion', PLANT);
defBlock(B.GLOWSTONE, 'Glowstone', RT_CUBE, 'glowstone', { emit: 15, hard: 0.3, snd: SND.GLASS, cat: 'building' });
defBlock(B.SPRUCE_LOG, 'Spruce Log', RT_CUBE, ['spruce_top', 'spruce_top', 'spruce_side'], WOOD);
defBlock(B.SPRUCE_LEAVES, 'Spruce Leaves', RT_CUTOUT, 'spruce_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.STONE_BRICKS, 'Stone Bricks', RT_CUBE, 'stone_bricks', ROCK);
defBlock(B.SNOW, 'Snow Block', RT_CUBE, 'snow_top', { hard: 0.2, tool: TOOL_SHOVEL, snd: SND.SNOW, cat: 'building' });
defBlock(B.LAVA, 'Lava', RT_LAVA, 'lava', { emit: 15, atten: 1, hard: -1, replace: true, flags: FLAG_LAVA, blast: 500 });
defBlock(B.BIRCH_PLANKS, 'Birch Planks', RT_CUBE, 'birch_planks', WOOD);
defBlock(B.SPRUCE_PLANKS, 'Spruce Planks', RT_CUBE, 'spruce_planks', WOOD);
defBlock(B.CRAFTING_TABLE, 'Crafting Table', RT_CUBE, { top: 'crafting_top', bottom: 'planks', side: 'crafting_side', sideZ: 'crafting_front' }, with_(WOOD, { hard: 2.5, cat: 'functional' }));
defBlock(B.FURNACE, 'Furnace', RT_CUBE, { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, with_(ROCK, { hard: 3.5, cat: 'functional' }));
defBlock(B.FURNACE_LIT, 'Furnace', RT_CUBE, { top: 'furnace_top', side: 'furnace_side', front: 'furnace_front_lit' }, with_(ROCK, { hard: 3.5, emit: 13, cat: null }));
defBlock(B.CHEST, 'Chest', RT_CUBE, { top: 'chest_top', side: 'chest_side', front: 'chest_front' }, with_(WOOD, { hard: 2.5, cat: 'functional' }));
defBlock(B.TORCH, 'Torch', RT_TORCH, 'torch', { emit: 14, atten: 0, hard: 0, snd: SND.WOOD, support: SUP_FLOOR, cat: 'functional' });
defBlock(B.WALL_TORCH, 'Torch', RT_WALL_TORCH, 'torch', { emit: 14, atten: 0, hard: 0, snd: SND.WOOD, support: SUP_WALL });
defBlock(B.LADDER, 'Ladder', RT_LADDER, 'ladder', { atten: 0, hard: 0.4, tool: TOOL_AXE, snd: SND.WOOD, support: SUP_WALL, cat: 'functional' });
defBlock(B.BED, 'Bed', RT_BED, { top: 'bed_top', bottom: 'planks', side: 'bed_side', front: 'bed_end' }, { atten: 1, hard: 0.2, snd: SND.WOOL, cat: 'functional' });
defBlock(B.FARMLAND, 'Farmland', RT_FARMLAND, ['farmland', 'dirt', 'dirt'], { atten: 1, hard: 0.6, tool: TOOL_SHOVEL, snd: SND.DIRT });
for (let s = 0; s < 4; s++) {
  defBlock(B.WHEAT_0 + s, 'Wheat Crops', RT_CROSS, 'wheat_' + s, with_(PLANT, { support: SUP_FARMLAND, cat: null }));
}
defBlock(B.OAK_SAPLING, 'Oak Sapling', RT_CROSS, 'oak_sapling', PLANT);
defBlock(B.BIRCH_SAPLING, 'Birch Sapling', RT_CROSS, 'birch_sapling', PLANT);
defBlock(B.SPRUCE_SAPLING, 'Spruce Sapling', RT_CROSS, 'spruce_sapling', PLANT);
defBlock(B.MOSSY_COBBLE, 'Mossy Cobblestone', RT_CUBE, 'mossy_cobble', with_(ROCK, { hard: 2 }));
defBlock(B.BOOKSHELF, 'Bookshelf', RT_CUBE, ['planks', 'planks', 'bookshelf'], with_(WOOD, { hard: 1.5 }));
defBlock(B.CLAY, 'Clay', RT_CUBE, 'clay', { hard: 0.6, tool: TOOL_SHOVEL, snd: SND.DIRT, cat: 'nature' });
defBlock(B.OBSIDIAN, 'Obsidian', RT_CUBE, 'obsidian', with_(ROCK, { hard: 50, tier: 4, blast: 1200 }));
defBlock(B.ICE, 'Ice', RT_CUBE, 'ice', { hard: 0.5, tool: TOOL_PICK, snd: SND.GLASS, cat: 'building' });
defBlock(B.PUMPKIN, 'Pumpkin', RT_CUBE, ['pumpkin_top', 'pumpkin_top', 'pumpkin_side'], { hard: 1, tool: TOOL_AXE, snd: SND.WOOD, cat: 'nature' });
defBlock(B.JACK_O_LANTERN, "Jack o'Lantern", RT_CUBE, { top: 'pumpkin_top', side: 'pumpkin_side', front: 'jack_face' }, { hard: 1, tool: TOOL_AXE, snd: SND.WOOD, emit: 15, cat: 'functional' });
defBlock(B.MELON, 'Melon', RT_CUBE, ['melon_top', 'melon_top', 'melon_side'], { hard: 1, tool: TOOL_AXE, snd: SND.WOOD, cat: 'nature' });
defBlock(B.TNT, 'TNT', RT_CUBE, ['tnt_top', 'tnt_bottom', 'tnt_side'], { hard: 0, snd: SND.GRASS, blast: 0, cat: 'functional' });
defBlock(B.GRANITE, 'Granite', RT_CUBE, 'granite', ROCK);
defBlock(B.DIORITE, 'Diorite', RT_CUBE, 'diorite', ROCK);
defBlock(B.ANDESITE, 'Andesite', RT_CUBE, 'andesite', ROCK);
defBlock(B.COAL_BLOCK, 'Block of Coal', RT_CUBE, 'coal_block', with_(ROCK, { hard: 5 }));
defBlock(B.IRON_BLOCK, 'Block of Iron', RT_CUBE, 'iron_block', with_(ROCK, { hard: 5, tier: 2, snd: SND.METAL }));
defBlock(B.GOLD_BLOCK, 'Block of Gold', RT_CUBE, 'gold_block', with_(ROCK, { hard: 3, tier: 3, snd: SND.METAL }));
defBlock(B.DIAMOND_BLOCK, 'Block of Diamond', RT_CUBE, 'diamond_block', with_(ROCK, { hard: 5, tier: 3, snd: SND.METAL }));
defBlock(B.SMOOTH_STONE, 'Smooth Stone', RT_CUBE, 'smooth_stone', with_(ROCK, { hard: 2 }));
defBlock(B.RED_MUSHROOM, 'Red Mushroom', RT_CROSS, 'red_mushroom', with_(PLANT, { flags: FLAG_TRANSLUCENT, support: SUP_SOLID }));
defBlock(B.BROWN_MUSHROOM, 'Brown Mushroom', RT_CROSS, 'brown_mushroom', with_(PLANT, { flags: FLAG_TRANSLUCENT, support: SUP_SOLID }));
defBlock(B.DEAD_BUSH, 'Dead Bush', RT_CROSS, 'dead_bush', with_(PLANT, { support: SUP_SAND, replace: true }));
defBlock(B.FERN, 'Fern', RT_CROSS, 'fern', with_(PLANT, { tint: TINT_GRASS, replace: true }));
defBlock(B.TULIP, 'Orange Tulip', RT_CROSS, 'tulip', PLANT);
defBlock(B.BLUEBELL, 'Bluebell', RT_CROSS, 'bluebell', PLANT);
defBlock(B.SUGAR_CANE, 'Sugar Cane', RT_CROSS, 'sugar_cane', with_(PLANT, { flags: FLAG_TRANSLUCENT, support: SUP_CANE }));
defBlock(B.HAY_BALE, 'Hay Bale', RT_CUBE, ['hay_top', 'hay_top', 'hay_side'], { hard: 0.5, tool: TOOL_HOE, snd: SND.GRASS, cat: 'building' });
defBlock(B.TERRACOTTA, 'Terracotta', RT_CUBE, 'terracotta', with_(ROCK, { hard: 1.25 }));
defBlock(B.STONE_SLAB, 'Smooth Stone Slab', RT_SLAB, 'smooth_stone', with_(ROCK, { hard: 2 }));
defBlock(B.COBBLE_SLAB, 'Cobblestone Slab', RT_SLAB, 'cobble', with_(ROCK, { hard: 2 }));
defBlock(B.PLANK_SLAB, 'Oak Slab', RT_SLAB, 'planks', WOOD);
defBlock(B.BRICK_SLAB, 'Brick Slab', RT_SLAB, 'bricks', with_(ROCK, { hard: 2 }));
defBlock(B.STONE_BRICK_SLAB, 'Stone Brick Slab', RT_SLAB, 'stone_bricks', ROCK);
defBlock(B.SANDSTONE_SLAB, 'Sandstone Slab', RT_SLAB, ['sandstone_top', 'sandstone_bottom', 'sandstone_side'], with_(ROCK, { hard: 0.8 }));
WOOL_COLORS.forEach(([name], i) => {
  defBlock(B.WOOL + i, name + ' Wool', RT_CUBE, 'wool_' + i, { hard: 0.8, tool: TOOL_SHEARS, snd: SND.WOOL, cat: 'building' });
});

defBlock(B.WHITE_SAND, 'White Sand', RT_CUBE, 'white_sand', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.SAND, cat: 'nature' });
defBlock(B.RED_SAND, 'Red Sand', RT_CUBE, 'red_sand', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.SAND, cat: 'nature' });
defBlock(B.PALM_LOG, 'Palm Log', RT_CUBE, ['palm_top', 'palm_top', 'palm_side'], WOOD);
defBlock(B.PALM_LEAVES, 'Palm Fronds', RT_CUTOUT, 'palm_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.BASALT, 'Basalt', RT_CUBE, ['basalt_top', 'basalt_top', 'basalt_side'], with_(ROCK, { hard: 1.25 }));
defBlock(B.MAGMA, 'Magma Block', RT_CUBE, 'magma', with_(ROCK, { hard: 0.5, emit: 6 }));
defBlock(B.ASH, 'Volcanic Ash', RT_CUBE, 'ash', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.SAND, cat: 'nature' });
CORAL_COLORS.forEach(([name], i) => defBlock(B.CORAL + i, name + ' Coral', RT_CUBE, 'coral_' + i, with_(ROCK, { hard: 1.2, cat: 'nature' })));
TERRACOTTA_COLORS.forEach(([name], i) => defBlock(B.TERRACOTTA_C + i, name + ' Terracotta', RT_CUBE, 'terracotta_' + i, with_(ROCK, { hard: 1.25 })));
// Doors are two blocks tall; closed halves block the way, open ones swing against the frame.
const DOORISH = { atten: 1, hard: 1.5, tool: TOOL_AXE, snd: SND.WOOD, cat: null };
defBlock(B.DOOR, 'Oak Door', RT_DOOR, { top: 'planks', side: 'door_lower' }, with_(DOORISH, { solid: true, cat: 'functional' }));
defBlock(B.DOOR_TOP, 'Oak Door', RT_DOOR, { top: 'planks', side: 'door_upper' }, with_(DOORISH, { solid: true }));
defBlock(B.DOOR_OPEN, 'Oak Door', RT_DOOR, { top: 'planks', side: 'door_lower' }, with_(DOORISH, { solid: false }));
defBlock(B.DOOR_OPEN_TOP, 'Oak Door', RT_DOOR, { top: 'planks', side: 'door_upper' }, with_(DOORISH, { solid: false }));
defBlock(B.TRAPDOOR, 'Oak Trapdoor', RT_TRAPDOOR, 'trapdoor', with_(DOORISH, { solid: true, cat: 'functional' }));
defBlock(B.TRAPDOOR_OPEN, 'Oak Trapdoor', RT_TRAPDOOR, 'trapdoor', with_(DOORISH, { solid: false }));
BLOCK_HEIGHT[B.TRAPDOOR] = 3;

// Door panel in 1/16 units. f = side the player stood on when placing it (0 +X, 1 -X, 4 +Z, 5 -Z):
// closed, the panel sits on the far edge; open, it swings flat against a side of the frame.
function doorPanel(f, open) {
  const t = 3;
  if (!open) {
    if (f === 0) return [0, 0, 0, t, 16, 16];
    if (f === 1) return [16 - t, 0, 0, 16, 16, 16];
    if (f === 4) return [0, 0, 0, 16, 16, t];
    return [0, 0, 16 - t, 16, 16, 16];
  }
  if (f === 0) return [0, 0, 0, 16, 16, t];
  if (f === 1) return [0, 0, 16 - t, 16, 16, 16];
  if (f === 4) return [16 - t, 0, 0, 16, 16, 16];
  return [0, 0, 0, t, 16, 16];
}
function trapdoorPanel(f, open) { return open ? doorPanel(f, false) : [0, 0, 0, 16, 3, 16]; }

const DOOR_IDS = new Set([B.DOOR, B.DOOR_TOP, B.DOOR_OPEN, B.DOOR_OPEN_TOP]);
const isDoorTop = (id) => id === B.DOOR_TOP || id === B.DOOR_OPEN_TOP;
const isOpenDoor = (id) => id === B.DOOR_OPEN || id === B.DOOR_OPEN_TOP || id === B.TRAPDOOR_OPEN;

// Blocks whose front face turns towards the player when placed
const FACING_BLOCKS = new Set([B.FURNACE, B.FURNACE_LIT, B.CHEST, B.JACK_O_LANTERN, B.BED, B.WALL_TORCH, B.LADDER,
  B.DOOR, B.DOOR_TOP, B.DOOR_OPEN, B.DOOR_OPEN_TOP, B.TRAPDOOR, B.TRAPDOOR_OPEN]);
// A slab placed onto the same slab merges into this block
const SLAB_FULL = {
  [B.STONE_SLAB]: B.SMOOTH_STONE, [B.COBBLE_SLAB]: B.COBBLE, [B.PLANK_SLAB]: B.PLANKS,
  [B.BRICK_SLAB]: B.BRICKS, [B.STONE_BRICK_SLAB]: B.STONE_BRICKS, [B.SANDSTONE_SLAB]: B.SANDSTONE,
};
const LOGS = [B.LOG, B.BIRCH_LOG, B.SPRUCE_LOG, B.PALM_LOG];
const PLANKS_ALL = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const SOIL = new Set([B.GRASS, B.DIRT, B.SNOWY_GRASS, B.FARMLAND]);
const IS_LIQUID = (id) => id === B.WATER || id === B.LAVA;

function isValidBlock(id) { return Number.isInteger(id) && id > 0 && id < 256 && BLOCK_NAME[id] !== undefined; }
