'use strict';
// Pictures: your own images hung on walls. A Picture Frame placed against a wall opens a screen to
// pick an image from the computer (or one of the built-in ones) and a size in blocks; the image is
// shrunk to at most 256 px, kept in the world save and sent to the other players of a server.
// All pictures share one 2048x2048 atlas texture drawn by the entity pass (layer -2), so they get
// the same light, shadows and fog as everything else. Structures can hang built-in pictures too
// (chunk.gpics), which are rebuilt with the terrain and never saved.

const PIC_ATLAS = 2048, PIC_SLOT = 256, PIC_SLOTS = (PIC_ATLAS / PIC_SLOT) ** 2;
const PIC_DIR = { 0: [1, 0, 0], 1: [-1, 0, 0], 4: [0, 0, 1], 5: [0, 0, -1] };

Object.assign(I, { PICTURE: 357 });
defItem(I.PICTURE, 'Picture Frame', { sprite: 'i_picture', cat: 'functional' });
shaped(I.PICTURE, 1, ['SSS', 'SPS', 'SSS'], { S: I.STICK, P: [I.PAPER, ...TAG.wool] });
sprite('i_picture', (d) => {
  sprRect(d, 3, 5, 29, 27, [132, 94, 52]);
  sprRect(d, 6, 8, 26, 24, [120, 190, 240]);
  sprPoly(d, [[6, 24], [13, 14], [18, 20], [21, 16], [26, 24]], [80, 160, 70]);
  sprDisc(d, 21, 12, 2.5, [255, 230, 120]);
});

// ---- built-in pictures, painted with canvas ----
const PIC_BUILTIN = {
  // the school's sign: its round logo, the name and what it teaches
  stucom: { w: 4, h: 3, draw(g, W, H) {
    g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#3a3a3c'; g.textAlign = 'center';
    g.font = '600 22px Arial, sans-serif'; g.fillText("Centre d'estudis", W / 2, 34); g.fillText('Pelai', W / 2, 58);
    const cx = W / 2, cy = 118, r = 42;
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.fillStyle = '#e4322b'; g.fillRect(cx - r, cy - r, r * 2, r);          // red top
    g.fillStyle = '#243b8f'; g.fillRect(cx - r, cy, r * 2, r);              // navy bottom
    g.fillStyle = '#9aa0a8'; g.fillRect(cx - r, cy - 7, r * 2, 14);          // grey band
    g.restore();
    g.fillStyle = '#ffffff'; g.font = '900 78px Arial Black, Arial, sans-serif'; g.textBaseline = 'middle';
    g.fillText('S', cx, cy + 3);                                                // the white S
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#232325'; g.font = '700 86px Arial, sans-serif'; g.fillText('stucom', W / 2, 250);
    g.fillStyle = '#c9c9c9'; g.fillRect(40, 272, W - 80, 3);
    g.fillStyle = '#3a3a3c'; g.font = '500 26px Arial, sans-serif'; g.fillText('Batxillerat', W / 2, 314); g.fillText('Formació Professional', W / 2, 348);
  } },
  plot: { w: 2, h: 2, draw(g, W, H) {
    g.fillStyle = '#f4efe2'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#8a6a3a'; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16);
    g.fillStyle = '#2f6d3a'; g.textAlign = 'center';
    g.font = '800 64px Arial, sans-serif'; g.fillText('SOLAR', W / 2, H * 0.36); g.fillText('LLIURE', W / 2, H * 0.52);
    g.fillStyle = '#5a4a36'; g.font = '600 34px Arial, sans-serif'; g.fillText('Free plot', W / 2, H * 0.7); g.fillText('build here!', W / 2, H * 0.82);
  } },
  sunset: { w: 3, h: 2, draw(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, '#2b3a78'); s.addColorStop(0.55, '#f08a4b'); s.addColorStop(0.56, '#1f4d6e'); s.addColorStop(1, '#0d2436');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(W * 0.62, H * 0.55, 34, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,210,122,0.5)'; for (let i = 0; i < 7; i++) g.fillRect(W * 0.62 - 40 + i * 4, H * 0.58 + i * 12, 80 - i * 8, 3);
  } },
  mountains: { w: 3, h: 2, draw(g, W, H) {
    const s = g.createLinearGradient(0, 0, 0, H); s.addColorStop(0, '#8fc4ef'); s.addColorStop(1, '#dfeefb');
    g.fillStyle = s; g.fillRect(0, 0, W, H);
    const peak = (pts, c) => { g.fillStyle = c; g.beginPath(); g.moveTo(0, H); for (const [x, y] of pts) g.lineTo(x * W, y * H); g.lineTo(W, H); g.fill(); };
    peak([[0, 0.7], [0.25, 0.3], [0.45, 0.62], [0.7, 0.22], [1, 0.6]], '#6d7f95');
    peak([[0, 0.85], [0.3, 0.62], [0.55, 0.8], [0.8, 0.58], [1, 0.82]], '#3e6b43');
  } },
  // ---- STUCOM campus signs (campus.js) ----
  campus: { w: 3, h: 2, draw(g, W, H) {
    g.fillStyle = '#f6f5f1'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e4322b'; g.fillRect(0, 0, W, 18); g.fillStyle = '#243b8f'; g.fillRect(0, H - 18, W, 18);
    g.fillStyle = '#232325'; g.textAlign = 'center';
    g.font = '800 64px Arial, sans-serif'; g.fillText('stucom', W / 2, 96);
    g.font = '600 26px Arial, sans-serif'; g.fillStyle = '#4a4a4e'; g.fillText('CAMPUS', W / 2, 132);
    g.font = '500 20px Arial, sans-serif'; g.fillStyle = '#6a6a70';
    g.fillText('Benvinguts · Welcome · Bienvenidos', W / 2, 176);
    g.fillText('Biblioteca · Cafeteria · Poliesportiu · Metro', W / 2, 206);
    g.fillText('Solars lliures per construir', W / 2, 236);
  } },
  annex: { w: 7, h: 2, draw(g, W, H) {
    g.fillStyle = '#1f2a44'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#e4322b'; g.fillRect(0, 0, 10, H);
    g.fillStyle = '#ffffff'; g.textAlign = 'left';
    g.font = '800 44px Arial, sans-serif'; g.fillText('stucom', 34, 62);
    g.font = '500 19px Arial, sans-serif'; g.fillStyle = '#c9d3ea';
    g.fillText('Biblioteca \u00b7 Aula d\u2019Inform\u00e0tica \u00b7 Cafeteria', 34, 108);
  } },
  library: { w: 3, h: 2, draw(g, W, H) {
    g.fillStyle = '#2d5a3d'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#f2ead6';
    for (let i = 0; i < 9; i++) { const x = 70 + i * 42, h = 90 + (i * 37) % 50; g.fillStyle = ['#e9d9b0', '#c85a4a', '#e0b050', '#6a8ec8', '#f2ead6'][i % 5]; g.fillRect(x, 190 - h, 30, h); }
    g.fillStyle = '#f2ead6'; g.textAlign = 'center'; g.font = '800 54px Georgia, serif'; g.fillText('BIBLIOTECA', W / 2, 260);
    g.font = 'italic 24px Georgia, serif'; g.fillText('Silenci, si us plau', W / 2, 300);
  } },
  computers: { w: 3, h: 1, draw(g, W, H) {
    g.fillStyle = '#0e1726'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#7fe3ff'; g.font = '700 38px ui-monospace, Consolas, monospace'; g.textAlign = 'center';
    g.fillText('> AULA_INFO', W / 2, H / 2 + 6);
    g.fillStyle = '#6ad08a'; g.font = '500 18px ui-monospace, Consolas, monospace'; g.fillText('DAM · DAW · ASIX', W / 2, H - 22);
  } },
  gym: { w: 6, h: 1, draw(g, W, H) {
    g.fillStyle = '#12161c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#ffd24a'; g.font = '800 40px Arial, sans-serif'; g.textAlign = 'center';
    g.fillText('POLIESPORTIU STUCOM', W / 2, 56);
  } },
  bus: { w: 1, h: 1, draw(g, W, H) {
    g.fillStyle = '#d8322a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(W / 2, H / 2 - 30, 150, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#d8322a'; g.font = '900 150px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('BUS', W / 2, H / 2 + 22);
    g.fillStyle = '#fff'; g.font = '700 54px Arial, sans-serif'; g.fillText('V15 · H12 · 59', W / 2, H - 40);
  } },
  timetable: { w: 1, h: 1, draw(g, W, H) {
    g.fillStyle = '#f5f5f2'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d8322a'; g.fillRect(0, 0, W, 80);
    g.fillStyle = '#fff'; g.font = '800 46px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('STUCOM', W / 2, 56);
    g.fillStyle = '#333'; g.font = '600 34px ui-monospace, Consolas, monospace'; g.textAlign = 'left';
    ['V15  Pl. Universitat  5\'', 'H12  Pl. Catalunya  9\'', '59   Rambla        12\'', 'N7   Nit           ..'].forEach((t, i) => g.fillText(t, 26, 150 + i * 80));
  } },
  metro: { w: 1, h: 1, draw(g, W, H) {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d6202b';
    const r = 56; g.beginPath(); g.moveTo(40 + r, 40); g.arcTo(W - 40, 40, W - 40, H - 40, r); g.arcTo(W - 40, H - 40, 40, H - 40, r); g.arcTo(40, H - 40, 40, 40, r); g.arcTo(40, 40, W - 40, 40, r); g.fill();
    g.fillStyle = '#fff'; g.font = '900 300px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('M', W / 2, H / 2 + 14); g.textBaseline = 'alphabetic';
  } },
  metro_name: { w: 3, h: 1, draw(g, W, H) {
    g.fillStyle = '#16213a'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d6202b'; g.fillRect(18, 22, H - 44, H - 44);
    g.fillStyle = '#fff'; g.font = '900 96px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('M', 18 + (H - 44) / 2, H / 2 + 34);
    g.textAlign = 'left'; g.font = '700 64px Arial, sans-serif'; g.fillText('Universitat', H + 6, H / 2 + 22);
  } },
  metro_map: { w: 2, h: 1, draw(g, W, H) {
    g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, W, H);
    const lines = [['#d6202b', 70], ['#8a4ea0', 130], ['#e9b418', 190]];
    for (const [c, y] of lines) { g.strokeStyle = c; g.lineWidth = 16; g.beginPath(); g.moveTo(30, y); g.lineTo(W - 30, y + (y - 130) * 0.3); g.stroke(); }
    g.fillStyle = '#fff'; g.strokeStyle = '#222'; g.lineWidth = 6;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(70 + i * 76, 130, 16, 0, Math.PI * 2); g.fill(); g.stroke(); }
    g.fillStyle = '#222'; g.font = '700 22px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('Universitat', 70 + 2 * 76, 240);
  } },
};

const Pictures = {
  cv: null, g: null, slots: new Map(), used: [], tex: null, dirty: false, pending: null,

  // world.pictures holds placed pictures; generated ones live in G.genPics
  all() {
    const out = [];
    if (G.world && G.world.pictures) out.push(...G.world.pictures.values());
    if (G.genPics) out.push(...G.genPics.values());
    return out;
  },

  initAtlas() {
    if (this.cv) return;
    this.cv = document.createElement('canvas');
    this.cv.width = this.cv.height = PIC_ATLAS;
    this.g = this.cv.getContext('2d');
    this.used = new Array(PIC_SLOTS).fill(null);
  },

  // atlas slot of a picture, painting it the first time
  slotOf(pic) {
    this.initAtlas();
    const key = pic.id;
    if (this.slots.has(key)) return this.slots.get(key);
    let s = this.used.indexOf(null);
    if (s < 0) { this.gc(); s = this.used.indexOf(null); if (s < 0) return -1; }
    this.used[s] = key;
    this.slots.set(key, s);
    const x = (s % (PIC_ATLAS / PIC_SLOT)) * PIC_SLOT, y = Math.floor(s / (PIC_ATLAS / PIC_SLOT)) * PIC_SLOT;
    const g = this.g;
    g.clearRect(x, y, PIC_SLOT, PIC_SLOT);
    const b = pic.builtin && PIC_BUILTIN[pic.builtin];
    if (b) {
      const c = document.createElement('canvas');
      c.width = 512; c.height = Math.round(512 * pic.h / pic.w);
      b.draw(c.getContext('2d'), c.width, c.height);
      g.drawImage(c, x, y, PIC_SLOT, PIC_SLOT);
      this.dirty = true;
    } else if (pic.img) {
      const im = new Image();
      im.onload = () => { if (this.used[s] === key) { g.drawImage(im, x, y, PIC_SLOT, PIC_SLOT); this.dirty = true; } };
      im.src = pic.img;
    }
    return s;
  },

  gc() {
    const live = new Set(this.all().map((p) => p.id));
    for (let i = 0; i < this.used.length; i++) if (this.used[i] && !live.has(this.used[i])) { this.slots.delete(this.used[i]); this.used[i] = null; }
  },

  upload() {
    const R = G.renderer, gl = R.gl;
    if (!this.tex) {
      this.tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.SRGB8_ALPHA8, PIC_ATLAS, PIC_ATLAS);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      R.picTex = this.tex;
      this.dirty = true;
    }
    if (!this.dirty || !this.cv) return;
    this.dirty = false;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.cv);
  },

  // corners of a picture: bottom-left, bottom-right, top-right, top-left (world coords)
  quad(p) {
    // right = (-n) x up: to the right of someone looking at the wall
    const n = PIC_DIR[p.f], right = [n[2], 0, -n[0]];
    const bx = p.x + 0.5 - n[0] * 0.5 + n[0] * 0.03 - right[0] * 0.5, bz = p.z + 0.5 - n[2] * 0.5 + n[2] * 0.03 - right[2] * 0.5;
    const by = p.y;
    return { n, right, c: [[bx, by, bz], [bx + right[0] * p.w, by, bz + right[2] * p.w], [bx + right[0] * p.w, by + p.h, bz + right[2] * p.w], [bx, by + p.h, bz]] };
  },

  // entity pass: every picture near the camera as a textured quad in a thin wooden frame
  render(cp) {
    const list = this.all();
    if (!list.length) return;
    this.upload();
    const per = PIC_ATLAS / PIC_SLOT;
    for (const p of list) {
      if (Math.abs(p.x - cp[0]) > 96 || Math.abs(p.z - cp[2]) > 96) continue;
      const s = this.slotOf(p);
      if (s < 0) continue;
      const u0 = (s % per) / per, v0 = Math.floor(s / per) / per, du = 1 / per - 1 / PIC_ATLAS, dv = du;
      const { n, right, c } = this.quad(p);
      ER.lightAt(p.x + 0.5, p.y + p.h * 0.5, p.z + 0.5);
      ER.color = [1, 1, 1]; ER.ov = 0;
      const rel = c.map((q) => [q[0] - cp[0], q[1] - cp[1], q[2] - cp[2]]);
      const uv = [[u0, v0 + dv], [u0 + du, v0 + dv], [u0 + du, v0], [u0, v0]];
      for (let k = 0; k < 4; k++) ER.v(rel[k][0], rel[k][1], rel[k][2], uv[k][0], uv[k][1], -2, n[0], n[1], n[2]);
      if (p.builtin !== 'stucom') this.frame(p, c, n, right, cp);
    }
  },

  frame(p, c, n, right, cp) {
    const t = 1 / 16, layer = BLOCK_TEX[B.PLANKS * 6];
    const bar = (a, b, thick) => {
      // a thin box from point a to point b standing out from the wall
      const lo = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.min(a[2], b[2])];
      const hi = [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.max(a[2], b[2])];
      for (let k = 0; k < 3; k++) if (hi[k] - lo[k] < 1e-3) { lo[k] -= thick; hi[k] += thick; }
      ER.box(XF.t(-cp[0], -cp[1], -cp[2]), lo[0], lo[1], lo[2], hi[0], hi[1], hi[2], (f) => [layer, (x, y, z) => faceU(f.d, x, y, z), (x, y, z) => faceV(f.d, x, y, z)]);
    };
    const e = t * 0.5;
    const off = (q, dx, dy) => [q[0] + right[0] * dx + n[0] * 0.02, q[1] + dy, q[2] + right[2] * dx + n[2] * 0.02];
    bar(off(c[0], -e, -e), off(c[1], e, -e), t);
    bar(off(c[3], -e, e), off(c[2], e, e), t);
    bar(off(c[0], -e, -e), off(c[3], -e, e), t);
    bar(off(c[1], e, -e), off(c[2], e, e), t);
  },

  // ray against pictures (to take one down); returns { pic, dist }
  raycast(o, d, maxDist) {
    let best = null;
    for (const p of G.world && G.world.pictures ? G.world.pictures.values() : []) {
      const { n, right, c } = this.quad(p);
      const den = d[0] * n[0] + d[2] * n[2];
      if (den >= -1e-6) continue;   // only from the front
      const t = ((c[0][0] - o[0]) * n[0] + (c[0][2] - o[2]) * n[2]) / den;
      if (t < 0 || t > maxDist || (best && t >= best.dist)) continue;
      const hx = o[0] + d[0] * t, hy = o[1] + d[1] * t, hz = o[2] + d[2] * t;
      const along = (hx - c[0][0]) * right[0] + (hz - c[0][2]) * right[2], up = hy - c[0][1];
      if (along >= 0 && along <= p.w && up >= 0 && up <= p.h) best = { pic: p, dist: t };
    }
    return best;
  },

  add(p, fromNet) {
    G.world.pictures.set(p.id, p);
    G.world.editsDirty = true;
    if (!fromNet) Net.picture(p, false);
  },

  remove(p, fromNet) {
    if (!G.world.pictures.delete(p.id)) return;
    const s = this.slots.get(p.id);
    if (s !== undefined) { this.used[s] = null; this.slots.delete(p.id); }
    G.world.editsDirty = true;
    if (!fromNet) {
      Net.picture(p, true);
      if (G.mode === 'survival') Ents.spawnItem(mkStack(I.PICTURE, 1), p.x + 0.5, p.y + 0.5, p.z + 0.5);
      sfx('dig_1', [p.x + 0.5, p.y + 0.5, p.z + 0.5], 1, 1.2);
    }
  },

  // generated (structure) pictures of a chunk that just loaded
  chunkLoaded(c) {
    if (!c.gpics) return;
    G.genPics = G.genPics || new Map();
    for (const q of c.gpics) G.genPics.set('g' + q.x + ',' + q.y + ',' + q.z, Object.assign({ id: 'g' + q.x + ',' + q.y + ',' + q.z }, q));
  },

  // a frame was used on a wall: ask what to hang
  begin(hit) {
    const n = hit.normal;
    if (n[1] !== 0) { G.ui.toast('Hang pictures on walls'); return false; }
    const f = n[0] > 0 ? 0 : n[0] < 0 ? 1 : n[2] > 0 ? 4 : 5;
    this.pending = { x: hit.pos[0] + n[0], y: hit.pos[1], z: hit.pos[2] + n[2], f };
    G.ui.open({ kind: 'picture' });
    return true;
  },

  // shrink a picked file to at most 256 px and hand back a data URL and its aspect
  readFile(file, done) {
    const fr = new FileReader();
    fr.onload = () => {
      const im = new Image();
      im.onload = () => {
        const k = Math.min(1, 256 / Math.max(im.width, im.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        done(c.toDataURL('image/jpeg', 0.86), im.width / im.height);
      };
      im.onerror = () => G.ui.toast('That file is not an image');
      im.src = fr.result;
    };
    fr.readAsDataURL(file);
  },

  place(src, w, h) {
    const q = this.pending;
    if (!q) return;
    this.pending = null;
    const p = Object.assign({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, h }, q, src);
    this.add(p, false);
    if (G.mode === 'survival') { G.inv.consumeHeld(1); G.ui.invDirty(); }
    sfx('place_1', [q.x + 0.5, q.y + 0.5, q.z + 0.5], 1, 1);
  },
};

// saved with the world
function serializePictures(w) { return [...w.pictures.values()].map((p) => ({ id: p.id, x: p.x, y: p.y, z: p.z, f: p.f, w: p.w, h: p.h, img: p.img, builtin: p.builtin })); }
function validPicture(p) {
  return p && typeof p.id === 'string' && [p.x, p.y, p.z].every(Number.isInteger) && PIC_DIR[p.f] &&
    Number.isInteger(p.w) && Number.isInteger(p.h) && p.w >= 1 && p.w <= 8 && p.h >= 1 && p.h <= 8 &&
    ((typeof p.img === 'string' && p.img.startsWith('data:image/') && p.img.length < 400000) || (typeof p.builtin === 'string' && PIC_BUILTIN[p.builtin]));
}
