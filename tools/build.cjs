/**
 * build.cjs — 生成各安装形态的产物
 *  - extension/core-bridge.js      （core.js 的兼容副本，不重复加载）
 *  - webapp/                       （独立渲染台 + 演示页 + 安装引导页的公共资源）
 *  - userscript/formula-render.user.js
 *  - bookmarklet/formula-render.bookmarklet.txt
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXT = path.join(ROOT, 'extension');
const WEB = path.join(ROOT, 'webapp');
const UST = path.join(ROOT, 'userscript');
const BML = path.join(ROOT, 'bookmarklet');
require('./icons.cjs');

function copy(src, destDir, rename) {
  fs.mkdirSync(destDir, { recursive: true });
  const dest = path.join(destDir, rename || path.basename(src));
  fs.copyFileSync(src, dest);
  console.log('copy', path.relative(ROOT, src), '->', path.relative(ROOT, dest));
}
function copyDir(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const f of fs.readdirSync(srcDir)) {
    const s = path.join(srcDir, f);
    if (fs.statSync(s).isFile()) copy(s, destDir);
  }
}
function write(dest, content) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
  console.log('write', path.relative(ROOT, dest), `(${(Buffer.byteLength(content) / 1024).toFixed(1)} KB)`);
}

const coreSrc = fs.readFileSync(path.join(EXT, 'core.js'), 'utf8');
const contentSrc = fs.readFileSync(path.join(EXT, 'content.js'), 'utf8');
const uiCss = fs.readFileSync(path.join(EXT, 'selection-ui.css'), 'utf8');
const katexSrc = fs.readFileSync(path.join(EXT, 'assets/katex.min.js'), 'utf8');
const katexCss = fs.readFileSync(path.join(EXT, 'assets/katex.min.css'), 'utf8').replace(/url\(([^)]+)\)/g, (match, url) => {
  const file = url.replace(/["']/g, '');
  const bytes = fs.readFileSync(path.join(EXT, 'assets', file));
  const type = path.extname(file).slice(1);
  return `url(data:font/${type};base64,${bytes.toString('base64')})`;
});

/* 1. 扩展桥接文件 */
write(path.join(EXT, 'core-bridge.js'), coreSrc);

/* 2. webapp 公共资源 */
copy(path.join(EXT, 'assets', 'katex.min.js'), path.join(WEB, 'assets'));
copy(path.join(EXT, 'assets', 'katex.min.css'), path.join(WEB, 'assets'));
copyDir(path.join(EXT, 'assets', 'fonts'), path.join(WEB, 'assets', 'fonts'));
copy(path.join(EXT, 'core.js'), WEB);
copy(path.join(EXT, 'content.js'), WEB);
copy(path.join(EXT, 'selection-ui.css'), WEB);

/* 3. 用户脚本 */
const userscript = `// ==UserScript==
// @name         公式渲染助手 (LaTeX/Markdown 选中渲染)
// @name:en      Formula Render Assistant
// @namespace    fra.local
// @version      1.0.2
// @description  在任意网页选中 LaTeX/Markdown 公式代码，点击"∑ 渲染"立即变成可读公式；支持原位替换与撤销。选中后快捷键 Alt+R 也可。
// @description:en  Select LaTeX/Markdown math on any page, click the floating "∑ Render" button to turn it into readable formulas.
// @author       渲染小工具
// @match        *://*/*
// @exclude      https://chrome.google.com/*
// @exclude      https://chromewebstore.google.com/*
// @run-at       document-idle
// @all-frames   true
// @grant        none
// @license      MIT
// ==/UserScript==
(function () {
  'use strict';
  if (window.__fraUserscriptInit) return;
  window.__fraUserscriptInit = true;
  var style = document.createElement('style');
  style.textContent = ${JSON.stringify(katexCss + '\n' + uiCss)};
  (document.head || document.documentElement).appendChild(style);
  ${katexSrc}
  ${coreSrc}
  ${contentSrc}
})();
`;
write(path.join(UST, 'formula-render.user.js'), userscript);

/* 4. 书签脚本（bookmarklet） */
const katexCssUrl = 'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css';
const bookmarkletSource = `(function(){
'use strict';
if(window.__fraBookmarklet){window.__fraBookmarklet();return;}
window.__fraBookmarklet=function(){window.dispatchEvent(new CustomEvent('fra-open-renderer'));};
var s=document.createElement('style');s.textContent=${JSON.stringify(uiCss)};document.head.appendChild(s);
var k=document.createElement('link');k.rel='stylesheet';k.href=${JSON.stringify(katexCssUrl)};document.head.appendChild(k);
var i=document.createElement('script');i.src='https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js';
i.onload=function(){ ${coreSrc} ${contentSrc} window.dispatchEvent(new Event('fra-open-renderer')); };
document.head.appendChild(i);
})();`;
const bookmarklet = 'javascript:' + encodeURIComponent(bookmarkletSource);
write(path.join(BML, 'formula-render.bookmarklet.txt'), bookmarklet + '\n');
write(path.join(WEB, 'bm', 'bookmarklet.txt'), bookmarklet);
// Extension pages cannot execute inline JavaScript under MV3 CSP.
for (const name of ['console', 'guide', 'demo']) {
  let html = fs.readFileSync(path.join(WEB, name + '.html'), 'utf8');
  let index = 0;
  html = html.replace(/<script>([\s\S]*?)<\/script>/g, (_, source) => {
    const file = `${name}-page-${++index}.js`;
    write(path.join(EXT, file), source);
    return `<script src="${file}"></script>`;
  });
  write(path.join(EXT, name + '.html'), html);
}
write(path.join(EXT, 'bm', 'bookmarklet.txt'), bookmarklet);
console.log('bookmarklet length:', bookmarklet.length);

console.log('BUILD OK');
