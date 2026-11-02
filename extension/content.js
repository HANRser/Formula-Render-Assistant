/*!
 * 公式渲染助手 - 内容脚本 (content.js)
 * 选中文字 → 悬浮「渲染」按钮 → 浮层卡片渲染 / 原位替换渲染。
 * 依赖：KaTeX（assets/katex.min.js）、共享内核 core.js、样式 selection-ui.css。
 */
(function () {
  'use strict';

  if (window.__fraContentInit) return;

  var core = window.fraCore;
  if (!core) return;
  window.__fraContentInit = true;

  /* ------------------------------------------------------------------ *
   * 小工具                                                              *
   * ------------------------------------------------------------------ */

  var uiRoots = new Set();
  var uiHost = null, uiContainer = null;
  function mountUi(node) {
    if (!uiContainer) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        uiHost = document.createElement('div');
        uiHost.style.setProperty('all', 'initial', 'important');
        uiHost.style.setProperty('display', 'contents', 'important');
        uiRoots.add(uiHost);
        uiContainer = uiHost.attachShadow({ mode: 'open' });
        ['assets/katex.min.css', 'selection-ui.css'].forEach(function (file) {
          var link = document.createElement('link');
          link.rel = 'stylesheet'; link.href = chrome.runtime.getURL(file);
          link.onload = function () { if (bubble && bubble.classList.contains('fra-show')) showBubbleForSelection(); };
          uiContainer.appendChild(link);
        });
      } else { uiContainer = document.body || document.documentElement; }
    }
    if (uiHost && !uiHost.isConnected) document.documentElement.appendChild(uiHost);
    if (!node.isConnected) uiContainer.appendChild(node);
    return node;
  }
  function showUi(node) {
    mountUi(node);
    node.classList.add('fra-show');
    if (typeof node.showPopover === 'function') {
      node.setAttribute('popover', 'manual');
      node.style.margin = '0'; node.style.inset = 'auto';
      try { if (!node.matches(':popover-open')) node.showPopover(); } catch (e) {}
    }
  }
  function hideUi(node) {
    if (!node) return;
    node.classList.remove('fra-show');
    try { if (node.matches(':popover-open')) node.hidePopover(); } catch (e) {}
  }
  function isOurNode(t) {
    while (t) {
      if (uiRoots.has(t)) return true;
      if (t === document) return false;
      t = t.parentNode instanceof ShadowRoot ? t.parentNode.host : t.parentNode;
    }
    return false;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function pageX(v) { return v + window.scrollX; }
  function pageY(v) { return v + window.scrollY; }
  function viewportW() { return document.documentElement.clientWidth || window.innerWidth; }
  function viewportH() { return document.documentElement.clientHeight || window.innerHeight; }
  function pageW() { return Math.max(document.documentElement.scrollWidth, viewportW()); }

  var toastTimer = null, toastNode = null;
  function toast(msg, ms) {
    var t = toastNode;
    if (!t || !uiRoots.has(t)) {
      if (t && t.parentNode) t.parentNode.removeChild(t);
      t = el('div', 'fra-toast');
      toastNode = t;
      uiRoots.add(t);
      mountUi(t);
    }
    t.textContent = msg;
    t.classList.add('fra-show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('fra-show'); }, ms || 1600);
  }

  /* ------------------------------------------------------------------ *
   * 选区获取                                                            *
   * ------------------------------------------------------------------ */

  function currentSelectionText() {
    var sel = window.getSelection && window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return '';
    var text = '';
    try { text = sel.toString(); } catch (e) { text = ''; }
    return text || '';
  }

  var savedSelection = null;
  function captureSelection() {
    var sel = window.getSelection(), text = currentSelectionText();
    if (text && text.length <= 20000 && !inOurUi(sel.anchorNode)) {
      savedSelection = { text: text, range: sel.getRangeAt(0).cloneRange(), time: Date.now() };
    }
  }
  function usableSelectionText() {
    var text = currentSelectionText();
    if (text && !inOurUi(window.getSelection().anchorNode)) return text;
    if (savedSelection && Date.now() - savedSelection.time < 15000 && savedSelection.range.startContainer.isConnected && savedSelection.range.toString() === savedSelection.text) return savedSelection.text;
    return '';
  }
  window.__fraSelectionText = usableSelectionText;

  function selectionRect(sel) {
    var rect = null;
    for (var i = 0; i < sel.rangeCount; i++) {
      var r = sel.getRangeAt(i).getBoundingClientRect();
      if (r && (r.width > 0 || r.height > 0)) {
        if (!rect) rect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
        else {
          rect.left = Math.min(rect.left, r.left);
          rect.top = Math.min(rect.top, r.top);
          rect.right = Math.max(rect.right, r.right);
          rect.bottom = Math.max(rect.bottom, r.bottom);
          rect.width = rect.right - rect.left;
          rect.height = rect.bottom - rect.top;
        }
      }
    }
    if (!rect) {
      // 某些页面（尤其在 iframe/特殊元素中）拿不到 rect，退化为视口中间
      rect = { left: viewportW() / 2 - 60, top: 90, right: viewportW() / 2 + 60, bottom: 120, width: 120, height: 30 };
    }
    return rect;
  }

  /* ------------------------------------------------------------------ *
   * 悬浮按钮                                                            *
   * ------------------------------------------------------------------ */

  var bubble = null;

  function ensureBubble() {
    if (bubble && uiRoots.has(bubble)) return mountUi(bubble);
    if (bubble && bubble.parentNode) bubble.parentNode.removeChild(bubble);
    bubble = el('div', 'fra-bubble');
    uiRoots.add(bubble);

    var btnRender = el('button', null);
    btnRender.type = 'button';
    var icon = el('span', 'fra-bubble-icon', '∑');
    btnRender.appendChild(icon);
    btnRender.appendChild(document.createTextNode('渲染'));
    btnRender.addEventListener('click', function (e) {
      e.stopPropagation();
      openCardFromSelection();
    });

    var btnInline = el('button', null, '原位替换');
    btnInline.type = 'button';
    btnInline.title = '把选中内容直接替换为渲染后的公式';
    btnInline.addEventListener('click', function (e) {
      e.stopPropagation();
      replaceSelectionInPlace();
    });

    var btnClose = el('button', 'fra-bubble-close', '✕');
    btnClose.type = 'button';
    btnClose.title = '关闭';
    btnClose.addEventListener('click', function (e) {
      e.stopPropagation();
      hideBubble();
    });

    bubble.appendChild(btnRender);
    bubble.appendChild(btnInline);
    bubble.appendChild(btnClose);

    // pointerdown preventDefault：避免点击按钮时丢失页面选区 / 焦点
    bubble.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); });
    mountUi(bubble);
    return bubble;
  }

  function placeBubbleNear(rect) {
    var b = ensureBubble();
    b.style.setProperty('position', 'fixed', 'important');
    showUi(b);
    var bw = b.offsetWidth, bh = b.offsetHeight;
    var left = rect.left + rect.width / 2 - bw / 2;
    left = clamp(left, 6, Math.max(6, viewportW() - bw - 6));
    var top = rect.top - bh - 8;
    if (top < 6) {
      top = rect.bottom + 8;
    }
    top = clamp(top, 6, Math.max(6, viewportH() - bh - 6));
    b.style.left = Math.round(left) + 'px';
    b.style.top = Math.round(top) + 'px';
  }

  function showBubbleForSelection() {
    captureSelection();
    var text = currentSelectionText();
    if (!text || text.length < 2) { hideBubble(); return false; }
    if (text.length > 20000) { hideBubble(); return false; }
    var det = core.extractFormulas(text);
    var sel = window.getSelection();
    if (!sel) { hideBubble(); return false; }
    var rect = selectionRect(sel);
    if (det.count > 0) {
      placeBubbleNear(rect);
    } else {
      hideBubble();
      return false;
    }
    return true;
  }

  function hideBubble() {
    hideUi(bubble);
  }

  /* ------------------------------------------------------------------ *
   * 渲染卡片                                                            *
   * ------------------------------------------------------------------ */

  var card = null;
  var cardCtx = null; // { latex: string, anchor: {x,y} }

  function ensureCard() {
    if (card && uiRoots.has(card)) return mountUi(card);
    if (card && card.parentNode) card.parentNode.removeChild(card);
    card = el('div', 'fra-card');
    uiRoots.add(card);
    card.addEventListener('pointerdown', function (e) {
      if (e.target.closest('button')) e.preventDefault();
      e.stopPropagation();
    });
    mountUi(card);
    return card;
  }

  function buildCard(det, rawText) {
    var c = ensureCard();
    c.textContent = '';

    var head = el('div', 'fra-card-head');
    var title = el('div', 'fra-card-title');
    title.appendChild(document.createTextNode('∑ 已渲染 '));
    var cnt = el('span', 'fra-card-count', det.count + ' 处公式');
    title.appendChild(cnt);
    head.appendChild(title);

    var btnInline = el('button', 'fra-card-btn', '原位替换');
    btnInline.type = 'button';
    btnInline.title = '关闭卡片，并把选中文字原地替换为公式';
    btnInline.addEventListener('click', function () {
      if (cardCtx && cardCtx.range && cardCtx.range.startContainer.isConnected) {
        var selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(cardCtx.range);
      }
      var ok = replaceSelectionInPlace();
      if (ok) hideCard();
      if (!ok) toast('原位替换失败（选区可能已失效），请在卡片中复制结果');
    });
    head.appendChild(btnInline);

    var btnCopy = el('button', 'fra-card-btn', '复制公式');
    btnCopy.type = 'button';
    btnCopy.title = '把渲染好的公式以富文本复制到剪贴板（可粘贴到 Word / 邮件）';
    btnCopy.addEventListener('click', function () {
      copyRendered(c);
    });
    head.appendChild(btnCopy);

    var btnClose = el('button', 'fra-card-btn', '关闭');
    btnClose.type = 'button';
    btnClose.addEventListener('click', hideCard);
    head.appendChild(btnClose);

    var body = el('div', 'fra-card-body');
    body.appendChild(core.renderResult(det));

    var foot = el('div', 'fra-card-foot', '提示：无法解析的片段会以灰色代码样式原样保留；点击卡片外任意处可关闭。');
    foot.textContent = '提示：无法解析的片段会原样保留为代码样式 · 点击卡片外可关闭';

    c.appendChild(head);
    c.appendChild(body);
    c.appendChild(foot);
    return c;
  }

  function openCardFromSelection() {
    var text = usableSelectionText();
    if (!text) { toast('请先选中包含公式的文字'); return false; }
    if (text.length > 20000) { toast('请将选区控制在 20000 字以内'); return false; }
    var det = core.extractFormulas(text);
    if (det.count === 0) {
      toast('选区里没有识别到 LaTeX / Markdown 公式');
      hideBubble();
      return false;
    }
    var sel = window.getSelection();
    if ((!currentSelectionText() || inOurUi(sel.anchorNode)) && savedSelection && text === savedSelection.text) {
      sel.removeAllRanges(); sel.addRange(savedSelection.range);
    }
    cardCtx = { range: sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null };
    var rect = sel ? selectionRect(sel) : null;
    var anchor = rect
      ? { x: rect.left, y: rect.bottom }
      : { x: viewportW() / 2 - 100, y: 120 };

    var c = buildCard(det, text);
    c.style.setProperty('position', 'fixed', 'important');
    showUi(c);
    var cw = c.offsetWidth, ch = c.offsetHeight;
    var left = clamp(anchor.x - 40, 10, Math.max(10, viewportW() - cw - 10));
    var top = anchor.y + 10;
    if (top + ch > viewportH() - 10) {
      top = Math.max(10, anchor.y - ch - 40);
    }
    c.style.left = Math.round(left) + 'px';
    c.style.top = Math.round(top) + 'px';
    hideBubble();
    return true;
  }

  function hideCard() {
    hideUi(card);
  }

  /* ------------------------------------------------------------------ *
   * 复制为富文本公式                                                     *
   * ------------------------------------------------------------------ */

  function copyRendered(cardEl) {
    var body = cardEl ? cardEl.querySelector('.fra-card-body') : null;
    if (!body) return;
    var area = el('div', 'fra-copy-area');
    area.appendChild(body.cloneNode(true));
    document.body.appendChild(area);
    var range = document.createRange();
    range.selectNodeContents(area);
    var sel = window.getSelection();
    var saved = [];
    for (var i = 0; i < sel.rangeCount; i++) saved.push(sel.getRangeAt(i));
    sel.removeAllRanges();
    sel.addRange(range);
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    sel.removeAllRanges();
    saved.forEach(function (r) { try { sel.addRange(r); } catch (e) {} });
    if (area.parentNode) area.parentNode.removeChild(area);
    toast(ok ? '已复制，可直接粘贴到 Word / 邮件' : '复制失败，请手动选择卡片内容复制');
  }

  /* ------------------------------------------------------------------ *
   * 原位替换                                                            *
   * ------------------------------------------------------------------ */

  function replaceSelectionInPlace() {
    var sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      toast('请先选中包含公式的文字');
      return false;
    }
    var text = '';
    try { text = sel.toString(); } catch (e) {}
    if (!text) return false;

    var det = core.extractFormulas(text);
    if (det.count === 0) { toast('选区里没有识别到公式'); return false; }

    var range = sel.getRangeAt(0);
    var parent = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    if (parent && parent.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) {
      toast('编辑区域请使用预览和复制，避免影响正在输入的内容'); return false;
    }
    // A single containing element lets undo restore the exact original nodes.
    if (range.startContainer !== range.endContainer) {
      toast('跨节点选区请使用预览和复制；原位替换需在同一段文字内'); return false;
    }
    var wrapper = el('span', 'fra-rendered-group');
    wrapper.appendChild(core.renderResult(det));
    var originalNodes;
    try {
      sel.removeAllRanges();
      originalNodes = range.extractContents();
      range.insertNode(wrapper);
      var chip = el('span', 'fra-inline-chip');
      var chipBtn = el('button', null, '✕ 撤销');
      chipBtn.type = 'button';
      chipBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        undoInline(wrapper, originalNodes, chip);
      });
      chip.appendChild(chipBtn);
      var r = range.getBoundingClientRect();
      var vx = clamp(r.left, 8, viewportW() - 150);
      var vy = r.bottom + 6;
      if (vy > viewportH() - 50) vy = Math.max(8, r.top - 40);
      chip.style.left = pageX(vx) + 'px';
      chip.style.top = pageY(vy) + 'px';
      chip.classList.add('fra-show');
      uiRoots.add(chip);
      (document.body || document.documentElement).appendChild(chip);
      return true;
    } catch (e) {
      try { toast('该区域不可编辑，无法原位替换，可使用浮层卡片'); } catch (e2) {}
      return false;
    }
  }

  function dismissChip(chip) {
    if (!chip) return;
    if (chip.__fraTimer) clearTimeout(chip.__fraTimer);
    chip.classList.remove('fra-show');
    setTimeout(function () {
      if (chip.parentNode) chip.parentNode.removeChild(chip);
      uiRoots.delete(chip);
    }, 250);
  }

  function undoInline(wrapper, originalNodes, chip) {
    dismissChip(chip);
    try {
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.replaceChild(originalNodes, wrapper);
      } else {
        toast('撤销失败：页面结构已变化');
      }
    } catch (e) {
      toast('撤销失败：页面结构已变化');
    }
  }

  /* ------------------------------------------------------------------ *
   * 事件接线                                                            *
   * ------------------------------------------------------------------ */

  var lastMouse = { x: 0, y: 0 };
  document.addEventListener('mousemove', function (e) { lastMouse.x = e.clientX; lastMouse.y = e.clientY; }, true);

  function inOurUi(target) {
    return target && isOurNode(target.nodeType === 1 ? target : target.parentNode);
  }

  document.addEventListener('pointerdown', function (e) {
    if (inOurUi(e.target)) return;
    savedSelection = null;
    hideBubble();
    hideCard();
  }, true);

  document.addEventListener('dblclick', function (e) {
    if (inOurUi(e.target)) return;
    // 双击选中的词也尝试检测
    setTimeout(function () {
      if (currentSelectionText()) showBubbleForSelection();
    }, 0);
  }, true);

  var mouseupTimer = null;
  document.addEventListener('mouseup', function (e) {
    if (inOurUi(e.target)) return;
    captureSelection();
    clearTimeout(mouseupTimer);
    mouseupTimer = setTimeout(function () {
      showBubbleForSelection();
    }, 60);
  }, true);

  document.addEventListener('keyup', function (e) {
    if (e.key === 'Shift' || e.key === 'Control') {
      setTimeout(function () {
        if (currentSelectionText()) showBubbleForSelection();
      }, 60);
    }
  }, true);

  // 键盘快捷键：Alt+R 渲染当前选区
  document.addEventListener('keydown', function (e) {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'r' || e.key === 'R')) {
      var text = currentSelectionText();
      if (text) { e.preventDefault(); openCardFromSelection(); }
    }
    if (e.key === 'Escape') { savedSelection = null; hideBubble(); hideCard(); }
  }, true);

  window.addEventListener('scroll', function () { hideBubble(); }, { passive: true });
  window.addEventListener('resize', function () { hideBubble(); }, { passive: true });
  document.addEventListener('selectionchange', function () {
    captureSelection();
    clearTimeout(mouseupTimer);
    mouseupTimer = setTimeout(function () {
      var sel = window.getSelection();
      if (sel && !inOurUi(sel.anchorNode)) showBubbleForSelection();
    }, 120);
  });
  window.addEventListener('fra-open-renderer', openCardFromSelection);

  // 来自 popup / background 的消息
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      try {
        if (!msg || typeof msg !== 'object') return;
        if (msg.type === 'FRA_PING') { sendResponse({ ok: true, version: core.version }); return; }
        if (msg.type === 'FRA_RENDER_SELECTION') {
          var text = usableSelectionText();
          if (!text) { sendResponse({ ok: false, error: '未读取到选区，请重新选中公式' }); return; }
          if (!core.extractFormulas(text).count) { sendResponse({ ok: false, error: '已读取 ' + text.length + ' 字，但未识别出公式。可打开渲染台检查原文。' }); return; }
          sendResponse({ ok: openCardFromSelection() });
          return;
        }
      } catch (e) {}
    });
  }
})();
