'use strict';
// Enchantments and potions.
// Enchantments live on item stacks as `ench` ({ key: level }). The Enchanting Table turns
// emeralds into one of three offers (stronger with bookshelves around it), enchants books, and
// applies enchanted books to tools, weapons and armour. Potions are brewed from water bottles on
// a Brewing Stand; drinking one gives a timed effect (G.stats.effects), shown on the HUD.

Object.assign(I, { GLASS_BOTTLE: 355, WATER_BOTTLE: 356, POTION0: 360 });

const ENCHANTS = {
  sharpness: { name: 'Sharpness', max: 5, on: ['sword', 'axe'] },
  knockback: { name: 'Knockback', max: 2, on: ['sword'] },
  fire_aspect: { name: 'Fire Aspect', max: 2, on: ['sword'] },
  looting: { name: 'Looting', max: 3, on: ['sword'] },
  efficiency: { name: 'Efficiency', max: 5, on: ['pickaxe', 'axe', 'shovel', 'hoe', 'shears'] },
  fortune: { name: 'Fortune', max: 3, on: ['pickaxe', 'shovel'] },
  power: { name: 'Power', max: 5, on: ['bow'] },
  protection: { name: 'Protection', max: 4, on: ['helmet', 'chest', 'legs', 'boots'] },
  feather_falling: { name: 'Feather Falling', max: 4, on: ['boots'] },
  respiration: { name: 'Respiration', max: 3, on: ['helmet'] },
  unbreaking: { name: 'Unbreaking', max: 3, on: ['sword', 'axe', 'pickaxe', 'shovel', 'hoe', 'shears', 'bow', 'helmet', 'chest', 'legs', 'boots'] },
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

// What kind of thing an item is for enchanting ('sword', 'boots', 'book'...), or null.
function enchKind(id) {
  const d = ITEM_DEF[id];
  if (!d) return null;
  if (id === I.BOOK || id === I.ENCHANTED_BOOK) return 'book';
  if (id === I.BOW) return 'bow';
  if (id === I.SHEARS) return 'shears';
  if (d.toolKind) return d.toolKind;
  if (d.armor) return ARMOR_SLOTS[d.armor.slot].key;
  return null;
}
function enchLevel(stack, key) { return stack && stack.ench && stack.ench[key] ? stack.ench[key] : 0; }
function heldEnch(key) { return enchLevel(G.inv.held, key); }
function armorEnch(key) { let n = 0; for (const a of G.inv.armor) n += enchLevel(a, key); return n; }
function enchText(stack) {
  if (!stack || !stack.ench) return '';
  return Object.entries(stack.ench).filter(([k]) => ENCHANTS[k]).map(([k, l]) => ENCHANTS[k].name + ' ' + ROMAN[l]).join(', ');
}
function validEnch(e) {
  if (!e || typeof e !== 'object') return null;
  const out = {};
  for (const [k, l] of Object.entries(e)) if (ENCHANTS[k] && Number.isInteger(l) && l >= 1) out[k] = Math.min(l, ENCHANTS[k].max);
  return Object.keys(out).length ? out : null;
}
function randomBookEnch(rng) {
  const keys = Object.keys(ENCHANTS);
  const k = keys[Math.floor(rng() * keys.length)];
  return { [k]: 1 + Math.floor(rng() * ENCHANTS[k].max) };
}

// Three offers for an item at a table with `shelves` bookshelves around it.
function enchantOffers(id, shelves, seed) {
  const kind = enchKind(id);
  if (!kind) return [];
  const keys = Object.keys(ENCHANTS).filter((k) => kind === 'book' || ENCHANTS[k].on.includes(kind));
  if (!keys.length) return [];
  const rng = mulberry32((seed ^ Math.imul(id, 2654435761)) | 0);
  const out = [];
  for (let i = 0; i < 3; i++) {
    const pool = keys.filter((q) => !out.some((o) => o.ench[q]));
    const from = pool.length ? pool : keys;
    const k = from[Math.floor(rng() * from.length)];
    const max = ENCHANTS[k].max;
    const lvl = clamp(Math.round((i + 1) / 3 * max * (0.45 + 0.55 * Math.min(1, shelves / 15)) + rng() * 0.6), 1, max);
    const ench = { [k]: lvl };
    // the top offer can bring a second enchantment with a well-stocked library
    if (i === 2 && shelves >= 10 && keys.length > 1) {
      const k2 = keys.filter((q) => q !== k)[Math.floor(rng() * (keys.length - 1))];
      ench[k2] = clamp(Math.ceil(ENCHANTS[k2].max / 2), 1, ENCHANTS[k2].max);
    }
    out.push({ ench, cost: 1 + i * 2 + lvl * 2 + (Object.keys(ench).length > 1 ? 3 : 0) });
  }
  return out;
}
function countShelves(x, y, z) {
  let n = 0;
  for (let dy = 0; dy <= 1; dy++) for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== 2) continue;
    if (G.world.getBlock(x + dx, y + dy, z + dz) === B.BOOKSHELF) n++;
  }
  return n;
}

// ---- potions ----
const POTIONS = [
  { key: 'healing', name: 'Healing', color: [236, 60, 70], from: I.MELON_SLICE, time: 0 },
  { key: 'regeneration', name: 'Regeneration', color: [230, 110, 190], from: I.GOLD_INGOT, time: 45 },
  { key: 'speed', name: 'Swiftness', color: [120, 200, 240], from: B.SUGAR_CANE, time: 180 },
  { key: 'jump', name: 'Leaping', color: [110, 240, 110], from: I.FEATHER, time: 180 },
  { key: 'strength', name: 'Strength', color: [170, 40, 40], from: I.IRON_INGOT, time: 180 },
  { key: 'fire_res', name: 'Fire Resistance', color: [240, 150, 40], from: B.MAGMA, time: 180 },
  { key: 'water_breathing', name: 'Water Breathing', color: [50, 90, 220], from: I.RAW_FISH, time: 180 },
  { key: 'night_vision', name: 'Night Vision', color: [40, 60, 180], from: B.GLOWSTONE, time: 180 },
];
const EFFECT_ICONS = { regeneration: '❤', speed: '»', jump: '⤒', strength: '⚔', fire_res: '🔥', water_breathing: '≈', night_vision: '👁' };
const POTION_BY_INGREDIENT = {};

defItem(I.GLASS_BOTTLE, 'Glass Bottle', { sprite: 'i_glass_bottle', stack: 16, cat: 'materials' });
defItem(I.WATER_BOTTLE, 'Water Bottle', { sprite: 'i_water_bottle', stack: 1, cat: 'food' });
POTIONS.forEach((p, i) => {
  defItem(I.POTION0 + i, 'Potion of ' + p.name, { sprite: 'i_potion_' + p.key, stack: 1, cat: 'food', potion: p, returns: I.GLASS_BOTTLE });
  POTION_BY_INGREDIENT[p.from] = I.POTION0 + i;
});
shaped(I.GLASS_BOTTLE, 3, ['G G', ' G '], { G: B.GLASS });
shaped(B.ENCHANT_TABLE, 1, [' B ', 'DOD', 'OOO'], { B: I.BOOK, D: I.DIAMOND, O: B.OBSIDIAN });
shaped(B.BREWING_STAND, 1, [' I ', 'CCC'], { I: I.IRON_INGOT, C: B.COBBLE });

function drinkPotion(id) {
  const p = ITEM_DEF[id] && ITEM_DEF[id].potion;
  if (!p) return;
  const st = G.stats;
  if (p.key === 'healing') { st.heal(8); return; }
  if (p.key === 'regeneration') { st.regenEffect = p.time; st.regenEffectT = 0; }
  st.effects[p.key] = Math.max(st.effects[p.key] || 0, p.time);
  G.ui.toast('Potion of ' + p.name + ' · ' + Math.round(p.time / 60) + ' min');
}
function hasEffect(key) { return G.stats && G.stats.effects && G.stats.effects[key] > 0; }

// ---- brewing ----
const BREW_TIME = 12;
const Brewing = {
  update(dt) {
    for (const [key, be] of G.world.blockEntities) {
      if (be.type !== 'brew') continue;
      const ing = be.slots[3];
      const target = ing && POTION_BY_INGREDIENT[ing.id];
      const bottles = [0, 1, 2].filter((i) => be.slots[i] && be.slots[i].id === I.WATER_BOTTLE);
      if (!target || !bottles.length) { be.t = 0; continue; }
      be.t = (be.t || 0) + dt;
      if (be.t >= BREW_TIME) {
        be.t = 0;
        for (const i of bottles) be.slots[i] = mkStack(target, 1);
        ing.count--;
        if (ing.count <= 0) be.slots[3] = null;
        if (G.ui) G.ui.containerChanged(key);
      }
    }
  },
};

// ---- item sprites ----
function drawBottle(d, liquid) {
  sprRect(d, 14, 3, 18, 5, [150, 110, 70]);                      // cork
  sprRect(d, 13, 5, 19, 11, [210, 230, 240]);                    // neck
  sprEllipse(d, 16, 20, 9, 9, 0, [206, 228, 238]);               // glass
  if (liquid) sprEllipse(d, 16, 21.5, 7.4, 7, 0, liquid, (x, y) => y >= 15);
  sprRect(d, 11, 16, 13, 20, [245, 250, 255]);                   // shine
}
sprite('i_glass_bottle', (d) => drawBottle(d, null));
sprite('i_water_bottle', (d) => drawBottle(d, [60, 110, 230]));
POTIONS.forEach((p) => sprite('i_potion_' + p.key, (d, rng, ctx) => {
  drawBottle(d, p.color);
  for (let i = 0; i < 4; i++) { const x = 12 + Math.floor(rng() * 8), y = 17 + Math.floor(rng() * 7); put(d, x, y, [255, 255, 255], 0.9); ctx.emit[y * TS + x] = 0.6; }
}));

gen('enchant_top', (d, rng, ctx) => {
  // red cloth with an open book of glowing script
  fillTile(d, (x, y) => put(d, x, y, [150, 30, 40], 0.85 + rng() * 0.2));
  bevelFrame(d, 0, 0, TM, TM, 0.7, 0.7);
  sprRect(d, 7, 9, 25, 23, [228, 214, 180]);
  sprRect(d, 15, 9, 17, 23, [150, 120, 90]);
  for (let y = 11; y < 22; y += 2) for (const x0 of [9, 18]) for (let x = x0; x < x0 + 5; x++) if (rng() < 0.7) { put(d, x, y, [110, 70, 200]); ctx.emit[y * TS + x] = 0.9; }
}, { smooth: 0.3, bump: 1 });
gen('enchant_side', (d, rng, ctx) => {
  // obsidian block with runes glowing in violet, a red cloth edge on top
  const f = fbm(rng, 4, 2);
  fillTile(d, (x, y, k) => put(d, x, y, [28, 20, 44], 0.8 + f[k] * 0.4));
  sprRect(d, 0, 0, TS, 5, [150, 30, 40]);
  sprRect(d, 0, 5, TS, 6, [226, 190, 80]);
  for (let i = 0; i < 9; i++) {
    const x = 3 + (i % 5) * 6, y = 10 + Math.floor(i / 5) * 9;
    for (let k = 0; k < 4; k++) { const px = x + Math.floor(rng() * 3), py = y + Math.floor(rng() * 5); put(d, px, py, [170, 120, 255]); ctx.emit[py * TS + px] = 1; }
  }
}, { smooth: 0.7, bump: 1.2 });
gen('brewing_stand', (d, rng, ctx) => {
  clearTile(d, [120, 120, 120]);
  sprRect(d, 15, 4, 17, 26, [80, 70, 60]);                       // rod
  sprRect(d, 7, 26, 25, 29, [110, 110, 116]);                    // base
  sprDisc(d, 16, 4, 2, [210, 150, 60]);
  for (const [cx, col] of [[8, [236, 60, 70]], [24, [110, 240, 110]], [16, [120, 200, 240]]]) {
    const cy = cx === 16 ? 19 : 17;
    sprSeg(d, 16, 10, cx, cy - 3, 1, [80, 70, 60]);
    sprDisc(d, cx, cy, 3.2, [210, 228, 238]);
    sprDisc(d, cx, cy + 0.6, 2.3, col);
    ctx.emit[(cy) * TS + cx] = 0.8;
  }
}, { bump: 0, smooth: 0.4 });
