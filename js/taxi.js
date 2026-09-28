'use strict';
// Taxi: a job for anyone with a driving licence. Get a taxi (the "Taxi" app on a computer, or
// /taxi): a yellow car appears next to you. While you drive it, people wave for a taxi on the
// pavements of the STUCOM district (a golden sparkle over them, and the arrow on the meter points
// the way). Pull up next to them and stop: they get in and tell you where to go. Drive there and
// stop: the meter says the fare, plus a tip if you were quick. Get out with a passenger on board
// and they leave without paying.

const TAXI_STREETS = [
  { name: 'Carrer de Pelai', test: (u, v) => Math.abs(v + 23) < 5 && Math.abs(u) < 30 },
  { name: 'Carrer de Balmes', test: (u, v) => Math.abs(u - 22) < 5 && Math.abs(v) < 30 },
  { name: 'Gran Via', test: (u, v) => Math.abs(v - 22) < 5 && Math.abs(u) < 30 },
  { name: 'Ronda de Sant Antoni', test: (u, v) => Math.abs(u + 23) < 5 && Math.abs(v) < 30 },
  { name: 'Ronda del Mig', test: () => true },
];
const TAXI_NAMES = ['Marta', 'Jordi', 'Laia', 'Pol', 'Núria', 'Arnau', 'Carla', 'Marc', 'Anna', 'Oriol', 'Júlia', 'Biel', 'Sara', 'Eric', 'Clara', 'Nil'];
const TAXI_LINES = ['Al {d}, si us plau!', 'Em porta a {d}? Tinc pressa!', 'A {d}, gràcies.', 'Bon dia! Vaig a {d}.', '{d}, i no corri gaire, eh?'];

const Taxi = {
  job: null,      // { state: 'seek' | 'ride', mob, pick, dest, t, dist, fare }
  hud: null,
  get() {
    const p = G.player;
    for (const v of Vehicles.list) if (v.taxi && !v.removed && G.vehicle !== v) v.removed = true;
    const yaw = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    const x = p.pos[0] - Math.sin(p.yaw) * 4, z = p.pos[2] - Math.cos(p.yaw) * 4;
    const v = Rides.spawn('car', x, p.pos[1] + 0.5, z, yaw, 2);
    v.taxi = true;
    sfx('horn', v.pos, 0.6, 1.2);
    G.ui.toast('🚕 Your taxi is here: get in (right-click) and look for people waving', 4000);
  },
  // a point on a pavement of the district, beside one of the bus routes
  spot(minD, maxD, from) {
    if (!Bus.lines) return null;
    const lines = Object.values(Bus.lines);
    for (let tries = 0; tries < 40; tries++) {
      const R = lines[Math.floor(Math.random() * lines.length)];
      const i = Math.floor(Math.random() * R.pts.length), a = R.pts[i], b = R.pts[(i + 1) % R.pts.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, fx = (b[0] - a[0]) / l, fz = (b[1] - a[1]) / l;
      const u = a[0] - fz * 3, v = a[1] + fx * 3;
      const x = R.cx + u + 0.5, z = R.cz + v + 0.5;
      const d = Math.hypot(x - from[0], z - from[2]);
      if (d < minD || d > maxD) continue;
      const lane = [R.cx + a[0] + 0.5, R.cz + a[1] + 0.5];
      const st = TAXI_STREETS.find((s) => s.test(u, v));
      return { x, z, y: R.F, lane, name: st.name + ', ' + (2 + Math.floor(Math.random() * 90)) };
    }
    return null;
  },
  update(dt) {
    const v = G.vehicle;
    const driving = v && v.taxi;
    const j = this.job;
    if (!driving) {
      if (j) {
        if (j.state === 'ride') { G.ui.toast('😠 ' + j.name + ' got out without paying'); this.dropOff(j); }
        else if (j.mob) j.mob.removed = true;
        this.job = null;
      }
      this.showHud(null);
      return;
    }
    if (!j) {
      const s = this.spot(25, 110, v.pos);
      if (!s) { this.showHud('<b>🚕 Free</b><span>Drive into the STUCOM district to find customers</span>'); return; }
      const m = Ents.spawnMob('villager', s.x, s.y + 0.05, s.z);
      m.prof = 'student'; m.skin = STUDENT_SKINS.length ? STUDENT_SKINS[Math.floor(Math.random() * STUDENT_SKINS.length)] : m.skin;
      m.home = [s.x, s.z]; m.homeR = 0.5; m.taxiFare = true;
      this.job = { state: 'seek', mob: m, pick: s, t: 0, name: TAXI_NAMES[Math.floor(Math.random() * TAXI_NAMES.length)] };
      return;
    }
    j.t += dt;
    const m = j.mob;
    if (j.state === 'seek') {
      if (!m || m.dead || m.removed || j.t > 160) { if (m) m.removed = true; this.job = null; return; }
      m.pos[0] = j.pick.x; m.pos[2] = j.pick.z; m.vel && (m.vel[0] = m.vel[2] = 0);
      m.bodyYaw = m.headYaw = Math.atan2(v.pos[0] - m.pos[0], v.pos[2] - m.pos[2]);
      if (Math.random() < dt * 8) Particles.add(Particles.base(m.pos[0] + rand(-0.3, 0.3), m.pos[1] + 2.3 + rand(0, 0.4), m.pos[2] + rand(-0.3, 0.3), { vy: rand(0.4, 0.9), life: 0.9, max: 0.9, size: 0.09, layer: T.p_crit, r: 1, g: 0.85, b: 0.2, glow: true, collide: false, shrink: true }));
      const d = Math.hypot(v.pos[0] - m.pos[0], v.pos[2] - m.pos[2]);
      this.showHud(`<b>🙋 ${GPanel.esc(j.name)} is waving</b><span>${GPanel.esc(j.pick.name)}</span><em>${this.arrow(m.pos)} ${Math.round(d)} m</em>`);
      if (d < 5.5 && Math.abs(v.speed) < 1.5) {
        // in they get, and say where
        const dest = this.spot(45, 160, m.pos) || this.spot(20, 200, m.pos);
        if (!dest) return;
        j.state = 'ride'; j.dest = dest; j.t = 0; j.start = [v.pos[0], v.pos[2]]; j.odo = 0; j.last = [v.pos[0], v.pos[2]];
        j.best = Math.hypot(dest.x - v.pos[0], dest.z - v.pos[2]) / 7 + 12;
        sfx('door_close', v.pos, 0.8, 1.2);
        const line = TAXI_LINES[Math.floor(Math.random() * TAXI_LINES.length)].replace('{d}', dest.name);
        G.ui.toast('🚕 ' + j.name + ': “' + line + '”', 4500);
      }
    } else {
      // the passenger rides in the back seat
      const seat = v.toWorld(PASSENGER_SEATS.car[1]);
      if (m && !m.removed) { m.pos = [seat[0], seat[1] - 0.75, seat[2]]; m.vel && (m.vel[0] = m.vel[1] = m.vel[2] = 0); m.bodyYaw = m.headYaw = v.yaw; }
      j.odo += Math.hypot(v.pos[0] - j.last[0], v.pos[2] - j.last[1]); j.last = [v.pos[0], v.pos[2]];
      j.fare = Math.round(5 + j.odo * 0.09);
      const d = Math.hypot(v.pos[0] - j.dest.x, v.pos[2] - j.dest.z);
      if (Math.random() < dt * 10) {
        const y = j.dest.y;
        Particles.add(Particles.base(j.dest.lane[0] + rand(-0.6, 0.6), y + rand(0, 6), j.dest.lane[1] + rand(-0.6, 0.6), { vy: rand(1, 2), life: 1.2, max: 1.2, size: 0.12, layer: T.p_crit, r: 0.3, g: 1, b: 0.5, glow: true, collide: false, shrink: true }));
      }
      const quick = j.t < j.best;
      this.showHud(`<b>🚕 ${GPanel.esc(j.name)} → ${GPanel.esc(j.dest.name)}</b><span>Meter 🪙 ${j.fare} · ${Math.floor(j.t / 60)}:${String(Math.floor(j.t % 60)).padStart(2, '0')} ${quick ? '⚡ tip on time' : ''}</span><em>${this.arrow([j.dest.x, 0, j.dest.z])} ${Math.round(d)} m</em>`);
      if (d < 8 && Math.abs(v.speed) < 1.5) {
        const tip = quick ? Math.max(2, Math.round(j.fare * 0.3)) : 0;
        Shops.earn(j.fare + tip);
        const pr = G.prog || (G.prog = {});
        pr.taxi = pr.taxi || { rides: 0, earned: 0 };
        pr.taxi.rides++; pr.taxi.earned += j.fare + tip;
        G.ui.banner('🚕', j.name + ' paid ' + j.fare + ' coins' + (tip ? ' + ' + tip + ' tip' : '') + ' · ride ' + pr.taxi.rides);
        sfx('shop_till', null, 0.8, 1);
        this.dropOff(j);
        this.job = null;
        this.pause = 3;
      }
    }
  },
  dropOff(j) {
    const m = j.mob, v = G.vehicle || null;
    if (!m) return;
    if (v) { const side = v.toWorld([2.2, 0.5, 0]); m.pos = [side[0], side[1], side[2]]; }
    m.home = [m.pos[0] + rand(-8, 8), m.pos[2] + rand(-8, 8)]; m.homeR = 3;
    setTimeout(() => { m.removed = true; }, 9000);
  },
  arrow(pos) {
    const p = G.player, rel = Math.atan2(pos[0] - p.pos[0], pos[2] - p.pos[2]);
    const look = Math.atan2(-Math.sin(p.yaw), -Math.cos(p.yaw));
    let k = rel - look; while (k < -Math.PI) k += 2 * Math.PI; while (k > Math.PI) k -= 2 * Math.PI;
    return `<i style="display:inline-block;transform:rotate(${(-k * 180 / Math.PI).toFixed(0)}deg)">⬆</i>`;
  },
  showHud(html) {
    let el = $('taxiHud');
    if (!html) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'taxiHud'; document.body.append(el); }
    if (el._h !== html) { el.innerHTML = html; el._h = html; }
    el.classList.add('show');
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const fu = Furniture.update;
  Furniture.update = function (dt) {
    fu.call(this, dt);
    if (Taxi.pause > 0) { Taxi.pause -= dt || 0.016; return; }
    Taxi.update(dt || 0.016);
  };
  PC.add({ key: 'taxi', icon: '🚕', name: 'Taxi', closes: true, run() { Taxi.get(); } });
  const run = Commands.run;
  Commands.run = function (text) { if (/^\/taxi\b/i.test(text)) { Taxi.get(); return; } return run.call(this, text); };
  // the waiting customer is not a trader
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && t.mob.taxiFare) { G.ui.toast('🙋 “Taxi! Are you free?” (get in your taxi and stop next to me)'); this.swingHand(); return true; }
    return use.call(this, initial);
  };
}
