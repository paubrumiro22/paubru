'use strict';
// Furniture: sofas that join into long couches, chairs, tables, a coffee table, a double bed
// (2 x 2 blocks), kitchen cabinets, a sink, a stove, a two-block fridge, a flat TV and a floor
// lamp. Only their looks and hit boxes live here (shared with the workers); sitting, sleeping,
// storage and switching on are in furniture.js.
//
// Canonical frame as the other shapes: the back is at -Z, the front (where you sit, the TV
// screen, the cabinet doors) at +Z; facing 0 1 4 5 = where the back is (the side away from the
// player who placed it). Bit 8 mirrors the piece left-right (the right half of the bed).
// A box may carry a 7th value: one texture layer, or 6 layers in canonical face order
// (+X -X +Y -Y +Z -Z) that furnXf turns into world order.

const SH_SOFA = 28, SH_CHAIR = 29, SH_TABLE = 30, SH_COFFEE = 31, SH_DBED_HEAD = 32, SH_DBED_FOOT = 33;
const SH_COUNTER = 34, SH_SINK = 35, SH_STOVE = 36, SH_FRIDGE = 37, SH_FRIDGE_TOP = 38, SH_TV = 39, SH_LAMP = 40;
const SHAPE_NBF = {};   // (facing, get, id) -> boxes: shapes that depend on facing and neighbours

const FT = {
  oak: defTex('furn_oak'), dark: defTex('furn_dark'), metal: defTex('furn_metal'), black: defTex('furn_black'),
  sheet: defTex('bed_sheet'), blanket: defTex('bed_blanket'), pillow: defTex('bed_pillow'),
  cab: defTex('cabinet_front'), cabSide: defTex('cabinet_side'), worktop: defTex('worktop'),
  stoveFront: defTex('stove_front'), stoveTop: defTex('stove_top'), stoveTopOn: defTex('stove_top_on'),
  fridgeLo: defTex('fridge_front_lo'), fridgeHi: defTex('fridge_front_hi'), fridgeSide: defTex('fridge_side'),
  tvOff: defTex('tv_screen'), tvOn: defTex('tv_screen_on'), shade: defTex('lamp_shade'),
};
const SOFA_COLORS = [['Gray', 'sofa_gray'], ['Red', 'sofa_red'], ['Blue', 'sofa_blue'], ['Green', 'sofa_green'], ['Cream', 'sofa_cream']];
const SOFA_TEX = SOFA_COLORS.map(([, t]) => [defTex(t), defTex(t + '_cushion')]);

// canonical face order -> world face index for facing f
const CANON_N = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
function dirOf(n) { return n[0] > 0 ? 0 : n[0] < 0 ? 1 : n[1] > 0 ? 2 : n[1] < 0 ? 3 : n[2] > 0 ? 4 : 5; }
function furnXf(f, list) {
  const r = f & 7, mir = f & 8, rr = r === 0 || r === 1 || r === 4 ? r : 5;
  return list.map((b) => {
    const m = mir ? [16 - b[3], b[1], b[2], 16 - b[0], b[4], b[5]] : b.slice(0, 6);
    const q = xfBox(rr, m);
    if (b.length > 6) {
      if (Array.isArray(b[6])) {
        const src = mir ? [b[6][1], b[6][0], b[6][2], b[6][3], b[6][4], b[6][5]] : b[6];
        const out = new Array(6);
        for (let d = 0; d < 6; d++) { const n = CANON_N[d]; out[dirOf(shapeXfN(rr, n[0], n[1], n[2]))] = src[d]; }
        q.push(out);
      } else q.push(b[6]);
    }
    return q;
  });
}
// the world offset of the canonical +X neighbour
function furnSide(f) { const n = shapeXfN((f & 7) === 0 || (f & 7) === 1 || (f & 7) === 4 ? f & 7 : 5, 1, 0, 0); return n; }
// six faces: sides, top, bottom, front, back
const faces6 = (side, top, bottom, front, back) => [side, side, top, bottom, front, back];

// ---- sofa: arms only at the ends of a row of sofas of the same colour ----
function sofaBoxes(f, get, id, icon) {
  const s = furnSide(f);
  const joinR = !icon && get && get(s[0], 0, s[2]) === id, joinL = !icon && get && get(-s[0], 0, -s[2]) === id;
  const [fab, cush] = SOFA_TEX[(id - B.SOFA_GRAY) % SOFA_TEX.length] || SOFA_TEX[0];
  const x0 = joinL ? 0 : 2.5, x1 = joinR ? 16 : 13.5;
  const b = [
    [joinL ? 0 : 1, 0, 2, joinL ? 1 : 3, 1.5, 4, FT.dark], [joinR ? 15 : 13, 0, 2, joinR ? 16 : 15, 1.5, 4, FT.dark],
    [joinL ? 0 : 1, 0, 13, joinL ? 1 : 3, 1.5, 15, FT.dark], [joinR ? 15 : 13, 0, 13, joinR ? 16 : 15, 1.5, 15, FT.dark],
    [0, 1.5, 1, 16, 4.5, 15.5, fab],                                  // frame
    [x0 + 0.25, 4.5, 4.5, x1 - 0.25, 8, 15.8, cush],                   // seat cushion
    [0, 4.5, 1, 16, 14.5, 4.5, fab],                                  // back
    [0.2, 14.5, 1.4, 15.8, 15.5, 4.1, fab],                           // rounded top of the back
    [x0 + 0.4, 8, 4.5, x1 - 0.4, 13.5, 6.8, cush],                     // back cushion
  ];
  if (!joinL) b.push([0, 4.5, 1, 2.5, 11, 15.5, fab], [0.25, 11, 1.4, 2.25, 11.8, 15.3, fab]);
  if (!joinR) b.push([13.5, 4.5, 1, 16, 11, 15.5, fab], [13.75, 11, 1.4, 15.75, 11.8, 15.3, fab]);
  return furnXf(f, b);
}
SHAPE_NBF[SH_SOFA] = sofaBoxes;
SHAPE_FN[SH_SOFA] = (f) => ({ boxes: sofaBoxes(f, null, B.SOFA_GRAY, true), coll: furnXf(f, [[0, 0, 1, 16, 8, 16], [0, 8, 1, 16, 15, 4.5]]) });

// ---- chair ----
SHAPE_FN[SH_CHAIR] = (f) => ({
  boxes: furnXf(f, [
    [2, 0, 2, 3.8, 7.5, 3.8, FT.oak], [12.2, 0, 2, 14, 7.5, 3.8, FT.oak], [2, 0, 12.2, 3.8, 7.5, 14, FT.oak], [12.2, 0, 12.2, 14, 7.5, 14, FT.oak],
    [1.5, 7.5, 1.5, 14.5, 9, 14.5, FT.oak],
    [2, 9, 1.8, 3.8, 16, 3.6, FT.oak], [12.2, 9, 1.8, 14, 16, 3.6, FT.oak],
    [3.8, 11, 2.2, 12.2, 12.4, 3.2, FT.oak], [3.8, 14, 2.2, 12.2, 15.6, 3.2, FT.oak],
  ]),
  coll: furnXf(f, [[1.5, 0, 1.5, 14.5, 9, 14.5], [1.5, 9, 1.5, 14.5, 16, 3.8]]),
});

// ---- table: legs only on the outer corners of a group of tables ----
function tableBoxes(f, get, id) {
  const has = (dx, dz) => get && get(dx, 0, dz) === id;
  const b = [[0, 14, 0, 16, 16, 16, FT.oak]];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    if (has(sx, 0) || has(0, sz)) continue;
    const x = sx < 0 ? 1 : 13, z = sz < 0 ? 1 : 13;
    b.push([x, 0, z, x + 2, 14, z + 2, FT.oak]);
    // apron under the edge the leg stands on
  }
  if (!has(0, -1)) b.push([1, 12.5, 1, 15, 14, 2, FT.oak]);
  if (!has(0, 1)) b.push([1, 12.5, 14, 15, 14, 15, FT.oak]);
  if (!has(-1, 0)) b.push([1, 12.5, 1, 2, 14, 15, FT.oak]);
  if (!has(1, 0)) b.push([14, 12.5, 1, 15, 14, 15, FT.oak]);
  return b;
}
SHAPE_NBF[SH_TABLE] = (f, get, id) => tableBoxes(f, get, id);
SHAPE_FN[SH_TABLE] = () => ({ boxes: tableBoxes(0, null, 0), coll: [[0, 14, 0, 16, 16, 16], [6, 0, 6, 10, 14, 10]] });

SHAPE_FN[SH_COFFEE] = (f) => ({
  boxes: furnXf(f, [
    [1, 6, 2, 15, 7.5, 14, FT.dark], [2, 2, 3, 14, 3, 13, FT.dark],
    [1.5, 0, 2.5, 3, 6, 4, FT.metal], [13, 0, 2.5, 14.5, 6, 4, FT.metal], [1.5, 0, 12, 3, 6, 13.5, FT.metal], [13, 0, 12, 14.5, 6, 13.5, FT.metal],
  ]),
  coll: furnXf(f, [[1, 0, 2, 15, 7.5, 14]]),
});

// ---- double bed: head and foot halves, the right half mirrored (bit 8); head at -Z ----
SHAPE_FN[SH_DBED_HEAD] = (f) => ({
  boxes: furnXf(f, [
    [0, 0, 0, 16, 16, 2, faces6(FT.dark, FT.dark, FT.dark, FT.oak, FT.dark)],   // headboard
    [0, 0, 2, 2, 2, 4, FT.dark],
    [0, 2, 2, 16, 5, 16, FT.oak],                                               // frame
    [1, 5, 2, 16, 9.5, 16, FT.sheet],                                           // mattress
    [3, 9.5, 3, 14.5, 12, 8, FT.pillow],                                        // pillow
    [0.6, 9.5, 9, 16, 10.6, 16, FT.blanket], [0.4, 6, 9, 1, 10.6, 16, FT.blanket],
  ]),
  coll: furnXf(f, [[0, 0, 0, 16, 16, 2], [0, 0, 2, 16, 10.5, 16]]),
});
SHAPE_FN[SH_DBED_FOOT] = (f) => ({
  boxes: furnXf(f, [
    [0, 0, 14, 16, 8, 16, faces6(FT.dark, FT.dark, FT.dark, FT.dark, FT.oak)],  // footboard
    [0, 0, 12, 2, 2, 14, FT.dark],
    [0, 2, 0, 16, 5, 14, FT.oak],
    [1, 5, 0, 16, 9.5, 14, FT.sheet],
    [0.6, 9.5, 0, 16, 10.6, 14.2, FT.blanket], [0.4, 6, 0, 1, 10.6, 14.2, FT.blanket], [0.6, 6, 13.6, 16, 10.6, 14.2, FT.blanket],
  ]),
  coll: furnXf(f, [[0, 0, 0, 16, 10.5, 14], [0, 0, 14, 16, 8, 16]]),
});

// ---- kitchen ----
const CAB = (front) => faces6(FT.cabSide, FT.cabSide, FT.cabSide, front, FT.cabSide);
SHAPE_FN[SH_COUNTER] = (f) => ({
  boxes: furnXf(f, [[0, 0, 1.5, 16, 1.2, 14, FT.black], [0, 1.2, 0.5, 16, 14.5, 15, CAB(FT.cab)], [0, 14.5, 0, 16, 16, 16, FT.worktop]]),
  coll: [[0, 0, 0, 16, 16, 16]],
});
SHAPE_FN[SH_SINK] = (f) => {
  const inner = (d) => faces6(d === 'x' ? FT.metal : FT.worktop, d === 'X' ? FT.metal : FT.worktop, FT.worktop, FT.worktop, d === 'z' ? FT.metal : FT.worktop, d === 'Z' ? FT.metal : FT.worktop);
  return {
    boxes: furnXf(f, [
      [0, 0, 1.5, 16, 1.2, 14, FT.black], [0, 1.2, 0.5, 16, 10, 15, CAB(FT.cab)],
      [0, 10, 0, 3, 16, 16, inner('x')], [13, 10, 0, 16, 16, 16, inner('X')],
      [3, 10, 0, 13, 16, 3.5, inner('z')], [3, 10, 12.5, 13, 16, 16, inner('Z')],
      [3, 10, 3.5, 13, 11, 12.5, FT.metal],                                   // basin
      [7.2, 16, 1.5, 8.8, 20, 3, FT.metal], [7.2, 18.6, 3, 8.8, 20, 7, FT.metal], // tap
    ]),
    coll: [[0, 0, 0, 16, 16, 16]],
  };
};
for (const [k, top] of [[SH_STOVE, FT.stoveTop]]) {
  SHAPE_FN[k] = (f) => ({ boxes: furnXf(f, [[0, 0, 0.5, 16, 15.5, 15.5, faces6(FT.cabSide, FT.cabSide, FT.cabSide, FT.stoveFront, FT.cabSide)], [0, 15.5, 0, 16, 16, 16, top]]), coll: [[0, 0, 0, 16, 16, 16]] });
}
const SH_STOVE_ON = 41;
SHAPE_FN[SH_STOVE_ON] = (f) => ({ boxes: furnXf(f, [[0, 0, 0.5, 16, 15.5, 15.5, faces6(FT.cabSide, FT.cabSide, FT.cabSide, FT.stoveFront, FT.cabSide)], [0, 15.5, 0, 16, 16, 16, FT.stoveTopOn]]), coll: [[0, 0, 0, 16, 16, 16]] });
SHAPE_FN[SH_FRIDGE] = (f) => ({ boxes: furnXf(f, [[0.5, 0, 1, 15.5, 16, 15.5, faces6(FT.fridgeSide, FT.fridgeSide, FT.fridgeSide, FT.fridgeLo, FT.fridgeSide)]]), coll: [[0.5, 0, 1, 15.5, 16, 15.5]] });
SHAPE_FN[SH_FRIDGE_TOP] = (f) => ({ boxes: furnXf(f, [[0.5, 0, 1, 15.5, 15, 15.5, faces6(FT.fridgeSide, FT.fridgeSide, FT.fridgeSide, FT.fridgeHi, FT.fridgeSide)]]), coll: [[0.5, 0, 1, 15.5, 15, 15.5]] });

// ---- TV and lamp ----
const tvShape = (screen) => (f) => ({
  boxes: furnXf(f, [
    [0.3, 4, 7, 15.7, 13.6, 8.4, faces6(FT.black, FT.black, FT.black, screen, FT.black)],
    [6.5, 5, 8.4, 9.5, 11, 9.4, FT.black], [7.2, 1, 7.4, 8.8, 4, 8.6, FT.black], [3.5, 0, 5, 12.5, 1, 10.5, FT.black],
  ]),
  coll: furnXf(f, [[0.3, 0, 5, 15.7, 13.6, 10.5]]),
});
const SH_TV_ON = 42;
SHAPE_FN[SH_TV] = tvShape(FT.tvOff);
SHAPE_FN[SH_TV_ON] = tvShape(FT.tvOn);
SHAPE_FN[SH_LAMP] = () => ({
  boxes: [[5, 0, 5, 11, 1, 11, FT.metal], [7.4, 1, 7.4, 8.6, 11.5, 8.6, FT.metal], [4, 11.5, 4, 12, 16, 12, FT.shade]],
  coll: [[4, 0, 4, 12, 16, 12]],
});

{
  const F = { hard: 1, snd: SND.WOOD, tool: TOOL_AXE, atten: 0, solid: true, cat: 'furniture' };
  const def = (id, name, tex, k, o) => { defBlock(id, name, RT_SHAPE, tex, with_(F, o || {})); BLOCK_SHAPE[id] = k; };
  SOFA_COLORS.forEach(([n, t], i) => def(B.SOFA_GRAY + i, n + ' Sofa', t, SH_SOFA, { snd: SND.WOOL, hard: 0.8 }));
  def(B.CHAIR, 'Wooden Chair', 'furn_oak', SH_CHAIR);
  def(B.TABLE, 'Wooden Table', 'furn_oak', SH_TABLE);
  def(B.COFFEE_TABLE, 'Coffee Table', 'furn_dark', SH_COFFEE);
  def(B.DOUBLE_BED, 'Double Bed', 'bed_blanket', SH_DBED_FOOT, { snd: SND.WOOL, hard: 0.4 });
  def(B.DOUBLE_BED_HEAD, 'Double Bed', 'bed_blanket', SH_DBED_HEAD, { snd: SND.WOOL, hard: 0.4, cat: null });
  const K = { tool: TOOL_PICK, snd: SND.STONE, hard: 1.5 };
  def(B.KITCHEN_COUNTER, 'Kitchen Cabinet', 'cabinet_side', SH_COUNTER, K);
  def(B.KITCHEN_SINK, 'Kitchen Sink', 'cabinet_side', SH_SINK, K);
  def(B.STOVE, 'Stove', 'cabinet_side', SH_STOVE, K);
  def(B.STOVE_ON, 'Stove', 'cabinet_side', SH_STOVE_ON, with_(K, { emit: 7, cat: null }));
  def(B.FRIDGE, 'Fridge', 'fridge_side', SH_FRIDGE, { tool: TOOL_PICK, snd: SND.METAL, hard: 2 });
  def(B.FRIDGE_TOP, 'Fridge', 'fridge_side', SH_FRIDGE_TOP, { tool: TOOL_PICK, snd: SND.METAL, hard: 2, cat: null });
  def(B.TV, 'Television', 'furn_black', SH_TV, { tool: TOOL_PICK, snd: SND.METAL, hard: 0.8 });
  def(B.TV_ON, 'Television', 'furn_black', SH_TV_ON, { tool: TOOL_PICK, snd: SND.METAL, hard: 0.8, emit: 8, cat: null });
  def(B.FLOOR_LAMP, 'Floor Lamp', 'furn_metal', SH_LAMP, { tool: TOOL_PICK, snd: SND.METAL, hard: 0.5, emit: 14 });
}

// ---- metro fare gate: a steel cabinet with the card reader on its left, an arm across the
// passage (people walk along Z; the paid side is the back, -Z). Only the cabinet collides: the
// gate itself is kept shut by metro_panel.js unless you touch a card.
const SH_TURNSTILE = 43;
const TT = { reader: defTex('turnstile_reader') };
SHAPE_FN[SH_TURNSTILE] = (f) => ({
  boxes: furnXf(f, [
    [0, 0, 2, 3.5, 14, 14, FT.metal], [0.3, 14, 2.5, 3.2, 15, 13.5, faces6(FT.black, FT.black, TT.reader, FT.black, FT.black, FT.black)],
    [3.5, 11, 7.2, 5, 12.5, 8.8, FT.black], [5, 11.4, 7.5, 15.5, 12.2, 8.5, FT.metal],
    [5, 8.4, 7.5, 5.8, 11.4, 8.5, FT.metal],
  ]),
  coll: furnXf(f, [[0, 0, 2, 3.5, 15, 14]]),
});
{
  defBlock(B.TURNSTILE, 'Metro Fare Gate', RT_SHAPE, 'furn_metal', { hard: 2, tool: TOOL_PICK, snd: SND.METAL, atten: 0, solid: false, emit: 3, cat: 'transport' });
  BLOCK_SHAPE[B.TURNSTILE] = SH_TURNSTILE;
  defBlock(B.TICKET_MACHINE, 'Metro Ticket Machine', RT_CUBE, { top: 'metro_panel_side', side: 'metro_panel_side', front: 'ticket_front' }, { hard: 2, tool: TOOL_PICK, snd: SND.METAL, emit: 7, cat: 'transport' });
  FACING_BLOCKS.add(B.TICKET_MACHINE);
}
defBlock(B.PLOT_STONE, 'Plot Stone', RT_CUBE, { top: 'plot_stone_top', bottom: 'plot_stone_side', side: 'plot_stone_side' }, { hard: 3, tool: TOOL_PICK, snd: SND.STONE, cat: 'functional' });

// ---------------------------------------------------------------- more furniture ----
// A pendant lamp, rugs that join into one carpet with a border round the whole of it, framed
// pictures and a shelf that hang on the wall you click, a shower (two blocks tall), a bathtub that
// joins end to end, a WC, a washing machine, a desktop computer, a games console and the TV
// showing a game while the console is on.
const SH_CEIL_LAMP = 44, SH_RUG = 45, SH_PAINTING = 46, SH_SHELF = 47, SH_SHOWER = 48, SH_SHOWER_TOP = 49;
const SH_BATH = 50, SH_TOILET = 51, SH_WASHER = 52, SH_WASHER_ON = 53, SH_PC = 54, SH_CONSOLE = 55, SH_TV_GAME = 56;
const FT2 = {
  enamel: defTex('enamel'), tile: defTex('bath_tile'), water: defTex('bath_water'), curtain: defTex('shower_curtain'),
  washFront: defTex('washer_front'), washFrontOn: defTex('washer_front_on'), pc: defTex('pc_screen'), keys: defTex('keyboard'),
  consoleTop: defTex('console_top'), tvGame: defTex('tv_screen_game'), pot: defTex('pot_terracotta'), plant: defTex('plant_green'),
  books: [defTex('book_red'), defTex('book_green'), defTex('book_blue')], frame: defTex('frame_gold'),
};
const RUGS = [['RUG_RED', 'Red Rug', 'rug_red'], ['RUG_BLUE', 'Blue Rug', 'rug_blue'], ['RUG_BEIGE', 'Beige Rug', 'rug_beige']];
const RUG_TEX = RUGS.map(([, , t]) => [defTex(t), defTex(t + '_border')]);
const PAINTINGS = [['PAINTING_SEA', 'Painting: Sea at Dusk', 'art_sea'], ['PAINTING_CITY', 'Painting: The City', 'art_city'],
  ['PAINTING_FLOWERS', 'Painting: Flowers', 'art_flowers'], ['PAINTING_ABSTRACT', 'Painting: Composition', 'art_abstract']];
const ART_TEX = PAINTINGS.map(([, , t]) => defTex(t));

SHAPE_FN[SH_CEIL_LAMP] = () => ({
  boxes: [[6, 15.2, 6, 10, 16, 10, FT.metal], [7.6, 10, 7.6, 8.4, 15.2, 8.4, FT.black],
    [3.5, 5.5, 3.5, 12.5, 10, 12.5, FT.shade], [5, 10, 5, 11, 11, 11, FT.shade], [6, 4.6, 6, 10, 5.5, 10, FT.shade]],
  coll: [[3.5, 4.6, 3.5, 12.5, 16, 12.5]],
});

// ---- rug: a border only along the edges of the whole carpet ----
function rugBoxes(f, get, id) {
  const [mid, bord] = RUG_TEX[(id - B.RUG_RED) % RUG_TEX.length] || RUG_TEX[0];
  const has = (dx, dz) => get && get(dx, 0, dz) === id;
  const b = [[0, 0, 0, 16, 0.7, 16, mid]];
  if (!has(0, -1)) b.push([0, 0, 0, 16, 0.8, 2, bord]);
  if (!has(0, 1)) b.push([0, 0, 14, 16, 0.8, 16, bord]);
  if (!has(-1, 0)) b.push([0, 0, 0, 2, 0.8, 16, bord]);
  if (!has(1, 0)) b.push([14, 0, 0, 16, 0.8, 16, bord]);
  return b;
}
SHAPE_NBF[SH_RUG] = (f, get, id) => rugBoxes(f, get, id);
SHAPE_FN[SH_RUG] = () => ({ boxes: rugBoxes(0, null, B.RUG_RED), coll: [[0, 0, 0, 16, 0.8, 16]] });

// ---- a picture in a gilt frame, flat against the wall behind it ----
function paintingBoxes(f, id) {
  const art = ART_TEX[(id - B.PAINTING_SEA) % ART_TEX.length] || ART_TEX[0];
  return furnXf(f, [
    [0.5, 1.5, 0, 15.5, 2.5, 1.2, FT2.frame], [0.5, 13.5, 0, 15.5, 14.5, 1.2, FT2.frame],
    [0.5, 2.5, 0, 1.5, 13.5, 1.2, FT2.frame], [14.5, 2.5, 0, 15.5, 13.5, 1.2, FT2.frame],
    [1.5, 2.5, 0, 14.5, 13.5, 0.8, faces6(FT.dark, FT.dark, FT.dark, art, FT.dark)],
  ]);
}
SHAPE_NBF[SH_PAINTING] = (f, get, id) => paintingBoxes(f, id);
SHAPE_FN[SH_PAINTING] = (f) => ({ boxes: paintingBoxes(f, B.PAINTING_SEA), coll: furnXf(f, [[0.5, 1.5, 0, 15.5, 14.5, 1.2]]) });

// ---- wall shelf with books and a plant ----
SHAPE_FN[SH_SHELF] = (f) => ({
  boxes: furnXf(f, [
    [0, 7, 0, 16, 8, 7, FT.oak], [2, 4, 0, 3, 7, 5.5, FT.metal], [13, 4, 0, 14, 7, 5.5, FT.metal],
    [1, 8, 0.6, 2.4, 13.5, 6, FT2.books[0]], [2.4, 8, 0.6, 3.7, 12.6, 6, FT2.books[1]], [3.7, 8, 0.6, 5.2, 14, 6, FT2.books[2]],
    [5.2, 8, 0.6, 6.4, 13, 6, FT2.books[0]], [6.6, 8, 0.6, 8, 12, 6, FT2.books[1]],
    [10.5, 8, 1.5, 14, 11, 5, FT2.pot], [10, 11, 1, 14.5, 14, 5.5, FT2.plant], [11, 14, 2, 13.5, 15.5, 4.5, FT2.plant],
  ]),
  coll: furnXf(f, [[0, 7, 0, 16, 8, 7]]),
});

// ---- shower: tiled back, tray, mixer, a curtain half drawn on the open side ----
SHAPE_FN[SH_SHOWER] = (f) => ({
  boxes: furnXf(f, [
    [0, 0, 0, 16, 1.5, 16, FT2.enamel], [0, 1.5, 0, 16, 16, 1, FT2.tile],
    [7.4, 1.5, 1, 8.6, 16, 2, FT.metal], [6.2, 7, 1, 9.8, 9, 2.4, FT.metal],
    [0, 1.5, 15, 4.5, 16, 15.6, FT2.curtain],
  ]),
  coll: furnXf(f, [[0, 0, 0, 16, 1.5, 16], [0, 0, 0, 16, 16, 1]]),
});
SHAPE_FN[SH_SHOWER_TOP] = (f) => ({
  boxes: furnXf(f, [
    [0, 0, 0, 16, 14, 1, FT2.tile], [7.4, 0, 1, 8.6, 9, 2, FT.metal], [7.4, 8, 2, 8.6, 9, 6, FT.metal],
    [5.4, 6.8, 4.4, 10.6, 8, 9.6, FT.metal], [0, 13.4, 15, 16, 14, 15.6, FT.metal],
    [0, 0, 15, 4.5, 13.4, 15.6, FT2.curtain], [4.5, 12.4, 15.05, 5.2, 13.4, 15.55, FT2.curtain],
  ]),
  coll: furnXf(f, [[0, 0, 0, 16, 14, 1]]),
});

// ---- bathtub: taps at the left end, joins with the next tub along its length ----
function bathBoxes(f, get, id, icon) {
  const s = furnSide(f);
  const joinR = !icon && get && get(s[0], 0, s[2]) === id, joinL = !icon && get && get(-s[0], 0, -s[2]) === id;
  const x0 = joinL ? 0 : 2, x1 = joinR ? 16 : 14;
  const b = [
    [0, 0, 0, 16, 1, 16, FT2.enamel], [0, 1, 0, 16, 9, 2, FT2.enamel], [0, 1, 14, 16, 9, 16, FT2.enamel],
    [x0, 1, 2, x1, 2, 14, FT2.enamel], [x0, 2, 2, x1, 6.5, 14, FT2.water],
    [0, 9, 0, 16, 9.6, 2.4, FT2.enamel], [0, 9, 13.6, 16, 9.6, 16, FT2.enamel],
  ];
  if (!joinL) b.push([0, 1, 2, 2, 9, 14, FT2.enamel], [0, 9, 0, 2.4, 9.6, 16, FT2.enamel],
    [0.6, 9.6, 7.4, 1.8, 12.5, 8.6, FT.metal], [1.8, 11.4, 7.4, 4.2, 12.5, 8.6, FT.metal], [0.6, 9.6, 4.5, 1.6, 10.8, 5.5, FT.metal], [0.6, 9.6, 10.5, 1.6, 10.8, 11.5, FT.metal]);
  if (!joinR) b.push([14, 1, 2, 16, 9, 14, FT2.enamel], [13.6, 9, 0, 16, 9.6, 16, FT2.enamel]);
  return furnXf(f, b);
}
SHAPE_NBF[SH_BATH] = bathBoxes;
SHAPE_FN[SH_BATH] = (f) => ({ boxes: bathBoxes(f, null, B.BATHTUB, true), coll: furnXf(f, [[0, 0, 0, 16, 2, 16], [0, 0, 0, 16, 9.6, 2], [0, 0, 14, 16, 9.6, 16]]) });

SHAPE_FN[SH_TOILET] = (f) => ({
  boxes: furnXf(f, [
    [5, 0, 4.5, 11, 6, 11.5, FT2.enamel], [3.5, 6, 3.5, 12.5, 8.4, 14, FT2.enamel], [3.5, 8.4, 3.5, 12.5, 9.1, 14, FT.oak],
    [2.5, 6, 0.5, 13.5, 15, 3.8, FT2.enamel], [2.3, 15, 0.3, 13.7, 15.6, 4, FT2.enamel], [7, 15.6, 1.4, 9, 16, 2.8, FT.metal],
  ]),
  coll: furnXf(f, [[3.5, 0, 0.5, 12.5, 9.1, 14], [2.5, 0, 0.5, 13.5, 15.6, 4]]),
});

const washShape = (front) => (f) => ({
  boxes: furnXf(f, [[0.5, 0, 1, 15.5, 15.4, 15.5, faces6(FT.fridgeSide, FT.fridgeSide, FT.fridgeSide, front, FT.fridgeSide)], [0.3, 15.4, 0.8, 15.7, 16, 15.7, FT.worktop]]),
  coll: [[0.5, 0, 1, 15.5, 16, 15.5]],
});
SHAPE_FN[SH_WASHER] = washShape(FT2.washFront);
SHAPE_FN[SH_WASHER_ON] = washShape(FT2.washFrontOn);

// ---- a desktop computer to stand on a table: screen at the back, keyboard and mouse in front ----
SHAPE_FN[SH_PC] = (f) => ({
  boxes: furnXf(f, [
    [1.5, 3.2, 2.2, 14.5, 12.4, 3.2, faces6(FT.black, FT.black, FT.black, FT2.pc, FT.black)], [1.5, 3.2, 1.6, 14.5, 12.4, 2.2, FT.black],
    [7.2, 0.4, 1.8, 8.8, 3.2, 2.8, FT.metal], [5.5, 0, 0.8, 10.5, 0.4, 4.5, FT.metal],
    [2.5, 0, 7.5, 13.2, 0.6, 11.5, faces6(FT.black, FT.black, FT2.keys, FT.black, FT.black)], [14, 0, 8.5, 15.3, 0.6, 11, FT.black],
  ]),
  coll: furnXf(f, [[1.5, 0, 0.8, 15.3, 12.4, 11.5]]),
});
SHAPE_FN[SH_CONSOLE] = (f) => ({
  boxes: furnXf(f, [
    [3, 0, 3, 13, 2.6, 11, faces6(FT.black, FT2.consoleTop, FT.black, FT.black, FT.black)], [3.4, 0.9, 11, 12.6, 1.2, 11.1, FT2.consoleTop],
    [4, 0, 12, 8.5, 1, 15, FT.black], [3.4, 0, 12.6, 4, 1, 14.4, FT.black], [8.5, 0, 12.6, 9.1, 1, 14.4, FT.black],
  ]),
  coll: furnXf(f, [[3, 0, 3, 13, 2.6, 15]]),
});
SHAPE_FN[SH_TV_GAME] = tvShape(FT2.tvGame);

{
  const F = { hard: 1, snd: SND.WOOD, tool: TOOL_AXE, atten: 0, solid: true, cat: 'furniture' };
  const def = (id, name, tex, k, o) => { defBlock(id, name, RT_SHAPE, tex, with_(F, o || {})); BLOCK_SHAPE[id] = k; };
  const M = { tool: TOOL_PICK, snd: SND.METAL };
  const E_ = { tool: TOOL_PICK, snd: SND.STONE, hard: 1.2 };
  def(B.CEILING_LAMP, 'Ceiling Lamp', 'lamp_shade', SH_CEIL_LAMP, with_(M, { hard: 0.5, emit: 15, solid: false }));
  RUGS.forEach(([k, n, t]) => def(B[k], n, t, SH_RUG, { snd: SND.WOOL, hard: 0.3, solid: false }));
  PAINTINGS.forEach(([k, n, t]) => def(B[k], n, t, SH_PAINTING, { hard: 0.4, solid: false }));
  def(B.WALL_SHELF, 'Wall Shelf', 'furn_oak', SH_SHELF, { hard: 0.6, solid: false });
  def(B.SHOWER, 'Shower', 'bath_tile', SH_SHOWER, with_(E_, { solid: false }));
  def(B.SHOWER_TOP, 'Shower', 'bath_tile', SH_SHOWER_TOP, with_(E_, { solid: false, cat: null }));
  def(B.BATHTUB, 'Bathtub', 'enamel', SH_BATH, E_);
  def(B.TOILET, 'Toilet', 'enamel', SH_TOILET, E_);
  def(B.WASHER, 'Washing Machine', 'fridge_side', SH_WASHER, with_(M, { hard: 1.5 }));
  def(B.WASHER_ON, 'Washing Machine', 'fridge_side', SH_WASHER_ON, with_(M, { hard: 1.5, emit: 4, cat: null }));
  def(B.DESKTOP_PC, 'Desktop Computer', 'furn_black', SH_PC, with_(M, { hard: 0.6, emit: 6 }));
  def(B.GAME_CONSOLE, 'Games Console', 'furn_black', SH_CONSOLE, with_(M, { hard: 0.5 }));
  def(B.TV_GAME, 'Television', 'furn_black', SH_TV_GAME, with_(M, { hard: 0.8, emit: 8, cat: null }));
}

// ---- lift floor: a steel plate flush with the floor; a column of them is a lift (lift.js) ----
const SH_LIFT = 57;
FT2.lift = defTex('lift_floor');
SHAPE_FN[SH_LIFT] = () => ({ boxes: [[0, 14.5, 0, 16, 16, 16, FT2.lift], [0.5, 13.5, 0.5, 15.5, 14.5, 15.5, FT.metal]], coll: [[0, 14.5, 0, 16, 16, 16]] });
defBlock(B.LIFT_FLOOR, 'Lift Floor', RT_SHAPE, 'lift_floor', { hard: 2, tool: TOOL_PICK, snd: SND.METAL, atten: 0, solid: true, cat: 'transport' });
BLOCK_SHAPE[B.LIFT_FLOOR] = SH_LIFT;

// ---- shop fittings: shelving units stocked with goods (the goods face the front) and a till ----
const SH_SHOP_SHELF = 58, SH_REGISTER = 59;
FT2.goods = { [B.SHELF_GROCERY]: defTex('goods_grocery'), [B.SHELF_BREAD]: defTex('goods_bread'), [B.SHELF_DRINKS]: defTex('goods_drinks') };
FT2.shelfWhite = defTex('shelf_white'); FT2.till = defTex('till_screen'); FT2.tillKeys = defTex('till_keys');
function shopShelfBoxes(f, id) {
  const gd = FT2.goods[id] || FT2.goods[B.SHELF_GROCERY], W_ = FT2.shelfWhite;
  const goods = faces6(gd, gd, gd, gd, gd, W_);
  const b = [
    [0, 0, 0, 16, 16, 1.2, W_], [0, 0, 1.2, 1, 16, 14, W_], [15, 0, 1.2, 16, 16, 14, W_],
    [1, 0, 1.2, 15, 1.2, 14, W_], [1, 5.2, 1.2, 15, 6, 14, W_], [1, 10.6, 1.2, 15, 11.4, 14, W_], [0, 15.4, 0, 16, 16, 14, W_],
    [1.2, 1.2, 2, 14.8, 5.2, 13, goods], [1.2, 6, 2, 14.8, 10.2, 13, goods], [1.2, 11.4, 2, 14.8, 15.2, 13, goods],
  ];
  if (id === B.SHELF_DRINKS) b.push([1, 0.5, 14, 15, 15.5, 14.4, FT2.shelfWhite]);   // glass door frame
  return furnXf(f, b);
}
SHAPE_NBF[SH_SHOP_SHELF] = (f, get, id) => shopShelfBoxes(f, id);
SHAPE_FN[SH_SHOP_SHELF] = (f) => ({ boxes: shopShelfBoxes(f, B.SHELF_GROCERY), coll: furnXf(f, [[0, 0, 0, 16, 16, 14]]) });
SHAPE_FN[SH_REGISTER] = (f) => ({
  boxes: furnXf(f, [
    [2, 0, 3, 14, 3, 13, faces6(FT.black, FT2.tillKeys, FT.black, FT.black, FT.black)], [2.5, 3, 8.5, 13.5, 3.5, 12.5, FT.metal],
    [7, 3, 4, 9, 7, 5, FT.black], [3.5, 7, 3.5, 12.5, 12.5, 5, faces6(FT.black, FT.black, FT.black, FT2.till, FT.black)],
  ]),
  coll: furnXf(f, [[2, 0, 3, 14, 7, 13]]),
});
{
  const def = (id, name, tex, k, o) => { defBlock(id, name, RT_SHAPE, tex, with_({ hard: 1.5, snd: SND.METAL, tool: TOOL_PICK, atten: 0, solid: true, cat: 'furniture' }, o || {})); BLOCK_SHAPE[id] = k; };
  def(B.SHELF_GROCERY, 'Grocery Shelves', 'shelf_white', SH_SHOP_SHELF);
  def(B.SHELF_BREAD, 'Bread Shelves', 'shelf_white', SH_SHOP_SHELF);
  def(B.SHELF_DRINKS, 'Drinks Fridge', 'shelf_white', SH_SHOP_SHELF, { emit: 5 });
  def(B.CASH_REGISTER, 'Cash Register', 'furn_black', SH_REGISTER, { hard: 0.8, emit: 3 });
}
