'use strict';
// CPU mirror of the GPU single-scattering model; used for sun colour and ambient light.

const Atmos = (() => {
  const Re = 6360e3, Ra = 6420e3, Hr = 7994, Hm = 1200;
  const bR = [5.5e-6, 13.0e-6, 22.4e-6], bM = 21e-6;
  const ro = [0, Re + 300, 0];

  function raySphere(o, d, r) {
    const b = o[0] * d[0] + o[1] * d[1] + o[2] * d[2];
    const c = o[0] * o[0] + o[1] * o[1] + o[2] * o[2] - r * r;
    const disc = b * b - c;
    if (disc < 0) return null;
    const s = Math.sqrt(disc);
    return [-b - s, -b + s];
  }

  function transmittance(dir) {
    const g = raySphere(ro, dir, Re);
    if (g && g[0] > 0) return [0, 0, 0];
    const a = raySphere(ro, dir, Ra);
    if (!a) return [1, 1, 1];
    const N = 24, seg = a[1] / N;
    let odR = 0, odM = 0;
    for (let i = 0; i < N; i++) {
      const t = seg * (i + 0.5);
      const h = Math.hypot(ro[0] + dir[0] * t, ro[1] + dir[1] * t, ro[2] + dir[2] * t) - Re;
      odR += Math.exp(-h / Hr) * seg;
      odM += Math.exp(-h / Hm) * seg;
    }
    return bR.map((b) => Math.exp(-(b * odR + bM * 1.1 * odM)));
  }

  function scatter(rd, L, I) {
    const a = raySphere(ro, rd, Ra);
    if (!a) return [0, 0, 0];
    let tmax = a[1];
    const g = raySphere(ro, rd, Re);
    if (g && g[0] > 0) tmax = g[0];
    const N = 12, NL = 6, seg = tmax / N;
    let odR = 0, odM = 0;
    const sumR = [0, 0, 0], sumM = [0, 0, 0];
    const mu = rd[0] * L[0] + rd[1] * L[1] + rd[2] * L[2];
    const phR = 3 / (16 * Math.PI) * (1 + mu * mu);
    const gg = 0.76;
    const phM = 3 / (8 * Math.PI) * ((1 - gg * gg) * (1 + mu * mu)) / ((2 + gg * gg) * Math.pow(1 + gg * gg - 2 * gg * mu, 1.5));
    for (let i = 0; i < N; i++) {
      const t = seg * (i + 0.5);
      const p = [ro[0] + rd[0] * t, ro[1] + rd[1] * t, ro[2] + rd[2] * t];
      const h = Math.hypot(p[0], p[1], p[2]) - Re;
      const hr = Math.exp(-h / Hr) * seg, hm = Math.exp(-h / Hm) * seg;
      odR += hr; odM += hm;
      const l = raySphere(p, L, Ra);
      if (!l) continue;
      const segL = l[1] / NL;
      let odLR = 0, odLM = 0, lit = true;
      for (let j = 0; j < NL; j++) {
        const tl = segL * (j + 0.5);
        const hl = Math.hypot(p[0] + L[0] * tl, p[1] + L[1] * tl, p[2] + L[2] * tl) - Re;
        if (hl < 0) { lit = false; break; }
        odLR += Math.exp(-hl / Hr) * segL;
        odLM += Math.exp(-hl / Hm) * segL;
      }
      if (!lit) continue;
      for (let k = 0; k < 3; k++) {
        const att = Math.exp(-(bR[k] * (odR + odLR) + bM * 1.1 * (odM + odLM)));
        sumR[k] += att * hr;
        sumM[k] += att * hm;
      }
    }
    return [0, 1, 2].map((k) => I * (sumR[k] * bR[k] * phR + sumM[k] * bM * phM));
  }

  // Average sky radiance over the upper hemisphere (few directions) -> irradiance estimate.
  function skyIrradiance(sunDir, sunI, moonDir, moonI) {
    const dirs = [[0, 1, 0]];
    for (let i = 0; i < 6; i++) {
      const az = (i / 6) * Math.PI * 2, el = 0.45;
      dirs.push([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
    }
    for (let i = 0; i < 6; i++) {
      const az = (i / 6 + 1 / 12) * Math.PI * 2, el = 0.08;
      dirs.push([Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)]);
    }
    const acc = [0, 0, 0];
    for (const d of dirs) {
      if (sunI > 0) { const s = scatter(d, sunDir, sunI); for (let k = 0; k < 3; k++) acc[k] += s[k] * d[1]; }
      if (moonI > 0) { const s = scatter(d, moonDir, moonI); acc[0] += s[0] * 0.85 * d[1]; acc[1] += s[1] * 0.95 * d[1]; acc[2] += s[2] * 1.2 * d[1]; }
    }
    let wsum = 0;
    for (const d of dirs) wsum += d[1];
    // cosine-weighted mean radiance * PI = irradiance
    return acc.map((v) => (v / wsum) * Math.PI);
  }

  return { transmittance, scatter, skyIrradiance };
})();
