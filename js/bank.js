'use strict';
// Money and the Banc Central. Coins (🪙) are kept in the save and shown on the HUD. The bankers
// in the STUCOM bank (campus.js builds it) open the bank screen: sell ores, crops and other goods
// for coins, buy emeralds, and pay for services — excavator work orders that level an area
// (right-click the ground with one), a bulldozer, cars and bikes, and a taxi. Savings earn
// interest every morning. In creative mode money is unlimited.

Object.assign(I, { DOZER: 416, DIG_S: 420, DIG_M: 421, DIG_L: 422 });

const MONEY_START = 50;
// what the bank buys, coins per item
const BANK_BUYS = [
  [I.DIAMOND, 50], [I.EMERALD, 10], [I.GOLD_INGOT, 8], [I.IRON_INGOT, 3], [I.NETHER_QUARTZ, 2], [I.COAL, 1],
  [I.ECHO_SHARD, 30], [I.ENDER_PEARL, 12], [I.WHEAT, 1], [I.RAW_FISH, 1], [I.LEATHER, 2], [B.WOOL, 1], [B.PUMPKIN, 2], [B.MELON, 2],
];
const DIG_SIZES = { [I.DIG_S]: 9, [I.DIG_M]: 15, [I.DIG_L]: 25 };
const BANK_SERVICES = [
  { key: 'dig_s', name: 'Excavator 9×9', desc: 'Levels a 9×9 area where you click', price: 60, item: I.DIG_S },
  { key: 'dig_m', name: 'Excavator 15×15', desc: 'Levels a 15×15 area where you click', price: 140, item: I.DIG_M },
  { key: 'dig_l', name: 'Excavator 25×25', desc: 'Levels a 25×25 area where you click', price: 350, item: I.DIG_L },
  { key: 'dozer', name: 'Bulldozer', desc: 'Drive it and its blade levels whatever is in front', price: 400, item: I.DOZER },
  { key: 'car', name: 'Car', desc: 'Delivered to your inventory', price: 250, item: I.CAR },
  { key: 'bike', name: 'Bicycle', desc: 'Cheap and cheerful', price: 40, item: I.BIKE },
  { key: 'emerald', name: 'Emerald', desc: 'For trading with villagers', price: 12, item: I.EMERALD },
  { key: 'taxi_stucom', name: 'Taxi to STUCOM', desc: 'A ride to the school square', price: 30, taxi: 'stucom' },
  { key: 'taxi_home', name: 'Taxi home', desc: 'To your bed, or the world spawn', price: 30, taxi: 'home' },
];

const Bank = {
  jobs: [],
  lastDay: null,

  get money() { return G.money | 0; },
  unlimited() { return G.mode === 'creative'; },
  pay(n) {
    if (this.unlimited()) return true;
    if (this.money < n) { UI.toast('Not enough coins: you need 🪙 ' + n); sfx('villager_no', null, 1, 1); return false; }
    G.money = this.money - n;
    this.hud(true);
    return true;
  },
  earn(n) { G.money = this.money + Math.round(n); this.hud(true); },
  fmt(n) { return n.toLocaleString('en-US'); },

  // ---- HUD pill ----
  hud(bump) {
    const el = $('money');
    if (!el) return;
    el.textContent = this.unlimited() ? '🪙 ∞' : '🪙 ' + this.fmt(this.money);
    if (bump) { el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); }
  },

  open(m) {
    if (m) sfx('villager_say', m.pos, 1, 0.9);
    G.ui.open({ kind: 'bank', mob: m || null });
  },

  // ---- the bank screen (top half; the inventory is drawn under it) ----
  renderTop(top, ui) {
    const box = document.createElement('div');
    box.className = 'bankbox';
    const m = ui.screen.mob;
    box.innerHTML = `<div class="bk-head"><div><b>Banc Central</b><small>${m ? m.name + ' · Banker' : 'STUCOM'}</small></div>
      <div class="bk-bal"><small>Balance</small><span>${this.unlimited() ? '∞' : this.fmt(this.money)}</span><i>🪙</i></div></div>`;
    const cols = document.createElement('div');
    cols.className = 'bk-cols';
    // selling
    const sell = document.createElement('div');
    sell.className = 'bk-col';
    sell.innerHTML = '<h4>We buy</h4>';
    const icon = (id) => `<i class="bk-ic" style="background-image:url(${iconURL(id)})"></i>`;
    let any = false;
    for (const [id, price] of BANK_BUYS) {
      const have = G.inv.count(id);
      const row = document.createElement('div');
      row.className = 'bk-row' + (have ? '' : ' dim');
      row.innerHTML = `${icon(id)}<span class="bk-name">${itemName(id)}<small>🪙 ${price} each · you have ${have}</small></span>`;
      const b1 = document.createElement('button'), b2 = document.createElement('button');
      b1.textContent = 'Sell 1'; b2.textContent = 'All';
      b1.disabled = b2.disabled = !have;
      b1.addEventListener('click', () => this.sell(id, price, 1));
      b2.addEventListener('click', () => this.sell(id, price, have));
      row.append(b1, b2);
      if (have) { sell.insertBefore(row, sell.children[1] || null); any = true; } else sell.append(row);
    }
    if (!any) { const p = document.createElement('p'); p.className = 'archhint'; p.textContent = 'Bring ores, gems or crops to sell.'; sell.insertBefore(p, sell.children[1] || null); }
    // services
    const serv = document.createElement('div');
    serv.className = 'bk-col';
    serv.innerHTML = '<h4>Services</h4>';
    for (const s of BANK_SERVICES) {
      const row = document.createElement('div');
      const can = this.unlimited() || this.money >= s.price;
      row.className = 'bk-row' + (can ? '' : ' dim');
      row.innerHTML = `${s.item ? icon(s.item) : '<i class="bk-ic bk-taxi">🚕</i>'}<span class="bk-name">${s.name}<small>${s.desc}</small></span><span class="bk-price">🪙 ${s.price}</span>`;
      const b = document.createElement('button');
      b.textContent = s.taxi ? 'Go' : 'Buy';
      b.disabled = !can;
      b.addEventListener('click', () => this.buy(s));
      row.append(b);
      serv.append(row);
    }
    const note = document.createElement('p');
    note.className = 'archhint';
    note.textContent = 'Savings earn 2% interest every morning (up to 🪙 200 a day).';
    serv.append(note);
    cols.append(sell, serv);
    box.append(cols);
    top.append(box);
  },

  sell(id, price, n) {
    n = Math.min(n, G.inv.count(id));
    if (n <= 0) return;
    G.inv.remove(id, n);
    this.earn(price * n);
    sfx('villager_yes', null, 1, 1.1);
    sfx('pop', null, 0.6, 1.6);
    G.ui.invDirty(); G.ui.render();
  },

  buy(s) {
    if (s.taxi) {
      const to = this.taxiTarget(s.taxi);
      if (!to) { UI.toast(s.taxi === 'stucom' ? 'There is no STUCOM in this world' : 'Nowhere to go'); return; }
      if (!this.pay(s.price)) return;
      G.ui.closeScreen(true);
      if (G.vehicle) Vehicles.dismount(true);
      const p = G.player;
      p.pos = to; p.vel = [0, 0, 0]; p.fallStart = null;
      if (Net.teleported) Net.teleported();
      sfx('horn', null, 1, 1);
      UI.toast('🚕 Here we are!');
      requestLock();
      return;
    }
    if (!this.pay(s.price)) return;
    const left = G.inv.add(mkStack(s.item, 1));
    if (left > 0) G.ui.giveBack(mkStack(s.item, left));
    sfx('villager_yes', null, 1, 1);
    if (s.item === I.DIG_S || s.item === I.DIG_M || s.item === I.DIG_L) UI.toast('Right-click the ground where you want it level', 4000);
    G.ui.invDirty(); G.ui.render();
  },

  taxiTarget(kind) {
    const g = G.world.gen;
    if (kind === 'home') {
      const sp = G.spawnPoint || G.worldSpawn;
      return [sp[0], sp[1] + 0.5, sp[2]];
    }
    const s = typeof stucomVillage === 'function' ? stucomVillage(g) : null;
    if (!s) return null;
    const x = s.x + 5, z = s.z + 5;
    return [x + 0.5, g.height(x, z) + 1.2, z + 0.5];
  },

  // ---- excavator work orders ----
  // Level an N x N square around (x, z) to the top of block y: everything above goes, holes and
  // water below are filled up with earth. Done row by row over a few seconds, with dust.
  flattenAt(x, y, z, n) {
    const top = G.world.getBlock(x, y, z);
    const surf = [B.GRASS, B.SAND, B.DIRT, B.SNOW, B.PODZOL].includes(top) ? top : B.GRASS;
    const h = n >> 1;
    this.jobs.push({ x0: x - h, z0: z - h, n, y, surf, row: 0, t: 0 });
    sfx('ignite', [x + 0.5, y + 1, z + 0.5], 0.8, 0.5);
    UI.toast('🚜 The excavator gets to work…');
  },
  runJobs(dt) {
    if (!this.jobs.length) return;
    const j = this.jobs[0];
    j.t -= dt;
    if (j.t > 0) return;
    j.t = 0.09;
    const w = G.world;
    const list = [];
    const z = j.z0 + j.row;
    for (let x = j.x0; x < j.x0 + j.n; x++) {
      if (!w.isLoaded(x, z)) continue;
      for (let y = j.y + 1; y <= Math.min(CH - 1, j.y + 40); y++) {
        const id = w.getBlock(x, y, z);
        if (id !== B.AIR && BLOCK_HARD[id] >= 0 && BLOCK_HARD[id] < 40) list.push([x, y, z, B.AIR]);
      }
      const cur = w.getBlock(x, j.y, z);
      if (cur === B.AIR || IS_LIQUID(cur) || !BLOCK_SOLID[cur] || BLOCK_RT[cur] === RT_CROSS) list.push([x, j.y, z, j.surf]);
      for (let y = j.y - 1, k = 0; y > 0 && k < 20; y--, k++) {
        const id = w.getBlock(x, y, z);
        if (id === B.AIR || IS_LIQUID(id) || BLOCK_RT[id] === RT_CROSS) list.push([x, y, z, B.DIRT]); else break;
      }
      if (Math.random() < 0.3) Particles.smoke(x + 0.5, j.y + 1.2, z + 0.5, 2, 0.6, false);
    }
    if (list.length) editBlocks(list);
    sfx('place_9', [j.x0 + j.n / 2, j.y + 1, z + 0.5], 0.8, 0.7);
    j.row++;
    if (j.row >= j.n) { this.jobs.shift(); UI.toast('🚜 Done: the ground is level'); }
  },

  // ---- savings interest, once a morning ----
  update(dt) {
    this.runJobs(dt);
    this.hudT = (this.hudT || 0) - dt;
    if (this.hudT <= 0) { this.hudT = 0.5; this.hud(false); }
    const d = G.dayTime;
    if (this.lastDay !== null && this.lastDay > 0.9 && d < 0.1 && !this.unlimited() && this.money > 0) {
      const gain = Math.min(200, Math.floor(this.money * 0.02));
      if (gain > 0) { this.earn(gain); UI.toast('🏦 Good morning! Your savings earned 🪙 ' + gain); }
    }
    this.lastDay = d;
  },

  reset() { this.jobs.length = 0; this.lastDay = null; },
};

// ---- items: work orders and the bulldozer ----
sprite('i_dig', (d) => {
  const y = [240, 184, 30], dk = [60, 60, 66];
  sprRect(d, 4, 16, 22, 24, y);
  sprRect(d, 8, 9, 17, 16, y);
  sprRect(d, 10, 10, 16, 15, [140, 190, 226]);
  sprSeg(d, 20, 17, 26, 8, 2.4, y); sprSeg(d, 26, 8, 30, 14, 2, y);
  sprPoly(d, [[27, 13], [31, 13], [30, 19], [26, 17]], dk);
  sprRect(d, 3, 24, 23, 28, dk);
  for (let x = 5; x < 23; x += 4) sprDisc(d, x, 26, 1.2, [120, 124, 130]);
});
sprite('i_dozer', (d) => {
  const y = [240, 184, 30], dk = [50, 50, 56];
  sprRect(d, 8, 14, 26, 22, y);
  sprRect(d, 14, 6, 24, 14, y);
  sprRect(d, 16, 7, 22, 12, [140, 190, 226]);
  sprRect(d, 25, 5, 27, 12, dk);
  sprPoly(d, [[1, 12], [7, 13], [7, 26], [1, 27]], [150, 156, 164]);
  sprRect(d, 7, 22, 29, 28, dk);
  for (let x = 9; x < 29; x += 4) sprDisc(d, x, 25, 1.3, [120, 124, 130]);
});
defItem(I.DIG_S, 'Excavator Order 9×9', { sprite: 'i_dig', stack: 16, cat: 'transport' });
defItem(I.DIG_M, 'Excavator Order 15×15', { sprite: 'i_dig', stack: 16, cat: 'transport' });
defItem(I.DIG_L, 'Excavator Order 25×25', { sprite: 'i_dig', stack: 16, cat: 'transport' });
defItem(I.DOZER, 'Bulldozer', { sprite: 'i_dozer', stack: 1, cat: 'transport' });
shaped(I.DOZER, 1, ['  I', 'GFI', 'III'], { I: B.IRON_BLOCK, G: B.GLASS_PANE, F: B.FURNACE });

// The bulldozer: slow and heavy, tracks instead of wheels, and a blade that clears what is in front.
RIDE_KINDS.dozer = {
  item: I.DOZER, name: 'Bulldozer', type: 'ground', max: 6, rev: 3, acc: 4, brake: 10, steer: 0.9, base: 2.2, step: 1.05, h: 2.8, len: 4.4, w: 2.4,
  seat: [0, 1.25, -0.6], eye: [0, 2.2, -0.4], cam: 9, sit: true, sound: 'bus', paintDefault: 2, dig: true,
  parts: [
    [-1.2, 0, -1.9, -0.75, 0.75, 1.7, 'tire'],
    [0.75, 0, -1.9, 1.2, 0.75, 1.7, 'tire'],
    [-0.8, 0.5, -2.0, 0.8, 1.35, 1.3, 'white', { paint: true }],
    [-0.8, 1.35, -1.6, 0.8, 2.6, -0.1, 'glass'],
    [-0.84, 2.6, -1.7, 0.84, 2.72, 0, 'white', { paint: true }],
    [0.3, 1.35, 0.4, 0.45, 2.3, 0.55, 'hullDark'],
    [0.68, 0.7, 1.3, 0.8, 1.2, 2.05, 'white', { paint: true, m: true }],
    [-1.35, 0.05, 2.05, 1.35, 1.35, 2.3, 'metal'],
    [-1.35, 0.05, 2.3, 1.35, 0.25, 2.5, 'metal'],
    [-0.5, 1.2, 2.0, 0.5, 1.3, 2.4, 'hullDark'],
    [0.5, 1.05, 1.3, 0.75, 1.25, 1.35, 'navWhite', { m: true, glow: 1.2 }],
    [-0.1, 2.72, -1.0, 0.1, 2.85, -0.8, 'glow', { strobe: true, c: [1, 0.6, 0.1] }],
  ],
  hit: [[-1.35, 0, -2, 1.35, 2.8, 2.5]],
};
RIDE_KEYS.push('dozer');
{
  const d = RIDE_KINDS.dozer;
  d.key = 'dozer';
  RIDE_BY_ITEM[d.item] = d;
  const out = [];
  for (const [x0, y0, z0, x1, y1, z1, sw, o = {}] of d.parts) {
    out.push({ box: [x0, y0, z0, x1, y1, z1], sw, o });
    if (o.m) out.push({ box: [-x1, y0, z0, -x0, y1, z1], sw, o });
  }
  d.model = out;
  // the blade: before each move, blocks in front at wheel level and above are pushed away
  const drive0 = Ride.prototype.drive;
  Ride.prototype.drive = function (dt, input) {
    if (this.def.dig && input && this.speed > 0.2 && G.world.isLoaded(Math.floor(this.pos[0]), Math.floor(this.pos[2]))) {
      this.digT = (this.digT || 0) - dt;
      if (this.digT <= 0) {
        this.digT = 0.18;
        const w = G.world, list = [];
        const y0 = Math.floor(this.pos[1] + 0.05);
        for (let s = -1.2; s <= 1.21; s += 0.6) for (const fwd of [2.7, 3.2]) {
          const p = this.toWorld([s, 0, fwd]);
          const bx = Math.floor(p[0]), bz = Math.floor(p[2]);
          for (let y = y0; y <= y0 + 3; y++) {
            const id = w.getBlock(bx, y, bz);
            if (id !== B.AIR && !IS_LIQUID(id) && BLOCK_HARD[id] >= 0 && BLOCK_HARD[id] < 40) list.push([bx, y, bz, B.AIR]);
          }
        }
        if (list.length) {
          const seen = new Set(), uniq = list.filter((e) => { const k = e[0] + ',' + e[1] + ',' + e[2]; if (seen.has(k)) return false; seen.add(k); return true; });
          const f = uniq[0];
          Particles.blockBreak(f[0], f[1], f[2], w.getBlock(f[0], f[1], f[2]));
          editBlocks(uniq);
          sfx('place_9', this.pos, 1, 0.6);
          G.shake = Math.max(G.shake, 0.12);
        }
      }
    }
    drive0.call(this, dt, input);
  };
}
