'use strict';
// Which edition this build is. 'full' is the school edition (the STUCOM district, the teachers,
// Camp Nou). 'cg' is the CrazyGames edition that build.js writes to dist/crazygames: the district
// becomes the big city of Blockton (skyscrapers, no real people), no Camp Nou, no external links,
// English everywhere, and the CrazyGames SDK (crazy.js). Loaded in the chunk workers too (data-w):
// the world generator reads it.
const EDITION = 'full';
const CG = EDITION === 'cg';
const CITY = CG ? 'Blockton' : 'STUCOM';
const SCHOOL = CG ? 'Blockton High' : 'STUCOM';
// a text for each edition: the school one (often Catalan) or the international one
const ED = (full, cg) => (CG ? cg : full);
