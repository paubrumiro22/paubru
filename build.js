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

// attributes such as data-w (sources shared with the chunk workers) are kept
const inlined = body.replace(/<script src="([^"]+)"([^>]*)><\/script>/g, (_, src, attrs) => {
  const code = fs.readFileSync(path.join(root, src), 'utf8');
  if (/<\/script/i.test(code)) throw new Error(src + ' contains a closing script tag');
  return '<script' + attrs + '>\n' + code.trim() + '\n</script>';
});

// The host page may not declare a charset: keep the output pure ASCII.
const asciiJs = (code) => code.replace(/[^\x00-\x7f]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));
const asciiHtml = (html) => html.replace(/[\u0080-\uffff]/g, (c, i, str) => {
  const cp = str.codePointAt(i);
  if (cp >= 0xdc00 && cp <= 0xdfff) return '';
  return '&#x' + cp.toString(16) + ';';
});
const scripts = [];
let out = headKept + '\n' + inlined.trim() + '\n';
out = out.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g, (_, attrs, code) => { scripts.push(asciiJs(code)); return '<script' + attrs + '>@@SCRIPT' + (scripts.length - 1) + '@@</script>'; });
out = asciiHtml(out).replace(/@@SCRIPT(\d+)@@/g, (_, i) => scripts[Number(i)]);
fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
const file = path.join(root, 'dist', 'blocklands.html');
fs.writeFileSync(file, out);
console.log('wrote', path.relative(root, file), (out.length / 1024).toFixed(1) + ' KB');
