'use strict';
// Mechanism blocks: levers, buttons, pressure plates, signal wire, lamps, pistons, timers and the
// signal block. Only their look and hit boxes live here (the file is shared with the workers);
// how power flows is in mechanisms.js. Sources and consumers come in off / on pairs of ids.

const SH_LEVER = 12, SH_LEVER_ON = 13, SH_BUTTON = 14, SH_BUTTON_ON = 15, SH_PLATE = 16, SH_PLATE_ON = 17;
const SH_WIRE = 18, SH_PISTON = 19, SH_PISTON_EXT = 20, SH_PISTON_HEAD = 21, SH_STICKY = 22, SH_STICKY_HEAD = 23;
const SUP_ATTACH = 10;   // levers and buttons: on the wall behind them or the floor under them

const MECH_TEX = {
  base: defTex('smooth_stone'), stick: defTex('lever_stick'), knob: defTex('lever_knob'), knobOn: defTex('lever_knob_on'),
  pside: defTex('piston_side'), pface: defTex('piston_face'), sface: defTex('sticky_face'), rod: defTex('piston_rod'),
};

// Facing of a mounted piece: 0 1 4 5 = the wall it hangs on is towards +X -X +Z -Z (shape frame:
// wall at -Z), +8 = standing on the floor and turned that way.
function mountBoxes(wall, floor, f) {
  const src = f & 8 ? floor : wall;
  const r = f & 7;
  return src.map((b) => { const q = xfBox(r === 0 || r === 1 || r === 4 ? r : 5, b.slice(0, 6)); if (b.length > 6) q.push(b[6]); return q; });
}
function bounds(boxes) {
  const u = [16, 16, 16, 0, 0, 0];
  for (const b of boxes) for (let k = 0; k < 3; k++) { u[k] = Math.min(u[k], b[k]); u[k + 3] = Math.max(u[k + 3], b[k + 3]); }
  return [u];
}

const MT = MECH_TEX;
const LEVER_WALL = (on) => [
  [5, 3, 0, 11, 13, 3, MT.base],
  [7, 7, 3, 9, 9, 6, MT.stick],
  on ? [7, 9, 6, 9, 11, 9, MT.stick] : [7, 5, 6, 9, 7, 9, MT.stick],
  on ? [6, 10, 8, 10, 13, 11, MT.knobOn] : [6, 3, 8, 10, 6, 11, MT.knob],
];
const LEVER_FLOOR = (on) => [
  [4, 0, 5, 12, 3, 11, MT.base],
  [7, 3, 7, 9, 6, 9, MT.stick],
  on ? [7, 6, 9, 9, 9, 11, MT.stick] : [7, 6, 5, 9, 9, 7, MT.stick],
  on ? [6, 8, 10, 10, 11, 13, MT.knobOn] : [6, 8, 3, 10, 11, 6, MT.knob],
];
for (const [k, on] of [[SH_LEVER, false], [SH_LEVER_ON, true]]) {
  SHAPE_FN[k] = (f) => { const b = mountBoxes(LEVER_WALL(on), LEVER_FLOOR(on), f); return { boxes: b, coll: bounds(b) }; };
}
for (const [k, on] of [[SH_BUTTON, false], [SH_BUTTON_ON, true]]) {
  SHAPE_FN[k] = (f) => ({ boxes: mountBoxes([[5, 6, 0, 11, 10, on ? 1 : 2]], [[5, 0, 6, 11, on ? 1 : 2, 10]], f) });
}
SHAPE_FN[SH_PLATE] = () => ({ boxes: [[1, 0, 1, 15, 2, 15]] });
SHAPE_FN[SH_PLATE_ON] = () => ({ boxes: [[1, 0, 1, 15, 1, 15]] });

// Pistons point where their face is: 0 1 4 5 horizontal (as FACE_DIR), 8 up, 9 down.
const PISTON_DIRS = { 0: [1, 0, 0], 1: [-1, 0, 0], 4: [0, 0, 1], 5: [0, 0, -1], 8: [0, 1, 0], 9: [0, -1, 0] };
// Boxes in a frame where the face is at -Z, turned to face f.
function pistonXf(f, list) {
  return list.map((b) => {
    let q;
    if (f === 8) q = [b[0], 16 - b[5], b[1], b[3], 16 - b[2], b[4]];   // face (-Z) turned to +Y
    else if (f === 9) q = [b[0], b[2], b[1], b[3], b[5], b[4]];          // face turned to -Y
    else q = xfBox(PISTON_DIRS[f] ? f : 5, b);
    if (b.length > 6) q.push(b[6]);
    return q;
  });
}
const pistonShape = (face) => (f) => ({ boxes: pistonXf(f, [[0, 0, 4, 16, 16, 16, MT.pside], [0, 0, 0, 16, 16, 4, face]]), coll: [[0, 0, 0, 16, 16, 16]] });
SHAPE_FN[SH_PISTON] = pistonShape(MT.pface);
SHAPE_FN[SH_STICKY] = pistonShape(MT.sface);
SHAPE_FN[SH_PISTON_EXT] = (f) => { const b = pistonXf(f, [[0, 0, 4, 16, 16, 16, MT.pside], [6, 6, 0, 10, 10, 4, MT.rod]]); return { boxes: b, coll: [b[0].slice(0, 6)] }; };
const headShape = (face) => (f) => { const b = pistonXf(f, [[0, 0, 0, 16, 16, 4, face], [6, 6, 4, 10, 10, 16, MT.rod]]); return { boxes: b, coll: b.map((q) => q.slice(0, 6)) }; };
SHAPE_FN[SH_PISTON_HEAD] = headShape(MT.pface);
SHAPE_FN[SH_STICKY_HEAD] = headShape(MT.sface);

// Automatic sliding door: an aluminium-framed glass leaf in the middle of the cell, with the track
// housing (and its sensor) along the top of the upper block. Open, the leaf has slid away and only
// the jamb on one side is left. Facing 0 1 4 5 as FACE_DIR (the leaf spans x for 4/5, z for 0/1);
// +8 puts the jamb on the other side (double doors part from the middle).
const SH_ADOOR = 24, SH_ADOOR_TOP = 25, SH_ADOOR_OPEN = 26, SH_ADOOR_OPEN_TOP = 27;
const ADT = { frame: defTex('adoor_frame'), lo: defTex('adoor_glass_lo'), hi: defTex('adoor_glass_hi'), head: defTex('adoor_head') };
function adoorXf(f, list) {
  const r = f & 7, mir = f & 8;
  return list.map((b) => {
    const m = mir ? [16 - b[3], b[1], b[2], 16 - b[0], b[4], b[5]] : b.slice(0, 6);
    const q = xfBox(r === 0 || r === 1 || r === 4 ? r : 5, m);
    if (b.length > 6) q.push(b[6]);
    return q;
  });
}
SHAPE_CUTOUT.add(ADT.lo); SHAPE_CUTOUT.add(ADT.hi);
const ADOOR_HEAD = [0, 14, 5, 16, 16, 11, ADT.head];
SHAPE_FN[SH_ADOOR] = (f) => ({
  boxes: adoorXf(f, [[0, 0, 7, 1, 16, 9, ADT.frame], [15, 0, 7, 16, 16, 9, ADT.frame], [1, 0, 7, 15, 1, 9, ADT.frame], [1, 1, 7, 15, 16, 9, ADT.lo]]),
  coll: adoorXf(f, [[0, 0, 7, 16, 16, 9]]),
});
SHAPE_FN[SH_ADOOR_TOP] = (f) => ({
  boxes: adoorXf(f, [[0, 0, 7, 1, 14, 9, ADT.frame], [15, 0, 7, 16, 14, 9, ADT.frame], [1, 13, 7, 15, 14, 9, ADT.frame], [1, 0, 7, 15, 13, 9, ADT.hi], ADOOR_HEAD]),
  coll: adoorXf(f, [[0, 0, 7, 16, 16, 9], [0, 14, 5, 16, 16, 11]]),
});
SHAPE_FN[SH_ADOOR_OPEN] = (f) => ({ boxes: adoorXf(f, [[0, 0, 6, 2, 16, 10, ADT.frame]]) });
SHAPE_FN[SH_ADOOR_OPEN_TOP] = (f) => ({ boxes: adoorXf(f, [[0, 0, 6, 2, 14, 10, ADT.frame], ADOOR_HEAD]) });

// Signal wire: a flat line that joins wire and mechanisms around it and climbs one block.
const IS_WIRE = (id) => id === B.WIRE || id === B.WIRE_ON;
const MECH_JOIN = new Uint8Array(MAX_BLOCK);
function wireBoxes(get, id, icon) {
  const join = (dx, dz) => MECH_JOIN[get(dx, 0, dz)] || IS_WIRE(get(dx, -1, dz)) || (IS_WIRE(get(dx, 1, dz)) && !BLOCK_OPAQUE[get(0, 1, 0)]);
  const px = icon || join(1, 0), nx = icon || join(-1, 0), pz = icon || join(0, 1), nz = icon || join(0, -1);
  const out = [[6, 0, 6, 10, 1, 10]];
  const any = px || nx || pz || nz;
  const lx = px || (!any) || (nx && !pz && !nz), ln = nx || (!any) || (px && !pz && !nz);
  const lz = pz || (!any) || (nz && !px && !nx), lnz = nz || (!any) || (pz && !px && !nx);
  if (lx) out.push([10, 0, 7, 16, 1, 9]);
  if (ln) out.push([0, 0, 7, 6, 1, 9]);
  if (lz) out.push([7, 0, 10, 9, 1, 16]);
  if (lnz) out.push([7, 0, 0, 9, 1, 6]);
  if (!icon && !BLOCK_OPAQUE[get(0, 1, 0)]) {
    // up the side of the block next to it
    if (IS_WIRE(get(1, 1, 0))) out.push([15, 1, 7, 16, 16, 9]);
    if (IS_WIRE(get(-1, 1, 0))) out.push([0, 1, 7, 1, 16, 9]);
    if (IS_WIRE(get(0, 1, 1))) out.push([7, 1, 15, 9, 16, 16]);
    if (IS_WIRE(get(0, 1, -1))) out.push([7, 1, 0, 9, 16, 1]);
  }
  return out;
}
SHAPE_NB[SH_WIRE] = wireBoxes;

{
  const M = { hard: 0.5, snd: SND.STONE, tool: TOOL_PICK, atten: 0, solid: false, cat: 'mechanisms' };
  const shaped = (id, name, tex, k, o) => { defBlock(id, name, RT_SHAPE, tex, with_(M, o || {})); BLOCK_SHAPE[id] = k; };
  shaped(B.LEVER, 'Lever', 'smooth_stone', SH_LEVER, { support: SUP_ATTACH });
  shaped(B.LEVER_ON, 'Lever', 'smooth_stone', SH_LEVER_ON, { support: SUP_ATTACH, cat: null });
  shaped(B.BUTTON, 'Stone Button', 'smooth_stone', SH_BUTTON, { support: SUP_ATTACH });
  shaped(B.BUTTON_ON, 'Stone Button', 'smooth_stone', SH_BUTTON_ON, { support: SUP_ATTACH, cat: null });
  shaped(B.WOOD_BUTTON, 'Wooden Button', 'planks', SH_BUTTON, { support: SUP_ATTACH, snd: SND.WOOD, tool: TOOL_AXE });
  shaped(B.WOOD_BUTTON_ON, 'Wooden Button', 'planks', SH_BUTTON_ON, { support: SUP_ATTACH, snd: SND.WOOD, tool: TOOL_AXE, cat: null });
  shaped(B.PLATE, 'Stone Pressure Plate', 'smooth_stone', SH_PLATE, { support: SUP_FLOOR });
  shaped(B.PLATE_ON, 'Stone Pressure Plate', 'smooth_stone', SH_PLATE_ON, { support: SUP_FLOOR, cat: null });
  shaped(B.WOOD_PLATE, 'Wooden Pressure Plate', 'planks', SH_PLATE, { support: SUP_FLOOR, snd: SND.WOOD, tool: TOOL_AXE });
  shaped(B.WOOD_PLATE_ON, 'Wooden Pressure Plate', 'planks', SH_PLATE_ON, { support: SUP_FLOOR, snd: SND.WOOD, tool: TOOL_AXE, cat: null });
  shaped(B.WIRE, 'Signal Wire', 'wire', SH_WIRE, { hard: 0, support: SUP_FLOOR, replace: false });
  shaped(B.WIRE_ON, 'Signal Wire', 'wire_on', SH_WIRE, { hard: 0, support: SUP_FLOOR, emit: 5, cat: null });
  const P = { hard: 1.5, snd: SND.STONE, tool: TOOL_PICK, atten: 15, solid: true, cat: 'mechanisms' };
  const piston = (id, name, k, o) => { defBlock(id, name, RT_SHAPE, 'piston_side', with_(P, o || {})); BLOCK_SHAPE[id] = k; };
  piston(B.PISTON, 'Piston', SH_PISTON);
  piston(B.STICKY_PISTON, 'Sticky Piston', SH_STICKY);
  piston(B.PISTON_ON, 'Piston', SH_PISTON_EXT, { cat: null, atten: 1 });
  piston(B.STICKY_PISTON_ON, 'Sticky Piston', SH_PISTON_EXT, { cat: null, atten: 1 });
  piston(B.PISTON_HEAD, 'Piston Head', SH_PISTON_HEAD, { cat: null, atten: 1 });
  piston(B.STICKY_HEAD, 'Piston Head', SH_STICKY_HEAD, { cat: null, atten: 1 });
  defBlock(B.SIGNAL_LAMP, 'Signal Lamp', RT_CUBE, 'lamp_off', { hard: 0.3, snd: SND.GLASS, cat: 'mechanisms' });
  defBlock(B.SIGNAL_LAMP_ON, 'Signal Lamp', RT_CUBE, 'lamp_on', { hard: 0.3, snd: SND.GLASS, emit: 15, cat: null });
  defBlock(B.TIMER, 'Timer', RT_CUBE, { top: 'timer_top', bottom: 'smooth_stone', side: 'timer_side' }, { hard: 0.8, snd: SND.STONE, tool: TOOL_PICK, cat: 'mechanisms' });
  defBlock(B.TIMER_ON, 'Timer', RT_CUBE, { top: 'timer_top_on', bottom: 'smooth_stone', side: 'timer_side_on' }, { hard: 0.8, snd: SND.STONE, tool: TOOL_PICK, emit: 7, cat: null });
  defBlock(B.SIGNAL_BLOCK, 'Signal Block', RT_CUBE, 'signal_block', { hard: 3, snd: SND.METAL, tool: TOOL_PICK, emit: 4, cat: 'mechanisms' });
  // automatic sliding doors: two blocks tall, opened by autodoor.js when someone comes near
  const AD = { hard: 2, snd: SND.GLASS, tool: TOOL_PICK, atten: 0, cat: null };
  const adoor = (id, k, o) => { defBlock(id, 'Automatic Door', RT_SHAPE, 'adoor_frame', with_(AD, o)); BLOCK_SHAPE[id] = k; };
  adoor(B.AUTO_DOOR, SH_ADOOR, { solid: true, cat: 'mechanisms' });
  adoor(B.AUTO_DOOR_TOP, SH_ADOOR_TOP, { solid: true });
  adoor(B.AUTO_DOOR_OPEN, SH_ADOOR_OPEN, { solid: false });
  adoor(B.AUTO_DOOR_OPEN_TOP, SH_ADOOR_OPEN_TOP, { solid: false });
  for (const id of [B.LEVER, B.LEVER_ON, B.BUTTON, B.BUTTON_ON, B.WOOD_BUTTON, B.WOOD_BUTTON_ON, B.PLATE, B.PLATE_ON, B.WOOD_PLATE, B.WOOD_PLATE_ON,
    B.WIRE, B.WIRE_ON, B.SIGNAL_LAMP, B.SIGNAL_LAMP_ON, B.PISTON, B.PISTON_ON, B.STICKY_PISTON, B.STICKY_PISTON_ON, B.TIMER, B.TIMER_ON, B.SIGNAL_BLOCK,
    B.TNT, B.DOOR, B.DOOR_OPEN, B.TRAPDOOR, B.TRAPDOOR_OPEN]) MECH_JOIN[id] = 1;
}
