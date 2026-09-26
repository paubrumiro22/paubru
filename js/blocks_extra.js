'use strict';
// A big batch of extra blocks (ids from 1024): new woods (dark oak, cherry, acacia, bamboo),
// stones and their polished / brick / cut variants, deepslate, quartz, prismarine, nether and end
// stone, Barcelona floors (panot, hydraulic tiles), concrete in sixteen colours, copper, glowing
// blocks, more flowers, school boards... plus slabs, fences, walls and architecture shapes for them.
//
// Ids are handed out in the order below and are saved in worlds: only ever APPEND to these lists.

{
  let id = 1024;
  const n = (key, count = 1) => { B[key] = id; id += count; };
  [
    'DARK_OAK_LOG', 'DARK_OAK_PLANKS', 'DARK_OAK_LEAVES', 'CHERRY_LOG', 'CHERRY_PLANKS', 'CHERRY_LEAVES',
    'ACACIA_LOG', 'ACACIA_PLANKS', 'ACACIA_LEAVES', 'BAMBOO_PLANKS',
    'POLISHED_GRANITE', 'POLISHED_DIORITE', 'POLISHED_ANDESITE', 'DEEPSLATE', 'COBBLED_DEEPSLATE', 'DEEPSLATE_BRICKS',
    'DEEPSLATE_TILES', 'CALCITE', 'TUFF', 'BLACKSTONE', 'POLISHED_BLACKSTONE', 'BLACKSTONE_BRICKS',
    'CHISELED_STONE_BRICKS', 'CRACKED_STONE_BRICKS', 'MOSSY_STONE_BRICKS', 'RED_SANDSTONE', 'CUT_SANDSTONE',
    'CHISELED_SANDSTONE', 'MUD_BRICKS', 'PACKED_MUD', 'QUARTZ_BLOCK', 'QUARTZ_PILLAR', 'QUARTZ_BRICKS',
    'PRISMARINE', 'PRISMARINE_BRICKS', 'DARK_PRISMARINE', 'NETHERRACK', 'NETHER_BRICKS', 'END_STONE', 'PURPUR',
    'PANOT', 'HYDRAULIC_TILE', 'CHECKER_TILE', 'PARQUET', 'TERRAZZO', 'BLUE_TILES',
    'COPPER_BLOCK', 'EXPOSED_COPPER', 'WEATHERED_COPPER', 'OXIDIZED_COPPER', 'CUT_COPPER', 'AMETHYST_BLOCK', 'STEEL_PLATE',
    'SEA_LANTERN', 'SHROOMLIGHT', 'GLASS_LAMP', 'PAPER_LANTERN', 'AMETHYST_CLUSTER',
    'MOSS_BLOCK', 'MUD', 'PODZOL', 'COARSE_DIRT', 'SUNFLOWER', 'LAVENDER', 'LILY_OF_VALLEY', 'CORNFLOWER', 'ALLIUM',
    'DAISY', 'PINK_TULIP', 'BUSH', 'BAMBOO', 'HYDRANGEA',
    'CRATE', 'SPONGE', 'HONEYCOMB', 'CHALKBOARD', 'WHITEBOARD', 'CORKBOARD',
    'CHERRY_SAPLING', 'DARK_OAK_SAPLING', 'ACACIA_SAPLING',
  ].forEach((k) => n(k));
  n('CONCRETE', 16);
  [
    'DARK_OAK_SLAB', 'CHERRY_SLAB', 'ACACIA_SLAB', 'BAMBOO_SLAB', 'QUARTZ_SLAB', 'DEEPSLATE_BRICK_SLAB',
    'BLACKSTONE_SLAB', 'MUD_BRICK_SLAB', 'RED_SANDSTONE_SLAB', 'PRISMARINE_SLAB', 'POLISHED_ANDESITE_SLAB',
    'POLISHED_GRANITE_SLAB', 'POLISHED_DIORITE_SLAB', 'CUT_COPPER_SLAB', 'TERRAZZO_SLAB', 'CONCRETE_SLAB',
    'DARK_OAK_FENCE', 'CHERRY_FENCE', 'ACACIA_FENCE', 'BAMBOO_FENCE',
    'BRICK_WALL', 'SANDSTONE_WALL', 'DEEPSLATE_WALL', 'BLACKSTONE_WALL', 'MUD_BRICK_WALL', 'RED_SANDSTONE_WALL', 'MOSSY_STONE_WALL',
    // dimensions (dimensions.js)
    'NETHER_PORTAL', 'END_PORTAL', 'DEEP_PORTAL', 'REINFORCED_DEEPSLATE', 'ENDER_FRAME', 'CRYING_OBSIDIAN', 'SOUL_SAND',
    'CRIMSON_NYLIUM', 'WARPED_NYLIUM', 'CRIMSON_STEM', 'WARPED_STEM', 'NETHER_WART_BLOCK', 'WARPED_WART_BLOCK',
    'CRIMSON_FUNGUS', 'WARPED_FUNGUS', 'CRIMSON_ROOTS', 'WARPED_ROOTS', 'NETHER_QUARTZ_ORE', 'NETHER_GOLD_ORE',
    'NETHER_BRICK_FENCE', 'SOUL_LANTERN', 'SOUL_TORCH', 'END_ROD', 'CHORUS_PLANT', 'CHORUS_FLOWER', 'END_CRYSTAL',
    'PURPUR_PILLAR', 'END_STONE_BRICKS', 'SCULK', 'SCULK_SENSOR', 'SCULK_SHRIEKER', 'SCULK_CATALYST', 'GLOW_LICHEN',
    'CRIMSON_PLANKS', 'WARPED_PLANKS',
  ].forEach((k) => n(k));
  B.EXTRA_END = id;
  B.SHAPE1 = 1400;   // shapes of the extra materials start here
}

const SUP_BAMBOO = 9;
const CONCRETE_COLORS = WOOL_COLORS;

// ---- woods ----
defBlock(B.DARK_OAK_LOG, 'Dark Oak Log', RT_CUBE, ['dark_oak_top', 'dark_oak_top', 'dark_oak_side'], WOOD);
defBlock(B.DARK_OAK_PLANKS, 'Dark Oak Planks', RT_CUBE, 'dark_oak_planks', WOOD);
defBlock(B.DARK_OAK_LEAVES, 'Dark Oak Leaves', RT_CUTOUT, 'dark_oak_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.CHERRY_LOG, 'Cherry Log', RT_CUBE, ['cherry_top', 'cherry_top', 'cherry_side'], WOOD);
defBlock(B.CHERRY_PLANKS, 'Cherry Planks', RT_CUBE, 'cherry_planks', WOOD);
defBlock(B.CHERRY_LEAVES, 'Cherry Blossom', RT_CUTOUT, 'cherry_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.ACACIA_LOG, 'Acacia Log', RT_CUBE, ['acacia_top', 'acacia_top', 'acacia_side'], WOOD);
defBlock(B.ACACIA_PLANKS, 'Acacia Planks', RT_CUBE, 'acacia_planks', WOOD);
defBlock(B.ACACIA_LEAVES, 'Acacia Leaves', RT_CUTOUT, 'acacia_leaves', with_(LEAF, { flags: FLAG_WAVE_LEAVES | FLAG_TRANSLUCENT }));
defBlock(B.BAMBOO_PLANKS, 'Bamboo Planks', RT_CUBE, 'bamboo_planks', WOOD);
defBlock(B.CHERRY_SAPLING, 'Cherry Sapling', RT_CROSS, 'cherry_sapling', PLANT);
defBlock(B.DARK_OAK_SAPLING, 'Dark Oak Sapling', RT_CROSS, 'dark_oak_sapling', PLANT);
defBlock(B.ACACIA_SAPLING, 'Acacia Sapling', RT_CROSS, 'acacia_sapling', PLANT);

// ---- stones ----
const XR = (o) => with_(ROCK, o || {});
defBlock(B.POLISHED_GRANITE, 'Polished Granite', RT_CUBE, 'polished_granite', ROCK);
defBlock(B.POLISHED_DIORITE, 'Polished Diorite', RT_CUBE, 'polished_diorite', ROCK);
defBlock(B.POLISHED_ANDESITE, 'Polished Andesite', RT_CUBE, 'polished_andesite', ROCK);
defBlock(B.DEEPSLATE, 'Deepslate', RT_CUBE, ['deepslate_top', 'deepslate_top', 'deepslate'], XR({ hard: 3, cat: 'nature' }));
defBlock(B.COBBLED_DEEPSLATE, 'Cobbled Deepslate', RT_CUBE, 'cobbled_deepslate', XR({ hard: 3.5 }));
defBlock(B.DEEPSLATE_BRICKS, 'Deepslate Bricks', RT_CUBE, 'deepslate_bricks', XR({ hard: 3.5 }));
defBlock(B.DEEPSLATE_TILES, 'Deepslate Tiles', RT_CUBE, 'deepslate_tiles', XR({ hard: 3.5 }));
defBlock(B.CALCITE, 'Calcite', RT_CUBE, 'calcite', XR({ hard: 0.8, cat: 'nature' }));
defBlock(B.TUFF, 'Tuff', RT_CUBE, 'tuff', XR({ cat: 'nature' }));
defBlock(B.BLACKSTONE, 'Blackstone', RT_CUBE, ['blackstone_top', 'blackstone_top', 'blackstone'], XR({ cat: 'nature' }));
defBlock(B.POLISHED_BLACKSTONE, 'Polished Blackstone', RT_CUBE, 'polished_blackstone', XR({ hard: 2 }));
defBlock(B.BLACKSTONE_BRICKS, 'Blackstone Bricks', RT_CUBE, 'blackstone_bricks', XR({ hard: 2 }));
defBlock(B.CHISELED_STONE_BRICKS, 'Chiseled Stone Bricks', RT_CUBE, 'chiseled_stone_bricks', ROCK);
defBlock(B.CRACKED_STONE_BRICKS, 'Cracked Stone Bricks', RT_CUBE, 'cracked_stone_bricks', ROCK);
defBlock(B.MOSSY_STONE_BRICKS, 'Mossy Stone Bricks', RT_CUBE, 'mossy_stone_bricks', ROCK);
defBlock(B.RED_SANDSTONE, 'Red Sandstone', RT_CUBE, ['red_sandstone_top', 'red_sandstone_top', 'red_sandstone'], XR({ hard: 0.8 }));
defBlock(B.CUT_SANDSTONE, 'Cut Sandstone', RT_CUBE, ['sandstone_top', 'sandstone_top', 'cut_sandstone'], XR({ hard: 0.8 }));
defBlock(B.CHISELED_SANDSTONE, 'Chiseled Sandstone', RT_CUBE, ['sandstone_top', 'sandstone_top', 'chiseled_sandstone'], XR({ hard: 0.8 }));
defBlock(B.MUD_BRICKS, 'Mud Bricks', RT_CUBE, 'mud_bricks', XR({ hard: 1.5 }));
defBlock(B.PACKED_MUD, 'Packed Mud', RT_CUBE, 'packed_mud', { hard: 1, tool: TOOL_PICK, snd: SND.DIRT, cat: 'building' });
defBlock(B.QUARTZ_BLOCK, 'Block of Quartz', RT_CUBE, 'quartz', XR({ hard: 0.8 }));
defBlock(B.QUARTZ_PILLAR, 'Quartz Pillar', RT_CUBE, ['quartz_pillar_top', 'quartz_pillar_top', 'quartz_pillar'], XR({ hard: 0.8 }));
defBlock(B.QUARTZ_BRICKS, 'Quartz Bricks', RT_CUBE, 'quartz_bricks', XR({ hard: 0.8 }));
defBlock(B.PRISMARINE, 'Prismarine', RT_CUBE, 'prismarine', ROCK);
defBlock(B.PRISMARINE_BRICKS, 'Prismarine Bricks', RT_CUBE, 'prismarine_bricks', ROCK);
defBlock(B.DARK_PRISMARINE, 'Dark Prismarine', RT_CUBE, 'dark_prismarine', ROCK);
defBlock(B.NETHERRACK, 'Netherrack', RT_CUBE, 'netherrack', XR({ hard: 0.4, cat: 'nature' }));
defBlock(B.NETHER_BRICKS, 'Nether Bricks', RT_CUBE, 'nether_bricks', XR({ hard: 2 }));
defBlock(B.END_STONE, 'End Stone', RT_CUBE, 'end_stone', XR({ hard: 3, cat: 'nature' }));
defBlock(B.PURPUR, 'Purpur Block', RT_CUBE, 'purpur', XR({ hard: 1.5 }));

// ---- floors and tiles ----
const TILE_OPT = XR({ hard: 1.2, cat: 'architecture' });
defBlock(B.PANOT, 'Panot (Barcelona Pavement)', RT_CUBE, { top: 'panot', side: 'panot_side' }, TILE_OPT);
defBlock(B.HYDRAULIC_TILE, 'Hydraulic Tile', RT_CUBE, { top: 'hydraulic_tile', side: 'tile_side' }, TILE_OPT);
defBlock(B.CHECKER_TILE, 'Checkered Tile', RT_CUBE, { top: 'checker_tile', side: 'tile_side' }, TILE_OPT);
defBlock(B.PARQUET, 'Parquet', RT_CUBE, { top: 'parquet', side: 'dark_oak_planks' }, with_(WOOD, { cat: 'architecture' }));
defBlock(B.TERRAZZO, 'Terrazzo', RT_CUBE, 'terrazzo', TILE_OPT);
defBlock(B.BLUE_TILES, 'Blue Ceramic Tiles', RT_CUBE, 'blue_tiles', TILE_OPT);
CONCRETE_COLORS.forEach(([name], i) => defBlock(B.CONCRETE + i, name + ' Concrete', RT_CUBE, 'concrete_' + i, XR({ hard: 1.8, cat: 'building' })));

// ---- metals and crystals ----
const METAL = XR({ hard: 3, tier: 1, snd: SND.METAL });
defBlock(B.COPPER_BLOCK, 'Block of Copper', RT_CUBE, 'copper_0', METAL);
defBlock(B.EXPOSED_COPPER, 'Exposed Copper', RT_CUBE, 'copper_1', METAL);
defBlock(B.WEATHERED_COPPER, 'Weathered Copper', RT_CUBE, 'copper_2', METAL);
defBlock(B.OXIDIZED_COPPER, 'Oxidized Copper', RT_CUBE, 'copper_3', METAL);
defBlock(B.CUT_COPPER, 'Cut Copper', RT_CUBE, 'cut_copper', METAL);
defBlock(B.AMETHYST_BLOCK, 'Block of Amethyst', RT_CUBE, 'amethyst', XR({ hard: 1.5, snd: SND.GLASS }));
defBlock(B.STEEL_PLATE, 'Steel Tread Plate', RT_CUBE, 'steel_plate', with_(METAL, { hard: 5, tier: 2, cat: 'architecture' }));

// ---- light ----
defBlock(B.SEA_LANTERN, 'Sea Lantern', RT_CUBE, 'sea_lantern', { emit: 15, hard: 0.3, snd: SND.GLASS, cat: 'functional' });
defBlock(B.SHROOMLIGHT, 'Shroomlight', RT_CUBE, 'shroomlight', { emit: 15, hard: 1, tool: TOOL_HOE, snd: SND.WOOD, cat: 'functional' });
defBlock(B.GLASS_LAMP, 'Glass Lamp', RT_CUBE, 'glass_lamp', { emit: 15, hard: 0.3, snd: SND.GLASS, cat: 'functional' });
defBlock(B.PAPER_LANTERN, 'Paper Lantern', RT_CUBE, { top: 'paper_lantern_top', side: 'paper_lantern' }, { emit: 13, hard: 0.3, snd: SND.WOOL, cat: 'functional' });
defBlock(B.AMETHYST_CLUSTER, 'Amethyst Cluster', RT_CROSS, 'amethyst_cluster', { emit: 5, atten: 0, hard: 1.5, tool: TOOL_PICK, snd: SND.GLASS, flags: FLAG_TRANSLUCENT, support: SUP_SOLID, solid: false, cat: 'nature' });

// ---- nature ----
defBlock(B.MOSS_BLOCK, 'Moss Block', RT_CUBE, 'moss', { hard: 0.2, tool: TOOL_HOE, snd: SND.GRASS, cat: 'nature' });
defBlock(B.MUD, 'Mud', RT_CUBE, 'mud', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.DIRT, cat: 'nature' });
defBlock(B.PODZOL, 'Podzol', RT_CUBE, ['podzol_top', 'dirt', 'podzol_side'], { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.DIRT, cat: 'nature' });
defBlock(B.COARSE_DIRT, 'Coarse Dirt', RT_CUBE, 'coarse_dirt', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.GRAVEL, cat: 'nature' });
defBlock(B.SUNFLOWER, 'Sunflower', RT_CROSS, 'sunflower', PLANT);
defBlock(B.LAVENDER, 'Lavender', RT_CROSS, 'lavender', PLANT);
defBlock(B.LILY_OF_VALLEY, 'Lily of the Valley', RT_CROSS, 'lily_of_valley', PLANT);
defBlock(B.CORNFLOWER, 'Cornflower', RT_CROSS, 'cornflower', PLANT);
defBlock(B.ALLIUM, 'Allium', RT_CROSS, 'allium', PLANT);
defBlock(B.DAISY, 'Daisy', RT_CROSS, 'daisy', PLANT);
defBlock(B.PINK_TULIP, 'Pink Tulip', RT_CROSS, 'pink_tulip', PLANT);
defBlock(B.BUSH, 'Bush', RT_CROSS, 'bush', with_(PLANT, { tint: TINT_FOLIAGE, replace: true }));
defBlock(B.BAMBOO, 'Bamboo', RT_CROSS, 'bamboo', with_(PLANT, { flags: FLAG_TRANSLUCENT, support: SUP_BAMBOO, hard: 0.5, tool: TOOL_AXE, snd: SND.WOOD }));
defBlock(B.HYDRANGEA, 'Hydrangea', RT_CROSS, 'hydrangea', PLANT);

// ---- furniture and school ----
defBlock(B.CRATE, 'Wooden Crate', RT_CUBE, 'crate', with_(WOOD, { cat: 'functional' }));
defBlock(B.SPONGE, 'Sponge', RT_CUBE, 'sponge', { hard: 0.6, snd: SND.WOOL, cat: 'building' });
defBlock(B.HONEYCOMB, 'Honeycomb Block', RT_CUBE, 'honeycomb', { hard: 0.6, snd: SND.WOOL, cat: 'building' });
defBlock(B.CHALKBOARD, 'Chalkboard', RT_CUBE, { top: 'dark_oak_planks', side: 'dark_oak_planks', front: 'chalkboard' }, with_(WOOD, { cat: 'functional' }));
defBlock(B.WHITEBOARD, 'Whiteboard', RT_CUBE, { top: 'smooth_stone', side: 'smooth_stone', front: 'whiteboard' }, { hard: 1, tool: TOOL_PICK, snd: SND.METAL, cat: 'functional' });
defBlock(B.CORKBOARD, 'Notice Board', RT_CUBE, { top: 'planks', side: 'planks', front: 'corkboard' }, with_(WOOD, { cat: 'functional' }));
for (const id of [B.CHALKBOARD, B.WHITEBOARD, B.CORKBOARD]) FACING_BLOCKS.add(id);

// ---- slabs (placing one on the same slab makes the full block) ----
[
  [B.DARK_OAK_SLAB, 'Dark Oak Slab', 'dark_oak_planks', B.DARK_OAK_PLANKS, WOOD],
  [B.CHERRY_SLAB, 'Cherry Slab', 'cherry_planks', B.CHERRY_PLANKS, WOOD],
  [B.ACACIA_SLAB, 'Acacia Slab', 'acacia_planks', B.ACACIA_PLANKS, WOOD],
  [B.BAMBOO_SLAB, 'Bamboo Slab', 'bamboo_planks', B.BAMBOO_PLANKS, WOOD],
  [B.QUARTZ_SLAB, 'Quartz Slab', 'quartz', B.QUARTZ_BLOCK, XR({ hard: 0.8 })],
  [B.DEEPSLATE_BRICK_SLAB, 'Deepslate Brick Slab', 'deepslate_bricks', B.DEEPSLATE_BRICKS, XR({ hard: 3.5 })],
  [B.BLACKSTONE_SLAB, 'Polished Blackstone Slab', 'polished_blackstone', B.POLISHED_BLACKSTONE, XR({ hard: 2 })],
  [B.MUD_BRICK_SLAB, 'Mud Brick Slab', 'mud_bricks', B.MUD_BRICKS, XR({ hard: 1.5 })],
  [B.RED_SANDSTONE_SLAB, 'Red Sandstone Slab', ['red_sandstone_top', 'red_sandstone_top', 'red_sandstone'], B.RED_SANDSTONE, XR({ hard: 0.8 })],
  [B.PRISMARINE_SLAB, 'Prismarine Brick Slab', 'prismarine_bricks', B.PRISMARINE_BRICKS, ROCK],
  [B.POLISHED_ANDESITE_SLAB, 'Polished Andesite Slab', 'polished_andesite', B.POLISHED_ANDESITE, ROCK],
  [B.POLISHED_GRANITE_SLAB, 'Polished Granite Slab', 'polished_granite', B.POLISHED_GRANITE, ROCK],
  [B.POLISHED_DIORITE_SLAB, 'Polished Diorite Slab', 'polished_diorite', B.POLISHED_DIORITE, ROCK],
  [B.CUT_COPPER_SLAB, 'Cut Copper Slab', 'cut_copper', B.CUT_COPPER, METAL],
  [B.TERRAZZO_SLAB, 'Terrazzo Slab', 'terrazzo', B.TERRAZZO, TILE_OPT],
  [B.CONCRETE_SLAB, 'White Concrete Slab', 'concrete_0', B.CONCRETE, XR({ hard: 1.8 })],
].forEach(([id, name, tex, full, o]) => {
  defBlock(id, name, RT_SLAB, tex, with_(o, { cat: 'building' }));
  SLAB_FULL[id] = full;
});

// ---- fences and walls ----
defConnect(B.DARK_OAK_FENCE, 'Dark Oak Fence', CN_FENCE, 'dark_oak_planks', WOOD);
defConnect(B.CHERRY_FENCE, 'Cherry Fence', CN_FENCE, 'cherry_planks', WOOD);
defConnect(B.ACACIA_FENCE, 'Acacia Fence', CN_FENCE, 'acacia_planks', WOOD);
defConnect(B.BAMBOO_FENCE, 'Bamboo Fence', CN_FENCE, 'bamboo_planks', WOOD);
defConnect(B.BRICK_WALL, 'Brick Wall', CN_WALL, 'bricks', XR({ hard: 2 }));
defConnect(B.SANDSTONE_WALL, 'Sandstone Wall', CN_WALL, 'sandstone_side', XR({ hard: 0.8 }));
defConnect(B.DEEPSLATE_WALL, 'Deepslate Brick Wall', CN_WALL, 'deepslate_bricks', XR({ hard: 3.5 }));
defConnect(B.BLACKSTONE_WALL, 'Blackstone Wall', CN_WALL, 'polished_blackstone', XR({ hard: 2 }));
defConnect(B.MUD_BRICK_WALL, 'Mud Brick Wall', CN_WALL, 'mud_bricks', XR({ hard: 1.5 }));
defConnect(B.RED_SANDSTONE_WALL, 'Red Sandstone Wall', CN_WALL, 'red_sandstone', XR({ hard: 0.8 }));
defConnect(B.MOSSY_STONE_WALL, 'Mossy Stone Brick Wall', CN_WALL, 'mossy_stone_bricks', ROCK);

// ---- architecture shapes for the new materials (ids from B.SHAPE1; append materials only) ----
{
  const mats = [
    { key: 'dark_oak', name: 'Dark Oak', tex: 'dark_oak_planks', src: B.DARK_OAK_PLANKS, o: WOOD, pillar: true },
    { key: 'cherry', name: 'Cherry', tex: 'cherry_planks', src: B.CHERRY_PLANKS, o: WOOD, pillar: true },
    { key: 'acacia', name: 'Acacia', tex: 'acacia_planks', src: B.ACACIA_PLANKS, o: WOOD, pillar: true },
    { key: 'bamboo', name: 'Bamboo', tex: 'bamboo_planks', src: B.BAMBOO_PLANKS, o: WOOD, pillar: false },
    { key: 'quartz', name: 'Quartz', tex: 'quartz', src: B.QUARTZ_BLOCK, o: XR({ hard: 0.8 }), pillar: true },
    { key: 'deepslate', name: 'Deepslate Brick', tex: 'deepslate_bricks', src: B.DEEPSLATE_BRICKS, o: XR({ hard: 3.5 }), pillar: true },
    { key: 'blackstone', name: 'Polished Blackstone', tex: 'polished_blackstone', src: B.POLISHED_BLACKSTONE, o: XR({ hard: 2 }), pillar: true },
    { key: 'mud_brick', name: 'Mud Brick', tex: 'mud_bricks', src: B.MUD_BRICKS, o: XR({ hard: 1.5 }), pillar: true },
    { key: 'red_sandstone', name: 'Red Sandstone', tex: ['red_sandstone_top', 'red_sandstone_top', 'red_sandstone'], src: B.RED_SANDSTONE, o: XR({ hard: 0.8 }), pillar: true },
    { key: 'prismarine', name: 'Prismarine Brick', tex: 'prismarine_bricks', src: B.PRISMARINE_BRICKS, o: ROCK, pillar: false },
    { key: 'andesite', name: 'Polished Andesite', tex: 'polished_andesite', src: B.POLISHED_ANDESITE, o: ROCK, pillar: true },
    { key: 'copper', name: 'Copper', tex: 'cut_copper', src: B.CUT_COPPER, o: METAL, pillar: false },
    { key: 'oxidized', name: 'Oxidized Copper', tex: 'copper_3', src: B.OXIDIZED_COPPER, o: METAL, pillar: false },
    { key: 'concrete', name: 'White Concrete', tex: 'concrete_0', src: B.CONCRETE, o: XR({ hard: 1.8 }), pillar: true },
    { key: 'grey_concrete', name: 'Grey Concrete', tex: 'concrete_7', src: B.CONCRETE + 7, o: XR({ hard: 1.8 }), pillar: true },
    { key: 'terrazzo', name: 'Terrazzo', tex: 'terrazzo', src: B.TERRAZZO, o: TILE_OPT, pillar: true },
  ];
  let id = B.SHAPE1;
  for (const m of mats) {
    const mi = ARCH_MATS.length;
    ARCH_MATS.push(m);
    for (const s of SHAPE_KINDS) {
      if (s.pillarOnly && !m.pillar) continue;
      defBlock(id, m.name + ' ' + s.name, RT_SHAPE, m.tex, Object.assign({}, m.o, { atten: s.atten, solid: true, cat: 'architecture' }));
      BLOCK_SHAPE[id] = s.kind;
      BLOCK_SHAPE_MAT[id] = mi;
      BLOCK_HEIGHT[id] = 16;
      SHAPE_OF[m.key + ':' + s.key] = id;
      FACING_BLOCKS.add(id);
      id++;
    }
  }
  B.SHAPE1_END = id;
}

// ---- dimension blocks ----
// portals: thin glowing sheets you walk into (no collision, cannot be picked or mined)
const SH_PORTAL = 9, SH_END_PORTAL = 10;
SHAPE_CANON[SH_PORTAL] = { boxes: [[0, 0, 6, 16, 16, 10]], coll: [] };
SHAPE_CANON[SH_END_PORTAL] = { boxes: [[0, 0, 0, 16, 12, 16]], coll: [] };
const PORTAL_OPT = { emit: 11, atten: 0, hard: -1, blast: 1e9, snd: SND.GLASS, solid: false, cat: null };
defBlock(B.NETHER_PORTAL, 'Nether Portal', RT_SHAPE, 'nether_portal', PORTAL_OPT);
defBlock(B.END_PORTAL, 'End Portal', RT_SHAPE, 'end_portal', with_(PORTAL_OPT, { emit: 12 }));
defBlock(B.DEEP_PORTAL, 'Deep Dark Portal', RT_SHAPE, 'deep_portal', with_(PORTAL_OPT, { emit: 9 }));
BLOCK_SHAPE[B.NETHER_PORTAL] = SH_PORTAL; BLOCK_SHAPE[B.DEEP_PORTAL] = SH_PORTAL; BLOCK_SHAPE[B.END_PORTAL] = SH_END_PORTAL;
for (const id of [B.NETHER_PORTAL, B.DEEP_PORTAL, B.END_PORTAL]) { FACING_BLOCKS.add(id); BLOCK_HEIGHT[id] = 0; }
const IS_PORTAL = (id) => id === B.NETHER_PORTAL || id === B.END_PORTAL || id === B.DEEP_PORTAL;
defBlock(B.REINFORCED_DEEPSLATE, 'Reinforced Deepslate', RT_CUBE, ['reinforced_top', 'reinforced_top', 'reinforced_side'], XR({ hard: 30, tier: 3, blast: 1200, cat: 'functional' }));
defBlock(B.ENDER_FRAME, 'Ender Frame', RT_CUBE, { top: 'ender_frame_top', bottom: 'end_stone', side: 'ender_frame_side' }, XR({ hard: 30, tier: 3, blast: 1200, emit: 4, cat: 'functional' }));
defBlock(B.CRYING_OBSIDIAN, 'Crying Obsidian', RT_CUBE, 'crying_obsidian', XR({ hard: 50, tier: 4, blast: 1200, emit: 10 }));
defBlock(B.SOUL_SAND, 'Soul Sand', RT_CUBE, 'soul_sand', { hard: 0.5, tool: TOOL_SHOVEL, snd: SND.SAND, cat: 'nature' });
defBlock(B.CRIMSON_NYLIUM, 'Crimson Nylium', RT_CUBE, ['crimson_nylium', 'netherrack', 'crimson_nylium_side'], XR({ hard: 0.4, cat: 'nature' }));
defBlock(B.WARPED_NYLIUM, 'Warped Nylium', RT_CUBE, ['warped_nylium', 'netherrack', 'warped_nylium_side'], XR({ hard: 0.4, cat: 'nature' }));
defBlock(B.CRIMSON_STEM, 'Crimson Stem', RT_CUBE, ['crimson_stem_top', 'crimson_stem_top', 'crimson_stem'], WOOD);
defBlock(B.WARPED_STEM, 'Warped Stem', RT_CUBE, ['warped_stem_top', 'warped_stem_top', 'warped_stem'], WOOD);
defBlock(B.NETHER_WART_BLOCK, 'Nether Wart Block', RT_CUBE, 'nether_wart_block', { hard: 1, tool: TOOL_HOE, snd: SND.WOOL, cat: 'nature' });
defBlock(B.WARPED_WART_BLOCK, 'Warped Wart Block', RT_CUBE, 'warped_wart_block', { hard: 1, tool: TOOL_HOE, snd: SND.WOOL, cat: 'nature' });
const NETHER_PLANT = with_(PLANT, { support: SUP_SOLID, flags: FLAG_TRANSLUCENT });
defBlock(B.CRIMSON_FUNGUS, 'Crimson Fungus', RT_CROSS, 'crimson_fungus', NETHER_PLANT);
defBlock(B.WARPED_FUNGUS, 'Warped Fungus', RT_CROSS, 'warped_fungus', NETHER_PLANT);
defBlock(B.CRIMSON_ROOTS, 'Crimson Roots', RT_CROSS, 'crimson_roots', with_(NETHER_PLANT, { replace: true }));
defBlock(B.WARPED_ROOTS, 'Warped Roots', RT_CROSS, 'warped_roots', with_(NETHER_PLANT, { replace: true }));
defBlock(B.NETHER_QUARTZ_ORE, 'Nether Quartz Ore', RT_CUBE, 'nether_quartz_ore', XR({ hard: 3, cat: 'nature' }));
defBlock(B.NETHER_GOLD_ORE, 'Nether Gold Ore', RT_CUBE, 'nether_gold_ore', XR({ hard: 3, cat: 'nature' }));
defConnect(B.NETHER_BRICK_FENCE, 'Nether Brick Fence', CN_FENCE, 'nether_bricks', XR({ hard: 2 }));
defBlock(B.SOUL_LANTERN, 'Soul Lantern', RT_LANTERN, { top: 'lantern_top', side: 'soul_lantern' }, { emit: 10, atten: 0, hard: 0.5, tool: TOOL_PICK, snd: SND.METAL, solid: false, cat: 'functional' });
BLOCK_SOLID[B.SOUL_LANTERN] = 1; BLOCK_HEIGHT[B.SOUL_LANTERN] = 9; FACING_BLOCKS.add(B.SOUL_LANTERN);
defBlock(B.SOUL_TORCH, 'Soul Torch', RT_TORCH, 'soul_torch', { emit: 10, atten: 0, hard: 0, snd: SND.WOOD, support: SUP_FLOOR, cat: 'functional' });
defBlock(B.END_ROD, 'End Rod', RT_TORCH, 'end_rod', { emit: 14, atten: 0, hard: 0, snd: SND.GLASS, support: SUP_FLOOR, cat: 'functional' });
defBlock(B.CHORUS_PLANT, 'Chorus Plant', RT_CUTOUT, 'chorus_plant', { atten: 1, hard: 0.4, tool: TOOL_AXE, snd: SND.WOOD, cat: 'nature' });
defBlock(B.CHORUS_FLOWER, 'Chorus Flower', RT_CUTOUT, 'chorus_flower', { atten: 1, hard: 0.4, tool: TOOL_AXE, snd: SND.WOOD, emit: 3, cat: 'nature' });
defBlock(B.END_CRYSTAL, 'End Crystal', RT_CUBE, 'end_crystal', { emit: 15, hard: 0.5, snd: SND.GLASS, cat: 'functional' });
defBlock(B.PURPUR_PILLAR, 'Purpur Pillar', RT_CUBE, ['purpur_pillar_top', 'purpur_pillar_top', 'purpur_pillar'], XR({ hard: 1.5 }));
defBlock(B.END_STONE_BRICKS, 'End Stone Bricks', RT_CUBE, 'end_stone_bricks', XR({ hard: 3 }));
defBlock(B.SCULK, 'Sculk', RT_CUBE, 'sculk', { hard: 0.6, tool: TOOL_HOE, snd: SND.WOOL, emit: 2, cat: 'nature' });
defBlock(B.SCULK_SENSOR, 'Sculk Sensor', RT_CUBE, { top: 'sculk_sensor_top', bottom: 'sculk', side: 'sculk_sensor_side' }, { hard: 1.5, tool: TOOL_HOE, snd: SND.WOOL, emit: 4, cat: 'nature' });
defBlock(B.SCULK_SHRIEKER, 'Sculk Shrieker', RT_CUBE, { top: 'sculk_shrieker_top', bottom: 'sculk', side: 'sculk_shrieker_side' }, { hard: 3, tool: TOOL_HOE, snd: SND.WOOL, emit: 3, cat: 'nature' });
defBlock(B.SCULK_CATALYST, 'Sculk Catalyst', RT_CUBE, { top: 'sculk_catalyst_top', bottom: 'sculk', side: 'sculk_catalyst_side' }, { hard: 3, tool: TOOL_HOE, snd: SND.WOOL, emit: 6, cat: 'nature' });
defBlock(B.GLOW_LICHEN, 'Glow Lichen', RT_CROSS, 'glow_lichen', with_(PLANT, { emit: 7, support: SUP_SOLID, flags: FLAG_TRANSLUCENT, replace: true }));
defBlock(B.CRIMSON_PLANKS, 'Crimson Planks', RT_CUBE, 'crimson_planks', WOOD);
defBlock(B.WARPED_PLANKS, 'Warped Planks', RT_CUBE, 'warped_planks', WOOD);
SOIL.add(B.SOUL_SAND);

LOGS.push(B.DARK_OAK_LOG, B.CHERRY_LOG, B.ACACIA_LOG);
PLANKS_ALL.push(B.DARK_OAK_PLANKS, B.CHERRY_PLANKS, B.ACACIA_PLANKS, B.BAMBOO_PLANKS, B.CRIMSON_PLANKS, B.WARPED_PLANKS);
for (const id of [B.PODZOL, B.COARSE_DIRT, B.MOSS_BLOCK, B.MUD]) SOIL.add(id);
