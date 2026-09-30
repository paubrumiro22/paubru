'use strict';
// CrazyGames edition (CG): the CrazyGames SDK v3 (loaded by the page build.js writes). Nothing here
// runs in the school edition. What it does:
// - loading start/stop, and gameplay start/stop whenever the game is actually being played
// - a mid-game ad only at natural breaks (respawning, back to the title screen), never more
//   than one every 3 minutes, the game muted and paused while it plays
// - rewarded ads the player chooses (ads.js: revive where you died, free coins) go through
//   Crazy.rewarded
// - happy time on achievements, the player's CrazyGames name as their online name
// - a banner beside the title menu (never in game), and the invite button for online servers
// Without the SDK (local tests, ad blockers) every call is a no-op and the game plays the same.

const Crazy = {
  sdk: null, ready: false, playing: null, lastAd: 0, adOn: false, banner: false, invite: null, deathKit: null, bonusAt: 0,

  // before the game starts (main.js boot): the SDK up (or given up on after a few seconds)
  beforeBoot() {
    if (!this.initP) this.initP = this.init();
    return Promise.race([this.initP, new Promise((r) => setTimeout(r, 6000))]);
  },
  async init() {
    if (!CG) return;
    const S = window.CrazyGames && window.CrazyGames.SDK;
    if (!S) return;
    try { await S.init(); } catch (e) { console.warn('Blocklands: CrazyGames SDK', e); return; }
    this.sdk = S; this.ready = true;
    this.cloudOn = !!S.data;
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
    // an invite (a friend's server), or an instant multiplayer start (a party leader opens a
    // server straight away and invites the party)
    const room = this.call(() => S.game.getInviteParam('roomId'));
    if (room && normServerCode(room) && !Net.on) { Net.joinCode(room); refreshGameUI(); if (G.onTitle) $('tWorld').textContent = worldLabel(); }
    else if (this.call(() => S.game.isInstantMultiplayer) && !Net.on && Net.available !== false) {
      Net.createServer(safeName(Net.name) + '\'s city', 'survival');
      refreshGameUI();
      if (G.onTitle) $('tWorld').textContent = worldLabel();
      G.ui.toast('👫 Your server is ready: press Play and invite your friends', 5000);
    }
  },

  // ---- saves in the CrazyGames cloud (the Data Module) ----
  // Every blocklands.* key is kept there gzipped (base64) as 'bl:' + key, with 'bl:meta' holding
  // when each was written; at start the newer copy wins (another device, or a cleared browser).
  // The cloud is small, so very big worlds stay only on this device.
  CLOUD_MAX: 450000, CLOUD_TOTAL: 950000,
  cloudT() { try { return JSON.parse(localStorage.getItem('blocklands.cloudt') || '{}'); } catch (e) { return {}; } },
  setCloudT(t) { try { localStorage.setItem('blocklands.cloudt', JSON.stringify(t)); } catch (e) { /* full */ } },
  meta() { try { return JSON.parse(this.sdk.data.getItem('bl:meta') || '{}') || {}; } catch (e) { return {}; } },
  async b64zip(str) { const buf = new Uint8Array(await Saves.zip(str)); let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000)); return btoa(s); },
  async unb64(b64) { const s = atob(b64), buf = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) buf[i] = s.charCodeAt(i); return Saves.unzip(buf.buffer); },
  async pull() {
    if (!this.cloudOn) return;
    try {
      const meta = this.meta(), local = this.cloudT();
      this.pulling = true;
      for (const [k, t] of Object.entries(meta)) {
        if (!k.startsWith('blocklands.') || (local[k] || 0) >= t) continue;
        const b64 = this.sdk.data.getItem('bl:' + k);
        if (!b64) continue;
        try { storageSet(k, JSON.parse(await this.unb64(b64))); local[k] = t; } catch (e) { /* damaged: keep the local one */ }
      }
      this.setCloudT(local);
    } catch (e) { console.warn('Blocklands: cloud pull', e); } finally { this.pulling = false; }
  },
  queue: new Set(), pushT: 0,
  wrote(key) {
    if (!this.cloudOn || this.pulling || !key.startsWith('blocklands.') || key === 'blocklands.cloudt') return;
    this.queue.add(key);
    clearTimeout(this.pushT);
    this.pushT = setTimeout(() => this.push(), 4000);
  },
  async push() {
    const keys = [...this.queue];
    this.queue.clear();
    try {
      const meta = this.meta(), local = this.cloudT(), sizes = this.sizes || (this.sizes = {});
      for (const k of keys) {
        const v = storageGet(k);
        if (v === null || v === undefined) { this.sdk.data.removeItem('bl:' + k); delete meta[k]; continue; }
        const b64 = await this.b64zip(JSON.stringify(v));
        const others = Object.entries(sizes).reduce((a, [kk, n]) => a + (kk === k ? 0 : n), 0);
        if (b64.length > this.CLOUD_MAX || others + b64.length > this.CLOUD_TOTAL) continue;
        this.sdk.data.setItem('bl:' + k, b64);
        sizes[k] = b64.length;
        meta[k] = local[k] = Date.now();
      }
      this.sdk.data.setItem('bl:meta', JSON.stringify(meta));
      this.setCloudT(local);
    } catch (e) { console.warn('Blocklands: cloud push', e); }
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
    // the invite button and link while on a server
    const code = Net.on && Net.server ? Net.server.code : null;
    if (code !== this.invite) {
      this.invite = code;
      this.call(() => (code ? this.sdk.game.showInviteButton({ roomId: code }) : this.sdk.game.hideInviteButton()));
      if (code) this.call(() => Promise.resolve(this.sdk.game.inviteLink({ roomId: code })).then((u) => { this.link = u; }).catch(() => {}));
    }
    this.chatOff = !!this.call(() => this.sdk.game.settings.disableChat);
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
  if (rb) rb.addEventListener('click', () => { if (typeof Ads !== 'undefined') Ads.deathKit = null; Crazy.breakAd(); }, true);
  const st = showTitle;
  showTitle = function () { const was = G.started && !G.onTitle; st.apply(this, arguments); if (was) Crazy.breakAd(); };
  // achievements are happy moments
  if (typeof Progress !== 'undefined' && Progress.unlock) {
    const un = Progress.unlock;
    Progress.unlock = function (k) { const pr = this.prog && this.prog(), had = pr && pr.ach && pr.ach[k]; const r = un.apply(this, arguments); if (!had) Crazy.happy(); return r; };
  }
  // the chat: bad words masked (their players are often young), off when CrazyGames says so
  const BAD = ['fuck', 'fck', 'fuk', 'shit', 'bitch', 'cunt', 'dick', 'cock', 'pussy', 'asshole', 'bastard', 'slut', 'whore', 'fag', 'faggot', 'nigga', 'nigger', 'retard', 'rape', 'porn', 'sex', 'nazi', 'hitler',
    'puta', 'puto', 'mierda', 'joder', 'coño', 'cabron', 'cabrón', 'gilipollas', 'maricon', 'maricón', 'polla', 'zorra', 'pendejo', 'verga', 'culero', 'follar',
    'merda', 'collons', 'fill de puta', 'cony', 'putain', 'merde', 'connard', 'salope', 'scheisse', 'arschloch', 'hure', 'cazzo', 'stronzo', 'caralho', 'porra'];
  const norm = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[0@]/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
  // short words only on their own (so "Essex" or "Dickens" stay as they are)
  const RE = new RegExp('(' + BAD.map((w) => { const n = norm(w), body = n.split('').map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\W_]*'); return n.length <= 4 ? '(?<![a-z])' + body + '(?![a-z])' : body; }).join('|') + ')', 'gi');
  Crazy.clean = (text) => {
    const t = String(text), n = norm(t);
    if (n.length !== t.length) return RE.test(n) ? n.replace(RE, (m) => '*'.repeat(m.length)) : t;
    let out = t, m;
    RE.lastIndex = 0;
    while ((m = RE.exec(n))) out = out.slice(0, m.index) + '*'.repeat(m[0].length) + out.slice(m.index + m[0].length);
    return out;
  };
  const add = Net.addChat;
  Net.addChat = function (name, color, text) {
    if (Crazy.chatOff && name !== this.name) return;
    return add.call(this, Crazy.clean(name), color, Crazy.clean(text));
  };
  const oc = Net.openChat;
  Net.openChat = function () { if (Crazy.chatOff) { G.ui.toast('Chat is turned off'); return; } return oc.apply(this, arguments); };

  // every save also goes to the cloud; invite links are CrazyGames links
  const ss = storageSet;
  storageSet = function (key, value) { const r = ss(key, value); Crazy.wrote(key); return r; };
  const sl = serverLink;
  serverLink = function (code) { const u = Crazy.ready ? Crazy.call(() => Crazy.sdk.game.inviteLink({ roomId: code })) : null; return u || sl(code); };
  Crazy.beforeBoot();
}
