'use strict';
// WebGL2 resource management: programs, textures, render targets, chunk meshes and the
// per-frame entity vertex stream.

let GLSL_DEFINES = '';

const SAMPLER_UNITS = {
  uAlbedo: 0, uNormalMap: 1, uShadowMap: 2, uSkyLUT: 3, uNoise: 4, uSceneColor: 5, uSceneDepth: 6,
  uSrc: 7, uScene: 8, uBloom: 9, uRays: 10, uDepth: 11, uEmitMap: 12, uAtlas: 13, uPicAtlas: 14,
};
const MAX_QUADS = 1 << 17;
const LUT_W = 256, LUT_H = 128;
const ENT_FLOATS = 16;                 // floats per entity vertex
const ENT_MAX_QUADS = 24000;
const SHADOW_PRESETS = {
  off: { size: 1, range: 0, taps: 1 },
  low: { size: 1024, range: 48, taps: 4 },
  medium: { size: 2048, range: 72, taps: 8 },
  high: { size: 4096, range: 100, taps: 12 },
};

function compileShader(gl, type, src, label) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error('Shader compile failed (' + label + '):\n' + log);
  }
  return sh;
}

function createProgram(gl, vsSrc, fsSrc, label) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc, label + ' vertex');
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc, label + ' fragment');
  const p = gl.createProgram();
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) {
    throw new Error('Program link failed (' + label + '):\n' + gl.getProgramInfoLog(p));
  }
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    if (!info) continue;
    const name = info.name.endsWith('[0]') ? info.name.slice(0, -3) : info.name;
    u[name] = gl.getUniformLocation(p, info.name);
  }
  gl.useProgram(p);
  for (const name in SAMPLER_UNITS) if (u[name]) gl.uniform1i(u[name], SAMPLER_UNITS[name]);
  return { program: p, u, label };
}

class Renderer {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL 2 is not available in this browser.');
    this.gl = gl;
    this.width = 0; this.height = 0;
    this.exposure = 1;
    this.frame = 0;
    this.stats = { drawn: 0, shadowDrawn: 0, triangles: 0, entities: 0 };

    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic');
    gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.hdrFormat = this.detectHdrFormat();
    this.hdrScale = this.hdrFormat.float ? 1.0 : 0.25;

    this.createStaticResources();
    this.createEntityResources();
    this.buildPrograms();
    this.shadowKey = '';
    this.ensureShadowTarget();
  }

  detectHdrFormat() {
    const gl = this.gl;
    const tryFormat = (internal, type) => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texStorage2D(gl.TEXTURE_2D, 1, internal, 4, 4);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(t);
      while (gl.getError() !== gl.NO_ERROR) { /* clear errors from unsupported formats */ }
      return ok ? { internal, type, float: true } : null;
    };
    return tryFormat(gl.RGBA16F, gl.HALF_FLOAT) || { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE, float: false };
  }

  buildPrograms() {
    const gl = this.gl;
    const preset = SHADOW_PRESETS[this.settings.shadows] || SHADOW_PRESETS.high;
    GLSL_DEFINES = [
      '#define HDR_SCALE ' + this.hdrScale.toFixed(4),
      '#define SHADOW_TAPS ' + Math.max(1, Math.min(12, preset.taps)),
      '#define CLOUD_REFLECT ' + (this.settings.clouds ? 1 : 0),
    ].join('\n');
    const old = this.progs;
    this.progs = {
      terrain: createProgram(gl, VS_TERRAIN, FS_TERRAIN(), 'terrain'),
      shadow: createProgram(gl, VS_TERRAIN, FS_SHADOW(), 'shadow'),
      water: createProgram(gl, VS_TERRAIN, FS_WATER(), 'water'),
      entity: createProgram(gl, VS_ENTITY, FS_ENTITY(), 'entity'),
      entityShadow: createProgram(gl, VS_ENTITY, FS_ENTITY_SHADOW(), 'entity shadow'),
      sky: createProgram(gl, VS_FULLSCREEN, FS_SKY(), 'sky'),
      skyLut: createProgram(gl, VS_FULLSCREEN, FS_SKY_LUT(), 'sky LUT'),
      lines: createProgram(gl, VS_LINES, FS_LINES(), 'lines'),
      bloomDown: createProgram(gl, VS_FULLSCREEN, FS_BLOOM_DOWN(), 'bloom down'),
      bloomUp: createProgram(gl, VS_FULLSCREEN, FS_BLOOM_UP(), 'bloom up'),
      godrays: createProgram(gl, VS_FULLSCREEN, FS_GODRAYS(), 'god rays'),
      composite: createProgram(gl, VS_FULLSCREEN, FS_COMPOSITE(), 'composite'),
      fxaa: createProgram(gl, VS_FULLSCREEN, FS_FXAA(), 'fxaa'),
    };
    if (old) for (const k in old) gl.deleteProgram(old[k].program);
    this.programKey = this.settings.shadows + '|' + this.settings.clouds;
  }

  createStaticResources() {
    const gl = this.gl;
    // full-screen triangle
    this.fsVAO = gl.createVertexArray();
    gl.bindVertexArray(this.fsVAO);
    const fsBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, fsBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // shared quad index buffer
    const idx = new Uint32Array(MAX_QUADS * 6);
    for (let q = 0, v = 0, i = 0; q < MAX_QUADS; q++, v += 4) {
      idx[i++] = v; idx[i++] = v + 1; idx[i++] = v + 2;
      idx[i++] = v + 2; idx[i++] = v + 3; idx[i++] = v;
    }
    this.quadIndex = gl.createBuffer();
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndex);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

    // selection box lines
    const e = 0.003, lo = -e, hi = 1 + e;
    const c = [[lo, lo, lo], [hi, lo, lo], [hi, lo, hi], [lo, lo, hi], [lo, hi, lo], [hi, hi, lo], [hi, hi, hi], [lo, hi, hi]];
    const edges = [0, 1, 1, 2, 2, 3, 3, 0, 4, 5, 5, 6, 6, 7, 7, 4, 0, 4, 1, 5, 2, 6, 3, 7];
    const lineData = new Float32Array(edges.length * 3);
    edges.forEach((k, i) => lineData.set(c[k], i * 3));
    this.lineVAO = gl.createVertexArray();
    gl.bindVertexArray(this.lineVAO);
    const lb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, lb);
    gl.bufferData(gl.ARRAY_BUFFER, lineData, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);

    // block textures, item sprites and effects
    const tex = generateTextures(this.settings.textureSeed || 1337);
    const maxLayers = gl.getParameter(gl.MAX_ARRAY_TEXTURE_LAYERS) || 256;
    if (tex.count > maxLayers) throw new Error('Too many texture layers (' + tex.count + ' > ' + maxLayers + ')');
    this.textureTiles = tex.tiles;
    this.texCount = tex.count;
    this.albedoTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.albedoTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, tex.levels.length, gl.SRGB8_ALPHA8, TS, TS, tex.count);
    tex.levels.forEach((lv, level) => {
      gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, level, 0, 0, 0, lv.size, lv.size, tex.count, gl.RGBA, gl.UNSIGNED_BYTE, lv.data);
    });
    this.setArrayParams(gl.NEAREST);

    this.normalTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.normalTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, tex.levels.length, gl.RGBA8, TS, TS, tex.count);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, TS, TS, tex.count, gl.RGBA, gl.UNSIGNED_BYTE, tex.normal);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    this.setArrayParams(gl.NEAREST);

    this.emitTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.emitTex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, tex.levels.length, gl.R8, TS, TS, tex.count);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, TS, TS, tex.count, gl.RED, gl.UNSIGNED_BYTE, tex.emit);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
    this.setArrayParams(gl.NEAREST);

    // tileable noise for water and clouds
    const N = 128;
    this.noiseTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.noiseTex);
    gl.texStorage2D(gl.TEXTURE_2D, 8, gl.RGBA8, N, N);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, N, N, gl.RGBA, gl.UNSIGNED_BYTE, makeTileableNoise(N, 4242));
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    // sky-view LUT
    this.lutTex = this.createTarget(LUT_W, LUT_H, this.hdrFormat.internal, gl.LINEAR, gl.REPEAT, gl.CLAMP_TO_EDGE);
    this.lutFB = this.createFBO(this.lutTex, null);
  }

  // Mob skins live in one 2D atlas painted by models.js.
  setAtlas(canvas) {
    const gl = this.gl;
    if (!this.atlasTex) this.atlasTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  createEntityResources() {
    const gl = this.gl;
    this.entData = new Float32Array(ENT_MAX_QUADS * 4 * ENT_FLOATS);
    this.entVAO = gl.createVertexArray();
    this.entVBO = gl.createBuffer();
    gl.bindVertexArray(this.entVAO);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.entVBO);
    gl.bufferData(gl.ARRAY_BUFFER, this.entData.byteLength, gl.DYNAMIC_DRAW);
    const stride = ENT_FLOATS * 4;
    const attr = (loc, n, off) => { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride, off * 4); };
    attr(0, 3, 0); attr(1, 3, 3); attr(2, 3, 6); attr(3, 3, 9); attr(4, 4, 12);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndex);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  uploadEntities(quads) {
    if (!quads) return;
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.entVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.entData, 0, quads * 4 * ENT_FLOATS);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  drawEntityRange(first, count) {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.entVAO);
    gl.drawElements(gl.TRIANGLES, count * 6, gl.UNSIGNED_INT, first * 6 * 4);
  }

  setArrayParams(magFilter) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, magFilter);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (this.aniso) {
      const max = gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1;
      gl.texParameterf(gl.TEXTURE_2D_ARRAY, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
  }

  createTarget(w, h, internal, filter, wrapS, wrapT) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texStorage2D(gl.TEXTURE_2D, 1, internal, w, h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS || gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT || gl.CLAMP_TO_EDGE);
    return t;
  }

  createFBO(color, depth) {
    const gl = this.gl;
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    if (color) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);
    if (depth) gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depth, 0);
    if (!color) { gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE); }
    const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (st !== gl.FRAMEBUFFER_COMPLETE && !gl.isContextLost()) throw new Error('Framebuffer incomplete: 0x' + st.toString(16));
    return fb;
  }

  ensureShadowTarget() {
    const gl = this.gl;
    const preset = SHADOW_PRESETS[this.settings.shadows] || SHADOW_PRESETS.high;
    const key = String(preset.size);
    if (key === this.shadowKey) return;
    if (this.shadowFB) { gl.deleteFramebuffer(this.shadowFB); gl.deleteTexture(this.shadowTex); }
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096;
    const size = Math.min(preset.size, maxTex);
    this.shadowSize = size;
    this.shadowTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.shadowTex);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.DEPTH_COMPONENT24, size, size);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
    this.shadowFB = this.createFBO(null, this.shadowTex);
    // clear once so the "off" preset samples a fully lit map
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
    gl.viewport(0, 0, size, size);
    gl.depthMask(true);
    gl.clearDepth(1);
    gl.clear(gl.DEPTH_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.shadowKey = key;
  }

  applySettings() {
    const key = this.settings.shadows + '|' + this.settings.clouds;
    if (key !== this.programKey) this.buildPrograms();
    this.ensureShadowTarget();
  }

  resize(w, h) {
    w = Math.max(1, w | 0); h = Math.max(1, h | 0);
    if (w === this.width && h === this.height) return;
    const gl = this.gl;
    this.canvas.width = w; this.canvas.height = h;
    this.width = w; this.height = h;
    const del = (list) => list.forEach((o) => o && (o instanceof WebGLFramebuffer ? gl.deleteFramebuffer(o) : gl.deleteTexture(o)));
    if (this.targets) del(this.targets);
    const F = this.hdrFormat.internal;
    this.colorA = this.createTarget(w, h, F, gl.LINEAR);
    this.depthA = this.createTarget(w, h, gl.DEPTH_COMPONENT24, gl.NEAREST);
    this.colorB = this.createTarget(w, h, F, gl.LINEAR);
    this.depthB = this.createTarget(w, h, gl.DEPTH_COMPONENT24, gl.NEAREST);
    this.fbA = this.createFBO(this.colorA, this.depthA);
    this.fbB = this.createFBO(this.colorB, this.depthB);
    const hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    this.raysTex = this.createTarget(hw, hh, F, gl.LINEAR);
    this.raysFB = this.createFBO(this.raysTex, null);
    this.bloom = [];
    let bw = hw, bh = hh;
    for (let i = 0; i < 6 && bw >= 2 && bh >= 2; i++) {
      const t = this.createTarget(bw, bh, F, gl.LINEAR);
      this.bloom.push({ tex: t, fb: this.createFBO(t, null), w: bw, h: bh });
      bw = Math.max(1, bw >> 1); bh = Math.max(1, bh >> 1);
    }
    this.ldrTex = this.createTarget(w, h, gl.RGBA8, gl.LINEAR);
    this.ldrFB = this.createFBO(this.ldrTex, null);
    this.targets = [this.colorA, this.depthA, this.colorB, this.depthB, this.fbA, this.fbB, this.raysTex, this.raysFB,
      this.ldrTex, this.ldrFB, ...this.bloom.flatMap((b) => [b.tex, b.fb])];
  }

  // ---- chunk meshes ----
  createMesh() {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const vbo = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.UNSIGNED_SHORT, false, VERT_BYTES, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 4, gl.UNSIGNED_BYTE, false, VERT_BYTES, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, false, VERT_BYTES, 12);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, false, VERT_BYTES, 16);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.quadIndex);
    gl.bindVertexArray(null);
    return { vao, vbo, count: 0 };
  }

  uploadChunk(chunk, res) {
    const gl = this.gl;
    chunk.uploads = (chunk.uploads || 0) + 1;   // lets the minimap know the chunk changed
    if (!chunk.mesh) chunk.mesh = { opaque: null, cutout: null, water: null };
    for (const kind of ['opaque', 'cutout', 'water']) {
      const b = res[kind];
      let m = chunk.mesh[kind];
      if (b.count === 0) {
        if (m) { this.freeMesh(m); chunk.mesh[kind] = null; }
        continue;
      }
      if (!m) m = chunk.mesh[kind] = this.createMesh();
      gl.bindVertexArray(null);
      gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
      gl.bufferData(gl.ARRAY_BUFFER, b.data(), gl.STATIC_DRAW);
      m.count = Math.min(b.count >> 2, MAX_QUADS) * 6;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
  }

  freeMesh(m) {
    this.gl.deleteVertexArray(m.vao);
    this.gl.deleteBuffer(m.vbo);
  }

  freeChunk(chunk) {
    if (!chunk.mesh) return;
    for (const kind of ['opaque', 'cutout', 'water']) if (chunk.mesh[kind]) this.freeMesh(chunk.mesh[kind]);
    chunk.mesh = null;
  }

  bindTex(unit, target, tex) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
  }
}
