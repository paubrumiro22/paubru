'use strict';
// Player inventory (36 slots + armour) and stack helpers. Slots 0-8 are the hotbar.

function mkStack(id, count = 1, dmg = 0) { return { id, count, dmg }; }
function cloneStack(s) { return s ? { id: s.id, count: s.count, dmg: s.dmg || 0 } : null; }
function sameItem(a, b) { return !!a && !!b && a.id === b.id && (a.dmg || 0) === (b.dmg || 0); }

class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null);
    this.armor = [null, null, null, null];
    this.selected = 0;
  }

  get held() { return this.slots[this.selected]; }
  set held(s) { this.slots[this.selected] = s; }

  // Adds as much of the stack as fits; returns the count that did not fit.
  add(stack) {
    if (!stack || !isItem(stack.id)) return 0;
    let left = stack.count;
    const max = maxStack(stack.id);
    const order = [];
    for (let i = 0; i < 36; i++) order.push(i);
    for (const i of order) {
      const s = this.slots[i];
      if (left > 0 && sameItem(s, stack) && s.count < max) {
        const n = Math.min(max - s.count, left);
        s.count += n; left -= n;
      }
    }
    for (const i of order) {
      if (left > 0 && !this.slots[i]) {
        const n = Math.min(max, left);
        this.slots[i] = mkStack(stack.id, n, stack.dmg || 0);
        left -= n;
      }
    }
    return left;
  }

  count(idOrList) {
    let n = 0;
    for (const s of this.slots) if (s && (Array.isArray(idOrList) ? idOrList.includes(s.id) : s.id === idOrList)) n += s.count;
    return n;
  }

  // Removes up to n items matching id (or any id in a list); returns the removed stacks' ids.
  remove(idOrList, n) {
    const taken = [];
    for (let i = 35; i >= 0 && n > 0; i--) {
      const s = this.slots[i];
      if (!s || !(Array.isArray(idOrList) ? idOrList.includes(s.id) : s.id === idOrList)) continue;
      const k = Math.min(n, s.count);
      s.count -= k; n -= k;
      for (let j = 0; j < k; j++) taken.push(s.id);
      if (s.count <= 0) this.slots[i] = null;
    }
    return taken;
  }

  consumeHeld(n = 1) {
    const s = this.held;
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.held = null;
  }

  // Wears the held tool; returns true when it broke.
  damageHeld(amount = 1) {
    const s = this.held;
    if (!s || !maxDur(s.id)) return false;
    s.dmg = (s.dmg || 0) + amount;
    if (s.dmg >= maxDur(s.id)) { this.held = null; return true; }
    return false;
  }

  armorPoints() {
    let p = 0;
    for (const a of this.armor) if (a && ITEM_DEF[a.id] && ITEM_DEF[a.id].armor) p += ITEM_DEF[a.id].armor.pts;
    return p;
  }

  damageArmor(amount) {
    for (let i = 0; i < 4; i++) {
      const a = this.armor[i];
      if (!a) continue;
      a.dmg = (a.dmg || 0) + Math.max(1, Math.floor(amount / 4));
      if (a.dmg >= maxDur(a.id)) { this.armor[i] = null; sfx('tool_break', null, 0.8, 1); }
    }
  }

  clear() { this.slots.fill(null); this.armor.fill(null); }

  serialize() {
    const enc = (s) => (s ? [s.id, s.count, s.dmg || 0] : 0);
    return { slots: this.slots.map(enc), armor: this.armor.map(enc), selected: this.selected };
  }

  load(o) {
    this.clear();
    if (!o || typeof o !== 'object') return;
    const dec = (a) => (Array.isArray(a) && isItem(a[0]) && a[1] > 0 ? mkStack(a[0], Math.min(a[1] | 0, maxStack(a[0])), a[2] | 0) : null);
    if (Array.isArray(o.slots)) for (let i = 0; i < 36 && i < o.slots.length; i++) this.slots[i] = dec(o.slots[i]);
    if (Array.isArray(o.armor)) for (let i = 0; i < 4 && i < o.armor.length; i++) this.armor[i] = dec(o.armor[i]);
    if (Number.isInteger(o.selected)) this.selected = clamp(o.selected, 0, 8);
  }
}
