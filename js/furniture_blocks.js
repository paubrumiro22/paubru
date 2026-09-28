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
