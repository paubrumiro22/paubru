'use strict';
// Boot, game loop, chunk streaming, input, UI and persistence.

const SAVE_KEY = 'blocklands.world.v1';
const SETTINGS_KEY = 'blocklands.settings.v1';
const DAY_LENGTH = 1200; // seconds per full day

const DEFAULT_SETTINGS = {
  renderDistance: 8, shadows: 'medium', ssr: true, clouds: true, godrays: true, bloom: true, fxaa: true,
  renderScale: 1, fov: 75, sensitivity: 1, brightness: 1, dayCycle: true,
};

const SETTINGS_UI = [
  { key: 'renderDistance', label: 'Render distance', type: 'range', min: 3, max: 16, step: 1, fmt: (v) => v + ' chunks' },
  { key: 'shadows', label: 'Shadows', type: 'select', options: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.5, max: 2, step: 0.25, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'fov', label: 'Field of view', type: 'range', min: 50, max: 110, step: 1, fmt: (v) => v + '°' },
  { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'brightness', label: 'Brightness', type: 'range', min: 0.6, max: 1.8, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'ssr', label: 'Screen-space reflections', type: 'check' },
  { key: 'clouds', label: 'Volumetric clouds', type: 'check' },
  { key: 'godrays', label: 'God rays', type: 'check' },
  { key: 'bloom', label: 'Bloom', type: 'check' },
  { key: 'fxaa', label: 'Anti-aliasing (FXAA)', type: 'check' },
];

const $ = (id) => document.getElementById(id);

function storageGet(key) {
  try { const s = localStorage.getItem(key); return s ? JSON.parse(s) : null; } catch (e) { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
}

const G = {
  canvas: $('game'),
  settings: Object.assign({}, DEFAULT_SETTINGS),
  renderer: null, world: null, player: null,
  input: { keys: new Set(), sprintHeld: false },
  mouse: { left: false, right: false, nextBreak: 0, nextPlace: 0 },
  playing: false, started: false, inventoryOpen: false, hudHidden: false, debug: false, dead: false,
  dayTime: 0.08, time: 0, hotbar: DEFAULT_HOTBAR.slice(), slot: 0,
  lastW: 0, lastSpace: 0, offsets: null, offsetsR: -1, lastSave: 0,
  fps: 0, frameMs: 0, fpsAcc: 0, fpsFrames: 0, lastDebug: 0,
  selection: null, eyeSky: 1, icons: new Map(), lastTime: 0,
  unlocked: false, lockPending: false, drag: { active: false, moved: 0, t: 0 },
};

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
}
function saveSettings() { storageSet(SETTINGS_KEY, G.settings); }

function buildSettingsUI() {
  const grid = $('settingsGrid');
  grid.innerHTML = '';
  for (const def of SETTINGS_UI) {
    const field = document.createElement('div');
    field.className = 'field';
    const val = G.settings[def.key];
    if (def.type === 'check') {
      const lab = document.createElement('label');
      lab.className = 'check';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!val;
      cb.addEventListener('change', () => setSetting(def.key, cb.checked));
      lab.append(cb, document.createTextNode(def.label));
      field.append(lab);
    } else if (def.type === 'select') {
      const lab = document.createElement('label');
      lab.textContent = def.label;
      const sel = document.createElement('select');
      for (const [v, t] of def.options) {
        const o = document.createElement('option');
        o.value = v; o.textContent = t;
        sel.append(o);
      }
      sel.value = val;
      sel.addEventListener('change', () => setSetting(def.key, sel.value));
      field.append(lab, sel);
    } else {
      const lab = document.createElement('label');
      const b = document.createElement('b');
      b.textContent = def.fmt(val);
      lab.append(document.createTextNode(def.label), b);
      const r = document.createElement('input');
      r.type = 'range'; r.min = def.min; r.max = def.max; r.step = def.step; r.value = val;
      r.addEventListener('input', () => {
        const v = Number(r.value);
        b.textContent = def.fmt(v);
        setSetting(def.key, v);
      });
      field.append(lab, r);
    }
    grid.append(field);
  }
}

function setSetting(key, value) {
  G.settings[key] = value;
  saveSettings();
  if (!G.renderer) return;
  if (key === 'shadows' || key === 'clouds') {
    try { G.renderer.applySettings(); } catch (e) { showError('Could not apply graphics settings', e); }
  }
  if (key === 'renderScale') resize();
}

// ---------- UI ----------
function blockIcon(id) {
  if (!G.icons.has(id)) G.icons.set(id, makeBlockIcon(G.renderer.textureTiles, id, 48));
  const src = G.icons.get(id);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 48;
  cv.getContext('2d').drawImage(src, 0, 0);
  return cv;
}

function buildHotbar() {
  const hb = $('hotbar');
  hb.innerHTML = '';
  G.hotbar.forEach((id, i) => {
    const s = document.createElement('div');
    s.className = 'slot' + (i === G.slot ? ' sel' : '');
    const n = document.createElement('span');
    n.className = 'num';
    n.textContent = String(i + 1);
    s.append(n);
    if (id) s.append(blockIcon(id));
    hb.append(s);
  });
}

let nameTimer = 0;
function showBlockName() {
  const el = $('blockname');
  const id = G.hotbar[G.slot];
  el.textContent = id ? BLOCK_NAME[id] : '';
  el.classList.add('show');
  clearTimeout(nameTimer);
  nameTimer = setTimeout(() => el.classList.remove('show'), 1400);
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function selectSlot(i) {
  G.slot = ((i % 9) + 9) % 9;
  const slots = $('hotbar').children;
  for (let k = 0; k < slots.length; k++) slots[k].classList.toggle('sel', k === G.slot);
  showBlockName();
}

function buildInventory() {
  const grid = $('invGrid');
  grid.innerHTML = '';
  for (const id of PALETTE) {
    const s = document.createElement('div');
    s.className = 'slot';
    s.title = BLOCK_NAME[id];
    s.append(blockIcon(id));
    s.addEventListener('click', () => {
      G.hotbar[G.slot] = id;
      buildHotbar();
      showBlockName();
      closeInventory(true);
    });
    grid.append(s);
  }
}

function openInventory() {
  G.inventoryOpen = true;
  $('inventory').classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function closeInventory(relock) {
  G.inventoryOpen = false;
  $('inventory').classList.add('hidden');
  if (relock) requestLock(); else showMenu();
}

function formatClock(t) {
  const h = (t * 24 + 6) % 24;
  const hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

function showMenu() {
  if (G.dead) return;
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('playBtn').textContent = G.started ? 'Resume' : 'Play';
  $('timeSlider').value = G.dayTime;
  $('timeVal').textContent = formatClock(G.dayTime);
  $('cycleCheck').checked = G.settings.dayCycle;
  $('seedVal').textContent = String(G.world ? G.world.seed : '');
}
function hideMenu() {
  $('menu').classList.add('hidden');
  if (!G.hudHidden) $('hud').classList.remove('hidden');
}

// Mouse capture can be refused (embedded browsers, some kiosk modes). The game then runs in
// "free cursor" mode: drag with the left button to look, click to break.
function enterUnlockedPlay() {
  if (G.dead || G.inventoryOpen || document.pointerLockElement) return;
  G.unlocked = true;
  G.playing = true;
  G.started = true;
  releaseAllInput();
  hideMenu();
  G.canvas.style.cursor = 'crosshair';
  toast('Mouse capture unavailable: drag to look, click to break, Esc for menu');
}

function leaveUnlockedPlay() {
  G.unlocked = false;
  G.playing = false;
  G.canvas.style.cursor = '';
  releaseAllInput();
}

function requestLock() {
  if (typeof G.canvas.requestPointerLock !== 'function') { enterUnlockedPlay(); return; }
  G.lockPending = true;
  const fail = (e) => {
    setTimeout(() => { G.lockPending = false; }, 250);
    if (document.pointerLockElement) return;
    // SecurityError = re-locking too soon after Esc; the user just needs to click again
    if (e && e.name === 'SecurityError') { showMenu(); toast('Click Play again to capture the mouse'); }
    else enterUnlockedPlay();
  };
  try {
    const r = G.canvas.requestPointerLock();
    if (r && typeof r.then === 'function') r.then(() => { G.lockPending = false; }, fail);
    else G.lockPending = false;
  } catch (e) { fail(e); }
}

// ---------- world / chunks ----------
function buildOffsets(R) {
  const out = [];
  // meshed chunks reach R + 0.5; their diagonal neighbours must exist too (R + 0.5 + sqrt 2)
  const lim = R + 3;
  for (let dz = -lim; dz <= lim; dz++) for (let dx = -lim; dx <= lim; dx++) {
    const d = Math.hypot(dx, dz);
    if (d <= R + 2) out.push([dx, dz, d]);
  }
  out.sort((a, b) => a[2] - b[2]);
  G.offsets = out;
  G.offsetsR = R;
}

function neighborsLoaded(cx, cz) {
  const w = G.world;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (!w.getChunk(cx + dx, cz + dz)) return false;
  return true;
}

function meshChunk(c) {
  const res = buildChunkMesh(G.world, c);
  G.renderer.uploadChunk(c, res);
  c.needsMesh = false;
}

function updateChunks(budgetMs) {
  const t0 = performance.now();
  const R = G.settings.renderDistance;
  if (G.offsetsR !== R) buildOffsets(R);
  const w = G.world;
  const pcx = Math.floor(G.player.pos[0] / CS), pcz = Math.floor(G.player.pos[2] / CS);
  let work = 0;
  for (const [dx, dz] of G.offsets) {
    if (work > 0 && performance.now() - t0 > budgetMs * 0.45) break;
    const cx = pcx + dx, cz = pcz + dz;
    if (!w.getChunk(cx, cz)) { w.generateChunk(cx, cz); work++; }
  }
  for (const [dx, dz, d] of G.offsets) {
    if (d > R + 0.5) break;
    if (work > 0 && performance.now() - t0 > budgetMs) break;
    const c = w.getChunk(pcx + dx, pcz + dz);
    if (!c || !c.needsMesh || !neighborsLoaded(c.cx, c.cz)) continue;
    meshChunk(c);
    work++;
  }
  // unload far chunks now and then
  if ((G.frameCount & 63) === 0) {
    const lim = R + 4;
    for (const [key, c] of w.chunks) {
      if (Math.abs(c.cx - pcx) > lim || Math.abs(c.cz - pcz) > lim) {
        G.renderer.freeChunk(c);
        w.chunks.delete(key);
      }
    }
  }
}

function editBlock(x, y, z, id) {
  const list = G.world.setBlock(x, y, z, id);
  if (!list) return false;
  const c = list[0];
  const lx = x & 15, lz = z & 15;
  if (neighborsLoaded(c.cx, c.cz)) meshChunk(c); else c.needsMesh = true;
  for (let i = 1; i < list.length; i++) {
    const n = list[i];
    const dx = n.cx - c.cx, dz = n.cz - c.cz;
    const touchX = dx === 0 || (dx === -1 && lx === 0) || (dx === 1 && lx === 15);
    const touchZ = dz === 0 || (dz === -1 && lz === 0) || (dz === 1 && lz === 15);
    if (touchX && touchZ && neighborsLoaded(n.cx, n.cz)) meshChunk(n); else n.needsMesh = true;
  }
  return true;
}

function breakBlock() {
  const hit = G.player.raycast(6);
  if (!hit) return;
  const [x, y, z] = hit.pos;
  if (hit.id === B.BEDROCK && y === 0) return;
  // water flows back into the hole if it touches water on a side or above
  const w = G.world;
  let fill = B.AIR;
  if (y <= SEA && [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]].some(([dx, dy, dz]) => w.getBlock(x + dx, y + dy, z + dz) === B.WATER)) fill = B.WATER;
  editBlock(x, y, z, fill);
  const above = w.getBlock(x, y + 1, z);
  if (BLOCK_RT[above] === RT_CROSS) editBlock(x, y + 1, z, B.AIR);
}

function placeBlock() {
  const id = G.hotbar[G.slot];
  if (!id) return;
  const hit = G.player.raycast(6);
  if (!hit) return;
  let [x, y, z] = hit.pos;
  if (BLOCK_RT[hit.id] !== RT_CROSS) { x += hit.normal[0]; y += hit.normal[1]; z += hit.normal[2]; }
  if (y < 0 || y >= CH) return;
  const w = G.world;
  const cur = w.getBlock(x, y, z);
  if (!(cur === B.AIR || cur === B.WATER || BLOCK_RT[cur] === RT_CROSS)) return;
  if (BLOCK_SOLID[id] && G.player.intersectsBlock(x, y, z)) return;
  if (BLOCK_RT[id] === RT_CROSS) {
    const below = w.getBlock(x, y - 1, z);
    if (!BLOCK_OPAQUE[below] || cur === B.WATER) return;
  }
  editBlock(x, y, z, id);
}

function pickBlock() {
  const hit = G.player.raycast(6);
  if (!hit || !isValidBlock(hit.id)) return;
  const existing = G.hotbar.indexOf(hit.id);
  if (existing >= 0) { selectSlot(existing); return; }
  G.hotbar[G.slot] = hit.id;
  buildHotbar();
  showBlockName();
}

// ---------- persistence ----------
function saveWorld() {
  if (!G.world || !G.player) return;
  const p = G.player;
  storageSet(SAVE_KEY, {
    v: 1, seed: G.world.seed, edits: G.world.serializeEdits(), dayTime: G.dayTime,
    hotbar: G.hotbar, slot: G.slot,
    player: { pos: p.pos, yaw: p.yaw, pitch: p.pitch, flying: p.flying },
  });
  G.world.editsDirty = false;
}

function findSpawn(gen) {
  for (let r = 0; r < 60; r++) {
    const n = Math.max(1, r * 6);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.round(Math.cos(a) * r * 12), z = Math.round(Math.sin(a) * r * 12);
      const h = gen.height(x, z);
      if (h > SEA + 2 && h < SEA + 30) return [x + 0.5, h + 1, z + 0.5];
    }
  }
  return [0.5, gen.height(0, 0) + 2, 0.5];
}

function liftOutOfBlocks(p) {
  for (let i = 0; i < CH && p.collides(p.pos[0], p.pos[1], p.pos[2]); i++) p.pos[1] += 1;
}

// ---------- input ----------
const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyR', 'KeyT', 'F1', 'F3', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function onKeyDown(e) {
  if (G.dead) return;
  if (G.inventoryOpen) {
    if (e.code === 'KeyE') { e.preventDefault(); closeInventory(true); }
    else if (e.code === 'Escape') { e.preventDefault(); closeInventory(false); }
    return;
  }
  if (!G.playing) return;
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
  switch (e.code) {
    case 'KeyW':
      if (now - G.lastW < 280) G.input.sprintHeld = true;
      G.lastW = now;
      break;
    case 'KeyR': G.input.sprintHeld = true; break;
    case 'Space':
      if (now - G.lastSpace < 280 && !p.inWater) { p.flying = !p.flying; p.vel[1] = 0; toast(p.flying ? 'Flying' : 'Walking'); }
      G.lastSpace = now;
      break;
    case 'KeyF': p.flying = !p.flying; p.vel[1] = 0; toast(p.flying ? 'Flying' : 'Walking'); break;
    case 'KeyE': openInventory(); break;
    case 'F3': G.debug = !G.debug; $('debug').classList.toggle('hidden', !G.debug); break;
    case 'F1': G.hudHidden = !G.hudHidden; $('hud').classList.toggle('hidden', G.hudHidden); break;
    default:
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) selectSlot(n - 1);
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
}

function bindInput() {
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', releaseAllInput);
  document.addEventListener('mousemove', (e) => {
    if (!G.playing) return;
    if (G.unlocked && !G.drag.active) return;
    const mx = clamp(e.movementX || 0, -300, 300), my = clamp(e.movementY || 0, -300, 300);
    if (G.unlocked) G.drag.moved += Math.abs(mx) + Math.abs(my);
    const s = 0.0022 * G.settings.sensitivity * (G.unlocked ? 1.6 : 1);
    const p = G.player;
    p.yaw -= mx * s;
    p.pitch = clamp(p.pitch - my * s, -1.5605, 1.5605);
    if (p.yaw > Math.PI) p.yaw -= Math.PI * 2; else if (p.yaw < -Math.PI) p.yaw += Math.PI * 2;
  });
  document.addEventListener('mousedown', (e) => {
    if (!G.playing) return;
    if (G.unlocked && e.target !== G.canvas) return;
    e.preventDefault();
    const now = performance.now();
    if (G.unlocked && e.button === 0) { G.drag.active = true; G.drag.moved = 0; G.drag.t = now; return; }
    if (e.button === 0) { G.mouse.left = true; breakBlock(); G.mouse.nextBreak = now + 260; }
    else if (e.button === 2) { G.mouse.right = true; placeBlock(); G.mouse.nextPlace = now + 260; }
    else if (e.button === 1) pickBlock();
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0 && G.drag.active) {
      G.drag.active = false;
      if (G.playing && G.drag.moved < 6 && performance.now() - G.drag.t < 400) breakBlock();
    }
    if (e.button === 0) G.mouse.left = false;
    if (e.button === 2) G.mouse.right = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('wheel', (e) => {
    if (!G.playing || !e.deltaY) return;
    selectSlot(G.slot + (e.deltaY > 0 ? 1 : -1));
  }, { passive: true });
  G.canvas.addEventListener('click', () => { if (!G.playing && G.started && !G.inventoryOpen && $('menu').classList.contains('hidden')) requestLock(); });

  document.addEventListener('pointerlockchange', () => {
    const locked = document.pointerLockElement === G.canvas;
    if (locked) { G.unlocked = false; G.canvas.style.cursor = ''; }
    else if (G.unlocked) return;
    G.playing = locked;
    releaseAllInput();
    if (locked) { G.started = true; hideMenu(); }
    else if (!G.inventoryOpen) { showMenu(); saveWorld(); }
  });
  // Browsers without the promise form only report failures through this event.
  document.addEventListener('pointerlockerror', () => { if (!G.lockPending) enterUnlockedPlay(); });

  $('playBtn').addEventListener('click', () => requestLock());
  $('timeSlider').addEventListener('input', (e) => {
    G.dayTime = Number(e.target.value);
    $('timeVal').textContent = formatClock(G.dayTime);
  });
  $('cycleCheck').addEventListener('change', (e) => setSetting('dayCycle', e.target.checked));
  // Two-step confirmation in the page itself (embedded viewers suppress window.confirm).
  let armTimer = 0;
  const newBtn = $('newWorldBtn');
  const disarm = () => { clearTimeout(armTimer); newBtn.dataset.armed = ''; newBtn.textContent = 'New world'; };
  newBtn.addEventListener('click', () => {
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
    newWorld(seed, null);
    $('seedVal').textContent = String(seed);
    saveWorld();
    toast('New world created · seed ' + seed);
  });

  window.addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveWorld(); });
  window.addEventListener('pagehide', saveWorld);
  G.canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    showError('The graphics context was lost (GPU reset or driver update).', 'Reload the page to continue. Your world is saved.');
  });
}

function resize() {
  if (!G.renderer) return;
  const gl = G.renderer.gl;
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 4096, 8192);
  const s = G.settings.renderScale;
  const w = clamp(Math.round(window.innerWidth * s), 1, maxSize);
  const h = clamp(Math.round(window.innerHeight * s), 1, maxSize);
  G.renderer.resize(w, h);
}

// ---------- world lifecycle ----------
function newWorld(seed, save) {
  if (G.world) for (const c of G.world.chunks.values()) G.renderer.freeChunk(c);
  G.world = new World(seed);
  G.player = new Player(G.world);
  if (save) {
    G.world.loadEdits(save.edits);
    const sp = save.player;
    if (sp && Array.isArray(sp.pos) && sp.pos.length === 3 && sp.pos.every(Number.isFinite)) {
      G.player.pos = sp.pos.slice();
      G.player.yaw = Number.isFinite(sp.yaw) ? sp.yaw : 0;
      G.player.pitch = Number.isFinite(sp.pitch) ? clamp(sp.pitch, -1.56, 1.56) : 0;
      G.player.flying = !!sp.flying;
    } else G.player.pos = findSpawn(G.world.gen);
    if (Number.isFinite(save.dayTime)) G.dayTime = ((save.dayTime % 1) + 1) % 1;
    if (Array.isArray(save.hotbar) && save.hotbar.length === 9) G.hotbar = save.hotbar.map((id) => (isValidBlock(id) ? id : 0));
    if (Number.isInteger(save.slot)) G.slot = clamp(save.slot, 0, 8);
  } else {
    G.player.pos = findSpawn(G.world.gen);
    G.player.yaw = -0.6;
    G.player.pitch = -0.05;
    G.dayTime = 0.08;
  }
  G.offsetsR = -1;
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
function frame(now) {
  if (G.dead) return;
  try {
    const dt = Math.min(0.05, Math.max(0, (now - G.lastTime) / 1000));
    G.lastTime = now;
    G.frameCount = (G.frameCount || 0) + 1;
    G.time += dt;
    const p = G.player;

    if (G.playing) {
      const k = G.input.keys;
      const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
      const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
      if (turn) p.yaw = ((p.yaw + turn * 2.2 * dt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      if (tilt) p.pitch = clamp(p.pitch + tilt * 1.8 * dt, -1.5605, 1.5605);
      p.update(dt, G.input);
      if (G.mouse.left && now >= G.mouse.nextBreak) { breakBlock(); G.mouse.nextBreak = now + 220; }
      if (G.mouse.right && now >= G.mouse.nextPlace) { placeBlock(); G.mouse.nextPlace = now + 220; }
    }
    const fast = G.playing && G.input.keys.has('KeyT');
    if (G.settings.dayCycle || fast) G.dayTime = (G.dayTime + (dt / DAY_LENGTH) * (fast ? 60 : 1)) % 1;

    updateChunks(G.playing ? 7 : 12);

    const hit = G.playing ? p.raycast(6) : null;
    const eye = p.eyePos();
    G.eyeSky = sampleSkyExposure(G.world, eye[0], eye[1], eye[2]);
    G.renderer.render({
      cam: { pos: eye, yaw: p.yaw, pitch: p.pitch, fov: G.settings.fov + p.fovBoost },
      dayTime: G.dayTime, time: G.time, dt, eyeSky: G.eyeSky, underwater: p.eyeInWater,
      chunks: G.world.chunks.values(), selection: hit ? hit.pos : null,
    });

    // stats
    G.fpsAcc += dt; G.fpsFrames++;
    if (G.fpsAcc >= 0.5) { G.fps = G.fpsFrames / G.fpsAcc; G.frameMs = (G.fpsAcc / G.fpsFrames) * 1000; G.fpsAcc = 0; G.fpsFrames = 0; }
    if (G.debug && now - G.lastDebug > 200) { G.lastDebug = now; updateDebug(); }
    if (G.world.editsDirty && now - G.lastSave > 10000) { G.lastSave = now; saveWorld(); }
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
  $('debug').textContent = [
    'Blocklands  ' + G.fps.toFixed(0) + ' fps (' + G.frameMs.toFixed(1) + ' ms)',
    'XYZ ' + p.pos.map((v) => v.toFixed(2)).join(' / ') + '   chunk ' + (x >> 4) + ', ' + (z >> 4),
    'Facing ' + facing + '   biome ' + biome.toLowerCase() + '   ' + (p.flying ? 'flying' : p.onGround ? 'grounded' : 'airborne') + (p.inWater ? ' (water)' : ''),
    'Chunks ' + G.world.chunks.size + ' loaded, ' + r.stats.drawn + ' drawn, ' + r.stats.shadowDrawn + ' in shadow map',
    'Triangles ' + (r.stats.triangles / 1e6).toFixed(2) + 'M   render ' + r.width + 'x' + r.height,
    'Time ' + formatClock(G.dayTime) + '   exposure ' + r.exposure.toFixed(2) + '   HDR ' + (r.hdrFormat.float ? 'RGBA16F' : 'RGBA8 (fallback)'),
    'Seed ' + G.world.seed,
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
    setLoad(0.03, 'Painting textures and compiling shaders');
    await new Promise((r) => setTimeout(r, 30));
    G.renderer = new Renderer(G.canvas, G.settings);
    resize();
    const save = storageGet(SAVE_KEY);
    const validSave = save && save.v === 1 && Number.isInteger(save.seed);
    newWorld(validSave ? save.seed : (Math.random() * 2147483647) | 0, validSave ? save : null);
    setLoad(0.1, 'Generating terrain');
    await preload((f) => setLoad(0.1 + f * 0.9, 'Generating terrain · ' + Math.round(f * 100) + '%'));
    buildSettingsUI();
    buildHotbar();
    buildInventory();
    bindInput();
    $('loading').classList.add('hidden');
    showMenu();
    G.lastTime = performance.now();
    requestAnimationFrame(frame);
  } catch (e) {
    showError('Blocklands could not start', e);
  }
}

boot();
