'use strict';
// Playing together like people: gestures (G opens the wheel: wave, clap, cheer, dance, sit,
// point, bow, facepalm) that everyone sees on your avatar, a menu on right-clicking another
// player (high five, hug, handshake, give them what you hold, wave) where they answer with the
// same gesture, speech bubbles over the head of whoever writes in the chat, and fights: hit
// another player with left click (weapon damage, enchantments, critical hits, knockback, armour)
// unless either of you has turned "Player fights" off. Messages travel over the "soc" action
// (WebRTC), the relay (relay.js) or the tabs channel.

const EMOTE_WHEEL = [
  { k: 'wave', name: 'Wave', icon: '👋', dur: 2.2 },
  { k: 'clap', name: 'Clap', icon: '👏', dur: 2.4 },
  { k: 'cheer', name: 'Cheer', icon: '🙌', dur: 2.2 },
  { k: 'dance', name: 'Dance', icon: '💃', dur: 0 },
  { k: 'sit', name: 'Sit down', icon: '🪑', dur: 0 },
  { k: 'point', name: 'Point', icon: '👉', dur: 2.4 },
  { k: 'bow', name: 'Bow', icon: '🙇', dur: 2 },
  { k: 'facepalm', name: 'Facepalm', icon: '🤦', dur: 2.2 },
];
const PLAYER_ACTIONS = [
  { k: 'hi5', name: 'High five', icon: '✋', dur: 1.5, touch: true, you: 'high-fives you', done: 'You high-five' },
  { k: 'hug', name: 'Hug', icon: '🤗', dur: 2.8, touch: true, you: 'hugs you', done: 'You hug' },
  { k: 'shake', name: 'Shake hands', icon: '🤝', dur: 2, touch: true, you: 'shakes your hand', done: 'You shake hands with' },
  { k: 'give', name: 'Give what I hold', icon: '🎁' },
  { k: 'wave', name: 'Wave', icon: '👋', dur: 2.2, you: 'waves at you', done: 'You wave at' },
];
const EMOTE_DUR = {};
for (const e of [...EMOTE_WHEEL, ...PLAYER_ACTIONS]) if (e.dur !== undefined) EMOTE_DUR[e.k] = e.dur;

// ramp a gesture in and out
function emoteEnv(k, t) {
  const d = EMOTE_DUR[k];
  const a = Math.min(1, t / 0.22);
  return d ? Math.max(0, Math.min(a, (d - t) / 0.25)) : a;
}
// Poses by part role (entity_render.js): return a transform, or null to keep the usual one.
// Model space: +z is forward, arms hang along -y from the shoulder.
const EMOTES = {
  wave: { pose(role, t) { const e = emoteEnv('wave', t); return role === 'armR' ? XF.rz(e * (2.6 + Math.sin(t * 9) * 0.35)) : null; } },
  clap: {
    pose(role, t) {
      if (role !== 'armL' && role !== 'armR') return null;
      const e = emoteEnv('clap', t), s = 0.5 + 0.5 * Math.sin(t * 13), l = role === 'armL' ? 1 : -1;
      return XF.mul(XF.ry(l * e * (0.2 + 0.42 * s)), XF.rx(-1.25 * e));
    },
  },
  cheer: {
    pose(role, t) { const e = emoteEnv('cheer', t); return role === 'armL' ? XF.mul(XF.rz(-0.35 * e), XF.rx(-2.9 * e)) : role === 'armR' ? XF.mul(XF.rz(0.35 * e), XF.rx(-2.9 * e)) : null; },
    body(t) { return { dy: Math.abs(Math.sin(t * 7)) * 0.2 * emoteEnv('cheer', t) }; },
  },
  dance: {
    pose(role, t, sw) {
      const e = emoteEnv('dance', t), s = Math.sin(t * 7);
      if (role === 'armL') return XF.mul(XF.rz(-0.3 * e), XF.rx(-e * (1.4 + 1.3 * s)));
      if (role === 'armR') return XF.mul(XF.rz(0.3 * e), XF.rx(-e * (1.4 - 1.3 * s)));
      if (role === 'legA') return XF.rx(sw * 0.9 + s * 0.45 * e);
      if (role === 'legB') return XF.rx(-sw * 0.9 - s * 0.45 * e);
      if (role === 'head') return XF.rz(Math.sin(t * 3.5) * 0.25 * e);
      return null;
    },
    body(t) { const e = emoteEnv('dance', t); return { dy: Math.abs(Math.sin(t * 7)) * 0.12 * e, yaw: Math.sin(t * 3.5) * 0.6 * e }; },
  },
  sit: {
    pose(role, t) {
      const e = emoteEnv('sit', t);
      if (role === 'legA') return XF.mul(XF.rx(-1.45 * e), XF.rz(0.1 * e));
      if (role === 'legB') return XF.mul(XF.rx(-1.45 * e), XF.rz(-0.1 * e));
      if (role === 'armL' || role === 'armR') return XF.rx(-0.45 * e);
      return null;
    },
    body(t) { return { dy: -0.66 * emoteEnv('sit', t) }; },
  },
  point: { pose(role, t) { const e = emoteEnv('point', t); return role === 'armR' ? XF.mul(XF.ry(-0.12 * e), XF.rx(-1.57 * e)) : null; } },
  bow: {
    pose(role, t) { const e = emoteEnv('bow', t); return role === 'armL' || role === 'armR' ? XF.rx(0.25 * e) : null; },
    body(t) { return { tilt: 0.85 * emoteEnv('bow', t) }; },
  },
  facepalm: {
    pose(role, t) {
      const e = emoteEnv('facepalm', t);
      if (role === 'armR') return XF.mul(XF.ry(-0.55 * e), XF.rx(-2.45 * e));
      if (role === 'head') return XF.mul(XF.rx(0.35 * e), XF.ry(Math.sin(t * 5) * 0.2 * e));
      return null;
    },
  },
  hi5: { pose(role, t) { const e = emoteEnv('hi5', t); return role === 'armR' ? XF.mul(XF.rz(0.25 * e), XF.rx(-2.35 * e)) : null; } },
  hug: {
    pose(role, t) {
      const e = emoteEnv('hug', t);
      if (role === 'armL') return XF.mul(XF.ry(0.62 * e), XF.rx(-1.45 * e));
      if (role === 'armR') return XF.mul(XF.ry(-0.62 * e), XF.rx(-1.45 * e));
      return null;
    },
    body(t) { return { tilt: 0.14 * emoteEnv('hug', t) }; },
  },
  shake: { pose(role, t) { const e = emoteEnv('shake', t); return role === 'armR' ? XF.mul(XF.ry(-0.25 * e), XF.rx(-e * (1.05 + Math.sin(t * 13) * 0.18))) : null; } },
};
const EMOTE_KEYS = Object.keys(EMOTES);

const Social = {
  emote: null,        // your gesture: { k, t, face?, partner? }
  viewSet: false,     // the camera was turned to show it
  menu: null, menuKind: null, menuPeer: null, hint: null,

  // ---------------------------------------------------------------- gestures ----
  play(k, partner) {
    if (!EMOTES[k] || G.stats.dead) return;
    this.emote = { k, t: 0, partner: partner || null };
    if (partner) this.facePartner();
    if (!G.view && !G.vehicle) { G.view = 2; this.viewSet = true; }
    if (k === 'clap' || k === 'hi5') this.claps(k === 'hi5' ? [0.55] : [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75]);
    Net.sendT = 0;
  },
  stop() {
    this.emote = null;
    if (this.viewSet && G.view === 2) G.view = 0;
    this.viewSet = false;
    Net.sendT = 0;
  },
  claps(times) { for (const t of times) setTimeout(() => sfx('clap', G.player.pos, 0.8, rand(0.95, 1.1)), t * 1000); },
  facePartner() {
    const e = this.emote, r = e && e.partner && Net.peers.get(e.partner);
    if (!r) return;
    const p = G.player.pos;
    e.face = Math.atan2(-(r.pos[0] - p[0]), -(r.pos[2] - p[2])) + Math.PI;
  },

  update(dt) {
    const e = this.emote;
    if (e) {
      e.t += dt;
      const d = EMOTE_DUR[e.k];
      const k = G.input && G.input.keys;
      const moving = k && ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space'].some((c) => k.has(c));
      if ((d && e.t >= d) || (!d && moving && e.t > 0.3) || G.vehicle || G.stats.dead) this.stop();
      else if (e.partner) this.facePartner();
    }
    // remote gestures run on by themselves between presence updates; hit flashes fade
    for (const r of Net.peers.values()) {
      if (r.emote) { r.emote.t += dt; const d2 = EMOTE_DUR[r.emote.k]; if (d2 && r.emote.t > d2 + 0.5) r.emote = null; }
      if (r.mob.hurtTime > 0) r.mob.hurtTime -= dt;
    }
    this.updateHint();
  },

  // ---------------------------------------------------------------- menus ----
  openWheel() { this.openMenu('wheel', null); },
  openMenu(kind, peer) {
    this.closeMenu();
    const items = kind === 'wheel' ? EMOTE_WHEEL : PLAYER_ACTIONS;
    const box = document.createElement('div');
    box.id = 'socialMenu';
    box.className = kind === 'wheel' ? 'wheel' : 'pmenu';
    const r = peer && Net.peers.get(peer);
    const head = document.createElement('div');
    head.className = 'sm-head';
    head.textContent = kind === 'wheel' ? 'Gestures' : (r ? r.name : 'Player');
    box.append(head);
    items.forEach((it, i) => {
      const b = document.createElement('button');
      b.className = 'sm-opt';
      b.style.setProperty('--a', (i / items.length * 360 - 90) + 'deg');
      b.innerHTML = '<i></i><span></span><kbd></kbd>';
      b.querySelector('i').textContent = it.icon;
      b.querySelector('span').textContent = it.name;
      b.querySelector('kbd').textContent = i + 1;
      b.addEventListener('click', (ev) => { ev.stopPropagation(); this.choose(i); });
      box.append(b);
    });
    const foot = document.createElement('div');
    foot.className = 'sm-foot';
    foot.textContent = 'Press 1–' + items.length + ' · Esc to close';
    box.append(foot);
    $('hud').append(box);
    this.menu = box; this.menuKind = kind; this.menuPeer = peer;
    sfx('click', null, 0.8, 1.3);
  },
  closeMenu() { if (this.menu) this.menu.remove(); this.menu = null; this.menuKind = null; this.menuPeer = null; },
  choose(i) {
    const kind = this.menuKind, peer = this.menuPeer;
    this.closeMenu();
    if (kind === 'wheel') { const it = EMOTE_WHEEL[i]; if (it) this.play(it.k); return; }
    const it = PLAYER_ACTIONS[i], r = peer && Net.peers.get(peer);
    if (!it || !r) return;
    const d = Math.hypot(r.pos[0] - G.player.pos[0], r.pos[2] - G.player.pos[2]);
    if (it.k === 'give') { this.give(peer, r); return; }
    if (it.touch && (d > 3.2 || Math.abs(r.pos[1] - G.player.pos[1]) > 1.5)) { G.ui.toast('Get closer to ' + r.name); return; }
    this.play(it.k, peer);
    Net.sendSoc(peer, { k: 'act', a: it.k });
    G.ui.toast(it.icon + ' ' + it.done + ' ' + r.name);
    if (it.k === 'hug') this.hearts(G.player.pos);
  },

  give(peer, r) {
    const s = G.inv.held;
    if (!s) { G.ui.toast('Hold something to give it'); return; }
    if (Math.hypot(r.pos[0] - G.player.pos[0], r.pos[2] - G.player.pos[2]) > 6) { G.ui.toast('Get closer to ' + r.name); return; }
    const stack = cloneStack(s);
    Net.sendSoc(peer, { k: 'give', s: stack });
    if (G.mode === 'survival') { G.inv.held = null; G.ui.invDirty(); }
    this.play('point', peer);
    sfx('pop', null, 1, 1.1);
    G.ui.toast('🎁 You gave ' + r.name + ' ' + (stack.count > 1 ? stack.count + '× ' : '') + ITEM_DEF[stack.id].name);
  },

  hearts(pos) {
    for (let i = 0; i < 8; i++) Particles.add(Particles.base(pos[0] + rand(-0.5, 0.5), pos[1] + 1.9 + rand(0, 0.4), pos[2] + rand(-0.5, 0.5), {
      vy: rand(0.5, 1.2), life: 1.2, max: 1.2, size: 0.13, layer: T.p_crit, r: 1, g: 0.3, b: 0.45, glow: true, drag: 0.95, collide: false, shrink: true }));
  },

  // ---------------------------------------------------------------- fights ----
  attack(r) {
    const p = G.player, held = G.inv.held;
    const d = held && ITEM_DEF[held.id];
    Act.swingHand();
    if (r.pv === false) { G.ui.toast(r.name + ' has player fights turned off'); return; }
    let dmg = d && d.damage ? d.damage : 1;
    dmg += heldEnch('sharpness') * 1.25 + (hasEffect('strength') ? 3 : 0);
    const crit = !p.onGround && p.vel[1] < -0.5 && !p.inWater && !p.onLadder;
    if (crit) { dmg *= 1.5; Particles.crit(r.pos[0], r.pos[1] + 1.3, r.pos[2]); sfx('crit', r.pos, 0.8, 1); }
    const knock = (p.sprinting ? 1.6 : 1) + heldEnch('knockback') * 0.8;
    const e = p.eyePos();
    Net.sendSoc(r.peer, { k: 'hit', a: Math.round(dmg * 10) / 10, f: [e[0], e[1], e[2]].map(r1), kn: knock });
    r.mob.hurtTime = 0.3;
    sfx('hit', r.pos, 0.7, rand(0.9, 1.1));
    G.stats.addExhaustion(0.1);
    if (held && d && d.tool && G.mode === 'survival') { if (G.inv.damageHeld(d.tool === TOOL_SWORD ? 1 : 2)) sfx('tool_break', null, 0.8, 1); G.ui.invDirty(); }
    if (p.sprinting) p.sprinting = false;
  },

  // ---------------------------------------------------------------- incoming ----
  receive(d, from) {
    if (!d || typeof d.k !== 'string' || !Net.on) return;
    const r = Net.peers.get(from);
    const name = r ? r.name : 'Someone';
    if (d.k === 'hit') {
      const a = Number(d.a);
      if (!Number.isFinite(a) || a <= 0 || G.stats.dead) return;
      if (!G.settings.pvp) { Net.sendSoc(from, { k: 'nopvp' }); return; }
      if (G.mode !== 'survival') return;
      if (r && Math.hypot(r.pos[0] - G.player.pos[0], r.pos[2] - G.player.pos[2]) > 8) return;   // too far to reach
      const f = Array.isArray(d.f) && d.f.length === 3 && d.f.every(Number.isFinite) ? d.f : null;
      const dealt = G.stats.damage(Math.min(a, 30), { type: 'player', name, from: f });
      const kn = clamp(Number(d.kn) || 1, 1, 4);
      if (dealt && f && kn > 1) {
        const p = G.player, dx = p.pos[0] - f[0], dz = p.pos[2] - f[2], l = Math.hypot(dx, dz) || 1;
        p.vel[0] += dx / l * 3 * (kn - 1); p.vel[2] += dz / l * 3 * (kn - 1);
      }
      if (G.stats.dead) Net.say('was knocked out by ' + name + ' ⚔');
      return;
    }
    if (d.k === 'nopvp') { G.ui.toast(name + ' has player fights turned off'); return; }
    if (d.k === 'act' && EMOTES[d.a]) {
      const it = PLAYER_ACTIONS.find((x) => x.k === d.a);
      if (!this.emote || !EMOTE_DUR[this.emote.k]) this.play(d.a, from);
      if (it) G.ui.toast(it.icon + ' ' + name + ' ' + it.you);
      if (d.a === 'hug') this.hearts(G.player.pos);
      sfx('chime', null, 0.5, 1.4);
      return;
    }
    if (d.k === 'give' && d.s && isItem(d.s.id)) {
      const s = mkStack(d.s.id, clamp(d.s.count | 0, 1, maxStack(d.s.id)), Math.max(0, d.s.dmg | 0));
      if (d.s.ench && typeof d.s.ench === 'object') s.ench = Object.fromEntries(Object.entries(d.s.ench).filter(([, v]) => Number.isInteger(v) && v > 0 && v < 10).slice(0, 8));
      const left = G.inv.add(s);
      if (left > 0) Ents.spawnItem(Object.assign(cloneStack(s), { count: left }), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]);
      G.ui.invDirty();
      sfx('pop', null, 1, 1.3);
      G.ui.toast('🎁 ' + name + ' gave you ' + (s.count > 1 ? s.count + '× ' : '') + ITEM_DEF[s.id].name, 3500);
    }
  },

  // ---------------------------------------------------------------- aiming at players ----
  // nearest remote player along the look ray (their body box)
  pickPlayer(o, dir, maxD) {
    let best = null, bd = maxD;
    for (const r of Net.peers.values()) {
      if (r.jet || r.ride || (typeof Passengers !== 'undefined' && Passengers.seatOf(r))) continue;
      const lo = [r.pos[0] - 0.4, r.pos[1], r.pos[2] - 0.4], hi = [r.pos[0] + 0.4, r.pos[1] + 1.9, r.pos[2] + 0.4];
      let t0 = 0, t1 = bd, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        if (Math.abs(dir[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) ok = false; continue; }
        let a = (lo[k] - o[k]) / dir[k], b = (hi[k] - o[k]) / dir[k];
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b);
        if (t0 > t1) ok = false;
      }
      if (ok && t0 < bd) { bd = t0; best = r; }
    }
    return best ? { player: best, dist: bd } : null;
  },

  updateHint() {
    const t = Act.target, r = t && t.player;
    if (!r || G.hudHidden || this.menu) { if (this.hint) this.hint.classList.remove('show'); return; }
    if (!this.hint) { this.hint = document.createElement('div'); this.hint.id = 'playerHint'; $('hud').append(this.hint); }
    const txt = r.name + ' · right-click to interact' + (r.pv !== false && G.settings.pvp ? ' · left-click to hit' : '');
    if (this.hint.textContent !== txt) this.hint.textContent = txt;
    this.hint.classList.add('show');
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const pick = Act.pick;
  Act.pick = function () {
    const res = pick.call(this);
    if (!Net.on || !Net.peers.size) return res;
    const p = G.player;
    const d = res ? (res.block ? res.block.dist : res.dist) : Infinity;
    const pl = Social.pickPlayer(p.eyePos(), p.lookDir(), Math.min(this.mobReach() + 0.4, d === undefined ? Infinity : d));
    return pl || res;
  };
  const mining = Act.updateMining;
  Act.updateMining = function (dt, now) {
    const t = this.target;
    if (t && t.player) {
      this.mine.pos = null; this.mine.progress = 0;
      if (this.attackCd > 0) this.attackCd -= dt;
      if (G.mouse.left && !G.screenOpen && !G.stats.dead && this.attackCd <= 0) { Social.attack(t.player); this.attackCd = 0.45; }
      return;
    }
    return mining.call(this, dt, now);
  };
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (t && t.player) { if (initial) Social.openMenu('player', t.player.peer); return initial; }
    return use.call(this, initial);
  };
  // presence: the gesture, health and whether you fight
  const pd = Net.presenceData;
  Net.presenceData = function () {
    const d = pd.call(this);
    const e = Social.emote;
    if (e) d.em = [EMOTE_KEYS.indexOf(e.k), Math.round(e.t * 10), e.partner || 0];
    d.pv = G.settings.pvp ? 1 : 0;
    if (G.mode === 'survival') d.hl = Math.round(G.stats.health);
    return d;
  };
  const onp = Net.onPresence;
  Net.onPresence = function (peer, pr) {
    onp.call(this, peer, pr);
    const r = this.peers.get(peer);
    if (!r || !pr) return;
    r.pv = pr.pv !== 0;
    r.hl = Number.isFinite(pr.hl) ? clamp(pr.hl, 0, 20) : null;
    const em = Array.isArray(pr.em) ? pr.em : null;
    const k = em && EMOTE_KEYS[em[0]];
    if (!k) r.emote = null;
    else if (!r.emote || r.emote.k !== k || Math.abs(r.emote.t - em[1] / 10) > 0.6) r.emote = { k, t: (Number(em[1]) || 0) / 10, partner: typeof em[2] === 'string' ? em[2] : null };
  };
  // chat lines show as a bubble over the speaker
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'c' && typeof o[2] === 'string') { r.say = o[2].slice(0, 120); r.sayT = performance.now(); }
    return ap.call(this, r, o);
  };
  const tags = Net.drawTags;
  Net.drawTags = function () {
    tags.call(this);
    const now = performance.now();
    for (const r of this.peers.values()) {
      if (!r.tag) continue;
      const say = r.say && now - r.sayT < 7000 ? r.say : '';
      if ((r.tag.dataset.say || '') !== say) { if (say) r.tag.dataset.say = say; else delete r.tag.dataset.say; }
      const hp = r.hl !== null && r.hl !== undefined && r.hl < 20 ? String(Math.ceil(r.hl / 2)) : '';
      if ((r.tag.dataset.hp || '') !== hp) { if (hp) r.tag.dataset.hp = hp; else delete r.tag.dataset.hp; }
    }
  };
  // the teachers say hello the first time you talk to them
  const ot = UI.openTrade;
  UI.openTrade = function (m) {
    if (m && m.hi && !m.greeted) { m.greeted = true; G.ui.toast('💬 ' + m.name + ': ' + m.hi, 5000); sfx('villager_yes', m.pos, 0.9, 1.05); }
    return ot.apply(this, arguments);
  };
  // keys: G for the gesture wheel, digits to choose while a menu is open
  window.addEventListener('keydown', (e) => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA');
    if (Social.menu) {
      const n = /^Digit([1-9])$/.exec(e.code);
      if (n) { e.preventDefault(); e.stopImmediatePropagation(); Social.choose(Number(n[1]) - 1); return; }
      if (e.code === 'Escape' || e.code === 'KeyG') { e.preventDefault(); e.stopImmediatePropagation(); Social.closeMenu(); }
      return;
    }
    if (e.code !== 'KeyG' || typing || e.repeat || !G.playing || G.screenOpen || G.vehicle || G.stats.dead) return;
    if ((typeof Progress !== 'undefined' && Progress.open) || (typeof WorldMap !== 'undefined' && WorldMap.open)) return;
    e.preventDefault();
    if (Social.emote && !EMOTE_DUR[Social.emote.k]) { Social.stop(); return; }
    Social.openWheel();
  }, true);
}

SYNTH.clap = (ctx, o, t, p) => {
  Sound.noise(ctx, o, t, 0.07, { type: 'bandpass', freq: 1500 * p, q: 1.2, gain: 0.5, attack: 0.002 });
  Sound.noise(ctx, o, t + 0.005, 0.12, { type: 'highpass', freq: 3000, gain: 0.12 });
};
