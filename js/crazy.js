'use strict';
// CrazyGames edition (CG): the CrazyGames SDK v3 (loaded by the page build.js writes). Nothing here
// runs in the school edition. What it does:
// - loading start/stop, and gameplay start/stop whenever the game is actually being played
// - a mid-game ad only at natural breaks (respawning, back to the title screen), never more
//   than one every 3 minutes, the game muted and paused while it plays
// - rewarded ads the player chooses: keep your items when you die, or 100 free coins (phone)
// - happy time on achievements, the player's CrazyGames name as their online name
// - a banner beside the title menu (never in game), and the invite button for online servers
// Without the SDK (local tests, ad blockers) every call is a no-op and the game plays the same.

const Crazy = {
  sdk: null, ready: false, playing: null, lastAd: 0, adOn: false, banner: false, invite: null, deathKit: null, bonusAt: 0,

  async init() {
    if (!CG) return;
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    try { await S.init(); } catch (e) { console.warn('Blocklands: CrazyGames SDK', e); return; }
    this.sdk = S; this.ready = true;
    this.call(() => S.game.loadingStart());
    // the loading screen goes away when the world is ready
    const iv = setInterval(() => { const el = $('loading'); if (el && el.classList.contains('hidden')) { clearInterval(iv); this.call(() => S.game.loadingStop()); this.afterLoad(); } }, 300);
    setInterval(() => this.tick(), 500);
  },
  call(fn) { try { return fn(); } catch (e) { return undefined; } },

  async afterLoad() {
    const S = this.sdk;
    // their name for online play, unless the player already chose one
    try {
      const u = S.user && S.user.isUserAccountAvailable ? await S.user.getUser() : null;
      if (u && u.username && /^Player\d+$/.test(Net.name || '')) { Net.name = safeName(u.username); if (Net.saveProfile) Net.saveProfile(); }
    } catch (e) { /* guests */ }
    // CrazyGames' own mute button
    const applyMute = (st) => { this.muted = !!(st && st.muteAudio); if (!this.adOn) Sound.setVolume(this.muted ? 0 : (this.vol || Sound.volume || 0.7)); };
    this.vol = Sound.volume;
    this.call(() => applyMute(S.game.settings));
    this.call(() => S.game.addSettingsChangeListener((st) => applyMute(st)));
    // an invite (a friend's server)
    const room = this.call(() => S.game.getInviteParam('roomId'));
    if (room && normServerCode(room) && !Net.on) { Net.joinCode(room); refreshGameUI(); if (G.onTitle) $('tWorld').textContent = worldLabel(); }
  },

  // is the game being played right now?
  tick() {
    const vis = (id) => { const el = $(id); return el && !el.classList.contains('hidden'); };
    const on = !this.adOn && !!G.playing && !G.onTitle && !vis('menu') && !(G.stats && G.stats.dead);
    if (on !== this.playing) {
      this.playing = on;
      this.call(() => (on ? this.sdk.game.gameplayStart() : this.sdk.game.gameplayStop()));
    }
    // the banner beside the title menu
    const showBanner = G.onTitle && vis('title') && window.innerWidth >= 1000 && window.innerHeight >= 560;
    if (showBanner !== this.banner) {
      this.banner = showBanner;
      const el = $('cgBanner');
      if (el) el.classList.toggle('on', showBanner);
      if (showBanner) this.call(() => this.sdk.banner.requestResponsiveBanner('cgBanner'));
      else this.call(() => this.sdk.banner.clearAllBanners());
    }
    // the invite button while on a server
    const code = Net.on && Net.server ? Net.server.code : null;
    if (code !== this.invite) {
      this.invite = code;
      this.call(() => (code ? this.sdk.game.showInviteButton({ roomId: code }) : this.sdk.game.hideInviteButton()));
    }
  },

  // an ad: the game muted and paused while it plays; done(ok) afterwards
  ad(type, done) {
    if (!this.ready || this.adOn) { if (done) done(false); return; }
    this.adOn = true;
    const vol = Sound.volume;
    const wasPlaying = G.playing;
    if (document.pointerLockElement) document.exitPointerLock();
    G.playing = false;
    this.tick();
    let ended = false;
    const end = (ok) => {
      if (ended) return;
      ended = true;
      this.adOn = false;
      Sound.setVolume(this.muted ? 0 : vol);
      void wasPlaying;
      if (done) done(ok);
    };
    try {
      this.sdk.ad.requestAd(type, {
        adStarted: () => { Sound.setVolume(0); },
        adFinished: () => end(true),
        adError: () => end(false),
      });
    } catch (e) { end(false); }
  },
  // a mid-game ad at a natural break (at most one every 3 minutes, never in the first 2 minutes)
  breakAd(then) {
    const now = Date.now();
    if (!this.ready || now - this.lastAd < 180000 || now - (this.started || now) < 120000) { if (then) then(); return; }
    this.lastAd = now;
    this.ad('midgame', () => { if (then) then(); });
  },
  // a reward the player asked for
  rewarded(give) {
    if (!this.ready) { G.ui.toast('Ads are not available right now'); return; }
    this.ad('rewarded', (ok) => { if (ok) { this.lastAd = Date.now(); give(); } else G.ui.toast('The video did not finish: no reward this time'); });
  },
  happy() { if (this.ready) this.call(() => this.sdk.game.happytime()); },
};

// ---------------------------------------------------------------- hooks ----
if (CG) {
  Crazy.started = Date.now();
  // no Camp Nou in this edition; the credits in English
  { const b = $('tCampNou'); if (b) b.style.display = 'none'; }
  { const f = document.querySelector('#title .title-foot span'); if (f) f.innerHTML = 'Made by <b>Pau Bru</b>'; }
  {
    const r = $('creditsRoll');
    if (r) r.innerHTML = `<h1 class="logo">BLOCK<span>LANDS</span></h1><div class="by">Made by</div><div class="who">PAU BRU</div>
      <dl><dt>Idea, design and direction</dt><dd>Pau Bru</dd></dl>
      <dl><dt>The city</dt><dd>Blockton: skyscrapers, metro, buses, taxis, an airport, a mall and houses for sale</dd></dl>
      <dl><dt>Worlds and places</dt><dd>Paradise beach · Volcano · Oasis · Snowy peaks<br>Ancient forest · Red canyon · Archipelago · Flower meadow</dd></dl>
      <dl><dt>Graphics engine</dt><dd>Hand-made WebGL2: atmospheric sky, shadows,<br>water reflections, volumetric clouds, light shafts and bloom</dd></dl>
      <dl><dt>Art and sound</dt><dd>Textures, models, creatures and effects all generated by code.<br>Not a single external file.</dd></dl>
      <dl><dt>Multiplayer</dt><dd>Servers with a code to play with your friends</dd></dl>
      <div class="thanks">Thanks for playing!</div>`;
  }
  // the school's and the city's signs, without the real school
  {
    const plate = (g, W, H, bg, fg, lines) => {
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      g.textAlign = 'center'; g.fillStyle = fg;
      for (const [txt, font, y] of lines) { g.font = font; g.fillText(txt, W / 2, y); }
    };
    const crest = (g, x, y, r) => {
      g.save(); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
      g.fillStyle = '#1d4fa3'; g.fillRect(x - r, y - r, r * 2, r * 2);
      g.fillStyle = '#ffc23a'; g.beginPath(); g.moveTo(x - r, y + r * 0.2); for (let i = 0; i <= 6; i++) g.lineTo(x - r + i * r / 3, y + r * 0.2 - [0, 0.55, 0.25, 0.8, 0.35, 0.6, 0][i] * r); g.lineTo(x + r, y + r); g.lineTo(x - r, y + r); g.fill();
      g.restore();
      g.fillStyle = '#fff'; g.font = `900 ${r * 0.9}px Arial Black, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('B', x, y - r * 0.1); g.textBaseline = 'alphabetic';
    };
    Object.assign(PIC_BUILTIN, {
      stucom: { w: 4, h: 3, draw(g, W, H) {
        g.fillStyle = '#f7f7f5'; g.fillRect(0, 0, W, H);
        crest(g, W / 2, 110, 58);
        g.fillStyle = '#1d2a44'; g.textAlign = 'center'; g.font = '800 64px Arial, sans-serif'; g.fillText('BLOCKTON', W / 2, 238);
        g.font = '700 34px Arial, sans-serif'; g.fillStyle = '#1d4fa3'; g.fillText('HIGH SCHOOL', W / 2, 280);
        g.fillStyle = '#c9c9c9'; g.fillRect(40, 300, W - 80, 3);
        g.fillStyle = '#4a4a4e'; g.font = '500 24px Arial, sans-serif'; g.fillText('Science · Arts · Computing', W / 2, 340);
      } },
      plot: { w: 2, h: 2, draw(g, W, H) {
        g.fillStyle = '#f4efe2'; g.fillRect(0, 0, W, H);
        g.strokeStyle = '#8a6a3a'; g.lineWidth = 16; g.strokeRect(8, 8, W - 16, H - 16);
        g.fillStyle = '#2f6d3a'; g.textAlign = 'center'; g.font = '800 70px Arial, sans-serif'; g.fillText('FREE', W / 2, H * 0.36); g.fillText('PLOT', W / 2, H * 0.52);
        g.fillStyle = '#5a4a36'; g.font = '600 34px Arial, sans-serif'; g.fillText('For sale', W / 2, H * 0.7); g.fillText('build here!', W / 2, H * 0.82);
      } },
      campus: { w: 3, h: 2, draw(g, W, H) {
        g.fillStyle = '#f6f5f1'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#1d4fa3'; g.fillRect(0, 0, W, 18); g.fillStyle = '#ffc23a'; g.fillRect(0, H - 18, W, 18);
        crest(g, 70, 90, 40);
        g.fillStyle = '#1d2a44'; g.textAlign = 'left'; g.font = '800 52px Arial, sans-serif'; g.fillText('BLOCKTON', 124, 96);
        g.font = '600 24px Arial, sans-serif'; g.fillStyle = '#4a4a4e'; g.fillText('CITY CENTRE', 126, 126);
        g.textAlign = 'center'; g.font = '500 20px Arial, sans-serif'; g.fillStyle = '#6a6a70';
        g.fillText('Welcome · Bienvenidos · Bienvenue', W / 2, 176);
        g.fillText('High School · Library · Sports · Metro', W / 2, 206);
        g.fillText('Free plots to build on', W / 2, 236);
      } },
      annex: { w: 7, h: 2, draw(g, W, H) {
        g.fillStyle = '#1f2a44'; g.fillRect(0, 0, W, H); g.fillStyle = '#ffc23a'; g.fillRect(0, 0, 10, H);
        g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '800 44px Arial, sans-serif'; g.fillText('BLOCKTON HIGH', 34, 62);
        g.font = '500 19px Arial, sans-serif'; g.fillStyle = '#c9d3ea'; g.fillText('Library · Computer lab · Café', 34, 108);
      } },
      library: { w: 3, h: 2, draw(g, W, H) {
        g.fillStyle = '#2d5a3d'; g.fillRect(0, 0, W, H);
        for (let i = 0; i < 9; i++) { const x = 70 + i * 42, h = 90 + (i * 37) % 50; g.fillStyle = ['#e9d9b0', '#c85a4a', '#e0b050', '#6a8ec8', '#f2ead6'][i % 5]; g.fillRect(x, 190 - h, 30, h); }
        g.fillStyle = '#f2ead6'; g.textAlign = 'center'; g.font = '800 54px Georgia, serif'; g.fillText('LIBRARY', W / 2, 260);
        g.font = 'italic 24px Georgia, serif'; g.fillText('Quiet, please', W / 2, 300);
      } },
      computers: { w: 3, h: 1, draw(g, W, H) {
        g.fillStyle = '#0e1726'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#7fe3ff'; g.font = '700 38px ui-monospace, Consolas, monospace'; g.textAlign = 'center'; g.fillText('> COMPUTER_LAB', W / 2, H / 2 + 6);
        g.fillStyle = '#6ad08a'; g.font = '500 18px ui-monospace, Consolas, monospace'; g.fillText('code · games · web', W / 2, H - 22);
      } },
      gym: { w: 6, h: 1, draw(g, W, H) { plate(g, W, H, '#12161c', '#ffd24a', [['BLOCKTON SPORTS CENTRE', '800 40px Arial, sans-serif', 56]]); } },
      timetable: { w: 1, h: 1, draw(g, W, H) {
        g.fillStyle = '#f5f5f2'; g.fillRect(0, 0, W, H);
        g.fillStyle = '#d8322a'; g.fillRect(0, 0, W, 80);
        g.fillStyle = '#fff'; g.font = '800 46px Arial, sans-serif'; g.textAlign = 'center'; g.fillText('BLOCKTON', W / 2, 56);
        g.fillStyle = '#333'; g.font = '600 34px ui-monospace, Consolas, monospace'; g.textAlign = 'left';
        ['L1  City loop     2\'', 'L2  Ring road     4\'', 'M   Metro        1\'', 'N7  Night         ..'].forEach((t, i) => g.fillText(t, 26, 150 + i * 80));
      } },
    });
  }
  // the banner's box beside the title menu
  {
    const t = $('title'), el = document.createElement('div');
    el.id = 'cgBanner';
    if (t) t.append(el);
  }
  // respawning and leaving to the title are natural breaks
  const rb = $('respawnBtn');
  if (rb) rb.addEventListener('click', () => { Crazy.deathKit = null; Crazy.breakAd(); }, true);
  const st = showTitle;
  showTitle = function () { const was = G.started && !G.onTitle; st.apply(this, arguments); if (was) Crazy.breakAd(); };
  // dying: remember what dropped, so a rewarded ad can give it back
  const die = Stats.prototype.die;
  Stats.prototype.die = function (src) {
    const kit = !G.rules.keepInventory && G.mode === 'survival' ? { slots: G.inv.slots.map((s) => s && cloneStack(s)), armor: G.inv.armor.map((s) => s && cloneStack(s)), items: [] } : null;
    const spawn = Ents.spawnItem;
    if (kit) Ents.spawnItem = function () { const e = spawn.apply(this, arguments); if (e) kit.items.push(e); return e; };
    try { die.call(this, src); } finally { Ents.spawnItem = spawn; }
    Crazy.deathKit = kit && kit.items.length ? kit : null;
    const row = document.querySelector('#death .row');
    let b = $('cgKeepBtn');
    if (!b && row) { b = document.createElement('button'); b.id = 'cgKeepBtn'; b.className = 'cg-reward'; row.prepend(b); b.addEventListener('click', () => Crazy.keepItems()); }
    if (b) { b.innerHTML = '<span>▶</span> Watch an ad · keep your items'; b.classList.toggle('hidden', !Crazy.deathKit || !Crazy.ready); }
  };
  Crazy.keepItems = function () {
    const kit = this.deathKit;
    if (!kit) return;
    this.rewarded(() => {
      for (const e of kit.items) { e.removed = true; const i = Ents.items.indexOf(e); if (i >= 0) Ents.items.splice(i, 1); }
      kit.slots.forEach((s, i) => { G.inv.slots[i] = s; });
      kit.armor.forEach((s, i) => { G.inv.armor[i] = s; });
      this.deathKit = null;
      G.ui.invDirty();
      respawn();
      requestLock();
      G.ui.toast('🎒 Your items are back');
    });
  };
  // achievements are happy moments
  if (typeof Progress !== 'undefined' && Progress.unlock) {
    const un = Progress.unlock;
    Progress.unlock = function (k) { const pr = this.prog && this.prog(), had = pr && pr.ach && pr.ach[k]; const r = un.apply(this, arguments); if (!had) Crazy.happy(); return r; };
  }
  // the phone's Free coins app: a rewarded ad for 100 coins, every 5 minutes
  PC.add({ key: 'bonus', icon: '🎁', name: 'Free coins', run() {
    if (G.mode === 'creative') { G.ui.toast('Coins are unlimited in creative mode'); return; }
    const wait = Crazy.bonusAt - Date.now();
    if (wait > 0) { G.ui.toast('🎁 More free coins in ' + Math.ceil(wait / 60000) + ' min'); return; }
    Crazy.rewarded(() => { Crazy.bonusAt = Date.now() + 300000; G.money = (G.money || 0) + 100; sfx('shop_till', null, 0.8, 1); G.ui.toast('🎁 +100 coins!'); });
  } });
  Crazy.init();
}
