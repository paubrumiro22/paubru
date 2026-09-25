'use strict';
// Per-frame rendering: camera, atmosphere, shadow/scene/water passes and post-processing.

const BIAS_MAT = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
const SUN_LUT_I = 20;
const MOON_LUT_I = 0.55;

Object.assign(Renderer.prototype, {
  setU(prog, name, kind, a, b, c, d) {
    const l = prog.u[name];
    if (!l) return;
    const gl = this.gl;
    switch (kind) {
      case '1f': gl.uniform1f(l, a); break;
      case '1i': gl.uniform1i(l, a); break;
      case '2f': gl.uniform2f(l, a, b); break;
      case '3v': gl.uniform3f(l, a[0], a[1], a[2]); break;
      case '3f': gl.uniform3f(l, a, b, c); break;
      case '4f': gl.uniform4f(l, a, b, c, d); break;
      case 'm4': gl.uniformMatrix4fv(l, false, a); break;
    }
  },

  updateCamera(cam) {
    const aspect = this.width / this.height;
    const yaw = cam.yaw, pitch = cam.pitch;
    const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    let r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let u = V3.cross(r, f);
    if (cam.roll) {
      const c = Math.cos(cam.roll), s = Math.sin(cam.roll);
      const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
      r = r2;
    }
    const back = [-f[0], -f[1], -f[2]];
    this.camForward = f;
    this.near = 0.06;
    // high up (flying) the ground below must stay inside the far plane
    this.zFar = Math.max(260, this.rd() * CS + 80, cam.pos[1] - 40 + this.rd() * CS);
    this.view = M4.fromBasis(this.view || M4.create(), r, u, back, [0, 0, 0]);
    this.proj = M4.perspective(this.proj || M4.create(), (cam.fov * Math.PI) / 180, aspect, this.near, this.zFar);
    this.viewProj = M4.multiply(this.viewProj || M4.create(), this.proj, this.view);
    this.invViewProj = M4.invert(this.invViewProj || M4.create(), this.viewProj);
    this.camPos = cam.pos;
    // frustum planes (camera-relative)
    const m = this.viewProj;
    const planes = this.planes || (this.planes = [new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4), new Float32Array(4)]);
    for (let i = 0; i < 3; i++) {
      for (let s = 0; s < 2; s++) {
        const p = planes[i * 2 + s], sign = s ? -1 : 1;
        p[0] = m[3] + sign * m[i]; p[1] = m[7] + sign * m[4 + i]; p[2] = m[11] + sign * m[8 + i]; p[3] = m[15] + sign * m[12 + i];
      }
    }
  },

  boxVisible(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const p of this.planes) {
      const x = p[0] > 0 ? maxX : minX, y = p[1] > 0 ? maxY : minY, z = p[2] > 0 ? maxZ : minZ;
      if (p[0] * x + p[1] * y + p[2] * z + p[3] < 0) return false;
    }
    return true;
  },

  // render distance in chunks, widened a little while flying (rangeBoost is fractional)
  rd() { return this.settings.renderDistance + (this.rangeBoost || 0); },

  updateAtmosphere(dayTime, time, eyeSky, dt, weather = 0) {
    const a = dayTime * Math.PI * 2;
    const sunDir = V3.norm([Math.cos(a), Math.sin(a), 0.3]);
    const moonDir = [-sunDir[0], -sunDir[1], -sunDir[2]];
    const sunUp = smoothstep(0.0, 0.1, sunDir[1]);
    const moonUp = smoothstep(0.0, 0.1, moonDir[1]);
    const sunT = Atmos.transmittance(sunDir);
    const sunColor = sunT.map((v) => v * smoothstep(-0.03, 0.02, sunDir[1]));
    const night = smoothstep(0.08, -0.16, sunDir[1]);
    const sunI = sunDir[1] > -0.3 ? SUN_LUT_I : 0;
    const moonI = moonDir[1] > -0.2 ? MOON_LUT_I : 0;

    let lightDir, lightColor;
    if (sunDir[1] >= 0) {
      lightDir = sunDir;
      lightColor = sunT.map((v) => v * 2.2 * sunUp);
    } else {
      lightDir = moonDir;
      lightColor = [0.075 * moonUp, 0.095 * moonUp, 0.14 * moonUp];
    }
    // overcast: dimmer, flatter light
    const wk = 1 - 0.74 * weather;
    lightColor = lightColor.map((v) => v * wk);
    const skyScale = 1.9 * (1 - 0.5 * weather);
    // ambient from the same sky model (cached, it only changes slowly)
    const key = Math.round(dayTime * 2000);
    if (key !== this.ambKey) {
      this.ambKey = key;
      const irr = Atmos.skyIrradiance(sunDir, sunI, moonDir, moonI);
      this.ambSky = irr.map((v) => v * 1.9);
    }
    const nightFloor = [0.018, 0.022, 0.036];
    const grey = (this.ambSky[0] + this.ambSky[1] + this.ambSky[2]) / 3;
    const ambUp = this.ambSky.map((v, i) => (v + (grey - v) * 0.6 * weather) * 0.3 * (1 - 0.3 * weather) + nightFloor[i]);
    const ambDown = ambUp.map((v, i) => v * 0.32 + lightColor[i] * 0.05 * Math.max(lightDir[1], 0));
    const lum = 0.2126 * ambUp[0] + 0.7152 * ambUp[1] + 0.0722 * ambUp[2] + 0.2 * (lightColor[0] + lightColor[1] + lightColor[2]) / 3;
    // under water the haze takes the colour of the water you are in (set by the frame loop)
    const ws = this.waterScatter || [0.013, 0.07, 0.09];
    const waterFog = ws.map((c) => c * 0.9 * lum + c * 0.08);

    const dawn = Math.exp(-Math.pow((sunDir[1] - 0.05) / 0.18, 2));
    const fogDensity = (0.0021 + 0.0032 * dawn) * (1 + 2.2 * weather) + 0.0016 * weather;
    const dayF = smoothstep(-0.12, 0.2, sunDir[1]);
    const target = lerp(2.4, 0.6, dayF) * (1 + 2.4 * (1 - eyeSky));
    this.exposure += (target - this.exposure) * (1 - Math.exp(-dt * 1.6));

    this.atmo = {
      sunDir, moonDir, lightDir, lightColor, sunColor, ambUp, ambDown, waterFog, fogDensity, night, skyScale,
      sunI, moonI, dawn, cloudCover: Math.min(0.95, 0.42 + 0.1 * Math.sin(time * 0.004) + 0.5 * weather), time, weather,
    };
  },

  setCommon(prog, underwater) {
    const A = this.atmo;
    this.setU(prog, 'uSunDir', '3v', A.sunDir);
    this.setU(prog, 'uMoonDir', '3v', A.moonDir);
    this.setU(prog, 'uLightDir', '3v', A.lightDir);
    this.setU(prog, 'uLightColor', '3v', A.lightColor);
    this.setU(prog, 'uSunColor', '3v', A.sunColor);
    this.setU(prog, 'uAmbUp', '3v', A.ambUp);
    this.setU(prog, 'uAmbDown', '3v', A.ambDown);
    this.setU(prog, 'uWaterFog', '3v', A.waterFog);
    this.setU(prog, 'uCamPos', '3f', this.camPos[0], this.camPos[1], this.camPos[2]);
    this.setU(prog, 'uTime', '1f', A.time);
    this.setU(prog, 'uFogDensity', '1f', A.fogDensity);
    this.setU(prog, 'uFar', '1f', this.rd() * CS);
    this.setU(prog, 'uUnderwater', '1f', underwater ? 1 : 0);
    this.setU(prog, 'uSkyScale', '1f', A.skyScale);
    this.setU(prog, 'uNight', '1f', A.night);
    this.setU(prog, 'uShadowOn', '1f', this.shadowsActive ? 1 : 0);
    this.setU(prog, 'uShadowSize', '1f', this.shadowSize);
    this.setU(prog, 'uShadowTexel', '1f', this.shadowTexel || 0.05);
    this.setU(prog, 'uShadowMat', 'm4', this.shadowMat || BIAS_MAT);
    this.setU(prog, 'uCloudCover', '1f', A.cloudCover);
    this.setU(prog, 'uCloudTime', '1f', A.time);
    this.setU(prog, 'uWind', '1f', A.wind || 1);
    this.setU(prog, 'uRain', '1f', A.rain || 0);
    this.setU(prog, 'uSnow', '1f', A.snow || 0);
  },

  bindSceneTextures() {
    const gl = this.gl;
    this.bindTex(0, gl.TEXTURE_2D_ARRAY, this.albedoTex);
    this.bindTex(1, gl.TEXTURE_2D_ARRAY, this.normalTex);
    this.bindTex(2, gl.TEXTURE_2D, this.shadowTex);
    this.bindTex(3, gl.TEXTURE_2D, this.lutTex);
    this.bindTex(4, gl.TEXTURE_2D, this.noiseTex);
    this.bindTex(12, gl.TEXTURE_2D_ARRAY, this.emitTex);
    this.bindTex(13, gl.TEXTURE_2D, this.atlasTex || null);
  },

  // Camera basis for code that builds geometry in view space (first-person hand).
  cameraBasis(cam) {
    const yaw = cam.yaw, pitch = cam.pitch;
    const f = [-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)];
    let r = [Math.cos(yaw), 0, -Math.sin(yaw)];
    let u = V3.cross(r, f);
    if (cam.roll) {
      const c = Math.cos(cam.roll), s = Math.sin(cam.roll);
      const r2 = [r[0] * c + u[0] * s, r[1] * c + u[1] * s, r[2] * c + u[2] * s];
      u = [u[0] * c - r[0] * s, u[1] * c - r[1] * s, u[2] * c - r[2] * s];
      r = r2;
    }
    return { f, r, u };
  },

  drawFullscreen() {
    const gl = this.gl;
    gl.bindVertexArray(this.fsVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  },

  drawChunkList(prog, list, kind) {
    const gl = this.gl;
    const loc = prog.u.uChunkOffset;
    const cp = this.camPos;
    let tris = 0;
    for (const c of list) {
      const m = c.mesh && c.mesh[kind];
      if (!m || !m.count) continue;
      if (loc) gl.uniform3f(loc, c.cx * CS - cp[0], -cp[1], c.cz * CS - cp[2]);
      gl.bindVertexArray(m.vao);
      gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_INT, 0);
      tris += m.count / 3;
    }
    return tris;
  },

  computeShadowMatrix() {
    const preset = SHADOW_PRESETS[this.settings.shadows] || SHADOW_PRESETS.high;
    const range = preset.range;
    const L = this.atmo.lightDir;
    const back = L;
    const up0 = Math.abs(L[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
    const right = V3.norm(V3.cross(up0, back));
    const up = V3.cross(back, right);
    const cp = this.camPos;
    const texel = (2 * range) / this.shadowSize;
    const cr = Math.floor(V3.dot(cp, right) / texel) * texel;
    const cu = Math.floor(V3.dot(cp, up) / texel) * texel;
    const cb = V3.dot(cp, back);
    const depth = range + 160;
    const eye = [0, 1, 2].map((i) => right[i] * cr + up[i] * cu + back[i] * (cb + depth) - cp[i]);
    const view = M4.fromBasis(this.shadowView || (this.shadowView = M4.create()), right, up, back, eye);
    const proj = M4.ortho(this.shadowProj || (this.shadowProj = M4.create()), -range, range, -range, range, 0, depth + range + 60);
    this.shadowVP = M4.multiply(this.shadowVP || M4.create(), proj, view);
    this.shadowMat = M4.multiply(this.shadowMat || M4.create(), BIAS_MAT, this.shadowVP);
    this.shadowTexel = texel;
    this.shadowRange = range;
  },

  render(p) {
    const gl = this.gl;
    if (gl.isContextLost()) return;
    const S = this.settings;
    this.frame++;
    this.updateCamera(p.cam);
    this.updateAtmosphere(p.dayTime, p.time, p.eyeSky, p.dt, p.weather || 0);
    const A = this.atmo;
    A.rain = p.rain || 0; A.snow = p.snow || 0;
    A.fogDensity += 0.022 * (p.mist || 0); A.wind = 1 + 1.8 * (p.weather || 0) * (p.weather || 0);
    const W = this.width, H = this.height;
    const cp = this.camPos;
    const ent = p.entities;
    if (ent) this.uploadEntities(ent.quads);
    this.stats.entities = ent ? ent.quads : 0;

    // --- visibility ---
    const visible = [], shadowList = [];
    const rd = this.rd() * CS + 8;
    const shadowReach = (SHADOW_PRESETS[S.shadows] || SHADOW_PRESETS.high).range + 24;
    for (const c of p.chunks) {
      if (!c.mesh) continue;
      const x0 = c.cx * CS - cp[0], z0 = c.cz * CS - cp[2];
      const dx = x0 + 8, dz = z0 + 8;
      const dist = Math.hypot(dx, dz);
      if (dist > rd + 12) continue;
      c._dist = dist;
      if (dist < shadowReach) shadowList.push(c);
      if (this.boxVisible(x0 - 0.2, -cp[1], z0 - 0.2, x0 + CS + 0.2, c.maxY + 2 - cp[1], z0 + CS + 0.2)) visible.push(c);
    }
    visible.sort((a, b) => a._dist - b._dist);

    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.depthMask(true);

    // --- sky LUT ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lutFB);
    gl.viewport(0, 0, LUT_W, LUT_H);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    let prog = this.progs.skyLut;
    gl.useProgram(prog.program);
    this.setU(prog, 'uSunDir', '3v', A.sunDir);
    this.setU(prog, 'uMoonDir', '3v', A.moonDir);
    this.setU(prog, 'uSunI', '1f', A.sunI);
    this.setU(prog, 'uMoonI', '1f', A.moonI);
    this.setU(prog, 'uLUTSize', '2f', LUT_W, LUT_H);
    this.drawFullscreen();

    // --- shadow map ---
    this.shadowsActive = S.shadows !== 'off' && A.lightDir[1] > 0.02;
    if (this.shadowsActive) {
      this.computeShadowMatrix();
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.shadowFB);
      gl.viewport(0, 0, this.shadowSize, this.shadowSize);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LESS);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(1.6, 2.5);
      prog = this.progs.shadow;
      gl.useProgram(prog.program);
      this.setU(prog, 'uViewProj', 'm4', this.shadowVP);
      this.setU(prog, 'uCamPos', '3f', cp[0], cp[1], cp[2]);
      this.setU(prog, 'uTime', '1f', A.time);
      this.setU(prog, 'uWind', '1f', A.wind || 1);
      this.bindTex(0, gl.TEXTURE_2D_ARRAY, this.albedoTex);
      this.setU(prog, 'uCutout', '1i', 0);
      this.stats.shadowDrawn = shadowList.length;
      this.drawChunkList(prog, shadowList, 'opaque');
      this.setU(prog, 'uCutout', '1i', 1);
      this.drawChunkList(prog, shadowList, 'cutout');
      if (ent && ent.opaque[1] > 0) {
        prog = this.progs.entityShadow;
        gl.useProgram(prog.program);
        this.setU(prog, 'uViewProj', 'm4', this.shadowVP);
        this.bindTex(13, gl.TEXTURE_2D, this.atlasTex || null);
        this.drawEntityRange(ent.opaque[0], ent.opaque[1]);
      }
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }

    // --- opaque scene ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA);
    gl.viewport(0, 0, W, H);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    this.bindSceneTextures();
    prog = this.progs.terrain;
    gl.useProgram(prog.program);
    this.setCommon(prog, p.underwater);
    this.setU(prog, 'uViewProj', 'm4', this.viewProj);
    this.setU(prog, 'uCutout', '1i', 0);
    let tris = this.drawChunkList(prog, visible, 'opaque');
    gl.disable(gl.CULL_FACE);
    this.setU(prog, 'uCutout', '1i', 1);
    tris += this.drawChunkList(prog, visible, 'cutout');

    // entities, then block-breaking cracks pulled slightly towards the camera
    if (ent) {
      prog = this.progs.entity;
      gl.useProgram(prog.program);
      this.setCommon(prog, p.underwater);
      this.setU(prog, 'uViewProj', 'm4', this.viewProj);
      this.setU(prog, 'uPass', '1i', 0);
      this.drawEntityRange(ent.opaque[0], ent.opaque[1]);
      if (ent.crack[1] > 0) {
        this.setU(prog, 'uPass', '1i', 2);
        this.setU(prog, 'uCrack', '1f', ent.crackLevel);
        gl.enable(gl.POLYGON_OFFSET_FILL);
        gl.polygonOffset(-1.0, -2.0);
        this.drawEntityRange(ent.crack[0], ent.crack[1]);
        gl.disable(gl.POLYGON_OFFSET_FILL);
      }
    }

    // sky behind everything
    gl.depthFunc(gl.LEQUAL);
    gl.depthMask(false);
    prog = this.progs.sky;
    gl.useProgram(prog.program);
    this.setCommon(prog, p.underwater);
    this.setU(prog, 'uInvViewProj', 'm4', this.invViewProj);
    this.setU(prog, 'uCloudSteps', '1i', S.clouds ? 14 : 0);
    this.drawFullscreen();
    gl.depthMask(true);
    gl.depthFunc(gl.LESS);

    // --- copy opaque colour+depth for refraction / SSR ---
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbA);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fbB);
    gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbA);

    // --- water ---
    prog = this.progs.water;
    gl.useProgram(prog.program);
    this.setCommon(prog, p.underwater);
    this.setU(prog, 'uViewProj', 'm4', this.viewProj);
    this.setU(prog, 'uView', 'm4', this.view);
    this.setU(prog, 'uProj', 'm4', this.proj);
    this.setU(prog, 'uResolution', '2f', W, H);
    this.setU(prog, 'uNear', '1f', this.near);
    this.setU(prog, 'uZFar', '1f', this.zFar);
    this.setU(prog, 'uSSR', '1i', S.ssr ? 1 : 0);
    this.bindTex(5, gl.TEXTURE_2D, this.colorB);
    this.bindTex(6, gl.TEXTURE_2D, this.depthB);
    tris += this.drawChunkList(prog, visible, 'water');
    this.stats.drawn = visible.length;
    this.stats.triangles = tris;

    // --- translucent particles (smoke) ---
    if (ent && ent.blend[1] > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      prog = this.progs.entity;
      gl.useProgram(prog.program);
      this.setU(prog, 'uPass', '1i', 1);
      this.bindTex(0, gl.TEXTURE_2D_ARRAY, this.albedoTex);
      this.drawEntityRange(ent.blend[0], ent.blend[1]);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
    }

    // --- selection outline ---
    if (p.selection) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      prog = this.progs.lines;
      gl.useProgram(prog.program);
      this.setU(prog, 'uViewProj', 'm4', this.viewProj);
      this.setU(prog, 'uOffset', '3f', p.selection[0] - cp[0], p.selection[1] - cp[1], p.selection[2] - cp[2]);
      const bx = p.selectionBox || [0, 0, 0, 1, 1, 1];
      this.setU(prog, 'uBoxMin', '3f', bx[0], bx[1], bx[2]);
      this.setU(prog, 'uBoxSize', '3f', bx[3] - bx[0], bx[4] - bx[1], bx[5] - bx[2]);
      this.setU(prog, 'uColor', '4f', 0.02, 0.02, 0.02, 0.7);
      gl.bindVertexArray(this.lineVAO);
      gl.drawArrays(gl.LINES, 0, 24);
      gl.disable(gl.BLEND);
    }

    // --- first-person hand / held item, squeezed into the front of the depth range ---
    if (ent && ent.hand[1] > 0) {
      const aspect = W / H;
      this.handProj = M4.perspective(this.handProj || M4.create(), (70 * Math.PI) / 180, aspect, 0.02, 20);
      this.handVP = M4.multiply(this.handVP || M4.create(), this.handProj, this.view);
      gl.depthRange(0, 0.02);
      prog = this.progs.entity;
      gl.useProgram(prog.program);
      this.setU(prog, 'uViewProj', 'm4', this.handVP);
      this.setU(prog, 'uPass', '1i', 0);
      this.bindTex(0, gl.TEXTURE_2D_ARRAY, this.albedoTex);
      this.bindTex(2, gl.TEXTURE_2D, this.shadowTex);
      this.drawEntityRange(ent.hand[0], ent.hand[1]);
      gl.depthRange(0, 1);
    }
    gl.disable(gl.DEPTH_TEST);
    gl.bindVertexArray(null);

    // --- god rays ---
    let raysOn = false;
    if (S.godrays && !p.underwater) {
      const L = A.lightDir;
      const v = this.viewProj;
      const x = v[0] * L[0] + v[4] * L[1] + v[8] * L[2];
      const y = v[1] * L[0] + v[5] * L[1] + v[9] * L[2];
      const w = v[3] * L[0] + v[7] * L[1] + v[11] * L[2];
      const facing = V3.dot(this.camForward, L);
      if (w > 1e-4 && facing > 0.05 && L[1] > 0) {
        const sx = (x / w) * 0.5 + 0.5, sy = (y / w) * 0.5 + 0.5;
        const isSun = A.sunDir[1] >= 0;
        const strength = (isSun ? 0.2 + 0.45 * A.dawn : 0.6) * smoothstep(0.05, 0.45, facing) * smoothstep(0.0, 0.08, L[1]);
        if (strength > 0.001) {
          raysOn = true;
          gl.bindFramebuffer(gl.FRAMEBUFFER, this.raysFB);
          gl.viewport(0, 0, Math.max(1, W >> 1), Math.max(1, H >> 1));
          prog = this.progs.godrays;
          gl.useProgram(prog.program);
          this.bindTex(11, gl.TEXTURE_2D, this.depthA);
          this.bindTex(8, gl.TEXTURE_2D, this.colorA);
          this.setU(prog, 'uSunScreen', '2f', sx, sy);
          const rc = isSun ? A.sunColor.map((c) => c + 0.05) : [0.5, 0.6, 0.9];
          this.setU(prog, 'uRayColor', '3v', rc);
          this.setU(prog, 'uIntensity', '1f', strength);
          this.setU(prog, 'uAspect', '1f', W / H);
          this.drawFullscreen();
        }
      }
    }

    // --- bloom ---
    const bloomOn = S.bloom && this.bloom.length > 0;
    if (bloomOn) {
      prog = this.progs.bloomDown;
      gl.useProgram(prog.program);
      let srcTex = this.colorA, sw = W, sh = H;
      for (let i = 0; i < this.bloom.length; i++) {
        const b = this.bloom[i];
        gl.bindFramebuffer(gl.FRAMEBUFFER, b.fb);
        gl.viewport(0, 0, b.w, b.h);
        this.bindTex(7, gl.TEXTURE_2D, srcTex);
        this.setU(prog, 'uTexel', '2f', 1 / sw, 1 / sh);
        this.setU(prog, 'uPrefilter', '1i', i === 0 ? 1 : 0);
        this.setU(prog, 'uThreshold', '1f', 1.1);
        this.drawFullscreen();
        srcTex = b.tex; sw = b.w; sh = b.h;
      }
      prog = this.progs.bloomUp;
      gl.useProgram(prog.program);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = this.bloom.length - 1; i > 0; i--) {
        const src = this.bloom[i], dst = this.bloom[i - 1];
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
        gl.viewport(0, 0, dst.w, dst.h);
        this.bindTex(7, gl.TEXTURE_2D, src.tex);
        this.setU(prog, 'uTexel', '2f', 1 / src.w, 1 / src.h);
        this.setU(prog, 'uRadius', '1f', 1.0);
        this.drawFullscreen();
      }
      gl.disable(gl.BLEND);
    }

    // --- composite / tonemap ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.ldrFB);
    gl.viewport(0, 0, W, H);
    prog = this.progs.composite;
    gl.useProgram(prog.program);
    this.bindTex(8, gl.TEXTURE_2D, this.colorA);
    this.bindTex(9, gl.TEXTURE_2D, bloomOn ? this.bloom[0].tex : this.raysTex);
    this.bindTex(10, gl.TEXTURE_2D, this.raysTex);
    this.setU(prog, 'uExposure', '1f', this.exposure * (S.brightness || 1));
    this.setU(prog, 'uBloomStrength', '1f', 0.09);
    this.setU(prog, 'uBloomOn', '1f', bloomOn ? 1 : 0);
    this.setU(prog, 'uRaysOn', '1f', raysOn ? 1 : 0);
    this.setU(prog, 'uUnderwater', '1f', p.underwater ? 1 : 0);
    this.setU(prog, 'uTime', '1f', A.time);
    this.setU(prog, 'uSaturation', '1f', 1.04 - 0.3 * (p.weather || 0));
    this.setU(prog, 'uWeather', '1f', p.weather || 0);
    this.setU(prog, 'uFlash', '1f', p.flash || 0);
    this.setU(prog, 'uRainFx', '1f', p.underwater ? 0 : (p.rainFx || 0));
    this.setU(prog, 'uAspect', '1f', W / H);
    this.drawFullscreen();

    // --- FXAA to screen ---
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    prog = this.progs.fxaa;
    gl.useProgram(prog.program);
    this.bindTex(7, gl.TEXTURE_2D, this.ldrTex);
    this.setU(prog, 'uInvRes', '2f', 1 / W, 1 / H);
    this.setU(prog, 'uEnabled', '1i', S.fxaa ? 1 : 0);
    this.drawFullscreen();
    gl.bindVertexArray(null);
  },
});
