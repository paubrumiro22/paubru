'use strict';
// Classes at STUCOM (the school edition only). School runs 8:00-14:30 of game time in periods
// of an hour with a break at 11:00; each day of the week has its own timetable and each subject
// its teacher and classroom: Programació with Noelia, Projectes with Laura Tañá, Sistemes with
// Ramon Abad, Xarxes with Pedro Porcuna and Tutoria with Joan Zarzuela. The bell rings at every
// change (near the school), a chip says what is on now and where, and during a class you
// right-click its teacher to take it: five questions, a mark out of 10 and coins for it. The
// report card (Butlletí app) keeps the marks, the attendance and each teacher's comment.

const SUBJECTS = {
  prog: { name: 'Programació', teacher: 'noelia', tn: 'Noelia González', icon: '💻', room: 'aula de la 2a planta' },
  proj: { name: 'Projectes', teacher: 'laura', tn: 'Laura Tañá', icon: '🧩', room: 'aula de la 1a planta' },
  sist: { name: 'Sistemes', teacher: 'ramon', tn: 'Ramon Abad', icon: '🖥️', room: "aula d'ordinadors (3a planta)" },
  xarx: { name: 'Xarxes', teacher: 'pedro', tn: 'Pedro Porcuna', icon: '🌐', room: "l'annex, al parc" },
  tut: { name: 'Tutoria', teacher: 'joan', tn: 'Joan Zarzuela', icon: '🎓', room: 'el vestíbul' },
};
// start hours of the periods, and the timetable of the five days
const PERIODS = [8, 9, 10, 11.5, 12.5, 13.5];
const TIMETABLE = [
  ['prog', 'prog', 'xarx', 'proj', 'sist', 'tut'],
  ['sist', 'sist', 'prog', 'xarx', 'proj', 'proj'],
  ['xarx', 'prog', 'prog', 'sist', 'tut', 'proj'],
  ['proj', 'proj', 'sist', 'prog', 'xarx', 'xarx'],
  ['tut', 'xarx', 'proj', 'prog', 'prog', 'sist'],
];
const QUESTIONS = {
  prog: [
    ['Què mostra console.log(2 + "2") en JavaScript?', ['22', '4', 'Error', 'NaN'], 0],
    ['Quin bucle fa servir una condició i pot no executar-se mai?', ['while', 'do…while', 'Cap', 'switch'], 0],
    ['Com es declara una constant en JavaScript?', ['const', 'let', 'var', 'static'], 0],
    ['Quin és l\'índex del primer element d\'un array?', ['0', '1', '-1', 'Depèn'], 0],
    ['Què retorna "hola".length?', ['4', '5', '3', 'undefined'], 0],
    ['En Python, com comença un comentari d\'una línia?', ['#', '//', '--', '/*'], 0],
    ['Quin operador compara valor i tipus en JavaScript?', ['===', '==', '=', '!='], 0],
    ['Què és una funció recursiva?', ['Una que es crida a si mateixa', 'Una sense paràmetres', 'Una que no retorna res', 'Una asíncrona'], 0],
    ['Quin tipus té true?', ['boolean', 'string', 'number', 'object'], 0],
    ['Què fa Array.push()?', ['Afegeix al final', 'Treu el primer', 'Ordena', 'Inverteix'], 0],
  ],
  proj: [
    ['Com es diu la reunió diària curta de Scrum?', ['Daily', 'Sprint review', 'Retrospectiva', 'Planning'], 0],
    ['Quina ordre de git desa els canvis al repositori local?', ['git commit', 'git push', 'git pull', 'git clone'], 0],
    ['Què és un MVP?', ['Producte mínim viable', 'Pla de màxim valor', 'Model de vista pública', 'Millor versió possible'], 0],
    ['Què és un sprint?', ['Un període curt de feina', 'Un error greu', 'Un servidor', 'Un diagrama'], 0],
    ['Quin diagrama mostra les tasques en el temps?', ['Gantt', 'UML de classes', 'Flux de dades', 'Venn'], 0],
    ['Quina ordre porta els canvis del remot?', ['git pull', 'git add', 'git init', 'git log'], 0],
    ['Què és el backlog?', ['La llista de feines pendents', 'Un registre d\'errors del servidor', 'La còpia de seguretat', 'El pressupost'], 0],
    ['Un requisit "l\'app ha de carregar en 2 s" és…', ['No funcional', 'Funcional', 'Legal', 'Opcional'], 0],
  ],
  sist: [
    ['Quina peça executa les instruccions?', ['La CPU', 'La RAM', 'El disc', 'La font'], 0],
    ['La memòria RAM és…', ['Volàtil', 'Permanent', 'Òptica', 'Magnètica'], 0],
    ['Quin d\'aquests és un sistema operatiu?', ['Linux', 'Chrome', 'Word', 'Java'], 0],
    ['Quants bits té un byte?', ['8', '4', '16', '10'], 0],
    ['Què és el BIOS/UEFI?', ['El firmware que arrenca l\'ordinador', 'Un antivirus', 'Un navegador', 'Un disc'], 0],
    ['Quina ordre llista fitxers a Linux?', ['ls', 'dir /s', 'list', 'show'], 0],
    ['Un SSD guarda les dades en…', ['Memòria flash', 'Plats magnètics', 'Cinta', 'Discos òptics'], 0],
    ['Què fa un sistema de fitxers?', ['Organitza les dades al disc', 'Refreda la CPU', 'Connecta a internet', 'Imprimeix'], 0],
  ],
  xarx: [
    ['Quin protocol dóna adreces IP automàticament?', ['DHCP', 'DNS', 'HTTP', 'FTP'], 0],
    ['Què tradueix noms com stucom.com a IP?', ['DNS', 'DHCP', 'SMTP', 'ARP'], 0],
    ['Quants bits té una adreça IPv4?', ['32', '64', '128', '16'], 0],
    ['Quin port fa servir HTTPS?', ['443', '80', '21', '25'], 0],
    ['Quin aparell connecta xarxes diferents?', ['El router', 'El switch', 'El cable', 'El hub'], 0],
    ['192.168.1.10 és una adreça…', ['Privada', 'Pública', 'IPv6', 'De broadcast'], 0],
    ['Quina capa OSI és la de transport?', ['La 4', 'La 3', 'La 2', 'La 7'], 0],
    ['TCP, a diferència d\'UDP…', ['Garanteix l\'entrega', 'És més ràpid', 'No fa servir ports', 'Només va per wifi'], 0],
  ],
  tut: [
    ['A quina hora comencen les classes a STUCOM (al joc)?', ['8:00', '9:30', '7:00', '10:00'], 0],
    ['Quan hi ha el pati?', ['A les 11', 'A les 13', 'A les 9', 'No n\'hi ha'], 0],
    ['Què cal fer si no entens una cosa a classe?', ['Preguntar al professor', 'Callar', 'Marxar', 'Copiar'], 0],
    ['On és l\'aula d\'ordinadors?', ['A la 3a planta', 'Al soterrani', 'A l\'annex', 'Al pati'], 0],
    ['Quina és una bona manera d\'estudiar?', ['Repassar cada dia una mica', 'Tot la nit abans', 'Mai', 'Només mirar vídeos'], 0],
    ['Què és el butlletí?', ['El document amb les notes', 'El diari de la ciutat', 'L\'horari del metro', 'Un examen'], 0],
    ['Si arribes tard a classe…', ['Demanes permís per entrar', 'Crides fort', 'Te\'n vas a casa', 'Entres corrent'], 0],
  ],
};

const Classes = {
  t: 0, lastKey: null, chip: null,
  on() { return !CG && typeof City !== 'undefined' && !!City.plan(); },
  rec() {
    const pr = G.prog || (G.prog = {});
    const s = pr.school || (pr.school = { marks: {}, att: {}, done: {} });
    for (const k of Object.keys(SUBJECTS)) { if (!s.marks[k]) s.marks[k] = []; if (!s.att[k]) s.att[k] = 0; }
    return s;
  },
  weekday() { return ((G.prog && G.prog.day) | 0) % 5; },
  // what is on now: { i (period), subject, start, end } or break / out
  now() {
    const h = CityAlive.hour();
    if (h >= 11 && h < 11.5) return { brk: true, start: 11, end: 11.5 };
    for (let i = 0; i < PERIODS.length; i++) if (h >= PERIODS[i] && h < PERIODS[i] + 1) return { i, s: TIMETABLE[this.weekday()][i], start: PERIODS[i], end: PERIODS[i] + 1 };
    return null;
  },
  key(n) { return ((G.prog && G.prog.day) | 0) + ':' + (n ? (n.brk ? 'b' : n.i) : 'x'); },
  nearSchool() { const st = City.plan(), p = G.player.pos; return st && Math.hypot(p[0] - st.x, p[2] - (st.z - 40)) < 160 && Math.abs(p[1] - st.y) < 40; },
  personOf(m) {
    if (!m || m.prof !== 'teacher') return null;
    for (const [k, i] of Object.entries(PERSON_SKIN)) if (m.skin === i) return k;
    const S = Object.values(SUBJECTS).find((q) => q.tn === m.name);
    return S ? S.teacher : null;
  },

  update(dt) {
    if (!this.on() || !G.world || G.onTitle) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const n = this.now(), k = this.key(n), near = this.nearSchool();
    if (k !== this.lastKey) {
      const first = this.lastKey === null;
      this.lastKey = k;
      if (!first && near) {
        sfx('school_bell', null, 0.7, 1);
        if (n && !n.brk) { const S = SUBJECTS[n.s]; G.ui.toast('🔔 ' + S.icon + ' ' + S.name + ' amb ' + S.tn + ' · ' + S.room, 5000); }
        else if (n && n.brk) G.ui.toast('🔔 Pati! 30 minuts', 3500);
        else if (CityAlive.hour() >= 14.5 && CityAlive.hour() < 15) G.ui.toast('🔔 Fi de les classes per avui', 3500);
      }
    }
    this.drawChip(n, near);
  },
  drawChip(n, near) {
    if (!this.chip) { this.chip = document.createElement('div'); this.chip.id = 'classChip'; document.body.append(this.chip); }
    const show = near && !G.onTitle && n;
    this.chip.classList.toggle('show', !!show);
    if (!show) return;
    const h = CityAlive.hour(), left = Math.max(0, Math.round((n.end - h) * 60));
    const html = n.brk ? `<i>🥪</i><b>Pati</b><span>${left} min</span>` : (() => { const S = SUBJECTS[n.s], done = this.rec().done[this.key(n)]; return `<i>${S.icon}</i><b>${S.name}</b><span>${S.tn.split(' ')[0]} · ${S.room} · ${done ? '✅ feta' : left + ' min'}</span>`; })();
    if (this.chip.dataset.h !== html) { this.chip.innerHTML = html; this.chip.dataset.h = html; }
  },

  // a class: five questions
  take(sk, m) {
    const S = SUBJECTS[sk], R = this.rec(), n = this.now(), key = this.key(n);
    if (R.done[key]) { G.ui.toast('💬 ' + S.tn.split(' ')[0] + ': "Ja has fet la classe d\'avui, molt bé!"', 3000); return; }
    const bank = QUESTIONS[sk].slice(), qs = [];
    while (qs.length < 5 && bank.length) qs.push(bank.splice(Math.floor(Math.random() * bank.length), 1)[0]);
    let i = 0, ok = 0;
    const late = n && (CityAlive.hour() - n.start) > 0.25;
    const q = GPanel.open({ title: S.name, sub: 'amb ' + S.tn + (late ? ' · has arribat tard' : ''), icon: S.icon, cls: 'gp-class', width: 560 });
    const draw = () => {
      if (i >= qs.length) {
        const mark = Math.max(0, Math.round((ok / qs.length * 10 - (late ? 0.5 : 0)) * 10) / 10);
        R.marks[sk].push(mark); R.att[sk]++; R.done[key] = mark;
        if (R.marks[sk].length > 40) R.marks[sk].shift();
        const coins = Math.round(mark * 5);
        Shops.earn(coins);
        const cm = mark >= 9 ? 'Excel·lent! Així m\'agrada.' : mark >= 7 ? 'Molt bé, notable.' : mark >= 5 ? 'Aprovat, però pots fer-ho millor.' : 'Cal repassar, demà ho tornem a mirar.';
        q.body.innerHTML = `<div class="cl-res"><div class="cl-mark ${mark >= 5 ? 'ok' : 'ko'}">${mark.toFixed(1)}</div><p>“${cm}”</p><small>${ok} de ${qs.length} correctes${late ? ' · −0,5 per arribar tard' : ''} · +${coins} monedes</small><button class="gp-btn ok" data-a="ok">Gràcies, ${S.tn.split(' ')[0]}!</button></div>`;
        q.body.querySelector('[data-a="ok"]').addEventListener('click', () => q.close());
        sfx(mark >= 5 ? 'achieve' : 'gate_no', null, 0.7, 1);
        return;
      }
      const [text, opts] = qs[i], order = opts.map((o, j) => j).sort(() => Math.random() - 0.5);
      q.body.innerHTML = `<div class="cl-top"><span>Pregunta ${i + 1} de ${qs.length}</span><div class="cl-dots">${qs.map((_, j) => `<i class="${j < i ? 'd' : j === i ? 'n' : ''}"></i>`).join('')}</div></div>
        <h3 class="cl-q">${GPanel.esc(text)}</h3><div class="cl-opts">${order.map((j, k) => `<button data-j="${j}"><b>${'ABCD'[k]}</b>${GPanel.esc(opts[j])}</button>`).join('')}</div>`;
      q.body.querySelectorAll('[data-j]').forEach((b) => b.addEventListener('click', () => {
        const right = Number(b.dataset.j) === qs[i][2];
        if (right) ok++;
        b.classList.add(right ? 'ok' : 'ko');
        if (!right) q.body.querySelector(`[data-j="${qs[i][2]}"]`).classList.add('ok');
        q.body.querySelectorAll('[data-j]').forEach((x) => { x.disabled = true; });
        sfx(right ? 'pling' : 'gate_no', null, 0.5, right ? 1.2 : 1);
        setTimeout(() => { i++; draw(); }, 900);
      }));
    };
    draw();
  },

  // the report card
  report() {
    const R = this.rec(), e = GPanel.esc;
    const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
    const word = (v) => (v === null ? '—' : v >= 9 ? 'Excel·lent' : v >= 7 ? 'Notable' : v >= 6 ? 'Bé' : v >= 5 ? 'Suficient' : 'Insuficient');
    const comment = (k, v) => (v === null ? 'Encara no ha vingut a cap classe.' : v >= 9 ? 'Treball excel·lent i molt constant. Felicitats!' : v >= 7 ? 'Molt bona feina, segueix així.' : v >= 5 ? 'Aprova, però pot donar més de si.' : 'Ha de repassar i venir més a classe.');
    const rows = Object.entries(SUBJECTS).map(([k, S]) => { const v = avg(R.marks[k]); return { k, S, v, att: R.att[k] }; });
    const all = rows.filter((r) => r.v !== null), total = all.length ? all.reduce((a, r) => a + r.v, 0) / all.length : null;
    const tri = Math.floor(((G.prog && G.prog.day) | 0) / 4) % 3 + 1;
    const q = GPanel.open({ title: 'Butlletí de notes', sub: tri + 'r trimestre', icon: '📋', cls: 'gp-report', width: 640 });
    q.body.innerHTML = `<div class="rp-sheet">
      <div class="rp-head"><div class="rp-logo">STUCOM</div><div><b>STUCOM Centre d'Estudis</b><small>Carrer de Pelai · Barcelona</small></div><div class="rp-who"><small>Alumne/a</small><b>${e(Net.name || 'Alumne')}</b><small>${tri}r trimestre · DAM 1r</small></div></div>
      <table class="rp-t"><thead><tr><th>Assignatura</th><th>Professor/a</th><th>Classes</th><th>Nota</th><th>Qualificació</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${r.S.icon} ${r.S.name}</td><td>${e(r.S.tn)}</td><td>${r.att}</td><td class="n">${r.v === null ? '—' : r.v.toFixed(1)}</td><td class="${r.v === null ? '' : r.v >= 5 ? 'ok' : 'ko'}">${word(r.v)}</td></tr>`).join('')}
      </tbody></table>
      <div class="rp-comments">${rows.map((r) => `<p><b>${e(r.S.tn)}:</b> ${comment(r.k, r.v)}</p>`).join('')}</div>
      <div class="rp-foot"><div><small>Mitjana</small><b>${total === null ? '—' : total.toFixed(2)}</b><span>${word(total)}</span></div><div class="rp-sign"><i>J. Zarzuela</i><small>Direcció</small></div></div>
    </div>`;
  },
};

SYNTH.school_bell = (ctx, o, t) => {
  for (let i = 0; i < 6; i++) { Sound.tone(ctx, o, t + i * 0.28, 0.25, { wave: 'triangle', f0: 1318, gain: 0.07 }); Sound.tone(ctx, o, t + i * 0.28 + 0.14, 0.2, { wave: 'triangle', f0: 1046, gain: 0.06 }); }
};

if (!CG) {
  const use = Act.useItem;
  Act.useItem = function (initial) {
    const t = this.target;
    if (initial && t && t.mob && !t.mob.dead && !G.player.sneaking && Classes.on()) {
      const who = Classes.personOf(t.mob);
      if (who) {
        const n = Classes.now(), sk = Object.keys(SUBJECTS).find((k) => SUBJECTS[k].teacher === who);
        if (n && !n.brk && n.s === sk) { Classes.take(sk, t.mob); this.swingHand(); return true; }
        if (sk) {
          const next = TIMETABLE[Classes.weekday()].map((s, i) => [s, PERIODS[i]]).find(([s, h]) => s === sk && h > CityAlive.hour());
          G.ui.toast('💬 ' + SUBJECTS[sk].tn.split(' ')[0] + ': "' + (next ? 'Avui tenim classe a les ' + Math.floor(next[1]) + ':' + (next[1] % 1 ? '30' : '00') : 'Avui ja no tenim classe, fins demà!') + '" (Shift + clic per comprar)', 3500);
        }
      }
    }
    return use.call(this, initial);
  };
  const fu = Furniture.update;
  Furniture.update = function (dt) { fu.call(this, dt); try { Classes.update(dt || 0.016); } catch (e) { console.warn('Blocklands: classes', e); } };
  PC.add({ key: 'report', icon: '📋', name: 'Butlletí', run() { Classes.report(); } });
  PC.add({ key: 'timetable', icon: '🗓️', name: 'Horari', run() {
    const q = GPanel.open({ title: 'Horari', sub: 'DAM 1r · STUCOM', icon: '🗓️', cls: 'gp-tt', width: 640 });
    const days = ['Dilluns', 'Dimarts', 'Dimecres', 'Dijous', 'Divendres'], wd = Classes.weekday(), n = Classes.now();
    q.body.innerHTML = `<table class="tt"><thead><tr><th></th>${days.map((d, i) => `<th class="${i === wd ? 'on' : ''}">${d}</th>`).join('')}</tr></thead><tbody>
      ${PERIODS.map((h, i) => (i === 3 ? `<tr class="brk"><td>11:00</td><td colspan="5">🥪 Pati</td></tr>` : '') + `<tr><td>${Math.floor(h)}:${h % 1 ? '30' : '00'}</td>${days.map((_, d) => { const S = SUBJECTS[TIMETABLE[d][i]]; return `<td class="${d === wd && n && n.i === i ? 'now' : ''}"><b>${S.icon} ${S.name}</b><small>${S.tn.split(' ')[0]}</small></td>`; }).join('')}</tr>`).join('')}
      </tbody></table><p class="gp-dim">Durant la classe, clic dret al professor per fer-la. Avui és ${days[wd].toLowerCase()}.</p>`;
  } });
}
