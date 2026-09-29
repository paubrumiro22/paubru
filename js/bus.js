'use strict';
// Buses in the STUCOM district: two lines that run by themselves while you are around (like the
// metro train, each player's game drives its own buses and never saves them).
// - L1 "Ronda STUCOM" (red) round the square: STUCOM, Banc Central, Plaça Universitat, Camp de Futbol.
// - L2 "Circumval·lació" (blue) round the outer ring road, past the plots and the park.
// Stops have shelters with the line's timetable (district.js, BUS_STOPS). Standing at a stop shows
// when the next bus comes; right-click the bus to get on (2 coins, or free in creative), Shift to
// get off. On board the next stop is announced. B opens the transport map: streets, both bus
// lines with their stops and every metro line with its stations, and where you are.

const BUS_LINES = {
  1: { name: 'Ronda STUCOM', color: '#e3262f', loop: [[-23, -23], [22, -23], [22, 22], [-23, 22]] },
  2: { name: 'Circumval·lació', color: '#2a6ce0', loop: [[-69, -69], [68, -69], [68, 68], [-69, 68]] },
};
const BUS_MAX = 8, BUS_ACC = 2.2, BUS_DEC = 2.6, BUS_DWELL = 7, BUS_FARE = 2;

const Bus = {
  lines: null, key: null, buses: {}, hud: null,
  plan() {
    const w = G.world;
    try { const s = w && w.gen && w.gen.structs && typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null; return s && s.district ? s : null; } catch (e) { return null; }
  },
  // the routes as dense polylines with rounded corners, and where each stop is along them
  build(pl) {
    const out = {};
    for (const [n, L] of Object.entries(BUS_LINES)) {
      const pts = [], R = 4, c = L.loop;
      for (let i = 0; i < c.length; i++) {
        const a = c[i], b = c[(i + 1) % c.length], nx = c[(i + 2) % c.length];
        const d1 = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])], d2 = [Math.sign(nx[0] - b[0]), Math.sign(nx[1] - b[1])];
        const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
        for (let t = i === 0 ? R : R; t <= len - R; t += 0.5) pts.push([a[0] + d1[0] * t, a[1] + d1[1] * t]);
        // quarter turn round the corner at b
        const p0 = [b[0] - d1[0] * R, b[1] - d1[1] * R], ctr = [p0[0] + d2[0] * R, p0[1] + d2[1] * R];
        const a0 = Math.atan2(p0[1] - ctr[1], p0[0] - ctr[0]), p1 = [b[0] + d2[0] * R, b[1] + d2[1] * R], a1 = Math.atan2(p1[1] - ctr[1], p1[0] - ctr[0]);
        let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
        for (let k = 1; k < 8; k++) { const q = a0 + da * k / 8; pts.push([ctr[0] + Math.cos(q) * R, ctr[1] + Math.sin(q) * R]); }
      }
      const s = [0];
      for (let i = 1; i <= pts.length; i++) { const p = pts[i % pts.length], q = pts[i - 1]; s.push(s[i - 1] + Math.hypot(p[0] - q[0], p[1] - q[1])); }
      const total = s[pts.length];
      const stops = BUS_STOPS.filter((st) => st.line === Number(n)).map((st) => {
        let bi = 0, bd = Infinity;
        pts.forEach((p, i) => { const d = Math.hypot(p[0] - st.u, p[1] - st.v); if (d < bd) { bd = d; bi = i; } });
        return { name: st.name, s: s[bi], u: st.u, v: st.v, su: st.su !== undefined ? st.su : st.u, sv: st.sv !== undefined ? st.sv : st.v };
      }).sort((a, b) => a.s - b.s);
      // the timetable: from each stop to the next, then the wait there (the same for everybody)
      let t = 0;
      const legs = stops.map((st, i) => {
        const nx = stops[(i + 1) % stops.length], len = ((nx.s - st.s) % total + total) % total || total;
        const prof = runProfile(len, BUS_MAX, BUS_ACC), l = { from: i, to: (i + 1) % stops.length, s0: st.s, len, prof, t0: t, arr: t + prof.tt };
        t = l.arr + BUS_DWELL;
        return l;
      });
      out[n] = { n: Number(n), L, pts, s, total, stops, legs, cycle: t, cx: pl.x, cz: pl.z, F: pl.y };
    }
    return out;
  },
  at(R, s) {
    s = ((s % R.total) + R.total) % R.total;
    let lo = 0, hi = R.pts.length;
    while (lo < hi - 1) { const m = (lo + hi) >> 1; if (R.s[m] <= s) lo = m; else hi = m; }
    const a = R.pts[lo], b = R.pts[(lo + 1) % R.pts.length], t = (s - R.s[lo]) / Math.max(1e-6, R.s[lo + 1] - R.s[lo]);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[0] - a[0], b[1] - a[1])];
  },
  ahead(R, from, to) { return ((to - from) % R.total + R.total) % R.total; },

  update(dt) {
    const pl = this.plan();
    const p = G.player;
    if (!pl) { this.clear(); return; }
    const key = G.world.seed + ':' + pl.x + ':' + pl.z;
    if (this.key !== key) { this.clear(); this.key = key; this.lines = this.build(pl); }
    const near = Math.hypot(p.pos[0] - pl.x, p.pos[2] - pl.z) < 150 && Math.abs(p.pos[1] - pl.y) < 40;
    for (const R of Object.values(this.lines)) {
      let b = this.buses[R.n];
      if (b && (b.v.removed || !Vehicles.list.includes(b.v))) { b = this.buses[R.n] = null; }
      if (!near) { if (b && G.vehicle !== b.v) { b.v.removed = true; this.buses[R.n] = null; } continue; }
      if (!b) {
        const v2 = Rides.spawn('bus', R.cx + 0.5, R.F, R.cz + 0.5, 0, R.n === 1 ? 0 : 1);
        v2.scripted = true; v2.busLine = R.n; v2.onGround = true;
        b = this.buses[R.n] = { v: v2, s: 0, speed: 0, state: 'run', t: 0, stop: 0, said: false, first: true };
      }
      this.drive(R, b, dt);
    }
    this.updateHud(dt);
  },
  phase(R) { return (((Date.now() / 1000 + R.n * 97) % R.cycle) + R.cycle) % R.cycle; },
  drive(R, b, dt) {
    const v = b.v, ph = this.phase(R);
    let l = R.legs[0];
    for (const q of R.legs) if (q.t0 <= ph) l = q;
    const dtl = ph - l.t0, run = dtl < l.prof.tt;
    const [d, sp] = run ? l.prof.at(dtl) : [l.len, 0];
    const was = { state: b.state, stop: b.stop };
    b.s = (l.s0 + d) % R.total; b.speed = sp; b.stop = l.to;
    b.state = run ? 'run' : 'dwell'; b.t = run ? 0 : l.arr + BUS_DWELL - ph;
    const st = R.stops[l.to];
    if (!b.first) {
      if (run && was.stop !== b.stop) { b.said = false; sfx('metro_doors', v.pos, 0.6, 1.2); }
      if (run && !b.said && l.len - d < 30) { b.said = true; if (G.vehicle === v) this.sign(R, 'Next stop: ' + st.name, 'Press the bell · Shift to get off'); sfx('bell', v.pos, 0.6, 1); }
      if (!run && was.state === 'run') {
        sfx('metro_doors', v.pos, 0.6, 1);
        if (G.vehicle === v) this.sign(R, st.name, 'Doors open · L' + R.n + ' ' + R.L.name);
      }
    }
    const [u, w, yaw] = this.at(R, b.s);
    v.pos = [R.cx + u + 0.5, R.F, R.cz + w + 0.5];
    let dy = yaw - v.yaw; while (dy > Math.PI) dy -= 2 * Math.PI; while (dy < -Math.PI) dy += 2 * Math.PI;
    v.yaw = b.first ? yaw : v.yaw + dy * Math.min(1, dt * 6);
    b.first = false;
    v.pitch = 0; v.roll = 0; v.speed = b.speed; v.vel = [0, 0, 0]; v.onGround = true;
    v.rpm = 0.2 + b.speed / BUS_MAX * 0.7;
    if (v.basis) v.basis();
  },
  sign(R, title, sub) {
    this.signing = true;
    try { Metro.showSign(title, sub); } finally { this.signing = false; }
    const i = Metro.sign && Metro.sign.querySelector('i');
    if (i) { i.textContent = R.n; i.style.background = R.L.color; i.style.borderRadius = '8px'; }
  },
  clear() { for (const b of Object.values(this.buses)) if (b && b.v && G.vehicle !== b.v) b.v.removed = true; this.buses = {}; },

  // when is the next bus at this stop?
  eta(R, stopIdx) {
    const ph = this.phase(R), l = R.legs.find((q) => q.to === stopIdx);
    if (!l) return null;
    if (ph >= l.arr && ph < l.arr + BUS_DWELL) return 0;
    return ((l.arr - ph) % R.cycle + R.cycle) % R.cycle;
  },
  updateHud(dt) {
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT > 0) return;
    this.hudT = 0.5;
    const p = G.player;
    let el = $('busHud');
    let best = null;
    if (!G.vehicle && this.lines) for (const R of Object.values(this.lines)) R.stops.forEach((st, i) => {
      const x = R.cx + (st.su + st.u) / 2, z = R.cz + (st.sv + st.v) / 2;
      const d = Math.hypot(p.pos[0] - x - 0.5, p.pos[2] - z - 0.5);
      if (d < 5 && Math.abs(p.pos[1] - R.F) < 3 && (!best || d < best.d)) best = { d, name: st.name, R, i };
    });
    if (!best) { if (el) el.classList.remove('show'); return; }
    if (!el) { el = document.createElement('div'); el.id = 'busHud'; document.body.append(el); }
    const rows = Object.values(this.lines).map((R) => {
      const i = R.stops.findIndex((st) => st.name === best.name);
      if (i < 0) return '';
      const t = this.eta(R, i);
      const txt = t === null ? '—' : t < 2 ? 'now' : t < 60 ? Math.round(t) + ' s' : Math.floor(t / 60) + ' min ' + Math.round(t % 60) + ' s';
      return `<div><i style="background:${R.L.color}">L${R.n}</i><span>${GPanel.esc(R.L.name)}</span><b>${txt}</b></div>`;
    }).join('');
    el.innerHTML = `<h4>🚏 ${GPanel.esc(best.name)}</h4>${rows}<small>B · transport map</small>`;
    el.classList.add('show');
  },
};

// ---------------------------------------------------------------- the transport map ----
const TransportMap = {
  p: null,
  open() {
    if (this.p) { this.p.close(); return; }
    this.p = GPanel.open({ title: 'Transport map', sub: 'Bus and metro', icon: '🗺️', width: 760, onClose: () => { this.p = null; clearInterval(this.iv); } });
    this.p.body.innerHTML = '<canvas class="tm-c" width="1100" height="820"></canvas><div class="tm-leg"></div>';
    this.draw();
    this.iv = setInterval(() => this.draw(), 1000);
  },
  draw() {
    const p = this.p;
    if (!p) return;
    const c = p.body.querySelector('canvas'), g = c.getContext('2d'), W = c.width, H = c.height;
    const pl = Bus.plan(), lines = Bus.lines || (pl ? Bus.build(pl) : null);
    const metro = typeof MetroNet !== 'undefined' ? MetroNet.all() : [];
    // bounds: the district and every metro line
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    const grow = (x, z) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); };
    if (pl) { grow(pl.x - 80, pl.z - 80); grow(pl.x + 80, pl.z + 80); }
    for (const N of metro) for (let i = 0; i < N.path.length; i += 4) grow(N.path[i][0], N.path[i][2]);
    const me = G.player.pos;
    grow(me[0], me[2]);
    if (!Number.isFinite(x0)) { grow(me[0] - 60, me[2] - 60); grow(me[0] + 60, me[2] + 60); }
    const pad = 40, k = Math.min((W - pad * 2) / (x1 - x0 || 1), (H - pad * 2) / (z1 - z0 || 1));
    const ox = (W - (x1 - x0) * k) / 2, oz = (H - (z1 - z0) * k) / 2;
    const X = (x) => ox + (x - x0) * k, Z = (z) => oz + (z - z0) * k;
    g.fillStyle = '#eef1ea'; g.fillRect(0, 0, W, H);
    // the district: blocks and streets
    if (pl) {
      g.fillStyle = '#c9cfc6'; g.fillRect(X(pl.x - 74), Z(pl.z - 74), 148 * k, 148 * k);
      const blocks = [[-18, -18, 'Plaça Universitat', '#e9e3d3'], [-18, -64, 'STUCOM', '#f2dfc2'], [28, -18, 'Banc Central', '#e6dccb'], [-64, -18, 'Camp de Futbol', '#bfe0b5'], [-18, 28, 'Parc', '#bfe0b5'],
        [-64, -64, 'Solars', '#dde8d2'], [28, -64, 'Solars', '#dde8d2'], [-64, 28, 'Solars', '#dde8d2'], [28, 28, 'Solars', '#dde8d2']];
      g.font = `700 ${Math.max(16, 3.2 * k)}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const [u, v, name, col] of blocks) {
        g.fillStyle = col;
        g.beginPath(); g.roundRect(X(pl.x + u), Z(pl.z + v), 36 * k, 36 * k, 5 * k); g.fill();
        g.fillStyle = '#5a6068'; g.fillText(name, X(pl.x + u + 18), Z(pl.z + v + 18));
      }
    }
    // metro lines under the streets
    for (const N of metro) {
      g.strokeStyle = N.color; g.lineWidth = 6; g.lineJoin = 'round'; g.globalAlpha = 0.85;
      g.beginPath(); N.path.forEach((q, i) => (i ? g.lineTo(X(q[0] + 0.5), Z(q[2] + 0.5)) : g.moveTo(X(q[0] + 0.5), Z(q[2] + 0.5)))); g.stroke();
      g.globalAlpha = 1;
      for (const st of N.stations) {
        const q = N.path[st.hp];
        if (!q) continue;
        g.fillStyle = '#fff'; g.strokeStyle = N.color; g.lineWidth = 3;
        g.beginPath(); g.arc(X(q[0] + 0.5), Z(q[2] + 0.5), 7, 0, 7); g.fill(); g.stroke();
        g.fillStyle = '#20242c'; g.font = '800 19px Arial'; g.textAlign = 'left'; g.fillText('Ⓜ ' + st.name, X(q[0] + 0.5) + 10, Z(q[2] + 0.5) - 10);
      }
      // the trains, where the timetable has them now
      g.font = '24px serif'; g.textAlign = 'center';
      for (const q of Metro.positions(N)) g.fillText('🚇', X(q.x), Z(q.z) + 8);
    }
    // bus lines
    if (lines) for (const R of Object.values(lines)) {
      g.strokeStyle = R.L.color; g.lineWidth = 5; g.setLineDash([14, 8]);
      g.beginPath(); R.pts.forEach((q, i) => (i ? g.lineTo(X(R.cx + q[0]), Z(R.cz + q[1])) : g.moveTo(X(R.cx + q[0]), Z(R.cz + q[1])))); g.closePath(); g.stroke();
      g.setLineDash([]);
      for (const st of R.stops) {
        const x = X(R.cx + st.u), z = Z(R.cz + st.v);
        g.fillStyle = R.L.color; g.beginPath(); g.roundRect(x - 12, z - 12, 24, 24, 5); g.fill();
        g.fillStyle = '#fff'; g.font = '900 13px Arial'; g.textAlign = 'center'; g.fillText('L' + R.n, x, z + 1);
        g.fillStyle = '#20242c'; g.font = '700 17px Arial'; g.textAlign = 'left'; g.fillText(st.name, x + 13, z + 18);
      }
      const b = Bus.buses[R.n];
      if (b) { const [u, v] = Bus.at(R, b.s); g.font = '30px serif'; g.textAlign = 'center'; g.fillText('🚌', X(R.cx + u), Z(R.cz + v)); }
    }
    // you
    const yx = X(me[0]), yz = Z(me[2]), a = G.player.yaw;
    g.save(); g.translate(yx, yz); g.rotate(-a + Math.PI);
    g.fillStyle = '#ff9d2e'; g.strokeStyle = '#fff'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 10); g.lineTo(0, 5); g.lineTo(-10, 10); g.closePath(); g.fill(); g.stroke();
    g.restore();
    const leg = p.body.querySelector('.tm-leg');
    leg.innerHTML = (lines ? Object.values(lines).map((R) => `<span><i style="background:${R.L.color}">L${R.n}</i>🚌 ${GPanel.esc(R.L.name)}</span>`).join('') : '') +
      metro.map((N) => `<span><i style="background:${N.color}">L${N.n}</i>Ⓜ ${GPanel.esc(N.stations[0] ? N.stations[0].name : '')} – ${GPanel.esc(N.stations[N.stations.length - 1] ? N.stations[N.stations.length - 1].name : '')}</span>`).join('') +
      '<span><b style="color:#ff9d2e">▲</b> You</span>';
  },
};

// timetables in the shelters
for (const n of [1, 2]) {
  PIC_BUILTIN['bus_line' + n] = { w: 1, h: 1, draw(g, W, H) {
    const L = BUS_LINES[n], u = W / 100;
    g.fillStyle = '#fbfbf7'; g.fillRect(0, 0, W, H);
    g.fillStyle = L.color; g.fillRect(0, 0, W, 22 * u);
    g.fillStyle = '#fff'; g.font = `900 ${13 * u}px Arial`; g.textBaseline = 'middle'; g.fillText('L' + n, 5 * u, 11 * u);
    g.font = `700 ${7.5 * u}px Arial`; g.fillText(L.name, 26 * u, 11 * u);
    const stops = BUS_STOPS.filter((s) => s.line === n);
    stops.forEach((s, i) => {
      const y = 32 * u + i * 16 * u;
      g.fillStyle = L.color; g.beginPath(); g.arc(9 * u, y, 3.2 * u, 0, 7); g.fill();
      if (i < stops.length - 1) g.fillRect(8.2 * u, y, 1.6 * u, 16 * u);
      g.fillStyle = '#20242c'; g.font = `700 ${7 * u}px Arial`; g.fillText(s.name, 16 * u, y);
    });
    g.fillStyle = '#6a7080'; g.font = `600 ${6 * u}px Arial`; g.fillText('Every ~2 min · 2 🪙', 5 * u, 94 * u);
  } };
}

// ---------------------------------------------------------------- hooks ----
{
  const idle = Ride.prototype.updateIdle;
  Ride.prototype.updateIdle = function (dt) { if (this.busLine) { if (this.basis) this.basis(); return; } return idle.call(this, dt); };
  const pilot = Rides.pilot;
  Rides.pilot = function (v, dt, input, horn) {
    if (!v.busLine) return pilot.call(this, v, dt, input, horn);
    const p = G.player, at = v.toWorld(PASSENGER_SEATS.bus[1]);
    p.pos = [at[0], at[1] - 0.75, at[2]];
    p.vel = [0, 0, 0]; p.onGround = true; p.fallStart = null; p.landed = 0;
    this.updateMotor(v);
  };
  const board = Rides.board;
  Rides.board = function (v) {
    if (v.busLine) {
      const b = Bus.buses[v.busLine];
      if (b && b.state !== 'dwell' && b.speed > 1.5) { G.ui.toast('🚌 Wait for the bus to stop'); return; }
      if (!Shops.pay(BUS_FARE)) { G.ui.toast('🚌 The bus costs ' + BUS_FARE + ' coins'); return; }
      board.call(this, v);
      const R = Bus.lines[v.busLine];
      G.ui.toast('🚌 L' + v.busLine + ' ' + R.L.name + (G.mode === 'creative' ? '' : ' · ' + BUS_FARE + ' coins') + ' · Shift to get off', 3500);
      return;
    }
    return board.call(this, v);
  };
  const ser = Vehicles.serialize;
  Vehicles.serialize = function () {
    const keep = this.list;
    this.list = keep.filter((v) => !v.busLine);
    try { return ser.call(this); } finally { this.list = keep; }
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Bus.update(dt || 0.016); };
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'KeyB' || e.repeat || !G.playing || (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName))) return;
    if (G.screenOpen && !TransportMap.p) return;
    e.preventDefault();
    TransportMap.open();
  });
  PC.add({ key: 'transport', icon: '🗺️', name: 'Transport', run() { TransportMap.open(); } });
  // the metro's own sign keeps its M
  const show = Metro.showSign;
  Metro.showSign = function (t, s) {
    show.call(this, t, s);
    const i = this.sign && this.sign.querySelector('i');
    if (i && !Bus.signing) { i.textContent = 'M'; i.style.background = ''; i.style.borderRadius = ''; }
  };
}
