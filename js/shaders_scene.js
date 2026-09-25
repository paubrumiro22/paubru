'use strict';
// GLSL for the 3D scene: shared lighting/atmosphere code, terrain, shadows, water, sky.
// HDR_SCALE and quality defines are prepended by the renderer.

const GLSL_FRAG_HEAD = `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
#define PI 3.14159265359
`;

const GLSL_COMMON = `
uniform sampler2D uSkyLUT;
uniform highp sampler2DShadow uShadowMap;
uniform mat4 uShadowMat;
uniform float uShadowOn;
uniform float uShadowSize;
uniform float uShadowTexel;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uLightDir;
uniform vec3 uLightColor;
uniform vec3 uSunColor;
uniform vec3 uAmbUp;
uniform vec3 uAmbDown;
uniform vec3 uWaterFog;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uFogDensity;
uniform float uFar;
uniform float uUnderwater;
uniform float uSkyScale;
uniform float uNight;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }

vec3 skyLUT(vec3 dir) {
  float az = atan(dir.z, dir.x + 1e-7);
  float u = az / (2.0 * PI) + 0.5;
  float el = asin(clamp(dir.y, 0.035, 1.0));
  float v = sqrt(el / (0.5 * PI));
  return texture(uSkyLUT, vec2(u, v)).rgb / HDR_SCALE * uSkyScale;
}

vec3 fogColor(vec3 dir) {
  vec3 c = skyLUT(vec3(dir.x, max(dir.y, 0.0) * 0.5, dir.z));
  float s = max(dot(dir, uSunDir), 0.0);
  c += uSunColor * pow(s, 10.0) * 0.08;
  return c;
}

vec3 applyFog(vec3 col, vec3 rel) {
  float dist = length(rel);
  vec3 dir = rel / max(dist, 1e-4);
  if (uUnderwater > 0.5) {
    float f = 1.0 - exp(-dist * 0.075);
    vec3 absorb = exp(-vec3(0.30, 0.07, 0.05) * dist);
    return mix(col * absorb, uWaterFog, f);
  }
  float worldY = uCamPos.y + rel.y * 0.5;
  float heightF = exp(-max(worldY - 64.0, 0.0) * 0.018);
  float amt = 1.0 - exp(-dist * uFogDensity * (0.55 + 0.45 * heightF));
  float edge = smoothstep(uFar * 0.7, uFar * 0.98, dist);
  amt = max(amt, edge);
  return mix(col, fogColor(dir), amt);
}

const vec2 POISSON[12] = vec2[12](
  vec2(-0.326, -0.406), vec2(-0.840, -0.074), vec2(-0.696, 0.457), vec2(-0.203, 0.621),
  vec2(0.962, -0.195), vec2(0.473, -0.480), vec2(0.519, 0.767), vec2(0.185, -0.893),
  vec2(0.507, 0.064), vec2(0.896, 0.412), vec2(-0.322, -0.933), vec2(-0.792, -0.598));

float shadowFactor(vec3 rel, vec3 n) {
  if (uShadowOn < 0.5) return 1.0;
  vec3 p = rel + n * (uShadowTexel * 1.6 + 0.015);
  vec4 sc = uShadowMat * vec4(p, 1.0);
  vec3 c = sc.xyz;
  if (c.x <= 0.001 || c.x >= 0.999 || c.y <= 0.001 || c.y >= 0.999 || c.z >= 1.0 || c.z <= 0.0) return 1.0;
  float r = 1.4 / uShadowSize;
  float rot = ign(gl_FragCoord.xy) * 6.2831853;
  mat2 R = mat2(cos(rot), sin(rot), -sin(rot), cos(rot));
  float sum = 0.0;
  for (int i = 0; i < SHADOW_TAPS; i++) {
    sum += texture(uShadowMap, vec3(c.xy + R * POISSON[i] * r, c.z - 0.00025));
  }
  float s = sum / float(SHADOW_TAPS);
  vec2 e = abs(c.xy - 0.5) * 2.0;
  return mix(s, 1.0, smoothstep(0.82, 0.98, max(e.x, e.y)));
}
`;

const VS_TERRAIN = `#version 300 es
precision highp float;
precision highp int;
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec4 aData;
layout(location = 2) in vec4 aTint;
layout(location = 3) in vec4 aUV;
uniform mat4 uViewProj;
uniform vec3 uChunkOffset;
uniform vec3 uCamPos;
uniform float uTime;
uniform float uWind;
out vec3 vRel;
out vec3 vUV;
out vec3 vTint;
out float vAO;
out vec2 vLight;
flat out int vNormal;
flat out int vFlags;
void main() {
  int nf = int(aData.x + 0.5);
  int flags = nf >> 3;
  vec2 uv = aUV.xy / 16.0;
  vec3 rel = uChunkOffset + aPos.xyz / 64.0;
  vec3 world = rel + uCamPos;
  if ((flags & 1) != 0) {
    rel.x += sin(uTime * 1.6 + world.x * 0.8 + world.y * 0.6) * 0.035 * uWind;
    rel.y += sin(uTime * 2.3 + world.z * 0.9 + world.x * 0.3) * 0.02 * uWind;
    rel.z += cos(uTime * 1.4 + world.z * 0.7 + world.y * 0.5) * 0.035 * uWind;
  }
  if ((flags & 2) != 0 && uv.y < 0.5) {
    float s = sin(uTime * 2.1 + world.x * 0.6 + world.z * 0.4) * 0.09 + sin(uTime * 3.7 + world.x * 1.7 + world.z) * 0.03;
    rel.x += s * uWind;
    rel.z += s * 0.6 * uWind;
  }
  vRel = rel;
  vUV = vec3(uv, aPos.w);
  vTint = aTint.rgb / 200.0;
  vAO = aData.y / 3.0;
  vLight = aData.zw / 255.0;
  vNormal = nf & 7;
  vFlags = flags;
  gl_Position = uViewProj * vec4(rel, 1.0);
}
`;

const GLSL_FACE_BASIS = `
const vec3 NRM[7] = vec3[7](vec3(1,0,0), vec3(-1,0,0), vec3(0,1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,1,0));
const vec3 TAN[7] = vec3[7](vec3(0,0,-1), vec3(0,0,1), vec3(1,0,0), vec3(1,0,0), vec3(1,0,0), vec3(-1,0,0), vec3(1,0,0));
const vec3 BIT[7] = vec3[7](vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1), vec3(0,0,-1), vec3(0,-1,0), vec3(0,-1,0), vec3(0,0,1));
`;

const FS_TERRAIN = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
${GLSL_COMMON}
${GLSL_FACE_BASIS}
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uNormalMap;
uniform sampler2DArray uEmitMap;
uniform sampler2D uNoise;
uniform int uCutout;
in vec3 vRel;
in vec3 vUV;
in vec3 vTint;
in float vAO;
in vec2 vLight;
flat in int vNormal;
flat in int vFlags;
layout(location = 0) out vec4 outColor;

void main() {
  bool lava = (vFlags & 16) != 0;
  vec3 world = vRel + uCamPos;
  if (lava) {
    // slow churning flow: scrolled, gently distorted texture plus a hot/cool pulse
    vec2 wob = vec2(sin(world.z * 0.9 + uTime * 0.5), cos(world.x * 0.8 + uTime * 0.4)) * 0.06;
    vec2 luv = fract(vUV.xy + vec2(uTime * 0.013, uTime * 0.008) + wob);
    vec4 la = textureGrad(uAlbedo, vec3(luv, vUV.z), dFdx(vUV.xy), dFdy(vUV.xy));
    float pulse = texture(uNoise, world.xz * 0.06 + uTime * vec2(0.007, 0.004)).r;
    vec3 c = la.rgb * (2.2 + 1.6 * pulse);
    c = applyFog(c, vRel);
    outColor = vec4(c * HDR_SCALE, 1.0);
    return;
  }
  vec4 alb = texture(uAlbedo, vUV);
  if (uCutout == 1 && alb.a < 0.5) discard;
  vec3 albedo = alb.rgb * vTint;
  bool plant = vNormal == 6;
  vec3 N0 = NRM[vNormal];
  if (!gl_FrontFacing && !plant) N0 = -N0;
  vec4 nm = texture(uNormalMap, vUV);
  vec3 N = N0;
  if (!plant) {
    vec3 tn = nm.xyz * 2.0 - 1.0;
    N = normalize(TAN[vNormal] * tn.x + BIT[vNormal] * tn.y + N0 * tn.z);
  }
  float smoothness = nm.a;
  float sky = vLight.x;
  float blk = vLight.y;
  bool translucent = (vFlags & 8) != 0;

  vec3 V = normalize(-vRel);
  vec3 L = uLightDir;
  float NdL = dot(N, L);
  float gNdL = dot(N0, L);
  float gate = smoothstep(0.05, 0.6, sky);
  float shadow = 0.0;
  if (gNdL > 0.0 || translucent) shadow = shadowFactor(vRel, plant ? vec3(0.0, 1.0, 0.0) : N0);

  float diff = max(NdL, 0.0);
  if (translucent) diff = diff * 0.7 + max(-NdL, 0.0) * 0.3 + 0.08;
  else if (gNdL <= 0.0) diff = 0.0;
  vec3 direct = uLightColor * diff * shadow * gate;

  float ao = 0.32 + 0.68 * vAO;
  if (plant) ao *= mix(1.0, 0.55, vUV.y);
  vec3 amb = mix(uAmbDown, uAmbUp, N.y * 0.5 + 0.5) * (sky * sky) + vec3(0.010, 0.012, 0.018);
  float flicker = 1.0 + 0.05 * sin(uTime * 7.3 + world.x * 1.3) * sin(uTime * 5.1 + world.z * 1.7);
  vec3 torch = vec3(1.0, 0.66, 0.36) * pow(blk, 2.2) * 2.6 * flicker;
  vec3 col = albedo * (direct + (amb + torch) * ao);

  // GGX specular
  if (gNdL > 0.0 && NdL > 0.0) {
    float rough = clamp(1.0 - smoothness, 0.08, 1.0);
    float a = rough * rough;
    vec3 H = normalize(L + V);
    float NdH = max(dot(N, H), 0.0);
    float NdV = max(dot(N, V), 1e-3);
    float dd = NdH * NdH * (a * a - 1.0) + 1.0;
    float D = a * a / (PI * dd * dd);
    float F = 0.04 + 0.96 * pow(1.0 - max(dot(H, V), 0.0), 5.0);
    float k = a * 0.5;
    float G = (NdL / (NdL * (1.0 - k) + k)) * (NdV / (NdV * (1.0 - k) + k));
    float spec = D * F * G / (4.0 * NdL * NdV + 1e-4);
    col += uLightColor * min(spec, 30.0) * NdL * shadow * gate;
  }

  if (translucent) {
    float sss = pow(max(dot(-V, L), 0.0), 6.0);
    col += albedo * uLightColor * sss * shadow * gate * 0.8;
  }
  if ((vFlags & 4) != 0) {
    float e = texture(uEmitMap, vUV).r;
    col = mix(col, albedo * 3.0 * flicker + col * 0.25, e);
  }

  col = applyFog(col, vRel);
  outColor = vec4(col * HDR_SCALE, 1.0);
}
`;

// Mobs, dropped items, particles, block cracks and the first-person hand. Vertices arrive
// camera-relative and already transformed; uPass: 0 alpha-tested, 1 blended, 2 crack overlay.
const VS_ENTITY = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aUV;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in vec3 aLight;
layout(location = 4) in vec4 aColor;
uniform mat4 uViewProj;
out vec3 vRel;
out vec3 vUV;
out vec3 vN;
out vec3 vLight;
out vec4 vColor;
void main() {
  vRel = aPos; vUV = aUV; vN = aNormal; vLight = aLight; vColor = aColor;
  gl_Position = uViewProj * vec4(aPos, 1.0);
}
`;

const FS_ENTITY = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
${GLSL_COMMON}
uniform sampler2DArray uAlbedo;
uniform sampler2DArray uEmitMap;
uniform sampler2D uAtlas;
uniform int uPass;
uniform float uCrack;
in vec3 vRel;
in vec3 vUV;
in vec3 vN;
in vec3 vLight;
in vec4 vColor;
layout(location = 0) out vec4 outColor;

void main() {
  vec4 alb = vUV.z < -0.5 ? texture(uAtlas, vUV.xy) : texture(uAlbedo, vUV);
  if (uPass == 2) {
    if (alb.a < 0.02 || alb.a > uCrack) discard;
    alb.a = 1.0;
  } else if (uPass == 0 && alb.a < 0.5) discard;
  vec3 albedo = alb.rgb * vColor.rgb;
  vec3 N = normalize(vN);
  if (!gl_FrontFacing) N = -N;
  float sky = vLight.x, blk = vLight.y;
  float gate = smoothstep(0.05, 0.6, sky);
  float NdL = dot(N, uLightDir);
  float shadow = NdL > 0.0 ? shadowFactor(vRel, N) : 0.0;
  vec3 direct = uLightColor * max(NdL, 0.0) * shadow * gate;
  vec3 amb = mix(uAmbDown, uAmbUp, N.y * 0.5 + 0.5) * (sky * sky) + vec3(0.012, 0.014, 0.02);
  vec3 torch = vec3(1.0, 0.66, 0.36) * pow(blk, 2.2) * 2.6;
  vec3 light = direct + amb + torch;
  vec3 col = albedo * light;
  if (vUV.z > -0.5) col += albedo * 3.0 * texture(uEmitMap, vUV).r;
  float ov = vColor.a;
  if (ov > 0.0) col = mix(col, vec3(0.9, 0.06, 0.04) * (0.15 + dot(light, vec3(0.33))), ov * 0.55);
  else if (ov < 0.0) col = mix(col, vec3(2.2), -ov);
  col = applyFog(col, vRel);
  outColor = vec4(col * HDR_SCALE, uPass == 1 ? alb.a * vLight.z : 1.0);
}
`;

const FS_ENTITY_SHADOW = () => `#version 300 es
${GLSL_FRAG_HEAD}
uniform sampler2DArray uAlbedo;
uniform sampler2D uAtlas;
in vec3 vUV;
void main() {
  vec4 a = vUV.z < -0.5 ? texture(uAtlas, vUV.xy) : texture(uAlbedo, vUV);
  if (a.a < 0.5) discard;
}
`;

const FS_SHADOW = () => `#version 300 es
${GLSL_FRAG_HEAD}
uniform sampler2DArray uAlbedo;
uniform int uCutout;
in vec3 vUV;
void main() {
  if (uCutout == 1 && texture(uAlbedo, vUV).a < 0.5) discard;
}
`;

// Volumetric cloud layer, shared by sky and water reflections.
const GLSL_CLOUDS = `
uniform sampler2D uNoise;
uniform float uCloudCover;
uniform float uCloudTime;
const float CB = 172.0;
const float CT = 222.0;

float cloudDensity(vec3 p) {
  vec2 uv = (p.xz + vec2(uCloudTime * 5.0, uCloudTime * 1.5)) * 0.0011;
  float n = texture(uNoise, uv).r * 0.56 + texture(uNoise, uv * 2.9 + 0.31).g * 0.29 + texture(uNoise, uv * 7.1 + 0.73).b * 0.15;
  float hf = clamp((p.y - CB) / (CT - CB), 0.0, 1.0);
  float th = 1.0 - uCloudCover;
  float d = (n - th - hf * hf * 0.22) * 5.0;
  return clamp(d, 0.0, 1.0) * smoothstep(0.0, 0.12, hf);
}

float hgPhase(float mu, float g) {
  float g2 = g * g;
  return (1.0 - g2) / (4.0 * PI * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-4), 1.5));
}

vec4 renderClouds(vec3 rd, int steps, int lightSteps) {
  vec3 ro = uCamPos;
  float t0, t1;
  if (ro.y < CB) {
    if (rd.y < 0.015) return vec4(0.0, 0.0, 0.0, 1.0);
    t0 = (CB - ro.y) / rd.y; t1 = (CT - ro.y) / rd.y;
  } else if (ro.y > CT) {
    if (rd.y > -0.015) return vec4(0.0, 0.0, 0.0, 1.0);
    t0 = (CT - ro.y) / rd.y; t1 = (CB - ro.y) / rd.y;
  } else {
    t0 = 0.0;
    t1 = rd.y > 0.01 ? (CT - ro.y) / rd.y : (rd.y < -0.01 ? (CB - ro.y) / rd.y : 500.0);
  }
  if (t0 > 7000.0) return vec4(0.0, 0.0, 0.0, 1.0);
  t1 = min(t1, t0 + 450.0);
  float dt = (t1 - t0) / float(steps);
  float jitter = ign(gl_FragCoord.xy);
  float mu = dot(rd, uLightDir);
  float phase = mix(hgPhase(mu, 0.65), hgPhase(mu, -0.15), 0.35) * 4.0 * PI;
  float T = 1.0;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < steps; i++) {
    vec3 p = ro + rd * (t0 + dt * (float(i) + jitter));
    float d = cloudDensity(p);
    if (d > 0.005) {
      float dl = 0.0;
      for (int j = 1; j <= lightSteps; j++) dl += cloudDensity(p + uLightDir * (float(j) * 11.0));
      float beer = exp(-dl * 1.4) * 0.8 + exp(-dl * 0.35) * 0.2;
      float powder = 1.0 - exp(-d * 5.0);
      float hf = clamp((p.y - CB) / (CT - CB), 0.0, 1.0);
      vec3 lum = uLightColor * beer * phase * mix(0.5, 1.0, powder) * 1.1 + uAmbUp * (0.28 + 0.72 * hf) * 1.1;
      float Ts = exp(-d * dt * 0.075);
      acc += T * lum * (1.0 - Ts);
      T *= Ts;
      if (T < 0.02) break;
    }
  }
  float fade = exp(-t0 * 0.00032) * smoothstep(0.015, 0.1, abs(rd.y));
  vec3 haze = skyLUT(rd) * (1.0 - T);
  acc = mix(haze, acc, exp(-t0 * 0.00018));
  return vec4(acc * fade, mix(1.0, T, fade));
}
`;

const VS_FULLSCREEN = `#version 300 es
layout(location = 0) in vec2 aPos;
out vec2 vUV;
out vec2 vNdc;
void main() {
  vUV = aPos * 0.5 + 0.5;
  vNdc = aPos;
  gl_Position = vec4(aPos, 1.0, 1.0);
}
`;

const FS_SKY = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
${GLSL_COMMON}
${GLSL_CLOUDS}
uniform mat4 uInvViewProj;
uniform int uCloudSteps;
in vec2 vNdc;
layout(location = 0) out vec4 outColor;

vec3 stars(vec3 dir) {
  vec3 p = dir * 190.0;
  vec3 cell = floor(p);
  float h = hash13(cell);
  if (h < 0.982) return vec3(0.0);
  vec3 center = cell + 0.5 + (vec3(hash13(cell + 1.3), hash13(cell + 2.7), hash13(cell + 5.1)) - 0.5) * 0.5;
  float d = length(p - center);
  float b = smoothstep(0.32, 0.0, d) * (h - 0.982) / 0.018;
  float tw = 0.65 + 0.35 * sin(uTime * (2.0 + h * 3.0) + h * 91.0);
  vec3 tint = mix(vec3(0.75, 0.82, 1.0), vec3(1.0, 0.9, 0.75), hash13(cell + 9.1));
  return tint * b * tw * 3.0;
}

void main() {
  vec4 p = uInvViewProj * vec4(vNdc, 1.0, 1.0);
  vec3 dir = normalize(p.xyz / p.w);
  vec3 col = mix(fogColor(dir), skyLUT(dir), smoothstep(-0.01, 0.07, dir.y));

  // sun disk with limb darkening
  float cs = dot(dir, uSunDir);
  float sunR = 0.99965;
  if (cs > sunR - 0.0002) {
    float x = clamp((cs - sunR) / (1.0 - sunR), 0.0, 1.0);
    float limb = pow(x, 0.35);
    col += uSunColor * smoothstep(sunR - 0.0002, sunR + 0.00005, cs) * (0.55 + 0.45 * limb) * 45.0;
  }
  // moon disk
  float cm = dot(dir, uMoonDir);
  float moonR = 0.99975;
  if (cm > moonR - 0.0002) {
    vec3 mp = dir - uMoonDir * cm;
    float crater = hash13(floor(mp * 3000.0)) * 0.15;
    col += vec3(0.85, 0.88, 0.95) * smoothstep(moonR - 0.0002, moonR + 0.00005, cm) * (1.4 - crater) * smoothstep(-0.1, 0.1, uMoonDir.y);
  }
  col += vec3(0.5, 0.6, 0.8) * pow(max(cm, 0.0), 300.0) * 0.12 * uNight;

  col += stars(dir) * uNight * smoothstep(-0.02, 0.25, dir.y);

  if (uCloudSteps > 0) {
    vec4 cl = renderClouds(dir, uCloudSteps, 2);
    col = col * cl.a + cl.rgb;
  }
  if (uUnderwater > 0.5) col = uWaterFog;
  outColor = vec4(col * HDR_SCALE, 1.0);
}
`;

// Single-scattering atmosphere rendered into a small sky-view lookup texture.
const FS_SKY_LUT = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform float uSunI;
uniform float uMoonI;
uniform vec2 uLUTSize;
layout(location = 0) out vec4 outColor;

const float Re = 6360e3;
const float Ra = 6420e3;
const float Hr = 7994.0;
const float Hm = 1200.0;
const vec3 bR = vec3(5.5e-6, 13.0e-6, 22.4e-6);
const float bM = 21e-6;

bool raySphere(vec3 ro, vec3 rd, float r, out float t0, out float t1) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float disc = b * b - c;
  t0 = 0.0; t1 = 0.0;
  if (disc < 0.0) return false;
  float s = sqrt(disc);
  t0 = -b - s; t1 = -b + s;
  return true;
}

vec3 scatter(vec3 rd, vec3 L, float I) {
  vec3 ro = vec3(0.0, Re + 300.0, 0.0);
  float t0, t1;
  raySphere(ro, rd, Ra, t0, t1);
  float tmax = t1;
  float g0, g1;
  if (raySphere(ro, rd, Re, g0, g1) && g0 > 0.0) tmax = g0;
  const int N = 16;
  const int NL = 6;
  float seg = tmax / float(N);
  float odR = 0.0, odM = 0.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float mu = dot(rd, L);
  float phR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float g = 0.76;
  float phM = 3.0 / (8.0 * PI) * ((1.0 - g * g) * (1.0 + mu * mu)) / ((2.0 + g * g) * pow(1.0 + g * g - 2.0 * g * mu, 1.5));
  for (int i = 0; i < N; i++) {
    vec3 p = ro + rd * (seg * (float(i) + 0.5));
    float h = length(p) - Re;
    float hr = exp(-h / Hr) * seg;
    float hm = exp(-h / Hm) * seg;
    odR += hr; odM += hm;
    float l0, l1;
    raySphere(p, L, Ra, l0, l1);
    float segL = l1 / float(NL);
    float odLR = 0.0, odLM = 0.0;
    bool lit = true;
    for (int j = 0; j < NL; j++) {
      vec3 q = p + L * (segL * (float(j) + 0.5));
      float hl = length(q) - Re;
      if (hl < 0.0) { lit = false; break; }
      odLR += exp(-hl / Hr) * segL;
      odLM += exp(-hl / Hm) * segL;
    }
    if (lit) {
      vec3 tau = bR * (odR + odLR) + bM * 1.1 * (odM + odLM);
      vec3 att = exp(-tau);
      sumR += att * hr;
      sumM += att * hm;
    }
  }
  return I * (sumR * bR * phR + sumM * bM * phM);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uLUTSize;
  float az = (uv.x - 0.5) * 2.0 * PI;
  float el = uv.y * uv.y * 0.5 * PI;
  vec3 rd = vec3(cos(el) * cos(az), sin(el), cos(el) * sin(az));
  vec3 c = vec3(0.0);
  if (uSunI > 0.0) c += scatter(rd, uSunDir, uSunI);
  if (uMoonI > 0.0) c += scatter(rd, uMoonDir, uMoonI) * vec3(0.85, 0.95, 1.2);
  outColor = vec4(c * HDR_SCALE, 1.0);
}
`;

const FS_WATER = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
${GLSL_COMMON}
${GLSL_FACE_BASIS}
${GLSL_CLOUDS}
uniform sampler2D uSceneColor;
uniform sampler2D uSceneDepth;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uResolution;
uniform float uNear;
uniform float uZFar;
uniform int uSSR;
in vec3 vRel;
in vec3 vUV;
in vec3 vTint;
in float vAO;
in vec2 vLight;
flat in int vNormal;
flat in int vFlags;
layout(location = 0) out vec4 outColor;

float linDepth(float d) {
  float z = d * 2.0 - 1.0;
  return 2.0 * uNear * uZFar / (uZFar + uNear - z * (uZFar - uNear));
}

float wHeight(vec2 p) {
  float t = uTime;
  return texture(uNoise, p * 0.045 + vec2(t * 0.012, t * 0.007)).r * 0.5
       + texture(uNoise, p * 0.093 + vec2(-t * 0.017, t * 0.013)).g * 0.3
       + texture(uNoise, p * 0.21 + vec2(t * 0.021, -t * 0.026)).b * 0.2;
}

vec3 waterNormal(vec3 world, vec3 N0, float dist) {
  if (abs(N0.y) < 0.5) return N0;
  float e = 0.06;
  float h = wHeight(world.xz);
  float hx = wHeight(world.xz + vec2(e, 0.0));
  float hz = wHeight(world.xz + vec2(0.0, e));
  float s = 0.55 * mix(1.0, 0.25, clamp(dist / 140.0, 0.0, 1.0));
  vec3 n = normalize(vec3(-(hx - h) / e * s, 1.0, -(hz - h) / e * s));
  return N0.y > 0.0 ? n : vec3(n.x, -n.y, n.z);
}

vec4 traceSSR(vec3 relPos, vec3 R) {
  vec3 vp = (uView * vec4(relPos, 1.0)).xyz;
  vec3 vr = normalize((uView * vec4(R, 0.0)).xyz);
  float stepLen = 0.35;
  float t = stepLen * ign(gl_FragCoord.xy);
  for (int i = 0; i < 40; i++) {
    stepLen *= 1.13;
    t += stepLen;
    vec3 p = vp + vr * t;
    if (-p.z < uNear) break;
    vec4 clip = uProj * vec4(p, 1.0);
    vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
    float sd = texture(uSceneDepth, uv).r;
    if (sd >= 1.0) continue;
    float diff = -p.z - linDepth(sd);
    if (diff > 0.0 && diff < max(stepLen * 1.6, 0.5)) {
      float lo = t - stepLen, hi = t;
      for (int j = 0; j < 6; j++) {
        float mid = (lo + hi) * 0.5;
        vec3 q = vp + vr * mid;
        vec4 c2 = uProj * vec4(q, 1.0);
        vec2 u2 = c2.xy / c2.w * 0.5 + 0.5;
        if (-q.z > linDepth(texture(uSceneDepth, u2).r)) hi = mid; else lo = mid;
      }
      vec3 q = vp + vr * hi;
      vec4 c3 = uProj * vec4(q, 1.0);
      vec2 huv = c3.xy / c3.w * 0.5 + 0.5;
      vec2 ef = smoothstep(vec2(0.0), vec2(0.07), huv) * smoothstep(vec2(1.0), vec2(0.93), huv);
      float fade = ef.x * ef.y * (1.0 - float(i) / 40.0);
      return vec4(texture(uSceneColor, huv).rgb / HDR_SCALE, fade);
    }
  }
  return vec4(0.0);
}

void main() {
  vec3 world = vRel + uCamPos;
  float dist = length(vRel);
  vec3 V = -vRel / max(dist, 1e-4);
  vec3 N0 = NRM[vNormal];
  bool front = gl_FrontFacing;
  if (!front) N0 = -N0;
  vec3 N = waterNormal(world, N0, dist);
  vec2 suv = gl_FragCoord.xy / uResolution;
  float fragLin = linDepth(gl_FragCoord.z);
  float sky = vLight.x;
  float gate = smoothstep(0.05, 0.6, sky);

  if (!front) {
    // looking up at the surface from below: Snell's window + total internal reflection
    float cosI = max(dot(N, V), 0.0);
    float tir = 1.0 - smoothstep(0.58, 0.7, cosI);
    vec3 above = texture(uSceneColor, clamp(suv + N.xz * 0.04, 0.001, 0.999)).rgb / HDR_SCALE;
    vec3 col = mix(above, uWaterFog * 0.8, tir);
    col = applyFog(col, vRel);
    outColor = vec4(col * HDR_SCALE, 1.0);
    return;
  }

  float sceneD = texture(uSceneDepth, suv).r;
  float thick = max(linDepth(sceneD) - fragLin, 0.0);
  vec2 ruv = clamp(suv + (N.xz - N0.xz * 0.0) * 0.05 * clamp(thick * 0.3, 0.0, 1.0) * (abs(N0.y) > 0.5 ? 1.0 : 0.0), 0.001, 0.999);
  float rd = texture(uSceneDepth, ruv).r;
  if (linDepth(rd) < fragLin) { ruv = suv; rd = sceneD; }
  vec3 refr = texture(uSceneColor, ruv).rgb / HDR_SCALE;
  float rthick = rd >= 1.0 ? 80.0 : max(linDepth(rd) - fragLin, 0.0);
  vec3 trans = exp(-vec3(0.33, 0.082, 0.058) * rthick);
  vec3 scatterCol = vec3(0.014, 0.075, 0.09) * (uAmbUp * sky * sky * 1.6 + uLightColor * 0.22 * gate) + vec3(0.001, 0.003, 0.004);
  vec3 under = refr * trans + scatterCol * (1.0 - trans);

  vec3 R = reflect(-V, N);
  R.y = max(R.y, 0.005);
  R = normalize(R);
  vec3 skyR = skyLUT(R);
  if (CLOUD_REFLECT == 1) {
    vec4 cl = renderClouds(R, 8, 1);
    skyR = skyR * cl.a + cl.rgb;
  }
  skyR *= smoothstep(0.15, 0.85, sky);
  vec3 refl = skyR;
  if (uSSR == 1) {
    vec4 s = traceSSR(vRel, R);
    refl = mix(skyR, s.rgb, s.a);
  }
  float F = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
  vec3 col = mix(under, refl, F);

  float shadow = shadowFactor(vRel, vec3(0.0, 1.0, 0.0));
  vec3 H = normalize(uLightDir + V);
  float nh = max(dot(N, H), 0.0);
  float spec = pow(nh, 1400.0) * 90.0 + pow(nh, 160.0) * 1.2;
  col += uLightColor * spec * shadow * gate * step(0.0, uLightDir.y);

  col = applyFog(col, vRel);
  outColor = vec4(col * HDR_SCALE, 1.0);
}
`;

const VS_LINES = `#version 300 es
layout(location = 0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uOffset;
uniform vec3 uBoxMin;
uniform vec3 uBoxSize;
void main() { gl_Position = uViewProj * vec4(uBoxMin + aPos * uBoxSize + uOffset, 1.0); }
`;

const FS_LINES = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
uniform vec4 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor.rgb * HDR_SCALE, uColor.a); }
`;
