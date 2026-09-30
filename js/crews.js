'use strict';
// Crews ("colles"): found one with a name, a short tag, two colours and an emblem, set its
// headquarters where you stand (a flag in its colours waves there, on a tall pole) and friends
// join it from the Crews app. Members show the tag before their name. Each player's points
// (achievements, quests, homes, flats, businesses, money) add up to the crew's score, and the
// ranking lists every crew on the server. Playing alone, three neighbourhood crews compete too.
// World records in world.biz.crews / world.biz.cpts (SharedState crew:<id>, cpts:<owner>).

const CREW_COLORS = ['#d6202b', '#2a6ce0', '#2fbf71', '#ffcc33', '#8a3fb0', '#1ec8c8', '#f07614', '#ee6aa7', '#16161a', '#f4f1ea'];
const CREW_EMBLEMS = ['🦁', '🐉', '🦅', '🐺', '⚡', '🔥', '⭐', '🌊', '🍀', '👑', '🛹', '🎸'];
const CREW_NPC = [
  { id: 'npc1', name: ED('Colla del Raval', 'Harbour Crew'), tag: 'RVL', c: [0, 9], e: '🐺', base: 420 },
  { id: 'npc2', name: ED('Els Castellers', 'The Towers'), tag: 'CST', c: [1, 3], e: '⭐', base: 360 },
  { id: 'npc3', name: ED('Gràcia Rockers', 'Uptown Rockers'), tag: 'GRK', c: [4, 8], e: '🎸', base: 300 },
];

const Crews = {
  t: 0,
  data() { const d = BZ.data(); if (!d.crews) d.crews = {}; if (!d.cpts) d.cpts = {}; return d; },
  all() { return Object.values(this.data().crews).filter((c) => c && c.id && c.name); },
  mine() { const id = G.prog && G.prog.crew, c = id && this.data().crews[id]; return c && c.m && c.m[Net.owner] ? c : null; },
  put(c) { const d = this.data(); if (c.del) delete d.crews[c.id]; else d.crews[c.id] = c; if (G.world) G.world.editsDirty = true; SharedState.put('crew:' + c.id, c.del ? null : c); },
  // my points: what I have done in this world
  points() {
    const pr = G.prog || {}, D = BZ.data();
    let n = Object.keys(pr.ach || {}).length * 20 + ((pr.st && pr.st.quests) || 0) * 15;
    n += Object.values(D.flats || {}).filter((r) => r && BZ.me(r.o)).length * 40;
    n += Object.values((G.world && G.world.homes) || {}).filter((r) => r && BZ.me(r.o)).length * 60;
    n += Object.values(D.shops || {}).filter((s) => s && BZ.me(s.o)).length * 50;
    n += Math.floor((G.money | 0) / 100);
    return n;
  },
  score(c) {
    if (c.npc) { const days = ((G.prog && G.prog.day) | 0); return Math.round(c.base + days * 35 + hash3(days, c.base, 3, 97) * 60); }
    let n = 0;
    for (const o of Object.keys(c.m || {})) { const p = this.data().cpts[o]; n += o === Net.owner ? this.points() : p && p.c === c.id ? p.pts | 0 : 0; }
    return n;
  },
  ranking() {
    const list = this.all().map((c) => ({ ...c, pts: this.score(c) }));
    if (!Net.on) for (const c of CREW_NPC) list.push({ ...c, npc: true, m: {}, pts: this.score({ ...c, npc: true }) });
    return list.sort((a, b) => b.pts - a.pts);
  },
  tagOf(owner) { for (const c of this.all()) if (c.m && c.m[owner]) return c; return null; },

  found(name, tag, c0, c1, e) {
    if (this.mine()) { G.ui.toast('Leave your crew first'); return false; }
    name = String(name || '').trim().slice(0, 24); tag = String(tag || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
    if (name.length < 3 || tag.length < 2) { G.ui.toast('A crew needs a name (3+ letters) and a tag (2-4 letters)'); return false; }
    if (this.all().some((c) => c.tag === tag)) { G.ui.toast('That tag is taken'); return false; }
    if (!Shops.pay(250)) { G.ui.toast('🪙 Founding a crew costs 250 coins'); return false; }
    const c = { id: 'c' + Date.now().toString(36), name, tag, c: [c0 | 0, c1 | 0], e: CREW_EMBLEMS.includes(e) ? e : '⭐', o: Net.owner, m: { [Net.owner]: Net.name }, open: true, hq: null, t: Date.now() };
    (G.prog || (G.prog = {})).crew = c.id;
    this.put(c);
    G.ui.banner(c.e, 'Crew founded: ' + name + ' [' + tag + ']');
    sfx('achieve', null, 0.9, 1);
    return true;
  },
  join(id) {
    const c = this.data().crews[id];
    if (!c || this.mine()) return;
    if (!c.open) { G.ui.toast('This crew is invite-only: ask ' + (c.m[c.o] || 'its leader')); return; }
    c.m = { ...c.m, [Net.owner]: Net.name };
    (G.prog || (G.prog = {})).crew = id;
    this.put(c);
    G.ui.banner(c.e, 'You joined ' + c.name + ' [' + c.tag + ']');
    sfx('pling', null, 0.8, 1);
  },
  leave() {
    const c = this.mine();
    if (!c) return;
    const m = { ...c.m };
    delete m[Net.owner];
    G.prog.crew = null;
    if (!Object.keys(m).length) { this.put({ id: c.id, del: true }); G.ui.toast('The crew is disbanded'); return; }
    if (c.o === Net.owner) c.o = Object.keys(m)[0];
    c.m = m;
    this.put(c);
    G.ui.toast('You left ' + c.name);
  },
  setHQ() {
    const c = this.mine();
    if (!c || c.o !== Net.owner) return;
    const p = G.player.pos;
    c.hq = [Math.floor(p[0]), Math.floor(p[1]), Math.floor(p[2])];
    this.put(c);
    G.ui.banner('🚩', c.name + ' headquarters · the flag is up');
    sfx('achieve', null, 0.8, 1.2);
  },

  update(dt) {
    this.t -= dt;
    if (this.t > 0 || !G.world || G.onTitle) return;
    this.t = 20;
    const c = this.mine();
    if (Net.on && c) {
      const pts = this.points(), old = this.data().cpts[Net.owner];
      if (!old || old.pts !== pts || old.c !== c.id) { const v = { c: c.id, n: Net.name, pts, t: Date.now() }; this.data().cpts[Net.owner] = v; SharedState.put('cpts:' + Net.owner, v); }
    }
  },

  // the flags over the headquarters
  render(cp) {
    const uv = () => Vehicles.swatchUV('white');
    const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
    for (const c of this.all()) {
      if (!Array.isArray(c.hq) || Math.abs(c.hq[0] - cp[0]) > 120 || Math.abs(c.hq[2] - cp[2]) > 120) continue;
      const [x, y, z] = c.hq;
      ER.lightAt(x + 0.5, y + 4, z + 0.5);
      const m = XF.t(x + 0.5 - cp[0], y - cp[1], z + 0.5 - cp[2]);
      ER.color = [0.75, 0.76, 0.8]; ER.box(m, -0.06, 0, -0.06, 0.06, 7, 0.06, uv);
      ER.color = [0.95, 0.8, 0.2]; ER.box(m, -0.12, 7, -0.12, 0.12, 7.24, 0.12, uv);
      ER.color = [0.3, 0.3, 0.33]; ER.box(m, -0.35, 0, -0.35, 0.35, 0.2, 0.35, uv);
      // the cloth: strips that wave
      const [a, b] = [hex(CREW_COLORS[c.c[0]] || '#d6202b'), hex(CREW_COLORS[c.c[1]] || '#fff')];
      const N = 10, L = 3.2, H = 1.9, t = G.time;
      for (let i = 0; i < N; i++) {
        const u0 = i / N * L, u1 = (i + 1) / N * L, w0 = Math.sin(t * 3 + i * 0.7) * 0.18 * (i / N), w1 = Math.sin(t * 3 + (i + 1) * 0.7) * 0.18 * ((i + 1) / N);
        const w = (w0 + w1) / 2;
        // two halves: the hoist side in the first colour, the fly side in the second
        ER.color = i < N * 0.4 ? a : b;
        ER.box(m, 0.06 + u0, 6.95 - H, w - 0.03, 0.06 + u1, 6.95, w + 0.03, uv);
      }
    }
    ER.color = [1, 1, 1];
  },

  // ---- the app ----
  open() {
    const q = GPanel.open({ title: ED('Colles', 'Crews'), sub: CITY, icon: '🚩', cls: 'gp-crews', width: 620 });
    const draw = () => {
      const e = BZ.esc, me = this.mine(), rank = this.ranking();
      const badge = (c) => `<span class="cw-badge" style="--a:${CREW_COLORS[c.c[0]]};--b:${CREW_COLORS[c.c[1]]}"><i>${c.e}</i><b>${e(c.tag)}</b></span>`;
      let top = '';
      if (me) {
        const members = Object.entries(me.m).map(([o, n]) => `<span class="cw-mem">${o === me.o ? '👑 ' : ''}${e(n)}${o === Net.owner ? ' (you)' : ''}</span>`).join('');
        top = `<div class="cw-me" style="--a:${CREW_COLORS[me.c[0]]};--b:${CREW_COLORS[me.c[1]]}">${badge(me)}<div class="gp-grow"><b>${e(me.name)}</b><small>${Object.keys(me.m).length} member${Object.keys(me.m).length > 1 ? 's' : ''} · ${this.score(me)} points · ${me.hq ? 'HQ at ' + People.dist(me.hq) : 'no headquarters yet'}</small><div class="cw-mems">${members}</div></div>
          <div class="cw-acts">${me.o === Net.owner ? `<button class="gp-btn" data-a="hq">🚩 HQ here</button><button class="gp-btn" data-a="open">${me.open ? '🔓 Open' : '🔒 Invite-only'}</button>` : ''}<button class="gp-btn bad" data-a="leave">Leave</button></div></div>`;
      } else {
        top = `<div class="cw-new"><b>Found a crew</b> <span class="gp-dim">· 🪙 250</span>
          <div class="cw-form"><input data-f="name" maxlength="24" placeholder="Name (e.g. Els Llamps)"><input data-f="tag" maxlength="4" placeholder="TAG"></div>
          <div class="cw-pick" data-p="c0">${CREW_COLORS.map((c, i) => `<button data-v="${i}" style="background:${c}" class="${i === 0 ? 'on' : ''}"></button>`).join('')}</div>
          <div class="cw-pick" data-p="c1">${CREW_COLORS.map((c, i) => `<button data-v="${i}" style="background:${c}" class="${i === 9 ? 'on' : ''}"></button>`).join('')}</div>
          <div class="cw-pick em" data-p="e">${CREW_EMBLEMS.map((m, i) => `<button data-v="${m}" class="${i === 0 ? 'on' : ''}">${m}</button>`).join('')}</div>
          <button class="gp-btn ok" data-a="found">Found it</button></div>`;
      }
      q.body.innerHTML = top + `<h4 class="bz-h">Ranking <span>points: achievements, quests, homes, businesses and savings of every member</span></h4>
        <div class="cw-rank">${rank.map((c, i) => `<div class="cw-row${me && c.id === me.id ? ' me' : ''}"><em>${i + 1}</em>${badge(c)}<div class="gp-grow"><b>${e(c.name)}</b><small>${c.npc ? 'Neighbourhood crew' : Object.keys(c.m || {}).length + ' members' + (c.open ? ' · open' : ' · invite-only')}</small></div><b class="cw-pts">${c.pts}</b>${!me && !c.npc && c.open ? `<button class="gp-btn" data-join="${c.id}">Join</button>` : ''}</div>`).join('') || '<p class="gp-dim">No crews yet: found the first one!</p>'}</div>`;
      const pick = {};
      q.body.querySelectorAll('.cw-pick').forEach((row) => {
        pick[row.dataset.p] = row.querySelector('.on').dataset.v;
        row.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => { row.querySelectorAll('button').forEach((x) => x.classList.remove('on')); b.classList.add('on'); pick[row.dataset.p] = b.dataset.v; }));
      });
      const act = (a) => {
        if (a === 'found') { const f = (k) => q.body.querySelector(`[data-f="${k}"]`).value; if (this.found(f('name'), f('tag'), Number(pick.c0), Number(pick.c1), pick.e)) draw(); }
        if (a === 'hq') { this.setHQ(); draw(); }
        if (a === 'open') { me.open = !me.open; this.put(me); draw(); }
        if (a === 'leave' && confirm('Leave ' + me.name + '?')) { this.leave(); draw(); }
      };
      q.body.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => act(b.dataset.a)));
      q.body.querySelectorAll('[data-join]').forEach((b) => b.addEventListener('click', () => { this.join(b.dataset.join); draw(); }));
    };
    draw();
  },
};

{
  // the tag travels with each player's presence: [TAG] Name over their head
  const pd = Net.presenceData;
  Net.presenceData = function () { const d = pd.call(this); const c = Crews.mine(); if (c) d.cw = c.tag; return d; };
  const op = Net.onPresence;
  Net.onPresence = function (peer, pr) {
    op.call(this, peer, pr);
    const r = this.peers.get(peer);
    if (r && pr) { const tag = typeof pr.cw === 'string' ? pr.cw.replace(/[^A-Z0-9]/g, '').slice(0, 4) : ''; if (tag && !r.name.startsWith('[')) r.name = '[' + tag + '] ' + r.name; }
  };
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) {
    if (k.startsWith('crew:')) { const d = Crews.data(), id = k.slice(5); if (v && typeof v === 'object' && v.name && v.m && JSON.stringify(v).length < 3000) d.crews[id] = v; else if (!v) delete d.crews[id]; return; }
    if (k.startsWith('cpts:')) { const d = Crews.data(); if (v && typeof v === 'object' && Number.isFinite(v.pts)) d.cpts[k.slice(5)] = v; return; }
    return apply.call(this, k, v);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Crews.update(dt || 0.016); } catch (e) { console.warn('Blocklands: crews', e); } };
  const wr = Weather.render;
  Weather.render = function (cp, ...a) { const r = wr.call(this, cp, ...a); try { Crews.render(cp); } catch (e) { /* ignore */ } return r; };
  PC.add({ key: 'crews', icon: '🚩', name: ED('Colles', 'Crews'), run() { Crews.open(); } });
}
