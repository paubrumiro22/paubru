'use strict';
// Post-processing GLSL: bloom chain, screen-space god rays, tonemapping/grade, FXAA.

const FS_BLOOM_DOWN = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform int uPrefilter;
uniform float uThreshold;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
vec3 tap(vec2 o) { return texture(uSrc, vUV + o * uTexel).rgb; }
void main() {
  vec3 a = tap(vec2(-2.0, -2.0)), b = tap(vec2(0.0, -2.0)), c = tap(vec2(2.0, -2.0));
  vec3 d = tap(vec2(-1.0, -1.0)), e = tap(vec2(1.0, -1.0));
  vec3 f = tap(vec2(-2.0, 0.0)), g = tap(vec2(0.0, 0.0)), h = tap(vec2(2.0, 0.0));
  vec3 i = tap(vec2(-1.0, 1.0)), j = tap(vec2(1.0, 1.0));
  vec3 k = tap(vec2(-2.0, 2.0)), l = tap(vec2(0.0, 2.0)), m = tap(vec2(2.0, 2.0));
  vec3 col = (d + e + i + j) * 0.125 + (a + b + f + g) * 0.03125 + (b + c + g + h) * 0.03125
           + (f + g + k + l) * 0.03125 + (g + h + l + m) * 0.03125;
  if (uPrefilter == 1) {
    col /= HDR_SCALE;
    col = min(col, vec3(40.0));
    float br = max(col.r, max(col.g, col.b));
    float knee = uThreshold * 0.5;
    float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
    soft = soft * soft / (4.0 * knee + 1e-4);
    float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
    col *= contrib * HDR_SCALE;
  }
  outColor = vec4(col, 1.0);
}
`;

const FS_BLOOM_UP = () => `#version 300 es
${GLSL_FRAG_HEAD}
uniform sampler2D uSrc;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
void main() {
  vec4 d = uTexel.xyxy * vec4(1.0, 1.0, -1.0, 0.0) * uRadius;
  vec3 s = texture(uSrc, vUV - d.xy).rgb;
  s += texture(uSrc, vUV - d.wy).rgb * 2.0;
  s += texture(uSrc, vUV - d.zy).rgb;
  s += texture(uSrc, vUV + d.zw).rgb * 2.0;
  s += texture(uSrc, vUV).rgb * 4.0;
  s += texture(uSrc, vUV + d.xw).rgb * 2.0;
  s += texture(uSrc, vUV + d.zy).rgb;
  s += texture(uSrc, vUV + d.wy).rgb * 2.0;
  s += texture(uSrc, vUV + d.xy).rgb;
  outColor = vec4(s / 16.0, 1.0);
}
`;

const FS_GODRAYS = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
uniform sampler2D uDepth;
uniform sampler2D uScene;
uniform vec2 uSunScreen;
uniform vec3 uRayColor;
uniform float uIntensity;
uniform float uAspect;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
void main() {
  const int N = 56;
  vec2 delta = (vUV - uSunScreen) / float(N) * 0.95;
  vec2 p = vUV - delta * ign(gl_FragCoord.xy);
  float decay = 1.0, illum = 0.0;
  for (int i = 0; i < N; i++) {
    p -= delta;
    if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) { decay *= 0.965; continue; }
    float d = texture(uDepth, p).r;
    if (d >= 0.99999) {
      vec3 c = texture(uScene, p).rgb / HDR_SCALE;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec2 q = (p - uSunScreen) * vec2(uAspect, 1.0);
      float fall = exp(-dot(q, q) * 9.0);
      illum += min(l, 6.0) * fall * decay;
    }
    decay *= 0.965;
  }
  illum /= float(N);
  outColor = vec4(uRayColor * illum * uIntensity * HDR_SCALE, 1.0);
}
`;

const FS_COMPOSITE = () => `#version 300 es
${GLSL_FRAG_HEAD}
${GLSL_DEFINES}
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform sampler2D uRays;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uBloomOn;
uniform float uRaysOn;
uniform float uUnderwater;
uniform float uTime;
uniform float uSaturation;
uniform float uWeather;
uniform float uFlash;
in vec2 vUV;
layout(location = 0) out vec4 outColor;

vec3 acesFitted(vec3 v) {
  const mat3 inM = mat3(0.59719, 0.07600, 0.02840, 0.35458, 0.90834, 0.13383, 0.04823, 0.01566, 0.83777);
  const mat3 outM = mat3(1.60475, -0.10208, -0.00327, -0.53108, 1.10813, -0.07276, -0.07367, -0.00605, 1.07602);
  v = inM * v;
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return clamp(outM * (a / b), 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
void main() {
  vec2 uv = vUV;
  if (uUnderwater > 0.5) {
    uv += vec2(sin(uv.y * 26.0 + uTime * 2.1), cos(uv.x * 21.0 + uTime * 1.7)) * 0.0022;
    uv = clamp(uv, 0.001, 0.999);
  }
  vec3 c = texture(uScene, uv).rgb / HDR_SCALE;
  if (uBloomOn > 0.5) c += texture(uBloom, uv).rgb / HDR_SCALE * uBloomStrength;
  if (uRaysOn > 0.5) c += texture(uRays, uv).rgb / HDR_SCALE;
  c *= uExposure * (1.0 + 5.0 * uFlash);
  c += vec3(0.55, 0.6, 0.8) * uFlash;
  c = acesFitted(c);
  // rain and storms tint the picture towards a cool grey
  float lw = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(c, vec3(lw) * vec3(0.92, 0.97, 1.06), 0.35 * uWeather);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = max(mix(vec3(l), c, uSaturation), 0.0);
  c = toSRGB(c);
  vec2 q = vUV - 0.5;
  c *= 1.0 - dot(q, q) * 0.42;
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}
`;

const FS_FXAA = () => `#version 300 es
${GLSL_FRAG_HEAD}
uniform sampler2D uSrc;
uniform vec2 uInvRes;
uniform int uEnabled;
in vec2 vUV;
layout(location = 0) out vec4 outColor;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec2 uv = gl_FragCoord.xy * uInvRes;
  vec3 rgbM = texture(uSrc, uv).rgb;
  if (uEnabled == 0) { outColor = vec4(rgbM, 1.0); return; }
  vec3 rgbNW = texture(uSrc, uv + vec2(-1.0, -1.0) * uInvRes).rgb;
  vec3 rgbNE = texture(uSrc, uv + vec2(1.0, -1.0) * uInvRes).rgb;
  vec3 rgbSW = texture(uSrc, uv + vec2(-1.0, 1.0) * uInvRes).rgb;
  vec3 rgbSE = texture(uSrc, uv + vec2(1.0, 1.0) * uInvRes).rgb;
  float lNW = luma(rgbNW), lNE = luma(rgbNE), lSW = luma(rgbSW), lSE = luma(rgbSE), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));
  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), ((lNW + lSW) - (lNE + lSE)));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 1.0 / 128.0);
  float rcpMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + reduce);
  dir = clamp(dir * rcpMin, vec2(-8.0), vec2(8.0)) * uInvRes;
  vec3 a = 0.5 * (texture(uSrc, uv + dir * (1.0 / 3.0 - 0.5)).rgb + texture(uSrc, uv + dir * (2.0 / 3.0 - 0.5)).rgb);
  vec3 b = a * 0.5 + 0.25 * (texture(uSrc, uv + dir * -0.5).rgb + texture(uSrc, uv + dir * 0.5).rgb);
  float lB = luma(b);
  outColor = vec4((lB < lMin || lB > lMax) ? a : b, 1.0);
}
`;
