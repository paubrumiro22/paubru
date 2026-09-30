'use strict';
// Rewarded ads, only ever when the player asks for one:
// - dying: "Watch an ad · revive here" gives back the inventory and the coins and puts you on
//   your feet where you fell (or the last safe ground before it), with 5 s of protection;
// - coins: +150 every 3 minutes from the Free coins app, a button by the coins, or an offer when
//   a till or an app says you are short (at most every 2 minutes).
// The video comes from CrazyGames in that edition (crazy.js), and from AppLixir in the normal one
// once ADS_CONFIG has a key; without one, Monetag's Direct Link (a new tab, rewarded when you come back). The script is loaded the first
// time an ad is needed; AppLixir's older (invokeApplixirVideoUnit) and newer
// (initializeAndOpenPlayer) players are both handled.

const ADS_CONFIG = {
  applixir: {
    apiKey: '',        // newer AppLixir dashboards: the game's API key
    zoneId: '', accountId: '', gameId: '',   // older dashboards: zone, account and game ids
    sdk: 'https://cdn.applixir.com/applixir.app.v6.0.1.js',
    sdkOld: 'https://cdn.applixir.com/applixir.sdk3.0m.js',
  },
  // Monetag Direct Link: the ad opens in a new tab; the reward comes when you are back after a while
  directLink: 'https://omg10.com/4/11930130', directSeconds: 12,
  coins: 150, coinWait: 180000, offerWait: 120000,
};

const Ads = {
  deathKit: null, safe: null, shield: 0, bonusAt: 0, offerAt: 0, busy: false, loaded: null,
  provider() {
    if (CG) return typeof Crazy !== 'undefined' && Crazy.ready ? 'crazy' : null;
    const A = ADS_CONFIG.applixir;
    if (A.apiKey || (A.zoneId && A.accountId)) return 'applixir';
    return ADS_CONFIG.directLink ? 'direct' : null;
  },
  ready() { return !!this.provider(); },
  load(src) {
    if (!this.loaded) this.loaded = new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = () => { this.loaded = null; no(new Error('ad script')); }; document.head.append(s); });
    return this.loaded;
  },
  // one rewarded video; give() only when it was watched to the end
  rewarded(give) {
    const p = this.provider();
    if (!p) { G.ui.toast('Ads are not available right now'); return; }
    if (p === 'crazy') { Crazy.rewarded(give); return; }
    if (p === 'direct') { this.direct(give); return; }
    if (this.busy) return;
    this.busy = true;
    if (document.pointerLockElement) document.exitPointerLock();
    const vol = Sound.volume, was = G.playing;
    G.playing = false;
    Sound.setVolume(0);
    let done = false;
    const end = (ok, why) => {
      if (done) return;
      done = true; this.busy = false;
      Sound.setVolume(vol);
      const box = $('applixir-ad-container'); if (box) box.classList.remove('on');
      void was;
      if (ok) give(); else G.ui.toast(why || 'The video did not finish: no reward this time');
    };
    const A = ADS_CONFIG.applixir;
    let box = $('applixir-ad-container');
    if (!box) { box = document.createElement('div'); box.id = 'applixir-ad-container'; document.body.append(box); }
    box.classList.add('on');
    const good = (t) => /complete|watched|rewarded|allAdsCompleted/i.test(String(t || ''));
    const bad = (t) => /interrupt|skip|block|error|fail|no-?zone|cors|close|timeout|no.?fill/i.test(String(t || ''));
    const blocked = 'No video right now (an ad blocker?). Try again later';
    if (A.apiKey) {
      this.load(A.sdk).then(() => {
        if (typeof window.initializeAndOpenPlayer !== 'function') { end(false, blocked); return; }
        window.initializeAndOpenPlayer({
          apiKey: A.apiKey, injectionElementId: 'applixir-ad-container',
          adStatusCallbackFn: (st) => { const t = st && (st.type || st.status || st); if (good(t)) end(true); else if (bad(t)) end(false); },
          adErrorCallbackFn: () => end(false, blocked),
        });
      }).catch(() => end(false, blocked));
    } else {
      this.load(A.sdkOld).then(() => {
        if (typeof window.invokeApplixirVideoUnit !== 'function') { end(false, blocked); return; }
        window.invokeApplixirVideoUnit({
          zoneId: Number(A.zoneId) || A.zoneId, accountId: Number(A.accountId) || A.accountId, gameId: Number(A.gameId) || A.gameId, dMode: 1, fallback: 1,
          callback: (st) => { if (good(st)) end(true); else if (bad(st)) end(false, /block/i.test(st) ? blocked : undefined); },
        });
      }).catch(() => end(false, blocked));
    }
    // never leave the game muted if the player closes it in some way we do not hear about
    setTimeout(() => { if (!done) end(false); }, 120000);
  },

  // Direct Link: a new tab with the ad; back after directSeconds = rewarded
  direct(give) {
    if (this.busy) return;
    const link = ADS_CONFIG.directLink, need = ADS_CONFIG.directSeconds * 1000;
    if (document.pointerLockElement) document.exitPointerLock();
    // try a new tab straight away; if the browser blocks it, the card's own link (a real click) opens it
    let w = null;
    try { w = window.open(link, '_blank'); } catch (e) { w = null; }
    if (w) try { w.opener = null; } catch (e) { /* ignore */ }
    this.busy = true;
    const t0 = Date.now();
    let away = 0, hiddenAt = document.hidden ? t0 : 0, done = false, opened = !!w;
    const card = GPanel.open({ title: 'Sponsored', icon: '🎁', width: 380, onClose: () => finish() });
    const seen = () => away + (hiddenAt ? Date.now() - hiddenAt : 0);
    const draw = () => {
      if (done) return;
      const left = Math.max(0, Math.ceil((need - seen()) / 1000));
      const stuck = opened && !away && !hiddenAt && Date.now() - t0 > 7000, key = (opened ? 'o' : 'c') + left + (stuck ? 's' : '');
      if (card.body.dataset.state === key) return;
      card.body.dataset.state = key;
      let msg;
      if (!opened) msg = 'Open the ad in a new tab, have a look for <b>' + Math.ceil(need / 1000) + ' s</b> and come back here.';
      else if (left) msg = 'The ad opened in a new tab.<br>Have a look for <b>' + left + ' s</b> and come back here.';
      else msg = 'Thanks! Your reward is ready.';
      card.body.innerHTML = `<div class="gp-card ad-card"><div class="gp-big">${!opened ? '📺' : left ? '⏳' : '✅'}</div><p>${msg}</p>
        ${left ? `<a class="gp-btn ${opened ? '' : 'ok'} ad-open" href="${link}" target="_blank" rel="noopener">▶ ${opened ? 'Open the ad again' : 'Open the ad'}</a>` : ''}
        ${stuck ? '<p class="gp-dim ad-hint">No ad? An ad blocker, a strict browser or the school network may block it. Try another browser or network.</p>' : ''}
        <button class="gp-btn ${left ? '' : 'ok'}" data-a="x">${left ? 'Cancel' : 'Collect'}</button></div>`;
      const a = card.body.querySelector('.ad-open');
      if (a) a.addEventListener('click', () => { opened = true; setTimeout(draw, 50); });
      card.body.querySelector('[data-a="x"]').addEventListener('click', () => card.close());
    };
    const vis = () => {
      if (document.hidden) { if (!hiddenAt) hiddenAt = Date.now(); opened = true; }
      else if (hiddenAt) { away += Date.now() - hiddenAt; hiddenAt = 0; draw(); }
    };
    const blur = () => { if (opened && !hiddenAt && !document.hidden) hiddenAt = Date.now(); };
    const focus = () => { if (hiddenAt && !document.hidden) { away += Date.now() - hiddenAt; hiddenAt = 0; draw(); } };
    const finish = () => {
      if (done) return;
      done = true; this.busy = false;
      clearInterval(iv);
      document.removeEventListener('visibilitychange', vis);
      window.removeEventListener('blur', blur);
      window.removeEventListener('focus', focus);
      if (seen() >= need) give();
      else G.ui.toast('🎁 Stay on the ad a little longer to get the reward', 3500);
    };
    document.addEventListener('visibilitychange', vis);
    // a popup window (not a tab) leaves the page visible but takes the focus
    window.addEventListener('blur', blur);
    window.addEventListener('focus', focus);
    const iv = setInterval(draw, 500);
    draw();
  },

  // ---- coming back to life ----
  revive() {
    const kit = this.deathKit;
    if (!kit) return;
    this.rewarded(() => {
      for (const e of kit.items) { e.removed = true; const i = Ents.items.indexOf(e); if (i >= 0) Ents.items.splice(i, 1); }
      kit.slots.forEach((s, i) => { G.inv.slots[i] = s; });
      kit.armor.forEach((s, i) => { G.inv.armor[i] = s; });
      if ((G.money | 0) < kit.money) G.money = kit.money;
      this.deathKit = null;
      G.stats.reset();
      const p = G.player, at = kit.safe || kit.at;
      p.pos = [at[0], at[1], at[2]]; p.vel = [0, 0, 0]; p.fallStart = null; p.landed = 0;
      G.ui.hideDeath(); G.ui.invDirty();
      prepareArea(p.pos[0], p.pos[2], 1);
      liftOutOfBlocks(p);
      this.shield = Date.now() + 5000;
      if (Net.teleported) Net.teleported();
      requestLock();
      G.ui.banner('💖', 'Revived! 5 seconds of protection');
      sfx('achieve', null, 0.8, 1.2);
    });
  },

  // ---- coins ----
  coinsReady() { return this.ready() && G.mode === 'survival' && Date.now() >= this.bonusAt; },
  freeCoins() {
    if (G.mode === 'creative') { G.ui.toast('Coins are unlimited in creative mode'); return; }
    const wait = this.bonusAt - Date.now();
    if (wait > 0) { G.ui.toast('🎁 More free coins in ' + Math.ceil(wait / 60000) + ' min'); return; }
    this.rewarded(() => {
      this.bonusAt = Date.now() + ADS_CONFIG.coinWait;
      G.money = (G.money | 0) + ADS_CONFIG.coins;
      if (typeof Bank !== 'undefined' && Bank.refresh) Bank.refresh();
      const m = $('money'); if (m) { m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump'); }
      sfx('shop_till', null, 0.8, 1);
      G.ui.banner('🎁', '+' + ADS_CONFIG.coins + ' coins!');
    });
  },
};

{
  // dying: keep what you had, in case a video brings you back
  const die = Stats.prototype.die;
  Stats.prototype.die = function (src) {
    const p = G.player;
    const kit = { slots: G.inv.slots.map((s) => s && cloneStack(s)), armor: G.inv.armor.map((s) => s && cloneStack(s)), items: [], money: G.money | 0,
      at: p.pos.slice(), safe: Ads.safe && Math.hypot(Ads.safe[0] - p.pos[0], Ads.safe[2] - p.pos[2]) < 80 ? Ads.safe.slice() : null };
    const spawn = Ents.spawnItem;
    Ents.spawnItem = function () { const e = spawn.apply(this, arguments); if (e) kit.items.push(e); return e; };
    try { die.call(this, src); } finally { Ents.spawnItem = spawn; }
    Ads.deathKit = G.mode === 'survival' ? kit : null;
    const row = document.querySelector('#death .row');
    let b = $('cgKeepBtn');
    if (!b && row) { b = document.createElement('button'); b.id = 'cgKeepBtn'; b.className = 'cg-reward'; row.prepend(b); b.addEventListener('click', () => Ads.revive()); }
    if (b) { b.innerHTML = '<span>▶</span> Watch an ad · revive here' + (kit.items.length ? ' with your items' : ''); b.classList.toggle('hidden', !Ads.deathKit || !Ads.ready()); }
  };
  const rb = $('respawnBtn');
  if (rb) rb.addEventListener('click', () => { Ads.deathKit = null; }, true);
  // the shield after a revive
  const dmg = Stats.prototype.damage;
  Stats.prototype.damage = function (amount, src) { if (Ads.shield && Date.now() < Ads.shield) return; return dmg.call(this, amount, src); };
  // the last safe ground: on your feet, dry, out of lava, not in a vehicle
  setInterval(() => {
    const p = G.player;
    if (!p || !G.world || G.stats.dead || !p.onGround || p.inLava || p.inWater || G.vehicle || G.onTitle) return;
    const w = G.world, x = Math.floor(p.pos[0]), y = Math.floor(p.pos[1]), z = Math.floor(p.pos[2]);
    if (IS_LIQUID(w.getBlock(x, y, z)) || IS_LIQUID(w.getBlock(x, y - 1, z))) return;
    Ads.safe = p.pos.slice();
  }, 700);
  // coins: the app, the button by the coins, the offer when short
  PC.add({ key: 'bonus', icon: '🎁', name: 'Free coins', run() { if (!Ads.ready()) { G.ui.toast('Free coins are not available right now'); return; } Ads.freeCoins(); } });
  const btn = document.createElement('button');
  btn.id = 'cgCoins'; btn.innerHTML = '<span>▶</span> +' + ADS_CONFIG.coins;
  btn.title = 'Watch a short video for free coins';
  btn.addEventListener('click', (e) => { e.stopPropagation(); Ads.freeCoins(); });
  document.body.append(btn);
  setInterval(() => btn.classList.toggle('show', Ads.coinsReady() && !G.onTitle && G.started && !G.stats.dead), 1000);
  // the same offer in the pause menu (with the mouse captured, the HUD button cannot be clicked)
  const acts = document.querySelector('#menu .opt-actions'), mb = document.createElement('button');
  mb.id = 'menuCoins'; mb.className = 'hidden'; mb.innerHTML = '🎁 +' + ADS_CONFIG.coins + ' coins';
  mb.addEventListener('click', () => Ads.freeCoins());
  if (acts) acts.insertBefore(mb, $('journalBtn'));
  setInterval(() => mb.classList.toggle('hidden', !Ads.coinsReady() || !G.started), 1000);
  if (typeof Shops !== 'undefined') {
    const pay = Shops.pay;
    Shops.pay = function (n) {
      const ok = pay.call(this, n);
      if (!ok && G.screenOpen && Ads.coinsReady() && Date.now() - Ads.offerAt > ADS_CONFIG.offerWait && n - (G.money | 0) <= ADS_CONFIG.coins * 3) {
        Ads.offerAt = Date.now();
        setTimeout(() => {
          const q = GPanel.open({ title: 'Need more coins?', icon: '🎁', width: 360 });
          q.body.innerHTML = `<div class="gp-card"><div class="gp-big">🪙</div><p>You need <b>${n}</b> and have <b>${G.money | 0}</b>.</p><p class="gp-dim">Watch a short video and get <b>${ADS_CONFIG.coins}</b> coins.</p>
            <div style="display:flex;gap:8px;justify-content:center;margin-top:10px"><button class="gp-btn ok" data-a="y">▶ Watch · +${ADS_CONFIG.coins}</button><button class="gp-btn" data-a="n">No thanks</button></div></div>`;
          q.body.querySelector('[data-a="y"]').addEventListener('click', () => { q.close(); Ads.freeCoins(); });
          q.body.querySelector('[data-a="n"]').addEventListener('click', () => q.close());
        }, 300);
      }
      return ok;
    };
  }
}
