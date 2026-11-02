'use strict';
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('guide.html') });
});
async function inspect(tabId) {
  var frames = await chrome.scripting.executeScript({ target: { tabId, allFrames: true }, func: function () {
    var core = window.fraCore, sel = window.getSelection(), text = window.__fraSelectionText ? window.__fraSelectionText() : (sel ? sel.toString() : '');
    return { connected: !!(core && window.__fraContentInit), version: core ? core.version : '',
      length: text.length, count: core && text.length <= 20000 ? core.extractFormulas(text).count : 0 };
  } });
  await Promise.all(frames.map(async function (frame) {
    if (!frame.result.connected) return;
    try {
      var reply = await chrome.tabs.sendMessage(tabId, { type: 'FRA_PING' }, { frameId: frame.frameId });
      if (!reply || !reply.ok) throw new Error('No listener');
      frame.result.version = reply.version;
    } catch (error) { frame.result.connected = false; frame.result.stale = true; }
  }));
  return frames;
}
async function activePage(type) {
  var tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tabs[0]) return { ok: false, error: '没有活动网页' };
  var id = tabs[0].id, frames = await inspect(id), version = chrome.runtime.getManifest().version;
  if (frames.some(f => f.result.stale)) {
    return { ok: false, error: '网页残留的脚本已失去连接，请刷新网页后重试' };
  }
  if (frames.some(f => f.result.connected && f.result.version !== version)) {
    return { ok: false, error: '网页仍运行旧版脚本，请刷新此网页', version };
  }
  if (type === 'FRA_REPAIR_ACTIVE' || (type === 'FRA_RENDER_ACTIVE' && frames.some(f => !f.result.connected))) {
    await chrome.scripting.insertCSS({ target: { tabId: id, allFrames: true }, files: ['assets/katex.min.css', 'selection-ui.css'] });
    await chrome.scripting.executeScript({ target: { tabId: id, allFrames: true }, files: ['assets/katex.min.js', 'core.js', 'content.js'] });
    frames = await inspect(id);
  }
  var selected = frames.find(f => f.result.length && f.result.count) || frames.find(f => f.result.length);
  var connected = frames.some(f => f.result.connected);
  if (type === 'FRA_RENDER_ACTIVE') {
    if (!selected) return { ok: false, error: '未读取到选中文字。请回到网页重新选中公式，再按 Alt+R 或点击渲染。' };
    return chrome.tabs.sendMessage(id, { type: 'FRA_RENDER_SELECTION' }, { frameId: selected.frameId });
  }
  return { ok: connected, connected, version, length: selected ? selected.result.length : 0, count: selected ? selected.result.count : 0 };
}
chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !/^FRA_(STATUS|REPAIR|RENDER)_ACTIVE$/.test(msg.type)) return;
  activePage(msg.type).then(sendResponse, function (error) {
    sendResponse({ ok: false, error: '无法连接当前页。请检查扩展的站点访问权限；设置页不支持，本地文件需允许文件网址访问。详情：' + error.message });
  });
  return true;
});
