'use strict';
// Mayor elections (the City Hall app). Every term lasts 45 real minutes. Anyone can stand with a
// slogan and a programme; every player votes (and can change it until the polls close), and the
// neighbours vote too: they lean towards whoever they know (achievements, homes, businesses, the
// crew) and whoever campaigned among them (talk to the neighbours while you are a candidate).
// Playing alone you run against two neighbourhood candidates. The winner rules the next term:
// their programme applies to everybody, they get a salary and can make announcements, and a
// medal shows by their name.
// World record in world.biz.mayor (SharedState 'mayor' from the host, 'cand:<owner>' and
// 'vote:<owner>' from each player).

const MAYOR_TERM = 45 * 60 * 1000;
const MAYOR_POLICIES = {
  transit: { icon: '🚄', name: ED('Transport gratis', 'Free transport'), text: ED('AVE gratis i vols a meitat de preu', 'Free AVE, half-price flights') },
  festa: { icon: '🎆', name: ED('Ciutat de festa', 'Party city'), text: ED('Concert cada vespre i focs a les 22 h', 'A concert every evening, fireworks at 10 pm') },
  eco: { icon: '🌳', name: ED('Ciutat segura i verda', 'Safe green city'), text: ED('Sense incendis ni apagades', 'No fires, no blackouts') },
  business: { icon: '💼', name: ED('Ciutat de negocis', 'Business city'), text: ED('Els negocis guanyen un 25 % més', 'Businesses earn 25% more') },
};
const MAYOR_NPC = [
  { o: 'npc:marta', n: 'Marta Puig', m: ED('Més parcs, menys fum', 'More parks, less smoke'), p: 'eco' },
  { o: 'npc:jordi', n: 'Jordi Vila', m: ED('Transport per a tothom', 'Transport for everyone'), p: 'transit' },
  { o: 'npc:carme', n: 'Carme Soler', m: ED('Una ciutat que balla', 'A city that dances'), p: 'festa' },
  { o: 'npc:pere', n: 'Pere Roig', m: ED('Feina i botigues obertes', 'Jobs and open shops'), p: 'business' },
];

const Mayor = {
  t: 0, lastHour: -1,
  st() {
    const d = BZ.data();
    if (!d.mayor || typeof d.mayor !== 'object') d.mayor = { term: 1, ends: Date.now() + MAYOR_TERM, mayor: null, cands: {}, hist: [] };
    if (!d.votes) d.votes = {};
    return d.mayor;
  },
  votes() { this.st(); return BZ.data().votes; },
  policy() { const m = this.st().mayor; return m && MAYOR_POLICIES[m.p] ? m.p : null; },
  isMayor() { const m = this.st().mayor; return !!m && m.o === Net.owner; },
  npcs() { const s = this.st(), i = s.term % MAYOR_NPC.length; return [MAYOR_NPC[i], MAYOR_NPC[(i + 1) % MAYOR_NPC.length]]; },
  cands() {
    const s = this.st(), list = Object.values(s.cands).filter((c) => c && c.o && c.term === s.term);
    if (!Net.on || list.length < 2) for (const n of this.npcs()) list.push({ ...n, term: s.term, npc: true });
    return list;
  },
  // how the neighbours see a candidate
  appeal(c) {
    if (c.npc) return 1 + hash3(this.st().term, c.o.length, 7, 98) * 1.2;
    let a = 0.5 + Math.min(2.5, (c.pts || 0) / 400) + Math.min(1.5, (c.camp || 0) * 0.1);
    return a;
  },
  tally() {
    const s = this.st(), cands = this.cands(), V = this.votes(), res = {};
    for (const c of cands) res[c.o] = 0;
    for (const [voter, c] of Object.entries(V)) if (res[c] !== undefined) res[c] += 1;
    // 30 neighbours
    const tot = cands.reduce((n, c) => n + this.appeal(c), 0) || 1;
    for (const c of cands) res[c.o] += Math.round(30 * this.appeal(c) / tot);
    return res;
  },
  close() {
    const s = this.st(), res = this.tally(), cands = this.cands();
    let best = null;
    for (const c of cands) if (!best || res[c.o] > res[best.o] || (res[c.o] === res[best.o] && c.o < best.o)) best = c;
    const total = Object.values(res).reduce((a, b) => a + b, 0) || 1;
    s.hist = [{ term: s.term, n: best ? best.n : '—', p: best && best.p, pct: best ? Math.round(res[best.o] / total * 100) : 0 }, ...(s.hist || [])].slice(0, 6);
    s.mayor = best ? { o: best.o, n: best.n, m: best.m, p: best.p, npc: !!best.npc, pct: Math.round(res[best.o] / total * 100) } : null;
    s.term++; s.ends = Date.now() + MAYOR_TERM; s.cands = {};
    BZ.data().votes = {};
    if (G.world) G.world.editsDirty = true;
    if (Net.on) SharedState.put('mayor', s);
    this.announce();
  },
  announce() {
    const m = this.st().mayor;
    if (!m) return;
    const P = MAYOR_POLICIES[m.p];
    if (m.o === Net.owner) { Shops.earn(300); G.ui.banner('🎖️', 'You are the new mayor of ' + CITY + '! +300 coins · ' + P.name); sfx('achieve', null, 1, 1); if (typeof Football !== 'undefined' && Football.fireworks) Football.fireworks(G.player.pos.slice()); }
    else G.ui.banner('🏛️', m.n + ' is the new mayor (' + m.pct + '%) · ' + P.icon + ' ' + P.name);
  },

  stand(motto, p) {
    const s = this.st();
    if (!MAYOR_POLICIES[p]) return;
    if (!s.cands[Net.owner] && !Shops.pay(100)) { G.ui.toast('🪙 Standing costs 100 coins'); return; }
    const c = { o: Net.owner, n: Net.name, m: String(motto || '').slice(0, 40) || 'For a better ' + CITY, p, term: s.term, pts: typeof Crews !== 'undefined' ? Crews.points() : 0, camp: (s.cands[Net.owner] && s.cands[Net.owner].camp) || 0 };
    s.cands[Net.owner] = c;
    SharedState.put('cand:' + Net.owner, c);
    this.vote(Net.owner);
    G.ui.banner('🗳️', 'You are a candidate! Talk to the neighbours to win their votes');
  },
  vote(o) {
    this.votes()[Net.owner] = o;
    SharedState.put('vote:' + Net.owner, { c: o, term: this.st().term });
    sfx('pling', null, 0.6, 1);
  },
  // campaigning: every neighbour you talk to while standing
  canvass(m) {
    const s = this.st(), c = s.cands[Net.owner];
    if (!c || c.term !== s.term || m.canvassed === s.term) return false;
    m.canvassed = s.term;
    c.camp = Math.min(15, (c.camp || 0) + 1);
    SharedState.put('cand:' + Net.owner, c);
    G.ui.toast('🗳️ ' + m.name + ': "I might vote for you!" · ' + c.camp + '/15 neighbours', 2600);
    return true;
  },

  update(dt) {
    this.t -= dt;
    if (this.t > 0 || !G.world || G.onTitle) return;
    this.t = 2;
    const s = this.st();
    if (Date.now() > s.ends && (!Net.on || Net.isHost())) this.close();
    const p = this.policy();
    // the programme in force
    if (p === 'eco' && typeof CityEvents !== 'undefined') CityEvents.fireT = Math.max(CityEvents.fireT, 60);
    if (p === 'festa' && typeof CityAlive !== 'undefined') {
      const h = Math.floor(CityAlive.hour());
      if (h === 22 && this.lastHour !== 22) { const plan = CityAlive.district(); if (plan && CityAlive.near(plan, 200) && typeof Football !== 'undefined') for (let i = 0; i < 4; i++) setTimeout(() => Football.fireworks([plan.x + rand(-12, 12), plan.y + 2, plan.z + rand(-12, 12)]), i * 1400); }
      this.lastHour = h;
    }
    // the mayor's salary, once a game day
    if (this.isMayor()) { const d = (G.prog && G.prog.day) | 0; if (G.prog && G.prog.mayorPaid !== d) { G.prog.mayorPaid = d; if (d) { Shops.earn(60); G.ui.toast('🎖️ Mayor\'s salary · +60'); } } }
  },

  open() {
    const q = GPanel.open({ title: ED('Ajuntament de ', '') + CITY + ED('', ' City Hall'), sub: 'Term ' + this.st().term, icon: '🏛️', cls: 'gp-mayor', width: 640 });
    let iv = 0;
    q.onClose = () => clearInterval(iv);
    const draw = () => {
      const s = this.st(), e = BZ.esc, m = s.mayor, res = this.tally(), total = Object.values(res).reduce((a, b) => a + b, 0) || 1, my = this.votes()[Net.owner];
      const left = Math.max(0, s.ends - Date.now()), mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60;
      const P = m && MAYOR_POLICIES[m.p];
      q.body.innerHTML = `
        <div class="my-hero">${m ? `<div class="my-medal">🎖️</div><div class="gp-grow"><small>Mayor of ${e(CITY)}</small><b>${e(m.n)}${m.o === Net.owner ? ' (you)' : ''}</b><span>“${e(m.m)}” · ${m.pct}% of the votes</span></div><div class="my-pol">${P.icon}<b>${e(P.name)}</b><small>${e(P.text)}</small></div>` : `<div class="my-medal">🏛️</div><div class="gp-grow"><b>No mayor yet</b><span>The first election closes soon</span></div>`}</div>
        <h4 class="bz-h">Election · term ${s.term} <span data-left>polls close in ${mm}:${String(ss).padStart(2, '0')}</span></h4>
        <div class="my-cands">${this.cands().map((c) => { const pc = Math.round((res[c.o] || 0) / total * 100), CP = MAYOR_POLICIES[c.p]; return `<div class="my-cand${my === c.o ? ' voted' : ''}"><div class="gp-grow"><b>${e(c.n)}${c.o === Net.owner ? ' (you)' : c.npc ? ' · neighbour' : ''}</b><small>“${e(c.m)}” · ${CP.icon} ${e(CP.name)}</small><div class="my-bar"><i style="width:${pc}%"></i><span>${pc}% in the polls</span></div></div><button class="gp-btn ${my === c.o ? 'ok' : ''}" data-vote="${e(c.o)}">${my === c.o ? '✓ Your vote' : 'Vote'}</button></div>`; }).join('')}</div>
        <h4 class="bz-h">Stand for mayor <span>🪙 100 · then talk to the neighbours to win votes</span></h4>
        <div class="my-stand"><input data-f="m" maxlength="40" placeholder="Your slogan" value="${e((s.cands[Net.owner] && s.cands[Net.owner].m) || '')}">
          <div class="my-pols">${Object.entries(MAYOR_POLICIES).map(([k, Q], i) => `<button data-p="${k}" class="${(s.cands[Net.owner] ? s.cands[Net.owner].p === k : i === 0) ? 'on' : ''}"><i>${Q.icon}</i><b>${e(Q.name)}</b><small>${e(Q.text)}</small></button>`).join('')}</div>
          <button class="gp-btn pri" data-a="stand">${s.cands[Net.owner] ? 'Update my candidacy' : 'Stand'}</button></div>
        ${this.isMayor() ? `<h4 class="bz-h">Mayor's office</h4><div class="my-stand"><input data-f="a" maxlength="80" placeholder="An announcement for everybody"><button class="gp-btn" data-a="say">📣 Announce</button></div>` : ''}
        ${(s.hist || []).length ? `<h4 class="bz-h">Past mayors</h4><div class="my-hist">${s.hist.map((h) => `<span>Term ${h.term}: <b>${e(h.n)}</b> ${h.p ? MAYOR_POLICIES[h.p].icon : ''} ${h.pct}%</span>`).join('')}</div>` : ''}`;
      let pol = (s.cands[Net.owner] && s.cands[Net.owner].p) || Object.keys(MAYOR_POLICIES)[0];
      q.body.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { q.body.querySelectorAll('[data-p]').forEach((x) => x.classList.remove('on')); b.classList.add('on'); pol = b.dataset.p; }));
      q.body.querySelectorAll('[data-vote]').forEach((b) => b.addEventListener('click', () => { this.vote(b.dataset.vote); draw(); }));
      const st = q.body.querySelector('[data-a="stand"]');
      if (st) st.addEventListener('click', () => { this.stand(q.body.querySelector('[data-f="m"]').value, pol); draw(); });
      const say = q.body.querySelector('[data-a="say"]');
      if (say) say.addEventListener('click', () => {
        const t = q.body.querySelector('[data-f="a"]').value.trim().slice(0, 80);
        if (!t) return;
        G.ui.banner('📣', 'Mayor ' + Net.name + ': ' + t);
        if (Net.on) Net.op(['MY', t]);
        q.body.querySelector('[data-f="a"]').value = '';
      });
    };
    draw();
    iv = setInterval(() => {
      if (!q.wrap.isConnected) { clearInterval(iv); return; }
      const el = q.body.querySelector('[data-left]'), left = Math.max(0, this.st().ends - Date.now());
      if (el) el.textContent = 'polls close in ' + Math.floor(left / 60000) + ':' + String(Math.floor(left / 1000) % 60).padStart(2, '0');
    }, 1000);
  },
};

{
  const apply = SharedState.apply;
  SharedState.apply = function (k, v) {
    if (k === 'mayor') {
      if (v && typeof v === 'object' && Number.isFinite(v.term)) {
        const d = BZ.data(), old = d.mayor, changed = !old || old.term !== v.term;
        d.mayor = v;
        if (changed && old) { d.votes = {}; Mayor.announce(); }
      }
      return;
    }
    if (k.startsWith('cand:')) { if (v && typeof v === 'object' && MAYOR_POLICIES[v.p]) Mayor.st().cands[k.slice(5)] = { ...v, o: k.slice(5), n: String(v.n || 'Someone').slice(0, 16) }; return; }
    if (k.startsWith('vote:')) { if (v && v.term === Mayor.st().term && typeof v.c === 'string') Mayor.votes()[k.slice(5)] = v.c; return; }
    return apply.call(this, k, v);
  };
  const ap = Net.applyOp;
  Net.applyOp = function (r, o) {
    if (o[1] === 'MY') { const m = Mayor.st().mayor; if (m && r && r.owner === m.o && typeof o[2] === 'string') G.ui.banner('📣', 'Mayor ' + m.n + ': ' + o[2].slice(0, 80)); return; }
    return ap.call(this, r, o);
  };
  // the mayor's medal travels with the presence
  const pd = Net.presenceData;
  Net.presenceData = function () { const d = pd.call(this); if (Mayor.isMayor()) d.my = 1; return d; };
  const onp = Net.onPresence;
  Net.onPresence = function (peer, pr) { onp.call(this, peer, pr); const r = this.peers.get(peer); if (r && pr && pr.my === 1 && !r.name.startsWith('🎖️')) r.name = '🎖️ ' + r.name; };
  // canvassing: talking to a neighbour while you stand
  if (typeof Citizens !== 'undefined') {
    const talk = Citizens.talk;
    Citizens.talk = function (m) { talk.call(this, m); Mayor.canvass(m); };
  }
  // the programmes
  const nb = Blackout.start;
  Blackout.start = function (plan) { if (Mayor.policy() === 'eco') return; return nb.call(this, plan); };
  const today = CityEvents.today;
  CityEvents.today = function () { const e = today.call(this); if (Mayor.policy() === 'festa' && e.kind !== 'concert') return { d: e.d, kind: 'concert', win: [18.5, 22.5] }; return e; };
  if (typeof Biz !== 'undefined') { const gr = Biz.gross; Biz.gross = function (s, b) { return gr.call(this, s, b) * (Mayor.policy() === 'business' ? 1.25 : 1); }; }
  if (typeof Ave !== 'undefined') { const ds = Ave.dests; Ave.dests = function () { const l = ds.call(this); return Mayor.policy() === 'transit' ? l.map((d) => ({ ...d, price: 0 })) : l; }; }
  const ad = Airport.dests;
  Airport.dests = function () { const l = ad.call(this); return Mayor.policy() === 'transit' ? l.map((d) => ({ ...d, price: Math.ceil(d.price / 2) })) : l; };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Mayor.update(dt || 0.016); } catch (e) { console.warn('Blocklands: mayor', e); } };
  PC.add({ key: 'cityhall', icon: '🏛️', name: ED('Ajuntament', 'City Hall'), run() { Mayor.open(); } });
}
