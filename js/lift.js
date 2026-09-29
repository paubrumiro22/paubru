'use strict';
// Lifts: a column of Lift Floor plates (one per floor, anywhere in the same x/z) is a lift. Step
// onto a plate and the floor buttons come up; pick one and the cabin carries you there smoothly,
// with the floor shown on the way and a chime on arrival. STUCOM has a glass one (district.js),
// and players can build their own: stack plates in a shaft and put doors in front.

const LIFT_REACH = 64;

const Lift = {
  ride: null,        // { x, z, y0, y1, t, dur, stops, idx }
  asked: null,       // the plate we already offered the buttons for
  panel: null,

  // the stops of the lift whose shaft is x, z: the y you stand at on each plate, bottom up
  stops(x, z, y) {
    const w = G.world, out = [];
    for (let yy = Math.max(0, y - LIFT_REACH); yy < Math.min(CH, y + LIFT_REACH); yy++) if (w.getBlock(x, yy, z) === B.LIFT_FLOOR) out.push(yy + 1);
    return out;
  },
  label(i, stops) {
    if (i === 0) return ED('Planta baixa', 'Ground floor');
    const w = G.world, s = stops[i];
    let open = true;
    for (let y = s + 3; y < Math.min(CH, s + 24); y++) if (BLOCK_SOLID[w.getBlock(this.px, y, this.pz)] && w.getBlock(this.px, y, this.pz) !== B.GLOWSTONE) { open = false; break; }
    return i === stops.length - 1 && (open || stops.length > 2 && s - stops[i - 1] > 6) ? ED('Terrat', 'Roof') : ED('Planta ', 'Floor ') + i;
  },
  short(i, stops) { const l = this.label(i, stops); return i === 0 ? '0' : l === ED('Terrat', 'Roof') ? ED('T', 'R') : String(i); },

  update(dt) {
    const p = G.player;
    if (this.ride) return;
    if (G.screenOpen || G.vehicle || p.seat || p.flying) return;
    const x = Math.floor(p.pos[0]), z = Math.floor(p.pos[2]), y = Math.floor(p.pos[1] - 0.2);
    const on = p.onGround && G.world.getBlock(x, y, z) === B.LIFT_FLOOR;
    const key = on ? x + ',' + y + ',' + z : null;
    if (!on) { this.asked = null; return; }
    if (this.asked === key) return;
    this.asked = key;
    const stops = this.stops(x, z, y + 1);
    if (stops.length < 2) return;
    this.px = x; this.pz = z;
    this.offer(x, z, stops, stops.indexOf(y + 1));
  },

  offer(x, z, stops, cur) {
    const p = GPanel.open({ title: 'Ascensor', sub: 'Tria la planta', icon: '🛗', cls: 'gp-lift', width: 300 });
    this.panel = p;
    p.onClose = () => { this.panel = null; };
    const btns = stops.map((s, i) => `<button class="lift-b${i === cur ? ' cur' : ''}" data-i="${i}"><b>${this.short(i, stops)}</b><span>${GPanel.esc(this.label(i, stops))}</span></button>`).reverse().join('');
    p.body.innerHTML = `<div class="lift-grid">${btns}</div><p class="gp-dim" style="text-align:center;margin:10px 0 0">Keys 0–${stops.length - 1} · Esc to stay</p>`;
    const go = (i) => { if (i === cur || i < 0 || i >= stops.length) return; p.close(); this.go(x, z, stops, cur, i); };
    p.body.querySelectorAll('.lift-b').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.i))));
    p.onKey = (e) => {
      const m = /^(?:Digit|Numpad)(\d)$/.exec(e.code);
      if (m) { go(Number(m[1])); return true; }
      if (e.code === 'KeyT') { go(stops.length - 1); return true; }
      return false;
    };
  },

  go(x, z, stops, from, to) {
    const y0 = stops[from], y1 = stops[to];
    // 1.2 s to get going and stop, then about 3 floors a second
    this.ride = { x, z, y0, y1, t: 0, dur: 1.2 + Math.abs(y1 - y0) / 9, stops, to };
    this.asked = x + ',' + (y1 - 1) + ',' + z;
    sfx('lift_start', null, 0.5, 1);
    this.showTag(true);
  },

  // runs instead of the player's own movement while riding
  step(p, dt) {
    const r = this.ride;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const y = r.y0 + (r.y1 - r.y0) * e;
    p.pos[0] += (r.x + 0.5 - p.pos[0]) * Math.min(1, dt * 6);
    p.pos[2] += (r.z + 0.5 - p.pos[2]) * Math.min(1, dt * 6);
    p.pos[1] = y;
    p.vel[0] = p.vel[1] = p.vel[2] = 0;
    p.onGround = true; p.fallStart = null; p.sneaking = false; p.sprinting = false;
    // the floor we are passing
    let near = 0;
    for (let i = 0; i < r.stops.length; i++) if (Math.abs(r.stops[i] - y) < Math.abs(r.stops[near] - y)) near = i;
    const tag = $('liftTag');
    if (tag) tag.innerHTML = `<i>${r.y1 > r.y0 ? '▲' : '▼'}</i><b>${this.short(near, r.stops)}</b><span>${GPanel.esc(this.label(r.to, r.stops))}</span>`;
    if (k >= 1) {
      p.pos[1] = r.y1;
      this.ride = null;
      sfx('lift_ding', null, 0.6, 1);
      G.ui.toast('🛗 ' + this.label(r.to, r.stops), 1400);
      setTimeout(() => this.showTag(false), 900);
      Net.teleported();
    }
  },

  showTag(on) {
    let el = $('liftTag');
    if (!el) { el = document.createElement('div'); el.id = 'liftTag'; document.body.append(el); }
    el.classList.toggle('show', on);
  },
};

SYNTH.lift_start = (ctx, o, t) => { Sound.tone(ctx, o, t, 1.4, { wave: 'sine', f0: 70, f1: 110, gain: 0.08, attack: 0.3 }); };
SYNTH.lift_ding = (ctx, o, t) => {
  Sound.tone(ctx, o, t, 0.9, { wave: 'sine', f0: 1318, gain: 0.12 });
  Sound.tone(ctx, o, t + 0.02, 0.9, { wave: 'sine', f0: 2636, gain: 0.03 });
};

// ---------------------------------------------------------------- hooks ----
{
  const upd = Player.prototype.update;
  Player.prototype.update = function (dt, input) {
    if (Lift.ride && this === G.player) { Lift.step(this, dt); return; }
    return upd.call(this, dt, input);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); Lift.update(dt || 0.016); };
  shaped(B.LIFT_FLOOR, 2, ['III', 'IRI', 'III'], { I: I.IRON_INGOT, R: I.REDSTONE || B.WIRE });
  gen('lift_floor', (d, rng) => fillTile(d, (x, y) => {
    // steel chequer plate with a yellow edge line
    const edge = x < 2 || y < 2 || x > TM - 2 || y > TM - 2;
    const stripe = edge && ((x + y) >> 2) % 2 === 0;
    const bump = ((x % 6 === 2 && y % 6 === 1) || (x % 6 === 4 && y % 6 === 4)) ? 1.18 : 1;
    put(d, x, y, edge ? (stripe ? [236, 196, 40] : [40, 40, 44]) : [150, 156, 164], bump * (0.93 + rng() * 0.06));
  }), { smooth: 0.7, bump: 0.5 });
}
