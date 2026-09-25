'use strict';
// Box models for mobs, their procedurally painted skins (one 2D atlas) and extruded 3D
// meshes for item sprites. Model units are pixels (1/16 block); models face +Z.

const ATLAS_W = 512, ATLAS_H = 1024, SKIN_W = 128, SKIN_H = 64;

// part: { id, box: [x0, y0, z0, x1, y1, z1], pivot, parent, uv: shared texture key, role }
const MOB_MODELS = {
  pig: [
    { id: 'body', box: [-5, 6, -8, 5, 14, 8] },
    { id: 'head', box: [-4, 8, 7, 4, 16, 15], pivot: [0, 12, 8], role: 'head' },
    { id: 'snout', box: [-2, 9, 15, 2, 12, 16], parent: 'head' },
    { id: 'leg0', box: [-5, 0, 3, -1, 6, 7], pivot: [-3, 6, 5], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [1, 0, 3, 5, 6, 7], pivot: [3, 6, 5], uv: 'leg', role: 'legB' },
    { id: 'leg2', box: [-5, 0, -7, -1, 6, -3], pivot: [-3, 6, -5], uv: 'leg', role: 'legB' },
    { id: 'leg3', box: [1, 0, -7, 5, 6, -3], pivot: [3, 6, -5], uv: 'leg', role: 'legA' },
  ],
  cow: [
    { id: 'body', box: [-6, 12, -9, 6, 22, 9] },
    { id: 'head', box: [-4, 17, 8, 4, 25, 14], pivot: [0, 20, 8], role: 'head' },
    { id: 'hornL', box: [-5, 23, 10, -4, 26, 11], parent: 'head', uv: 'horn' },
    { id: 'hornR', box: [4, 23, 10, 5, 26, 11], parent: 'head', uv: 'horn' },
    { id: 'leg0', box: [-6, 0, 5, -2, 12, 9], pivot: [-4, 12, 7], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [2, 0, 5, 6, 12, 9], pivot: [4, 12, 7], uv: 'leg', role: 'legB' },
    { id: 'leg2', box: [-6, 0, -8, -2, 12, -4], pivot: [-4, 12, -6], uv: 'leg', role: 'legB' },
    { id: 'leg3', box: [2, 0, -8, 6, 12, -4], pivot: [4, 12, -6], uv: 'leg', role: 'legA' },
  ],
  sheep: [
    { id: 'body', box: [-4, 12, -8, 4, 20, 8] },
    { id: 'wool', box: [-6, 11, -9, 6, 22, 9], role: 'wool' },
    { id: 'head', box: [-3, 16, 8, 3, 22, 16], pivot: [0, 18, 8], role: 'head' },
    { id: 'leg0', box: [-5, 0, 3, -1, 12, 7], pivot: [-3, 12, 5], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [1, 0, 3, 5, 12, 7], pivot: [3, 12, 5], uv: 'leg', role: 'legB' },
    { id: 'leg2', box: [-5, 0, -7, -1, 12, -3], pivot: [-3, 12, -5], uv: 'leg', role: 'legB' },
    { id: 'leg3', box: [1, 0, -7, 5, 12, -3], pivot: [3, 12, -5], uv: 'leg', role: 'legA' },
  ],
  chicken: [
    { id: 'body', box: [-3, 4, -4, 3, 10, 4] },
    { id: 'head', box: [-2, 8, 3, 2, 14, 6], pivot: [0, 9, 4], role: 'head' },
    { id: 'beak', box: [-2, 11, 6, 2, 13, 8], parent: 'head' },
    { id: 'wattle', box: [-1, 9, 6, 1, 11, 7], parent: 'head' },
    { id: 'wingL', box: [-4, 5, -3, -3, 9, 3], pivot: [-3, 9, 0], uv: 'wing', role: 'wingL' },
    { id: 'wingR', box: [3, 5, -3, 4, 9, 3], pivot: [3, 9, 0], uv: 'wing', role: 'wingR' },
    { id: 'leg0', box: [-2, 0, 0, -1, 4, 1], pivot: [-1.5, 4, 0.5], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [1, 0, 0, 2, 4, 1], pivot: [1.5, 4, 0.5], uv: 'leg', role: 'legB' },
  ],
  zombie: [
    { id: 'body', box: [-4, 12, -2, 4, 24, 2] },
    { id: 'head', box: [-4, 24, -4, 4, 32, 4], pivot: [0, 24, 0], role: 'head' },
    { id: 'armL', box: [-8, 12, -2, -4, 24, 2], pivot: [-6, 22, 0], uv: 'arm', role: 'armL' },
    { id: 'armR', box: [4, 12, -2, 8, 24, 2], pivot: [6, 22, 0], uv: 'arm', role: 'armR' },
    { id: 'legL', box: [-4, 0, -2, 0, 12, 2], pivot: [-2, 12, 0], uv: 'leg', role: 'legA' },
    { id: 'legR', box: [0, 0, -2, 4, 12, 2], pivot: [2, 12, 0], uv: 'leg', role: 'legB' },
  ],
  skeleton: [
    { id: 'body', box: [-4, 12, -2, 4, 24, 2] },
    { id: 'head', box: [-4, 24, -4, 4, 32, 4], pivot: [0, 24, 0], role: 'head' },
    { id: 'armL', box: [-6, 12, -1, -4, 24, 1], pivot: [-5, 22, 0], uv: 'arm', role: 'armL' },
    { id: 'armR', box: [4, 12, -1, 6, 24, 1], pivot: [5, 22, 0], uv: 'arm', role: 'armR' },
    { id: 'legL', box: [-3, 0, -1, -1, 12, 1], pivot: [-2, 12, 0], uv: 'leg', role: 'legA' },
    { id: 'legR', box: [1, 0, -1, 3, 12, 1], pivot: [2, 12, 0], uv: 'leg', role: 'legB' },
  ],
  spider: [
    { id: 'abdomen', box: [-5, 4, -14, 5, 12, -2] },
    { id: 'thorax', box: [-3, 5, -2, 3, 11, 4] },
    { id: 'head', box: [-4, 4, 4, 4, 12, 12], pivot: [0, 8, 4], role: 'head' },
    ...[0, 1, 2, 3].flatMap((i) => [-1, 1].map((side) => ({
      id: 'sleg' + i + (side < 0 ? 'L' : 'R'), box: [0, -1, -1, 16, 1, 1], pivot: [side * 3, 8, 3 - i * 1.6],
      uv: 'sleg', role: 'spiderLeg', legIndex: i, side,
    }))),
  ],
  fusecap: [
    { id: 'body', box: [-4, 6, -3, 4, 18, 3] },
    { id: 'head', box: [-7, 16, -7, 7, 24, 7], pivot: [0, 16, 0], role: 'head' },
    { id: 'capTop', box: [-5, 24, -5, 5, 27, 5], parent: 'head' },
    { id: 'leg0', box: [-4, 0, -6, 0, 6, -2], pivot: [-2, 6, -4], uv: 'leg', role: 'legA' },
    { id: 'leg1', box: [0, 0, -6, 4, 6, -2], pivot: [2, 6, -4], uv: 'leg', role: 'legB' },
    { id: 'leg2', box: [-4, 0, 2, 0, 6, 6], pivot: [-2, 6, 4], uv: 'leg', role: 'legB' },
    { id: 'leg3', box: [0, 0, 2, 4, 6, 6], pivot: [2, 6, 4], uv: 'leg', role: 'legA' },
  ],
  // first-person arm (hangs down from the shoulder at the origin)
  player: [
    { id: 'arm', box: [-2, -12, -2, 2, 0, 2] },
  ],
  // other players online; shirt and sleeves take each player's colour
  avatar: [
    { id: 'body', box: [-4, 12, -2, 4, 24, 2], tint: true },
    { id: 'head', box: [-4, 24, -4, 4, 32, 4], pivot: [0, 24, 0], role: 'head' },
    { id: 'armL', box: [-8, 12, -2, -4, 24, 2], pivot: [-6, 22, 0], uv: 'arm', role: 'armL', tint: true },
    { id: 'armR', box: [4, 12, -2, 8, 24, 2], pivot: [6, 22, 0], uv: 'arm', role: 'armR', tint: true },
    { id: 'legL', box: [-4, 0, -2, 0, 12, 2], pivot: [-2, 12, 0], uv: 'leg', role: 'legA' },
    { id: 'legR', box: [0, 0, -2, 4, 12, 2], pivot: [2, 12, 0], uv: 'leg', role: 'legB' },
  ],
};
const MOB_SKIN_SLOT = { pig: 0, cow: 1, sheep: 2, chicken: 3, zombie: 4, skeleton: 5, spider: 6, fusecap: 7, player: 8, avatar: 11 };

// Box UV layout: row 1 [gap d][top w][bottom w], row 2 [left d][front w][right d][back w].
function boxFaces(u, v, w, h, d) {
  return {
    top: [u + d, v, w, d], bottom: [u + d + w, v, w, d],
    left: [u, v + d, d, h], front: [u + d, v + d, w, h], right: [u + d + w, v + d, d, h], back: [u + 2 * d + w, v + d, w, h],
  };
}

// Shelf-pack each model's distinct UV boxes into its skin slot.
function layoutSkins() {
  for (const [type, parts] of Object.entries(MOB_MODELS)) {
    const slot = MOB_SKIN_SLOT[type];
    const ox = (slot % 4) * SKIN_W, oy = Math.floor(slot / 4) * SKIN_H;
    const keys = new Map();
    for (const p of parts) {
      const key = p.uv || p.id;
      const [x0, y0, z0, x1, y1, z1] = p.box;
      const dims = [Math.round(x1 - x0), Math.round(y1 - y0), Math.round(z1 - z0)];
      if (!keys.has(key)) keys.set(key, { dims, parts: [] });
      keys.get(key).parts.push(p);
    }
    const list = [...keys.values()].sort((a, b) => (b.dims[2] + b.dims[1]) - (a.dims[2] + a.dims[1]));
    let cx = 0, cy = 0, rowH = 0;
    for (const e of list) {
      const [w, h, d] = e.dims;
      const bw = 2 * (w + d), bh = d + h;
      if (cx + bw > SKIN_W) { cx = 0; cy += rowH; rowH = 0; }
      if (cy + bh > SKIN_H) throw new Error('Skin layout overflow for ' + type);
      const faces = boxFaces(ox + cx, oy + cy, w, h, d);
      for (const p of e.parts) { p.faces = faces; p.dims = e.dims; }
      e.faces = faces;
      cx += bw; rowH = Math.max(rowH, bh);
    }
    parts.skinKeys = keys;
  }
}

// ---- skin painting ----
function paintSkins() {
  layoutSkins();
  const img = new ImageData(ATLAS_W, ATLAS_H);
  const D = img.data;
  const rng = mulberry32(90210);
  const px = (x, y, c, f = 1) => {
    if (x < 0 || y < 0 || x >= ATLAS_W || y >= ATLAS_H) return;
    const i = (y * ATLAS_W + x) * 4;
    D[i] = clamp(c[0] * f, 0, 255); D[i + 1] = clamp(c[1] * f, 0, 255); D[i + 2] = clamp(c[2] * f, 0, 255); D[i + 3] = 255;
  };
  const rect = (r, fn) => { for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) { const c = fn(x, y, r[2], r[3]); if (c) px(r[0] + x, r[1] + y, c[0], c[1]); } };
  const noise = (c, a = 0.1) => () => [c, 1 - a / 2 + rng() * a];
  const partFaces = (type, id) => MOB_MODELS[type].find((p) => p.id === id || p.uv === id).faces;
  const allFaces = (f, fn) => { for (const k of ['top', 'bottom', 'left', 'front', 'right', 'back']) rect(f[k], fn); };
  const eyes = (r, y, gap, white = [240, 240, 240], pupil = [20, 20, 24], sz = 2) => {
    const cx = Math.floor(r[2] / 2);
    for (const s of [-1, 1]) {
      const ex = s < 0 ? cx - gap - sz : cx + gap;
      for (let j = 0; j < sz; j++) for (let i = 0; i < sz; i++) {
        const inner = s < 0 ? i === sz - 1 : i === 0;
        px(r[0] + ex + i, r[1] + y + j, inner ? pupil : white);
      }
    }
  };

  // pig
  {
    const pink = [238, 158, 156];
    const skin = () => [pink, 0.93 + rng() * 0.1 - (rng() < 0.05 ? 0.1 : 0)];
    allFaces(partFaces('pig', 'body'), skin);
    const head = partFaces('pig', 'head');
    allFaces(head, skin);
    eyes(head.front, 2, 1);
    allFaces(partFaces('pig', 'snout'), () => [[222, 120, 132], 1]);
    const sn = partFaces('pig', 'snout').front;
    px(sn[0] + 1, sn[1] + 1, [120, 50, 60]); px(sn[0] + 2, sn[1] + 1, [120, 50, 60]);
    const leg = partFaces('pig', 'leg');
    allFaces(leg, (x, y, w, h) => [y >= h - 2 ? [110, 70, 60] : pink, 0.92 + rng() * 0.08]);
  }
  // cow
  {
    const brown = [74, 52, 40], white = [236, 232, 226];
    const patch = new Float32Array(4096);
    for (let i = 0; i < patch.length; i++) patch[i] = rng();
    const hide = (x, y) => [((x * 7 + y * 13) % 17 < 5 || patch[(x * 31 + y * 17) & 4095] < 0.08) ? white : brown, 0.92 + rng() * 0.1];
    allFaces(partFaces('cow', 'body'), hide);
    const head = partFaces('cow', 'head');
    allFaces(head, () => [brown, 0.9 + rng() * 0.1]);
    rect(head.front, (x, y, w, h) => [y >= h - 3 ? [214, 150, 140] : (x > 1 && x < w - 2 && y > 0) ? white : brown, 0.95 + rng() * 0.06]);
    eyes(head.front, 2, 1);
    const hf = head.front;
    px(hf[0] + 2, hf[1] + hf[3] - 2, [80, 40, 40]); px(hf[0] + hf[2] - 3, hf[1] + hf[3] - 2, [80, 40, 40]);
    allFaces(partFaces('cow', 'horn'), () => [[226, 216, 190], 1]);
    allFaces(partFaces('cow', 'leg'), (x, y, w, h) => [y >= h - 2 ? [60, 50, 44] : y < 4 ? brown : white, 0.93 + rng() * 0.07]);
  }
  // sheep
  {
    const wool = [236, 234, 228], skinC = [214, 190, 170];
    allFaces(partFaces('sheep', 'wool'), () => [wool, 0.86 + rng() * 0.16]);
    allFaces(partFaces('sheep', 'body'), () => [skinC, 0.9 + rng() * 0.1]);
    const head = partFaces('sheep', 'head');
    allFaces(head, () => [skinC, 0.92 + rng() * 0.08]);
    rect(head.top, () => [wool, 0.9 + rng() * 0.1]);
    eyes(head.front, 2, 1, [236, 236, 236], [30, 26, 24], 1);
    px(head.front[0] + 2, head.front[1] + 4, [140, 100, 100]); px(head.front[0] + 3, head.front[1] + 4, [140, 100, 100]);
    allFaces(partFaces('sheep', 'leg'), (x, y, w, h) => [y < 5 ? wool : y >= h - 2 ? [90, 80, 70] : skinC, 0.9 + rng() * 0.1]);
  }
  // chicken
  {
    const white = [244, 244, 240];
    allFaces(partFaces('chicken', 'body'), () => [white, 0.9 + rng() * 0.1]);
    const head = partFaces('chicken', 'head');
    allFaces(head, () => [white, 0.92 + rng() * 0.08]);
    eyes(head.front, 1, 1, [30, 30, 30], [30, 30, 30], 1);
    allFaces(partFaces('chicken', 'beak'), () => [[238, 170, 40], 1]);
    allFaces(partFaces('chicken', 'wattle'), () => [[210, 40, 40], 1]);
    allFaces(partFaces('chicken', 'wing'), () => [white, 0.85 + rng() * 0.1]);
    allFaces(partFaces('chicken', 'leg'), () => [[236, 160, 40], 1]);
  }
  // zombie
  {
    const green = [96, 146, 84], shirt = [44, 124, 132], pants = [62, 62, 142];
    const head = partFaces('zombie', 'head');
    allFaces(head, () => [green, 0.9 + rng() * 0.12]);
    rect(head.top, () => [[60, 90, 50], 0.9 + rng() * 0.2]);
    const f = head.front;
    for (const ex of [1, 5]) { px(f[0] + ex, f[1] + 3, [20, 30, 20]); px(f[0] + ex + 1, f[1] + 3, [40, 20, 20]); }
    for (let x = 2; x < 6; x++) px(f[0] + x, f[1] + 6, [40, 60, 34]);
    allFaces(partFaces('zombie', 'body'), (x, y, w, h) => [y > h - 3 ? pants : shirt, 0.9 + rng() * 0.12 - ((x * 3 + y) % 7 === 0 ? 0.15 : 0)]);
    allFaces(partFaces('zombie', 'arm'), (x, y) => [y < 4 ? shirt : green, 0.9 + rng() * 0.1]);
    allFaces(partFaces('zombie', 'leg'), (x, y, w, h) => [y >= h - 2 ? [70, 70, 74] : pants, 0.88 + rng() * 0.12]);
  }
  // skeleton
  {
    const bone = [206, 206, 200];
    const head = partFaces('skeleton', 'head');
    allFaces(head, () => [bone, 0.9 + rng() * 0.1]);
    const f = head.front;
    for (const ex of [1, 5]) for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) px(f[0] + ex + i, f[1] + 3 + j, [30, 30, 32]);
    px(f[0] + 3, f[1] + 5, [60, 60, 60]); px(f[0] + 4, f[1] + 5, [60, 60, 60]);
    for (let x = 1; x < 7; x++) px(f[0] + x, f[1] + 7, x & 1 ? [40, 40, 40] : bone);
    allFaces(partFaces('skeleton', 'body'), (x, y) => [(y % 3 === 1) ? [60, 60, 62] : bone, x === 3 || x === 4 ? 1 : 0.95]);
    allFaces(partFaces('skeleton', 'arm'), () => [bone, 0.88 + rng() * 0.12]);
    allFaces(partFaces('skeleton', 'leg'), () => [bone, 0.88 + rng() * 0.12]);
  }
  // spider
  {
    const dark = [52, 44, 40];
    allFaces(partFaces('spider', 'abdomen'), (x, y) => [((x + y * 2) % 9 === 0) ? [120, 30, 28] : dark, 0.85 + rng() * 0.2]);
    allFaces(partFaces('spider', 'thorax'), () => [dark, 0.8 + rng() * 0.2]);
    const head = partFaces('spider', 'head');
    allFaces(head, () => [dark, 0.85 + rng() * 0.2]);
    const f = head.front;
    for (const [x, y] of [[1, 3], [2, 3], [5, 3], [6, 3], [2, 5], [5, 5], [3, 2], [4, 2]]) px(f[0] + x, f[1] + y, [230, 30, 30]);
    allFaces(partFaces('spider', 'sleg'), () => [dark, 0.8 + rng() * 0.25]);
  }
  // fusecap: a walking mushroom that hisses and bursts
  {
    const cream = [232, 222, 194], cap = [206, 42, 40];
    const body = partFaces('fusecap', 'body');
    allFaces(body, () => [cream, 0.9 + rng() * 0.1]);
    const f = body.front;
    for (const ex of [1, 5]) for (let j = 0; j < 3; j++) px(f[0] + ex + (j === 2 ? 1 : 0), f[1] + 2 + j, [24, 20, 20]);
    for (let x = 2; x < 6; x++) px(f[0] + x, f[1] + 7 + (x & 1), [60, 30, 30]);
    const spot = (x, y) => ((x * 5 + y * 3) % 11 === 0 || (x * 3 + y * 7) % 13 === 0);
    allFaces(partFaces('fusecap', 'head'), (x, y) => [spot(x, y) ? [246, 240, 230] : cap, 0.9 + rng() * 0.1]);
    rect(partFaces('fusecap', 'head').bottom, (x, y) => [[196, 170, 140], (x + y) % 2 ? 0.9 : 1]);
    allFaces(partFaces('fusecap', 'capTop'), (x, y) => [spot(x + 2, y + 1) ? [246, 240, 230] : cap, 0.92 + rng() * 0.1]);
    allFaces(partFaces('fusecap', 'leg'), () => [[206, 196, 170], 0.88 + rng() * 0.1]);
  }
  // player arm: skin with a rolled-up sleeve
  {
    const skinC = [226, 172, 136], sleeve = [52, 120, 170];
    allFaces(partFaces('player', 'arm'), (x, y, w, h) => [y < 4 ? sleeve : skinC, (y === 4 ? 0.8 : 1) * (0.95 + rng() * 0.05)]);
    rect(partFaces('player', 'arm').bottom, () => [skinC, 0.92]);
  }

  // online avatar: neutral light shirt (tinted per player), jeans, hair and a friendly face
  {
    const skinC = [222, 170, 132], shirt = [236, 236, 236], jeans = [58, 72, 118], hair = [70, 46, 30];
    const head = partFaces('avatar', 'head');
    allFaces(head, () => [skinC, 0.94 + rng() * 0.06]);
    rect(head.top, () => [hair, 0.9 + rng() * 0.15]);
    rect(head.back, (x, y) => [y < 6 ? hair : skinC, 0.92 + rng() * 0.1]);
    for (const k of ['left', 'right']) rect(head[k], (x, y) => [y < 3 ? hair : skinC, 0.93 + rng() * 0.08]);
    rect(head.front, (x, y) => [y < 2 ? hair : skinC, 0.95 + rng() * 0.05]);
    const f = head.front;
    for (const ex of [1, 5]) { px(f[0] + ex, f[1] + 4, [250, 250, 250]); px(f[0] + ex + 1, f[1] + 4, [48, 90, 160]); }
    for (let x = 3; x < 5; x++) px(f[0] + x, f[1] + 6, [150, 90, 80]);
    allFaces(partFaces('avatar', 'body'), (x, y) => [shirt, (y === 0 ? 0.85 : 1) * (0.93 + rng() * 0.07)]);
    allFaces(partFaces('avatar', 'arm'), (x, y, w, h) => [y >= h - 3 ? [255, 214, 186] : shirt, 0.92 + rng() * 0.08]);
    allFaces(partFaces('avatar', 'leg'), (x, y, w, h) => [y >= h - 2 ? [40, 36, 36] : jeans, 0.88 + rng() * 0.12]);
  }

  paintJetSwatches(px, rng);
  paintPlayerSkins(px, rng);

  const cv = document.createElement('canvas');
  cv.width = ATLAS_W; cv.height = ATLAS_H;
  cv.getContext('2d').putImageData(img, 0, 0);
  SKIN_ATLAS = cv;
  return cv;
}

// ---- fighter jet paint: 32x32 swatches stretched over each box face ----
const JET_SWATCHES = ['hull', 'hullDark', 'belly', 'glass', 'nozzle', 'intake', 'white', 'red',
  'tire', 'metal', 'glow', 'navRed', 'navGreen', 'navWhite', 'roundel', 'tail'];
const JET_SWATCH_RECT = {};
JET_SWATCHES.forEach((n, i) => {
  const slot = 9 + (i >> 3), k = i & 7;
  const x = (slot % 4) * SKIN_W + (k & 3) * 32, y = Math.floor(slot / 4) * SKIN_H + (k >> 2) * 32;
  JET_SWATCH_RECT[n] = [x + 1, y + 1, 30, 30];
});

function paintJetSwatches(px, rng) {
  const at = (n) => JET_SWATCH_RECT[n];
  const fill = (n, fn) => { const [x0, y0] = at(n); for (let y = -1; y < 31; y++) for (let x = -1; x < 31; x++) { const r = fn(clamp(x, 0, 29), clamp(y, 0, 29)); px(x0 + x, y0 + y, r[0], r[1]); } };
  // panel lines and rivets on painted metal
  const panels = (base) => (x, y) => {
    let f = 0.95 + rng() * 0.05;
    if (x === 9 || x === 21 || y === 14) f *= 0.84;
    if ((x === 11 || x === 19) && y % 4 === 1) f *= 0.9;
    if (x === 0 || y === 0) f *= 1.04;
    return [base, f];
  };
  fill('hull', panels([128, 138, 150]));
  fill('hullDark', panels([88, 96, 108]));
  fill('belly', panels([172, 178, 186]));
  fill('glass', (x, y) => {
    const c = mixc([90, 124, 146], [24, 36, 50], y / 29);
    const glint = Math.abs(x - y * 0.6 - 6) < 1.5 ? 1.5 : 1;
    return [c, glint];
  });
  fill('nozzle', (x, y) => [((x >> 2) + (y >> 2)) % 2 ? [74, 70, 66] : [98, 92, 84], 0.9 + rng() * 0.08]);
  fill('intake', (x, y) => [[18, 18, 22], 0.9 + (y / 29) * 0.3]);
  fill('white', (x, y) => [[228, 228, 222], (x === 14 ? 0.86 : 1) * (0.97 + rng() * 0.03)]);
  fill('red', () => [[196, 40, 36], 0.95 + rng() * 0.05]);
  fill('tire', (x, y) => [[28, 28, 30], y % 5 === 0 ? 0.7 : 1]);
  fill('metal', (x, y) => [[168, 170, 176], 0.9 + (x / 29) * 0.2]);
  fill('glow', (x, y) => {
    const d = Math.hypot(x - 14.5, y - 14.5) / 20;
    return [mixc([255, 250, 225], [255, 128, 34], clamp(d, 0, 1)), 1];
  });
  fill('navRed', () => [[255, 70, 50], 1]);
  fill('navGreen', () => [[70, 255, 120], 1]);
  fill('navWhite', () => [[255, 255, 255], 1]);
  fill('roundel', (x, y) => {
    const d = Math.hypot(x - 14.5, y - 14.5);
    if (d < 4) return [[200, 40, 36], 1];
    if (d < 8) return [[236, 236, 232], 1];
    if (d < 12) return [[36, 64, 150], 1];
    return panels([128, 138, 150])(x, y);
  });
  fill('tail', (x, y) => {
    // a red chevron band and a dark tip on the fins
    if (y < 5) return [[80, 88, 98], 1];
    const band = y - 10 - Math.abs(x - 15) * 0.35;
    if (band > 0 && band < 5) return [[196, 40, 36], 1];
    return panels([128, 138, 150])(x, y);
  });
}

// ---- extruded item sprites ----
// Quads in item space: x,y in 0..1 (y up), z = +-thickness/2. Edges are merged into runs whose
// texture coordinates walk along the run, so every edge pixel keeps its own colour.
const spriteMeshCache = new Map();
function spriteMesh(tiles, layer) {
  let m = spriteMeshCache.get(layer);
  if (m) return m;
  const tile = tiles[layer];
  const op = (x, y) => x >= 0 && y >= 0 && x < TS && y < TS && tile[(y * TS + x) * 4 + 3] > 127;
  const t = 1 / 32, h = t / 2, s = 1 / TS;
  const quads = [];
  const Y = (py) => 1 - py * s;
  quads.push({ p: [[0, 0, h], [1, 0, h], [1, 1, h], [0, 1, h]], uv: [[0, 1], [1, 1], [1, 0], [0, 0]], n: [0, 0, 1] });
  quads.push({ p: [[1, 0, -h], [0, 0, -h], [0, 1, -h], [1, 1, -h]], uv: [[1, 1], [0, 1], [0, 0], [1, 0]], n: [0, 0, -1] });
  for (let x = 0; x < TS; x++) for (const side of [-1, 1]) {
    let y = 0;
    while (y < TS) {
      if (!(op(x, y) && !op(x + side, y))) { y++; continue; }
      const y0 = y;
      while (y < TS && op(x, y) && !op(x + side, y)) y++;
      const X = (side < 0 ? x : x + 1) * s, u = (x + 0.5) * s;
      const p = side < 0
        ? [[X, Y(y), -h], [X, Y(y), h], [X, Y(y0), h], [X, Y(y0), -h]]
        : [[X, Y(y), h], [X, Y(y), -h], [X, Y(y0), -h], [X, Y(y0), h]];
      quads.push({ p, uv: [[u, y * s], [u, y * s], [u, y0 * s], [u, y0 * s]], n: [side, 0, 0] });
    }
  }
  for (let y = 0; y < TS; y++) for (const side of [-1, 1]) {
    let x = 0;
    while (x < TS) {
      if (!(op(x, y) && !op(x, y + side))) { x++; continue; }
      const x0 = x;
      while (x < TS && op(x, y) && !op(x, y + side)) x++;
      const YY = side < 0 ? Y(y) : Y(y + 1), v = (y + 0.5) * s;
      const p = side < 0
        ? [[x0 * s, YY, h], [x * s, YY, h], [x * s, YY, -h], [x0 * s, YY, -h]]
        : [[x0 * s, YY, -h], [x * s, YY, -h], [x * s, YY, h], [x0 * s, YY, h]];
      quads.push({ p, uv: [[x0 * s, v], [x * s, v], [x * s, v], [x0 * s, v]], n: [0, -side, 0] });
    }
  }
  spriteMeshCache.set(layer, quads);
  return quads;
}
