'use strict';
// Builds chunk meshes: flood-filled sky/block light over a padded region, smooth lighting,
// per-vertex ambient occlusion, and separate opaque / cutout / water vertex streams.
//
// Vertex layout (16 bytes):
//   u16 x*16, y*16, z*16, textureLayer
//   u8  normalIndex | flags<<3, ao(0-3), skyLight(0-255), blockLight(0-255)
//   u8  tintR, tintG, tintB (1.0 = 200), uvBits (bit0 = u, bit1 = v)

const LP = 14;                 // light padding around the chunk
const RS = CS + 2 * LP;        // padded width
const RSS = RS * RS;
const PH = CH + 2;             // padded height (y = -1 .. CH)
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
    this.buf = new ArrayBuffer(cap * 16);
    this.u16 = new Uint16Array(this.buf);
    this.u8 = new Uint8Array(this.buf);
    if (old) this.u8.set(old.subarray(0, this.count * 16));
    this.cap = cap;
  }
  ensure(n) { if (this.count + n > this.cap) this.alloc(Math.max(this.cap * 2, this.count + n)); }
  v(x, y, z, layer, nf, ao, sky, blk, r, g, b, uv) {
    const o = this.count++;
    const i16 = o * 8, i8 = o * 16;
    this.u16[i16] = x; this.u16[i16 + 1] = y; this.u16[i16 + 2] = z; this.u16[i16 + 3] = layer;
    const u8 = this.u8;
    u8[i8 + 8] = nf; u8[i8 + 9] = ao; u8[i8 + 10] = sky; u8[i8 + 11] = blk;
    u8[i8 + 12] = r; u8[i8 + 13] = g; u8[i8 + 14] = b; u8[i8 + 15] = uv;
  }
  data() { return this.u8.subarray(0, this.count * 16); }
}

const meshOpaque = new MeshBuilder(1 << 15);
const meshCutout = new MeshBuilder(1 << 14);
const meshWater = new MeshBuilder(1 << 13);

const DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const FACE_CORNERS = [
  [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]],
  [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]],
  [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]],
  [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]],
  [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]],
];
const CORNER_UV = [2, 3, 1, 0];              // BL, BR, TR, TL
const AXIS_STRIDE = [1, RSS, RS];            // x, y, z in padded index space
const DIR_OFFSET = DIRS.map(([x, y, z]) => x * AXIS_STRIDE[0] + y * AXIS_STRIDE[1] + z * AXIS_STRIDE[2]);
const FACE_TANGENT_AXES = [[1, 2], [1, 2], [0, 2], [0, 2], [0, 1], [0, 1]];

// Precomputed per face/corner: offsets of the two side cells and the corner cell.
const AO_OFFSETS = FACE_CORNERS.map((corners, d) => corners.map((c) => {
  const [a, b] = FACE_TANGENT_AXES[d];
  const da = c[a] ? 1 : -1, db = c[b] ? 1 : -1;
  const s1 = da * AXIS_STRIDE[a], s2 = db * AXIS_STRIDE[b];
  return [s1, s2, s1 + s2];
}));

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

  meshOpaque.count = 0; meshCutout.count = 0; meshWater.count = 0;
  const pb = padBlocks;
  const ao = [0, 0, 0, 0], sk = [0, 0, 0, 0], bl = [0, 0, 0, 0];
  const maxY = Math.min(chunk.maxY, CH - 1);

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
          const wx = cx * CS + x, wz = cz * CS + z;
          const jx = Math.floor(hash3(wx, y, wz, 77) * 5) - 2, jz = Math.floor(hash3(wx, y, wz, 91) * 5) - 2;
          const x0 = x * 16 + 2 + jx, x1 = x * 16 + 14 + jx, z0 = z * 16 + 2 + jz, z1 = z * 16 + 14 + jz;
          const y0 = y * 16, y1 = y * 16 + 16;
          const s = Math.round(skyL[p] * 17), b2 = Math.round(blkL[p] * 17);
          const layer = BLOCK_TEX[id * 6 + 2];
          const nf = 6 | (flags << 3);
          meshCutout.ensure(8);
          meshCutout.v(x0, y0, z0, layer, nf, 3, s, b2, tr, tg, tb, 2);
          meshCutout.v(x1, y0, z1, layer, nf, 3, s, b2, tr, tg, tb, 3);
          meshCutout.v(x1, y1, z1, layer, nf, 3, s, b2, tr, tg, tb, 1);
          meshCutout.v(x0, y1, z0, layer, nf, 3, s, b2, tr, tg, tb, 0);
          meshCutout.v(x0, y0, z1, layer, nf, 3, s, b2, tr, tg, tb, 2);
          meshCutout.v(x1, y0, z0, layer, nf, 3, s, b2, tr, tg, tb, 3);
          meshCutout.v(x1, y1, z0, layer, nf, 3, s, b2, tr, tg, tb, 1);
          meshCutout.v(x0, y1, z1, layer, nf, 3, s, b2, tr, tg, tb, 0);
          continue;
        }

        const isWater = rt === RT_WATER;
        const isCactus = rt === RT_CACTUS;
        const waterTopLow = isWater && pb[p + RSS] !== B.WATER;
        const builder = isWater ? meshWater : (rt === RT_CUTOUT ? meshCutout : meshOpaque);

        for (let d = 0; d < 6; d++) {
          const nIdx = p + DIR_OFFSET[d];
          const nb = pb[nIdx];
          // visibility
          if (isWater) {
            if (nb === B.WATER || BLOCK_OPAQUE[nb]) continue;
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

          const layer = BLOCK_TEX[id * 6 + d];
          let r = tr, g = tg, b = tb;
          if (tintType === TINT_GRASS && d === 2) {
            r = chunk.grassTint[col * 3]; g = chunk.grassTint[col * 3 + 1]; b = chunk.grassTint[col * 3 + 2];
          }
          const corners = FACE_CORNERS[d];

          if (isWater || isCactus) {
            const s = Math.round((isWater ? skyL[nIdx] : Math.max(skyL[p], skyL[nIdx])) * 17);
            const b2 = Math.round((isWater ? blkL[nIdx] : Math.max(blkL[p], blkL[nIdx])) * 17);
            builder.ensure(4);
            for (let k = 0; k < 4; k++) {
              const c = corners[k];
              let vx = (x + c[0]) * 16, vy = (y + c[1]) * 16, vz = (z + c[2]) * 16;
              if (isCactus) { vx = x * 16 + (c[0] ? 15 : 1); vz = z * 16 + (c[2] ? 15 : 1); }
              if (waterTopLow && c[1]) vy -= 2;
              builder.v(vx, vy, vz, layer, d | (flags << 3), 3, s, b2, r, g, b, CORNER_UV[k]);
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
            builder.v((x + c[0]) * 16, (y + c[1]) * 16, (z + c[2]) * 16, layer, nf, ao[k], sk[k], bl[k], r, g, b, CORNER_UV[k]);
          }
        }
      }
    }
  }
  return { opaque: meshOpaque, cutout: meshCutout, water: meshWater };
}

// 0..1 estimate of how exposed a position is to the open sky (drives cave eye adaptation).
function sampleSkyExposure(world, x, y, z) {
  const h = world.surfaceHeight(Math.floor(x), Math.floor(z));
  if (h < 0) return 1;
  const depth = h - y;
  return depth <= 1 ? 1 : Math.max(0, 1 - (depth - 1) / 10);
}
