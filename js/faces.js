'use strict';
// Detailed faces for the STUCOM teachers: a 32×32 pixel portrait (the rest of the game uses 8×8
// heads) drawn on the front of the head. Each face is painted into a cell of the picture atlas
// (pictures.js, layer -2 of the entity pass) and laid over the head as a quad that follows it
// (skin extras with `face`). Built from simple pieces: shaded skin, hair, eyes with iris and
// highlight, brows, nose, mouth, cheeks, stubble and beard.

const FACE_N = 32;

function facePortrait(spec) {
  return (g, W, H) => {
    const N = FACE_N, px = new Array(N * N);
    const rng = mulberry32(spec.seed || 7);
    const hex = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c; };
    const get = (x, y) => px[y * N + x];
    // skin: lit in the middle, shadow at the sides and under the chin
    const sk = hex(spec.skin), shadow = mul(sk, 0.78), warm = mix(sk, [220, 120, 110], 0.18);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const dx = Math.abs(x - 15.5) / 15.5, dy = y / N;
      let c = mix(sk, shadow, Math.pow(dx, 2.2) * 0.9 + Math.max(0, dy - 0.85) * 2);
      c = mul(c, 0.97 + rng() * 0.05);
      set(x, y, c);
    }
    // cheeks
    if (spec.blush) for (const cx of [8, 23]) for (let y = 17; y <= 21; y++) for (let x = cx - 3; x <= cx + 3; x++) {
      const d = Math.hypot(x - cx, (y - 19) * 1.3);
      if (d < 3.4) set(x, y, mix(get(x, y), warm, spec.blush * (1 - d / 3.4)));
    }
    // stubble / beard
    if (spec.beard) {
      const b = spec.beard, bc = hex(b.color), bg = b.grey ? hex(b.grey) : null;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!b.where(x, y)) continue;
        const r = rng();
        if (r > b.density) continue;
        set(x, y, bg && r < b.density * b.greyShare ? mul(bg, 0.9 + rng() * 0.2) : mul(bc, 0.85 + rng() * 0.3));
      }
    }
    // mouth
    const lip = hex(spec.lip || 0xb86a62), dark = [70, 26, 24], teeth = [244, 240, 226];
    const m = spec.mouth || 'smile', my = spec.mouthY || 23;
    if (m === 'smile') {
      for (let x = 11; x <= 20; x++) set(x, my + (x === 11 || x === 20 ? -1 : 0), mul(lip, 0.8));
      for (let x = 12; x <= 19; x++) set(x, my + 1, lip);
    } else if (m === 'grin') {
      for (let x = 10; x <= 21; x++) { set(x, my - (x <= 10 || x >= 21 ? 1 : 0), dark); }
      for (let x = 11; x <= 20; x++) { set(x, my, teeth); set(x, my + 1, x % 3 === 0 ? mul(teeth, 0.88) : teeth); set(x, my + 2, dark); }
      for (let x = 12; x <= 19; x++) set(x, my + 3, mul(lip, 0.95));
    } else if (m === 'soft') {
      for (let x = 12; x <= 19; x++) set(x, my, mul(lip, x === 12 || x === 19 ? 0.85 : 1));
      for (let x = 13; x <= 18; x++) set(x, my + 1, mul(lip, 1.08));
    } else {  // straight
      for (let x = 12; x <= 19; x++) set(x, my, mul(lip, 0.75));
      for (let x = 13; x <= 18; x++) set(x, my + 1, mul(lip, 0.95));
    }
    // nose: a shadow down one side and the nostrils
    for (let y = 15; y <= 19; y++) set(17, y, mix(get(17, y), shadow, 0.55));
    set(14, 20, mul(shadow, 0.85)); set(17, 20, mul(shadow, 0.85)); set(15, 20, mix(sk, shadow, 0.3)); set(16, 20, mix(sk, shadow, 0.3));
    // eyes: lashes, white, a round iris with pupil and catchlight, a soft lower lid
    const iris = hex(spec.iris || 0x5a3a22), lash = spec.lash ? hex(spec.lash) : [40, 28, 24];
    for (const [ex, dir] of [[8, 1], [19, -1]]) {
      const y = spec.eyeY || 13;
      for (let x = ex; x < ex + 5; x++) set(x, y - 1, x === ex || x === ex + 4 ? mix(sk, lash, 0.5) : lash);
      for (let x = ex; x < ex + 5; x++) { set(x, y, [240, 238, 232]); set(x, y + 1, [232, 230, 224]); }
      const ix = ex + 1 + (dir > 0 ? 1 : 0);
      set(ix, y, iris); set(ix + 1, y, mul(iris, 0.8)); set(ix, y + 1, mul(iris, 0.8)); set(ix + 1, y + 1, iris);
      set(ix + (dir > 0 ? 1 : 0), y + (dir > 0 ? 1 : 1), [24, 16, 14]);                        // pupil
      set(ix + (dir > 0 ? 0 : 1), y, [255, 255, 255]);                                       // catchlight
      for (let x = ex; x < ex + 5; x++) set(x, y + 2, mix(sk, shadow, spec.smileEyes ? 0.55 : 0.3));
      if (spec.smileEyes) { set(ex, y + 1, mix(sk, shadow, 0.4)); set(ex + 4, y + 1, mix(sk, shadow, 0.4)); }
    }
    // brows
    const bw = hex(spec.brow || 0x3a2618);
    for (const [x0, slope] of [[7, -1], [19, 1]]) {
      const y = (spec.eyeY || 13) - 4;
      for (let i = 0; i < 6; i++) {
        const yy = y + (slope < 0 ? (i < 2 ? 1 : 0) : (i > 3 ? 1 : 0));
        set(x0 + i, yy, mul(bw, 0.9 + rng() * 0.2));
        if (spec.thickBrows) set(x0 + i, yy + 1, mul(bw, 1.1));
      }
    }
    // hair last (it covers the forehead and frames the face)
    if (spec.hair) {
      const hc = hex(spec.hair.color), hl = mix(hc, [255, 240, 220], 0.18), hg = spec.hair.grey ? hex(spec.hair.grey) : null;
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (!spec.hair.where(x, y)) continue;
        const r = rng();
        let c = hg && r < spec.hair.greyShare ? hg : (x + y * 2) % 7 === 0 || r > 0.86 ? hl : hc;
        c = mul(c, (0.9 + rng() * 0.18) * (spec.hair.strand && (x % 3 === 0) ? 0.88 : 1));
        set(x, y, c);
      }
    }
    if (spec.extra) spec.extra(set, get, { sk, shadow, mix, mul, hex });
    // paint, scaled up with hard edges
    const s = W / N;
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const c = px[y * N + x];
      g.fillStyle = `rgb(${Math.round(clamp(c[0], 0, 255))},${Math.round(clamp(c[1], 0, 255))},${Math.round(clamp(c[2], 0, 255))})`;
      g.fillRect(Math.floor(x * s), Math.floor(y * s), Math.ceil(s) + 1, Math.ceil(s) + 1);
    }
  };
}

const TEACHER_FACES = {
  // long dark-brown hair with a centre parting, warm smile
  noelia: facePortrait({ seed: 11, skin: 0xecb99a, iris: 0x5a3a24, brow: 0x4a3222, blush: 0.5, mouth: 'smile', lip: 0xc0706a,
    hair: { color: 0x4a3222, strand: true, where: (x, y) => y < 3 || (y < 8 && Math.abs(x - 15.5) > 2 + (8 - y) * 0.2 && (y < 5 + Math.abs(x - 15.5) * 0.35)) || x < 3 || x > 28 || (x < 5 && y > 6) || (x > 26 && y > 6) } }),
  // salt-and-pepper hair going back at the temples, grey stubble (his glasses are 3D)
  joan: facePortrait({ seed: 23, skin: 0xc9926a, iris: 0x3a2a20, brow: 0x4a4644, blush: 0.12, mouth: 'straight', lip: 0x9a5e4c, mouthY: 24,
    hair: { color: 0x7a7672, grey: 0xb8b2aa, greyShare: 0.4, where: (x, y) => y < 2 || (y < 6 && (x < 7 || x > 24)) || x < 2 || x > 29 },
    beard: { color: 0x7a6e64, grey: 0xaaa49c, greyShare: 0.5, density: 0.28, where: (x, y) => (y >= 21 && (x < 8 || x > 23)) || y >= 26 } }),
  // shaved head, dark beard with some grey, thick brows, a half smile
  pedro: facePortrait({ seed: 37, skin: 0xdaa888, iris: 0x2e2018, brow: 0x2a2220, thickBrows: true, blush: 0.15, mouth: 'smile', lip: 0x9a6252, mouthY: 24,
    beard: { color: 0x3e332c, grey: 0x8a827c, greyShare: 0.2, density: 0.92, where: (x, y) => (y >= 19 && (x < 9 || x > 22)) || (y >= 21 && y <= 22 && x >= 10 && x <= 21) || y >= 27 || (y >= 15 && (x < 4 || x > 27)) },
    extra: (set, get, t) => { for (let y = 0; y < 5; y++) for (let x = 0; x < 32; x++) if ((x * 7 + y * 13) % 5 === 0) set(x, y, t.mul(get(x, y), 0.9)); } }),
  // shoulder-length brown hair, fringe swept to one side, a calm smile
  laura: facePortrait({ seed: 41, skin: 0xe8b898, iris: 0x3a2a1e, brow: 0x3e2a1e, blush: 0.35, mouth: 'soft', lip: 0xc07870, smileEyes: false,
    hair: { color: 0x3e2a1e, strand: true, where: (x, y) => y < 4 || x < 4 || x > 27 || (y < 10 && y < 4 + (22 - x) * 0.3 && x < 22) || (y < 6 && x >= 22) } }),
  // dark hair combed back, big open smile, rosy cheeks
  ramon: facePortrait({ seed: 53, skin: 0xd99c82, iris: 0x3a2618, brow: 0x3a2618, thickBrows: true, blush: 0.65, mouth: 'grin', lip: 0xb85a52, mouthY: 22, smileEyes: true,
    hair: { color: 0x3a2618, strand: true, where: (x, y) => y < 3 || (y < 6 && !(x > 6 && x < 11) && !(x > 20 && x < 25)) || x < 2 || x > 29 } }),
};
for (const [k, draw] of Object.entries(TEACHER_FACES)) PIC_BUILTIN['face_' + k] = { w: 1, h: 1, draw };

// ---------------------------------------------------------------- drawing ----
{
  // each teacher skin gets a `face` entry on the head
  for (const sk of SKINS) if (sk.person && TEACHER_FACES[sk.person]) { sk.extras = sk.extras || []; sk.extras.push({ part: 'head', face: sk.person }); }
  const plain = new WeakMap();
  const orig = ER.skinExtras;
  ER.skinExtras = function (mm, extras, partId) {
    let rest = plain.get(extras);
    if (!rest) { rest = extras.filter((e) => !e.face); plain.set(extras, rest); }
    if (partId === 'head') {
      const f = extras.find((e) => e.face);
      if (f && typeof Pictures !== 'undefined') {
        const s = Pictures.slotOf({ id: 'face:' + f.face, builtin: 'face_' + f.face, w: 1, h: 1 });
        if (s >= 0) {
          Pictures.upload();
          const per = PIC_ATLAS / PIC_SLOT, u0 = (s % per) / per, v0 = Math.floor(s / per) / per, du = 1 / per - 1 / PIC_ATLAS;
          const m = mm, z = 4.04;
          const P = (x, y) => [m[0] * x + m[1] * y + m[2] * z + m[3], m[4] * x + m[5] * y + m[6] * z + m[7], m[8] * x + m[9] * y + m[10] * z + m[11]];
          let nx = m[2], ny = m[6], nz = m[10];
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl;
          const c = [P(-4, 24), P(4, 24), P(4, 32), P(-4, 32)];
          const uv = [[u0, v0 + du], [u0 + du, v0 + du], [u0 + du, v0], [u0, v0]];
          const col = this.color; this.color = [1, 1, 1];
          for (let k = 0; k < 4; k++) this.v(c[k][0], c[k][1], c[k][2], uv[k][0], uv[k][1], -2, nx, ny, nz);
          this.color = col;
        }
      }
    }
    return orig.call(this, mm, rest, partId);
  };
  // the atlas cells of faces are kept (pictures.js frees cells of pictures that are gone)
  const gc = Pictures.gc;
  Pictures.gc = function () {
    const keep = [];
    for (let i = 0; i < this.used.length; i++) if (this.used[i] && String(this.used[i]).startsWith('face:')) keep.push([i, this.used[i]]);
    gc.call(this);
    for (const [i, k] of keep) { this.used[i] = k; this.slots.set(k, i); }
  };
}
