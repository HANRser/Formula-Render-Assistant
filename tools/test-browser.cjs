'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end('<!doctype html><html><body><p id="sample">公式 <b id="math">$E=mc^2$</b> 完成</p></body></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let context;
  try {
    context = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(root, '.test-browser-profile-')), {
      headless: true, executablePath: process.env.CHROMIUM_PATH,
      args: ['--disable-extensions-except=' + path.join(root, 'extension'), '--load-extension=' + path.join(root, 'extension')]
    });
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto(`chrome-extension://${id}/console.html`);
    await page.locator('#btn-sample').click();
    assert(await page.locator('#output .katex').count() >= 5, 'console renders formulas under extension CSP');
    await page.goto(`chrome-extension://${id}/guide.html`);
    await page.waitForFunction(() => document.querySelector('#bm-link').href.startsWith('javascript:'));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForTimeout(500);
    const original = await page.locator('#sample').innerHTML();
    await page.evaluate(() => {
      const range = document.createRange(); const node = document.querySelector('#math').firstChild;
      range.setStart(node, 0); range.setEnd(node, node.length);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.locator('.fra-bubble.fra-show button').first().click();
    await page.locator('.fra-card.fra-show .katex').waitFor();
    await page.locator('.fra-card').getByRole('button', { name: '原位替换' }).click();
    await page.locator('#math .katex').waitFor();
    await page.getByRole('button', { name: '✕ 撤销' }).click();
    assert.equal(await page.locator('#sample').innerHTML(), original, 'undo restores original markup');
    // Reproduce a dynamically inserted chat answer with missing math delimiters.
    await page.evaluate(() => {
      document.querySelector('#math').textContent = 'x = \\int_0^x 1 , dt = \\int_0^\\infty I(x > t) , dt\n]';
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#math'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.locator('.fra-bubble.fra-show button').first().click();
    await page.locator('.fra-card.fra-show .katex').waitFor();
    assert.equal(await page.locator('.fra-card .fra-fallback').count(), 0, 'bare chat formula actually renders');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { document.querySelector('#math').textContent = '这里的 \\int 表示积分'; });
    await page.waitForTimeout(250);
    assert.equal(await page.locator('.fra-bubble.fra-show').count(), 0, 'ordinary prose does not show bubble');
    // Host-page CSS and scrolling containers must not hide or move our controls.
    await page.evaluate(() => {
      const style = document.createElement('style');
      style.textContent = 'body{position:relative;transform:translateY(180px);overflow:hidden} .fra-bubble,.fra-card{display:none!important} button{visibility:hidden!important}';
      document.head.appendChild(style);
      document.querySelector('#math').textContent = '\\frac{a}{b}';
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#math'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.locator('.fra-bubble.fra-show button').first().click();
    await page.locator('.fra-card.fra-show .katex').waitFor();
    const bounds = await page.locator('.fra-card').boundingBox();
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= page.viewportSize().width, 'UI is in viewport despite body transform');
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const host = Array.from(document.documentElement.children).find(n => n.shadowRoot);
      host.remove();
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#math'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.locator('.fra-bubble.fra-show button').first().click();
    await page.locator('.fra-card.fra-show .katex').waitFor();
    // Probe actual extension background routing, including a selected child frame.
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.evaluate(() => {
      const frame = document.createElement('iframe'); frame.src = '/child'; document.body.appendChild(frame);
    });
    await page.frameLocator('iframe').locator('#math').waitFor();
    await page.frames()[1].evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('#math'));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    });
    await page.bringToFront();
    const status = await worker.evaluate(() => activePage('FRA_STATUS_ACTIVE'));
    assert(status.connected && status.count === 1 && status.version === '1.0.2', JSON.stringify(status));
    const render = await worker.evaluate(() => activePage('FRA_RENDER_ACTIVE'));
    assert.equal(render.ok, true);
    await page.frameLocator('iframe').locator('.fra-card.fra-show .katex').waitFor();
    const repaired = await worker.evaluate(() => activePage('FRA_REPAIR_ACTIVE'));
    assert.equal(repaired.connected, true);
    assert.equal(await page.frameLocator('iframe').locator('.fra-card').count(), 1, 'repair is idempotent');
    // Standalone userscript must include its own engine and fonts.
    const standalone = await context.newPage();
    await standalone.goto('about:blank');
    await standalone.addScriptTag({ path: path.join(root, 'userscript/formula-render.user.js') });
    assert(await standalone.evaluate(() => !!window.fraCore.detectKatex()), 'userscript engine exists');
    assert.deepEqual(errors, [], 'no browser JS/CSP errors');
    console.log('PASS: MV3 service worker, console, guide, selection preview, replacement, undo, DeepSeek screenshot reproduction, standalone userscript');
  } finally {
    if (context) await context.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
