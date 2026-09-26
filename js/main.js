'use strict';
// Boot, settings/menu, input and the frame loop.

const SETTINGS_UI = [
  { key: 'renderDistance', group: 'display', label: 'Render distance', hint: 'How far you can see. The biggest effect on speed.', type: 'range', min: 3, max: 16, step: 1, fmt: (v) => v + ' chunks' },
  { key: 'renderScale', group: 'display', label: 'Render scale', hint: 'Resolution of the 3D view. Below 100% is faster but softer.', type: 'range', min: 0.5, max: 2, step: 0.25, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'dynamicRes', group: 'display', label: 'Dynamic resolution', hint: 'Lowers the resolution for a moment when frames slow down.', type: 'check' },
  { key: 'fov', group: 'display', label: 'Field of view', hint: 'How wide the camera sees.', type: 'range', min: 50, max: 110, step: 1, fmt: (v) => v + '°' },
  { key: 'brightness', group: 'display', label: 'Brightness', type: 'range', min: 0.6, max: 1.8, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'shadows', group: 'effects', label: 'Shadows', hint: 'Sharper shadows cost more.', type: 'select', options: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'clouds', group: 'effects', label: 'Volumetric clouds', hint: 'Soft 3D clouds. Quite heavy on slow devices.', type: 'check' },
  { key: 'ssr', group: 'effects', label: 'Water reflections', hint: 'The world reflected on water and wet ground.', type: 'check' },
  { key: 'godrays', group: 'effects', label: 'Sun rays', hint: 'Light beams through trees and clouds.', type: 'check' },
  { key: 'bloom', group: 'effects', label: 'Bloom', hint: 'Glow around bright lights.', type: 'check' },
  { key: 'fxaa', group: 'effects', label: 'Anti-aliasing', hint: 'Smooths jagged edges (FXAA).', type: 'check' },
  { key: 'weather', group: 'world', label: 'Weather', hint: 'Rain, storms, snow where it is cold, and fog.', type: 'select', options: [['auto', 'Changes by itself'], ['clear', 'Clear'], ['rain', 'Rain'], ['storm', 'Storm'], ['snow', 'Snow'], ['fog', 'Fog']] },
  { key: 'events', group: 'world', label: 'World events', hint: 'Meteor showers on clear nights and volcano eruptions.', type: 'check' },
  { key: 'wildlife', group: 'world', label: 'Wildlife', hint: 'Birds, bees, butterflies and fish.', type: 'check' },
  { key: 'volume', group: 'sound', label: 'Master volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'minimap', group: 'hud', label: 'Minimap', hint: 'The round map in the corner. Press M for the big map.', type: 'select', options: [['normal', 'Close'], ['large', 'Far'], ['off', 'Off']] },
  { key: 'bobbing', group: 'hud', label: 'View bobbing', hint: 'The camera sways as you walk.', type: 'check' },
  { key: 'sensitivity', group: 'controls', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) + '×' },
];

// Quality presets offered above the graphics options.
const QUALITY_PRESETS = [
  { name: 'Low', hint: 'Old or slow devices', bars: 1, set: { shadows: 'off', clouds: false, ssr: false, godrays: false, bloom: true, renderDistance: 5, renderScale: 0.75 } },
  { name: 'Medium', hint: 'Laptops', bars: 2, set: { shadows: 'low', clouds: false, ssr: true, godrays: false, bloom: true, renderDistance: 7, renderScale: 1 } },
  { name: 'High', hint: 'Recommended', bars: 3, set: { shadows: 'medium', clouds: true, ssr: true, godrays: true, bloom: true, renderDistance: 8, renderScale: 1 } },
  { name: 'Ultra', hint: 'Powerful graphics cards', bars: 4, set: { shadows: 'high', clouds: true, ssr: true, godrays: true, bloom: true, renderDistance: 12, renderScale: 1 } },
];

// ---------- errors ----------
function showError(title, err) {
  if (G.dead) return;
  G.dead = true;
  const msg = err && err.stack ? err.stack : String(err && err.message ? err.message : err);
  $('errorTitle').textContent = title;
  $('errorText').textContent = msg;
  $('errorBox').classList.remove('hidden');
  $('loading').classList.add('hidden');
  $('menu').classList.add('hidden');
  try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
}
// Boot and the frame loop report their own failures; stray errors from input handlers or the
// hosting page are logged instead of stopping the game.
window.addEventListener('error', (e) => console.warn('Blocklands:', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => console.warn('Blocklands:', e.reason));
$('reloadBtn').addEventListener('click', () => location.reload());

// ---------- settings ----------
function loadSettings() {
  const s = storageGet(SETTINGS_KEY);
  if (!s || typeof s !== 'object') return;
  for (const k of Object.keys(DEFAULT_SETTINGS)) {
    if (s[k] === undefined || typeof s[k] !== typeof DEFAULT_SETTINGS[k]) continue;
    G.settings[k] = s[k];
  }
  const st = G.settings;
  if (!SHADOW_PRESETS[st.shadows]) st.shadows = 'medium';
  st.renderDistance = clamp(Math.round(st.renderDistance), 3, 16);
  st.renderScale = clamp(st.renderScale, 0.5, 2);
  st.fov = clamp(st.fov, 50, 110);
  st.sensitivity = clamp(st.sensitivity, 0.2, 3);
  st.brightness = clamp(st.brightness, 0.6, 1.8);
  st.volume = clamp(st.volume, 0, 1);
  if (!['auto', ...WEATHER_KINDS].includes(st.weather)) st.weather = 'auto';
  st.skin = clamp(Math.round(st.skin) || 0, 0, SKINS.length - 1);
  if (!['normal', 'large', 'off'].includes(st.minimap)) st.minimap = 'normal';
}
function saveSettings() { storageSet(SETTINGS_KEY, G.settings); }

function buildSettingsUI() {
  const hosts = {};
  document.querySelectorAll('[data-sgroup]').forEach((h) => { h.innerHTML = ''; hosts[h.dataset.sgroup] = h; });
  for (const def of SETTINGS_UI) {
    const host = hosts[def.group];
    if (!host) continue;
    const row = document.createElement('div');
    row.className = 'srow';
    const l = document.createElement('div');
    l.className = 'sl';
    const title = document.createElement('b');
    title.textContent = def.label;
    l.append(title);
    if (def.hint) { const h = document.createElement('small'); h.textContent = def.hint; l.append(h); }
    const c = document.createElement('div');
    c.className = 'sc';
    const val = G.settings[def.key];
    if (def.type === 'check') {
      const sw = document.createElement('label');
      sw.className = 'sw';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!val;
      cb.setAttribute('aria-label', def.label);
      cb.addEventListener('change', () => { setSetting(def.key, cb.checked); markQualityPreset(); });
      sw.append(cb, document.createElement('span'));
      c.append(sw);
    } else if (def.type === 'select' && def.options.length <= 4) {
      const seg = document.createElement('div');
      seg.className = 'seg';
      for (const [v, t] of def.options) {
        const b = document.createElement('button');
        b.textContent = t;
        b.classList.toggle('on', v === val);
        b.addEventListener('click', () => {
          setSetting(def.key, v);
          for (const o of seg.children) o.classList.toggle('on', o === b);
          markQualityPreset();
        });
        seg.append(b);
      }
      c.append(seg);
    } else if (def.type === 'select') {
      const sel = document.createElement('select');
      sel.setAttribute('aria-label', def.label);
      for (const [v, t] of def.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sel.append(o);
      }
      sel.value = val;
      sel.addEventListener('change', () => setSetting(def.key, sel.value));
      c.append(sel);
    } else {
      c.classList.add('range');
      const out = document.createElement('output');
      out.textContent = def.fmt(val);
      const r = document.createElement('input');
      r.type = 'range'; r.min = def.min; r.max = def.max; r.step = def.step; r.value = val;
      r.setAttribute('aria-label', def.label);
      r.addEventListener('input', () => {
        const v = Number(r.value);
        out.textContent = def.fmt(v);
        setSetting(def.key, v);
        markQualityPreset();
      });
      c.append(r, out);
    }
    row.append(l, c);
    host.append(row);
  }
  buildQualityPresets();
}

function buildQualityPresets() {
  const host = $('qPresets');
  if (!host) return;
  host.innerHTML = '';
  for (const p of QUALITY_PRESETS) {
    const b = document.createElement('button');
    b.className = 'qp';
    const bars = document.createElement('span');
    bars.className = 'bars';
    for (let i = 0; i < 4; i++) { const k = document.createElement('i'); if (i < p.bars) k.className = 'f'; bars.append(k); }
    const n = document.createElement('b'); n.textContent = p.name;
    const h = document.createElement('small'); h.textContent = p.hint;
    b.append(bars, n, h);
    b.addEventListener('click', () => {
      sfx('click', null, 1, 1);
      // picking a preset by hand means you are choosing: automatic quality steps aside
      if (G.settings.autoQuality) { AutoQuality.state = null; G.settings.autoQuality = false; G.settings.preAuto = null; $('autoQualityCheck').checked = false; }
      for (const [k, v] of Object.entries(p.set)) setSetting(k, v);
      if (G.dynRes) { G.dynRes.scale = 1; resize(); }
      saveSettings();
      buildSettingsUI();
      $('autoQualityMsg').textContent = p.name + ' quality selected' + (p.name === 'Ultra' ? '. If it stutters, try High.' : '.');
    });
    host.append(b);
  }
  markQualityPreset();
}

function markQualityPreset() {
  const host = $('qPresets');
  if (!host) return;
  QUALITY_PRESETS.forEach((p, i) => {
    const on = Object.entries(p.set).every(([k, v]) => G.settings[k] === v);
    if (host.children[i]) host.children[i].classList.toggle('on', on);
  });
}

// Sections of the options menu; the last one opened is remembered.
const MENU_TAB_KEY = 'blocklands.menutab';
function showMenuTab(tab) {
  const secs = document.querySelectorAll('.opt-sec');
  if (![...secs].some((s) => s.dataset.tab === tab)) tab = 'game';
  secs.forEach((s) => s.classList.toggle('on', s.dataset.tab === tab));
  document.querySelectorAll('#optNav button').forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle('on', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
    if (on && b.offsetParent) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  });
  $('optMain').scrollTop = 0;
  storageSet(MENU_TAB_KEY, tab);
}

function setSetting(key, value) {
  G.settings[key] = value;
  saveSettings();
  if (key === 'volume') Sound.setVolume(value);
  if (!G.renderer) return;
  if (key === 'shadows' || key === 'clouds') {
    try { G.renderer.applySettings(); } catch (e) { showError('Could not apply graphics settings', e); }
  }
  if (key === 'renderScale' || key === 'dynamicRes') resize();
}

function refreshGameUI() {
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === G.mode));
  $('difficultySel').value = String(G.difficulty);
  $('keepInvCheck').checked = G.rules.keepInventory;
  $('mobsCheck').checked = G.rules.mobSpawning;
  $('seedVal').textContent = Net.server ? 'Server ' + Net.server.code : G.online ? 'Online world' : G.slot === 'campnou' ? 'Camp Nou' : 'Seed ' + (G.world ? G.world.seed : '');
  const wt = G.world ? G.world.type : 'default';
  const typeName = WORLD_PRESETS[wt] ? WORLD_PRESETS[wt].name : wt === 'flat' ? 'Flat' : 'Default';
  $('worldTypeVal').textContent = typeName + ' world · ' + (G.mode === 'creative' ? 'Creative' : 'Survival');
  $('optWorldText').textContent = (Net.server ? Net.server.name + ' · ' + Net.server.code : G.online ? 'Online world' : G.slot === 'campnou' ? 'Camp Nou' : typeName + ' world · seed ' + (G.world ? G.world.seed : '')) + ' · ' + (G.mode === 'creative' ? 'Creative' : 'Survival');
  $('optWorldDot').classList.toggle('online', !!G.online);
  $('navOnline').classList.toggle('on', !!G.online);
  buildPlaces($('placesGridMenu'));
  $('upgradeRow').classList.toggle('hidden', !G.world || G.world.genVer >= GEN_LATEST || G.online || !!G.slot || G.world.type !== 'default');
  Net.refreshUI();
}

// Regenerate an old world with the current generator: its edits, chests and your inventory are
// kept, the untouched terrain gains rivers and structures (it can shift a little near builds).
function upgradeWorld() {
  saveWorld();
  const save = loadSave();
  if (!save) return;
  save.gen = GEN_LATEST;
  newWorld(save.seed, save, {});
  prepareArea(G.player.pos[0], G.player.pos[2], 2);
  liftOutOfBlocks(G.player);
  saveWorld();
  refreshGameUI();
  UI.toast('Rivers, villages, castles, mines and ports added. Explore!');
}

// Cards for the themed places of the current world, with distance and direction.
function buildPlaces(el, after) {
  el.innerHTML = '';
  const g = G.world.gen;
  if (!g.regions.length) {
    const s = document.createElement('span');
    s.style.color = 'var(--muted)';
    s.textContent = g.preset ? 'This is a single-place world from an older version. Create a new world to explore all eight places.' : 'Flat worlds have no themed places.';
    el.append(s);
    return;
  }
  const p = G.player.pos;
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  for (const r of g.regions) {
    const dx = r.x - p[0], dz = r.z - p[2];
    const d = Math.hypot(dx, dz);
    const dir = dirs[((Math.round(Math.atan2(dx, -dz) / (Math.PI / 4)) % 8) + 8) % 8];
    const b = document.createElement('button');
    b.className = 'place';
    const i = document.createElement('span'); i.className = 'pi'; i.textContent = r.p.icon;
    const n = document.createElement('b'); n.textContent = r.p.name;
    const s = document.createElement('small'); s.textContent = d < REGION_IN ? 'You are here' : (d / 1000).toFixed(1) + ' km ' + dir;
    b.append(i, n, s);
    b.addEventListener('click', () => {
      Sound.init();
      if (travelTo(r.key)) { if (after) after(); requestLock(); }
    });
    el.append(b);
  }
  // the dimensions: a jump in creative, a hint about their portals in survival
  const here = dimOf(p[0], p[2]);
  const how = { 0: 'Walk back through a portal', 1: 'Obsidian frame + flint and steel', 2: 'Ring of 12 ender frames', 3: 'Reinforced deepslate frame + flint and steel' };
  for (let d = 0; d < DIM_INFO.length; d++) {
    if (d === here || (d === 0 && !here)) continue;
    const info = DIM_INFO[d];
    const b = document.createElement('button');
    b.className = 'place';
    const i = document.createElement('span'); i.className = 'pi'; i.textContent = info.icon;
    const n = document.createElement('b'); n.textContent = info.name;
    const s = document.createElement('small'); s.textContent = G.mode === 'creative' ? 'Dimension · jump there' : how[d];
    b.append(i, n, s);
    if (G.mode !== 'creative') b.disabled = true;
    b.addEventListener('click', () => {
      Sound.init();
      if (after) after();
      Portals.travel(0, d);
      requestLock();
    });
    el.append(b);
  }
}

function worldLabel() {
  if (G.slot === 'campnou') return 'Camp Nou · Barcelona · real scale';
  if (Net.server) return 'Server “' + Net.server.name + '” · code ' + Net.server.code + ' · ' + (Net.peers.size + 1) + ' player' + (Net.peers.size ? 's' : '');
  if (G.online) return 'Online world · ' + (Net.peers.size + 1) + ' player' + (Net.peers.size ? 's' : '');
  return (G.mode === 'creative' ? 'Creative' : 'Survival') + ' world · seed ' + G.world.seed;
}

// ---------- showcase world ----------
// The Camp Nou has its own button on the title screen and keeps its own save next to your world.
function enterCampNou() {
  if (Net.on) Net.leave();
  saveWorld();
  G.slot = 'campnou';
  const save = storageGet('blocklands.slot.campnou');
  // a save from an older build of the stadium would leave edits floating in the new one
  newWorld(1, save && save.v === 2 && save.cnv === CN.ver ? save : null, { type: 'campnou', mode: 'creative' });
  G.rules.mobSpawning = false;
  G.settings.weather = G.settings.weather === 'auto' ? 'clear' : G.settings.weather;
  prepareArea(G.player.pos[0], G.player.pos[2], 2);
  liftOutOfBlocks(G.player);
  saveWorld();
  refreshGameUI();
  UI.toast('Camp Nou · fly with F · N for day / night');
}
function leaveCampNou() {
  saveWorld();
  G.slot = null;
  const save = loadSave();
  newWorld(save ? save.seed : (Math.random() * 2147483647) | 0, save, { mode: 'survival', type: 'default' });
  prepareArea(G.player.pos[0], G.player.pos[2], 2);
  refreshGameUI();
}

// ---------- title screen ----------
function showTitle() {
  if (G.dead) return;
  G.onTitle = true;
  G.playing = false;
  if (G.unlocked) leaveUnlockedPlay();
  if (document.pointerLockElement) document.exitPointerLock();
  if (G.screenOpen) UI.closeScreen(true);
  saveWorld();
  $('menu').classList.add('hidden');
  $('hud').classList.add('hidden');
  $('placesPanel').classList.add('hidden');
  $('title').classList.remove('hidden');
  $('tPlayLabel').textContent = G.started ? 'Continue' : 'Play';
  $('tCampNouLabel').textContent = G.slot === 'campnou' ? 'Back to my world' : 'Camp Nou';
  $('tWorld').textContent = worldLabel();
  G.titleYaw = G.player.yaw;
}

function leaveTitle() {
  G.onTitle = false;
  $('title').classList.add('hidden');
  $('placesPanel').classList.add('hidden');
}

function showCredits() {
  const c = $('credits');
  c.classList.remove('hidden');
  const roll = $('creditsRoll');
  roll.style.animation = 'none';
  void roll.offsetWidth;
  roll.style.animation = '';
  sfx('chime', null, 1, 0.8);
}

// ---------- menu / pointer lock ----------
function formatClock(t) {
  const h = (t * 24 + 6) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function showMenu() {
  if (G.dead) return;
  if (G.screenOpen) UI.closeScreen(true);
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('playBtn').textContent = G.started ? 'Resume' : 'Play';
  $('timeSlider').value = G.dayTime;
  $('timeVal').textContent = formatClock(G.dayTime);
  $('cycleCheck').checked = G.settings.dayCycle;
  $('autoQualityCheck').checked = G.settings.autoQuality;
  if (!document.querySelector('.opt-sec.on')) showMenuTab(storageGet(MENU_TAB_KEY) || 'game');
  refreshGameUI();
}
function hideMenu() {
  $('menu').classList.add('hidden');
  if (!G.hudHidden) $('hud').classList.remove('hidden');
}

// Mouse capture can be refused (embedded browsers, some kiosk modes). The game then runs in
// "free cursor" mode: drag to look, hold still to mine, click to hit.
function enterUnlockedPlay() {
  if (G.dead || G.screenOpen || document.pointerLockElement) return;
  G.unlocked = true;
  G.playing = true;
  G.started = true;
  releaseAllInput();
  hideMenu();
  G.canvas.style.cursor = 'crosshair';
  UI.toast('Mouse capture unavailable: drag to look, hold to mine, Esc for menu');
}

function leaveUnlockedPlay() {
  G.unlocked = false;
  G.playing = false;
  G.canvas.style.cursor = '';
  releaseAllInput();
}

function requestLock() {
  Sound.init();
  if (G.onTitle) leaveTitle();
  if (G.stats.dead) return;
  if (G.unlocked) { G.playing = true; hideMenu(); return; }
  if (typeof G.canvas.requestPointerLock !== 'function') { enterUnlockedPlay(); return; }
  G.lockPending = true;
  const fail = (e) => {
    setTimeout(() => { G.lockPending = false; }, 250);
    if (document.pointerLockElement) return;
    // SecurityError = re-locking too soon after Esc; the user just needs to click again
    if (e && e.name === 'SecurityError') { showMenu(); UI.toast('Click Play again to capture the mouse'); }
    else enterUnlockedPlay();
  };
  try {
    const r = G.canvas.requestPointerLock();
    if (r && typeof r.then === 'function') r.then(() => { G.lockPending = false; }, fail);
    else G.lockPending = false;
  } catch (e) { fail(e); }
}

// ---------- input ----------
const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyT', 'KeyN', 'KeyM', 'F1', 'F3', 'F5', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyV', 'KeyG', 'Enter']);

// Keys that mean something else while flying. Returns true when handled.
function vehicleKey(code) {
  const v = G.vehicle;
  switch (code) {
    case 'ShiftLeft': case 'ShiftRight': Vehicles.dismount(false); return true;
    case 'KeyV':
      Vehicles.camMode = Vehicles.camMode === 'chase' ? 'cockpit' : 'chase';
      UI.toast(Vehicles.camMode === 'chase' ? 'Chase camera' : 'Cockpit camera');
      return true;
    case 'KeyG':
      if (v.onGround) { UI.toast('The gear stays down on the ground'); return true; }
      v.gearManual = !(v.gearManual !== undefined ? v.gearManual : v.gearDown);
      sfx('canopy', null, 0.6, 1.3);
      UI.toast(v.gearManual ? 'Gear down' : 'Gear up');
      return true;
    case 'Space': case 'KeyF': case 'KeyQ': case 'KeyR': return true;
    default: return false;
  }
}

// Skin chooser in the menu: face portraits from the painted atlas
function buildSkinPicker() {
  const grid = $('skinGrid');
  if (!grid || grid.childElementCount) return;
  SKINS.forEach((sk, i) => {
    if (sk.hidden) return;
    const b = document.createElement('button');
    b.className = 'skin';
    b.title = sk.name;
    b.append(skinPortrait(i, 44));
    const n = document.createElement('span');
    n.textContent = sk.icon + ' ' + sk.name;
    b.append(n);
    b.addEventListener('click', () => {
      G.settings.skin = i; saveSettings(); Net.sendT = 0;
      for (const o of grid.children) o.classList.toggle('on', o === b);
      sfx('click', null, 1, 1.2);
    });
    if (i === G.settings.skin) b.classList.add('on');
    grid.append(b);
  });
}

function onKeyDown(e) {
  if (G.dead) return;
  if (WorldMap.open) {
    const typingName = e.target && e.target.tagName === 'INPUT';
    if (e.code === 'Escape' || (e.code === 'KeyM' && !typingName)) { e.preventDefault(); WorldMap.close(); }
    return;
  }
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
  if (G.screenOpen) {
    if (e.code === 'Escape' || (e.code === 'KeyE' && !typing)) { e.preventDefault(); UI.closeScreen(false); return; }
    if (!typing && UI.key(e)) e.preventDefault();
    return;
  }
  if (typing) return;
  if (!G.playing || G.stats.dead) return;
  if (G.unlocked && e.code === 'Escape') {
    e.preventDefault();
    leaveUnlockedPlay();
    showMenu();
    saveWorld();
    return;
  }
  if (GAME_KEYS.has(e.code) || e.code.startsWith('Digit')) e.preventDefault();
  const first = !G.input.keys.has(e.code);
  G.input.keys.add(e.code);
  if (!first || e.repeat) return;
  const now = performance.now();
  const p = G.player;
  const creative = G.mode === 'creative';
  if (e.code === 'Enter' && Net.on) { Net.openChat(); return; }
  if (e.code === 'KeyM') { WorldMap.toggle(); return; }
  if (G.vehicle && vehicleKey(e.code)) return;
  switch (e.code) {
    case 'KeyW':
      if (now - G.lastW < 280) G.input.sprintHeld = true;
      G.lastW = now;
      break;
    case 'KeyR': G.input.sprintHeld = true; break;
    case 'Space':
      if (creative && now - G.lastSpace < 280 && !p.inWater) { p.flying = !p.flying; p.vel[1] = 0; UI.toast(p.flying ? 'Flying' : 'Walking'); }
      G.lastSpace = now;
      break;
    case 'KeyF': if (creative) { p.flying = !p.flying; p.vel[1] = 0; UI.toast(p.flying ? 'Flying' : 'Walking'); } break;
    case 'KeyE': UI.openInventory(); break;
    // in the Camp Nou, N switches straight between day and a lit-up night
    case 'KeyN':
      if (G.slot === 'campnou') { const night = G.dayTime > 0.5; G.dayTime = night ? 0.3 : 0.78; UI.toast(night ? 'Day' : 'Night: the lights come on'); }
      break;
    case 'KeyQ': Act.dropHeld(e.ctrlKey); break;
    case 'F3': G.debug = !G.debug; $('debug').classList.toggle('hidden', !G.debug); break;
    case 'F1': G.hudHidden = !G.hudHidden; $('hud').classList.toggle('hidden', G.hudHidden); break;
    case 'F5': G.view = ((G.view || 0) + 1) % 3; UI.toast(['First person', 'Third person', 'Front view'][G.view]); break;
    default:
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) UI.selectSlot(n - 1);
      }
  }
}

function onKeyUp(e) {
  G.input.keys.delete(e.code);
  if (e.code === 'KeyW') G.input.sprintHeld = false;
}

function releaseAllInput() {
  G.input.keys.clear();
  G.input.sprintHeld = false;
  G.mouse.left = G.mouse.right = false;
  G.drag.active = false; G.drag.mining = false;
}

function primaryDown(now) {
  G.mouse.left = true;
  if (G.vehicle) return;
  const t = Act.target;
  if (t && t.vehicle) { Vehicles.hit(t.vehicle); Act.swingHand(); return; }
  if (t && t.mob) { Act.attack(t.mob); Act.attackCd = 0.45; }
  else if (!t) { Act.swingHand(); sfx('swing', null, 0.5, 1); }
  G.mouse.nextBreak = Math.min(G.mouse.nextBreak, now);
}

function bindInput() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAllInput);
  document.addEventListener('mousemove', (e) => {
    if (!G.playing || G.screenOpen || G.stats.dead) return;
    if (G.unlocked && !G.drag.active) return;
    const mx = clamp(e.movementX || 0, -300, 300), my = clamp(e.movementY || 0, -300, 300);
    if (G.unlocked) {
      G.drag.moved += Math.abs(mx) + Math.abs(my);
      if (G.drag.mining) return;
    }
    const s = 0.0022 * G.settings.sensitivity * (G.unlocked ? 1.6 : 1);
    const p = G.player;
    p.yaw -= mx * s;
    p.pitch = clamp(p.pitch - my * s, -1.5605, 1.5605);
    if (p.yaw > Math.PI) p.yaw -= Math.PI * 2; else if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
  });
  document.addEventListener('mousedown', (e) => {
    if (!G.playing || G.screenOpen || G.stats.dead) return;
    if (G.unlocked && e.target !== G.canvas) return;
    e.preventDefault();
    Sound.init();
    const now = performance.now();
    if (G.unlocked && e.button === 0) { G.drag.active = true; G.drag.moved = 0; G.drag.t = now; G.drag.mining = false; return; }
    if (G.vehicle) { if (e.button === 0) G.mouse.left = true; else if (e.button === 2) G.mouse.right = true; return; }
    if (e.button === 0) primaryDown(now);
    else if (e.button === 2) { G.mouse.right = true; if (Act.useItem(true)) G.mouse.nextPlace = now + 260; }
    else if (e.button === 1) Act.pickBlock();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && G.drag.active) {
      G.drag.active = false;
      if (G.playing && !G.drag.mining && G.drag.moved < 6 && performance.now() - G.drag.t < 300) {
        primaryDown(performance.now());
        if (G.mode === 'creative' && Act.target && Act.target.block) {
          const [x, y, z] = Act.target.block.pos;
          destroyBlock(x, y, z, { drops: false });
        }
        setTimeout(() => { if (!G.drag.active) G.mouse.left = false; }, 60);
        return;
      }
      G.drag.mining = false;
    }
    if (e.button === 0) G.mouse.left = false;
    if (e.button === 2) G.mouse.right = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (!G.playing || G.screenOpen || !e.deltaY) return;
    if (G.vehicle) { G.vehicle.throttle = clamp(G.vehicle.throttle - Math.sign(e.deltaY) * 0.1, 0, 1); return; }
    UI.selectSlot(G.inv.selected + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  G.canvas.addEventListener('click', () => { if (!G.playing && G.started && !G.screenOpen && !G.stats.dead && $('menu').classList.contains('hidden')) requestLock(); });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === G.canvas;
    if (locked) { G.unlocked = false; G.canvas.style.cursor = ''; }
    else if (G.unlocked) return;
    G.playing = locked;
    releaseAllInput();
    if (locked) { G.started = true; hideMenu(); }
    else if (!G.screenOpen && !G.stats.dead && !G.onTitle && $('chatInput').classList.contains('hidden')) { showMenu(); saveWorld(); }
  });
  // Browsers without the promise form only report failures through this event.
  document.addEventListener('pointerlockerror', () => { if (!G.lockPending) enterUnlockedPlay(); });

  $('playBtn').addEventListener('click', () => requestLock());
  $('timeSlider').addEventListener('input', (e) => {
    G.dayTime = Number(e.target.value);
    $('timeVal').textContent = formatClock(G.dayTime);
  });
  $('cycleCheck').addEventListener('change', (e) => setSetting('dayCycle', e.target.checked));
  document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
    setGameMode(b.dataset.mode);
    refreshGameUI();
    UI.toast(G.mode === 'creative' ? 'Creative mode' : 'Survival mode');
  }));
  // typing a place name in the seed box offers to travel there in this same world
  const seedIn = $('seedInput');
  const placeTyped = () => (G.world.gen.regions.length ? presetFromText(seedIn.value) : null);
  seedIn.addEventListener('input', () => {
    const k = placeTyped();
    const chip = $('presetChip');
    if (k) { chip.textContent = 'Travel to ' + WORLD_PRESETS[k].icon + ' ' + WORLD_PRESETS[k].name + ' in this world'; chip.classList.add('on'); }
    else chip.classList.remove('on');
    disarm();
  });
  seedIn.addEventListener('keydown', (e) => {
    if (e.code !== 'Enter') return;
    e.preventDefault();
    if (placeTyped()) newBtn.click();
    else { newBtn.dataset.armed = '1'; newBtn.click(); }
  });
  $('difficultySel').addEventListener('change', (e) => { G.difficulty = Number(e.target.value); });
  $('keepInvCheck').addEventListener('change', (e) => { G.rules.keepInventory = e.target.checked; });
  $('mobsCheck').addEventListener('change', (e) => { G.rules.mobSpawning = e.target.checked; });
  // Two-step confirmation in the page itself (embedded viewers suppress window.confirm).
  let armTimer = 0;
  const newBtn = $('newWorldBtn');
  function disarm() { clearTimeout(armTimer); newBtn.dataset.armed = ''; newBtn.textContent = placeTyped() ? 'Travel' : 'New world'; }
  newBtn.addEventListener('click', () => {
    const place = placeTyped();
    if (place) {
      if (travelTo(place)) { seedIn.value = ''; disarm(); $('presetChip').classList.remove('on'); requestLock(); }
      return;
    }
    if (G.online) { UI.toast('Leave the online world to create a new one'); return; }
    if (!newBtn.dataset.armed) {
      newBtn.dataset.armed = '1';
      newBtn.textContent = 'Replace world?';
      armTimer = setTimeout(disarm, 4000);
      return;
    }
    disarm();
    const raw = $('seedInput').value.trim();
    let seed;
    if (!raw) seed = (Math.random() * 2147483647) | 0;
    else if (/^-?\d+$/.test(raw)) seed = Number(raw) | 0;
    else { seed = 0; for (let i = 0; i < raw.length; i++) seed = (Math.imul(seed, 31) + raw.charCodeAt(i)) | 0; }
    const type = $('worldTypeSel').value;
    newWorld(seed, null, { type, mode: G.mode });
    prepareArea(G.player.pos[0], G.player.pos[2], 2);
    liftOutOfBlocks(G.player);
    refreshGameUI();
    saveWorld();
    UI.toast('New world · seed ' + seed);
    requestLock();
  });

  // title screen
  $('tPlay').addEventListener('click', () => requestLock());
  $('tOptions').addEventListener('click', () => { sfx('click', null, 1, 1); $('title').classList.add('hidden'); showMenu(); });
  $('tOnline').addEventListener('click', () => { sfx('click', null, 1, 1); $('title').classList.add('hidden'); showMenu(); showMenuTab('online'); });
  $('tOptions').addEventListener('click', () => showMenuTab(storageGet(MENU_TAB_KEY) || 'game'));
  document.querySelectorAll('#optNav button').forEach((b) => b.addEventListener('click', () => { sfx('click', null, 1, 1.1); showMenuTab(b.dataset.tab); }));
  $('tPlaces').addEventListener('click', () => { sfx('click', null, 1, 1); buildPlaces($('placesGridTitle'), leaveTitle); $('placesPanel').classList.remove('hidden'); });
  $('placesBack').addEventListener('click', () => $('placesPanel').classList.add('hidden'));
  $('tJet').addEventListener('click', () => {
    Sound.init();
    const j = Vehicles.spawnAhead();
    if (j) Vehicles.board(j);
    requestLock();
  });
  $('tCredits').addEventListener('click', showCredits);
  $('autoQualityBtn').addEventListener('click', () => { sfx('click', null, 1, 1); AutoQuality.start(true); requestLock(); });
  $('autoQualityCheck').checked = G.settings.autoQuality;
  $('autoQualityCheck').addEventListener('change', (e) => AutoQuality.toggle(e.target.checked));
  if (G.settings.autoQuality && !G.settings.autoTuned) AutoQuality.start(false);
  // two-step confirmation (embedded viewers suppress window.confirm)
  let upTimer = 0;
  $('upgradeBtn').addEventListener('click', () => {
    const b = $('upgradeBtn');
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = 'Sure? Terrain near your builds may change';
      upTimer = setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Add them to this world'; }, 5000);
      return;
    }
    clearTimeout(upTimer);
    b.dataset.armed = ''; b.textContent = 'Add them to this world';
    upgradeWorld();
    requestLock();
  });
  $('tCampNou').addEventListener('click', () => {
    sfx('click', null, 1, 1);
    if (G.slot === 'campnou') { leaveCampNou(); showTitle(); return; }
    enterCampNou();
    requestLock();
  });
  const hideCredits = () => $('credits').classList.add('hidden');
  $('credits').addEventListener('click', hideCredits);
  $('creditsRoll').addEventListener('animationend', hideCredits);
  $('titleBtn').addEventListener('click', () => { sfx('click', null, 1, 1); showTitle(); });
  $('jetBtn').addEventListener('click', () => {
    const j = Vehicles.spawnAhead();
    if (!j) { UI.toast('No room for a jet in front of you'); return; }
    UI.toast('Fighter jet ready: right-click it to climb in');
    requestLock();
  });

  // online
  const colors = $('mpColors');
  NET_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.style.background = 'rgb(' + c.join(',') + ')';
    b.title = 'Colour ' + (i + 1);
    b.addEventListener('click', () => { Net.color = i; Net.saveProfile(); Net.refreshUI(); Net.sendT = 0; });
    colors.append(b);
  });
  $('mpName').addEventListener('change', (e) => { Net.name = safeName(e.target.value); Net.saveProfile(); Net.refreshUI(); Net.sendT = 0; });
  $('mpJoinBtn').addEventListener('click', () => {
    Sound.init();
    if (Net.on && !Net.server) Net.leave(); else Net.join();
    refreshGameUI();
    if (Net.on) requestLock();
  });
  $('srvCreate').addEventListener('click', () => {
    Sound.init();
    Net.createServer($('srvNameInput').value, $('srvModeSel').value);
    $('srvNameInput').value = '';
    refreshGameUI();
    UI.toast('Server created · code ' + Net.server.code + ' · use “Copy invite link” to invite friends');
  });
  const joinTyped = () => {
    Sound.init();
    if (!Net.joinCode($('srvCodeInput').value)) return;
    $('srvCodeInput').value = '';
    refreshGameUI();
    requestLock();
  };
  $('srvJoin').addEventListener('click', joinTyped);
  $('srvCodeInput').addEventListener('keydown', (e) => { if (e.code === 'Enter') joinTyped(); });
  $('srvInvite').addEventListener('click', () => Net.copyInvite());
  $('srvLeave').addEventListener('click', () => { Net.leave(); refreshGameUI(); });
  buildSkinPicker();
  const chat = $('chatInput');
  chat.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.code === 'Enter') { Net.say(chat.value); chat.classList.add('hidden'); chat.blur(); G.canvas.focus(); }
    else if (e.code === 'Escape') { chat.classList.add('hidden'); chat.blur(); }
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(); });
  window.addEventListener('pagehide', saveWorld);
  G.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('The graphics context was lost (GPU reset or driver update).', 'Reload the page to continue. Your world is saved.');
  });
}

// Automatic quality: while you play (the first time, or when asked from the menu) frame times
// are sampled for a few seconds and the graphics settings dropped to a level this device keeps
// smooth. Dynamic resolution having already shrunk the view also counts as slow.
const QUALITY_TIERS = [
  { name: 'Low', ms: 33, set: { shadows: 'off', clouds: false, ssr: false, godrays: false, renderDistance: 5, renderScale: 0.75 } },
  { name: 'Medium-low', ms: 24, set: { shadows: 'low', clouds: false, ssr: false, godrays: false, renderDistance: 6 } },
  { name: 'Medium', ms: 18.5, set: { shadows: 'low', clouds: true, ssr: true, godrays: false, renderDistance: 7 } },
];
// With "Automatic quality" on it also keeps watching: a long stretch of slow frames later on
// (a heavy area, another tab) measures again. Turning it off gives back the settings it replaced.
const AutoQuality = {
  state: null,
  slow: 0,
  start(manual) {
    this.state = { wait: manual ? 1.5 : 5, samples: [], manual };
    this.slow = 0;
    if (manual) $('autoQualityMsg').textContent = 'Play for a few seconds while it measures…';
  },
  toggle(on) {
    sfx('click', null, 1, 1);
    G.settings.autoQuality = on;
    let msg;
    if (on) {
      this.start(false);
      msg = 'Automatic quality on: it adjusts the graphics while you play';
    } else {
      this.state = null;
      const prev = G.settings.preAuto;
      G.settings.preAuto = null;
      G.settings.autoTuned = false;
      if (prev) {
        for (const [k, v] of Object.entries(prev)) setSetting(k, v);
        buildSettingsUI();
        msg = 'Automatic quality off: your previous graphics settings are back';
      } else msg = 'Automatic quality off: the graphics stay as you set them';
    }
    saveSettings();
    $('autoQualityMsg').textContent = msg;
  },
  // Frames slower than ~28 fps for 25 seconds of play trigger a new measurement.
  watch(dt) {
    if (!G.settings.autoQuality || this.state) return;
    const low = QUALITY_TIERS[0].set;
    if (Object.keys(low).every((k) => G.settings[k] === low[k])) return; // nothing lower to go to
    if (dt * 1000 > 36) this.slow += dt; else this.slow = Math.max(0, this.slow - dt * 0.25);
    if (this.slow > 25) this.start(false);
  },
  update(dt) {
    const s = this.state;
    if (!G.playing || G.screenOpen || G.onTitle) return;
    if (!s) { this.watch(dt); return; }
    if (s.wait > 0) { s.wait -= dt; return; }
    s.samples.push(dt * 1000);
    if (s.samples.length < 150) return;
    this.state = null;
    s.samples.sort((a, b) => a - b);
    const med = s.samples[s.samples.length >> 1];
    const shrunk = G.settings.dynamicRes && G.dynRes ? G.dynRes.scale : 1;
    let tier = null;
    for (const t of QUALITY_TIERS) if (med > t.ms || (t.ms >= 33 && shrunk <= 0.6) || (t.ms >= 24 && shrunk <= 0.8)) { tier = t; break; }
    G.settings.autoTuned = true;
    let msg;
    if (tier) {
      const prev = G.settings.preAuto || (G.settings.preAuto = {});
      for (const k of Object.keys(tier.set)) if (!(k in prev)) prev[k] = G.settings[k];
      for (const [k, v] of Object.entries(tier.set)) setSetting(k, v);
      if (G.dynRes) { G.dynRes.scale = 1; resize(); }
      msg = 'Graphics set to ' + tier.name + ' for this device (' + Math.round(1000 / med) + ' fps measured)';
    } else msg = 'This device runs the current settings smoothly (' + Math.round(1000 / med) + ' fps)';
    saveSettings();
    buildSettingsUI();
    $('autoQualityMsg').textContent = msg;
    UI.toast(msg, 4000);
  },
};

// Dynamic resolution: when frames run long for a while the 3D view renders a little smaller,
// and grows back once there is headroom again. The HUD stays sharp either way.
function adaptResolution(dt) {
  if (!G.settings.dynamicRes || !G.playing) return;
  const a = G.dynRes || (G.dynRes = { scale: 1, slow: 0, fast: 0, cool: 0 });
  a.cool -= dt;
  const ms = dt * 1000;
  if (ms > 21) a.slow += dt; else a.slow = Math.max(0, a.slow - dt * 0.5);
  if (ms < 13.5) a.fast += dt; else a.fast = 0;
  if (a.cool > 0) return;
  if (a.slow > 0.8 && a.scale > 0.5) { a.scale = Math.round((a.scale - 0.1) * 10) / 10; a.slow = 0; a.cool = 2; resize(); }
  else if (a.fast > 4 && a.scale < 1) { a.scale = Math.round((a.scale + 0.1) * 10) / 10; a.fast = 0; a.cool = 3; resize(); }
}

function resize() {
  if (!G.renderer) return;
  const gl = G.renderer.gl;
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 8192);
  const s = G.settings.renderScale * (G.dynRes && G.settings.dynamicRes ? G.dynRes.scale : 1) * (G.backdrop ? 0.7 : 1);
  const w = clamp(Math.round(window.innerWidth * s), 1, maxSize);
  const h = clamp(Math.round(window.innerHeight * s), 1, maxSize);
  G.renderer.resize(w, h);
}

async function preload(onProgress) {
  const R = Math.min(G.settings.renderDistance, 4);
  const w = G.world;
  const pcx = Math.floor(G.player.pos[0] / CS), pcz = Math.floor(G.player.pos[2] / CS);
  const gen = [], mesh = [];
  for (let dz = -R - 1; dz <= R + 1; dz++) for (let dx = -R - 1; dx <= R + 1; dx++) {
    gen.push([pcx + dx, pcz + dz]);
    if (Math.abs(dx) <= R && Math.abs(dz) <= R) mesh.push([pcx + dx, pcz + dz]);
  }
  const total = gen.length + mesh.length;
  let done = 0, t = performance.now();
  for (const [cx, cz] of gen) {
    if (!w.getChunk(cx, cz)) w.generateChunk(cx, cz);
    done++;
    if (performance.now() - t > 40) { onProgress(done / total); await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  for (const [cx, cz] of mesh) {
    const c = w.getChunk(cx, cz);
    if (c && c.needsMesh) meshChunk(c);
    done++;
    if (performance.now() - t > 40) { onProgress(done / total); await new Promise((r) => setTimeout(r, 0)); t = performance.now(); }
  }
  liftOutOfBlocks(G.player);
}

// ---------- main loop ----------
const NO_KEYS = { keys: new Set(), sprintHeld: false };

function frame(now) {
  if (G.dead) return;
  // Behind the title screen and the pause menu the world is only a backdrop: draw it at
  // ~30 fps and a lower resolution so integrated GPUs keep the menus smooth.
  const backdrop = !!G.onTitle || (!G.playing && !G.screenOpen && !G.stats.dead);
  if (backdrop && now - G.lastDraw < 30) { requestAnimationFrame(frame); return; }
  G.lastDraw = now;
  if (backdrop !== G.backdrop) { G.backdrop = backdrop; resize(); }
  try {
    const dt = Math.min(0.05, Math.max(0, (now - G.lastTime) / 1000));
    G.lastTime = now;
    G.frameCount++;
    G.time += dt;
    const p = G.player, st = G.stats;
    const paused = !G.playing && !G.screenOpen && !st.dead;
    const active = G.playing && !G.screenOpen && !st.dead && !G.sleeping;

    if (!paused) {
      const flying = !!G.vehicle;
      if (active) {
        const k = G.input.keys;
        const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
        const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
        if (turn) p.yaw = ((p.yaw + turn * 2.2 * dt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        if (tilt) p.pitch = clamp(p.pitch + tilt * 1.8 * dt, -1.5605, 1.5605);
        if (flying) {
          Vehicles.pilot(dt, G.input, { gun: G.mouse.left || k.has('KeyF'), missile: G.mouse.right || k.has('KeyR') });
        } else {
          // free-cursor mode: holding still turns into mining
          if (G.unlocked && G.drag.active && !G.drag.mining && G.drag.moved < 6 && now - G.drag.t > 260) { G.drag.mining = true; G.mouse.left = true; }
          G.input.noSprint = G.mode === 'survival' && st.food <= 6;
          G.input.slow = !!(Act.eat || Act.bow);
          p.update(dt, G.input);
        }
      } else if (flying) Vehicles.pilot(dt, NO_KEYS, {});
      else if (!st.dead) p.update(dt, NO_KEYS);
      Act.target = active && !G.vehicle ? Act.pick() : null;
      if (active && !G.vehicle) { Act.updateMining(dt, now); Act.updateUse(dt, now); }
      else { Act.mine.pos = null; Act.eat = null; Act.bow = null; }
      Act.updateHand(dt);
      Act.updateSounds(dt);
      st.update(dt, p);
      Ents.update(dt);
      Vehicles.update(dt);
      Villages.update(dt);
      Brewing.update(dt);
      tickFurnaces(dt);
      randomTicks(dt);
      updateSleep(dt);
      updateRegion(dt);
      const fast = active && G.input.keys.has('KeyT') && G.mode === 'creative' && !G.vehicle;
      if (G.settings.dayCycle || fast) G.dayTime = (G.dayTime + (dt / DAY_LENGTH) * (fast ? 60 : 1)) % 1;
      const own = G.regionOwn;
      if (own && own.p.ambient) own.p.ambient(dt, p.pos, own.x, own.z);
      // ambience underground
      G.caveSoundT -= dt;
      if (G.caveSoundT <= 0) { G.caveSoundT = rand(40, 100); if (G.eyeSky < 0.2) sfx('cave', null, 0.7, 1); }
    }
    Net.update(dt);

    updateChunks(G.playing ? 7 : 12);

    const hit = Act.target && Act.target.block;
    G.shake *= Math.exp(-dt * 3);
    let cam;
    if (G.onTitle) {
      // slow cinematic turn around the spawn point
      const eye = p.eyePos();
      G.titleYaw = (G.titleYaw || 0) + dt * 0.035;
      cam = { pos: [eye[0], eye[1] + 5, eye[2]], yaw: G.titleYaw, pitch: -0.1 + Math.sin(G.time * 0.05) * 0.04, roll: 0, fov: 70 };
    } else if (G.vehicle) {
      cam = Vehicles.camera(dt);
    } else {
      const eye = p.eyePos();
      let roll = st.hurtTilt * 0.13;
      if (st.dead) { eye[1] -= 1.1; roll = 0.5; }
      if (G.sleeping) eye[1] -= 1.0;
      cam = { pos: eye, yaw: p.yaw, pitch: p.pitch, roll, fov: G.settings.fov + p.fovBoost - (Act.bow ? Math.min(1, Act.bow.t) * 12 : 0) };
      if (G.view && !st.dead && !G.sleeping) {
        // third person: behind you (or facing you), pulled in when a wall is in the way
        const f = [-Math.sin(p.yaw) * Math.cos(p.pitch), Math.sin(p.pitch), -Math.cos(p.yaw) * Math.cos(p.pitch)];
        const s = G.view === 1 ? -1 : 1;
        let d = 4;
        for (let t = 0.4; t <= 4.2; t += 0.2) {
          if (BLOCK_OPAQUE[G.world.getBlock(Math.floor(eye[0] + f[0] * t * s), Math.floor(eye[1] + f[1] * t * s), Math.floor(eye[2] + f[2] * t * s))]) { d = Math.max(0.4, t - 0.4); break; }
        }
        cam.pos = [eye[0] + f[0] * d * s, eye[1] + f[1] * d * s, eye[2] + f[2] * d * s];
        if (G.view === 2) { cam.yaw = p.yaw + Math.PI; cam.pitch = -p.pitch; }
      }
    }
    if (G.shake > 0.01) for (let i = 0; i < 3; i++) cam.pos[i] += (Math.random() - 0.5) * G.shake * 0.25;
    G.eyeSky = sampleSkyExposure(G.world, cam.pos[0], cam.pos[1], cam.pos[2]);
    if (!paused) { Weather.update(dt, cam); Fluids.update(dt); Wildlife.update(dt, cam); Portals.update(dt); DimMobs.update(dt); }
    const dim = G.onTitle ? DIM_OVER : dimOf(cam.pos[0], cam.pos[2]);
    Sound.setListener(cam.pos, cam.yaw);
    const thirdPerson = G.view && !G.vehicle && !G.onTitle && !st.dead && !G.sleeping;
    const showHand = !G.hudHidden && !st.dead && !G.sleeping && !G.onTitle && !thirdPerson;
    let self = null;
    if (thirdPerson) {
      const sp = Math.hypot(p.vel[0], p.vel[2]);
      G.selfWalk = (G.selfWalk || 0) + sp * dt * 1.6;
      self = { type: 'avatar', pos: p.pos, h: 1.8, bodyYaw: p.yaw + Math.PI, headYaw: p.yaw + Math.PI, headPitch: -p.pitch, walkPhase: G.selfWalk,
        walkAmt: Math.min(1, sp / 4.3), hurtTime: st.hurtTime || 0, dead: false, fuse: 0, age: G.time, fire: 0, aiming: 0,
        skin: G.settings.skin, tint: NET_COLORS[Net.color].map((c) => c / 255 * 1.1) };
    }
    // colour of the water around the camera, for the underwater haze
    if (!G.onTitle && p.eyeInWater && (G.frameCount & 7) === 0) {
      const c = G.world.getChunk(Math.floor(cam.pos[0]) >> 4, Math.floor(cam.pos[2]) >> 4);
      if (c && c.waterTint) {
        const i = ((Math.floor(cam.pos[2]) & 15) * CS + (Math.floor(cam.pos[0]) & 15)) * 4;
        G.renderer.waterScatter = [c.waterTint[i] / 1000, c.waterTint[i + 1] / 1000, c.waterTint[i + 2] / 1000];
      }
    }
    G.renderer.nightVision = hasEffect('night_vision');
    const ents = ER.build(G.renderer, cam, { self,
      crack: G.vehicle ? null : Act.crackInfo(), hand: showHand ? Act.handState() : null,
      cockpit: G.vehicle && Vehicles.camMode === 'cockpit' ? G.vehicle : null,
    });
    G.renderer.render({
      cam, dayTime: dim ? DIM_INFO[dim].day : G.dayTime, time: G.time, dt, eyeSky: G.eyeSky, underwater: !G.vehicle && !G.onTitle && p.eyeInWater, dim,
      weather: Weather.overcast, flash: Weather.flash, rain: Weather.wetness, snow: Weather.snowCover, mist: Weather.mist, rainFx: Weather.rainFx,
      chunks: G.world.chunks.values(), selection: hit && !G.hudHidden ? hit.pos : null, selectionBox: hit ? hit.box : null, entities: ents,
    });
    Vehicles.drawHud();
    UI.update(dt);
    Minimap.update(dt);
    AutoQuality.update(dt);
    adaptResolution(dt);

    // stats
    G.fpsAcc += dt; G.fpsFrames++;
    if (G.fpsAcc >= 0.5) { G.fps = G.fpsFrames / G.fpsAcc; G.frameMs = (G.fpsAcc / G.fpsFrames) * 1000; G.fpsAcc = 0; G.fpsFrames = 0; }
    if (G.debug && now - G.lastDebug > 200) { G.lastDebug = now; updateDebug(); }
    if (now - G.lastSave > 15000 && (G.world.editsDirty || G.playing)) { G.lastSave = now; saveWorld(); }
  } catch (e) {
    showError('The game loop stopped because of an error', e);
    return;
  }
  requestAnimationFrame(frame);
}

function updateDebug() {
  const p = G.player, r = G.renderer;
  const x = Math.floor(p.pos[0]), z = Math.floor(p.pos[2]);
  const gen = G.world.gen;
  const h = gen.height(x, z);
  const cl = gen.climate(x, z);
  const biome = Object.keys(BIOME).find((k) => BIOME[k] === gen.biome(h, cl.temp, cl.hum)) || '?';
  const dirs = ['north', 'west', 'south', 'east'];
  const facing = dirs[((Math.round(p.yaw / (Math.PI / 2)) % 4) + 4) % 4];
  const L = G.world.getLight(x, Math.floor(p.pos[1] + 0.5), z);
  $('debug').textContent = [
    'Blocklands  ' + G.fps.toFixed(0) + ' fps (' + G.frameMs.toFixed(1) + ' ms)',
    'XYZ ' + p.pos.map((v) => v.toFixed(2)).join(' / ') + '   chunk ' + (x >> 4) + ', ' + (z >> 4),
    'Facing ' + facing + '   biome ' + biome.toLowerCase() + '   ' + (p.flying ? 'flying' : p.onGround ? 'grounded' : 'airborne') + (p.inWater ? ' (water)' : ''),
    'Light sky ' + (L >> 4) + ' block ' + (L & 15) + '   mode ' + G.mode + '   difficulty ' + G.difficulty,
    'Chunks ' + G.world.chunks.size + ' loaded, ' + r.stats.drawn + ' drawn, ' + r.stats.shadowDrawn + ' in shadow map',
    'Entities ' + Ents.mobs.length + ' mobs, ' + Ents.items.length + ' items, ' + Particles.list.length + ' particles, ' + r.stats.entities + ' quads',
    'Triangles ' + (r.stats.triangles / 1e6).toFixed(2) + 'M   render ' + r.width + 'x' + r.height,
    'Time ' + formatClock(G.dayTime) + '   exposure ' + r.exposure.toFixed(2) + '   HDR ' + (r.hdrFormat.float ? 'RGBA16F' : 'RGBA8 (fallback)'),
    'Seed ' + G.world.seed + ' (' + G.world.type + ')' + (G.region ? '   place ' + G.region : ''),
    'Workers ' + (ChunkWorkers.ok ? ChunkWorkers.list.length + ' (' + ChunkWorkers.stats.gen + ' gen, ' + ChunkWorkers.stats.mesh + ' mesh)' : 'off, main thread') +
      '   scale ' + Math.round(G.settings.renderScale * (G.dynRes ? G.dynRes.scale : 1) * 100) + '%' + (Net.on ? '   online ' + (Net.peers.size + 1) : ''),
  ].join('\n');
}

// ---------- boot ----------
async function boot() {
  const setLoad = (f, text) => {
    $('loadBar').style.width = Math.round(f * 100) + '%';
    if (text) $('loadStatus').textContent = text;
  };
  try {
    loadSettings();
    Sound.volume = G.settings.volume;
    setLoad(0.03, 'Painting textures and compiling shaders');
    await new Promise((r) => setTimeout(r, 30));
    G.renderer = new Renderer(G.canvas, G.settings);
    G.renderer.setAtlas(paintSkins());
    resize();
    G.ui = UI;
    UI.init();
    const workers = ChunkWorkers.init();
    Net.init();
    const save = loadSave();
    newWorld(save ? save.seed : (Math.random() * 2147483647) | 0, save, { mode: 'survival', type: 'default' });
    // an invite link (#s=CODE) opens that server straight away
    const invite = Net.codeFromLink();
    if (invite) Net.joinCode(invite);
    setLoad(0.1, 'Generating terrain');
    await preload((f) => setLoad(0.1 + f * 0.85, 'Generating terrain · ' + Math.round(f * 100) + '%'));
    setLoad(0.97, 'Starting background workers');
    await Promise.race([workers, new Promise((r) => setTimeout(r, 2500))]);
    buildSettingsUI();
    bindInput();
    window.addEventListener('hashchange', () => {
      const c = Net.codeFromLink();
      if (c && (!Net.server || Net.server.code !== c)) { Net.joinCode(c); refreshGameUI(); if (G.onTitle) $('tWorld').textContent = worldLabel(); }
    });
    UI.invDirty();
    UI.updateHud(true);
    $('loading').classList.add('hidden');
    refreshGameUI();
    showTitle();
    G.lastTime = performance.now();
    requestAnimationFrame(frame);
  } catch (e) {
    showError('Blocklands could not start', e);
  }
}

boot();
