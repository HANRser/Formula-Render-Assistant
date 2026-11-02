/*!
 * 公式渲染助手 - 共享渲染内核 (core.js)
 * 同时服务于：浏览器扩展内容脚本 / 用户脚本 / 独立渲染台页面。
 * 职责：从纯文本中提取 LaTeX / Markdown 数学片段，并交给 KaTeX 渲染。
 * 无外部依赖（KaTeX 由宿主环境预先加载）。
 */
(function (global) {
  'use strict';

  var CORE_VERSION = '1.0.2';

  function detectKatex() {
    if (global.KaTeX && typeof global.KaTeX.render === 'function') return global.KaTeX;
    if (global.katex && typeof global.katex.render === 'function') return global.katex;
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 1. 文本切分：把一段文本拆成「普通文本 / 公式」片段                    *
   * ------------------------------------------------------------------ */

  // 需要整体按 display 模式处理的 LaTeX 环境
  var MATH_ENVS = [
    'align', 'align*', 'aligned', 'alignat', 'alignat*', 'alignedat',
    'equation', 'equation*', 'eqnarray', 'gather', 'gather*', 'gathered',
    'multline', 'multline*', 'split', 'cases', 'dcases', 'rcases',
    'matrix', 'bmatrix', 'Bmatrix', 'pmatrix', 'vmatrix', 'Vmatrix',
    'smallmatrix', 'array', 'darray', 'substack', 'aligned'
  ];
  var ENV_SOURCE = MATH_ENVS.map(function (e) { return e.replace('*', '\\*'); }).join('|');
  var ENV_BLOCK_TEST_RE = new RegExp('^\\\\begin\\{(' + ENV_SOURCE + ')\\}');

  // 代码围栏（``` 或 ~~~），先摘出来避免误渲染
  var FENCE_RE = /(```|~~~)[\s\S]*?\1|(```|~~~)[^\n]*$/;

  // 命名反向引用 (?<env>...\k<env>) 与 (?<!...) 反向预查在旧 Safari（<16.4）不可用：
  // 优先用完整版，构造失败则降级为无反向预查版本（识别稍宽松，但不会让脚本失效）。
  var TOKEN_RE = (function () {
    var full = [
      '(\\$\\$[\\s\\S]+?\\$\\$)',                    // $$...$$  display
      '(\\\\\\[[\\s\\S]*?\\\\\\])',                  // \[...\]  display
      '(\\\\begin\\{(?<env>' + ENV_SOURCE + ')\\}[\\s\\S]*?\\\\end\\{\\k<env>\\})', // \begin{env}...\end{env}
      '(`(?!`)[^`\\n]+?`(?!`))',                     // `...`    行内代码
      '((?<!\\\\)\\$(?!\\s)[^$\\n]+?(?<!\\s)\\$(?!\\d))', // $...$      inline
      '(\\\\\\((?:[^\\\\]|\\\\.)*?\\\\\\))'          // \(...\)  inline
    ].join('|');
    var degraded = [
      '(\\$\\$[\\s\\S]+?\\$\\$)',
      '(\\\\\\[[\\s\\S]*?\\\\\\])',
      '(\\\\begin\\{(' + ENV_SOURCE + ')\\}[\\s\\S]*?\\\\end\\{\\4\\})',
      '(`(?!`)[^`\\n]+?`(?!`))',
      '((?:^|[^\\\\])\\$(?!\\s)(?:[^$\\n](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d))',
      '(\\\\\\((?:[^\\\\]|\\\\.)*?\\\\\\))'
    ].join('|');
    try { return new RegExp(full, 'g'); }
    catch (e) { return new RegExp(degraded, 'g'); }
  })();

  function maskFences(text) {
    var fences = [];
    var masked = text.replace(/(```|~~~)[\s\S]*?\1/g, function (m) {
      fences.push(m);
      return '\u0000F' + (fences.length - 1) + '\u0000';
    });
    return { masked: masked, fences: fences };
  }

  function unmaskFences(segments, fences) {
    segments.forEach(function (seg) {
      if (seg.kind !== 'text') return;
      seg.text = seg.text.replace(/\u0000F(\d+)\u0000/g, function (m, i) {
        return fences[Number(i)] || m;
      });
      if (!seg.text) seg.dead = true;
    });
    return segments.filter(function (seg) { return !seg.dead; });
  }

  function detectDelimiters(s) {
    var t = String(s).trim();
    if (t.length < 2) return null;
    var body = null, display = false;

    if (t.slice(0, 2) === '$$' && t.slice(-2) === '$$' && t.length >= 5) {
      display = true; body = t.slice(2, -2);
    } else if (t.slice(0, 2) === '\\[' && t.slice(-2) === '\\]' && t.length >= 5) {
      display = true; body = t.slice(2, -2);
    } else if (t.slice(0, 2) === '\\(' && t.slice(-2) === '\\)' && t.length >= 5) {
      display = false; body = t.slice(2, -2);
    } else if (t.charAt(0) === '$' && t.charAt(t.length - 1) === '$' && t.length >= 3) {
      display = false; body = t.slice(1, -1);
    } else if (t.charAt(0) === '`' && t.charAt(t.length - 1) === '`' && t.length >= 3) {
      display = false; body = t.slice(1, -1);
    } else if (ENV_BLOCK_TEST_RE.test(t)) {
      display = true; body = t;
    } else {
      return null;
    }
    body = String(body).trim();
    if (!body) return null;
    return { latex: body, display: display };
  }

  function isLikelyLatex(s) {
    if (/\\[a-zA-Z]/.test(s)) return true;             // 命令：\frac \sum ...
    if (/[_^]/.test(s)) return true;                   // 上下标
    if (/[{}]/.test(s) && /[a-zA-Z]/.test(s)) return true;
    if (/(^|[^a-zA-Z])(alpha|beta|gamma|delta|pi|theta|lambda|mu|sigma|omega)([^a-zA-Z]|$)/i.test(s)) return false;
    return false;
  }

  // Chat pages can consume math delimiters while leaving the TeX body visible.
  // Require a known math command and reject prose/code to avoid noisy selection UI.
  function detectBareFormula(text) {
    var body = text.trim();
    if (!body || /[`$\u0000]|[a-zA-Z]:\\|https?:\/\//.test(body)) return null;
    body = body.replace(/^(?:\\\[|\\\()\s*/, '').replace(/\s*(?:\\\]|\\\))$/, '');
    // Only remove bare brackets on their own lines; preserve interval brackets.
    body = body.replace(/^\[\s*\r?\n/, '').replace(/\r?\n\s*\]$/, '').trim();
    if (!/\\(?:int|iint|iiint|oint|frac|dfrac|tfrac|sqrt|sum|prod|lim|infty|alpha|beta|gamma|delta|theta|lambda|mu|sigma|omega|pi|Delta|Sigma|Omega|partial|nabla|mathbb|mathbf|mathrm|left|right|begin|sin|cos|tan|log|ln|exp)(?![a-zA-Z])/.test(body)) return null;
    var remainder = body.replace(/\\(?:text|mathrm|mathbf|mathbb)\{[^{}]*\}/g, '')
      .replace(/\\[a-zA-Z]+/g, '');
    if (/[\u3400-\u9fff]|[a-zA-Z]{3,}|https?:|[;`]|:\\/.test(remainder)) return null;
    return { kind: 'formula', text: text, latex: body, display: true };
  }

  /**
   * 把文本切分为片段。
   * 返回 { kind: 'formulas'|'text', count, segments }
   * segment: { kind: 'text', text } 或 { kind: 'formula', text, latex, display }
   */
  function extractFormulas(text) {
    if (typeof text !== 'string' || !text) {
      return { kind: 'text', count: 0, segments: [{ kind: 'text', text: text == null ? '' : String(text) }] };
    }
    var masked = maskFences(text);
    var segments = [];
    var last = 0, m, count = 0;
    TOKEN_RE.lastIndex = 0;
    while ((m = TOKEN_RE.exec(masked.masked)) !== null) {
      if (m.index > last) {
        segments.push({ kind: 'text', text: masked.masked.slice(last, m.index) });
      }
      var raw = m[0];
      var det = detectDelimiters(raw);
      if (!det && raw.length > 2) {
        // 降级正则可能把 $ 前的一个字符一并匹配进来，这里拆回去
        var trimmed = raw.slice(1);
        var det2 = detectDelimiters(trimmed);
        if (det2) {
          segments.push({ kind: 'text', text: raw.charAt(0) });
          raw = trimmed;
          det = det2;
        }
      }
      if (det && (det.display || isLikelyLatex(det.latex))) {
        segments.push({ kind: 'formula', text: raw, latex: det.latex, display: det.display });
        count++;
      } else {
        segments.push({ kind: 'text', text: raw });
      }
      last = m.index + m[0].length;
      if (m.index === TOKEN_RE.lastIndex) TOKEN_RE.lastIndex++; // 防空转
    }
    if (last < masked.masked.length) {
      segments.push({ kind: 'text', text: masked.masked.slice(last) });
    }
    var expanded = [];
    segments.forEach(function (seg) {
      if (seg.kind !== 'text') { expanded.push(seg); return; }
      var bare = detectBareFormula(seg.text);
      if (bare) { expanded.push(bare); count++; return; }
      // Keep paragraphs outside math intact when selecting several chat lines.
      var lines = seg.text.match(/[^\n]*(?:\n|$)/g) || [];
      lines.forEach(function (line) {
        if (!line) return;
        var formula = detectBareFormula(line);
        expanded.push(formula || { kind: 'text', text: line });
        if (formula) count++;
      });
    });
    segments = unmaskFences(expanded, masked.fences);
    return { kind: count > 0 ? 'formulas' : 'text', count: count, segments: segments };
  }

  /* ------------------------------------------------------------------ *
   * 2. 渲染                                                             *
   * ------------------------------------------------------------------ */

  function renderLatex(latex, displayMode, katexOptions) {
    var katex = detectKatex();
    if (!katex) return null;
    var span = document.createElement('span');
    var opts = {
      displayMode: !!displayMode,
      throwOnError: true,
      strict: false,
      trust: false,
      output: 'htmlAndMathml'
    };
    if (katexOptions && typeof katexOptions === 'object') {
      for (var k in katexOptions) { if (Object.prototype.hasOwnProperty.call(katexOptions, k)) opts[k] = katexOptions[k]; }
    }
    opts.displayMode = !!displayMode;
    try {
      katex.render(latex, span, opts);
      return span;
    } catch (e) {
      return null;
    }
  }

  /**
   * 把 extractFormulas 的结果渲染为 DocumentFragment。
   * 无法解析的片段按原样保留（公式回退为代码样式）。
   */
  function renderResult(result, katexOptions) {
    var frag = document.createDocumentFragment();
    if (!result || !result.segments) return frag;
    result.segments.forEach(function (seg) {
      if (seg.kind === 'text') {
        frag.appendChild(document.createTextNode(seg.text));
        return;
      }
      var node = renderLatex(seg.latex, seg.display, katexOptions);
      if (node) {
        node.className = 'fra-formula' + (seg.display ? ' fra-formula-display' : '');
        frag.appendChild(node);
      } else {
        var code = document.createElement('span');
        code.className = 'fra-fallback' + (seg.display ? ' fra-fallback-display' : '');
        code.textContent = seg.text;
        frag.appendChild(code);
      }
    });
    return frag;
  }

  /** 一步到位：文本 → DocumentFragment */
  function renderText(text, katexOptions) {
    return renderResult(extractFormulas(text), katexOptions);
  }

  /** 公式片段 → MathML 字符串（用于复制到 Word 等） */
  function formulaToMathML(latex, displayMode) {
    var katex = detectKatex();
    if (!katex) return null;
    try {
      return katex.renderToString(latex, { displayMode: !!displayMode, output: 'mathml', throwOnError: true, strict: false });
    } catch (e) {
      return null;
    }
  }

  function formulaToHTML(latex, displayMode) {
    var katex = detectKatex();
    if (!katex) return null;
    try {
      return katex.renderToString(latex, { displayMode: !!displayMode, output: 'htmlAndMathml', throwOnError: false, strict: false });
    } catch (e) {
      return null;
    }
  }

  var fraCore = {
    version: CORE_VERSION,
    detectKatex: detectKatex,
    extractFormulas: extractFormulas,
    detectDelimiters: detectDelimiters,
    isLikelyLatex: isLikelyLatex,
    renderLatex: renderLatex,
    renderResult: renderResult,
    renderText: renderText,
    formulaToMathML: formulaToMathML,
    formulaToHTML: formulaToHTML
  };

  global.fraCore = fraCore;
  if (typeof self !== 'undefined' && self !== global && !self.fraCore) self.fraCore = fraCore;
})(typeof window !== 'undefined' ? window : typeof self !== 'undefined' ? self : this);
