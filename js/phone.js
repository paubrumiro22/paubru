'use strict';
// BlocPhone: your phone, anywhere (L). A lock screen with the time, the date and the latest
// notifications (every toast and banner of the game is kept there), then the home screen with
// every app the computers have (PC.apps: newspaper, market, estate agent, flights, taxi, people,
// transport map...) plus a few of its own: Camera (photo mode), Map, Help (all the controls)
// and Weather. The wallpaper follows the season and the time of day.

const PHONE_KEYS = [
  ['Moure\'s', 'WASD · Espai saltar · Shift ajupir-se · R o doble W córrer'],
  ['Món', 'Clic esquerre picar · clic dret usar/posar · Q llençar · 1-9 barra · E inventari'],
  ['Mòbil i ciutat', 'L mòbil · U diari · O gent i amics · B mapa de transport · M mapa · J missions'],
  ['Construir', 'K mode arquitecte (vista des de dalt, Ctrl+Z desfer, Ctrl+C/V copiar)'],
  ['Vehicles', 'Clic dret per pujar · Shift baixar · V càmera · als busos i al metro, seus i mires'],
  ['Social', 'G gestos · clic dret a un jugador per saludar, abraçar, donar o fer-lo amic · Enter xat'],
  ['Altres', 'P mode foto · F5 càmera en 3a persona · F1 amagar HUD · T (creatiu) passar el temps'],
  ['Ordres', '/home /sethome /spawn /tp /taxi /market /flights /ferry /architect /friends /admin /help'],
];

const Phone = {
  p: null, locked: true, notes: [],
  log(text, icon) {
    const t = String(text || '').replace(/<[^>]*>/g, '').trim();
    if (!t) return;
    const last = this.notes[0];
    if (last && last.t === t && Date.now() - last.at < 4000) return;
    this.notes.unshift({ t, icon: icon || '', at: Date.now() });
    if (this.notes.length > 30) this.notes.pop();
  },
  apps() {
    const own = [
      { key: 'camera', icon: '📷', name: 'Camera', closes: true, run() { setTimeout(() => Photo.open(), 80); } },
      { key: 'map', icon: '🗺️', name: 'Mapa', closes: true, run() { setTimeout(() => WorldMap.show(), 80); } },
      { key: 'weather', icon: '⛅', name: 'Temps', run: () => this.weather() },
      { key: 'help', icon: '❔', name: 'Ajuda', run: () => this.help() },
      { key: 'quests', icon: '🏆', name: 'Missions', closes: true, run() { setTimeout(() => Progress.show(), 80); } },
    ];
    const keys = new Set(PC.apps.map((a) => a.key));
    return [...PC.apps, ...own.filter((a) => !keys.has(a.key))];
  },
  wall() {
    const s = typeof Calendar !== 'undefined' ? Calendar.season() : null, t = G.dayTime || 0.3;
    const night = t > 0.78 || t < 0.2;
    const pal = { spring: ['#ffb3cf', '#7fc8ff'], summer: ['#ffd36b', '#3fb6ff'], autumn: ['#ff9d4d', '#8a3f2a'], winter: ['#dbe8ff', '#4a6aa8'] }[s ? s.k : 'spring'] || ['#7fc8ff', '#2a6ce0'];
    return night ? 'radial-gradient(120% 80% at 30% 10%, #2b3a7a 0%, #10163a 55%, #05070f 100%)' : `radial-gradient(130% 90% at 25% 5%, ${pal[0]} 0%, ${pal[1]} 60%, #0d1a38 110%)`;
  },
  open() {
    if (this.p) { this.p.close(); return; }
    if (G.stats.dead || !G.playing) return;
    this.p = GPanel.open({ title: '', cls: 'gp-phone', width: 330, onClose: () => { this.p = null; clearInterval(this.iv); } });
    this.locked = true;
    this.render();
    this.iv = setInterval(() => { if (this.p && this.locked) this.render(); }, 5000);
    sfx('phone_open', null, 0.5, 1);
  },
  clock() {
    const h = Math.floor(((G.dayTime || 0) * 24 + 6) % 24), m = Math.floor((((G.dayTime || 0) * 24 + 6) % 1) * 60);
    return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  },
  status() {
    const money = G.mode === 'creative' ? '∞' : (G.money | 0);
    return `<div class="ph-status"><b>${this.clock()}</b><span>${Net.on ? '📶' : '✈️'} 🪙 ${money} 🔋</span></div>`;
  },
  render() {
    const p = this.p;
    if (!p) return;
    const e = GPanel.esc;
    const box = p.wrap.querySelector('.gp');
    box.style.setProperty('--wall', this.wall());
    if (this.locked) {
      const date = typeof Calendar !== 'undefined' ? Calendar.dateText() : '';
      p.body.innerHTML = `${this.status()}<div class="ph-lock"><div class="ph-time">${this.clock()}</div><div class="ph-date">${e(date)}</div>
        <div class="ph-notes">${this.notes.slice(0, 6).map((n) => `<div class="ph-note"><span>${e(n.t)}</span><small>${agoText(n.at)}</small></div>`).join('') || '<div class="ph-note ph-empty">No notifications</div>'}</div>
        <button class="ph-unlock">Swipe up · click to open</button></div>`;
      const un = () => { this.locked = false; sfx('click', null, 0.5, 1.6); this.render(); };
      p.body.querySelector('.ph-unlock').addEventListener('click', un);
      let y0 = null;
      p.body.addEventListener('pointerdown', (ev) => { y0 = ev.clientY; }, { once: true });
      p.body.addEventListener('pointerup', (ev) => { if (y0 !== null && y0 - ev.clientY > 40) un(); }, { once: true });
      p.onKey = (ev) => { if (ev.code === 'Space' || ev.code === 'Enter') { un(); return true; } return false; };
      return;
    }
    p.onKey = null;
    const apps = this.apps();
    const dock = ['people', 'market', 'transport', 'camera'];
    const grid = apps.filter((a) => !dock.includes(a.key));
    const cell = (a) => `<button class="ph-app" data-k="${a.key}"><i>${a.icon}</i><span>${e(a.name)}</span></button>`;
    p.body.innerHTML = `${this.status()}<div class="ph-home"><div class="ph-grid">${grid.map(cell).join('')}</div>
      <div class="ph-dock">${dock.map((k) => apps.find((a) => a.key === k)).filter(Boolean).map(cell).join('')}</div></div>`;
    p.body.querySelectorAll('.ph-app').forEach((b) => b.addEventListener('click', () => {
      const a = apps.find((x) => x.key === b.dataset.k);
      if (!a) return;
      sfx('click', null, 0.4, 1.4);
      if (a.closes) p.close();
      a.run(null, p);
    }));
  },
  help() {
    const q = GPanel.open({ title: 'Ajuda', sub: 'Controls i dreceres', icon: '❔', width: 560 });
    q.body.innerHTML = PHONE_KEYS.map(([h, t]) => `<div class="gp-row"><div class="gp-grow"><b>${GPanel.esc(h)}</b><small>${GPanel.esc(t)}</small></div></div>`).join('');
  },
  weather() {
    const q = GPanel.open({ title: 'El temps', icon: '⛅', width: 380 });
    const w = typeof Weather !== 'undefined' ? Weather.kind : 'clear';
    const s = typeof Calendar !== 'undefined' ? Calendar.season() : null;
    const icon = { clear: '☀️', rain: '🌧️', storm: '⛈️', snow: '❄️', fog: '🌫️' }[w] || '☀️';
    const name = { clear: 'Sunny', rain: 'Rain', storm: 'Storms', snow: 'Snow', fog: 'Fog' }[w] || 'Sunny';
    const tNow = s ? { spring: 18, summer: 29, autumn: 15, winter: 4 }[s.k] : 20;
    const temp = Math.round(tNow + Math.sin(((G.dayTime || 0.3) - 0.25) * Math.PI * 2) * 4 - (w === 'rain' || w === 'storm' ? 3 : 0));
    const next = ['☀️', '⛅', '🌧️', '☀️', '⛅'].map((ic, i) => `<div class="ph-fc"><small>+${i + 1} h</small><i>${ic}</i><b>${temp + Math.round(Math.sin(i) * 2)}°</b></div>`).join('');
    q.body.innerHTML = `<div class="gp-card"><div class="gp-big">${icon} ${temp}°</div><p>${name}${s ? ' · ' + s.icon + ' ' + GPanel.esc(s.ca) : ''}</p></div><div class="ph-fcs">${next}</div>`;
  },
};

SYNTH.phone_open = (ctx, o, t) => { [880, 1175, 1568].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.06, 0.18, { wave: 'sine', f0: f, gain: 0.05 })); };

// ---------------------------------------------------------------- hooks ----
{
  const toast = UI.toast;
  UI.toast = function (text, ms) { Phone.log(text); return toast.call(this, text, ms); };
  const banner = UI.banner;
  if (banner) UI.banner = function (icon, text, ...rest) { Phone.log(text, icon); return banner.call(this, icon, text, ...rest); };
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyL' || e.repeat || !G.playing || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (G.screenOpen && !Phone.p) return;
    if (typeof Architect !== 'undefined' && Architect.on) return;
    e.preventDefault();
    Phone.open();
  });
  PC.add({ key: 'help', icon: '❔', name: 'Ajuda', run() { Phone.help(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/(help|ajuda|\?)$/i.test(text.trim())) { Phone.help(); return; } if (/^\/(phone|mobil)\b/i.test(text)) { setTimeout(() => Phone.open(), 50); return; } return run.call(this, text); };
}
