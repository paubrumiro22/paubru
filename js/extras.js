'use strict';
// More things to do:
// - Signs: hang a sign on a wall and write up to three lines on it (wood, street-name blue,
//   neon or chalkboard). They are pictures underneath, so they are saved and shared online.
// - Chat commands (Enter, also offline): /help /home /sethome /spawn /tp <player> /pos /seed,
//   /time and /weather in creative, /photo /map /metro.
// - Home: /sethome (or sleeping in a bed, or your plot) marks home; a pill under the coins
//   points the way when you are away.

// ---------------------------------------------------------------- signs ----
Object.assign(I, { SIGN: 434 });
defItem(I.SIGN, 'Sign', { sprite: 'i_sign', cat: 'functional', stack: 16 });
shaped(I.SIGN, 3, ['PPP', 'PPP', ' S '], { P: B.PLANKS, S: I.STICK });

const SIGN_STYLES = {
  wood: { name: 'Wood', bg: ['#b98a52', '#a27440'], ink: '#3b2413', edge: '#6e4a26', font: '700 {s}px Georgia, serif' },
  street: { name: 'Street', bg: ['#1f4fa3', '#193f86'], ink: '#ffffff', edge: '#ffffff', font: '800 {s}px Arial, sans-serif' },
  neon: { name: 'Neon', bg: ['#130a22', '#0d0718'], ink: '#ff5fd2', edge: '#5ff2ff', font: '700 {s}px "Trebuchet MS", sans-serif', glow: true },
  chalk: { name: 'Chalkboard', bg: ['#27352d', '#1f2b24'], ink: '#eef2e8', edge: '#8a6a44', font: '600 {s}px "Comic Sans MS", "Chalkboard SE", cursive' },
};

const Signs = {
  pending: null, el: null, style: 'wood', wide: true,

  begin(hit) {
    const n = hit.normal;
    if (n[1] !== 0) { G.ui.toast('Signs go on walls'); return false; }
    const f = n[0] > 0 ? 0 : n[0] < 0 ? 1 : n[2] > 0 ? 4 : 5;
    this.pending = { x: hit.pos[0] + n[0], y: hit.pos[1], z: hit.pos[2] + n[2], f };
    this.show();
    return true;
  },
  show() {
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'signEditor';
      this.el.className = 'overlay';
      this.el.innerHTML = `<div class="se-card"><h3>✏️ Write your sign</h3>
        <canvas class="se-prev" width="512" height="256"></canvas>
        <div class="se-lines"><input maxlength="22" placeholder="Line 1 — e.g. Casa de Pau"><input maxlength="22" placeholder="Line 2"><input maxlength="22" placeholder="Line 3"></div>
        <div class="se-row se-styles"></div>
        <div class="se-row"><label><input type="checkbox" class="se-wide"> Wide (2 blocks)</label><span class="se-sp"></span><button class="se-cancel">Cancel</button><button class="se-ok primary">Hang it</button></div></div>`;
      document.body.append(this.el);
      const st = this.el.querySelector('.se-styles');
      for (const k in SIGN_STYLES) {
        const b = document.createElement('button');
        b.dataset.k = k; b.textContent = SIGN_STYLES[k].name;
        b.style.background = SIGN_STYLES[k].bg[0]; b.style.color = SIGN_STYLES[k].ink;
        b.addEventListener('click', () => { this.style = k; this.preview(); });
        st.append(b);
      }
      for (const i of this.el.querySelectorAll('.se-lines input')) {
        i.addEventListener('input', () => this.preview());
        i.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') this.finish(); if (e.key === 'Escape') this.close(); });
      }
      this.el.querySelector('.se-wide').addEventListener('change', (e) => { this.wide = e.target.checked; this.preview(); });
      this.el.querySelector('.se-cancel').addEventListener('click', () => this.close());
      this.el.querySelector('.se-ok').addEventListener('click', () => this.finish());
    }
    for (const i of this.el.querySelectorAll('.se-lines input')) i.value = '';
    this.el.querySelector('.se-wide').checked = this.wide;
    this.el.classList.remove('hidden');
    this.preview();
    setTimeout(() => this.el.querySelector('.se-lines input').focus(), 30);
  },
  close() {
    this.el.classList.add('hidden');
    this.pending = null;
    G.screenOpen = false;
    requestLock();
  },
  lines() { return [...this.el.querySelectorAll('.se-lines input')].map((i) => i.value.replace(/[\u0000-\u001f]/g, '').trim()).filter(Boolean); },

  // paint a sign: w blocks wide, 1 high (128 px per block)
  paint(lines, style, w) {
    const S = SIGN_STYLES[style] || SIGN_STYLES.wood;
    const W = 128 * w, H = 128;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, S.bg[0]); grd.addColorStop(1, S.bg[1]);
    g.fillStyle = grd; g.fillRect(0, 0, W, H);
    if (style === 'wood') {
      g.strokeStyle = 'rgba(60,35,15,0.25)'; g.lineWidth = 2;
      for (let y = 10; y < H; y += 22) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= W; x += 16) g.lineTo(x, y + Math.sin(x * 0.07 + y) * 2); g.stroke(); }
    }
    if (style === 'chalk') { g.fillStyle = 'rgba(255,255,255,0.04)'; for (let i = 0; i < 300; i++) g.fillRect(Math.random() * W, Math.random() * H, 2, 1); }
    g.strokeStyle = S.edge; g.lineWidth = style === 'street' ? 5 : 8;
    if (S.glow) { g.shadowColor = S.edge; g.shadowBlur = 14; }
    g.strokeRect(style === 'street' ? 8 : 4, style === 'street' ? 8 : 4, W - (style === 'street' ? 16 : 8), H - (style === 'street' ? 16 : 8));
    const L = lines.length ? lines : [''];
    const size = L.length === 1 ? 44 : L.length === 2 ? 34 : 27;
    g.font = S.font.replace('{s}', size);
    // shrink wide text to fit
    let k = 1;
    for (const t of L) k = Math.min(k, (W - 30) / Math.max(1, g.measureText(t).width));
    g.font = S.font.replace('{s}', Math.floor(size * k));
    g.fillStyle = S.ink; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (S.glow) { g.shadowColor = S.ink; g.shadowBlur = 18; }
    const lh = size * k * 1.18;
    L.forEach((t, i) => g.fillText(t, W / 2, H / 2 + (i - (L.length - 1) / 2) * lh));
    return c;
  },
  preview() {
    const cv = this.el.querySelector('.se-prev');
    const w = this.wide ? 2 : 1;
    const src = this.paint(this.lines(), this.style, w);
    cv.width = src.width; cv.height = src.height;
    cv.style.aspectRatio = w + ' / 1';
    cv.getContext('2d').drawImage(src, 0, 0);
    for (const b of this.el.querySelectorAll('.se-styles button')) b.classList.toggle('on', b.dataset.k === this.style);
  },
  finish() {
    const q = this.pending;
    if (!q) return this.close();
    const lines = this.lines();
    if (!lines.length) { G.ui.toast('Write something first'); return; }
    const w = this.wide ? 2 : 1;
    const img = this.paint(lines, this.style, w).toDataURL('image/png');
    const p = Object.assign({ id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), w, h: 1, img }, q);
    // a wide sign grows to the right of the one who reads it
    Pictures.add(p, false);
    if (G.mode === 'survival') { G.inv.consumeHeld(1); G.ui.invDirty(); }
    sfx('place_1', [q.x + 0.5, q.y + 0.5, q.z + 0.5], 1, 1.1);
    this.close();
  },
};
sprite('i_sign', (d) => {
  sprRect(d, 4, 5, 28, 20, [120, 84, 46]);
  sprRect(d, 5, 6, 27, 19, [185, 138, 82]);
  sprRect(d, 8, 9, 24, 10, [80, 52, 26]); sprRect(d, 8, 12, 21, 13, [80, 52, 26]); sprRect(d, 8, 15, 23, 16, [80, 52, 26]);
  sprRect(d, 15, 20, 17, 29, [110, 76, 40]);
});

// ---------------------------------------------------------------- commands ----
const Commands = {
  cool: new Map(),
  sys(text) {
    const log = $('chatLog');
    const line = document.createElement('div');
    line.className = 'cline sys';
    line.textContent = text;
    log.append(line);
    while (log.children.length > 10) log.firstChild.remove();
    setTimeout(() => line.classList.add('fade'), 12000);
  },
  creative() { return G.mode === 'creative' && !serverLocksMode(); },
  wait(k, s) {
    if (G.mode === 'creative') return false;
    const t = this.cool.get(k) || 0, now = performance.now();
    if (now < t) { this.sys('⏳ Wait ' + Math.ceil((t - now) / 1000) + ' s before using /' + k + ' again'); return true; }
    this.cool.set(k, now + s * 1000);
    return false;
  },
  go(pos, label) {
    if (G.vehicle) Vehicles.dismount(true);
    if (G.player.seat) Furniture.stand(G.player);
    const p = G.player;
    p.pos = [pos[0], pos[1], pos[2]];
    p.vel = [0, 0, 0];
    p.fallStart = null; p.landed = 0;
    prepareArea(p.pos[0], p.pos[2], 2);
    liftOutOfBlocks(p);
    sfx('portal', null, 0.7, 1.2);
    Net.teleported();
    this.sys('✨ ' + label);
  },
  run(text) {
    const [cmd, ...args] = text.slice(1).trim().split(/\s+/);
    const c = (cmd || '').toLowerCase();
    const home = Home.get();
    switch (c) {
      case 'help': case '?':
        this.sys('Commands: /home · /sethome · /spawn · /tp <player> · /pos · /seed · /photo · /map · /metro' + (this.creative() ? ' · /time day|night|sunset · /weather clear|rain|storm|snow · /fly' : ''));
        break;
      case 'sethome': Home.set(G.player.pos, 'set'); this.sys('🏠 Home set here'); break;
      case 'home':
        if (!home) { this.sys('No home yet: /sethome, sleep in a bed or claim a plot'); break; }
        if (this.wait('home', 60)) break;
        this.go([home[0], home[1] + 0.05, home[2]], 'Home sweet home');
        break;
      case 'spawn': if (!this.wait('spawn', 60)) this.go(G.worldSpawn, 'Back at the world spawn'); break;
      case 'tp': {
        const name = args.join(' ').toLowerCase();
        const r = [...Net.peers.values()].find((q) => q.name.toLowerCase() === name) || [...Net.peers.values()].find((q) => q.name.toLowerCase().startsWith(name));
        if (!Net.on || !r) { this.sys('Nobody online called “' + args.join(' ') + '”'); break; }
        if (this.wait('tp', 30)) break;
        this.go([r.pos[0] + 1, r.pos[1], r.pos[2] + 1], 'Teleported to ' + r.name);
        break;
      }
      case 'pos': {
        const p = G.player.pos.map(Math.floor);
        if (Net.on) Net.say('📍 I am at ' + p.join(' '));
        else this.sys('📍 ' + p.join(' '));
        break;
      }
      case 'seed': this.sys('🌱 Seed ' + G.world.seed); break;
      case 'photo': Photo.open(); break;
      case 'map': WorldMap.toggle(); break;
      case 'metro': MetroMap.show(); break;
      case 'time': {
        if (!this.creative()) { this.sys('/time works in creative mode'); break; }
        const T = { day: 0.3, morning: 0.03, noon: 0.25, sunset: 0.47, night: 0.62, midnight: 0.75 };
        if (!(args[0] in T)) { this.sys('/time day | morning | noon | sunset | night | midnight'); break; }
        G.dayTime = T[args[0]]; this.sys('🕐 ' + args[0]);
        break;
      }
      case 'weather': {
        if (!this.creative()) { this.sys('/weather works in creative mode'); break; }
        const k = args[0];
        if (!WEATHER_KINDS.includes(k)) { this.sys('/weather ' + WEATHER_KINDS.join(' | ')); break; }
        Weather.set(k, true); Weather.amount = k === 'clear' ? 0 : 1; this.sys('🌦️ ' + k);
        break;
      }
      case 'fly': if (this.creative()) { G.player.flying = !G.player.flying; this.sys(G.player.flying ? 'Flying' : 'Walking'); } else this.sys('/fly works in creative mode'); break;
      default: this.sys('Unknown command /' + c + ' — try /help');
    }
  },
};

// ---------------------------------------------------------------- home ----
const Home = {
  get() { const h = G.prog && G.prog.home; return Array.isArray(h) && h.length === 3 && h.every(Number.isFinite) ? h : null; },
  set(pos, why) {
    if (!G.prog) G.prog = {};
    G.prog.home = [Math.floor(pos[0]) + 0.5, Math.floor(pos[1]), Math.floor(pos[2]) + 0.5];
    G.prog.homeWhy = why;
  },
  t: 0,
  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 0.15;
    const el = $('homeTag');
    if (!el) return;
    const h = this.get(), p = G.player;
    const d = h ? Math.hypot(h[0] - p.pos[0], h[2] - p.pos[2]) : 0;
    const show = h && d > 40 && !G.onTitle && !Photo.on && dimOf(p.pos[0], p.pos[2]) === dimOf(h[0], h[2]);
    el.classList.toggle('show', !!show);
    if (!show) return;
    // direction relative to where you look (0 = straight ahead)
    const ang = Math.atan2(h[0] - p.pos[0], h[2] - p.pos[2]) - Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    el.querySelector('i').style.transform = 'rotate(' + (-ang) + 'rad)';
    el.querySelector('b').textContent = d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m';
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const held = G.inv.held, t = this.target;
    if (initial && held && held.id === I.SIGN && t && t.block && !G.player.sneaking) { if (Signs.begin(t.block)) this.swingHand(); return true; }
    return use.call(this, initial);
  };
  // commands from the chat box, which now opens offline too
  const say = Net.say;
  Net.say = function (text) {
    const t = String(text || '').trim();
    if (t.startsWith('/')) { Commands.run(t); return; }
    if (!this.on) { if (t) Commands.sys('You are playing alone: nobody can read that. Type /help for commands'); return; }
    return say.call(this, text);
  };
  Net.openChat = function () {
    const box = $('chatInput');
    box.classList.remove('hidden');
    box.value = '';
    box.placeholder = this.on ? 'Say something, or /help for commands' : 'Type a command: /help';
    releaseAllInput();
    setTimeout(() => box.focus(), 0);
  };
  // sleeping in a bed and claiming a plot also mark home
  const sleep = trySleep;
  // eslint-disable-next-line no-global-assign
  trySleep = function (x, y, z) { sleep(x, y, z); if (G.sleeping && (!Home.get() || G.prog.homeWhy !== 'set')) Home.set([x, y + 1, z], 'bed'); };
  const claim = Claims.create;
  Claims.create = function (x, y, z) { const r = claim.call(this, x, y, z); if (!r && (!Home.get() || G.prog.homeWhy === 'plot')) Home.set([x, y + 1, z], 'plot'); return r; };
  // signs drop signs
  const rm = Pictures.remove;
  Pictures.remove = function (p, fromNet) {
    if (!fromNet && p && typeof p.id === 'string' && p.id[0] === 's' && G.mode === 'survival') {
      const had = G.world.pictures.has(p.id);
      G.mode = 'creative';
      try { rm.call(this, p, fromNet); } finally { G.mode = 'survival'; }
      if (had) Ents.spawnItem(mkStack(I.SIGN, 1), p.x + 0.5, p.y + 0.5, p.z + 0.5);
      return;
    }
    return rm.call(this, p, fromNet);
  };
  window.addEventListener('keydown', (e) => { if (Signs.el && !Signs.el.classList.contains('hidden') && e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); Signs.close(); } }, true);
}
