'use strict';
// Always-on servers: every server's block edits are also kept in a Supabase database, so the
// world is there even when none of its players is online, and edits reach everyone even when
// the direct (P2P) connection fails. Players still see each other move through P2P; the
// database only holds blocks: one row per edited block with the time it changed (newest wins,
// also enforced by a trigger) and a server-side revision number used to fetch what is new.
// The tables, policies and trigger are in supabase.sql (run it once in the SQL editor).

const CLOUD_URL = 'https://bkclnnnmrnxkguyhlyex.supabase.co';
// the public "anon" key: meant to live in the page, access is limited by the policies
const CLOUD_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrY2xubm5tcm54a2d1eWhseWV4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA0MTIzMDgsImV4cCI6MjEwNTk4ODMwOH0.aCvdQzkRd9ssR6YvCevTcBymkE9tshIZWmcHt4qdviQ';
const CLOUD_PAGE = 1000;   // rows per request (the API's default cap)
const CLOUD_BATCH = 500;   // rows per upload

class CloudError extends Error {
  constructor(status, body) { super('cloud ' + status + ' ' + body); this.status = status; this.body = body; }
}

const Cloud = {
  state: 'checking',  // checking | ok | setup | offline
  server: null, token: 0,
  queue: new Map(),   // posKey -> row waiting to upload
  rev: 0, synced: 0, pollTimer: 0, flushTimer: 0, busy: false, backoff: 0,

  async req(path, opts = {}) {
    const headers = { apikey: CLOUD_KEY, Authorization: 'Bearer ' + CLOUD_KEY, ...(opts.headers || {}) };
    if (opts.body) headers['Content-Type'] = 'application/json';
    const r = await fetch(CLOUD_URL + '/rest/v1/' + path, { method: opts.method || 'GET', headers, body: opts.body, keepalive: !!opts.keepalive });
    if (!r.ok) throw new CloudError(r.status, await r.text().catch(() => ''));
    return r.status === 204 || opts.noBody ? null : r.json();
  },

  failed(e) {
    console.warn('Blocklands: cloud', e);
    // a missing table means the one-time setup has not been run
    this.state = e && (e.status === 404 || /PGRST205|42P01|does not exist/.test(e.body || '')) ? 'setup' : 'offline';
    this.refresh();
  },

  async check() {
    try {
      await this.req('bl_servers?select=code&limit=1');
      if (this.state === 'checking' || this.state === 'setup') this.state = 'ok';
    } catch (e) { this.failed(e); }
    this.refresh();
  },

  // ---------------------------------------------------------------- session ----
  async open(server) {
    const token = ++this.token;
    this.server = server;
    this.rev = 0;
    this.synced = 0;
    this.refresh();
    const code = server.code;
    try {
      // the server's name and mode
      const meta = await this.req('bl_servers?select=name,mode&code=eq.' + code);
      if (token !== this.token) return;
      if (meta.length) this.adoptMeta(server, meta[0]);
      else await this.req('bl_servers', { method: 'POST', headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' }, body: JSON.stringify([{ code, name: server.named ? server.name : '', mode: server.mode }]), noBody: true });
      // every block edited on it
      const inCloud = new Map();   // posKey -> time in the cloud
      for (;;) {
        const rows = await this.req('bl_blocks?select=x,y,z,id,f,t,rev&server=eq.' + code + '&rev=gt.' + this.rev + '&order=rev.asc&limit=' + CLOUD_PAGE);
        if (token !== this.token) return;
        this.apply(rows, inCloud);
        if (rows.length < CLOUD_PAGE) break;
      }
      // blocks this device changed that the cloud does not have yet (worlds from before the
      // cloud, or edits made offline) go up now
      const w = G.world;
      for (const [key, m] of w.edits) {
        const cx = Math.floor(key / 65536) - 32768, cz = (key % 65536) - 32768;
        for (const [idx, id] of m) {
          const x = cx * CS + (idx % CS), z = cz * CS + (Math.floor(idx / CS) % CS), y = Math.floor(idx / (CS * CS));
          const pk = posKey(x, y, z);
          const t = Net.times.get(pk) || 1;
          if (inCloud.has(pk) && t <= inCloud.get(pk)) continue;
          const f = w.facing.get(pk);
          this.queue.set(pk, { server: code, x, y, z, id, f: f === undefined ? -1 : f, t });
        }
      }
      this.state = 'ok';
      this.refresh();
      this.scheduleFlush(200);
      this.schedulePoll();
    } catch (e) {
      if (token === this.token) this.failed(e);
      // try again later: the world keeps saving on this device meanwhile
      if (token === this.token) this.pollTimer = setTimeout(() => { if (this.server === server) this.open(server); }, 20000);
    }
  },

  close() {
    this.token++;
    clearTimeout(this.pollTimer);
    this.server = null;
    this.flush(true);
    this.refresh();
  },

  adoptMeta(server, m) {
    if (server.named || !m || typeof m.name !== 'string' || !m.name) return;
    server.name = safeServerName(m.name, server.code);
    server.named = true;
    if ((m.mode === 'creative' || m.mode === 'survival') && m.mode !== server.mode) {
      server.mode = m.mode;
      setGameMode(server.mode);
      refreshGameUI();
    }
    Net.saveServers();
    Net.refreshUI();
  },

  apply(rows, seen) {
    const flat = [];
    for (const r of rows) {
      flat.push(r.x, r.y, r.z, r.id, r.f, r.t);
      if (r.rev > this.rev) this.rev = r.rev;
      if (seen) seen.set(posKey(r.x, r.y, r.z), r.t);
    }
    if (flat.length) Net.mergeEdits(flat, 6);
    this.synced += rows.length;
  },

  // new edits from other players (P2P usually brings them first; this covers the rest)
  schedulePoll() {
    clearTimeout(this.pollTimer);
    const server = this.server;
    if (!server) return;
    this.pollTimer = setTimeout(async () => {
      if (this.server !== server) return;
      const token = this.token;
      try {
        for (;;) {
          const rows = await this.req('bl_blocks?select=x,y,z,id,f,t,rev&server=eq.' + server.code + '&rev=gt.' + this.rev + '&order=rev.asc&limit=' + CLOUD_PAGE);
          if (token !== this.token) return;
          this.apply(rows);
          if (rows.length < CLOUD_PAGE) break;
        }
        if (this.state !== 'ok') { this.state = 'ok'; this.refresh(); }
      } catch (e) { if (token === this.token) this.failed(e); }
      if (token === this.token) this.schedulePoll();
    }, document.hidden ? 15000 : 3000);
  },

  // ---------------------------------------------------------------- uploads ----
  push(x, y, z, id, f, t) {
    if (!this.server) return;
    this.queue.set(posKey(x, y, z), { server: this.server.code, x, y, z, id, f: validFacing(f) ? f : -1, t });
    this.scheduleFlush(1200);
  },

  scheduleFlush(ms) {
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => { this.flushTimer = 0; this.flush(false); }, ms + this.backoff);
  },

  async flush(leaving) {
    if (!this.queue.size || (this.busy && !leaving)) return;
    if (this.state === 'setup') return;
    this.busy = true;
    try {
      while (this.queue.size) {
        const batch = [];
        for (const [pk, row] of this.queue) { batch.push([pk, row]); if (batch.length >= (leaving ? 150 : CLOUD_BATCH)) break; }
        for (const [pk] of batch) this.queue.delete(pk);
        try {
          await this.req('bl_blocks', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(batch.map((b) => b[1])), keepalive: leaving, noBody: true });
          this.backoff = 0;
        } catch (e) {
          // put them back unless a newer edit of the same block is already waiting
          for (const [pk, row] of batch) if (!this.queue.has(pk)) this.queue.set(pk, row);
          this.backoff = Math.min(30000, (this.backoff || 2000) * 2);
          this.failed(e);
          if (!leaving) this.scheduleFlush(0);
          return;
        }
        if (leaving) break;   // the page may be closing: one small request is all that is sure to go
      }
      if (this.state !== 'ok') { this.state = 'ok'; this.refresh(); }
    } finally { this.busy = false; }
  },

  // ---------------------------------------------------------------- UI ----
  refresh() {
    const bar = $('cloudBar'), txt = $('cloudText');
    if (!bar) return;
    let cls = '', t;
    if (this.state === 'ok') {
      cls = 'ok';
      t = this.server
        ? 'Saved in the cloud · this server stays online even when nobody is playing' + (this.queue.size ? ' · uploading ' + this.queue.size + ' blocks…' : '')
        : 'Cloud connected · servers stay online 24/7, even when nobody is playing';
    } else if (this.state === 'setup') {
      cls = 'warn';
      t = 'The cloud database is not set up yet · servers work player-to-player and save on this device';
    } else if (this.state === 'offline') {
      cls = 'warn';
      t = 'Cloud unreachable right now · your edits are kept here and upload when it is back';
    } else t = 'Connecting to the cloud…';
    bar.className = 'cloudbar ' + cls;
    txt.textContent = t;
  },
};

window.addEventListener('pagehide', () => Cloud.flush(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) Cloud.flush(true); else if (Cloud.server) Cloud.schedulePoll(); });
