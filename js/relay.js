'use strict';
// A relay for servers through Supabase Realtime (the same project as cloud.js): a WebSocket
// "broadcast" channel per server. Players normally talk straight to each other over WebRTC
// (net.js), but that fails on many home, school and mobile networks (no TURN server), and then
// the players simply never see each other. Over the relay everyone reaches everyone: net.js
// sends a slow beacon through it all the time and switches to full-rate presence, villagers
// and pictures whenever someone cannot be reached directly. Phoenix channel protocol, JSON v1.

const RELAY_URL = CLOUD_URL.replace(/^http/, 'ws') + '/realtime/v1/websocket?apikey=' + CLOUD_KEY + '&vsn=1.0.0';

const Relay = {
  ws: null, topic: null, joinRef: null, ref: 0, joined: false, token: 0, hb: 0, retry: 0,
  handlers: {},       // event -> fn(payload)

  on(event, fn) { this.handlers[event] = fn; },

  open(code) {
    this.close();
    this.topic = 'realtime:blocklands-srv-' + code;
    this.connect(this.token);
  },

  close() {
    this.token++;
    clearInterval(this.hb);
    const ws = this.ws;
    this.ws = null; this.joined = false; this.retry = 0;
    if (ws) try { ws.close(); } catch (e) { /* ignore */ }
  },

  connect(tok) {
    if (typeof WebSocket === 'undefined') return;
    let ws;
    try { ws = new WebSocket(RELAY_URL); } catch (e) { this.later(tok); return; }
    this.ws = ws; this.joined = false;
    ws.onopen = () => {
      if (tok !== this.token) { ws.close(); return; }
      this.joinRef = String(++this.ref);
      this.raw({ topic: this.topic, event: 'phx_join', ref: this.joinRef, join_ref: this.joinRef,
        payload: { config: { broadcast: { self: false, ack: false }, presence: { key: '' }, private: false }, access_token: CLOUD_KEY } });
      clearInterval(this.hb);
      this.hb = setInterval(() => this.raw({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: String(++this.ref) }), 25000);
    };
    ws.onmessage = (e) => {
      if (tok !== this.token) return;
      let m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (!m || m.topic !== this.topic) return;
      if (m.event === 'phx_reply' && m.ref === this.joinRef) {
        this.joined = !!(m.payload && m.payload.status === 'ok');
        if (this.joined) { this.retry = 0; Net.relayUp(); } else { console.warn('Blocklands: relay refused', m.payload); ws.close(); }
      } else if (m.event === 'broadcast' && m.payload && typeof m.payload.event === 'string') {
        const fn = this.handlers[m.payload.event];
        if (fn && m.payload.payload && typeof m.payload.payload === 'object') try { fn(m.payload.payload); } catch (err) { console.warn('Blocklands: relay message', err); }
      } else if (m.event === 'phx_error' || m.event === 'phx_close') ws.close();
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (this.ws === ws) { this.ws = null; this.joined = false; clearInterval(this.hb); }
      if (tok === this.token) this.later(tok);
    };
  },

  later(tok) {
    const wait = Math.min(30000, 1000 * 2 ** this.retry++);
    setTimeout(() => { if (tok === this.token && !this.ws) this.connect(tok); }, wait);
  },

  raw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); },

  send(event, payload) {
    if (!this.joined) return false;
    this.raw({ topic: this.topic, event: 'broadcast', ref: String(++this.ref), join_ref: this.joinRef, payload: { type: 'broadcast', event, payload } });
    return true;
  },
};
