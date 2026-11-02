'use strict';
var statusEl = document.getElementById('status');
function run(type) {
  statusEl.textContent = '正在检查当前页…';
  chrome.runtime.sendMessage({ type }, function (res) {
    var error = chrome.runtime.lastError;
    if (error || !res) { statusEl.textContent = '扩展连接失败，请重新加载扩展并刷新网页。'; return; }
    if (!res.ok) { statusEl.textContent = res.error || '当前页未连接，请点击“连接 / 修复当前页”。'; return; }
    if (type === 'FRA_RENDER_ACTIVE') { window.close(); return; }
    statusEl.textContent = '已连接 v' + res.version + ' · 选中 ' + res.length + ' 字 · 识别 ' + res.count + ' 处公式';
  });
}
document.getElementById('btn-render').addEventListener('click', function () { run('FRA_RENDER_ACTIVE'); });
document.getElementById('btn-repair').addEventListener('click', function () { run('FRA_REPAIR_ACTIVE'); });
document.getElementById('btn-console').addEventListener('click', function () {
  chrome.tabs.create({ url: chrome.runtime.getURL('console.html') }); window.close();
});
run('FRA_STATUS_ACTIVE');
