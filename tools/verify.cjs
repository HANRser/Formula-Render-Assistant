'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
function exists(file) { assert(fs.statSync(path.join(ext, file)).size > 0, file); }
Object.values(manifest.icons).forEach(exists);
exists(manifest.action.default_popup); exists(manifest.background.service_worker);
for (const script of manifest.content_scripts) [...script.js, ...script.css].forEach(exists);
for (const name of ['popup', 'console', 'guide', 'demo']) {
  const html = fs.readFileSync(path.join(ext, name + '.html'), 'utf8');
  assert(!/<script\s*>|\son\w+\s*=/i.test(html), name + ': inline script violates CSP');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
    if (!/^(?:https?:|javascript:)/.test(match[1])) exists(match[1]);
  }
}
const css = fs.readFileSync(path.join(ext, 'assets/katex.min.css'), 'utf8');
for (const m of css.matchAll(/url\(([^)]+)\)/g)) exists('assets/' + m[1]);
for (const dir of ['extension', 'webapp', 'userscript']) {
  for (const file of fs.readdirSync(path.join(root, dir)).filter(f => f.endsWith('.js'))) {
    new vm.Script(fs.readFileSync(path.join(root, dir, file), 'utf8'), { filename: file });
  }
}
const bookmarklet = fs.readFileSync(path.join(root, 'bookmarklet/formula-render.bookmarklet.txt'), 'utf8').trim();
new vm.Script(decodeURIComponent(bookmarklet.slice('javascript:'.length)));
const source = fs.readFileSync(path.join(ext, 'core.js'), 'utf8');
function OldRegExp(pattern, flags) {
  if (pattern.includes('(?<')) throw new SyntaxError('Simulated old browser');
  return new RegExp(pattern, flags);
}
const context = { RegExp: OldRegExp }; context.window = context;
vm.runInNewContext(source, context);
for (const text of ['前 $a_1$ 后 $b_2$ 结束', '\\begin{aligned} a &= b^2 \\end{aligned}']) {
  const result = context.fraCore.extractFormulas(text);
  assert.equal(result.count, text.startsWith('前') ? 2 : 1);
  assert.equal(result.segments.map(s => s.text).join(''), text);
}
console.log('PASS: extension assets, CSP, fonts, JavaScript, bookmarklet and legacy parser');
