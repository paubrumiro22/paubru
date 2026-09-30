'use strict';
// The name boards on the squares of the towns in the themed places (structures.js regionTown):
// a painted wooden board per town, with its emblem, its name and what kind of place it is.

{
  const PAL = {
    beach: ['#1e88c9', '#f6e3b0'], meadow: ['#5b9b3b', '#fff4d6'], volcano: ['#3b3634', '#ffb36b'], forest: ['#2f5d34', '#e9f2d8'],
    peaks: ['#2d4f7a', '#ffffff'], islands: ['#0f6f8a', '#fff1c7'], canyon: ['#a4492a', '#ffe7c2'], oasis: ['#c9892f', '#fff6e0'],
  };
  for (const [key, T] of Object.entries(REGION_TOWNS)) {
    const [bg, fg] = PAL[key] || ['#6b4a2a', '#fff'];
    PIC_BUILTIN['town_' + key] = { w: 3, h: 2, draw(g, W, H) {
      // planks
      for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#8a5a32' : '#7a4f2b'; g.fillRect(0, i * H / 4, W, H / 4); }
      g.fillStyle = bg; g.fillRect(W * 0.05, H * 0.08, W * 0.9, H * 0.84);
      g.strokeStyle = fg; g.lineWidth = H * 0.025; g.strokeRect(W * 0.08, H * 0.13, W * 0.84, H * 0.74);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${H * 0.28}px serif`; g.fillText(T.icon, W * 0.5, H * 0.3);
      g.fillStyle = fg;
      let fs = H * 0.2; g.font = `900 ${fs}px Georgia, serif`;
      while (g.measureText(T.name).width > W * 0.78 && fs > 8) { fs -= 1; g.font = `900 ${fs}px Georgia, serif`; }
      g.fillText(T.name, W * 0.5, H * 0.58);
      g.globalAlpha = 0.85; g.font = `italic 600 ${H * 0.09}px Georgia, serif`; g.fillText(T.what, W * 0.5, H * 0.76); g.globalAlpha = 1;
    } };
  }
}
