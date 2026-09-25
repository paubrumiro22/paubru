'use strict';
// Boot, settings/menu, input and the frame loop.

const SETTINGS_UI = [
  { key: 'renderDistance', label: 'Render distance', type: 'range', min: 3, max: 16, step: 1, fmt: (v) => v + ' chunks' },
  { key: 'shadows', label: 'Shadows', type: 'select', options: [['off', 'Off'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High']] },
  { key: 'renderScale', label: 'Render scale', type: 'range', min: 0.5, max: 2, step: 0.25, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'fov', label: 'Field of view', type: 'range', min: 50, max: 110, step: 1, fmt: (v) => v + '°' },
  { key: 'sensitivity', label: 'Mouse sensitivity', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'brightness', label: 'Brightness', type: 'range', min: 0.6, max: 1.8, step: 0.05, fmt: (v) => v.toFixed(2) },
  { key: 'volume', label: 'Sound volume', type: 'range', min: 0, max: 1, step: 0.05, fmt: (v) => Math.round(v * 100) + '%' },
  { key: 'ssr', label: 'Screen-space reflections', type: 'check' },
  { key: 'clouds', label: 'Volumetric clouds', type: 'check' },
  { key: 'godrays', label: 'God rays', type: 'check' },
  { key: 'bloom', label: 'Bloom', type: 'check' },
  { key: 'fxaa', label: 'Anti-aliasing (FXAA)', type: 'check' },
  { key: 'bobbing', label: 'View bobbing', type: 'check' },
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
  if (key === 'volume') Sound.setVolume(value);
  if (!G.renderer) return;
  if (key === 'shadows' || key === 'clouds') {
    try { G.renderer.applySettings(); } catch (e) { showError('Could not apply graphics settings', e); }
  }
  if (key === 'renderScale') resize();
}

function refreshGameUI() {
  document.querySelectorAll('#modeSeg button').forEach((b) => b.classList.toggle('on', b.dataset.mode === G.mode));
  $('difficultySel').value = String(G.difficulty);
  $('keepInvCheck').checked = G.rules.keepInventory;
  $('mobsCheck').checked = G.rules.mobSpawning;
  $('seedVal').textContent = String(G.world ? G.world.seed : '');
  const wt = G.world ? G.world.type : 'default';
  $('worldTypeVal').textContent = WORLD_PRESETS[wt] ? WORLD_PRESETS[wt].name : wt;
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
const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyT', 'F1', 'F3', 'Tab',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

function onKeyDown(e) {
  if (G.dead) return;
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
    case 'KeyQ': Act.dropHeld(e.ctrlKey); break;
    case 'F3': G.debug = !G.debug; $('debug').classList.toggle('hidden', !G.debug); break;
    case 'F1': G.hudHidden = !G.hudHidden; $('hud').classList.toggle('hidden', G.hudHidden); break;
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
  const t = Act.target;
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
    else if (!G.screenOpen && !G.stats.dead) { showMenu(); saveWorld(); }
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
  // typing a place name in the seed box picks the matching themed world
  const seedIn = $('seedInput');
  seedIn.addEventListener('input', () => {
    const k = presetFromText(seedIn.value);
    const chip = $('presetChip');
    if (k) { $('worldTypeSel').value = k; chip.textContent = WORLD_PRESETS[k].icon + ' ' + WORLD_PRESETS[k].name; chip.classList.add('on'); }
    else chip.classList.remove('on');
  });
  seedIn.addEventListener('keydown', (e) => { if (e.code === 'Enter') { e.preventDefault(); newBtn.dataset.armed = '1'; newBtn.click(); } });
  document.querySelectorAll('#presetList button').forEach((b) => b.addEventListener('click', () => {
    seedIn.value = b.dataset.seed;
    seedIn.dispatchEvent(new Event('input'));
    seedIn.focus();
  }));
  $('difficultySel').addEventListener('change', (e) => { G.difficulty = Number(e.target.value); });
  $('keepInvCheck').addEventListener('change', (e) => { G.rules.keepInventory = e.target.checked; });
  $('mobsCheck').addEventListener('change', (e) => { G.rules.mobSpawning = e.target.checked; });
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
    const preset = presetFromText(raw);
    let seed;
    if (!raw) seed = (Math.random() * 2147483647) | 0;
    else if (/^-?\d+$/.test(raw)) seed = Number(raw) | 0;
    else { seed = 0; for (let i = 0; i < raw.length; i++) seed = (Math.imul(seed, 31) + raw.charCodeAt(i)) | 0; }
    const type = preset || $('worldTypeSel').value;
    newWorld(seed, null, { type, mode: G.mode });
    refreshGameUI();
    saveWorld();
    UI.toast((WORLD_PRESETS[type] ? WORLD_PRESETS[type].name + ' · ' : 'New world · ') + 'seed ' + seed);
    requestLock();
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
  try {
    const dt = Math.min(0.05, Math.max(0, (now - G.lastTime) / 1000));
    G.lastTime = now;
    G.frameCount++;
    G.time += dt;
    const p = G.player, st = G.stats;
    const paused = !G.playing && !G.screenOpen && !st.dead;
    const active = G.playing && !G.screenOpen && !st.dead && !G.sleeping;

    if (!paused) {
      if (active) {
        const k = G.input.keys;
        const turn = (k.has('ArrowLeft') ? 1 : 0) - (k.has('ArrowRight') ? 1 : 0);
        const tilt = (k.has('ArrowUp') ? 1 : 0) - (k.has('ArrowDown') ? 1 : 0);
        if (turn) p.yaw = ((p.yaw + turn * 2.2 * dt + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
        if (tilt) p.pitch = clamp(p.pitch + tilt * 1.8 * dt, -1.5605, 1.5605);
        // free-cursor mode: holding still turns into mining
        if (G.unlocked && G.drag.active && !G.drag.mining && G.drag.moved < 6 && now - G.drag.t > 260) { G.drag.mining = true; G.mouse.left = true; }
        G.input.noSprint = G.mode === 'survival' && st.food <= 6;
        G.input.slow = !!(Act.eat || Act.bow);
        p.update(dt, G.input);
      } else if (!st.dead) p.update(dt, NO_KEYS);
      Act.target = active ? Act.pick() : null;
      if (active) { Act.updateMining(dt, now); Act.updateUse(dt, now); }
      else { Act.mine.pos = null; Act.eat = null; Act.bow = null; }
      Act.updateHand(dt);
      Act.updateSounds(dt);
      st.update(dt, p);
      Ents.update(dt);
      tickFurnaces(dt);
      randomTicks(dt);
      updateSleep(dt);
      const fast = active && G.input.keys.has('KeyT') && G.mode === 'creative';
      if (G.settings.dayCycle || fast) G.dayTime = (G.dayTime + (dt / DAY_LENGTH) * (fast ? 60 : 1)) % 1;
      const pr = G.world.gen.preset;
      if (pr && pr.ambient) pr.ambient(dt, p.pos);
      // ambience underground
      G.caveSoundT -= dt;
      if (G.caveSoundT <= 0) { G.caveSoundT = rand(40, 100); if (G.eyeSky < 0.2) sfx('cave', null, 0.7, 1); }
    }

    updateChunks(G.playing ? 7 : 12);

    const hit = Act.target && Act.target.block;
    const eye = p.eyePos();
    G.shake *= Math.exp(-dt * 3);
    let roll = st.hurtTilt * 0.13;
    if (st.dead) { eye[1] -= 1.1; roll = 0.5; }
    if (G.sleeping) eye[1] -= 1.0;
    if (G.shake > 0.01) {
      eye[0] += (Math.random() - 0.5) * G.shake * 0.25; eye[1] += (Math.random() - 0.5) * G.shake * 0.25; eye[2] += (Math.random() - 0.5) * G.shake * 0.25;
    }
    G.eyeSky = sampleSkyExposure(G.world, eye[0], eye[1], eye[2]);
    Sound.setListener(eye, p.yaw);
    const cam = { pos: eye, yaw: p.yaw, pitch: p.pitch, roll, fov: G.settings.fov + p.fovBoost - (Act.bow ? Math.min(1, Act.bow.t) * 12 : 0) };
    const showHand = !G.hudHidden && !st.dead && !G.sleeping;
    const ents = ER.build(G.renderer, cam, { crack: Act.crackInfo(), hand: showHand ? Act.handState() : null });
    G.renderer.render({
      cam, dayTime: G.dayTime, time: G.time, dt, eyeSky: G.eyeSky, underwater: p.eyeInWater,
      chunks: G.world.chunks.values(), selection: hit && !G.hudHidden ? hit.pos : null, selectionBox: hit ? hit.box : null, entities: ents,
    });
    UI.update(dt);

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
    'Seed ' + G.world.seed + ' (' + G.world.type + ')',
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
    const save = loadSave();
    newWorld(save ? save.seed : (Math.random() * 2147483647) | 0, save, { mode: 'survival', type: 'default' });
    setLoad(0.1, 'Generating terrain');
    await preload((f) => setLoad(0.1 + f * 0.9, 'Generating terrain · ' + Math.round(f * 100) + '%'));
    buildSettingsUI();
    bindInput();
    UI.invDirty();
    UI.updateHud(true);
    $('loading').classList.add('hidden');
    showMenu();
    G.lastTime = performance.now();
    requestAnimationFrame(frame);
  } catch (e) {
    showError('Blocklands could not start', e);
  }
}

boot();
