'use strict';
// Achievements and villager quests, both kept in G.prog (saved with the world).
// - Achievements unlock from game events (Progress.event, fed by small wrappers around the
//   functions that mine, place, craft, trade, travel, board...) or from a check every second
//   (inventory, money, height, where you are). Each pays some coins and pops a card.
// - Quests: every villager offers one (in their trade screen), picked from their trade by how many
//   quests you have finished: bring items, defeat monsters or mine blocks. Up to three at a time,
//   shown on the HUD; kill and mine quests count while active, and you claim the reward back with
//   the villager who gave it.
// The Journal (J, or the menu) lists both.

const ACHIEVEMENTS = [
  { k: 'log', name: 'Getting Wood', desc: 'Chop a tree trunk', icon: B.LOG, coins: 10 },
  { k: 'bench', name: 'Workbench', desc: 'Craft a crafting table', icon: B.CRAFTING_TABLE, coins: 10 },
  { k: 'pickaxe', name: 'Time to Mine', desc: 'Craft a pickaxe', icon: I.TOOL0, coins: 15 },
  { k: 'iron', name: 'Iron Age', desc: 'Get an iron ingot', icon: I.IRON_INGOT, coins: 25 },
  { k: 'diamond', name: 'Diamonds!', desc: 'Find a diamond', icon: I.DIAMOND, coins: 60 },
  { k: 'emerald', name: 'Emerald Hunter', desc: 'Get an emerald', icon: I.EMERALD, coins: 25 },
  { k: 'miner', name: 'Deep Miner', desc: 'Mine 500 blocks', icon: I.TOOL0 + 10, coins: 80, count: ['mined', 500] },
  { k: 'build', name: 'Builder', desc: 'Place 100 blocks', icon: B.BRICKS, coins: 20, count: ['placed', 100] },
  { k: 'architect', name: 'Architect', desc: 'Place 2,000 blocks', icon: B.STONE_BRICKS, coins: 150, count: ['placed', 2000] },
  { k: 'hunter', name: 'Monster Hunter', desc: 'Defeat a monster', icon: I.TOOL0 + 3, coins: 15 },
  { k: 'slayer', name: 'Slayer', desc: 'Defeat 50 monsters', icon: I.TOOL0 + 13, coins: 120, count: ['kills', 50] },
  { k: 'sleep', name: 'Sweet Dreams', desc: 'Sleep through the night', icon: B.BED, coins: 10 },
  { k: 'trade', name: "Let's Make a Deal", desc: 'Trade with a villager', icon: I.EMERALD, coins: 15 },
  { k: 'merchant', name: 'Merchant', desc: 'Make 25 trades', icon: I.GOLD_INGOT, coins: 100, count: ['trades', 25] },
  { k: 'quest', name: 'Helping Hand', desc: 'Finish a quest', icon: I.BOOK, coins: 20 },
  { k: 'quest10', name: 'Hero of the Villages', desc: 'Finish 10 quests', icon: I.GOLDEN_APPLE, coins: 250, count: ['quests', 10] },
  { k: 'enchant', name: 'Enchanter', desc: 'Hold an enchanted item', icon: I.ENCHANTED_BOOK, coins: 40 },
  { k: 'potion', name: 'Alchemist', desc: 'Drink a potion', icon: I.WATER_BOTTLE, coins: 30 },
  { k: 'rich', name: 'Savings Account', desc: 'Have 1,000 coins', icon: I.GOLD_INGOT, coins: 50 },
  { k: 'sky', name: 'Head in the Clouds', desc: 'Stand at height 120', icon: B.GLASS, coins: 20 },
  { k: 'jet', name: 'Top Gun', desc: 'Climb into the fighter jet', icon: I.JET, coins: 25 },
  { k: 'drive', name: 'Road Trip', desc: 'Drive a car, bus, bike or boat', icon: I.CAR, coins: 20 },
  { k: 'metro', name: 'Next Stop', desc: 'Ride the metro', icon: I.METRO, coins: 25 },
  { k: 'mech', name: 'Engineer', desc: 'Flip a lever or press a button', icon: B.LEVER, coins: 15 },
  { k: 'piston', name: 'Heavy Lifting', desc: 'Push blocks with a piston', icon: B.PISTON, coins: 25 },
  { k: 'stucom', name: 'Back to School', desc: 'Visit ' + SCHOOL, icon: B.CHALKBOARD, coins: 15 },
  { k: 'campnou', name: 'Més que un club', desc: 'Visit the Camp Nou', icon: B.SEAT_BLUE || B.WOOL + 11, coins: 30 },
  { k: 'nether', name: 'Into the Fire', desc: 'Enter the Nether', icon: B.NETHERRACK, coins: 50 },
  { k: 'deep', name: 'Hush', desc: 'Enter the Deep Dark', icon: B.SCULK, coins: 50 },
  { k: 'end', name: 'The End?', desc: 'Reach the End', icon: B.END_STONE, coins: 80 },
  { k: 'warden', name: 'Heard Nothing', desc: 'Defeat the Warden', icon: I.ECHO_SHARD, coins: 300 },
  { k: 'wyrm', name: 'Wyrm Slayer', desc: 'Defeat the Void Wyrm', icon: I.WYRM_SCALE, coins: 500 },
  { k: 'glide', name: 'Winged', desc: 'Glide with the Void Wings', icon: I.VOID_WINGS, coins: 50 },
];
const ACH_BY_KEY = Object.fromEntries(ACHIEVEMENTS.map((a) => [a.k, a]));
const PICKAXES = [0, 1, 2, 3, 4].map((m) => I.TOOL0 + m * 5);
const LOG_IDS = new Set(typeof LOGS !== 'undefined' ? LOGS : [B.LOG]);

// Quests each kind of villager can give: [kind, target, amount, coins, reward item, count].
const QUEST_POOL = {
  farmer: [['bring', I.WHEAT, 16, 40], ['bring', I.BREAD, 6, 50], ['bring', B.PUMPKIN, 4, 45], ['kill', 'zombie', 5, 60, I.EMERALD, 2]],
  fisher: [['bring', I.RAW_FISH, 8, 45], ['bring', I.STRING, 6, 35], ['kill', 'spider', 4, 60]],
  smith: [['bring', I.IRON_INGOT, 8, 70, I.EMERALD, 2], ['bring', I.COAL, 24, 50], ['mine', B.IRON_ORE, 12, 70], ['bring', I.GOLD_INGOT, 4, 70]],
  librarian: [['bring', I.BOOK, 4, 60], ['bring', I.PAPER, 16, 40], ['kill', 'skeleton', 5, 70, I.ENCHANTED_BOOK, 1]],
  cleric: [['bring', I.ROTTEN_FLESH, 12, 40], ['bring', I.BONE, 10, 40], ['kill', 'fusecap', 3, 80, I.GOLDEN_APPLE, 1]],
  mason: [['bring', B.COBBLE, 64, 40], ['bring', B.STONE_BRICKS, 32, 55], ['mine', B.STONE, 80, 50]],
  shepherd: [['bring', B.WOOL, 12, 45], ['bring', I.WHEAT, 10, 30], ['kill', 'zombie', 4, 55]],
  teacher: [['bring', I.BOOK, 3, 60], ['bring', B.COMPUTER, 1, 80], ['bring', I.PAPER, 20, 45], ['mine', B.COAL_ORE, 20, 60]],
  student: [['bring', I.APPLE, 5, 30], ['bring', I.BREAD, 4, 35], ['bring', I.COOKED_FISH, 3, 40]],
  banker: [['bring', I.GOLD_INGOT, 6, 90], ['bring', I.EMERALD, 5, 80], ['mine', B.GOLD_ORE, 8, 90]],
  any: [['bring', B.LOG, 16, 35], ['kill', 'zombie', 5, 60], ['kill', 'skeleton', 4, 60], ['mine', B.COAL_ORE, 16, 50], ['bring', I.LEATHER, 6, 45]],
};
const MAX_QUESTS = 3;

const Progress = {
  t: 0, queue: [], showing: false, open: false, tab: 'ach',

  prog() {
    const p = G.prog || (G.prog = {});
    if (!p.ach) p.ach = {};
    if (!p.st) p.st = {};
    if (!Array.isArray(p.quests)) p.quests = [];
    return p;
  },
  count(k, n = 1) { const s = this.prog().st; s[k] = (s[k] || 0) + n; this.checkCounts(); },

  unlock(k) {
    const pr = this.prog(), a = ACH_BY_KEY[k];
    if (!a || pr.ach[k] || G.slot === 'campnou' && k !== 'campnou') return;
    pr.ach[k] = Date.now();
    if (a.coins) G.money = (G.money | 0) + a.coins;
    this.queue.push(a);
    this.pump();
  },
  checkCounts() {
    const s = this.prog().st;
    for (const a of ACHIEVEMENTS) if (a.count && (s[a.count[0]] || 0) >= a.count[1]) this.unlock(a.k);
  },

  // Something happened in the game.
  event(kind, arg) {
    if (!G.prog) return;
    switch (kind) {
      case 'mine':
        this.count('mined');
        if (LOG_IDS.has(arg)) this.unlock('log');
        this.questTick('mine', arg);
        break;
      case 'place': this.count('placed'); break;
      case 'kill': {
        const def = MOB_TYPES[arg];
        if (def && def.hostile) { this.count('kills'); this.unlock('hunter'); }
        if (arg === 'warden') this.unlock('warden');
        this.questTick('kill', arg);
        break;
      }
      case 'craft':
        if (arg === B.CRAFTING_TABLE) this.unlock('bench');
        if (PICKAXES.includes(arg)) this.unlock('pickaxe');
        break;
      case 'trade': this.count('trades'); this.unlock('trade'); break;
      case 'sleep': this.unlock('sleep'); break;
      case 'dim': this.unlock(arg === DIM_NETHER ? 'nether' : arg === DIM_END ? 'end' : arg === DIM_DEEP ? 'deep' : ''); break;
      case 'ride':
        if (arg === 'jet') this.unlock('jet');
        else if (arg === 'metro') this.unlock('metro');
        else if (['car', 'bus', 'bike', 'boat'].includes(arg)) this.unlock('drive');
        break;
      case 'mech': this.unlock('mech'); break;
      case 'piston': this.unlock('piston'); break;
      case 'wyrm': this.unlock('wyrm'); break;
      case 'glide': this.unlock('glide'); break;
      default: if (ACH_BY_KEY[kind]) this.unlock(kind);
    }
  },

  // Once a second: things you have or where you are.
  update(dt) {
    if (!G.prog || !G.started || G.onTitle) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const inv = G.inv, p = G.player;
    if (inv.count(I.IRON_INGOT)) this.unlock('iron');
    if (inv.count(I.DIAMOND)) this.unlock('diamond');
    if (inv.count(I.EMERALD)) this.unlock('emerald');
    if (inv.slots.some((s) => s && s.ench && Object.keys(s.ench).length)) this.unlock('enchant');
    if (G.stats.effects && Object.keys(G.stats.effects).length) this.unlock('potion');
    if ((G.money | 0) >= 1000 && G.mode === 'survival') this.unlock('rich');
    if (p.pos[1] >= 120 && dimOf(p.pos[0], p.pos[2]) === DIM_OVER && G.slot !== 'campnou') this.unlock('sky');
    if (G.slot === 'campnou') this.unlock('campnou');
    else if (G.world && G.world.gen && G.world.gen.structs) {
      const st = this.stucom || (this.stucom = stucomVillage(G.world.gen) || false);
      if (st && Math.hypot(p.pos[0] - st.x, p.pos[2] - st.z) < 70) this.unlock('stucom');
    }
    if (p.gliding) this.unlock('glide');
    // discovering a themed place puts it on the map
    const g = G.world && G.world.gen;
    if (g && g.regions) for (const r of g.regions) {
      const pr = this.prog();
      if (!pr.found) pr.found = {};
      if (pr.found[r.key] || Math.hypot(p.pos[0] - r.x, p.pos[2] - r.z) > REGION_OUT) continue;
      pr.found[r.key] = Date.now();
      if (G.ui.banner) G.ui.banner(placeIcon(r), placeName(r));
      G.ui.toast('New town discovered: ' + placeName(r) + ' · it is on your map now', 3500);
      sfx('achieve', null, 0.8, 0.9);
    }
    this.renderTracker();
  },

  // ---------------------------------------------------------------- quests ----
  offerFor(m) {
    const pool = QUEST_POOL[m.prof] || QUEST_POOL.any;
    const done = this.prog().st.quests || 0;
    const q = pool[(Math.abs(m.seed || 0) + done) % pool.length];
    return { kind: q[0], target: q[1], n: q[2], coins: q[3], item: q[4] || 0, itemN: q[5] || 0 };
  },
  questOf(m) { return this.prog().quests.find((q) => q.vid === m.vid) || null; },
  describe(q) {
    const what = q.kind === 'kill' ? (MOB_TYPES[q.target] ? MOB_TYPES[q.target].name : q.target) : itemName(q.target);
    return (q.kind === 'bring' ? 'Bring ' : q.kind === 'kill' ? 'Defeat ' : 'Mine ') + q.n + ' ' + what + (q.n > 1 && q.kind === 'kill' ? 's' : '');
  },
  have(q) { return q.kind === 'bring' ? Math.min(q.n, G.inv.count(q.target)) : Math.min(q.n, q.progress || 0); },
  accept(m) {
    const pr = this.prog();
    if (pr.quests.length >= MAX_QUESTS) { G.ui.toast('You already have ' + MAX_QUESTS + ' quests: finish or drop one in the Journal (J)'); return; }
    if (!m.vid) return;
    const o = this.offerFor(m);
    pr.quests.push({ ...o, vid: m.vid, giver: m.name || 'Villager', town: m.town || '', progress: 0, at: [Math.round(m.pos[0]), Math.round(m.pos[2])] });
    sfx('villager_yes', m.pos, 1, 1.1);
    G.ui.toast('Quest accepted: ' + this.describe(o));
    this.renderTracker();
  },
  claim(m) {
    const pr = this.prog(), q = this.questOf(m);
    if (!q) return;
    if (this.have(q) < q.n && G.mode !== 'creative') { sfx('villager_no', m.pos, 1, 1); return; }
    if (q.kind === 'bring' && G.mode !== 'creative') G.inv.remove(q.target, q.n);
    pr.quests = pr.quests.filter((x) => x !== q);
    G.money = (G.money | 0) + q.coins;
    if (q.item) { const left = G.inv.add(mkStack(q.item, q.itemN)); if (left > 0) Ents.spawnItem(mkStack(q.item, left), G.player.pos[0], G.player.pos[1] + 1, G.player.pos[2]); }
    this.count('quests');
    this.unlock('quest');
    sfx('villager_yes', m.pos, 1, 1.2);
    sfx('chime', null, 0.8, 1.3);
    G.ui.toast('Quest complete! +' + q.coins + ' coins' + (q.item ? ' and ' + q.itemN + ' ' + itemName(q.item) : ''), 3500);
    G.ui.invDirty();
    this.renderTracker();
  },
  drop(q) { const pr = this.prog(); pr.quests = pr.quests.filter((x) => x !== q); this.renderTracker(); },
  questTick(kind, target) {
    for (const q of this.prog().quests) {
      if (q.kind !== kind || q.progress >= q.n) continue;
      if (q.target === target || (kind === 'mine' && q.target === B.STONE && target === B.COBBLE)) {
        q.progress = (q.progress || 0) + 1;
        if (q.progress === q.n) G.ui.toast('Quest ready: go back to ' + q.giver + (q.town ? ' in ' + q.town : ''), 3000);
      }
    }
    this.renderTracker();
  },

  // quest box at the top of a villager's trade screen
  tradeBox(m, box, ui) {
    if (!m.vid || m.prof === 'banker' && false) return;
    const pr = this.prog(), q = this.questOf(m);
    const card = document.createElement('div');
    card.className = 'questcard';
    const icon = (id) => `<i style="background-image:url(${iconURL(id)})"></i>`;
    if (q) {
      const got = this.have(q), ready = got >= q.n || G.mode === 'creative';
      card.innerHTML = `<div class="qc-head">${q.kind === 'kill' ? '⚔' : icon(q.target)}<div><b>${this.describe(q)}</b><small>${got} / ${q.n} · reward ${q.coins} coins${q.item ? ' + ' + q.itemN + ' ' + itemName(q.item) : ''}</small></div></div>`;
      const bar = document.createElement('div'); bar.className = 'qc-bar'; bar.innerHTML = `<i style="width:${Math.round(got / q.n * 100)}%"></i>`;
      const b = document.createElement('button');
      b.className = ready ? 'accent' : '';
      b.textContent = ready ? (q.kind === 'bring' ? 'Deliver' : 'Claim reward') : 'Not yet';
      b.disabled = !ready;
      b.addEventListener('click', () => { this.claim(m); ui.render(); });
      card.append(bar, b);
    } else {
      const o = this.offerFor(m);
      card.innerHTML = `<div class="qc-head">${o.kind === 'kill' ? '⚔' : icon(o.target)}<div><b>${this.describe(o)}</b><small>${m.name || 'This villager'} asks for help · reward ${o.coins} coins${o.item ? ' + ' + o.itemN + ' ' + itemName(o.item) : ''}</small></div></div>`;
      const b = document.createElement('button');
      b.textContent = pr.quests.length >= MAX_QUESTS ? 'Quest log full' : 'Accept quest';
      b.disabled = pr.quests.length >= MAX_QUESTS;
      b.className = 'accent';
      b.addEventListener('click', () => { this.accept(m); ui.render(); });
      card.append(b);
    }
    box.append(card);
  },

  // ---------------------------------------------------------------- HUD ----
  pump() {
    if (this.showing || !this.queue.length) return;
    const a = this.queue.shift();
    let el = $('achPop');
    if (!el) { el = document.createElement('div'); el.id = 'achPop'; $('hud').append(el); }
    el.innerHTML = `<i style="background-image:url(${iconURL(a.icon)})"></i><div><small>Achievement unlocked</small><b>${a.name}</b><span>${a.desc}${a.coins ? ' · +' + a.coins + ' coins' : ''}</span></div>`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    sfx('achieve', null, 1, 1);
    this.showing = true;
    setTimeout(() => { this.showing = false; this.pump(); }, 4200);
    if (G.ui && G.ui.updateHud) G.ui.updateHud(true);
  },
  renderTracker() {
    let el = $('questTracker');
    if (!el) { el = document.createElement('div'); el.id = 'questTracker'; $('hud').append(el); }
    const qs = G.prog ? this.prog().quests : [];
    el.classList.toggle('hidden', !qs.length);
    const html = qs.map((q) => {
      const got = this.have(q), done = got >= q.n;
      return `<div class="${done ? 'done' : ''}"><b>${this.describe(q)}</b><span>${done ? '✓ Return to ' + q.giver : got + ' / ' + q.n}</span></div>`;
    }).join('');
    if (el.innerHTML !== html) el.innerHTML = html;
  },

  // ---------------------------------------------------------------- journal ----
  toggle() { if (this.open) this.close(); else this.show(); },
  show(tab) {
    if (G.stats.dead || G.onTitle) return;
    this.open = true;
    if (tab) this.tab = tab;
    G.screenOpen = true;
    releaseAllInput();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    $('menu').classList.add('hidden');
    $('journal').classList.remove('hidden');
    this.renderJournal();
  },
  close() {
    if (!this.open) return;
    this.open = false;
    G.screenOpen = false;
    $('journal').classList.add('hidden');
    requestLock();
  },
  renderJournal() {
    const pr = this.prog();
    const done = ACHIEVEMENTS.filter((a) => pr.ach[a.k]).length;
    $('jrSummary').textContent = done + ' of ' + ACHIEVEMENTS.length + ' achievements · ' + (pr.st.quests || 0) + ' quests finished';
    $('jrBar').style.width = (done / ACHIEVEMENTS.length * 100).toFixed(1) + '%';
    document.querySelectorAll('#journal .jr-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.t === this.tab));
    const body = $('jrBody');
    body.innerHTML = '';
    if (this.tab === 'ach') {
      const grid = document.createElement('div');
      grid.className = 'achgrid';
      for (const a of ACHIEVEMENTS) {
        const got = !!pr.ach[a.k];
        const c = document.createElement('div');
        c.className = 'ach' + (got ? ' got' : '');
        let prog = '';
        if (!got && a.count) {
          const v = Math.min(a.count[1], pr.st[a.count[0]] || 0);
          prog = `<div class="qc-bar"><i style="width:${(v / a.count[1] * 100).toFixed(1)}%"></i></div><small>${v} / ${a.count[1]}</small>`;
        }
        c.innerHTML = `<i style="background-image:url(${iconURL(a.icon)})"></i><div><b>${got ? a.name : a.name}</b><span>${a.desc}</span>${prog}<em>${got ? '✓ ' + new Date(pr.ach[a.k]).toLocaleDateString() : a.coins + ' coins'}</em></div>`;
        grid.append(c);
      }
      body.append(grid);
    } else {
      if (!pr.quests.length) {
        const p = document.createElement('p');
        p.className = 'note';
        p.textContent = 'No quests yet. Talk to villagers (right-click them): each one asks for help with something, and pays in coins.';
        body.append(p);
      }
      for (const q of pr.quests) {
        const got = this.have(q);
        const c = document.createElement('div');
        c.className = 'questcard wide';
        c.innerHTML = `<div class="qc-head">${q.kind === 'kill' ? '⚔' : `<i style="background-image:url(${iconURL(q.target)})"></i>`}<div><b>${this.describe(q)}</b><small>For ${q.giver}${q.town ? ' in ' + q.town : ''} (near ${q.at[0]}, ${q.at[1]}) · reward ${q.coins} coins${q.item ? ' + ' + q.itemN + ' ' + itemName(q.item) : ''}</small></div></div><div class="qc-bar"><i style="width:${Math.round(got / q.n * 100)}%"></i></div>`;
        const row = document.createElement('div');
        row.className = 'row';
        const s = document.createElement('span'); s.className = 'note'; s.textContent = got >= q.n ? 'Ready: go back to ' + q.giver : got + ' / ' + q.n;
        const b = document.createElement('button'); b.className = 'small'; b.textContent = 'Drop quest';
        b.addEventListener('click', () => { this.drop(q); this.renderJournal(); });
        row.append(s, b);
        c.append(row);
        body.append(c);
      }
    }
  },
};

// ---------------------------------------------------------------- hooks ----
{
  const destroy0 = destroyBlock;
  // eslint-disable-next-line no-global-assign
  destroyBlock = function (x, y, z, opts = {}) {
    const id = G.world.getBlock(x, y, z);
    const r = destroy0(x, y, z, opts);
    if (r && opts.tool !== undefined) Progress.event('mine', id);
    return r;
  };
  const place0 = Act.placeBlock;
  Act.placeBlock = function (hit) { const r = place0.call(this, hit); if (r) Progress.event('place'); return r; };
  const die0 = Mob.prototype.die;
  Mob.prototype.die = function (src) { const r = die0.call(this, src); if (src && src.player) Progress.event('kill', this.type); return r; };
  const craft0 = UI.takeCraft;
  UI.takeCraft = function (ref, shift) { const r = ref.craft && ref.craft.recipe && ref.craft.recipe.result; craft0.call(this, ref, shift); if (r) Progress.event('craft', r); };
  const trade0 = UI.doTrade;
  UI.doTrade = function (m, give, get, many) {
    const before = G.inv.count(get[0]);
    trade0.call(this, m, give, get, many);
    if (G.inv.count(get[0]) > before || G.mode === 'creative') Progress.event('trade');
  };
  const top0 = UI.renderTradeTop;
  UI.renderTradeTop = function (top) {
    top0.call(this, top);
    const box = top.querySelector('.tradebox');
    if (box && this.screen && this.screen.mob) {
      const wrap = document.createElement('div');
      Progress.tradeBox(this.screen.mob, wrap, this);
      box.insertBefore(wrap, box.children[1] || null);
    }
  };
  const travel0 = Portals.travel;
  Portals.travel = function (kind, force) { travel0.call(this, kind, force); Progress.event('dim', dimOf(G.player.pos[0], G.player.pos[2])); };
  const board0 = Vehicles.board;
  Vehicles.board = function (v) { const r = board0.call(this, v); if (G.vehicle) Progress.event('ride', G.vehicle.ride ? (G.vehicle.def && G.vehicle.def.key) : 'jet'); return r; };
  const sleep0 = trySleep;
  // eslint-disable-next-line no-global-assign
  trySleep = function (x, y, z) { const r = sleep0(x, y, z); if (G.sleeping) Progress.event('sleep'); return r; };
  const use0 = Mech.use;
  Mech.use = function (x, y, z, id) { const r = use0.call(this, x, y, z, id); if (r && id !== B.TIMER && id !== B.TIMER_ON) Progress.event('mech'); return r; };
  const ext0 = Mech.extend;
  Mech.extend = function (...a) { const r = ext0.apply(this, a); if (r && Math.hypot(a[0] - G.player.pos[0], a[2] - G.player.pos[2]) < 24) Progress.event('piston'); return r; };
}

SYNTH.achieve = (ctx, o, t) => {
  [523, 659, 784, 1047].forEach((f, i) => Sound.tone(ctx, o, t + i * 0.08, 0.5, { wave: 'triangle', f0: f, gain: 0.12 }));
  Sound.tone(ctx, o, t + 0.34, 0.9, { f0: 1319, gain: 0.08, vib: [6, 6] });
};
