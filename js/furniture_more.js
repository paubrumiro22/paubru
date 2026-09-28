'use strict';
// The second lot of furniture in play (the shapes are at the end of furniture_blocks.js): the
// shower runs for a few seconds, the bath and the WC are seats (the WC flushes when you get up),
// the washing machine spins, pictures and the shelf hang on the wall you click, the computer
// opens a desktop with apps (other files add theirs to PC.apps) and the games console starts an
// arcade game on the screen while the nearest TV shows it too.

const WALL_HUNG = new Set([B.PAINTING_SEA, B.PAINTING_CITY, B.PAINTING_FLOWERS, B.PAINTING_ABSTRACT, B.WALL_SHELF]);
const MORE_FURN = (id) => id >= B.CEILING_LAMP && id <= B.TV_GAME;
SEATS.set(B.TOILET, 9);
SEATS.set(B.BATHTUB, 3);
TOGGLE.set(B.WASHER, B.WASHER_ON);
TOGGLE.set(B.WASHER_ON, B.WASHER);

// ---------------------------------------------------------------- a desktop panel helper ----
// Every new window (computer, arcade, shops, market, friends...) is one of these: a dark card with
// a title bar, over the game, with the mouse released. Esc or the ✕ closes the top one.
const GPanel = {
  stack: [],
  open(opts) {
    const wrap = document.createElement('div');
    wrap.className = 'gp-wrap';
    wrap.innerHTML = `<div class="gp ${opts.cls || ''}" style="${opts.width ? 'width:min(' + opts.width + 'px,calc(100vw - 32px))' : ''}">
      <div class="gp-bar"><span class="gp-ic">${opts.icon || ''}</span><b class="gp-t"></b><span class="gp-sub"></span><button class="gp-x" title="Close">✕</button></div>
      <div class="gp-body"></div></div>`;
    wrap.querySelector('.gp-t').textContent = opts.title || '';
    wrap.querySelector('.gp-sub').textContent = opts.sub || '';
    document.body.append(wrap);
    const p = { wrap, body: wrap.querySelector('.gp-body'), onClose: opts.onClose, key: opts.key,
      setSub(t) { wrap.querySelector('.gp-sub').textContent = t; }, close: () => this.close(p) };
    wrap.querySelector('.gp-x').addEventListener('click', () => p.close());
    wrap.addEventListener('pointerdown', (e) => { if (e.target === wrap) p.close(); });
    if (!this.stack.length) {
      G.screenOpen = true;
      releaseAllInput();
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    }
    this.stack.push(p);
    sfx('click', null, 0.6, 1.1);
    return p;
  },
  close(p) {
    const i = this.stack.indexOf(p);
    if (i < 0) return;
    this.stack.splice(i, 1);
    p.wrap.remove();
    try { if (p.onClose) p.onClose(); } catch (e) { console.warn(e); }
    if (!this.stack.length) { G.screenOpen = false; G.screenClosedAt = performance.now(); requestLock(); }
  },
  top() { return this.stack[this.stack.length - 1] || null; },
  closeAll() { while (this.stack.length) this.close(this.top()); },
  esc(t) { return String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]); },
};
window.addEventListener('keydown', (e) => {
  const p = GPanel.top();
  if (!p) return;
  if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); p.close(); return; }
  if (p.onKey && p.onKey(e)) { e.preventDefault(); e.stopImmediatePropagation(); return; }
  // typing in a panel never reaches the game
  if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) e.stopImmediatePropagation();
}, true);

// ---------------------------------------------------------------- the computer ----
const PC = {
  apps: [],
  add(app) { this.apps = this.apps.filter((a) => a.key !== app.key); this.apps.push(app); },
  open(pos) {
    const p = GPanel.open({ title: 'BlocOS', sub: 'Desktop', icon: '🖥️', cls: 'gp-pc', width: 640 });
    const draw = () => {
      const t = new Date(), hh = Math.floor(((G.dayTime || 0) * 24 + 6) % 24), mm = Math.floor((((G.dayTime || 0) * 24 + 6) % 1) * 60);
      p.body.innerHTML = `<div class="pc-desk">
        ${this.apps.filter((a) => !a.when || a.when()).map((a, i) => `<button class="pc-app" data-i="${i}"><i>${a.icon}</i><span>${GPanel.esc(a.name)}</span></button>`).join('')}
      </div>
      <div class="pc-task"><span>🟦 Start</span><span class="pc-clock">${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${typeof Calendar !== 'undefined' ? GPanel.esc(Calendar.dateText()) : t.toLocaleDateString()}</span></div>`;
      const shown = this.apps.filter((a) => !a.when || a.when());
      p.body.querySelectorAll('.pc-app').forEach((b) => b.addEventListener('click', () => {
        const a = shown[Number(b.dataset.i)];
        if (!a) return;
        if (a.closes) p.close();
        a.run(pos, p);
      }));
    };
    draw();
    sfx('metro_chime', null, 0.3, 1.6);
  },
};
PC.add({ key: 'paper', icon: '📰', name: 'La Gaseta', closes: true, run() { if (typeof Newspaper !== 'undefined') Newspaper.show(); } });
PC.add({ key: 'arcade', icon: '🐍', name: 'Serp Bloc', run() { Arcade.start(null); } });
PC.add({ key: 'bank', icon: '🏦', name: 'My Account', run(pos, p) {
  const q = GPanel.open({ title: 'Banc Central · online', icon: '🏦', width: 420 });
  q.body.innerHTML = `<div class="gp-card"><div class="gp-big">🪙 ${G.mode === 'creative' ? '∞' : (G.money | 0)}</div><p>Coins in your pocket.</p>
    <p class="gp-dim">Day ${typeof Calendar !== 'undefined' ? Calendar.day() + 1 : 1} · keep saving!</p></div>`;
} });

// ---------------------------------------------------------------- the arcade ----
// "Serp Bloc": snake on a neon grid. Apples make you longer and faster; a golden apple now and
// then is worth five and vanishes after a while. Arrows / WASD, P pauses, swipes on touch screens.
const Arcade = {
  tvs: [],
  start(consolePos) {
    this.lightTVs(consolePos, true);
    const p = GPanel.open({ title: 'Serp Bloc', sub: 'Arrows / WASD · P pause', icon: '🎮', cls: 'gp-arcade', width: 620,
      onClose: () => { this.run = null; this.lightTVs(null, false); } });
    p.body.innerHTML = `<div class="arc-top"><span>Score <b class="arc-s">0</b></span><span>Best <b class="arc-b">0</b></span><span class="arc-l">Level 1</span></div>
      <canvas class="arc-c" width="576" height="384"></canvas>
      <div class="arc-msg"><b>SERP BLOC</b><span>Press Space or tap to start</span></div>
      <div class="arc-pad"><button data-d="u">▲</button><button data-d="l">◀</button><button data-d="d">▼</button><button data-d="r">▶</button></div>`;
    const cv = p.body.querySelector('.arc-c'), ctx = cv.getContext('2d');
    const W = 24, H = 16, S = 24;
    const best = () => (G.prog && G.prog.arcade) | 0;
    p.body.querySelector('.arc-b').textContent = best();
    const g = { snake: [], dir: [1, 0], next: [1, 0], apple: null, gold: null, score: 0, alive: false, paused: false, t: 0, step: 0.14, fx: [] };
    const free = () => {
      for (let i = 0; i < 200; i++) {
        const c = [Math.floor(Math.random() * W), Math.floor(Math.random() * H)];
        if (!g.snake.some((s) => s[0] === c[0] && s[1] === c[1]) && !(g.apple && g.apple[0] === c[0] && g.apple[1] === c[1])) return c;
      }
      return [0, 0];
    };
    const reset = () => {
      g.snake = [[6, 8], [5, 8], [4, 8]]; g.dir = [1, 0]; g.next = [1, 0]; g.score = 0; g.step = 0.14; g.gold = null;
      g.apple = free(); g.alive = true; g.paused = false; g.t = 0;
      p.body.querySelector('.arc-msg').classList.add('hide');
      p.body.querySelector('.arc-s').textContent = '0';
      p.body.querySelector('.arc-l').textContent = 'Level 1';
    };
    const over = () => {
      g.alive = false;
      sfx('gate_no', null, 0.6, 0.8);
      const pr = G.prog || (G.prog = {});
      const rec = g.score > best();
      if (rec) pr.arcade = g.score;
      p.body.querySelector('.arc-b').textContent = best();
      const m = p.body.querySelector('.arc-msg');
      m.innerHTML = `<b>${rec ? 'NEW RECORD!' : 'GAME OVER'}</b><span>${g.score} points · Space to play again</span>`;
      m.classList.remove('hide');
      if (rec && g.score >= 20 && typeof Progress !== 'undefined' && Progress.toast) Progress.toast('🐍', 'Serp Bloc', 'New record: ' + g.score);
    };
    const turn = (d) => {
      const v = { u: [0, -1], d: [0, 1], l: [-1, 0], r: [1, 0] }[d];
      if (!v) return;
      if (!g.alive) { reset(); return; }
      if (v[0] === -g.dir[0] && v[1] === -g.dir[1]) return;
      g.next = v;
    };
    p.onKey = (e) => {
      const k = { ArrowUp: 'u', KeyW: 'u', ArrowDown: 'd', KeyS: 'd', ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r' }[e.code];
      if (k) { turn(k); return true; }
      if (e.code === 'Space') { if (!g.alive) reset(); return true; }
      if (e.code === 'KeyP' && g.alive) { g.paused = !g.paused; return true; }
      return false;
    };
    p.body.querySelectorAll('.arc-pad button').forEach((b) => b.addEventListener('pointerdown', (e) => { e.preventDefault(); turn(b.dataset.d); }));
    let sw = null;
    cv.addEventListener('pointerdown', (e) => { sw = [e.clientX, e.clientY]; if (!g.alive) reset(); });
    cv.addEventListener('pointerup', (e) => {
      if (!sw) return;
      const dx = e.clientX - sw[0], dy = e.clientY - sw[1];
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'r' : 'l') : (dy > 0 ? 'd' : 'u'));
      sw = null;
    });
    const tick = () => {
      g.dir = g.next;
      const h = g.snake[0], n = [h[0] + g.dir[0], h[1] + g.dir[1]];
      if (n[0] < 0 || n[1] < 0 || n[0] >= W || n[1] >= H || g.snake.some((s, i) => i < g.snake.length - 1 && s[0] === n[0] && s[1] === n[1])) { over(); return; }
      g.snake.unshift(n);
      let ate = 0;
      if (n[0] === g.apple[0] && n[1] === g.apple[1]) { ate = 1; g.apple = free(); }
      else if (g.gold && n[0] === g.gold.c[0] && n[1] === g.gold.c[1]) { ate = 5; g.gold = null; }
      if (ate) {
        g.score += ate;
        for (let i = 0; i < 14; i++) g.fx.push({ x: (n[0] + 0.5) * S, y: (n[1] + 0.5) * S, vx: rand(-90, 90), vy: rand(-90, 90), t: 0.5, gold: ate > 1 });
        sfx(ate > 1 ? 'achieve' : 'click', null, 0.5, 1.4 + Math.min(0.6, g.score * 0.01));
        g.step = Math.max(0.06, 0.14 - g.score * 0.0018);
        if (!g.gold && Math.random() < 0.18) g.gold = { c: free(), t: 6 };
        p.body.querySelector('.arc-s').textContent = g.score;
        p.body.querySelector('.arc-l').textContent = 'Level ' + (1 + Math.floor(g.score / 8));
      } else g.snake.pop();
    };
    const draw = (time) => {
      ctx.fillStyle = '#070b14'; ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = 'rgba(80,140,255,0.08)'; ctx.lineWidth = 1;
      for (let x = 0; x <= W; x++) { ctx.beginPath(); ctx.moveTo(x * S + 0.5, 0); ctx.lineTo(x * S + 0.5, H * S); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.beginPath(); ctx.moveTo(0, y * S + 0.5); ctx.lineTo(W * S, y * S + 0.5); ctx.stroke(); }
      const glow = (c, b) => { ctx.shadowColor = c; ctx.shadowBlur = b; };
      if (g.apple) {
        const pulse = 1 + Math.sin(time * 6) * 0.08;
        glow('#ff3b5c', 18); ctx.fillStyle = '#ff3b5c';
        ctx.beginPath(); ctx.arc((g.apple[0] + 0.5) * S, (g.apple[1] + 0.55) * S, S * 0.34 * pulse, 0, 7); ctx.fill();
        ctx.shadowBlur = 0; ctx.fillStyle = '#5be37a'; ctx.fillRect((g.apple[0] + 0.5) * S, g.apple[1] * S + 3, 5, 4);
      }
      if (g.gold) {
        glow('#ffd84a', 24); ctx.fillStyle = g.gold.t < 2 && Math.floor(time * 8) % 2 ? '#8a6d10' : '#ffd84a';
        ctx.beginPath(); ctx.arc((g.gold.c[0] + 0.5) * S, (g.gold.c[1] + 0.5) * S, S * 0.38, 0, 7); ctx.fill();
      }
      g.snake.forEach((s, i) => {
        const k = 1 - i / Math.max(8, g.snake.length) * 0.6;
        glow('#3cf2c0', i ? 8 : 20);
        ctx.fillStyle = `rgb(${Math.round(40 + 20 * k)},${Math.round(160 + 80 * k)},${Math.round(140 + 60 * k)})`;
        const m = i ? 3 : 1.5;
        ctx.beginPath(); ctx.roundRect(s[0] * S + m, s[1] * S + m, S - m * 2, S - m * 2, 6); ctx.fill();
      });
      ctx.shadowBlur = 0;
      if (g.snake.length) {
        const h = g.snake[0], d = g.dir;
        ctx.fillStyle = '#04211a';
        for (const sgn of [-1, 1]) {
          const ex = (h[0] + 0.5 + d[0] * 0.18 + -d[1] * 0.2 * sgn) * S, ey = (h[1] + 0.5 + d[1] * 0.18 + d[0] * 0.2 * sgn) * S;
          ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, 7); ctx.fill();
        }
      }
      for (const f of g.fx) { ctx.globalAlpha = Math.max(0, f.t * 2); ctx.fillStyle = f.gold ? '#ffd84a' : '#ff6b86'; ctx.fillRect(f.x - 2, f.y - 2, 4, 4); }
      ctx.globalAlpha = 1;
      if (g.paused) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(0, 0, cv.width, cv.height); ctx.fillStyle = '#fff'; ctx.font = 'bold 28px system-ui'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', cv.width / 2, cv.height / 2); }
    };
    let last = performance.now();
    const loop = (now) => {
      if (this.run !== loop) return;
      const dt = Math.min(0.1, (now - last) / 1000); last = now;
      if (g.alive && !g.paused) {
        g.t += dt;
        while (g.t >= g.step && g.alive) { g.t -= g.step; tick(); }
        if (g.gold && (g.gold.t -= dt) <= 0) g.gold = null;
      }
      for (const f of g.fx) { f.x += f.vx * dt; f.y += f.vy * dt; f.t -= dt; }
      g.fx = g.fx.filter((f) => f.t > 0);
      draw(now / 1000);
      requestAnimationFrame(loop);
    };
    this.run = loop;
    g.snake = [[6, 8], [5, 8], [4, 8]]; g.apple = [14, 8];
    requestAnimationFrame(loop);
  },
  // the TVs round the console show the game while it lasts
  lightTVs(pos, on) {
    const w = G.world;
    if (on && pos) {
      const [x, y, z] = pos, list = [];
      for (let dx = -6; dx <= 6; dx++) for (let dy = -2; dy <= 3; dy++) for (let dz = -6; dz <= 6; dz++) {
        const id = w.getBlock(x + dx, y + dy, z + dz);
        if (id === B.TV || id === B.TV_ON) { this.tvs.push([x + dx, y + dy, z + dz, id]); list.push([x + dx, y + dy, z + dz, B.TV_GAME, w.getFacing(x + dx, y + dy, z + dz)]); }
      }
      if (list.length) editBlocks(list);
    } else if (!on && this.tvs.length) {
      const list = this.tvs.filter(([a, b, c]) => w.getBlock(a, b, c) === B.TV_GAME).map(([a, b, c, id]) => [a, b, c, id, w.getFacing(a, b, c)]);
      this.tvs = [];
      if (list.length) editBlocks(list);
    }
  },
};

// ---------------------------------------------------------------- shower ----
const Shower = {
  on: [],
  start(x, y, z) {
    const by = G.world.getBlock(x, y, z) === B.SHOWER_TOP ? y - 1 : y;
    const f = G.world.getFacing(x, by, z), fr = Furniture.front(f);
    this.on.push({ x: x + 0.5 - fr[0] * 0.1, y: by + 1 + 7 / 16, z: z + 0.5 - fr[2] * 0.1, t: 6 });
    sfx('shower', [x + 0.5, by + 1.2, z + 0.5], 0.7, 1);
    const p = G.player;
    if (Math.floor(p.pos[0]) === x && Math.floor(p.pos[2]) === z) {
      G.ui.toast('🚿 Nice and clean!', 1800);
      if (p.fire) p.fire = 0;
    }
  },
  update(dt) {
    for (const s of this.on) {
      s.t -= dt;
      const n = Math.random() < dt * 60 ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, r = Math.random() * 0.14;
        Particles.add(Particles.base(s.x + Math.cos(a) * r, s.y, s.z + Math.sin(a) * r, { vx: Math.cos(a) * 0.3, vy: -2.5, vz: Math.sin(a) * 0.3, life: 0.5, max: 0.5, size: 0.035, layer: T.p_bubble, r: 0.7, g: 0.85, b: 1, grav: 12, collide: true }));
      }
    }
    this.on = this.on.filter((s) => s.t > 0);
  },
};

SYNTH.shower = (ctx, o, t) => { Sound.noise(ctx, o, t, 5.5, { type: 'highpass', freq: 2600, q: 0.5, gain: 0.08, attack: 0.3 }); };
SYNTH.flush = (ctx, o, t) => {
  Sound.noise(ctx, o, t, 1.6, { type: 'bandpass', freq: 700, freqEnd: 260, q: 0.8, gain: 0.3, attack: 0.05 });
  Sound.noise(ctx, o, t + 0.2, 1.2, { type: 'highpass', freq: 3000, q: 0.5, gain: 0.08 });
};
SYNTH.washer = (ctx, o, t) => {
  Sound.tone(ctx, o, t, 1.2, { wave: 'sawtooth', f0: 40, f1: 120, gain: 0.05, filter: ['lowpass', 400, 1] });
  Sound.noise(ctx, o, t + 0.3, 1.4, { type: 'bandpass', freq: 500, q: 1, gain: 0.12 });
};

// ---------------------------------------------------------------- hooks ----
{
  const use0 = Furniture.use;
  Furniture.use = function (x, y, z, id) {
    if (id === B.SHOWER || id === B.SHOWER_TOP) { Shower.start(x, y, z); return true; }
    if (id === B.DESKTOP_PC) { PC.open([x, y, z]); return true; }
    if (id === B.GAME_CONSOLE) { Arcade.start([x, y, z]); return true; }
    if (id === B.WASHER) sfx('washer', [x + 0.5, y + 0.5, z + 0.5], 0.8, 1);
    return use0.call(this, x, y, z, id);
  };
  const stand0 = Furniture.stand;
  Furniture.stand = function (p) {
    const s = p.seat;
    stand0.call(this, p);
    if (s && s.id === B.TOILET) sfx('flush', [s.x + 0.5, s.y + 0.5, s.z + 0.5], 0.7, 1);
  };
  const place0 = Furniture.place;
  Furniture.place = function (hit, placeId) {
    if (placeId !== B.SHOWER) return place0.call(this, hit, placeId);
    const w = G.world;
    let [x, y, z] = hit.pos;
    const n = hit.normal;
    if (!BLOCK_REPLACE[hit.id]) { x += n[0]; y += n[1]; z += n[2]; }
    const lk = G.player.lookDir();
    const f = Math.abs(lk[0]) > Math.abs(lk[2]) ? (lk[0] > 0 ? 0 : 1) : (lk[2] > 0 ? 4 : 5);
    for (const b of [y, y + 1]) if (b < 0 || b >= CH || !BLOCK_REPLACE[w.getBlock(x, b, z)]) { G.ui.toast('The shower needs two free blocks'); return false; }
    editBlocks([[x, y, z, B.SHOWER, f], [x, y + 1, z, B.SHOWER_TOP, f]]);
    sfx('place_' + BLOCK_SOUND[B.SHOWER], [x + 0.5, y + 0.5, z + 0.5], 1, 0.9);
    Act.consume(); Act.swingHand();
    return true;
  };
  const broken0 = Furniture.broken;
  Furniture.broken = function (x, y, z, id) {
    const w = G.world;
    if (id === B.SHOWER && w.getBlock(x, y + 1, z) === B.SHOWER_TOP) editBlocks([[x, y + 1, z, B.AIR]]);
    if (id === B.SHOWER_TOP && w.getBlock(x, y - 1, z) === B.SHOWER) editBlocks([[x, y - 1, z, B.AIR]]);
    return broken0.call(this, x, y, z, id);
  };
  const upd0 = Furniture.update;
  Furniture.update = function (dt) { upd0.call(this, dt); Shower.update(dt || 0.016); };

  const place = Act.placeBlock;
  Act.placeBlock = function (hit) {
    const held = G.inv.held, d = held && ITEM_DEF[held.id];
    const id = d && (d.block || d.places);
    if (id === B.SHOWER) return Furniture.place(hit, id);
    if (id === B.CEILING_LAMP && hit.normal[1] !== -1) { G.ui.toast('Hang it from a ceiling (click the underside of a block)', 1800); return false; }
    return place.call(this, hit);
  };
  // pictures and shelves go flat on the wall you click; nothing new is ever mirrored
  const face0 = Act.shapeFacing;
  Act.shapeFacing = function (id, hit, n) {
    if (!MORE_FURN(id)) return face0.call(this, id, hit, n);
    if (WALL_HUNG.has(id) && n[1] === 0) return this.dirIndex([-n[0], 0, -n[2]]);
    return face0.call(this, id, hit, n) & 7;
  };

  const drops = blockDrops;
  // eslint-disable-next-line no-global-assign
  blockDrops = function (id, toolItem, rnd) {
    if (id === B.SHOWER_TOP) return [[B.SHOWER, 1]];
    if (id === B.WASHER_ON) return [[B.WASHER, 1]];
    if (id === B.TV_GAME) return [[B.TV, 1]];
    if (MORE_FURN(id)) return [[id, 1]];
    return drops(id, toolItem, rnd);
  };
  for (const id of [B.SHOWER, B.BATHTUB, B.TOILET, B.WASHER, B.DESKTOP_PC, B.GAME_CONSOLE]) if (ITEM_DEF[id]) ITEM_DEF[id].stack = 1;
}

// ---------------------------------------------------------------- recipes ----
{
  const PL = B.PLANKS, WL = (c) => B.WOOL + c, IR = I.IRON_INGOT, Q = B.SMOOTH_STONE || B.STONE, GL = B.GLASS_PANE || B.GLASS;
  shaped(B.CEILING_LAMP, 1, [' I ', ' I ', 'WTW'], { I: IR, W: WL(0), T: B.TORCH });
  shaped(B.RUG_RED, 3, ['WWW'], { W: WL(14) });
  shaped(B.RUG_BLUE, 3, ['WWW'], { W: WL(11) });
  shaped(B.RUG_BEIGE, 3, ['WWW'], { W: WL(12) });
  [[B.PAINTING_SEA, 11], [B.PAINTING_CITY, 15], [B.PAINTING_FLOWERS, 6], [B.PAINTING_ABSTRACT, 4]].forEach(([id, c]) => shaped(id, 1, ['SSS', 'SWS', 'SSS'], { S: I.STICK, W: WL(c) }));
  shaped(B.WALL_SHELF, 2, ['PPP', 'B B'], { P: PL, B: B.BOOKSHELF });
  shaped(B.SHOWER, 1, ['II ', 'I W', 'QQQ'], { I: IR, W: WL(0), Q });
  shaped(B.BATHTUB, 1, ['Q Q', 'QBQ'], { Q, B: I.BUCKET });
  shaped(B.TOILET, 1, ['Q  ', 'QQQ', ' Q '], { Q });
  shaped(B.WASHER, 1, ['III', 'IGI', 'IBI'], { I: IR, G: GL, B: I.BUCKET });
  shaped(B.DESKTOP_PC, 1, ['GGG', 'GRG', 'III'], { G: GL, R: I.REDSTONE || B.WIRE, I: IR });
  shaped(B.GAME_CONSOLE, 1, ['IRI', 'III'], { I: IR, R: I.REDSTONE || B.WIRE });
}

// ---------------------------------------------------------------- textures ----
{
  const edge = (x, y) => x === 0 || y === 0 || x === TM || y === TM;
  gen('enamel', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [242, 244, 246], 0.97 + rng() * 0.03)), { smooth: 0.9, bump: 0.05 });
  gen('bath_tile', (d, rng) => fillTile(d, (x, y) => {
    const grout = x % 8 === 0 || y % 8 === 0;
    put(d, x, y, grout ? [176, 182, 186] : [226, 238, 242], grout ? 1 : 0.96 + rng() * 0.04 + ((x % 8 === 1 || y % 8 === 1) ? 0.03 : 0));
  }), { smooth: 0.85, bump: 0.3 });
  gen('bath_water', (d, rng) => fillTile(d, (x, y) => {
    const w = Math.sin(x * 0.5 + Math.sin(y * 0.4) * 2) * 0.5 + 0.5;
    put(d, x, y, [110 + w * 60, 186 + w * 30, 222 + w * 20], 0.95 + rng() * 0.05);
  }), { smooth: 0.95, bump: 0.1 });
  gen('shower_curtain', (d, rng) => fillTile(d, (x, y) => {
    const fold = Math.sin(x * 0.8) * 0.08 + 1, stripe = (Math.floor(x / 4) % 2) ? [236, 240, 244] : [110, 170, 214];
    put(d, x, y, stripe, fold * (0.96 + rng() * 0.04));
  }), { smooth: 0.2, bump: 0.5 });
  const washer = (on) => (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c = [236, 238, 240], f = 0.97 + rng() * 0.03;
    const r = Math.hypot(x - 15.5, y - 18.5);
    if (y <= 6) {
      c = [214, 218, 222];
      if (y >= 2 && y <= 4 && x >= 3 && x <= 11) { c = on ? [60, 220, 140] : [40, 50, 56]; if (on) ctx.emit[k] = 0.9; }
      if (Math.hypot(x - 23, y - 3) < 2.2) c = [150, 156, 164];
    } else if (r < 10.5 && r >= 8.6) { c = [168, 174, 182]; f = 1.02; }
    else if (r < 8.6) {
      if (on) {
        const a = Math.atan2(y - 18.5, x - 15.5), sw = Math.sin(a * 3 + r * 0.7) * 0.5 + 0.5;
        c = r > 4 && sw > 0.55 ? [236, 240, 250] : [70 + sw * 60, 130 + sw * 60, 200];
        if (r > 5 && Math.sin(a * 5 - r) > 0.8) c = [230, 110, 110];     // clothes going round
      } else c = [44, 54, 64];
      if (x - y > -2 && x - y < 1 && r < 7) f = 1.35;                        // glass shine
    }
    if (edge(x, y)) f *= 0.82;
    put(d, x, y, c, f);
  });
  gen('washer_front', washer(false), { smooth: 0.75, bump: 0.2 });
  gen('washer_front_on', washer(true), { smooth: 0.75, bump: 0.2 });
  gen('pc_screen', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c = [30 + y * 2, 90 + y * 3, 170 + y * 2];
    if (y >= 27) c = [22, 26, 36];                                             // taskbar
    if (y >= 28 && y <= 29 && x >= 2 && x <= 4) c = [60, 140, 255];
    for (const [ax, ay] of [[3, 3], [3, 9], [3, 15]]) if (x >= ax && x < ax + 4 && y >= ay && y < ay + 4) c = [[250, 210, 80], [110, 220, 140], [250, 120, 120]][(ay - 3) / 6];
    if (x >= 11 && x <= 28 && y >= 5 && y <= 22) {                            // a window
      c = y <= 7 ? [44, 50, 64] : [238, 240, 244];
      if (y > 9 && y < 21 && x > 12 && x < 27 && y % 3 === 0 && x < 27 - (y % 7)) c = [120, 130, 150];
    }
    put(d, x, y, c, 0.97 + rng() * 0.03);
    ctx.emit[k] = 0.7;
  }), { smooth: 0.95, bump: 0 });
  gen('keyboard', (d, rng) => fillTile(d, (x, y) => {
    const key = x % 3 !== 0 && y % 4 !== 0;
    put(d, x, y, key ? [70, 72, 78] : [26, 27, 30], 0.95 + rng() * 0.05);
  }), { smooth: 0.6, bump: 0.5 });
  gen('console_top', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    let c = [22, 22, 26], f = 0.95 + rng() * 0.05;
    if (x - y > 4 && x - y < 7) f = 1.6;
    if (Math.hypot(x - 26, y - 26) < 1.8) { c = [60, 240, 140]; ctx.emit[k] = 1; f = 1; }
    put(d, x, y, c, f);
  }), { smooth: 0.95, bump: 0.05 });
  // the TV while the console is on: a platform game with coins and a hero
  gen('tv_screen_game', (d, rng, ctx) => fillTile(d, (x, y, k) => {
    if (edge(x, y)) { put(d, x, y, [36, 36, 40]); return; }
    let c = [92 + y * 4, 148 + y * 3, 250];
    if (Math.hypot(x - 7, y - 7) < 3 || Math.hypot(x - 10, y - 6) < 3.5 || Math.hypot(x - 13, y - 7.5) < 2.6) c = [248, 250, 255];
    if (y >= 24) c = y === 24 ? [110, 200, 80] : ((x >> 2) + (y >> 2)) & 1 ? [170, 100, 50] : [150, 86, 42];
    if (y >= 15 && y <= 17 && x >= 17 && x <= 27) c = ((x >> 1) & 1) ? [200, 120, 60] : [180, 104, 50];
    for (const [cx, cy] of [[19, 12], [23, 12], [27, 12]]) if (Math.hypot(x - cx, y - cy) < 1.5) c = [255, 214, 60];
    if (x >= 8 && x <= 11 && y >= 18 && y <= 23) c = y <= 19 ? [220, 40, 40] : y <= 21 ? [250, 200, 160] : [40, 80, 200];
    if (y >= 2 && y <= 4 && x >= 2 && x <= 9) c = [255, 255, 255];
    put(d, x, y, c, 0.97 + rng() * 0.03);
    ctx.emit[k] = 0.85;
  }), { smooth: 0.95, bump: 0 });
  gen('pot_terracotta', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [182, 96, 58], (y % 10 === 0 ? 0.85 : 1) * (0.93 + rng() * 0.07))), { smooth: 0.2, bump: 0.4 });
  gen('plant_green', (d, rng) => fillTile(d, (x, y) => { const v = rng(); put(d, x, y, v < 0.3 ? [46, 110, 50] : v < 0.8 ? [66, 150, 64] : [110, 190, 90], 0.9 + rng() * 0.1); }), { smooth: 0.3, bump: 0.7 });
  [['book_red', [150, 40, 44]], ['book_green', [44, 110, 70]], ['book_blue', [44, 70, 140]]].forEach(([t, c]) => gen(t, (d, rng) => fillTile(d, (x, y) => {
    const band = y % 16 === 3 || y % 16 === 4 ? [214, 180, 90] : c;
    put(d, x, y, band, (x % 8 === 0 ? 0.82 : 1) * (0.94 + rng() * 0.06));
  }), { smooth: 0.3, bump: 0.3 }));
  gen('frame_gold', (d, rng) => fillTile(d, (x, y) => put(d, x, y, [196, 156, 70], (1 + Math.sin((x + y) * 0.9) * 0.1) * (0.92 + rng() * 0.08))), { smooth: 0.7, bump: 0.6 });
  // rugs: a medallion pattern in the middle, a banded border round the edge
  const RUG_RGB = [[[150, 36, 40], [226, 186, 110], [60, 24, 30]], [[36, 58, 118], [214, 196, 150], [22, 30, 64]], [[206, 184, 146], [150, 70, 50], [120, 96, 70]]];
  RUGS.forEach(([, , t], i) => {
    const [base, acc, dark] = RUG_RGB[i];
    gen(t, (d, rng) => fillTile(d, (x, y) => {
      const u = Math.abs(((x + 8) % 16) - 8), v = Math.abs(((y + 8) % 16) - 8);
      const m = u + v;
      const c = m === 6 || m === 7 ? acc : m < 3 ? dark : base;
      put(d, x, y, c, (((x + y) & 1) ? 1.03 : 0.97) * (0.95 + rng() * 0.05));
    }), { smooth: 0.05, bump: 0.8 });
    gen(t + '_border', (d, rng) => fillTile(d, (x, y) => {
      const c = ((x + y) >> 1) % 4 === 0 ? acc : dark;
      put(d, x, y, c, (((x + y) & 1) ? 1.03 : 0.97) * (0.95 + rng() * 0.05));
    }), { smooth: 0.05, bump: 0.8 });
  });
  // pictures
  gen('art_sea', (d, rng) => fillTile(d, (x, y) => {
    let c;
    if (y < 18) { const k = y / 18; c = [250 - k * 40, 150 + k * 40, 110 + k * 60].map((v, i) => v * (1 - k * 0.1) + (i === 2 ? k * 30 : 0)); }
    else { const k = (y - 18) / 14; c = [30 + (1 - k) * 60, 70 + (1 - k) * 60, 120 + (1 - k) * 60]; }
    if (Math.hypot(x - 16, y - 15) < 4.5 && y < 18) c = [255, 226, 140];
    if (y >= 18 && Math.abs(x - 16) < 5 - (y - 18) * 0.25 && (y % 2 === 0)) c = [255, 200, 120];
    if (y === 18) c = c.map((v) => v * 0.85);
    put(d, x, y, c, 0.95 + rng() * 0.07);
  }), { smooth: 0.3, bump: 0.5 });
  gen('art_city', (d, rng) => {
    const hs = []; for (let x = 0; x < TS; x++) hs.push(x % 5 === 0 ? 0 : 0);
    let h = 14; for (let x = 0; x < TS; x++) { if (x % 4 === 0) h = 8 + Math.floor(rng() * 14); hs[x] = h; }
    fillTile(d, (x, y) => {
      let c = [20 + y * 2, 24 + y * 2, 60 + y * 3];
      if (rng() < 0.01 && y < 14) c = [255, 255, 230];
      if (Math.hypot(x - 25, y - 6) < 2.5) c = [250, 246, 220];
      if (TS - y < hs[x] + 6) { c = [18, 20, 30]; if (x % 2 === 1 && y % 3 === 1 && rng() < 0.55) c = [255, 210, 110]; }
      put(d, x, y, c, 0.95 + rng() * 0.07);
    });
  }, { smooth: 0.3, bump: 0.5 });
  gen('art_flowers', (d, rng) => fillTile(d, (x, y) => {
    let c = [236, 226, 204];
    if (y >= 22 && x >= 11 && x <= 20) c = [60, 110, 150];
    if (y > 12 && y < 22 && (x === 13 || x === 16 || x === 19)) c = [70, 130, 60];
    for (const [cx, cy, col] of [[12, 10, [220, 60, 80]], [16, 8, [250, 200, 60]], [20, 11, [180, 90, 200]], [14, 14, [250, 140, 60]], [18, 14, [230, 70, 120]]]) {
      if (Math.hypot(x - cx, y - cy) < 2.6) c = col;
      if (Math.hypot(x - cx, y - cy) < 0.9) c = [255, 240, 150];
    }
    put(d, x, y, c, 0.93 + rng() * 0.09);
  }), { smooth: 0.3, bump: 0.6 });
  gen('art_abstract', (d, rng) => fillTile(d, (x, y) => {
    let c = [240, 236, 226];
    if (x < 13 && y < 14) c = [200, 36, 40];
    if (x > 22 && y > 20) c = [30, 60, 160];
    if (x > 18 && x < 23 && y < 8) c = [246, 200, 40];
    if (x === 13 || x === 14 || x === 22 || y === 14 || y === 15 || (y === 20 && x > 14) || (y === 8 && x > 14)) c = [20, 20, 22];
    put(d, x, y, c, 0.96 + rng() * 0.05);
  }), { smooth: 0.4, bump: 0.5 });
}
