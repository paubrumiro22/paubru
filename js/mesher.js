'use strict';
// Builds chunk meshes: flood-filled sky/block light over a padded region, smooth lighting,
// per-vertex ambient occlusion, shaped blocks (slabs, torches, ladders, beds) and separate
// opaque / cutout / water vertex streams. The light it computes is kept per chunk so
// entities and mob spawning can read it.
//
// Vertex layout (20 bytes):
//   u16 x*64, y*64, z*64, textureLayer
//   u8  normalIndex | flags<<3, ao(0-3), skyLight(0-255), blockLight(0-255)
//   u8  tintR, tintG, tintB (1.0 = 200), unused
//   u8  u*16, v*16, unused, unused

const LP = 14;                 // light padding around the chunk
const RS = CS + 2 * LP;        // padded width
const RSS = RS * RS;
const PH = CH + 2;             // padded height (y = -1 .. CH)
const POS_SCALE = 64;          // vertex position units per block
const P4 = POS_SCALE / 16;     // per 1/16 of a block
const VERT_BYTES = 20;
const padBlocks = new Uint8Array(RSS * PH);
const skyL = new Uint8Array(RSS * PH);
const blkL = new Uint8Array(RSS * PH);
const QCAP = RSS * PH;
const lightQ = new Int32Array(QCAP);
const colTop = new Int16Array(RSS);

function pidx(x, y, z) { return ((y + 1) * RS + z) * RS + x; }

class MeshBuilder {
  constructor(cap) { this.alloc(cap); this.count = 0; }
  alloc(cap) {
    const old = this.u8;
    this.buf = new ArrayBuffer(cap * VERT_BYTES);
    this.u16 = new Uint16Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    if (old) this.u8.set(old.subarray(0, this.count * VERT_BYTES));
    this.cap = cap;
  }
  ensure(n) { if (this.count + n > this.cap) this.alloc(Math.max(this.cap * 2, this.count + n)); }
  v(x, y, z, layer, nf, ao, sky, blk, r, g, b, u, vv, fu = 0, fv = 0, ta = 0) {
    const o = this.count++;
    const i16 = o * 10, i8 = o * VERT_BYTES;
    this.u16[i16] = x; this.u16[i16 + 1] = y; this.u16[i16 + 2] = z; this.u16[i16 + 3] = layer;
    const u8 = this.u8;
    u8[i8 + 8] = nf; u8[i8 + 9] = ao; u8[i8 + 10] = sky; u8[i8 + 11] = blk;
    u8[i8 + 12] = r; u8[i8 + 13] = g; u8[i8 + 14] = b; u8[i8 + 15] = ta;
    u8[i8 + 16] = u; u8[i8 + 17] = vv; u8[i8 + 18] = fu; u8[i8 + 19] = fv;
  }
  data() { return this.u8.subarray(0, this.count * VERT_BYTES); }
}

const meshOpaque = new MeshBuilder(1 << 15);
const meshCutout = new MeshBuilder(1 << 14);
const meshWater = new MeshBuilder(1 << 13);

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const OPPOSITE = [1, 0, 3, 2, 5, 4];
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const AXIS_STRIDE = [1, RSS, RS];            // x, y, z in padded index space
const DIR_OFFSET = DIRS.map(([x, y, z]) => x * AXIS_STRIDE[0] + y * AXIS_STRIDE[1] + z * AXIS_STRIDE[2]);
const FACE_TANGENT_AXES = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];

// Texture coordinates (0..1) of a point inside a block for face d. Matches the tangent
// frames used for normal mapping in the shaders.
function faceU(d, x, y, z) { return d === 0 ? 1 - z : d === 1 ? z : d === 5 ? 1 - x : x; }
function faceV(d, x, y, z) { return d === 2 ? z : d === 3 ? 1 - z : 1 - y; }

// Precomputed per face/corner: offsets of the two side cells and the corner cell.
const AO_OFFSETS = FACE_CORNERS.map((corners, d) => corners.map((c) => {
  const [a, b] = FACE_TANGENT_AXES[d];
  const da = c[a] ? 1 : -1, db = c[b] ? 1 : -1;
  const s1 = da * AXIS_STRIDE[a], s2 = db * AXIS_STRIDE[b];
  return [s1, s2, s1 + s2];
}));
const CORNER_U = FACE_CORNERS.map((cs, d) => cs.map((c) => Math.round(faceU(d, c[0], c[1], c[2]) * 16)));
const CORNER_V = FACE_CORNERS.map((cs, d) => cs.map((c) => Math.round(faceV(d, c[0], c[1], c[2]) * 16)));

function fillPadded(world, cx, cz, top) {
  padBlocks.fill(0);
  // y = -1 layer is solid bedrock
  padBlocks.fill(B.BEDROCK, 0, RSS);
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = world.getChunk(cx + dx, cz + dz);
    if (!n) continue;
    const sx = LP + dx * CS, sz = LP + dz * CS;
    const lx0 = Math.max(0, -sx), lx1 = Math.min(CS, RS - sx);
    const lz0 = Math.max(0, -sz), lz1 = Math.min(CS, RS - sz);
    if (lx1 <= lx0 || lz1 <= lz0) continue;
    const yMax = Math.min(top, n.maxY);
    const src = n.blocks;
    for (let y = 0; y <= yMax; y++) {
      for (let lz = lz0; lz < lz1; lz++) {
        const s = (y * CS + lz) * CS;
        padBlocks.set(src.subarray(s + lx0, s + lx1), pidx(sx + lx0, y, sz + lz));
      }
    }
  }
}

function propagate(light, head, tail, top) {
  while (head !== tail) {
    const i = lightQ[head];
    head = head + 1 === QCAP ? 0 : head + 1;
    const L = light[i];
    if (L <= 1) continue;
    const x = i % RS, rest = (i / RS) | 0, z = rest % RS, py = (rest / RS) | 0; // py = y + 1
    for (let k = 0; k < 6; k++) {
      if (k === 0 && x === RS - 1) continue;
      if (k === 1 && x === 0) continue;
      if (k === 2 && py >= top + 1) continue;
      if (k === 3 && py <= 1) continue;
      if (k === 4 && z === RS - 1) continue;
      if (k === 5 && z === 0) continue;
      const n = i + DIR_OFFSET[k];
      const a = BLOCK_ATTEN[padBlocks[n]];
      if (a >= 15) continue;
      const nl = L - (a > 1 ? a : 1);
      if (nl > light[n]) {
        light[n] = nl;
        const nt = tail + 1 === QCAP ? 0 : tail + 1;
        if (nt !== head) { lightQ[tail] = n; tail = nt; }
      }
    }
  }
}

function computeLight(top) {
  skyL.fill(0);
  blkL.fill(0);
  // direct skylight columns
  for (let z = 0; z < RS; z++) for (let x = 0; x < RS; x++) {
    let y = top;
    while (y >= 0) {
      const i = pidx(x, y, z);
      if (BLOCK_ATTEN[padBlocks[i]] > 1) break;
      skyL[i] = 15;
      y--;
    }
    colTop[z * RS + x] = y + 1;
  }
  let head = 0, tail = 0;
  for (let z = 0; z < RS; z++) for (let x = 0; x < RS; x++) {
    const ct = colTop[z * RS + x];
    let hi = ct;
    if (x > 0) hi = Math.max(hi, colTop[z * RS + x - 1]);
    if (x < RS - 1) hi = Math.max(hi, colTop[z * RS + x + 1]);
    if (z > 0) hi = Math.max(hi, colTop[(z - 1) * RS + x]);
    if (z < RS - 1) hi = Math.max(hi, colTop[(z + 1) * RS + x]);
    hi = Math.min(hi, top);
    for (let y = ct; y <= hi; y++) {
      lightQ[tail++] = pidx(x, y, z);
      if (tail >= QCAP - 1) break;
    }
    if (tail >= QCAP - 1) break;
  }
  propagate(skyL, head, tail, top);

  // block light from emitters
  head = 0; tail = 0;
  const end = pidx(0, top + 1, 0);
  for (let i = RSS; i < end; i++) {
    const e = BLOCK_EMIT[padBlocks[i]];
    if (e) { blkL[i] = e; lightQ[tail++] = i; }
  }
  if (tail) propagate(blkL, head, tail, top);
}

function storeLight(chunk, top) {
  const L = chunk.light || (chunk.light = new Uint8Array(CS * CS * CH));
  for (let y = 0; y < CH; y++) {
    const base = y * CS * CS;
    if (y > top) { L.fill(0xf0, base, base + CS * CS); continue; }
    for (let z = 0; z < CS; z++) {
      let p = pidx(LP, y, z + LP);
      const o = base + z * CS;
      for (let x = 0; x < CS; x++, p++) L[o + x] = (skyL[p] << 4) | blkL[p];
    }
  }
}

// ---- shaped blocks ----
// Emits the faces of an axis-aligned box given in 1/16 units inside block (x, y, z).
// uvFn(d, k, u, v) may remap texture coordinates (bed rotation, torch tops).
const _box = [0, 0, 0, 0, 0, 0];
// lightOut: light every face from the cell it looks into (shaped blocks, which may block light
// themselves and so have none inside).
function emitBox(builder, p, x, y, z, bx0, by0, bz0, bx1, by1, bz1, layerOf, flags, tint, uvFn, lightOut) {
  _box[0] = bx0; _box[1] = by0; _box[2] = bz0; _box[3] = bx1; _box[4] = by1; _box[5] = bz1;
  for (let d = 0; d < 6; d++) {
    const onEdge = d === 0 ? bx1 === 16 : d === 1 ? bx0 === 0 : d === 2 ? by1 === 16 : d === 3 ? by0 === 0 : d === 4 ? bz1 === 16 : bz0 === 0;
    const nIdx = p + DIR_OFFSET[d];
    if (onEdge && BLOCK_OPAQUE[padBlocks[nIdx]]) continue;
    const layer = layerOf(d);
    if (layer < 0) continue;
    const li = onEdge || lightOut ? nIdx : p;
    const s = Math.round(Math.max(skyL[li], skyL[p]) * 17), b2 = Math.round(Math.max(blkL[li], blkL[p]) * 17);
    builder.ensure(4);
    const corners = FACE_CORNERS[d];
    for (let k = 0; k < 4; k++) {
      const c = corners[k];
      const fx = (c[0] ? bx1 : bx0) / 16, fy = (c[1] ? by1 : by0) / 16, fz = (c[2] ? bz1 : bz0) / 16;
      let u = faceU(d, fx, fy, fz), v = faceV(d, fx, fy, fz);
      if (uvFn) { const r = uvFn(d, k, u, v, fx, fy, fz); u = r[0]; v = r[1]; }
      builder.v((x * 16 + fx * 16) * P4, (y * 16 + fy * 16) * P4, (z * 16 + fz * 16) * P4, layer, d | (flags << 3), 3, s, b2,
        tint[0], tint[1], tint[2], Math.round(u * 16), Math.round(v * 16));
    }
  }
}

// Free-form quad (positions in blocks, relative to the chunk) for tilted wall torches.
function emitQuad(builder, pts, uvs, layer, nf, s, b2, tint) {
  builder.ensure(4);
  for (let k = 0; k < 4; k++) {
    const q = pts[k];
    builder.v(Math.round(q[0] * POS_SCALE), Math.round(q[1] * POS_SCALE), Math.round(q[2] * POS_SCALE), layer, nf, 3, s, b2,
      tint[0], tint[1], tint[2], Math.round(uvs[k][0] * 16), Math.round(uvs[k][1] * 16));
  }
}

const WHITE_TINT = [200, 200, 200];

// A flat polygon of a shaped block (3 or 4 points in 1/16 units inside the cell). Axis-aligned
// faces sit on the cell boundary and hide against opaque neighbours; slanted ones carry a slope
// code in the spare tint byte so the shader lights them with the real sloped normal.
const HDIR = (n) => (n[0] > 0.5 ? 0 : n[0] < -0.5 ? 1 : n[2] > 0.5 ? 4 : n[2] < -0.5 ? 5 : -1);
function emitPoly(builder, p, x, y, z, poly, layer, flags) {
  const n = poly.n;
  let d = -1;
  if (!poly.slant) d = n[0] > 0 ? 0 : n[0] < 0 ? 1 : n[1] > 0 ? 2 : n[1] < 0 ? 3 : n[2] > 0 ? 4 : 5;
  if (d >= 0 && BLOCK_OPAQUE[padBlocks[p + DIR_OFFSET[d]]]) return;
  let s, b2;
  if (d >= 0) {
    const li = p + DIR_OFFSET[d];
    s = Math.max(skyL[li], skyL[p]); b2 = Math.max(blkL[li], blkL[p]);
  } else {
    const l1 = p + DIR_OFFSET[n[1] > 0 ? 2 : 3], hd = HDIR(n), l2 = hd >= 0 ? p + DIR_OFFSET[hd] : l1;
    s = Math.max(skyL[l1], skyL[l2], skyL[p]); b2 = Math.max(blkL[l1], blkL[l2], blkL[p]);
  }
  s = Math.round(s * 17); b2 = Math.round(b2 * 17);
  const P = poly.p;
  // front faces wind counter-clockwise seen from outside
  const ax = P[1][0] - P[0][0], ay = P[1][1] - P[0][1], az = P[1][2] - P[0][2];
  const bx = P[2][0] - P[0][0], by = P[2][1] - P[0][1], bz = P[2][2] - P[0][2];
  const flip = (ay * bz - az * by) * n[0] + (az * bx - ax * bz) * n[1] + (ax * by - ay * bx) * n[2] < 0;
  const order = P.length === 3 ? (flip ? [2, 1, 0, 0] : [0, 1, 2, 2]) : (flip ? [3, 2, 1, 0] : [0, 1, 2, 3]);
  const nf = (d >= 0 ? d : n[1] > 0 ? 2 : 3) | (flags << 3);
  builder.ensure(4);
  for (const k of order) {
    const q = P[k];
    let u, v;
    if (poly.uv) { u = poly.uv[k][0]; v = poly.uv[k][1]; } else { u = faceU(d, q[0] / 16, q[1] / 16, q[2] / 16); v = faceV(d, q[0] / 16, q[1] / 16, q[2] / 16); }
    builder.v((x * 16 + q[0]) * P4, (y * 16 + q[1]) * P4, (z * 16 + q[2]) * P4, layer, nf, 3, s, b2, 200, 200, 200,
      Math.round(u * 16), Math.round(v * 16), 0, 0, poly.code);
  }
}

// Shaped, connecting and lantern blocks.
function emitArch(world, p, x, y, z, id, rt, flags, wx, wz) {
  const tex = (d) => BLOCK_TEX[id * 6 + d];
  const pb = padBlocks;
  if (rt === RT_SHAPE) {
    const k = BLOCK_SHAPE[id];
    let boxes;
    if (k === SH_PILLAR) boxes = pillarBoxes(pb[p - RSS] === id, pb[p + RSS] === id);
    else {
      const g = shapeGeom(k, world.getFacing(wx, y, wz));
      for (const poly of g.polys) emitPoly(meshOpaque, p, x, y, z, poly, poly.slant ? tex(poly.n[1] > 0 ? 2 : 3) : tex(poly.n[0] > 0 ? 0 : poly.n[0] < 0 ? 1 : poly.n[1] > 0 ? 2 : poly.n[1] < 0 ? 3 : poly.n[2] > 0 ? 4 : 5), flags);
      boxes = g.boxes;
    }
    for (const b of boxes) emitBox(meshOpaque, p, x, y, z, b[0], b[1], b[2], b[3], b[4], b[5], tex, flags, WHITE_TINT, null, true);
    return;
  }
  if (rt === RT_CONNECT) {
    const kd = BLOCK_CONNECT[id];
    const boxes = connectBoxes(kd, connectsTo(kd, pb[p + 1]), connectsTo(kd, pb[p - 1]), connectsTo(kd, pb[p + RS]), connectsTo(kd, pb[p - RS]), false);
    const builder = kd === CN_PANE ? meshCutout : meshOpaque;
    for (const b of boxes) emitBox(builder, p, x, y, z, b[0], b[1], b[2], b[3], b[4], b[5], tex, flags, WHITE_TINT, null, false);
    return;
  }
  if (rt === RT_LANTERN) {
    const f = world.getFacing(wx, y, wz);
    for (const b of lanternBoxes(f & 8)) emitBox(meshCutout, p, x, y, z, b[0], b[1], b[2], b[3], b[4], b[5], tex, flags, WHITE_TINT, null, false);
  }
}
// outward normal of a wall-mounted block's face index -> [dx, dz]
const FACE_DXZ = { 0: [1, 0], 1: [-1, 0], 4: [0, 1], 5: [0, -1] };

function wallTorch(builder, p, x, y, z, facing, layer, flags) {
  // the torch leans away from the wall it hangs on
  const [nx, nz] = FACE_DXZ[facing] || [0, 1];
  const tx = -nz, tz = nx; // tangent along the wall
  const tilt = 0.38, h = 10 / 16, w = 1 / 16;
  const base = [x + 0.5 - nx * 0.5 + nx * 0.06, y + 3.5 / 16, z + 0.5 - nz * 0.5 + nz * 0.06];
  const up = [nx * Math.sin(tilt), Math.cos(tilt), nz * Math.sin(tilt)];
  const out = [nx * Math.cos(tilt), -Math.sin(tilt), nz * Math.cos(tilt)];
  const at = (a, b, c) => [base[0] + tx * a + out[0] * b + up[0] * c, base[1] + out[1] * b + up[1] * c, base[2] + tz * a + out[2] * b + up[2] * c];
  const s = Math.round(skyL[p] * 17), b2 = Math.round(blkL[p] * 17);
  const nfSide = 6 | (flags << 3);
  const u0 = 7 / 16, u1 = 9 / 16, vTop = 6 / 16, vBot = 1;
  // four sides: offsets along tangent (a) and out (b)
  const sides = [[[-w, -w], [w, -w]], [[w, -w], [w, w]], [[w, w], [-w, w]], [[-w, w], [-w, -w]]];
  for (const [[a0, b0], [a1, b1]] of sides) {
    emitQuad(builder, [at(a0, b0, 0), at(a1, b1, 0), at(a1, b1, h), at(a0, b0, h)],
      [[u0, vBot], [u1, vBot], [u1, vTop], [u0, vTop]], layer, nfSide, s, b2, WHITE_TINT);
  }
  emitQuad(builder, [at(-w, w, h), at(w, w, h), at(w, -w, h), at(-w, -w, h)],
    [[u0, 8 / 16], [u1, 8 / 16], [u1, 6 / 16], [u0, 6 / 16]], layer, 2 | (flags << 3), s, b2, WHITE_TINT);
}

function buildChunkMesh(world, chunk) {
  const cx = chunk.cx, cz = chunk.cz;
  let top = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = world.getChunk(cx + dx, cz + dz);
    if (n && n.maxY > top) top = n.maxY;
  }
  top = Math.min(CH - 1, top + 1);
  fillPadded(world, cx, cz, top);
  computeLight(top);
  storeLight(chunk, top);

  meshOpaque.count = 0; meshCutout.count = 0; meshWater.count = 0;
  const pb = padBlocks;
  const ao = [0, 0, 0, 0], sk = [0, 0, 0, 0], bl = [0, 0, 0, 0];
  const maxY = Math.min(chunk.maxY, CH - 1);
  const ox = cx * CS, oz = cz * CS;
  const tintBuf = [200, 200, 200];
  // Liquid surface: each block's height comes from its flow level (sources sit at 14/16, thin
  // sheets at the far end of a spread), corners average the liquid blocks around them so the
  // surface slopes smoothly downstream; anything with liquid above is full height.
  const liqH = (q, wx, wy, wz, id) => {
    if (pb[q] !== id) return -1;
    if (pb[q + RSS] === id) return 1;
    const l = world.getFlow ? world.getFlow(wx, wy, wz) : 0;
    if (l === 0 || l === 8) return 0.875;
    return Math.max(0.1, 0.875 * (8 - l) / 8);
  };
  const cornerH = [0, 0, 0, 0];   // (x0,z0) (x1,z0) (x0,z1) (x1,z1)
  const liquidCorners = (p, wx, y, wz, id) => {
    for (let c = 0; c < 4; c++) {
      const ccx = c & 1, ccz = c >> 1;
      let sum = 0, n = 0, full = false;
      for (let dz = ccz - 1; dz <= ccz; dz++) for (let dx = ccx - 1; dx <= ccx; dx++) {
        const h = liqH(p + dx + dz * RS, wx + dx, y, wz + dz, id);
        if (h < 0) continue;
        if (h >= 1) full = true;
        sum += h; n++;
      }
      cornerH[c] = full ? 1 : sum / n;
    }
  };

  for (let y = 0; y <= maxY; y++) {
    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const p = pidx(x + LP, y, z + LP);
        const id = pb[p];
        if (id === 0) continue;
        const rt = BLOCK_RT[id];
        const flags = BLOCK_FLAGS[id];
        const col = z * CS + x;
        let tr = 200, tg = 200, tb = 200;
        const tintType = BLOCK_TINT[id];
        if (tintType === TINT_FOLIAGE) {
          tr = chunk.foliageTint[col * 3]; tg = chunk.foliageTint[col * 3 + 1]; tb = chunk.foliageTint[col * 3 + 2];
        }

        if (rt === RT_CROSS) {
          if (tintType === TINT_GRASS) { tr = chunk.grassTint[col * 3]; tg = chunk.grassTint[col * 3 + 1]; tb = chunk.grassTint[col * 3 + 2]; }
          const wx = ox + x, wz = oz + z;
          const jit = id === B.SUGAR_CANE || (id >= B.WHEAT_0 && id <= B.WHEAT_3) ? 0 : 1;
          const jx = jit * (Math.floor(hash3(wx, y, wz, 77) * 5) - 2), jz = jit * (Math.floor(hash3(wx, y, wz, 91) * 5) - 2);
          const x0 = (x * 16 + 2 + jx) * P4, x1 = (x * 16 + 14 + jx) * P4, z0 = (z * 16 + 2 + jz) * P4, z1 = (z * 16 + 14 + jz) * P4;
          const y0 = y * POS_SCALE, y1 = (y + 1) * POS_SCALE;
          const s = Math.round(skyL[p] * 17), b2 = Math.round(blkL[p] * 17);
          const layer = BLOCK_TEX[id * 6 + 2];
          const nf = 6 | (flags << 3);
          meshCutout.ensure(8);
          meshCutout.v(x0, y0, z0, layer, nf, 3, s, b2, tr, tg, tb, 0, 16);
          meshCutout.v(x1, y0, z1, layer, nf, 3, s, b2, tr, tg, tb, 16, 16);
          meshCutout.v(x1, y1, z1, layer, nf, 3, s, b2, tr, tg, tb, 16, 0);
          meshCutout.v(x0, y1, z0, layer, nf, 3, s, b2, tr, tg, tb, 0, 0);
          meshCutout.v(x0, y0, z1, layer, nf, 3, s, b2, tr, tg, tb, 0, 16);
          meshCutout.v(x1, y0, z0, layer, nf, 3, s, b2, tr, tg, tb, 16, 16);
          meshCutout.v(x1, y1, z0, layer, nf, 3, s, b2, tr, tg, tb, 16, 0);
          meshCutout.v(x0, y1, z1, layer, nf, 3, s, b2, tr, tg, tb, 0, 0);
          continue;
        }

        if (rt >= RT_SLAB) {
          const tex = (d) => BLOCK_TEX[id * 6 + d];
          if (rt === RT_SLAB) {
            const top = world.getFacing(ox + x, y, oz + z) & 8;
            emitBox(meshOpaque, p, x, y, z, 0, top ? 8 : 0, 0, 16, top ? 16 : 8, 16, tex, flags, WHITE_TINT, null);
          } else if (rt === RT_SHAPE || rt === RT_CONNECT || rt === RT_LANTERN) emitArch(world, p, x, y, z, id, rt, flags, ox + x, oz + z);
          else if (rt === RT_FARMLAND) emitBox(meshOpaque, p, x, y, z, 0, 0, 0, 16, 15, 16, tex, flags, WHITE_TINT, null);
          else if (rt === RT_TORCH) {
            emitBox(meshCutout, p, x, y, z, 7, 0, 7, 9, 10, 9, tex, flags, WHITE_TINT,
              (d, k, u, v) => (d === 2 ? [u, v - 1 / 16] : [u, v]));
          } else if (rt === RT_WALL_TORCH) {
            wallTorch(meshCutout, p, x, y, z, world.getFacing(ox + x, y, oz + z), BLOCK_TEX[id * 6], flags);
          } else if (rt === RT_LADDER) {
            const f = world.getFacing(ox + x, y, oz + z);
            const [nx, nz] = FACE_DXZ[f] || [0, 1];
            // quad 1/16 in front of the wall behind it (wall is at -normal)
            const off = 0.95 / 16;
            const px = nx ? (nx > 0 ? off : 1 - off) : null, pz = nz ? (nz > 0 ? off : 1 - off) : null;
            const s = Math.round(skyL[p] * 17), b2 = Math.round(blkL[p] * 17);
            const pts = [];
            for (const c of FACE_CORNERS[f]) pts.push([x + (px !== null ? px : c[0]), y + c[1], z + (pz !== null ? pz : c[2])]);
            const uvs = FACE_CORNERS[f].map((c) => [faceU(f, c[0], c[1], c[2]), faceV(f, c[0], c[1], c[2])]);
            emitQuad(meshCutout, pts, uvs, BLOCK_TEX[id * 6], f | (flags << 3), s, b2, WHITE_TINT);
          } else if (rt === RT_DOOR || rt === RT_TRAPDOOR) {
            const f = world.getFacing(ox + x, y, oz + z);
            const bx = rt === RT_DOOR ? doorPanel(f, isOpenDoor(id)) : trapdoorPanel(f, isOpenDoor(id));
            emitBox(meshCutout, p, x, y, z, bx[0], bx[1], bx[2], bx[3], bx[4], bx[5], tex, flags, WHITE_TINT, null);
          } else if (rt === RT_BED) {
            const f = world.getFacing(ox + x, y, oz + z);
            const alongX = f === 0 || f === 1;
            const layerOf = (d) => (d === 2 ? tex(2) : d === 3 ? tex(3) : ((alongX ? d < 2 : d >= 4) ? BLOCK_FRONT[id] : tex(0)));
            emitBox(meshOpaque, p, x, y, z, 0, 0, 0, 16, 9, 16, layerOf, flags, WHITE_TINT, (d, k, u, v, fx, fy, fz) => {
              if (d !== 2) return [u, v];
              // pillow (texture top) points to the facing side
              if (f === 5) return [fx, fz];
              if (f === 4) return [1 - fx, 1 - fz];
              if (f === 0) return [fz, 1 - fx];
              return [1 - fz, fx];
            });
          }
          continue;
        }

        const isWater = rt === RT_WATER;
        const isLava = rt === RT_LAVA;
        const isCactus = rt === RT_CACTUS;
        const liquidTopLow = (isWater || isLava) && pb[p + RSS] !== id;
        const builder = isWater ? meshWater : (rt === RT_CUTOUT ? meshCutout : meshOpaque);
        const facing = FACING_BLOCKS.has(id) ? world.getFacing(ox + x, y, oz + z) : -1;
        let cornersDone = false;
        const flowLevel = (isWater || isLava) && world.getFlow ? world.getFlow(ox + x, y, oz + z) : 0;

        for (let d = 0; d < 6; d++) {
          const nIdx = p + DIR_OFFSET[d];
          const nb = pb[nIdx];
          // visibility
          if (isWater || isLava) {
            if (nb === id || BLOCK_OPAQUE[nb]) continue;
            if (isLava && d !== 2 && nb === B.WATER) continue;
          } else if (isCactus) {
            if (d === 2 && (nb === B.CACTUS || BLOCK_OPAQUE[nb])) continue;
            if (d === 3 && BLOCK_OPAQUE[nb]) continue;
          } else if (rt === RT_CUTOUT) {
            if (BLOCK_OPAQUE[nb]) continue;
            if (id === B.GLASS) { if (nb === B.GLASS) continue; }
            else if (BLOCK_RT[nb] === RT_CUTOUT && nb !== B.GLASS && (d & 1)) continue;
          } else {
            if (BLOCK_OPAQUE[nb]) continue;
          }

          const layer = d === facing ? BLOCK_FRONT[id] : BLOCK_TEX[id * 6 + d];
          let r = tr, g = tg, b = tb, ta = 0;
          if (isWater) {
            // water carries its look: scatter colour ×1000 and murkiness (see WATER_STYLE)
            const wt = chunk.waterTint;
            if (wt) { r = wt[col * 4]; g = wt[col * 4 + 1]; b = wt[col * 4 + 2]; ta = wt[col * 4 + 3]; }
            else { r = 10; g = 58; b = 105; ta = 36; }
          }
          if (tintType === TINT_GRASS && d === 2) {
            r = chunk.grassTint[col * 3]; g = chunk.grassTint[col * 3 + 1]; b = chunk.grassTint[col * 3 + 2];
          }
          const corners = FACE_CORNERS[d];
          const cu = CORNER_U[d], cv = CORNER_V[d];

          if (isWater || isLava || isCactus) {
            let fu = 0, fv = 0;
            if (!isCactus && liquidTopLow) {
              if (!cornersDone) { liquidCorners(p, ox + x, y, oz + z, id); cornersDone = true; }
              if (d === 2) {
                // downhill direction for the flow-mapped ripples
                const gx = (cornerH[1] + cornerH[3] - cornerH[0] - cornerH[2]) * 0.5;
                const gz = (cornerH[2] + cornerH[3] - cornerH[0] - cornerH[1]) * 0.5;
                const m = Math.hypot(gx, gz);
                if (m > 0.004) { const k = Math.min(1, m * 4) / m; fu = Math.round(128 - gx * k * 126); fv = Math.round(128 - gz * k * 126); }
              }
            }
            if (!isCactus && d !== 2 && d !== 3 && flowLevel > 0) { fu = 1; fv = flowLevel === 8 ? 255 : 120; }
            const s = Math.round((isCactus ? Math.max(skyL[p], skyL[nIdx]) : skyL[nIdx]) * 17);
            const b2 = Math.round((isCactus ? Math.max(blkL[p], blkL[nIdx]) : Math.max(blkL[nIdx], isLava ? 15 : 0)) * 17);
            builder.ensure(4);
            for (let k = 0; k < 4; k++) {
              const c = corners[k];
              let vx = (x + c[0]) * POS_SCALE, vy = (y + c[1]) * POS_SCALE, vz = (z + c[2]) * POS_SCALE;
              let vv = cv[k];
              if (isCactus) { vx = (x * 16 + (c[0] ? 15 : 1)) * P4; vz = (z * 16 + (c[2] ? 15 : 1)) * P4; }
              if (liquidTopLow && c[1]) {
                const hh = cornerH[c[0] + 2 * c[2]];
                vy = Math.round((y + hh) * POS_SCALE);
                if (d !== 2 && d !== 3) vv = Math.round((1 - hh) * 16);
              }
              builder.v(vx, vy, vz, layer, d | (flags << 3), 3, s, b2, r, g, b, cu[k], vv, fu, fv, ta);
            }
            continue;
          }

          const offs = AO_OFFSETS[d];
          for (let k = 0; k < 4; k++) {
            const o = offs[k];
            const i1 = nIdx + o[0], i2 = nIdx + o[1], ic = nIdx + o[2];
            const o1 = BLOCK_OPAQUE[pb[i1]], o2 = BLOCK_OPAQUE[pb[i2]], oc = BLOCK_OPAQUE[pb[ic]];
            ao[k] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
            let ss = skyL[nIdx], bb = blkL[nIdx], cnt = 1;
            if (!o1) { ss += skyL[i1]; bb += blkL[i1]; cnt++; }
            if (!o2) { ss += skyL[i2]; bb += blkL[i2]; cnt++; }
            if (!oc && !(o1 && o2)) { ss += skyL[ic]; bb += blkL[ic]; cnt++; }
            sk[k] = Math.round((ss / cnt) * 17);
            bl[k] = Math.round((bb / cnt) * 17);
          }
          const v0 = ao[0] / 3 + sk[0] / 255, v1 = ao[1] / 3 + sk[1] / 255;
          const v2 = ao[2] / 3 + sk[2] / 255, v3 = ao[3] / 3 + sk[3] / 255;
          const start = Math.abs(v0 - v2) > Math.abs(v1 - v3) ? 1 : 0;
          builder.ensure(4);
          const nf = d | (flags << 3);
          for (let j = 0; j < 4; j++) {
            const k = (start + j) & 3;
            const c = corners[k];
            builder.v((x + c[0]) * POS_SCALE, (y + c[1]) * POS_SCALE, (z + c[2]) * POS_SCALE, layer, nf, ao[k], sk[k], bl[k], r, g, b, cu[k], cv[k]);
          }
        }
      }
    }
  }
  void tintBuf;
  return { opaque: meshOpaque, cutout: meshCutout, water: meshWater };
}

// 0..1 estimate of how exposed a position is to the open sky (drives cave eye adaptation).
function sampleSkyExposure(world, x, y, z) {
  const h = world.surfaceHeight(Math.floor(x), Math.floor(z));
  if (h < 0) return 1;
  const depth = h - y;
  return depth <= 1 ? 1 : Math.max(0, 1 - (depth - 1) / 10);
}
