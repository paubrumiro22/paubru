'use strict';
// Block registry: ids, texture layers, render types and lighting properties.

// Texture array layers
const T = {
  GRASS_TOP: 0, GRASS_SIDE: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, LOG_SIDE: 6, LOG_TOP: 7,
  LEAVES: 8, PLANKS: 9, GLASS: 10, SNOW_TOP: 11, SNOW_SIDE: 12, BEDROCK: 13, GRAVEL: 14,
  COAL: 15, IRON: 16, GOLD: 17, DIAMOND: 18, BIRCH_SIDE: 19, BIRCH_TOP: 20, BIRCH_LEAVES: 21,
  SANDSTONE_SIDE: 22, SANDSTONE_TOP: 23, BRICKS: 24, CACTUS_SIDE: 25, CACTUS_TOP: 26,
  TALLGRASS: 27, ROSE: 28, DANDELION: 29, GLOWSTONE: 30, SPRUCE_SIDE: 31, SPRUCE_TOP: 32,
  SPRUCE_LEAVES: 33, WATER: 34, STONE_BRICKS: 35,
};
const TEX_COUNT = 36;

const B = {
  AIR: 0, GRASS: 1, DIRT: 2, STONE: 3, COBBLE: 4, SAND: 5, WATER: 6, LOG: 7, LEAVES: 8,
  PLANKS: 9, GLASS: 10, SNOWY_GRASS: 11, BEDROCK: 12, GRAVEL: 13, COAL_ORE: 14, IRON_ORE: 15,
  GOLD_ORE: 16, DIAMOND_ORE: 17, BIRCH_LOG: 18, BIRCH_LEAVES: 19, SANDSTONE: 20, BRICKS: 21,
  CACTUS: 22, TALLGRASS: 23, ROSE: 24, DANDELION: 25, GLOWSTONE: 26, SPRUCE_LOG: 27,
  SPRUCE_LEAVES: 28, STONE_BRICKS: 29, SNOW: 30,
};

const RT_NONE = 0, RT_CUBE = 1, RT_CUTOUT = 2, RT_CROSS = 3, RT_WATER = 4, RT_CACTUS = 5;
const TINT_NONE = 0, TINT_GRASS = 1, TINT_FOLIAGE = 2;
const FLAG_WAVE_LEAVES = 1, FLAG_WAVE_PLANT = 2, FLAG_EMISSIVE = 4, FLAG_TRANSLUCENT = 8;

const BLOCK_NAME = [];
const BLOCK_RT = new Uint8Array(256);
const BLOCK_SOLID = new Uint8Array(256);   // collides with the player
const BLOCK_OPAQUE = new Uint8Array(256);  // full opaque cube: culls faces, occludes AO, blocks light
const BLOCK_ATTEN = new Uint8Array(256);   // light attenuation (15 = blocks light)
const BLOCK_EMIT = new Uint8Array(256);
const BLOCK_TINT = new Uint8Array(256);    // which face gets tinted is handled in the mesher
const BLOCK_FLAGS = new Uint8Array(256);
const BLOCK_TEX = new Uint8Array(256 * 6); // per face: +X -X +Y -Y +Z -Z

function defBlock(id, name, rt, tex, opts = {}) {
  BLOCK_NAME[id] = name;
  BLOCK_RT[id] = rt;
  const [top, bottom, side] = Array.isArray(tex) ? tex : [tex, tex, tex];
  const faces = [side, side, top, bottom, side, side];
  for (let d = 0; d < 6; d++) BLOCK_TEX[id * 6 + d] = faces[d];
  BLOCK_SOLID[id] = opts.solid !== undefined ? (opts.solid ? 1 : 0) : (rt === RT_CROSS || rt === RT_WATER || rt === RT_NONE ? 0 : 1);
  BLOCK_OPAQUE[id] = rt === RT_CUBE ? 1 : 0;
  BLOCK_ATTEN[id] = opts.atten !== undefined ? opts.atten : (rt === RT_CUBE ? 15 : 1);
  BLOCK_EMIT[id] = opts.emit || 0;
  BLOCK_TINT[id] = opts.tint || TINT_NONE;
  BLOCK_FLAGS[id] = opts.flags || 0;
}

defBlock(B.AIR, 'Air', RT_NONE, 0, { atten: 0 });
defBlock(B.GRASS, 'Grass Block', RT_CUBE, [T.GRASS_TOP, T.DIRT, T.GRASS_SIDE], { tint: TINT_GRASS });
defBlock(B.DIRT, 'Dirt', RT_CUBE, T.DIRT);
defBlock(B.STONE, 'Stone', RT_CUBE, T.STONE);
defBlock(B.COBBLE, 'Cobblestone', RT_CUBE, T.COBBLE);
defBlock(B.SAND, 'Sand', RT_CUBE, T.SAND);
defBlock(B.WATER, 'Water', RT_WATER, T.WATER, { atten: 2 });
defBlock(B.LOG, 'Oak Log', RT_CUBE, [T.LOG_TOP, T.LOG_TOP, T.LOG_SIDE]);
defBlock(B.LEAVES, 'Oak Leaves', RT_CUTOUT, T.LEAVES, { atten: 2, tint: TINT_FOLIAGE, flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT });
defBlock(B.PLANKS, 'Oak Planks', RT_CUBE, T.PLANKS);
defBlock(B.GLASS, 'Glass', RT_CUTOUT, T.GLASS, { atten: 1 });
defBlock(B.SNOWY_GRASS, 'Snowy Grass', RT_CUBE, [T.SNOW_TOP, T.DIRT, T.SNOW_SIDE]);
defBlock(B.BEDROCK, 'Bedrock', RT_CUBE, T.BEDROCK);
defBlock(B.GRAVEL, 'Gravel', RT_CUBE, T.GRAVEL);
defBlock(B.COAL_ORE, 'Coal Ore', RT_CUBE, T.COAL);
defBlock(B.IRON_ORE, 'Iron Ore', RT_CUBE, T.IRON);
defBlock(B.GOLD_ORE, 'Gold Ore', RT_CUBE, T.GOLD);
defBlock(B.DIAMOND_ORE, 'Diamond Ore', RT_CUBE, T.DIAMOND);
defBlock(B.BIRCH_LOG, 'Birch Log', RT_CUBE, [T.BIRCH_TOP, T.BIRCH_TOP, T.BIRCH_SIDE]);
defBlock(B.BIRCH_LEAVES, 'Birch Leaves', RT_CUTOUT, T.BIRCH_LEAVES, { atten: 2, flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT });
defBlock(B.SANDSTONE, 'Sandstone', RT_CUBE, [T.SANDSTONE_TOP, T.SANDSTONE_TOP, T.SANDSTONE_SIDE]);
defBlock(B.BRICKS, 'Bricks', RT_CUBE, T.BRICKS);
defBlock(B.CACTUS, 'Cactus', RT_CACTUS, [T.CACTUS_TOP, T.CACTUS_TOP, T.CACTUS_SIDE], { atten: 1 });
defBlock(B.TALLGRASS, 'Tall Grass', RT_CROSS, T.TALLGRASS, { atten: 0, tint: TINT_GRASS, flags: FLAG_WAVE_PLANT | FLAG_TRANSLUCENT });
defBlock(B.ROSE, 'Rose', RT_CROSS, T.ROSE, { atten: 0, flags: FLAG_WAVE_PLANT | FLAG_TRANSLUCENT });
defBlock(B.DANDELION, 'Dandelion', RT_CROSS, T.DANDELION, { atten: 0, flags: FLAG_WAVE_PLANT | FLAG_TRANSLUCENT });
defBlock(B.GLOWSTONE, 'Glowstone', RT_CUBE, T.GLOWSTONE, { emit: 15, flags: FLAG_EMISSIVE });
defBlock(B.SPRUCE_LOG, 'Spruce Log', RT_CUBE, [T.SPRUCE_TOP, T.SPRUCE_TOP, T.SPRUCE_SIDE]);
defBlock(B.SPRUCE_LEAVES, 'Spruce Leaves', RT_CUTOUT, T.SPRUCE_LEAVES, { atten: 2, flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT });
defBlock(B.STONE_BRICKS, 'Stone Bricks', RT_CUBE, T.STONE_BRICKS);
defBlock(B.SNOW, 'Snow', RT_CUBE, T.SNOW_TOP);

// Blocks offered in the palette (order matters for the UI).
const PALETTE = [
  B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.STONE_BRICKS, B.BRICKS, B.PLANKS, B.LOG, B.BIRCH_LOG,
  B.SPRUCE_LOG, B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES, B.GLASS, B.GLOWSTONE, B.SAND,
  B.SANDSTONE, B.GRAVEL, B.SNOW, B.SNOWY_GRASS, B.CACTUS, B.TALLGRASS, B.ROSE, B.DANDELION,
  B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.BEDROCK,
];
const DEFAULT_HOTBAR = [B.GRASS, B.DIRT, B.STONE, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.BRICKS, B.GLOWSTONE];

function isValidBlock(id) { return Number.isInteger(id) && id > 0 && id < 256 && BLOCK_NAME[id] !== undefined && id !== B.WATER; }
