'use strict';
// Football on the Camp Nou pitch and on STUCOM's campus pitch.
// A ball waits on the centre spot while you are near a pitch. Walk into it to dribble, left-click
// near it to shoot where you look (harder while sprinting), right-click to chip it up. A ball
// through the posts is a goal: horn, crowd, fireworks over the goal, the score on the HUD (and on
// the Camp Nou's big screen), and the ball goes back to the centre. Online every touch is sent
// as an op (`k`: the ball's position and velocity after the kick) so everyone plays the same ball.

const BALL_R = 0.34;
const Football = {
  ball: null, pitch: null, pitchKey: null, score: [0, 0], lastLeft: false, lastRight: false, touchCd: 0,
  resetT: 0, syncT: 0, board: null, hint: 0,

  // ---------------------------------------------------------------- pitches ----
  // { key, name, teams, centre, goals: [{ test(p), at, team }] }
  findPitch() {
    const p = G.player.pos;
    if (G.slot === 'campnou') {
      const G0 = CN.G;
      return {
        key: 'campnou', teams: ['BARÇA', 'VISITORS'], centre: [0.5, G0 + 1 + BALL_R, 0], y0: G0 + 1,
        near: Math.abs(p[0]) < 70 && Math.abs(p[2]) < 50 && p[1] < G0 + 20,
        goals: [
          { team: 0, at: [53.5, G0 + 2, 0], test: (b) => b[0] >= 53 && b[0] < 55.5 && b[2] > -3 && b[2] < 3 && b[1] < G0 + 3 },
          { team: 1, at: [-52.5, G0 + 2, 0], test: (b) => b[0] <= -52 && b[0] > -54.5 && b[2] > -3 && b[2] < 3 && b[1] < G0 + 3 },
        ],
      };
    }
    const w = G.world;
    if (!w || !w.gen || !w.gen.structs) return null;
    const st = typeof stucomVillage === 'function' ? stucomVillage(w.gen) : null;
    const pt = st && st.campus && st.campus.pitch;
    if (!pt) return null;
    const L = lframe(pt.x0, pt.z0, 30, 22, pt.f);
    const base = [L.X(0, 0), L.Z(0, 0)];
    const ea = [L.X(1, 0) - base[0], L.Z(1, 0) - base[1]], ed = [L.X(0, 1) - base[0], L.Z(0, 1) - base[1]];
    // continuous pitch coordinates (a along the pitch, d across) of a world point
    const loc = (x, z) => [(x - base[0] - 0.5) * ea[0] + (z - base[1] - 0.5) * ea[1] + 0.5, (x - base[0] - 0.5) * ed[0] + (z - base[1] - 0.5) * ed[1] + 0.5];
    const world = (a, d) => [base[0] + 0.5 + ea[0] * (a - 0.5) + ed[0] * (d - 0.5), base[1] + 0.5 + ea[1] * (a - 0.5) + ed[1] * (d - 0.5)];
    const F = pt.F, c = world(15, 9);
    const [pa, pd] = loc(p[0], p[2]);
    return {
      key: 'stucom', teams: [CITY + ' A', CITY + ' B'], centre: [c[0], F + BALL_R, c[1]], y0: F,
      near: pa > -6 && pa < 36 && pd > -6 && pd < 26 && Math.abs(p[1] - F) < 12,
      goals: [
        { team: 0, at: [...world(27.5, 9)].flatMap((v, i) => (i === 0 ? [v, F + 1.5] : [v])), test: (b) => { const [a, d] = loc(b[0], b[2]); return a >= 27 && a < 28.6 && d > 8 && d < 10 && b[1] < F + 2; } },
        { team: 1, at: [...world(2.5, 9)].flatMap((v, i) => (i === 0 ? [v, F + 1.5] : [v])), test: (b) => { const [a, d] = loc(b[0], b[2]); return a <= 3 && a > 1.4 && d > 8 && d < 10 && b[1] < F + 2; } },
      ],
    };
  },

  update(dt) {
    if (!G.world || !G.started) return;
    if (G.onTitle) { this.showBoard(false); return; }
    this.chkT = (this.chkT || 0) - dt;
    if (this.chkT <= 0 || !this.pitch) { this.chkT = 1; this.pitch = this.findPitch(); }
    const pc = this.pitch;
    if (!pc || !pc.near) { this.showBoard(false); if (this.ball && !(pc && pc.near)) this.ball = null; this.lastLeft = G.mouse.left; this.lastRight = G.mouse.right; return; }
    if (this.pitchKey !== pc.key) { this.pitchKey = pc.key; this.score = [0, 0]; this.ball = null; this.paintScreen(); }
    if (!this.ball && G.world.isLoaded(Math.floor(pc.centre[0]), Math.floor(pc.centre[2]))) this.kickOff();
    this.showBoard(true);
    const b = this.ball;
    if (!b) return;
    this.touchCd -= dt;
    this.player(dt);
    this.physics(dt);
    if (this.resetT > 0) { this.resetT -= dt; if (this.resetT <= 0) this.kickOff(); }
    else for (const gl of pc.goals) if (gl.test(b.pos)) { this.goal(gl); break; }
    // the host keeps everybody's ball in step
    if (Net.on && Net.isHost && Net.isHost() && Math.hypot(...b.vel) > 0.2) {
      this.syncT -= dt;
      if (this.syncT <= 0) { this.syncT = 1.2; this.send(); }
    }
  },

  kickOff() {
    const pc = this.pitch;
    this.ball = { pos: pc.centre.slice(), vel: [0, 0, 0], spin: 0, axis: [1, 0, 0], ground: true };
    this.resetT = 0;
  },

  // ---------------------------------------------------------------- touches ----
  player(dt) {
    const p = G.player, b = this.ball;
    const left = G.mouse.left && !G.screenOpen && !G.vehicle, right = G.mouse.right && !G.screenOpen && !G.vehicle;
    const e = p.eyePos(), f = p.lookDir();
    const toB = [b.pos[0] - e[0], b.pos[1] - e[1], b.pos[2] - e[2]], dist = Math.hypot(...toB) || 1;
    const inView = (toB[0] * f[0] + toB[1] * f[1] + toB[2] * f[2]) / dist > 0.55;
    if (left && !this.lastLeft && dist < 3.4 && inView) {
      const pow = p.sprinting ? 22 : 16;
      this.kick([f[0] * pow, Math.max(1.5, f[1] * pow + 3.5), f[2] * pow], 'shot');
    } else if (right && !this.lastRight && dist < 3.4 && inView) {
      this.kick([f[0] * 8, 9, f[2] * 8], 'chip');
    }
    this.lastLeft = G.mouse.left; this.lastRight = G.mouse.right;
    // dribbling: walking into the ball pushes it along
    const dx = b.pos[0] - p.pos[0], dz = b.pos[2] - p.pos[2], hd = Math.hypot(dx, dz);
    if (hd < BALL_R + 0.45 && b.pos[1] - p.pos[1] < 1.1 && b.pos[1] - p.pos[1] > -0.4 && this.touchCd <= 0 && !G.vehicle) {
      const ps = Math.hypot(p.vel[0], p.vel[2]);
      const nx = dx / (hd || 1), nz = dz / (hd || 1);
      const s = Math.max(3.2, ps * 1.35 + 1.2);
      this.kick([nx * s, 0.6, nz * s], 'touch');
    }
    // villagers and animals knock it about too (only where nobody else decides)
    if (!Net.on || (Net.isHost && Net.isHost())) {
      for (const m of Ents.mobs) {
        if (m.dead || m.type === 'wyrm') continue;
        const mx = b.pos[0] - m.pos[0], mz = b.pos[2] - m.pos[2], md = Math.hypot(mx, mz);
        if (md < BALL_R + m.hw + 0.05 && Math.abs(b.pos[1] - m.pos[1] - 0.3) < 0.9 && Math.hypot(...b.vel) < 3) {
          b.vel[0] += mx / (md || 1) * 3; b.vel[2] += mz / (md || 1) * 3; b.vel[1] = 1.5;
        }
      }
    }
  },

  kick(v, kind) {
    const b = this.ball;
    b.vel = v.slice();
    b.ground = false;
    this.touchCd = kind === 'touch' ? 0.18 : 0.3;
    sfx(kind === 'touch' ? 'ball_touch' : 'ball_kick', b.pos, kind === 'touch' ? 0.6 : 1, rand(0.9, 1.1));
    if (kind !== 'touch') Act.swingHand();
    this.send();
  },
  send() {
    if (!Net.on || !this.ball) return;
    const b = this.ball;
    Net.op(['k', this.pitchKey === 'campnou' ? 1 : 0, r2(b.pos[0]), r2(b.pos[1]), r2(b.pos[2]), r2(b.vel[0]), r2(b.vel[1]), r2(b.vel[2])]);
  },
  remote(o) {
    const n = o.slice(3, 9).map(Number);
    if (!n.every(Number.isFinite) || !this.pitch || !this.ball) return;
    if ((o[2] === 1) !== (this.pitchKey === 'campnou')) return;
    this.ball.pos = [n[0], n[1], n[2]];
    this.ball.vel = [clamp(n[3], -40, 40), clamp(n[4], -40, 40), clamp(n[5], -40, 40)];
    this.ball.ground = false;
  },

  // ---------------------------------------------------------------- physics ----
  solidAt(x, y, z) {
    const bx = cellBoxes(G.world, Math.floor(x), Math.floor(y), Math.floor(z));
    if (!bx) return false;
    const fx = x - Math.floor(x), fy = y - Math.floor(y), fz = z - Math.floor(z);
    for (const q of bx) if (fx >= q[0] && fx <= q[3] && fy >= q[1] && fy <= q[4] && fz >= q[2] && fz <= q[5]) return true;
    return false;
  },
  physics(dt) {
    const b = this.ball, w = G.world;
    const steps = Math.ceil(Math.hypot(...b.vel) * dt / 0.2) || 1;
    const h = dt / Math.min(steps, 8);
    for (let s = 0; s < Math.min(steps, 8); s++) {
      if (!b.ground) b.vel[1] -= 20 * h;
      // nets (cobwebs, bars) catch the ball
      const here = w.getBlock(Math.floor(b.pos[0]), Math.floor(b.pos[1]), Math.floor(b.pos[2]));
      if (here === B.COBWEB) { const k = Math.exp(-h * 9); b.vel[0] *= k; b.vel[1] *= k; b.vel[2] *= k; }
      for (let ax = 0; ax < 3; ax++) {
        const old = b.pos[ax];
        b.pos[ax] += b.vel[ax] * h;
        const probe = b.pos.slice();
        probe[ax] += Math.sign(b.vel[ax]) * BALL_R;
        if (b.vel[ax] !== 0 && this.solidAt(probe[0], probe[1], probe[2])) {
          b.pos[ax] = old;
          if (ax === 1 && b.vel[1] < 0) {
            if (b.vel[1] < -3) sfx('ball_touch', b.pos, Math.min(1, -b.vel[1] / 12), 0.8);
            b.vel[1] = -b.vel[1] * 0.55;
            if (b.vel[1] < 1.2) { b.vel[1] = 0; b.ground = true; }
          } else {
            if (Math.abs(b.vel[ax]) > 4) sfx('ball_touch', b.pos, 0.7, 0.7);
            b.vel[ax] = -b.vel[ax] * 0.5;
          }
        }
      }
      // rolling: stays on the ground until something lifts it
      if (b.ground) {
        if (!this.solidAt(b.pos[0], b.pos[1] - BALL_R - 0.05, b.pos[2])) b.ground = false;
        else { const k = Math.exp(-h * 0.85); b.vel[0] *= k; b.vel[2] *= k; b.vel[1] = 0; }
      } else { const k = Math.exp(-h * 0.08); b.vel[0] *= k; b.vel[2] *= k; }
    }
    const sp = Math.hypot(b.vel[0], b.vel[2]);
    if (sp > 0.05) { b.spin += sp * dt / BALL_R; b.axis = [b.vel[2] / sp, 0, -b.vel[0] / sp]; }
    if (sp < 0.05 && b.ground) b.vel[0] = b.vel[2] = 0;
    if (b.pos[1] < -10 || Math.hypot(b.pos[0] - this.pitch.centre[0], b.pos[2] - this.pitch.centre[2]) > 160) this.kickOff();
  },

  // ---------------------------------------------------------------- goals ----
  goal(gl) {
    this.score[gl.team]++;
    this.resetT = 3.5;
    const pc = this.pitch;
    sfx('goal_horn', null, 1, 1);
    sfx('crowd', null, 1, 1);
    this.fireworks(gl.at);
    const bn = $('placeBanner');
    bn.innerHTML = '';
    const i = document.createElement('div'); i.className = 'pb-icon'; i.textContent = '⚽';
    const n = document.createElement('div'); n.className = 'pb-name'; n.textContent = 'GOAL!';
    const s = document.createElement('div'); s.className = 'pb-sub'; s.textContent = pc.teams[0] + ' ' + this.score[0] + ' - ' + this.score[1] + ' ' + pc.teams[1];
    bn.append(i, n, s);
    bn.classList.remove('show'); void bn.offsetWidth; bn.classList.add('show');
    if (typeof Progress !== 'undefined') Progress.event('goal');
    this.paintScreen();
  },
  fireworks(at) {
    const cols = [[0.2, 0.35, 1], [0.9, 0.1, 0.25], [1, 0.85, 0.2]];
    for (let k = 0; k < 4; k++) {
      setTimeout(() => {
        const c = [at[0] + rand(-4, 4), at[1] + rand(8, 14), at[2] + rand(-4, 4)], col = cols[k % 3];
        sfx('firework', c, 1, rand(0.9, 1.1));
        for (let i = 0; i < 60; i++) {
          const a = Math.random() * Math.PI * 2, e = rand(-1, 1), sp = rand(5, 9), l = rand(1, 1.6);
          Particles.add(Particles.base(c[0], c[1], c[2], { vx: Math.cos(a) * Math.sqrt(1 - e * e) * sp, vy: e * sp, vz: Math.sin(a) * Math.sqrt(1 - e * e) * sp,
            life: l, max: l, size: rand(0.12, 0.2), layer: T.p_crit, r: col[0], g: col[1], b: col[2], glow: true, drag: 0.93, grav: 3, collide: false, shrink: true }));
        }
      }, k * 380);
    }
  },
  // The Camp Nou's screen over the stand opposite the main one shows the score.
  paintScreen() {
    if (G.slot !== 'campnou' || typeof cnText !== 'function') return;
    const text = this.score[0] || this.score[1] ? this.score[0] + '-' + this.score[1] : 'CAMP';
    const Gy = CN.G, z = 44, was = Net.capture;
    const off = Math.floor((26 - (text.length * 6 - 1)) / 2);
    const list = [];
    for (let x = -13; x <= 13; x++) {
      if (!(Math.abs(x + 0.5) < 13)) continue;
      const col = Math.floor(12.5 - (x + 0.5) + 0.5);
      for (let row = 0; row < 9; row++) {
        const frame = row === 0 || row === 8 || col === 0 || col === 25;
        const id = frame ? CN_BLACK : cnText(text, col - off, 7 - row) ? B.LED_YELLOW : B.LED_BLUE;
        if (G.world.getBlock(x, Gy + 52 + row, z) !== id) list.push([x, Gy + 52 + row, z, id]);
      }
    }
    if (!list.length) return;
    Net.capture = false;
    try { editBlocks(list); } finally { Net.capture = was; }
  },

  // ---------------------------------------------------------------- HUD ----
  showBoard(on) {
    if (!this.board) {
      this.board = document.createElement('div');
      this.board.id = 'scoreBoard';
      this.board.innerHTML = '<span class="t0"></span><b class="s"></b><span class="t1"></span><small>Left click shoot · right click chip · walk into it to dribble</small>';
      $('hud').append(this.board);
    }
    this.board.classList.toggle('hidden', !on);
    if (!on) return;
    const pc = this.pitch;
    this.board.querySelector('.t0').textContent = pc.teams[0];
    this.board.querySelector('.t1').textContent = pc.teams[1];
    this.board.querySelector('.s').textContent = this.score[0] + ' : ' + this.score[1];
  },

  // ---------------------------------------------------------------- drawing ----
  render(cp) {
    const b = this.ball;
    if (!b) return;
    ER.lightAt(b.pos[0], b.pos[1], b.pos[2]);
    const m = XF.chain(XF.t(b.pos[0] - cp[0], b.pos[1] - cp[1], b.pos[2] - cp[2]), XF.ry(Math.atan2(b.axis[0], b.axis[2])), XF.rx(b.spin));
    const r = BALL_R, q = r * 0.72;
    const uv = (n) => () => Vehicles.swatchUV(n);
    ER.ov = 0;
    // a rounded ball from three crossed boxes, white with dark patches
    ER.color = [1, 1, 1];
    ER.box(m, -r, -q, -q, r, q, q, uv('white'));
    ER.box(m, -q, -r, -q, q, r, q, uv('white'));
    ER.box(m, -q, -q, -r, q, q, r, uv('white'));
    ER.color = [0.12, 0.12, 0.14];
    for (const [x, y, z] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
      const c = [x * (r + 0.005), y * (r + 0.005), z * (r + 0.005)], s = 0.11;
      ER.box(m, c[0] - (x ? 0.004 : s), c[1] - (y ? 0.004 : s), c[2] - (z ? 0.004 : s), c[0] + (x ? 0.004 : s), c[1] + (y ? 0.004 : s), c[2] + (z ? 0.004 : s), uv('white'));
    }
    ER.color = [1, 1, 1];
  },
};

// LED digits for the Camp Nou screen
Object.assign(CN_FONT, {
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00110', '01000', '10000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  '-': ['00000', '00000', '00000', '01110', '00000', '00000', '00000'],
});

// online: kicks arrive as ops
{
  const ap0 = Net.applyOp;
  Net.applyOp = function (r, o) { if (o[1] === 'k') { Football.remote(o); return; } return ap0.call(this, r, o); };
}
if (typeof ACHIEVEMENTS !== 'undefined') {
  const a = { k: 'goal', name: 'Golazo!', desc: 'Score a goal on a football pitch', icon: I.EMERALD, coins: 40 };
  ACHIEVEMENTS.push(a); ACH_BY_KEY.goal = a;
}

SYNTH.ball_kick = (ctx, o, t, p) => { Sound.noise(ctx, o, t, 0.08, { type: 'bandpass', freq: 900 * p, q: 1.2, gain: 0.7 }); Sound.tone(ctx, o, t, 0.1, { f0: 160 * p, f1: 90, gain: 0.35, wave: 'triangle' }); };
SYNTH.ball_touch = (ctx, o, t, p) => { Sound.noise(ctx, o, t, 0.05, { type: 'bandpass', freq: 700 * p, q: 1.5, gain: 0.35 }); };
SYNTH.goal_horn = (ctx, o, t) => {
  for (const [f, d] of [[220, 0], [277, 0], [330, 0]]) Sound.tone(ctx, o, t + d, 1.6, { wave: 'sawtooth', f0: f, filter: ['lowpass', 1400, 1], gain: 0.12, attack: 0.05 });
};
SYNTH.crowd = (ctx, o, t) => {
  Sound.noise(ctx, o, t, 3.2, { type: 'bandpass', freq: 900, q: 0.4, gain: 0.55, attack: 0.35 });
  Sound.noise(ctx, o, t + 0.2, 2.6, { type: 'bandpass', freq: 2200, q: 0.8, gain: 0.25, attack: 0.3 });
};
SYNTH.firework = (ctx, o, t) => { Sound.noise(ctx, o, t, 0.5, { type: 'lowpass', freq: 1800, gain: 0.7 }); Sound.noise(ctx, o, t + 0.1, 0.9, { type: 'highpass', freq: 3000, gain: 0.18 }); };
