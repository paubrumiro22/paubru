'use strict';
// Player skins: fifteen original costumes painted into the model atlas (slots 16..30, laid out
// like the online avatar) plus 3D accessories (hats, crowns, capes, antennae...) drawn with the
// avatar. Skin 0 is the classic explorer whose shirt takes the player's colour. Other players
// see your skin online, you see it on your arm and in third person (F5).

const SKIN_SLOT0 = 16;
let SKIN_ATLAS = null;
const rgb = (h) => [(h >> 16) & 255, (h >> 8) & 255, h & 255];
const c01 = (h, k = 1.3) => rgb(h).map((v) => Math.pow(v / 255, 2.2) * k);   // linear, compensating the grey swatch

// extras: boxes in model pixels attached to a part ('head' or 'body'), coloured, optionally
// rotated about their own pivot and self-lit (glow)
const SKINS = [
  { key: 'explorer', name: 'Explorer', icon: '🧭' },
  {
    key: 'astronaut', name: 'Astronaut', icon: '🚀',
    extras: [
      { part: 'head', box: [2.5, 32, -0.5, 3.5, 36, 0.5], color: 0xd8d8dc },
      { part: 'head', box: [2.2, 36, -0.8, 3.8, 37.6, 0.8], color: 0xff4030, glow: true },
      { part: 'body', box: [-3.5, 14, -4.6, 3.5, 23, -2], color: 0xe8e8ea },
      { part: 'body', box: [-2.5, 15, -4.8, -0.5, 17, -4.5], color: 0xf07820 },
    ],
    paint(P) {
      const white = rgb(0xececef), orange = rgb(0xf07820), grey = rgb(0xa8acb4);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front' && x >= 1 && x <= 6 && y >= 2 && y <= 6) return (x === 2 && y === 3) || (x === 3 && y === 3) || (x === 2 && y === 4) ? rgb(0x9cc4ea) : rgb(0x1c2c50);
        return y === 7 ? orange : white;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (f === 'front' && y >= 2 && y <= 4 && x >= 2 && x <= 5) return [rgb(0xe03030), rgb(0x30c060), rgb(0x3080f0), rgb(0xf0c020)][(x + y) % 4];
        if (y === 7) return orange;
        return white;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 2 ? grey : y === 6 ? orange : white));
      P.fill('leg', (x, y, w, h) => (y >= h - 3 ? grey : y === 3 ? orange : white));
    },
  },
  {
    key: 'pirate', name: 'Pirate', icon: '🏴‍☠️',
    extras: [
      { part: 'head', box: [-6, 31.5, -5, 6, 33, 5], color: 0x1a1a1e },
      { part: 'head', box: [-4.5, 33, -4, 4.5, 36, 4], color: 0x1a1a1e },
      { part: 'head', box: [-6, 32.9, 4.2, 6, 33.4, 5], color: 0xd8b040 },
      { part: 'head', box: [-1.2, 34, 4, 1.2, 35.6, 4.3], color: 0xf0f0e8 },
    ],
    paint(P) {
      const skinC = rgb(0xd09a70), beard = rgb(0x2a1a10);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 3 && x >= 1 && x <= 2) return rgb(0x101010);
          if (y === 2 && x >= 0 && x <= 3) return rgb(0x101010);
          if (y === 3 && x === 5) return rgb(0xf4f4f4);
          if (y === 3 && x === 6) return rgb(0x3a2a1a);
          if (y >= 5 && !(y === 5 && x >= 3 && x <= 4)) return beard;
          if (y === 6 && x >= 3 && x <= 4) return rgb(0x8a3030);
          return skinC;
        }
        if (y === 2) return rgb(0x101010);
        if (f === 'left' || f === 'right') return y >= 5 ? beard : skinC;
        if (f === 'top') return rgb(0x2a1a10);
        return y < 5 ? rgb(0x2a1a10) : skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (y === 9) return f === 'front' && x >= 3 && x <= 4 ? rgb(0xe0c040) : rgb(0x201810);
        if (y > 9) return rgb(0x6a4a2a);
        return (y >> 1) % 2 ? rgb(0xd83030) : rgb(0xf0ece4);
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : (y >> 1) % 2 ? rgb(0xd83030) : rgb(0xf0ece4)));
      P.fill('leg', (x, y, w, h) => (y >= h - 4 ? rgb(0x1a1210) : rgb(0x6a4a2a)));
    },
  },
  {
    key: 'ninja', name: 'Ninja', icon: '🥷',
    extras: [
      { part: 'head', box: [-1.5, 28.5, -6.5, -0.5, 29.5, -4], color: 0xd02020, rot: [0.5, 0.25, 0] },
      { part: 'head', box: [0.5, 28, -7, 1.5, 29, -4], color: 0xd02020, rot: [0.7, -0.2, 0] },
    ],
    paint(P) {
      const black = rgb(0x1c1c22), red = rgb(0xd02020), skinC = rgb(0xe2b08a);
      P.fill('head', (x, y, w, h, f) => {
        if (y === 1 || y === 2) return red;
        if (f === 'front' && y >= 3 && y <= 4 && x >= 1 && x <= 6) return (y === 4 && (x === 2 || x === 5)) ? rgb(0x101010) : skinC;
        return black;
      });
      P.fill('body', (x, y, w, h, f) => (y === 8 ? rgb(0x505058) : f === 'front' && Math.abs(x - y * 0.5 - 1) < 0.6 && y < 8 ? rgb(0x303038) : black));
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? rgb(0x28282e) : black));
      P.fill('leg', (x, y, w, h) => (y >= h - 5 && y % 2 === 0 ? rgb(0x3a3a42) : black));
    },
  },
  {
    key: 'chef', name: 'Chef', icon: '👨‍🍳',
    extras: [
      { part: 'head', box: [-4.2, 32, -4.2, 4.2, 35, 4.2], color: 0xf8f8f6 },
      { part: 'head', box: [-5, 35, -5, 5, 39, 5], color: 0xf8f8f6 },
    ],
    paint(P) {
      const skinC = rgb(0xe8b48c), white = rgb(0xf6f6f2);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x202020);
          if (y === 5 && x >= 1 && x <= 6) return rgb(0x2a1a12);
          if (y === 4 && (x === 1 || x === 6)) return rgb(0xf09080);
          if (y === 6 && x >= 3 && x <= 4) return rgb(0xb05050);
        }
        if (y === 0 && f !== 'bottom') return rgb(0x5a3a22);
        return skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (y <= 1 && f !== 'back') return rgb(0xd83030);
        if (f === 'front' && (x === 2 || x === 5) && y % 3 === 0 && y > 1) return rgb(0x202020);
        return white;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : white));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x202020) : ((x + y) % 2 ? rgb(0x202020) : rgb(0xf0f0f0))));
    },
  },
  {
    key: 'robot', name: 'Robot', icon: '🤖',
    extras: [
      { part: 'head', box: [-0.5, 32, -0.5, 0.5, 35, 0.5], color: 0x9aa0a8 },
      { part: 'head', box: [-1, 35, -1, 1, 37, 1], color: 0xff3030, glow: true },
      { part: 'head', box: [-5, 27, -1, -4, 29, 1], color: 0x707880 },
      { part: 'head', box: [4, 27, -1, 5, 29, 1], color: 0x707880 },
      { part: 'head', box: [-3, 28, 4, -1, 29.5, 4.3], color: 0x60f0ff, glow: true },
      { part: 'head', box: [1, 28, 4, 3, 29.5, 4.3], color: 0x60f0ff, glow: true },
    ],
    paint(P) {
      const metal = rgb(0x9aa2ac), dark = rgb(0x5a6068);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front' && y === 6 && x >= 2 && x <= 5) return x % 2 ? rgb(0x303038) : rgb(0xd0d4d8);
        return x === 0 || y === 0 || x === w - 1 || y === h - 1 ? dark : metal;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (f === 'front' && y >= 2 && y <= 6 && x >= 2 && x <= 5) return (y === 3 && (x === 2 || x === 5)) || (y === 4) || (y === 5 && x >= 3 && x <= 4) ? rgb(0xff4060) : rgb(0x102030);
        return y % 4 === 0 ? dark : metal;
      });
      P.fill('arm', (x, y) => (y % 4 === 3 ? dark : metal));
      P.fill('leg', (x, y, w, h) => (y % 4 === 3 || y >= h - 2 ? dark : metal));
    },
  },
  {
    key: 'dino', name: 'Dino', icon: '🦖',
    extras: [
      { part: 'head', box: [-0.8, 32, -3, 0.8, 34, -1], color: 0xf08a20 },
      { part: 'head', box: [-0.8, 32, 0, 0.8, 33.5, 2], color: 0xf08a20 },
      { part: 'body', box: [-0.8, 20, -3.5, 0.8, 22, -2], color: 0xf08a20 },
      { part: 'body', box: [-0.8, 16, -3.5, 0.8, 18, -2], color: 0xf08a20 },
      { part: 'body', box: [-2, 11, -9, 2, 14, -2], color: 0x5aaa46, rot: [0.35, 0, 0] },
    ],
    paint(P) {
      const green = rgb(0x5aaa46), belly = rgb(0xc8dc78);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 2 && (x === 1 || x === 6)) return rgb(0xffffff);
          if (y === 2 && (x === 2 || x === 5)) return rgb(0x101010);
          if (y === 4 && (x === 3 || x === 4)) return rgb(0x2a5a20);
          if (y === 6) return x % 2 ? rgb(0xffffff) : rgb(0x8a2020);
          if (y === 7) return x % 2 ? rgb(0x8a2020) : rgb(0xffffff);
        }
        return green;
      });
      P.fill('body', (x, y, w, h, f) => (f === 'front' && x >= 1 && x <= 6 && y >= 1 ? belly : green));
      P.fill('arm', (x, y, w, h) => (y === h - 1 && x % 2 ? rgb(0xf0f0e0) : green));
      P.fill('leg', (x, y, w, h) => (y === h - 1 && x % 2 ? rgb(0xf0f0e0) : green));
    },
  },
  {
    key: 'football', name: 'Football star', icon: '⚽',
    paint(P) {
      const skinC = rgb(0xd8a07a), hair = rgb(0x3a2412), g = rgb(0x1e9a4a), w = rgb(0xf4f4f0);
      P.fill('head', (x, y, ww, h, f) => {
        if (f === 'top') return hair;
        if (y === 0) return hair;
        if (y === 1) return rgb(0xf4f4f0);   // headband
        if (f === 'front') {
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x1a1a1a);
          if (y === 6 && x >= 2 && x <= 5) return x === 2 || x === 5 ? rgb(0xa04040) : rgb(0xffffff);
          return skinC;
        }
        if (f === 'back') return y < 4 ? hair : skinC;
        return y < 3 ? hair : skinC;
      });
      // the number 10 on the back
      const ten = ['1.111', '1.1.1', '1.1.1', '1.1.1', '1.111'];
      P.fill('body', (x, y, ww, h, f) => {
        if (f === 'back' && y >= 2 && y <= 6 && x >= 1 && x <= 5 && ten[y - 2][x - 1] === '1') return rgb(0x101010);
        if (f === 'front' && y === 2 && x === 5) return rgb(0xf0c020);
        return (x >> 1) % 2 ? w : g;
      });
      P.fill('arm', (x, y, ww, h) => (y >= 4 ? skinC : (x >> 1) % 2 ? w : g));
      P.fill('leg', (x, y, ww, h) => (y < 4 ? w : y < 6 ? skinC : y >= h - 2 ? rgb(0x101010) : g));
    },
  },
  {
    key: 'hero', name: 'Super Block', icon: '🦸',
    extras: [{ part: 'body', box: [-4.5, 3, -3.2, 4.5, 24, -2.2], color: 0xd02828, rot: [0.18, 0, 0] }],
    paint(P) {
      const blue = rgb(0x2a5ad8), red = rgb(0xd02828), gold = rgb(0xf0c830), skinC = rgb(0xe8b890);
      P.fill('head', (x, y, w, h, f) => {
        if (y <= 1 || f === 'top') return rgb(0x14141a);
        if (f === 'front') {
          if (y === 3 && x >= 1 && x <= 6) return x === 2 || x === 5 ? rgb(0xffffff) : blue;
          if (y === 6 && x >= 3 && x <= 4) return rgb(0xa04040);
          return skinC;
        }
        return f === 'back' ? rgb(0x14141a) : y === 3 ? blue : skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (y === 10) return gold;
        if (f === 'front' && y >= 2 && y <= 6 && Math.abs(x - 3.5) + Math.abs(y - 4) <= 3) return Math.abs(x - 3.5) + Math.abs(y - 4) <= 1.5 ? red : gold;
        return blue;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? red : blue));
      P.fill('leg', (x, y, w, h) => (y < 3 ? red : y >= h - 4 ? red : blue));
    },
  },
  {
    key: 'king', name: 'King', icon: '👑',
    extras: [
      { part: 'head', box: [-4.3, 32, -4.3, 4.3, 33.5, 4.3], color: 0xf0c030 },
      { part: 'head', box: [-4.3, 33.5, -4.3, -2.8, 35.5, -2.8], color: 0xf0c030 },
      { part: 'head', box: [2.8, 33.5, -4.3, 4.3, 35.5, -2.8], color: 0xf0c030 },
      { part: 'head', box: [-4.3, 33.5, 2.8, -2.8, 35.5, 4.3], color: 0xf0c030 },
      { part: 'head', box: [2.8, 33.5, 2.8, 4.3, 35.5, 4.3], color: 0xf0c030 },
      { part: 'head', box: [-0.6, 32.3, 4.2, 0.6, 33.2, 4.5], color: 0xe02040, glow: true },
    ],
    paint(P) {
      const skinC = rgb(0xe8b890), beard = rgb(0xf0f0ec), robe = rgb(0xb01830);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x303060);
          if (y === 4 && (x === 1 || x === 6)) return rgb(0xf0a090);
          if (y >= 5) return y === 5 && x >= 3 && x <= 4 ? rgb(0xc07070) : beard;
          return skinC;
        }
        if (f === 'top') return rgb(0xe0e0dc);
        return y >= 5 || f === 'back' ? beard : skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (f === 'front' && (x === 3 || x === 4)) return y % 3 === 1 ? rgb(0xf0c030) : rgb(0xf4f2ec);
        if (y <= 1) return (x + y) % 3 === 0 ? rgb(0x101010) : rgb(0xf4f2ec);
        return robe;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : y === h - 4 ? rgb(0xf4f2ec) : robe));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x201818) : y <= 1 ? rgb(0xf4f2ec) : robe));
    },
  },
  {
    key: 'banana', name: 'Banana', icon: '🍌',
    extras: [{ part: 'head', box: [-1, 32, -1, 1, 35, 1], color: 0x5a3a1a, rot: [0.25, 0, 0.2] }],
    paint(P) {
      const y1 = rgb(0xf4d23c), y2 = rgb(0xe0b82a), skinC = rgb(0xe8b890);
      const peel = (x, w) => (x === 0 || x === w - 1 ? y2 : y1);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front' && x >= 1 && x <= 6 && y >= 2 && y <= 6) {
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x202020);
          if (y === 5 && x >= 2 && x <= 5) return x === 2 || x === 5 ? rgb(0x904040) : rgb(0xc04848);
          return skinC;
        }
        return f === 'top' ? rgb(0x6a4a1a) : peel(x, w);
      });
      P.fill('body', (x, y, w, h, f) => (f === 'front' && (x + y * 3) % 11 === 0 ? rgb(0x8a6a2a) : peel(x, w)));
      P.fill('arm', (x, y, w, h) => (y >= h - 2 ? skinC : peel(x, w)));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x5a3a1a) : peel(x, w)));
    },
  },
  {
    key: 'clown', name: 'Clown', icon: '🤡',
    extras: [
      { part: 'head', box: [-7, 27, -3, -4, 32, 3], color: 0xff7a1a },
      { part: 'head', box: [4, 27, -3, 7, 32, 3], color: 0x30c040 },
      { part: 'head', box: [-3, 31.5, -3, 3, 33, 3], color: 0x3a8af0 },
      { part: 'head', box: [-1, 27, 4, 1, 29, 5.5], color: 0xf02020, glow: true },
    ],
    paint(P) {
      const white = rgb(0xf8f6f2);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 2 && (x === 2 || x === 5)) return rgb(0x3060d0);
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x101010);
          if ((y === 5 && (x === 1 || x === 6)) || (y === 6 && x >= 2 && x <= 5)) return rgb(0xe02828);
          return white;
        }
        return white;
      });
      const dots = [rgb(0xe02828), rgb(0x2a70e0), rgb(0x30b040)];
      P.fill('body', (x, y, w, h, f) => ((x * 3 + y * 5) % 7 === 0 ? dots[(x + y) % 3] : f === 'front' && x >= 3 && x <= 4 && y % 3 === 1 ? rgb(0xffffff) : rgb(0xf6d030)));
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? white : (x * 3 + y * 5) % 7 === 0 ? dots[y % 3] : rgb(0xf6d030)));
      P.fill('leg', (x, y, w, h) => (y >= h - 3 ? rgb(0xe02828) : rgb(0x3a58c8)));
    },
  },
  {
    key: 'penguin', name: 'Penguin', icon: '🐧',
    extras: [{ part: 'head', box: [-1.2, 27, 4, 1.2, 28.5, 6], color: 0xf09020 }],
    paint(P) {
      const black = rgb(0x1a1c22), white = rgb(0xf4f4f0);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front' && x >= 1 && x <= 6 && y >= 2) {
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x101010);
          return white;
        }
        return black;
      });
      P.fill('body', (x, y, w, h, f) => (f === 'front' && x >= 1 && x <= 6 ? white : black));
      P.fill('arm', () => black);
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0xf09020) : f2(y) ? white : black));
      function f2(y) { return y < 3; }
    },
  },
  {
    key: 'grandpa', name: 'Grandpa', icon: '👴',
    paint(P) {
      const skinC = rgb(0xecc0a0), hair = rgb(0xe8e8e8), card = rgb(0xb89060);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 3 && (x <= 3 || x >= 4) && x >= 1 && x <= 6) return x === 1 || x === 3 || x === 4 || x === 6 ? rgb(0x202020) : rgb(0xb8d8f0);
          if (y === 5 && x >= 2 && x <= 5) return hair;
          if (y === 2 && (x === 1 || x === 6)) return rgb(0xd0d0d0);
          return skinC;
        }
        if (f === 'top') return skinC;
        if (f === 'left' || f === 'right') return y >= 2 && y <= 4 ? hair : y === 3 ? rgb(0x202020) : skinC;
        return y >= 2 && y <= 5 ? hair : skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (f === 'front' && (x === 3 || x === 4) && y < 3) return rgb(0xf4f4f0);
        if (f === 'front' && x === 4 && y % 3 === 2) return rgb(0x6a4a2a);
        return (x + y) % 4 === 0 ? rgb(0xa88050) : card;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : card));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x8a3a2a) : rgb(0x7a7a80)));
    },
  },
  {
    key: 'alien', name: 'Alien', icon: '👽',
    extras: [
      { part: 'head', box: [-2.5, 32, -0.5, -1.5, 35, 0.5], color: 0x8ac87a, rot: [0, 0, 0.3] },
      { part: 'head', box: [1.5, 32, -0.5, 2.5, 35, 0.5], color: 0x8ac87a, rot: [0, 0, -0.3] },
      { part: 'head', box: [-3.8, 35, -0.8, -2.2, 36.6, 0.8], color: 0x80ff80, glow: true },
      { part: 'head', box: [2.2, 35, -0.8, 3.8, 36.6, 0.8], color: 0x80ff80, glow: true },
    ],
    paint(P) {
      const skinC = rgb(0x8ac87a), silver = rgb(0xc4c8d0);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          const eye = (y === 2 || y === 3 || y === 4) && ((x >= 1 && x <= 2) || (x >= 5 && x <= 6));
          if (eye) return (y === 2 && (x === 2 || x === 5)) ? rgb(0xe0f0ff) : rgb(0x08080c);
          if (y === 6 && x >= 3 && x <= 4) return rgb(0x3a6a30);
        }
        return skinC;
      });
      P.fill('body', (x, y, w, h, f) => (f === 'front' && y === 3 && x >= 2 && x <= 5 ? rgb(0x40e0a0) : y % 5 === 4 ? rgb(0x9aa0aa) : silver));
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : silver));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x707880) : silver));
    },
  },
  {
    key: 'skater', name: 'Skater', icon: '🛹',
    extras: [
      { part: 'head', box: [-4.3, 31, -4.3, 4.3, 33.2, 4.3], color: 0xd82828 },
      { part: 'head', box: [-3, 31, -7.5, 3, 31.8, -4], color: 0xd82828 },
    ],
    paint(P) {
      const skinC = rgb(0xc8906a), hood = rgb(0x6a3ac0);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 3 && x >= 1 && x <= 6) return rgb(0x101014);
          if (y === 2 && x >= 1 && x <= 6) return rgb(0x303038);
          if (y === 6 && x >= 2 && x <= 5) return x === 2 || x === 5 ? rgb(0x904040) : rgb(0xffffff);
          if (y === 0) return rgb(0x2a1a10);
          return skinC;
        }
        if (f === 'top') return rgb(0x2a1a10);
        return y < 3 ? rgb(0x2a1a10) : y === 3 && f !== 'back' ? rgb(0x101014) : skinC;
      });
      P.fill('body', (x, y, w, h, f) => {
        if (f === 'front' && y >= 7 && y <= 9 && x >= 1 && x <= 6) return rgb(0x5a30a8);
        if (f === 'front' && y <= 3 && (x === 3 || x === 4) && y > 0) return rgb(0xf0f0f0);
        return hood;
      });
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : hood));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? (x % 2 ? rgb(0xf4f4f4) : rgb(0xd82828)) : (x + y) % 5 === 0 ? rgb(0x4a5a8a) : rgb(0x3a4a78)));
    },
  },
];

// Villager clothes (not offered in the skin picker): one per profession, all with the big nose.
function villagerSkin(key, name, robe, trim, extras, hat) {
  const nose = { part: 'head', box: [-1, 24.6, 4, 1, 28.6, 6.2], color: 0xb07a58 };
  return {
    key: 'v_' + key, name, icon: '', hidden: true, villager: key,
    extras: [nose, ...(extras || [])],
    paint(P) {
      const skinC = rgb(0xc08a64), brow = rgb(0x3a2818), r = rgb(robe), t = rgb(trim);
      P.fill('head', (x, y, w, h, f) => {
        if (f === 'front') {
          if (y === 2 && x >= 1 && x <= 6) return brow;
          if (y === 3 && (x === 2 || x === 5)) return rgb(0x2a7a3a);
          if (y === 3 && (x === 1 || x === 6)) return rgb(0xf0f0ea);
          if (y === 6 && x >= 3 && x <= 4) return rgb(0x7a4a34);
          return skinC;
        }
        if (hat && (f === 'top' || y < 2)) return rgb(hat);
        if (f === 'top' || (f === 'back' && y < 6) || ((f === 'left' || f === 'right') && y < 3)) return brow;
        return skinC;
      });
      P.fill('body', (x, y, w, h, f) => (y === 8 ? t : f === 'front' && x >= 3 && x <= 4 && y < 8 ? shadec(r, 0.85) : r));
      P.fill('arm', (x, y, w, h) => (y >= h - 3 ? skinC : y === h - 4 ? t : r));
      P.fill('leg', (x, y, w, h) => (y >= h - 2 ? rgb(0x3a2a1c) : shadec(r, 0.92)));
    },
  };
}
SKINS.push(
  villagerSkin('farmer', 'Farmer', 0x8a6a3a, 0xc8a050, [
    { part: 'head', box: [-6, 31.6, -6, 6, 32.4, 6], color: 0xd8b860 }, { part: 'head', box: [-4.4, 32.4, -4.4, 4.4, 34.6, 4.4], color: 0xd0ae54 },
  ]),
  villagerSkin('fisher', 'Fisher', 0x3a5a7a, 0xe0c030, [
    { part: 'head', box: [-5.2, 31.4, -6, 5.2, 33.2, 5.2], color: 0xf0c020 }, { part: 'body', box: [-4.2, 12.5, -2.3, 4.2, 20, 2.3], color: 0xf0c020 },
  ]),
  villagerSkin('smith', 'Blacksmith', 0x4a3a30, 0x707070, [
    { part: 'body', box: [-3.4, 12.4, 2, 3.4, 23, 2.6], color: 0x26262a }, { part: 'head', box: [-4.4, 29, 4, 4.4, 29.6, 4.3], color: 0x303034 },
  ], 0x2a2a2a),
  villagerSkin('librarian', 'Librarian', 0xe8e4d8, 0xb03030, [
    { part: 'head', box: [-3.4, 27.4, 4.1, 3.4, 28.1, 4.4], color: 0x2a2a2a }, { part: 'head', box: [-4.4, 31.4, -4.4, 4.4, 33, 4.4], color: 0xb03030 },
  ]),
  villagerSkin('cleric', 'Cleric', 0x6a3a8a, 0xe0c040, [
    { part: 'head', box: [-4.5, 24.5, -4.6, 4.5, 32.5, -3.9], color: 0x6a3a8a }, { part: 'body', box: [-1, 18, 2, 1, 22, 2.4], color: 0xe0c040, glow: true },
  ], 0x6a3a8a),
  villagerSkin('mason', 'Mason', 0x3a4a8a, 0x9a9a9a, [
    { part: 'head', box: [-4.6, 31.4, -4.6, 4.6, 32.6, 4.6], color: 0x8a8a8a }, { part: 'body', box: [-3.4, 14, 2, 3.4, 20, 2.6], color: 0x9a7040 },
  ]),
  villagerSkin('shepherd', 'Shepherd', 0x4a7a3a, 0xf0f0f0, [
    { part: 'head', box: [-4.6, 31.4, -4.6, 4.6, 33.4, 4.6], color: 0xeeeeea },
  ]),
);
const VILLAGER_SKIN = {};
SKINS.forEach((sk, i) => { if (sk.villager) VILLAGER_SKIN[sk.villager] = i; });

// atlas offset of skin i from the avatar's own slot
function skinOffset(i) {
  if (!i) return [0, 0];
  const s = SKIN_SLOT0 + i - 1, a = MOB_SKIN_SLOT.avatar;
  return [(s % 4 - a % 4) * SKIN_W, (Math.floor(s / 4) - Math.floor(a / 4)) * SKIN_H];
}

function paintPlayerSkins(px, rng) {
  const base = (key) => MOB_MODELS.avatar.find((p) => p.id === key || p.uv === key).faces;
  SKINS.forEach((sk, i) => {
    if (!i) return;
    const [dx, dy] = skinOffset(i);
    const F = (key) => { const f = base(key), o = {}; for (const k in f) o[k] = [f[k][0] + dx, f[k][1] + dy, f[k][2], f[k][3]]; return o; };
    sk.paint({
      F,
      fill(key, fn) {
        const f = F(key);
        for (const k of ['top', 'bottom', 'left', 'front', 'right', 'back']) {
          const r = f[k];
          for (let y = 0; y < r[3]; y++) for (let x = 0; x < r[2]; x++) {
            const c = fn(x, y, r[2], r[3], k);
            if (c) px(r[0] + x, r[1] + y, c, 0.94 + rng() * 0.08);
          }
        }
      },
    });
    for (const e of sk.extras || []) e.rgb = c01(e.color);
  });
}

// 40px portrait of a skin's face for the picker
function skinPortrait(i, size = 40) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  if (typeof SKIN_ATLAS === 'undefined' || !SKIN_ATLAS) return cv;
  const f = MOB_MODELS.avatar.find((p) => p.id === 'head').faces.front;
  const [dx, dy] = skinOffset(i);
  const g = cv.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(SKIN_ATLAS, f[0] + dx, f[1] + dy, f[2], f[3], 0, 0, size, size);
  return cv;
}
