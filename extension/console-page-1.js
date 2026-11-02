
(function () {
  'use strict';
  var $input = document.getElementById('input');
  var $output = document.getElementById('output');
  var $stat = document.getElementById('stat');
  var $toast = document.getElementById('toast');
  var $auto = document.getElementById('auto');
  var toastTimer = null;

  function toast(msg) {
    $toast.textContent = msg;
    $toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $toast.classList.remove('show'); }, 1600);
  }

  var SAMPLE = '质能方程 $E = mc^2$ 是狭义相对论的核心。欧拉公式：\n\n$$e^{i\\pi} + 1 = 0$$\n\n求根公式：$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$，其中判别式 $\\Delta = b^2 - 4ac$。\n\n矩阵示例：\n\n$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}^{T} = \\begin{pmatrix} 1 & 3 \\\\ 2 & 4 \\end{pmatrix}$$\n\n多行推导：\n\n\\begin{aligned} (a+b)^2 &= a^2 + 2ab + b^2 \\\\ (a-b)^2 &= a^2 - 2ab + b^2 \\end{aligned}';

  document.getElementById('btn-sample').addEventListener('click', function () {
    $input.value = SAMPLE;
    render();
  });
  document.getElementById('btn-clear').addEventListener('click', function () {
    $input.value = '';
    $output.innerHTML = '<div class="placeholder">渲染结果会显示在这里。</div>';
    $stat.textContent = '';
    $input.focus();
  });

  function render() {
    var text = $input.value;
    if (!text.trim()) {
      $output.innerHTML = '<div class="placeholder">渲染结果会显示在这里。</div>';
      $stat.textContent = '';
      return;
    }
    var det = window.fraCore.extractFormulas(text);
    $output.textContent = '';
    $output.appendChild(window.fraCore.renderResult(det));
    $stat.textContent = det.count > 0 ? ('识别到 ' + det.count + ' 处公式') : '未识别到公式（会按原样显示）';
  }

  document.getElementById('btn-render').addEventListener('click', render);
  $input.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); render(); }
  });
  var autoTimer = null;
  $input.addEventListener('input', function () {
    if (!$auto.checked) return;
    clearTimeout(autoTimer);
    autoTimer = setTimeout(render, 300);
  });

  function selectOutput() {
    var range = document.createRange();
    range.selectNodeContents($output);
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return sel;
  }

  document.getElementById('btn-copy-rich').addEventListener('click', function () {
    if (!$output.firstChild) { toast('还没有可复制的内容'); return; }
    var sel = selectOutput();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) {}
    sel.removeAllRanges();
    toast(ok ? '已复制（富文本），可粘贴到 Word / 邮件' : '复制失败，请手动选择复制');
  });

  document.getElementById('btn-copy-mathml').addEventListener('click', function () {
    var det = window.fraCore.extractFormulas($input.value);
    if (det.count === 0) { toast('未识别到公式'); return; }
    var parts = [];
    det.segments.forEach(function (seg) {
      if (seg.kind === 'text') { parts.push(seg.text); return; }
      var mml = window.fraCore.formulaToMathML(seg.latex, seg.display);
      parts.push(mml || seg.text);
    });
    var text = parts.join('');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('MathML 已复制'); }, function () { toast('复制失败'); });
    } else {
      toast('当前浏览器不支持剪贴板 API');
    }
  });

  $input.focus();
})();
