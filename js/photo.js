'use strict';
// Photo mode (P): the HUD goes away, you freeze and the camera floats free (WASD, Space /
// Shift up and down, the mouse looks, the wheel zooms), 1-8 choose a filter, ← → move the sun,
// G shows a rule-of-thirds grid, H hides the bar and C (or Enter) takes the picture: a PNG with
// the filter, vignette, grain and letterbox baked in, saved to your downloads.

const PHOTO_FILTERS = [
  { k: 'none', name: 'Natural', css: 'none' },
  { k: 'cine', name: 'Cinematic', css: 'contrast(1.12) saturate(1.15) sepia(0.12) hue-rotate(-8deg)', bars: true, vig: 0.35, tint: ['rgba(0,90,110,0.10)', 'soft-light'] },
  { k: 'vivid', name: 'Vivid', css: 'saturate(1.6) contrast(1.1)', vig: 0.15 },
  { k: 'dream', name: 'Dreamy', css: 'brightness(1.08) saturate(1.2) contrast(0.9) blur(0.6px)', vig: 0.2, tint: ['rgba(255,170,200,0.18)', 'screen'] },
  { k: 'cold', name: 'Winter', css: 'saturate(0.85) hue-rotate(10deg) brightness(1.03)', vig: 0.25, tint: ['rgba(90,150,255,0.18)', 'soft-light'] },
  { k: 'vintage', name: 'Vintage', css: 'sepia(0.35) saturate(0.8) contrast(0.92) hue-rotate(-12deg)', vig: 0.45, grain: 0.10, tint: ['rgba(255,236,200,0.16)', 'lighten'] },
  { k: 'sepia', name: 'Sepia', css: 'sepia(0.85) contrast(1.05) brightness(1.03)', vig: 0.5, grain: 0.12 },
  { k: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.35) brightness(0.95)', vig: 0.6, grain: 0.08 },
];

const Photo = {
  on: false, filter: 0, fov: 70, grid: false, bare: false, wantShot: false,
  cam: null, vel: [0, 0, 0], saved: null,

  toggle() { if (this.on) this.close(); else this.open(); },
  open() {
    if (this.on || !G.playing || G.stats.dead || G.vehicle || G.onTitle) return;
    this.on = true;
    const p = G.player;
    const e = p.eyePos();
    this.cam = [e[0], e[1], e[2]];
    this.vel = [0, 0, 0];
    this.fov = G.settings.fov;
    this.saved = { hud: G.hudHidden, day: G.settings.dayCycle, time: G.dayTime };
    G.hudHidden = true;
    $('hud').classList.add('hidden');
    this.buildBar();
    $('photoUI').classList.remove('hidden');
    this.apply();
    sfx('click', null, 0.8, 1.3);
  },
  close() {
    if (!this.on) return;
    this.on = false;
    G.hudHidden = this.saved.hud;
    $('hud').classList.toggle('hidden', G.hudHidden);
    G.settings.dayCycle = this.saved.day;
    $('photoUI').classList.add('hidden');
    G.canvas.style.filter = '';
    sfx('click', null, 0.8, 1);
  },

  // how far the camera has floated from your eyes (the avatar shows once it has)
  away() { if (!this.on) return false; const e = G.player.eyePos(); return Math.hypot(this.cam[0] - e[0], this.cam[1] - e[1], this.cam[2] - e[2]) > 1.2; },

  camera(cam, dt) {
    const k = G.input.keys, p = G.player;
    const f = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
    const r = [Math.cos(p.yaw), 0, -Math.sin(p.yaw)];
    const mv = [0, 0, 0];
    const fw = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0), st = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    const up = (k.has('Space') ? 1 : 0) - (k.has('ShiftLeft') || k.has('ShiftRight') ? 1 : 0);
    for (let i = 0; i < 3; i++) mv[i] = f[i] * fw + r[i] * st + (i === 1 ? up : 0);
    const sp = k.has('ControlLeft') ? 16 : 5;
    // gentle, film-like camera: speed eases in and out
    for (let i = 0; i < 3; i++) { this.vel[i] += (mv[i] * sp - this.vel[i]) * Math.min(1, dt * 5); this.cam[i] += this.vel[i] * dt; }
    // not too far from you (the world around you is what is loaded)
    const e = p.eyePos(), dx = this.cam[0] - e[0], dy = this.cam[1] - e[1], dz = this.cam[2] - e[2], d = Math.hypot(dx, dy, dz);
    if (d > 48) { const s = 48 / d; this.cam = [e[0] + dx * s, e[1] + dy * s, e[2] + dz * s]; }
    const arrows = (k.has('ArrowRight') ? 1 : 0) - (k.has('ArrowLeft') ? 1 : 0);
    if (arrows) { G.settings.dayCycle = false; G.dayTime = (G.dayTime + arrows * dt * 0.04 + 1) % 1; }
    return { pos: this.cam.slice(), yaw: p.yaw, pitch: p.pitch, roll: 0, fov: this.fov };
  },

  apply() {
    const F = PHOTO_FILTERS[this.filter];
    G.canvas.style.filter = F.css === 'none' ? '' : F.css;
    const fx = $('photoFx');
    fx.querySelector('.pvig').style.opacity = F.vig || 0;
    const t = fx.querySelector('.ptint');
    t.style.background = F.tint ? F.tint[0] : 'transparent';
    t.style.mixBlendMode = F.tint ? F.tint[1] : 'normal';
    fx.querySelector('.pgrain').style.opacity = F.grain ? F.grain * 3 : 0;
    fx.classList.toggle('bars', !!F.bars);
    fx.classList.toggle('grid', this.grid);
    $('photoBar').classList.toggle('hidden', this.bare);
    for (const [i, b] of [...$('photoChips').children].entries()) b.classList.toggle('on', i === this.filter);
    $('photoFov').textContent = Math.round(this.fov) + '°';
  },

  buildBar() {
    const chips = $('photoChips');
    if (chips.children.length) return;
    PHOTO_FILTERS.forEach((F, i) => {
      const b = document.createElement('button');
      b.innerHTML = '<i>' + (i + 1) + '</i>' + F.name;
      b.style.setProperty('--pf', F.css === 'none' ? 'none' : F.css);
      b.addEventListener('click', (e) => { e.stopPropagation(); this.filter = i; this.apply(); });
      chips.append(b);
    });
    $('photoShoot').addEventListener('click', (e) => { e.stopPropagation(); this.wantShot = true; });
    // animated film grain
    const g = $('photoFx').querySelector('.pgrain');
    const gc = document.createElement('canvas'); gc.width = 160; gc.height = 100;
    g.append(gc);
    const paint = () => {
      if (this.on && PHOTO_FILTERS[this.filter].grain) {
        const x = gc.getContext('2d'), im = x.createImageData(160, 100);
        for (let i = 0; i < im.data.length; i += 4) { const v = Math.random() * 255; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
        x.putImageData(im, 0, 0);
      }
      setTimeout(paint, 90);
    };
    paint();
  },

  key(e) {
    if (!this.on) return false;
    const c = e.code;
    if (c.startsWith('Digit')) { const n = Number(c.slice(5)) - 1; if (n >= 0 && n < PHOTO_FILTERS.length) { this.filter = n; this.apply(); sfx('click', null, 0.5, 1.5); } return true; }
    // up and down for the floating camera (kept from reaching the flying toggle)
    if (c === 'Space' || c === 'ShiftLeft' || c === 'ShiftRight') { G.input.keys.add(c); return true; }
    if (c === 'KeyC' || c === 'Enter') { if (!e.repeat) this.wantShot = true; return true; }
    if (c === 'KeyG') { this.grid = !this.grid; this.apply(); return true; }
    if (c === 'KeyH') { this.bare = !this.bare; this.apply(); return true; }
    if (c === 'KeyP' || c === 'Escape' || c === 'F2') { if (!e.repeat) this.close(); return c !== 'Escape' || !G.unlocked; }
    if (c === 'Equal' || c === 'NumpadAdd') { this.zoom(-5); return true; }
    if (c === 'Minus' || c === 'NumpadSubtract') { this.zoom(5); return true; }
    return ['KeyE', 'KeyQ', 'KeyF', 'KeyV', 'F5', 'KeyR', 'KeyT', 'Tab'].includes(c);
  },
  zoom(d) { this.fov = clamp(this.fov + d, 15, 110); this.apply(); },

  // right after a frame is drawn: bake the look into a PNG and download it
  shoot(canvas) {
    this.wantShot = false;
    const F = PHOTO_FILTERS[this.filter];
    const W = canvas.width, H = canvas.height;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.filter = F.css;
    x.drawImage(canvas, 0, 0);
    x.filter = 'none';
    if (F.tint) { x.globalCompositeOperation = F.tint[1]; x.fillStyle = F.tint[0]; x.fillRect(0, 0, W, H); x.globalCompositeOperation = 'source-over'; }
    if (F.vig) {
      const g = x.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,' + F.vig + ')');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    if (F.grain) {
      const im = x.getImageData(0, 0, W, H), d = im.data, a = F.grain * 255;
      for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * a; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      x.putImageData(im, 0, 0);
    }
    if (F.bars) { const h = Math.max(0, (H - W / 2.39) / 2); x.fillStyle = '#000'; x.fillRect(0, 0, W, h); x.fillRect(0, H - h, W, h); }
    // a small signature
    x.font = '600 ' + Math.round(H * 0.022) + 'px system-ui, sans-serif';
    x.fillStyle = 'rgba(255,255,255,0.55)';
    x.textAlign = 'right';
    x.fillText('BLOCKLANDS', W - H * 0.03, H - H * 0.03 - (F.bars ? Math.max(0, (H - W / 2.39) / 2) : 0));
    c.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      const d = new Date(), pad = (v) => String(v).padStart(2, '0');
      a.download = 'blocklands-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.png';
      a.href = URL.createObjectURL(blob);
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    }, 'image/png');
    const fl = $('photoFlash');
    fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
    sfx('shutter', null, 1, 1);
    if (typeof Progress !== 'undefined' && Progress.unlock) try { Progress.unlock('photo'); } catch (e) { /* ignore */ }
  },
};

SYNTH.shutter = (ctx, o, t, p) => {
  Sound.noise(ctx, o, t, 0.05, { type: 'highpass', freq: 2500 * p, q: 0.7, gain: 0.35 });
  Sound.noise(ctx, o, t + 0.09, 0.06, { type: 'bandpass', freq: 1800 * p, q: 1, gain: 0.25 });
};

// ---------------------------------------------------------------- hooks ----
{
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt, input) {
    if (Photo.on) { this.vel[0] = this.vel[2] = 0; return; }   // you hold still while the camera floats
    return upd.call(this, dt, input);
  };
  window.addEventListener('keydown', (e) => {
    if (!G.playing || G.screenOpen) return;
    if (!Photo.on) {
      if ((e.code === 'KeyP' || e.code === 'F2') && !e.repeat && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); e.stopImmediatePropagation(); Photo.open(); }
      return;
    }
    if (Photo.key(e)) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('wheel', (e) => { if (Photo.on) { e.preventDefault(); e.stopImmediatePropagation(); Photo.zoom(Math.sign(e.deltaY) * 3); } }, { capture: true, passive: false });
}
