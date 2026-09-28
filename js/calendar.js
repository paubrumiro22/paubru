'use strict';
// The calendar: days go by (a new one every time the sun comes up, sleeping included), a year of
// four short seasons of three days each. Each season tints the trees and plants (autumn goes
// orange and red, winter brings snow to the whole map, spring is fresh green), and three days a
// year are festes in STUCOM: Sant Joan (fireworks and bonfires), la Mercè (fireworks and a
// correfoc of sparks) and Nadal (snow, a big lit tree in the square). Every morning the
// newspaper — La Gaseta de STUCOM — comes out with the weather, the festes, the metro and the
// town (U, or the kiosk in the square).

const SEASON_DAYS = 3, YEAR_DAYS = SEASON_DAYS * 4;
const SEASONS = [
  { k: 'spring', name: 'Spring', ca: 'Primavera', icon: '🌸', tint: [0.72, 1.0, 0.5], amt: 0.14 },
  { k: 'summer', name: 'Summer', ca: 'Estiu', icon: '☀️', tint: [0.95, 1.0, 0.55], amt: 0.1 },
  { k: 'autumn', name: 'Autumn', ca: 'Tardor', icon: '🍂', tint: [1.0, 0.5, 0.16], amt: 0.62 },
  { k: 'winter', name: 'Winter', ca: 'Hivern', icon: '❄️', tint: [0.86, 0.8, 0.7], amt: 0.4 },
];
const WEEKDAYS = ['Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres', 'Dissabte', 'Diumenge'];
// festes: day of the year (0-based)
const FESTES = [
  { k: 'santjoan', day: 4, name: 'Revetlla de Sant Joan', icon: '🎆', text: 'Fireworks and bonfires in STUCOM tonight' },
  { k: 'merce', day: 7, name: 'Festes de la Mercè', icon: '🎇', text: 'Fireworks and a correfoc in the streets tonight' },
  { k: 'nadal', day: 10, name: 'Nadal', icon: '🎄', text: 'A giant lit tree in the square, and snow' },
];

const Calendar = {
  lastT: null, tagT: 0, fwT: 0, paperDay: -1,

  day() { return (G.prog && G.prog.day) | 0; },
  yearDay(d = this.day()) { return ((d % YEAR_DAYS) + YEAR_DAYS) % YEAR_DAYS; },
  season(d = this.day()) { return SEASONS[Math.floor(this.yearDay(d) / SEASON_DAYS)]; },
  year(d = this.day()) { return Math.floor(d / YEAR_DAYS) + 1; },
  festa(d = this.day()) { const y = this.yearDay(d); return FESTES.find((f) => f.day === y) || null; },
  dateText(d = this.day()) {
    const s = this.season(d);
    return WEEKDAYS[d % 7] + ' · ' + s.icon + ' ' + s.ca + ', dia ' + (this.yearDay(d) % SEASON_DAYS + 1) + ' · Any ' + this.year(d);
  },
  outside() { return !G.slot && typeof dimOf === 'function' && dimOf(G.player.pos[0], G.player.pos[2]) === DIM_OVER; },

  update(dt) {
    if (!G.world || !G.player) return;
    if (!G.prog) G.prog = {};
    // a new day when the sun comes up (the clock wraps, or someone slept through the night)
    if (this.lastT !== null && G.dayTime < this.lastT - 0.3) this.newDay();
    this.lastT = G.dayTime;
    // the trees and plants of the season (blended into the next over its last half day)
    const d = this.day() + G.dayTime;
    const pos = ((d / SEASON_DAYS) % 4 + 4) % 4, i = Math.floor(pos), f = clamp((pos - i - (1 - 0.5 / SEASON_DAYS)) / (0.5 / SEASON_DAYS), 0, 1);
    const a = SEASONS[i], b = SEASONS[(i + 1) % 4];
    const mix = (u, v) => u + (v - u) * f;
    const on = this.outside() ? 1 : 0;
    if (G.renderer) G.renderer.season = [mix(a.tint[0], b.tint[0]), mix(a.tint[1], b.tint[1]), mix(a.tint[2], b.tint[2]), mix(a.amt, b.amt) * on];
    // the HUD date
    this.tagT -= dt;
    if (this.tagT <= 0) {
      this.tagT = 0.5;
      const el = $('dateTag');
      if (el) {
        const s = this.season(), fe = this.festa();
        el.textContent = s.icon + ' ' + s.ca + ' · dia ' + (this.yearDay() % SEASON_DAYS + 1) + '/' + SEASON_DAYS + ' · ' + (typeof formatClock === 'function' ? formatClock(G.dayTime) : '') + (fe ? ' · ' + fe.icon + ' ' + fe.name : '');
        el.classList.toggle('hidden', !!G.slot);
      }
    }
    this.festes(dt);
  },

  newDay() {
    G.prog.day = this.day() + 1;
    const s = this.season(), fe = this.festa();
    const first = this.yearDay() % SEASON_DAYS === 0;
    if (G.ui) {
      if (fe) G.ui.banner(fe.icon, fe.name + ' · ' + fe.text);
      else if (first) G.ui.banner(s.icon, s.ca + ' has arrived');
      G.ui.toast('📰 La Gaseta de STUCOM is out · press U to read it', 4500);
    }
    if (fe && fe.k === 'nadal') this.xmasTree(true);
    else if (G.prog.xmas) this.xmasTree(false);
  },

  // ---------------------------------------------------------------- festes ----
  square() {
    try {
      const st = G.world.gen && G.world.gen.structs && typeof stucomVillage === 'function' ? stucomVillage(G.world.gen) : null;
      return st && st.spawnAt ? [st.spawnAt[0] + 6, st.spawnAt[1], st.spawnAt[2] + 6] : null;
    } catch (e) { return null; }
  },
  festes(dt) {
    const fe = this.festa();
    if (!fe || G.slot || !G.player) return;
    const sq = this.square();
    if (!sq) return;
    const p = G.player.pos, near = Math.hypot(p[0] - sq[0], p[2] - sq[2]) < 260;
    const night = G.dayTime > 0.52 && G.dayTime < 0.95;
    if (!near || !night) return;
    this.fwT -= dt;
    if (this.fwT > 0) return;
    this.fwT = rand(2.5, 5);
    if (typeof Football !== 'undefined') Football.fireworks([sq[0] + rand(-30, 30), sq[1] + rand(14, 26), sq[2] + rand(-30, 30)]);
    // Sant Joan: bonfires round the square; la Mercè: sparks running down the street
    if (fe.k === 'santjoan') for (const [dx, dz] of [[-14, -14], [14, -14], [-14, 14], [14, 14]]) {
      for (let i = 0; i < 6; i++) Particles.flame && Particles.flame(sq[0] + dx + rand(-0.8, 0.8), sq[1] + 0.3 + rand(0, 1.2), sq[2] + dz + rand(-0.8, 0.8));
      Particles.smoke(sq[0] + dx, sq[1] + 2, sq[2] + dz, 3, 0.6, true);
    }
    if (fe.k === 'merce') {
      const x = sq[0] + rand(-25, 25), z = sq[2] + rand(-25, 25);
      for (let i = 0; i < 40; i++) {
        const l = rand(0.4, 0.9);
        Particles.add(Particles.base(x, sq[1] + 2, z, { vx: rand(-4, 4), vy: rand(2, 6), vz: rand(-4, 4), life: l, max: l, size: rand(0.06, 0.12), layer: T.p_crit, r: 1, g: rand(0.5, 0.9), b: 0.2, glow: true, grav: 9, collide: false }));
      }
      sfx('fizz', [x, sq[1] + 2, z], 0.6, 1.4);
    }
  },
  // a giant Christmas tree with lights in the square for Nadal (taken down the next day)
  xmasTree(up) {
    const sq = this.square();
    if (!sq || !G.world.isLoaded(sq[0], sq[2])) { if (!up) G.prog.xmas = null; return; }
    const was = Net.capture;
    Net.capture = false;
    try {
      if (!up) {
        const list = (G.prog.xmas || []).map(([x, y, z]) => [x, y, z, B.AIR]);
        if (list.length) editBlocks(list);
        G.prog.xmas = null;
        return;
      }
      const [cx, y0, cz] = sq.map(Math.floor), list = [], put = [];
      for (let y = 0; y < 3; y++) list.push([cx, y0 + y, cz, B.SPRUCE_LOG]);
      for (let layer = 0; layer < 9; layer++) {
        const r = Math.max(0, 4 - Math.floor(layer / 2)), y = y0 + 2 + layer;
        for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) {
          if (dx * dx + dz * dz > r * r + 1) continue;
          const lit = (dx + dz + layer) % 3 === 0 && (Math.abs(dx) === r || Math.abs(dz) === r);
          list.push([cx + dx, y, cz + dz, lit ? (layer % 2 ? B.GLOWSTONE : B.SEA_LANTERN) : B.SPRUCE_LEAVES]);
        }
      }
      list.push([cx, y0 + 11, cz, B.GLOWSTONE]);
      for (const q of list) if (BLOCK_REPLACE[G.world.getBlock(q[0], q[1], q[2])] || G.world.getBlock(q[0], q[1], q[2]) === B.AIR) put.push(q);
      editBlocks(put);
      G.prog.xmas = put.map((q) => q.slice(0, 3));
    } finally { Net.capture = was; }
  },
};

// ---------------------------------------------------------------- winter: snow everywhere ----
{
  const cold = Weather.cold;
  Weather.cold = function (x, z) { return (Calendar.season().k === 'winter' && Calendar.outside()) || cold.call(this, x, z); };
  const upd = Weather.update;
  Weather.update = function (dt, cam) {
    upd.call(this, dt, cam);
    const s = Calendar.season().k;
    if (!Calendar.outside()) return;
    // winter keeps a white cover; spring melts it
    if (s === 'winter' || Calendar.festa() && Calendar.festa().k === 'nadal') this.snowCover = Math.max(this.snowCover, 0.7);
  };
}

// ---------------------------------------------------------------- the newspaper ----
const HEADLINES = [
  'Pigeons of Plaça Universitat demand more breadcrumbs', 'STUCOM students break the record of stairs climbed in a day',
  'Local cat elected mayor of the square for the third year', 'The bank’s vault is “very, very safe”, says the bank',
  'Mystery: who keeps putting flowers on the metro platform?', 'Record queue at the kiosk for the new metro card design',
  'Seagulls spotted wearing tiny hats near the port', 'Teachers agree: homework is good for you', 'New study: blocks are square',
  'The fountain of the square will be cleaned on Tuesday (again)', 'Traffic jam of three horses on the main street',
  'Survey: 9 out of 10 villagers prefer the morning sun', 'Brave student pets a wolf, wolf approves',
];
const ADS = [
  ['🥖', 'Forn de Pa Can Pau', 'Fresh bread every morning · Carrer dels Blocs'], ['🛋️', 'Mobles Cúbics', 'Sofas that join into long couches'],
  ['🚇', 'Metro de STUCOM', 'Your stop, next to your house · ask at the panel'], ['🎫', 'Targeta Metro', '10 trips for 20 coins'],
  ['🏦', 'Banc Central', '2 % interest every morning. Do not break the walls.'], ['🏠', 'Pedra de Parcel·la', 'Protect what you build'],
  ['📷', 'Foto Ràpida', 'Press P and smile'], ['🌭', 'Frankfurt del Mercat', 'The best in the square since yesterday'],
];

const Newspaper = {
  el: null, open: false,
  pick(list, d, k) { return list[Math.floor(hash3(d, k, 17, 911) * list.length)]; },
  show() {
    if (!this.el) {
      this.el = document.createElement('div');
      this.el.id = 'paper';
      this.el.className = 'overlay';
      document.body.append(this.el);
      this.el.addEventListener('click', (e) => { if (e.target === this.el) this.close(); });
    }
    this.open = true;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    this.render();
    this.el.classList.remove('hidden');
    sfx('click', null, 0.8, 0.7);
  },
  close() {
    if (!this.open) return;
    this.open = false;
    G.screenOpen = false;
    this.el.classList.add('hidden');
    requestLock();
  },
  render() {
    const d = Calendar.day(), s = Calendar.season(), fe = Calendar.festa();
    const next = FESTES.map((f) => ({ f, in: ((f.day - Calendar.yearDay() + YEAR_DAYS) % YEAR_DAYS) })).sort((a, b) => a.in - b.in);
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
    const w = Weather.kind, wx = { clear: '☀️ Sunny', rain: '🌧️ Rain', storm: '⛈️ Storms', snow: '❄️ Snow', fog: '🌫️ Fog' }[w] || '☀️ Sunny';
    // metro and town news
    let metro = 'The metro runs as usual.';
    try {
      const all = typeof MetroNet !== 'undefined' ? MetroNet.all() : [];
      const st = all.reduce((a, n) => a + n.stations.length, 0);
      const names = G.world.metro && G.world.metro.names || [];
      if (all.length) metro = all.length + ' line' + (all.length > 1 ? 's' : '') + ' and ' + st + ' stations.' + (names.length ? ' Newest station: ' + names[names.length - 1].name + '.' : '');
    } catch (e) { /* ignore */ }
    const plots = typeof Claims !== 'undefined' ? Claims.map.size : 0;
    const people = typeof Net !== 'undefined' && Net.on ? Net.peers.size + 1 : 1;
    const head = fe ? { t: fe.name + ' today!', s: fe.text + '. Everybody is invited.' } :
      next[0].in === 1 ? { t: 'Tomorrow: ' + next[0].f.name, s: next[0].f.text + '.' } :
      Calendar.yearDay() % SEASON_DAYS === 0 ? { t: s.ca + ' arrives in STUCOM', s: s.k === 'autumn' ? 'The trees turn orange and red.' : s.k === 'winter' ? 'Snow is expected all over the map.' : s.k === 'spring' ? 'Everything is green again.' : 'Long, warm days ahead.' } :
      { t: this.pick(HEADLINES, d, 1), s: 'Our reporters are on the story.' };
    const ad1 = this.pick(ADS, d, 2), ad2 = this.pick(ADS, d, 3), ad3 = this.pick(ADS, d + 1, 4);
    this.el.innerHTML = `<article class="np">
      <button class="np-x" title="Close">✕</button>
      <header><div class="np-date">${esc(Calendar.dateText())}</div><h1>La Gaseta de STUCOM</h1><div class="np-sub">Daily newspaper of the neighbourhood · No. ${d + 1} · 1 coin</div></header>
      <section class="np-main"><h2>${esc(head.t)}</h2><p>${esc(head.s)}</p></section>
      <div class="np-cols">
        <section><h3>Weather</h3><p class="np-big">${wx}</p><p>${s.icon} ${esc(s.ca)}, day ${Calendar.yearDay() % SEASON_DAYS + 1} of ${SEASON_DAYS}. ${s.k === 'winter' ? 'Wrap up warm.' : s.k === 'autumn' ? 'Leaves on the pavements.' : s.k === 'summer' ? 'Do not forget the sunscreen.' : 'Flowers everywhere.'}</p></section>
        <section><h3>Metro</h3><p>${esc(metro)}</p><p>Cards: 10 trips for 20 coins at the machines by the gates.</p></section>
        <section><h3>Town</h3><p>${people > 1 ? people + ' neighbours online today.' : 'A quiet day in the neighbourhood.'} ${plots ? plots + ' plot' + (plots > 1 ? 's are' : ' is') + ' claimed.' : 'Plots are still free: claim yours with a Plot Stone.'}</p><p>Your savings: ${G.mode === 'creative' ? 'unlimited' : (G.money | 0) + ' coins'}.</p></section>
        <section><h3>Agenda</h3>${next.map((n) => `<p>${n.f.icon} <b>${esc(n.f.name)}</b> · ${n.in === 0 ? 'today' : 'in ' + n.in + ' day' + (n.in > 1 ? 's' : '')}</p>`).join('')}</section>
      </div>
      <footer class="np-ads">${[ad1, ad2, ad3].map((a) => `<div><i>${a[0]}</i><b>${esc(a[1])}</b><span>${esc(a[2])}</span></div>`).join('')}</footer>
    </article>`;
    this.el.querySelector('.np-x').addEventListener('click', () => this.close());
  },
};

// ---------------------------------------------------------------- hooks ----
{
  window.addEventListener('keydown', (e) => {
    if (Newspaper.open) { if (e.code === 'Escape' || e.code === 'KeyU') { e.preventDefault(); e.stopImmediatePropagation(); Newspaper.close(); } return; }
    if (e.code === 'KeyU' && G.playing && !G.screenOpen && !e.repeat && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); Newspaper.show(); }
  }, true);
  // the kiosk in the square sells the paper (right-click its counter)
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target, b = t && t.block;
    if (initial && b && !G.player.sneaking && Calendar.square()) {
      const sq = Calendar.square();
      if (Math.hypot(b.pos[0] - sq[0], b.pos[2] - sq[2]) < 30 && (b.id === B.CONCRETE + 13 || b.id === B.CRATE)) { Newspaper.show(); this.swingHand(); return true; }
    }
    return use.call(this, initial);
  };
}
