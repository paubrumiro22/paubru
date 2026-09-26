'use strict';
// Touch controls for phones and tablets. They switch on with the first touch: a joystick on the
// left walks (push it all the way to run), dragging anywhere else on the screen looks around,
// a quick tap uses / places (or hits the mob or vehicle in the crosshair) and holding still
// mines. Buttons on the right jump, crouch, fly, open the inventory, change camera and pause.
// Tapping a hotbar slot selects it. In a vehicle the joystick drives and "Exit" gets out.

const Touch = {
  on: false, stick: null, look: null, el: null, fly: null,

  init() {
    const first = () => { window.removeEventListener('touchstart', first, true); this.enable(); };
    window.addEventListener('touchstart', first, { capture: true, passive: true });
  },

  enable() {
    if (this.on) return;
    this.on = true;
    document.body.classList.add('touch');
    const ui = document.createElement('div');
    ui.id = 'touchUI';
    ui.innerHTML = `
      <div class="tstick"><div class="tknob"></div></div>
      <div class="tbtns">
        <button data-k="jump" class="big">⤒</button>
        <button data-k="sneak">⤓</button>
        <button data-k="use">✋</button>
        <button data-k="inv">🎒</button>
        <button data-k="fly">🕊</button>
        <button data-k="view">👁</button>
      </div>
      <button class="tmenu" data-k="menu">☰</button>
      <button class="texit" data-k="exit">Exit</button>`;
    document.body.appendChild(ui);
    this.el = ui;
    const stick = ui.querySelector('.tstick'), knob = ui.querySelector('.tknob');
    this.knob = knob;
    // ---- joystick ----
    stick.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0], r = stick.getBoundingClientRect();
      this.stick = { id: t.identifier, cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2 };
      this.moveStick(t);
    }, { passive: false });
    // ---- buttons ----
    for (const b of ui.querySelectorAll('button')) {
      b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); this.button(b.dataset.k, true, b); }, { passive: false });
      b.addEventListener('touchend', (e) => { e.preventDefault(); this.button(b.dataset.k, false, b); }, { passive: false });
      b.addEventListener('touchcancel', () => this.button(b.dataset.k, false, b));
    }
    // ---- look, tap and hold on the game view ----
    G.canvas.addEventListener('touchstart', (e) => {
      if (!this.playing()) return;
      e.preventDefault();
      if (this.look) return;
      const t = e.changedTouches[0];
      this.look = { id: t.identifier, x: t.clientX, y: t.clientY, moved: 0, t0: performance.now(), mining: false };
    }, { passive: false });
    window.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) { e.preventDefault(); this.moveStick(t); }
        else if (this.look && t.identifier === this.look.id) {
          e.preventDefault();
          const L = this.look, dx = t.clientX - L.x, dy = t.clientY - L.y;
          L.x = t.clientX; L.y = t.clientY;
          L.moved += Math.abs(dx) + Math.abs(dy);
          if (L.mining && L.moved > 24) { L.mining = false; G.mouse.left = false; }
          const s = 0.0055 * G.settings.sensitivity, p = G.player;
          p.yaw -= dx * s;
          p.pitch = clamp(p.pitch - dy * s, -1.5605, 1.5605);
          if (p.yaw > Math.PI) p.yaw -= Math.PI * 2; else if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
        }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (this.stick && t.identifier === this.stick.id) { this.stick = null; this.setMove(0, 0); }
        else if (this.look && t.identifier === this.look.id) {
          const L = this.look;
          this.look = null;
          if (L.mining) { G.mouse.left = false; continue; }
          if (L.moved < 12 && performance.now() - L.t0 < 350 && this.playing()) this.tap();
        }
      }
    };
    window.addEventListener('touchend', end, { passive: true });
    window.addEventListener('touchcancel', end, { passive: true });
    // hotbar slots
    $('hotbar').addEventListener('touchstart', (e) => {
      const slot = e.target.closest('.slot');
      if (!slot) return;
      e.preventDefault();
      UI.selectSlot([...$('hotbar').children].indexOf(slot));
    }, { passive: false });
    requestAnimationFrame(() => this.frame());
  },

  playing() { return G.playing && !G.screenOpen && !G.stats.dead && !G.onTitle; },

  moveStick(t) {
    const s = this.stick;
    let dx = (t.clientX - s.cx) / s.R, dy = (t.clientY - s.cy) / s.R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    this.knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
    this.setMove(dx, dy);
  },
  setMove(dx, dy) {
    const k = G.input.keys;
    const set = (code, on) => { if (on) k.add(code); else k.delete(code); };
    set('KeyW', dy < -0.3); set('KeyS', dy > 0.3); set('KeyA', dx < -0.3); set('KeyD', dx > 0.3);
    G.input.sprintHeld = Math.hypot(dx, dy) > 0.95 && dy < -0.5;
    if (!dx && !dy && this.knob) this.knob.style.transform = '';
  },

  // A quick tap: hit what is in the crosshair if it is a mob or a vehicle, otherwise use / place.
  tap() {
    const now = performance.now();
    const t = Act.target;
    const hit = () => { primaryDown(now); setTimeout(() => { G.mouse.left = false; }, 60); };
    if (G.vehicle) { G.mouse.left = true; setTimeout(() => { G.mouse.left = false; }, 120); return; }   // horn
    if (t && t.vehicle) { Act.useItem(true); return; }                                                  // get in
    if (t && t.mob) {
      // talk to villagers, shear and feed with the right item in hand; otherwise attack
      const held = G.inv.held, d = held && ITEM_DEF[held.id];
      if (t.mob.type === 'villager' || (held && (held.id === I.SHEARS || held.id === I.WHEAT || (d && d.food)))) { if (Act.useItem(true)) return; }
      hit();
      return;
    }
    if (!Act.useItem(true)) hit();
  },

  button(k, down, b) {
    b.classList.toggle('on', down);
    const keys = G.input.keys;
    const hold = (code) => { if (down) { keys.add(code); if (G.vehicle && vehicleKey(code)) return; } else keys.delete(code); };
    switch (k) {
      case 'jump': hold('Space'); break;
      case 'sneak': hold(G.vehicle ? 'KeyC' : 'ShiftLeft'); break;
      case 'use': G.mouse.right = down; if (down && this.playing()) Act.useItem(true); break;
      case 'inv': if (down && this.playing()) UI.openInventory(); break;
      case 'fly':
        if (down && G.mode === 'creative' && !G.vehicle) { const p = G.player; p.flying = !p.flying; p.vel[1] = 0; UI.toast(p.flying ? 'Flying' : 'Walking'); }
        break;
      case 'view':
        if (!down) break;
        if (G.vehicle) vehicleKey('KeyV');
        else { G.view = ((G.view || 0) + 1) % 3; UI.toast(['First person', 'Third person', 'Front view'][G.view]); }
        break;
      case 'menu': if (down) { releaseAllInput(); G.playing = false; showMenu(); } break;
      case 'exit': if (down && G.vehicle) Vehicles.dismount(false); break;
      default: break;
    }
  },

  // holding still on the view turns into mining; show only the buttons that make sense
  frame() {
    const L = this.look;
    if (L && !L.mining && L.moved < 12 && performance.now() - L.t0 > 350 && this.playing() && !G.vehicle) { L.mining = true; G.mouse.left = true; }
    this.el.classList.toggle('hidden', !this.playing() && !G.vehicle);
    this.el.classList.toggle('driving', !!G.vehicle);
    this.el.classList.toggle('creative', G.mode === 'creative');
    requestAnimationFrame(() => this.frame());
  },
};
Touch.init();
