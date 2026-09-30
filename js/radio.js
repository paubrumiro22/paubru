'use strict';
// Radio and voice.
// - Radio (the Radio app): four stations made by the music composer (music.js) — Pop, Chill,
//   Classical and Rumba — that play without the usual silences while switched on, plus the News
//   station: soft music under spoken bulletins (the browser's voice) about the weather, the
//   stock market, today's event in the city and the mayor. Same quiet level as the music.
// - Proximity voice (servers with a direct connection): the Voice app turns the microphone on
//   as push-to-talk (hold X) or open mic. Everyone hears you louder the closer they are, from
//   the side you are on, and up to 40 blocks away; a 🎙️ shows over whoever is talking.

Object.assign(MOODS, {
  radio_pop: { root: 62, scale: 'major', bpm: 108, progs: [[0, 4, 5, 3], [0, 5, 3, 4], [3, 4, 0, 5]], parts: { pad: 0.35, bass: 0.8, lead: 0.7, drums: 0.6, arp: 0.25 }, rest: null, bars: [16, 16] },
  radio_chill: { root: 57, scale: 'dorian', bpm: 76, progs: [[0, 3, 6, 4], [1, 4, 0, 5], [0, 5, 3, 4]], parts: { pad: 0.7, bass: 0.55, piano: 0.9, drums: 0.3, bell: 0.3 }, rest: null, bars: [16, 16] },
  radio_classic: { root: 60, scale: 'major', bpm: 84, progs: [[0, 3, 4, 0], [0, 5, 3, 4], [5, 3, 4, 0]], parts: { pad: 0.6, piano: 1, bass: 0.35, choir: 0.2 }, rest: null, bars: [16, 24] },
  radio_rumba: { root: 64, scale: 'phrygian', bpm: 118, progs: [[0, 6, 5, 0], [0, 1, 0, 6], [3, 1, 0, 0]], parts: { bass: 0.9, brass: 0.45, drums: 0.7, arp: 0.5, pad: 0.25 }, rest: null, bars: [16, 16] },
  radio_news: { root: 55, scale: 'major', bpm: 70, progs: [[0, 4, 5, 3]], parts: { pad: 0.45, piano: 0.3 }, rest: null, bars: [8, 8] },
});
const RADIO_STATIONS = [
  { k: 'pop', mood: 'radio_pop', icon: '🎤', name: 'Blocklands Pop', fm: '98.1' },
  { k: 'chill', mood: 'radio_chill', icon: '🌙', name: 'Chill FM', fm: '101.4' },
  { k: 'classic', mood: 'radio_classic', icon: '🎻', name: ED('Clàssica', 'Classical'), fm: '93.7' },
  { k: 'rumba', mood: 'radio_rumba', icon: '💃', name: ED('Ràdio Rumba', 'Rumba Radio'), fm: '105.9' },
  { k: 'news', mood: 'radio_news', icon: '📰', name: ED('Notícies ', 'News ') + CITY, fm: '88.2' },
];

const Radio = {
  st: null, newsT: 8, chip: null,
  station() { return RADIO_STATIONS.find((s) => s.k === this.st) || null; },
  tune(k) {
    this.st = k || null;
    if (G.prog) G.prog.radio = this.st;
    if (!k && window.speechSynthesis) speechSynthesis.cancel();
    this.newsT = 3;
    const s = this.station();
    G.ui.toast(s ? '📻 ' + s.fm + ' · ' + s.name : '📻 Radio off', 1800);
    this.drawChip();
  },
  bulletin() {
    const out = [];
    const h = typeof CityAlive !== 'undefined' ? Math.floor(CityAlive.hour()) : 12;
    out.push(ED('Són les ' + h + ' a ' + CITY + '.', 'It is ' + h + " o'clock in " + CITY + '.'));
    const w = typeof Weather !== 'undefined' ? Weather.kind : 'clear';
    out.push({ clear: ED('Cel serè.', 'Clear skies.'), rain: ED('Pluja a la ciutat, agafeu el paraigua.', 'Rain over the city, take an umbrella.'), storm: ED('Alerta per tempesta.', 'Storm warning.'), snow: ED('Neva!', 'It is snowing!'), hail: ED('Compte amb la calamarsa.', 'Watch out for hail.') }[w] || '');
    if (typeof CityEvents !== 'undefined') { const e = CityEvents.today(); out.push({ concert: ED('Aquest vespre, concert a la plaça.', 'Tonight, a concert in the square.'), market: ED('Aquesta nit, mercat nocturn.', 'Tonight, the night market.'), race: ED('Avui hi ha cursa de cotxes pel centre.', 'Street race in the centre today.') }[e.kind]); }
    if (typeof Stocks !== 'undefined') { const n = Stocks.news()[0]; if (n) out.push(ED('Borsa: ', 'Markets: ') + n.text + '.'); }
    if (typeof Mayor !== 'undefined') { const m = Mayor.st().mayor; if (m) out.push(ED('L\'alcalde ', 'Mayor ') + m.n + ED(' diu: ', ' says: ') + m.m + '.'); }
    return out.filter(Boolean).join(' ');
  },
  update(dt) {
    const s = this.station();
    if (!s || !window.speechSynthesis || s.k !== 'news') return;
    this.newsT -= dt;
    if (this.newsT > 0 || speechSynthesis.speaking) return;
    this.newsT = 50;
    const u = new SpeechSynthesisUtterance(this.bulletin());
    u.lang = CG ? 'en-GB' : 'ca-ES';
    u.rate = 1; u.pitch = 1;
    u.volume = clamp((G.settings.music === undefined ? 0.3 : G.settings.music) * 1.6, 0.1, 0.8);
    const v = speechSynthesis.getVoices().find((x) => x.lang && x.lang.toLowerCase().startsWith(u.lang.slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  },
  drawChip() {
    const s = this.station();
    if (!this.chip) { this.chip = document.createElement('div'); this.chip.id = 'radioChip'; document.body.append(this.chip); }
    this.chip.classList.toggle('show', !!s && !G.onTitle);
    if (s) this.chip.innerHTML = `<i>📻</i><b>${s.fm}</b><span>${s.icon} ${GPanel.esc(s.name)}</span><em><u></u><u></u><u></u></em>`;
  },
  open() {
    const q = GPanel.open({ title: ED('Ràdio', 'Radio'), sub: 'FM', icon: '📻', cls: 'gp-radio', width: 420 });
    const draw = () => {
      q.body.innerHTML = `<div class="rd-dial"><div class="rd-scale">${RADIO_STATIONS.map((s) => `<i style="left:${((parseFloat(s.fm) - 87) / 20 * 100).toFixed(1)}%"></i>`).join('')}<b style="left:${this.station() ? ((parseFloat(this.station().fm) - 87) / 20 * 100).toFixed(1) : 0}%"></b></div></div>
        <div class="rd-list">${RADIO_STATIONS.map((s) => `<button class="rd-st${s.k === this.st ? ' on' : ''}" data-k="${s.k}"><i>${s.icon}</i><b>${GPanel.esc(s.name)}</b><em>${s.fm}</em></button>`).join('')}
        <button class="rd-st off${!this.st ? ' on' : ''}" data-k=""><i>⏻</i><b>Off</b><em></em></button></div>
        <p class="gp-dim">The radio plays at the music volume (Options › Sound).</p>`;
      q.body.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { this.tune(b.dataset.k); draw(); }));
    };
    draw();
  },
};

// ---------------------------------------------------------------- voice ----
const Voice = {
  mode: 'off', stream: null, sent: new Set(), peers: new Map(), talking: false, chip: null, hooked: null, keyDown: false,
  room() { return Net.p2p && Net.p2p.room; },
  async set(mode) {
    if (mode !== 'off' && !(Net.on && Net.server)) { G.ui.toast('🎙️ Voice chat works on servers (Online › Servers)'); return; }
    if (mode !== 'off' && !this.stream) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      } catch (e) { G.ui.toast('🎙️ No microphone (or permission denied)'); return; }
    }
    this.mode = mode;
    if (mode === 'off' && this.stream) {
      const room = this.room();
      if (room && room.removeStream) try { room.removeStream(this.stream); } catch (e) { /* ignore */ }
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null; this.sent.clear();
    }
    this.apply();
    G.ui.toast(mode === 'off' ? '🎙️ Voice off' : mode === 'ptt' ? '🎙️ Hold X to talk' : '🎙️ Open mic: everyone near hears you', 2600);
  },
  apply() {
    const on = this.mode === 'open' || (this.mode === 'ptt' && this.keyDown);
    this.talking = !!this.stream && on;
    if (this.stream) for (const t of this.stream.getAudioTracks()) t.enabled = on;
    this.drawChip();
  },
  hook(room) {
    if (this.hooked === room) return;
    this.hooked = room;
    this.sent.clear();
    const onStream = (stream, peerId) => this.addPeer(stream, peerId);
    try { if (typeof room.onPeerStream === 'function') room.onPeerStream(onStream); else room.onPeerStream = onStream; } catch (e) { room.onPeerStream = onStream; }
  },
  addPeer(stream, tid) {
    const ctx = Sound.ctx;
    if (!ctx) return;
    const old = this.peers.get(tid);
    if (old) { try { old.src.disconnect(); } catch (e) { /* ignore */ } old.el.remove(); }
    // Chrome only feeds WebAudio from a remote stream that is also attached to a (muted) element
    const el = document.createElement('audio');
    el.srcObject = stream; el.muted = true; el.play().catch(() => {});
    el.style.display = 'none'; document.body.append(el);
    const src = ctx.createMediaStreamSource(stream), gain = ctx.createGain(), pan = ctx.createStereoPanner();
    gain.gain.value = 0;
    src.connect(gain); gain.connect(pan); pan.connect(Sound.master);
    this.peers.set(tid, { el, src, gain, pan });
  },
  update() {
    const room = this.room();
    if (!room) { if (this.peers.size) { for (const p of this.peers.values()) { try { p.src.disconnect(); } catch (e) { /* ignore */ } p.el.remove(); } this.peers.clear(); } return; }
    this.hook(room);
    // our voice to everyone connected (newcomers too)
    if (this.stream && room.addStream) {
      let ids = [];
      try { ids = Object.keys(room.getPeers ? room.getPeers() : {}); } catch (e) { ids = []; }
      for (const id of ids) if (!this.sent.has(id)) { this.sent.add(id); try { room.addStream(this.stream, id); } catch (e) { /* ignore */ } }
    }
    // everybody else: louder the closer, from their side
    const ctx = Sound.ctx, me = G.player;
    for (const [tid, p] of this.peers) {
      const r = Net.peers.get(Net.uidOf.get(tid) || tid);
      let g = 0, pn = 0;
      if (r) {
        const dx = r.pos[0] - me.pos[0], dz = r.pos[2] - me.pos[2], d = Math.hypot(dx, dz, r.pos[1] - me.pos[1]);
        g = d > 40 ? 0 : Math.pow(1 - d / 40, 1.6) * 1.4;
        const ang = Math.atan2(dx, dz) - Math.atan2(-Math.sin(me.yaw), -Math.cos(me.yaw));
        pn = clamp(-Math.sin(ang), -0.85, 0.85);
      }
      if (ctx) { p.gain.gain.setTargetAtTime(g, ctx.currentTime, 0.1); p.pan.pan.setTargetAtTime(pn, ctx.currentTime, 0.1); }
    }
  },
  drawChip() {
    if (!this.chip) { this.chip = document.createElement('div'); this.chip.id = 'voiceChip'; document.body.append(this.chip); }
    this.chip.classList.toggle('show', this.mode !== 'off' && !G.onTitle);
    this.chip.classList.toggle('live', this.talking);
    this.chip.innerHTML = `<i>${this.talking ? '🎙️' : '🔇'}</i><span>${this.mode === 'ptt' ? (this.talking ? 'Talking…' : 'Hold X') : this.mode === 'open' ? 'Open mic' : ''}</span>`;
  },
  open() {
    const q = GPanel.open({ title: ED('Veu', 'Voice'), sub: Net.on && Net.server ? 'Proximity chat · up to 40 blocks' : 'Only on servers', icon: '🎙️', cls: 'gp-voice', width: 400 });
    const draw = () => {
      q.body.innerHTML = `<div class="vc-modes">${[['off', '🔇', 'Off', 'Nobody hears you'], ['ptt', '⌨️', 'Push to talk', 'Hold X while you speak'], ['open', '🎙️', 'Open mic', 'Always on: best with headphones']].map(([k, i, n, d]) => `<button class="vc-m${this.mode === k ? ' on' : ''}" data-m="${k}"><i>${i}</i><b>${n}</b><span>${d}</span></button>`).join('')}</div>
        <p class="gp-dim">Players hear you louder the closer they are, from the side you are on. Voice needs a direct connection between players (not over the relay). ${this.peers.size} voice${this.peers.size === 1 ? '' : 's'} connected.</p>`;
      q.body.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', async () => { await this.set(b.dataset.m); draw(); }));
    };
    draw();
  },
};

{
  const pick = Music.pickMood;
  Music.pickMood = function (dt) {
    const s = Radio.station();
    if (s && G.started && !G.onTitle && !G.dimension) return s.mood;
    return pick.call(this, dt);
  };
  // the 🎙️ over whoever talks
  const pd = Net.presenceData;
  Net.presenceData = function () { const d = pd.call(this); if (Voice.talking) d.vt = 1; return d; };
  const dt0 = Net.drawTags;
  Net.drawTags = function () {
    dt0.call(this);
    for (const r of this.peers.values()) if (r.tag) r.tag.classList.toggle('talk', !!r.vt);
  };
  const onp = Net.onPresence;
  Net.onPresence = function (peer, pr) { onp.call(this, peer, pr); const r = this.peers.get(peer); if (r) r.vt = !!(pr && pr.vt); };
  const typing = () => document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  window.addEventListener('keydown', (e) => { if (e.code === 'KeyX' && Voice.mode === 'ptt' && !e.repeat && !typing() && !G.screenOpen) { Voice.keyDown = true; Voice.apply(); } });
  window.addEventListener('keyup', (e) => { if (e.code === 'KeyX' && Voice.keyDown) { Voice.keyDown = false; Voice.apply(); } });
  window.addEventListener('blur', () => { if (Voice.keyDown) { Voice.keyDown = false; Voice.apply(); } });
  const fu = Furniture.update;
  Furniture.update = function (dt) {
    fu.call(this, dt);
    try {
      if (Radio.st === null && G.prog && G.prog.radio && !Radio.restored) { Radio.restored = true; Radio.st = G.prog.radio; }
      Radio.update(dt || 0.016); Voice.update();
      if (Radio.chip) Radio.chip.classList.toggle('show', !!Radio.station() && !G.onTitle);
      else if (Radio.station()) Radio.drawChip();
    } catch (e) { console.warn('Blocklands: radio', e); }
  };
  PC.add({ key: 'radio', icon: '📻', name: ED('Ràdio', 'Radio'), run() { Radio.open(); } });
  PC.add({ key: 'voice', icon: '🎙️', name: ED('Veu', 'Voice'), run() { Voice.open(); } });
}
