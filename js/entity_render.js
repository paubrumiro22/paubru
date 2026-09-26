'use strict';
// Builds the per-frame entity vertex stream: mobs (animated box models), dropped items,
// arrows, TNT, falling blocks, particles, the block-breaking overlay and the first-person
// hand / held item with swing, equip, eating and bow animations.

// 3x4 row-major affine transforms
const XF = {
  id() { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0]; },
  mul(a, b) {
    return [
      a[0] * b[0] + a[1] * b[4] + a[2] * b[8], a[0] * b[1] + a[1] * b[5] + a[2] * b[9], a[0] * b[2] + a[1] * b[6] + a[2] * b[10], a[0] * b[3] + a[1] * b[7] + a[2] * b[11] + a[3],
      a[4] * b[0] + a[5] * b[4] + a[6] * b[8], a[4] * b[1] + a[5] * b[5] + a[6] * b[9], a[4] * b[2] + a[5] * b[6] + a[6] * b[10], a[4] * b[3] + a[5] * b[7] + a[6] * b[11] + a[7],
      a[8] * b[0] + a[9] * b[4] + a[10] * b[8], a[8] * b[1] + a[9] * b[5] + a[10] * b[9], a[8] * b[2] + a[9] * b[6] + a[10] * b[10], a[8] * b[3] + a[9] * b[7] + a[10] * b[11] + a[11],
    ];
  },
  chain(...ms) { let m = ms[0]; for (let i = 1; i < ms.length; i++) m = XF.mul(m, ms[i]); return m; },
  t(x, y, z) { return [1, 0, 0, x, 0, 1, 0, y, 0, 0, 1, z]; },
  s(x, y = x, z = x) { return [x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0]; },
  rx(a) { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, 0, c, -s, 0, 0, s, c, 0]; },
  ry(a) { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 0, 1, 0, 0, -s, 0, c, 0]; },
  rz(a) { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, 0, s, c, 0, 0, 0, 0, 1, 0]; },
  basis(r, u, f) { return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0]; },
};

const CUBE_FACES = [
  { key: 'front', d: 4, n: [0, 0, 1], c: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
  { key: 'back', d: 5, n: [0, 0, -1], c: [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]] },
  { key: 'left', d: 1, n: [-1, 0, 0], c: [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]] },
  { key: 'right', d: 0, n: [1, 0, 0], c: [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]] },
  { key: 'top', d: 2, n: [0, 1, 0], c: [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]] },
  { key: 'bottom', d: 3, n: [0, -1, 0], c: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
];
const RECT_UV = [[0, 1], [1, 1], [1, 0], [0, 0]];
const GRASS_ITEM_TINT = [0.8, 1.0, 0.64];
// First-person poses in view space (x right, y up, camera looking down -z).
const HAND_POSE = {
  arm: { t: [0.6, -0.44, -0.02], ry: 0.4, rx: 1.78, rz: -0.12, s: 1 / 16 },
  block: { t: [0.54, -0.33, -0.8], ry: Math.PI / 4 + 0.1, rx: 0.08, rz: 0, s: 0.32 },
  item: { t: [0.52, -0.34, -0.72], ry: -1.05, rx: 0.05, rz: 0.22, s: 0.42, c: [0.1, 0.25, 0] },
  bow: { t: [0.42, -0.22, -0.66], ry: -1.35, rx: 0, rz: -0.35, s: 0.42 },
};
function poseMatrix(p) {
  const m = XF.chain(XF.t(p.t[0], p.t[1], p.t[2]), XF.ry(p.ry), XF.rx(p.rx), XF.rz(p.rz), XF.s(p.s));
  return p.c ? XF.mul(m, XF.t(p.c[0], p.c[1], p.c[2])) : m;
}

const ER = {
  data: null, vi: 0, max: 0,
  light: [1, 0], color: [1, 1, 1], ov: 0, alpha: 1,

  v(x, y, z, u, v, layer, nx, ny, nz) {
    if (this.vi >= this.max) return;
    const d = this.data, o = this.vi * ENT_FLOATS;
    d[o] = x; d[o + 1] = y; d[o + 2] = z; d[o + 3] = u; d[o + 4] = v; d[o + 5] = layer;
    d[o + 6] = nx; d[o + 7] = ny; d[o + 8] = nz;
    d[o + 9] = this.light[0]; d[o + 10] = this.light[1]; d[o + 11] = this.alpha;
    d[o + 12] = this.color[0]; d[o + 13] = this.color[1]; d[o + 14] = this.color[2]; d[o + 15] = this.ov;
    this.vi++;
  },
  quads() { return this.vi >> 2; },

  // Box in model space [x0..x1] under transform m; uvOf(face) -> [layer, u0, v0, u1, v1] or null.
  box(m, x0, y0, z0, x1, y1, z1, uvOf) {
    if (this.vi + 24 > this.max) return;
    const lo = [x0, y0, z0], hi = [x1, y1, z1];
    for (const f of CUBE_FACES) {
      const t = uvOf(f);
      if (!t) continue;
      const nx = m[0] * f.n[0] + m[1] * f.n[1] + m[2] * f.n[2], ny = m[4] * f.n[0] + m[5] * f.n[1] + m[6] * f.n[2], nz = m[8] * f.n[0] + m[9] * f.n[1] + m[10] * f.n[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 4; k++) {
        const c = f.c[k];
        const px = c[0] ? hi[0] : lo[0], py = c[1] ? hi[1] : lo[1], pz = c[2] ? hi[2] : lo[2];
        let u, v;
        if (t.length === 5) { u = t[1] + (t[3] - t[1]) * RECT_UV[k][0]; v = t[2] + (t[4] - t[2]) * RECT_UV[k][1]; }
        else { u = t[1](px, py, pz); v = t[2](px, py, pz); }
        this.v(m[0] * px + m[1] * py + m[2] * pz + m[3], m[4] * px + m[5] * py + m[6] * pz + m[7], m[8] * px + m[9] * py + m[10] * pz + m[11],
          u, v, t[0], nx / nl, ny / nl, nz / nl);
      }
    }
  },

  // A block (or part of one, box in 0..1 block units) with its own face textures.
  blockBox(m, id, bx) {
    bx = bx || [0, 0, 0, 1, 1, 1];
    const facing = BLOCK_FRONT[id] !== NO_LAYER && id !== B.BED;
    const tint = BLOCK_TINT[id];
    const base = this.color.slice();
    for (const f of CUBE_FACES) {
      let layer = BLOCK_TEX[id * 6 + f.d];
      if (facing && f.d === 4) layer = BLOCK_FRONT[id];
      if (id === B.BED && f.d >= 4) layer = BLOCK_FRONT[id];
      if (tint === TINT_FOLIAGE || (tint === TINT_GRASS && f.d === 2)) this.color = [base[0] * GRASS_ITEM_TINT[0], base[1] * GRASS_ITEM_TINT[1], base[2] * GRASS_ITEM_TINT[2]];
      else this.color = base;
      const d = f.d;
      this.box(m, bx[0], bx[1], bx[2], bx[3], bx[4], bx[5], (ff) => (ff === f ? [layer, (x, y, z) => faceU(d, x, y, z), (x, y, z) => faceV(d, x, y, z)] : null));
    }
    this.color = base;
  },

  // A flat polygon (3 or 4 points in model space) with its own texture coordinates.
  poly(m, pts, uvs, layer, n) {
    if (this.vi + 4 > this.max) return;
    const nx = m[0] * n[0] + m[1] * n[1] + m[2] * n[2], ny = m[4] * n[0] + m[5] * n[1] + m[6] * n[2], nz = m[8] * n[0] + m[9] * n[1] + m[10] * n[2];
    const nl = Math.hypot(nx, ny, nz) || 1;
    for (let k = 0; k < 4; k++) {
      const i = Math.min(k, pts.length - 1), p = pts[i];
      this.v(m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
        uvs[i][0], uvs[i][1], layer, nx / nl, ny / nl, nz / nl);
    }
  },

  sprite(m, layer) {
    const quads = spriteMesh(G.renderer.textureTiles, layer);
    for (const q of quads) {
      if (this.vi + 4 > this.max) return;
      const nx = m[0] * q.n[0] + m[1] * q.n[1] + m[2] * q.n[2], ny = m[4] * q.n[0] + m[5] * q.n[1] + m[6] * q.n[2], nz = m[8] * q.n[0] + m[9] * q.n[1] + m[10] * q.n[2];
      const nl = Math.hypot(nx, ny, nz) || 1;
      for (let k = 0; k < 4; k++) {
        const p = q.p[k];
        this.v(m[0] * p[0] + m[1] * p[1] + m[2] * p[2] + m[3], m[4] * p[0] + m[5] * p[1] + m[6] * p[2] + m[7], m[8] * p[0] + m[9] * p[1] + m[10] * p[2] + m[11],
          q.uv[k][0], q.uv[k][1], layer, nx / nl, ny / nl, nz / nl);
      }
    }
  },

  // Any item in a unit box centred on the origin (blocks) or a unit sprite square.
  item(m, id) {
    const d = ITEM_DEF[id];
    if (!d) return;
    if (d.render === 'shape' || d.render === 'connect') {
      // stairs, roofs, arches, fences... drawn with their real faces
      const mm = XF.mul(m, XF.t(-0.5, -0.5, -0.5));
      for (const f of shapeIconFaces(d.block)) this.poly(mm, f.p, f.uv, f.layer, f.n);
    } else if (d.block && d.render !== 'sprite') {
      const b = d.block;
      const h = d.render === 'slab' ? 0.5 : d.render === 'bed' ? 9 / 16 : 1;
      this.blockBox(XF.mul(m, XF.t(-0.5, -0.5, -0.5)), b, [0, 0, 0, 1, h, 1]);
    } else {
      const layer = d.layer !== undefined ? d.layer : BLOCK_TEX[d.block * 6 + 2];
      const tint = d.block && BLOCK_TINT[d.block];
      const base = this.color;
      if (tint) this.color = [base[0] * GRASS_ITEM_TINT[0], base[1] * GRASS_ITEM_TINT[1], base[2] * GRASS_ITEM_TINT[2]];
      this.sprite(XF.mul(m, XF.t(-0.5, -0.5, 0)), layer);
      this.color = base;
    }
  },

  lightAt(x, y, z) {
    const L = G.world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
    this.light = [(L >> 4) / 15, (L & 15) / 15];
  },

  // ---------------------------------------------------------------- mobs ----
  mob(m0, mob, cp) {
    const model = MOB_MODELS[mob.type === 'villager' ? 'avatar' : mob.type];
    this.lightAt(mob.pos[0], mob.pos[1] + mob.h * 0.6, mob.pos[2]);
    if (mob.fire > 0) this.light[1] = Math.max(this.light[1], 0.55);
    this.ov = mob.dead ? 0.8 : mob.hurtTime > 0 ? Math.min(1, mob.hurtTime / 0.25) : 0;
    if (mob.fuse > 0 && Math.floor(mob.fuse * 8) % 2 === 0) this.ov = -0.6;
    this.color = [1, 1, 1];
    const roll = mob.dead ? Math.min(1, mob.deathTime / 0.5) * Math.PI / 2 : 0;
    let scale = 1 / 16;
    if (mob.fuse > 0) scale *= 1 + Math.min(1, mob.fuse / 1.5) * 0.12 + Math.sin(mob.fuse * 30) * 0.015;
    const base = XF.chain(XF.t(mob.pos[0] - cp[0], mob.pos[1] - cp[1], mob.pos[2] - cp[2]), XF.ry(mob.bodyYaw), XF.rz(roll), XF.s(scale));
    const sw = Math.sin(mob.walkPhase) * mob.walkAmt;
    let headYaw = mob.headYaw - mob.bodyYaw;
    while (headYaw > Math.PI) headYaw -= Math.PI * 2;
    while (headYaw < -Math.PI) headYaw += Math.PI * 2;
    headYaw = clamp(headYaw, -1.1, 1.1);
    const partM = {};
    const skin = (mob.type === 'avatar' || mob.type === 'villager') && mob.skin > 0 && SKINS[mob.skin] ? mob.skin : 0;
    const [sdx, sdy] = skinOffset(skin);
    for (const p of model) {
      if (p.role === 'wool' && mob.sheared) continue;
      let r = XF.id();
      switch (p.role) {
        case 'head': r = XF.mul(XF.ry(headYaw), XF.rx(-clamp(mob.headPitch, -0.8, 0.8))); break;
        case 'legA': r = mob.sit ? XF.mul(XF.rx(-1.45), XF.rz(0.08)) : XF.rx(sw * 0.9); break;
        case 'legB': r = mob.sit ? XF.mul(XF.rx(-1.45), XF.rz(-0.08)) : XF.rx(-sw * 0.9); break;
        case 'armL': case 'armR': {
          const left = p.role === 'armL';
          if (mob.type === 'zombie') r = XF.mul(XF.rx(-Math.PI / 2 + Math.sin(mob.age * 2 + (left ? 0 : 1)) * 0.06), XF.rz(left ? -0.05 : 0.05));
          else if (mob.aiming > 0) r = XF.mul(XF.rx(-Math.PI / 2 - 0.1), XF.ry(left ? 0.45 : -0.1));
          else if (mob.ride) r = XF.mul(XF.rx(mob.ride === 'bike' ? -1.05 : -0.8), XF.rz(left ? -0.12 : 0.12));   // hands on the wheel / handlebar
          else r = XF.rx((left ? -sw : sw) * 0.8);
          break;
        }
        case 'wingL': r = XF.rz(-(mob.onGround ? 0 : 0.3 + Math.abs(Math.sin(mob.flap)) * 0.9)); break;
        case 'wingR': r = XF.rz(mob.onGround ? 0 : 0.3 + Math.abs(Math.sin(mob.flap)) * 0.9); break;
        case 'spiderLeg': {
          const spread = [-0.65, -0.22, 0.22, 0.65][p.legIndex];
          const phase = mob.walkPhase * 1.6 + p.legIndex * Math.PI / 2 + (p.side > 0 ? Math.PI : 0);
          const ang = (p.side > 0 ? spread : Math.PI - spread) + Math.sin(phase) * 0.35 * mob.walkAmt;
          const lift = Math.max(0, Math.cos(phase)) * 0.3 * mob.walkAmt;
          r = XF.mul(XF.ry(ang), XF.rz(-0.62 + lift));
          break;
        }
        default: break;
      }
      let m;
      if (p.role === 'spiderLeg') m = XF.mul(XF.t(p.pivot[0], p.pivot[1], p.pivot[2]), r);
      else if (p.pivot) m = XF.chain(XF.t(p.pivot[0], p.pivot[1], p.pivot[2]), r, XF.t(-p.pivot[0], -p.pivot[1], -p.pivot[2]));
      else m = r;
      if (p.parent && partM[p.parent]) m = XF.mul(partM[p.parent], m);
      partM[p.id] = m;
      const faces = p.faces;
      const uvOf = (f) => {
        const r2 = faces[f.key];
        return [-1, (r2[0] + sdx) / ATLAS_W, (r2[1] + sdy) / ATLAS_H, (r2[0] + sdx + r2[2]) / ATLAS_W, (r2[1] + sdy + r2[3]) / ATLAS_H];
      };
      const mm = XF.mul(base, m);
      if (p.role === 'wool') {
        const c = WOOL_COLORS[mob.woolColor][1];
        this.color = [c[0] / 234, c[1] / 236, c[2] / 237];
      }
      if (p.tint && mob.tint && !skin) this.color = mob.tint;
      const b = p.box;
      this.box(mm, b[0], b[1], b[2], b[3], b[4], b[5], uvOf);
      this.color = [1, 1, 1];
      if (skin && SKINS[skin].extras) this.skinExtras(mm, SKINS[skin].extras, p.id);
      // skeletons carry a bow
      if (mob.type === 'skeleton' && p.id === 'armR') {
        this.item(XF.chain(mm, XF.t(5, 12, 1), XF.ry(Math.PI / 2), XF.rz(0.8), XF.s(13)), I.BOW);
      }
    }
    this.ov = 0;
  },

  // hats, capes, antennae... of a skin, on the part they belong to
  skinExtras(mm, extras, partId) {
    const ov = this.ov;
    const uv = () => Vehicles.swatchUV('white');
    for (const e of extras) {
      if (e.part !== partId) continue;
      const b = e.box;
      let m = mm;
      if (e.rot) {
        const cx = (b[0] + b[3]) / 2, cy = (b[1] + b[4]) / 2, cz = b[5];
        m = XF.chain(mm, XF.t(cx, cy, cz), XF.rx(e.rot[0]), XF.ry(e.rot[1]), XF.rz(e.rot[2]), XF.t(-cx, -cy, -cz));
      }
      this.color = e.rgb;
      if (e.glow) this.ov = 2.5;
      this.box(m, b[0], b[1], b[2], b[3], b[4], b[5], uv);
      this.ov = ov;
    }
    this.color = [1, 1, 1];
  },

  // -------------------------------------------------------- first person ----
  hand(cam, h) {
    const bs = G.renderer.cameraBasis(cam);
    const C = XF.basis(bs.r, bs.u, bs.f);
    const eye = cam.pos;
    this.lightAt(eye[0], eye[1], eye[2]);
    const held = h.itemId;
    const heldLight = held && ITEM_DEF[held] && ITEM_DEF[held].block && BLOCK_EMIT[ITEM_DEF[held].block];
    if (heldLight) this.light[1] = Math.max(this.light[1], BLOCK_EMIT[ITEM_DEF[held].block] / 15);
    this.color = [1, 1, 1]; this.ov = 0; this.alpha = 1;
    const p = h.swing;
    const s1 = Math.sin(Math.sqrt(p) * Math.PI), s2 = Math.sin(p * p * Math.PI);
    const eq = h.equip;
    let m = XF.t(h.bobX, -h.bobY - (1 - eq) * 0.6, 0);
    m = XF.mul(m, XF.t(-0.36 * s1, 0.16 * Math.sin(Math.sqrt(p) * Math.PI * 2), -0.2 * s2));
    m = XF.chain(m, XF.rx(h.swayPitch), XF.ry(h.swayYaw));
    if (h.eating > 0) {
      const e = h.eating;
      m = XF.chain(m, XF.t(-0.28 * Math.min(1, e * 4), 0.1 * Math.min(1, e * 4) + Math.abs(Math.cos(e * 16)) * 0.04, 0.06), XF.ry(0.4 * Math.min(1, e * 4)));
    }
    if (h.bowPull > 0) m = XF.chain(m, XF.t(-0.18 * h.bowPull, 0.06, 0.08 * h.bowPull));
    const sw = XF.chain(XF.ry(-0.35 * s2), XF.rz(-0.3 * s1), XF.rx(-1.1 * s1));
    const def = ITEM_DEF[held];
    let local;
    const posed = (p) => XF.chain(XF.t(p.t[0], p.t[1], p.t[2]), sw, XF.t(-p.t[0], -p.t[1], -p.t[2]), poseMatrix(p));
    if (!held || !def) {
      local = posed(HAND_POSE.arm);
      // your own skin's sleeve (the classic explorer keeps the rolled-up blue sleeve)
      const skin = G.settings.skin > 0 && SKINS[G.settings.skin] ? G.settings.skin : 0;
      const faces = skin ? MOB_MODELS.avatar.find((q) => q.id === 'armR').faces : MOB_MODELS.player[0].faces;
      const [sdx, sdy] = skinOffset(skin);
      const uvOf = (f) => { const r2 = faces[f.key]; return [-1, (r2[0] + sdx) / ATLAS_W, (r2[1] + sdy) / ATLAS_H, (r2[0] + sdx + r2[2]) / ATLAS_W, (r2[1] + sdy + r2[3]) / ATLAS_H]; };
      const b = MOB_MODELS.player[0].box;
      this.box(XF.chain(C, m, local), b[0], b[1], b[2], b[3], b[4], b[5], uvOf);
      return;
    }
    if (def.block && def.render !== 'sprite') local = posed(HAND_POSE.block);
    else if (held === I.BOW) local = posed(HAND_POSE.bow);
    else local = posed(HAND_POSE.item);
    this.item(XF.chain(C, m, local), held);
    if (h.bowPull > 0.15 && G.inv.count(I.ARROW) + (G.mode === 'creative' ? 1 : 0) > 0) {
      const a = XF.chain(C, m, XF.t(0.26 - h.bowPull * 0.1, -0.26, -0.5 + h.bowPull * 0.15), XF.ry(-1.35), XF.rz(0.8), XF.s(0.6));
      this.item(a, I.ARROW);
    }
  },

  // ------------------------------------------------------------ build ----
  build(r, cam, extra) {
    this.data = r.entData;
    this.max = ENT_MAX_QUADS * 4;
    this.vi = 0;
    this.alpha = 1; this.ov = 0; this.color = [1, 1, 1];
    const cp = cam.pos;
    const out = { quads: 0, opaque: [0, 0], crack: [0, 0], blend: [0, 0], hand: [0, 0], crackLevel: 0 };
    const rd = G.settings.renderDistance * CS;
    const near = (x, z, lim) => Math.abs(x - cp[0]) < lim && Math.abs(z - cp[2]) < lim;

    for (const mob of Ents.mobs) if (near(mob.pos[0], mob.pos[2], Math.min(rd, 80))) this.mob(null, mob, cp);
    Vehicles.renderAll(cp, extra.cockpit);
    Net.render(cp);
    Pictures.render(cp);
    if (extra.self) this.mob(null, extra.self, cp);
    Weather.render(cp);
    Wildlife.render(cp);
    if (G.player.parachute) this.parachute(G.player.pos, cp);

    for (const it of Ents.items) {
      if (!near(it.pos[0], it.pos[2], 48)) continue;
      this.lightAt(it.pos[0], it.pos[1] + 0.2, it.pos[2]);
      this.color = [1, 1, 1];
      const bob = Math.sin(it.age * 2.2 + it.spin) * 0.06 + 0.16;
      const d = ITEM_DEF[it.stack.id];
      const isBlock = d && d.block && d.render !== 'sprite';
      const sz = isBlock ? 0.25 : 0.42;
      const copies = it.stack.count > 16 ? 3 : it.stack.count > 1 ? 2 : 1;
      for (let c = 0; c < copies; c++) {
        const off = c ? [Math.sin(c * 2.1) * 0.07, c * 0.04, Math.cos(c * 1.7) * 0.07] : [0, 0, 0];
        const m = XF.chain(XF.t(it.pos[0] - cp[0] + off[0], it.pos[1] - cp[1] + bob + off[1], it.pos[2] - cp[2] + off[2]), XF.ry(it.age * 1.4 + it.spin), XF.s(sz));
        this.item(m, it.stack.id);
      }
    }

    for (const a of Ents.arrows) {
      if (!near(a.pos[0], a.pos[2], 64)) continue;
      const v = a.stuck ? a.dir : a.vel;
      if (!v) continue;
      this.lightAt(a.pos[0], a.pos[1], a.pos[2]);
      const yaw = Math.atan2(v[0], v[2]), pitch = Math.atan2(v[1], Math.hypot(v[0], v[2]));
      const base = XF.chain(XF.t(a.pos[0] - cp[0], a.pos[1] - cp[1], a.pos[2] - cp[2]), XF.ry(yaw), XF.rx(-pitch), XF.t(0, 0, -0.3));
      for (const roll of [0, Math.PI / 2]) {
        this.sprite(XF.chain(base, XF.rz(roll), XF.ry(-Math.PI / 2), XF.rz(-Math.PI / 4), XF.s(0.5), XF.t(-0.5, -0.5, 0)), T.i_arrow);
      }
    }

    for (const t of Ents.tnts) {
      this.lightAt(t.pos[0], t.pos[1] + 0.5, t.pos[2]);
      const sw = t.fuse < 1 ? 1 + (1 - t.fuse) * 0.2 : 1;
      this.ov = Math.floor(t.fuse * 4) % 2 === 0 ? -0.5 : 0;
      this.blockBox(XF.chain(XF.t(t.pos[0] - cp[0], t.pos[1] - cp[1] + 0.49, t.pos[2] - cp[2]), XF.s(0.98 * sw), XF.t(-0.5, -0.5, -0.5)), B.TNT);
      this.ov = 0;
    }
    for (const f of Ents.falling) {
      this.lightAt(f.pos[0], f.pos[1] + 0.5, f.pos[2]);
      this.blockBox(XF.chain(XF.t(f.pos[0] - cp[0], f.pos[1] - cp[1] + 0.49, f.pos[2] - cp[2]), XF.s(0.98), XF.t(-0.5, -0.5, -0.5)), f.id);
    }

    // opaque particles as camera-facing quads
    const bs = r.cameraBasis(cam);
    const blendList = [];
    for (const p of Particles.list) {
      if (p.blend) { blendList.push(p); continue; }
      this.particle(p, cp, bs);
    }
    out.opaque = [0, this.quads()];

    // cracks on the block being mined
    if (extra.crack && extra.crack.progress > 0) {
      const c = extra.crack;
      const start = this.quads();
      const bx = c.box;
      const e = 0.003;
      const n = c.normal || [0, 1, 0];
      this.lightAt(c.pos[0] + 0.5 + n[0], c.pos[1] + 0.5 + n[1], c.pos[2] + 0.5 + n[2]);
      this.color = [1, 1, 1];
      const m = XF.t(c.pos[0] - cp[0], c.pos[1] - cp[1], c.pos[2] - cp[2]);
      for (const f of CUBE_FACES) {
        const d = f.d;
        this.box(m, bx[0] - e, bx[1] - e, bx[2] - e, bx[3] + e, bx[4] + e, bx[5] + e, (ff) => (ff === f ? [T.crack, (x, y, z) => faceU(d, x, y, z), (x, y, z) => faceV(d, x, y, z)] : null));
      }
      out.crack = [start, this.quads() - start];
      out.crackLevel = (Math.floor(c.progress * 10) + 1) * 25 / 255 + 0.01;
    }

    // translucent smoke, far to near
    if (blendList.length) {
      blendList.sort((a, b) => ((b.x - cp[0]) ** 2 + (b.y - cp[1]) ** 2 + (b.z - cp[2]) ** 2) - ((a.x - cp[0]) ** 2 + (a.y - cp[1]) ** 2 + (a.z - cp[2]) ** 2));
      const start = this.quads();
      for (const p of blendList) this.particle(p, cp, bs);
      out.blend = [start, this.quads() - start];
      this.alpha = 1;
    }

    if (extra.hand && !G.vehicle) {
      const start = this.quads();
      this.hand(cam, extra.hand);
      out.hand = [start, this.quads() - start];
    }
    out.quads = this.quads();
    return out;
  },

  // Striped canopy and cords above someone floating down.
  parachute(pos, cp) {
    const c = [pos[0], pos[1] + 7, pos[2]];
    this.lightAt(c[0], c[1], c[2]);
    this.color = [1, 1, 1]; this.ov = 0;
    const red = BLOCK_TEX[(B.WOOL + 14) * 6], white = BLOCK_TEX[B.WOOL * 6];
    const N = 12, R = 3.2;
    // two rings of sloping gores make the dome
    const rings = [[0, 1.0, 1.7, 0.55], [1.7, 0.55, R, -0.55]];
    const base = XF.t(c[0] - cp[0], c[1] - cp[1], c[2] - cp[2]);
    for (let i = 0; i < N; i++) {
      const a = (i + 0.5) / N * Math.PI * 2;
      const layer = i % 2 ? red : white;
      for (const [r0, y0, r1, y1] of rings) {
        const len = Math.hypot(r1 - r0, y1 - y0), slope = Math.atan2(y0 - y1, r1 - r0);
        const w = Math.PI * (r0 + r1) / N * 0.56;
        const m = XF.chain(base, XF.ry(a), XF.t(0, y0, r0), XF.rx(slope));
        this.box(m, -w, -0.04, 0, w, 0.04, len, () => [layer, 0, 0, 1, 1]);
      }
    }
    // cords
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.3;
      const top = [c[0] + Math.cos(a) * R * 0.95, c[1] - 0.55, c[2] + Math.sin(a) * R * 0.95];
      const bot = [pos[0], pos[1] + 1.6, pos[2]];
      const d = [bot[0] - top[0], bot[1] - top[1], bot[2] - top[2]], len = Math.hypot(d[0], d[1], d[2]);
      const yaw = Math.atan2(d[0], d[2]), pitch = Math.asin(d[1] / len);
      const m = XF.chain(XF.t(top[0] - cp[0], top[1] - cp[1], top[2] - cp[2]), XF.ry(yaw), XF.rx(-pitch));
      this.box(m, -0.015, -0.015, 0, 0.015, 0.015, len, () => [white, 0, 0, 0.1, 0.1]);
    }
  },

  particle(p, cp, bs) {
    const t = 1 - p.life / p.max;
    let size = p.size;
    if (p.grow) size *= 1 + t * (p.grow - 1);
    if (p.shrink) size *= 1 - t * 0.7;
    if (p.wander) size *= 0.35 + 0.65 * Math.abs(Math.sin(p.life * 2.6 + p.x));
    this.alpha = p.blend ? Math.min(1, p.life / p.max * 1.5) * 0.85 : 1;
    if (p.glow) this.light = [1, 1];
    else this.lightAt(p.x, p.y, p.z);
    this.color = [p.r, p.g, p.b];
    if (p.streak) {
      // a thin quad stretched along the velocity (rain, meteors)
      const x = p.x - cp[0], y = p.y - cp[1], z = p.z - cp[2];
      const tx = -p.vx * p.streak, ty = -p.vy * p.streak, tz = -p.vz * p.streak;
      // side vector: velocity x view direction
      let sx = ty * z - tz * y, sy = tz * x - tx * z, sz = tx * y - ty * x;
      const sl = Math.hypot(sx, sy, sz) || 1;
      sx *= size / sl; sy *= size / sl; sz *= size / sl;
      const nx = -bs.f[0], ny = -bs.f[1], nz = -bs.f[2];
      const u0 = 0.4, u1 = 0.6;
      this.v(x - sx, y - sy, z - sz, u0, 0.5, p.layer, nx, ny, nz);
      this.v(x + sx, y + sy, z + sz, u1, 0.5, p.layer, nx, ny, nz);
      this.v(x + tx + sx, y + ty + sy, z + tz + sz, u1, 0.45, p.layer, nx, ny, nz);
      this.v(x + tx - sx, y + ty - sy, z + tz - sz, u0, 0.45, p.layer, nx, ny, nz);
      return;
    }
    const rx = bs.r[0] * size, ry = bs.r[1] * size, rz = bs.r[2] * size;
    const ux = bs.u[0] * size, uy = bs.u[1] * size, uz = bs.u[2] * size;
    const x = p.x - cp[0], y = p.y - cp[1], z = p.z - cp[2];
    const nx = -bs.f[0], ny = -bs.f[1], nz = -bs.f[2];
    const u0 = p.u0, v0 = p.v0, u1 = p.u0 + p.us, v1 = p.v0 + p.us;
    this.v(x - rx - ux, y - ry - uy, z - rz - uz, u0, v1, p.layer, nx, ny, nz);
    this.v(x + rx - ux, y + ry - uy, z + rz - uz, u1, v1, p.layer, nx, ny, nz);
    this.v(x + rx + ux, y + ry + uy, z + rz + uz, u1, v0, p.layer, nx, ny, nz);
    this.v(x - rx + ux, y - ry + uy, z - rz + uz, u0, v0, p.layer, nx, ny, nz);
  },
};
