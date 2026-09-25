'use strict';
// Bundles index.html + js/*.js into a single page for publishing (node build.js).
// The output has no <html>/<head>/<body> wrapper: the host adds that skeleton.

const fs = require('fs');
const path = require('path');

const root = __dirname;
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/i)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/i)[1];

// keep title, font links and styles; drop meta tags (the host provides charset/viewport)
const headKept = head
  .split('\n')
  .filter((line) => !/^\s*<meta\b/i.test(line))
  .join('\n')
  .trim();

const inlined = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(src + ' contains a closing script tag');
  return '<script>\n' + code.trim() + '\n</script>';
});

const out = headKept + '\n' + inlined.trim() + '\n';
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'blocklands.html');
fs.writeFileSync(file, out);
console.log('wrote', path.relative(root, file), (out.length / 1024).toFixed(1) + ' KB');
