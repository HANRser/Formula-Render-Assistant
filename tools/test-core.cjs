// 内核测试 v2：修正用例预期 + 降级正则独立验证
global.window = global;
global.document = { compatMode: 'CSS1Compat', createElement: function () { return {}; } };
eval(require('fs').readFileSync('extension/core.js', 'utf8'));

var cases = [
  ['DeepSeek 截图无分隔符', 'x = \\int_0^x 1 , dt = \\int_0^\\infty I(x > t) , dt\n]', 1],
  ['裸积分', 'x = \\int_0^x 1 \\, dt', 1],
  ['裸分数', '\\frac{a}{b}', 1],
  ['残留转义定界符', '\\[\nx = \\int_0^x dt\n]', 1],
  ['保留区间括号', '\\int_0^1 f(x) dx \\in [0,1]', 1],
  ['混合段落裸公式', '证明过程：\nx = \\int_0^x dt\n其中 x 是非负数。', 1],
  ['裸公式与正常公式混合', '\\frac{a}{b}\n与 $x^2$ 一起', 2],
  ['普通中文命令说明', '这里的 \\int 表示积分', 0],
  ['普通英文命令说明', 'Use \\frac for fractions', 0],
  ['Windows 路径', 'C:\\int\\files', 0],
  ['代码围栏裸公式保护', '```latex\n\\frac{a}{b}\n```', 0],
  ['普通变量名', 'some_variable_name', 0],
  ['混合行内', '动能 $K = (\\gamma - 1)mc^2$ 会急增，其中 $\\gamma$ 是因子。', 2],
  ['display块', '块：$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$ 结束', 1],
  ['方括号', '公式 \\[ x^2 + y^2 = z^2 \\] 完', 1],
  ['圆括号', '内含 \\( a_1 + a_2 \\) 与文字', 1],
  ['aligned', '\\begin{aligned} (a+b)^2 &= a^2+2ab+b^2 \\\\ (a-b)^2 &= a^2-2ab+b^2 \\end{aligned}', 1],
  ['矩阵', '$$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}^T$$', 1],
  ['反斜杠转义的美元', '价格是 \\$5，不是公式', 0],
  ['普通代码', '运行 `npm install katex` 然后 `npm run build`', 0],
  ['代码围栏保护', '```\n$x=1$\n```\n后面 $y = x^2$ 有效', 1],
  ['美元间空白不匹配', '价格 $ 5 元 和 $ 10 元 都是文字', 0],
  ['文本无公式', '这是一段完全普通的中文文本。', 0],
  ['孤立美元(货币误伤防护)', '他花了 $5 买了 x 和 y$ 之类的东西', 0],
  ['简单内容保守跳过', '结果 $y=2$ 无 latex 特征不渲染', 0],
  ['上下标触发', '速度 $v_0 = 30 m/s$，加速度 $a = 5 m/s^2$', 2]
];

var pass = 0, fail = 0;
cases.forEach(function (c) {
  var det = window.fraCore.extractFormulas(c[1]);
  var ok = det.count === c[2] && det.segments.map(function (s) { return s.text; }).join('') === c[1];
  ok ? pass++ : fail++;
  console.log(ok ? 'PASS' : 'FAIL', c[0], 'count=' + det.count, 'expected=' + c[2]);
});

var screenshot = window.fraCore.extractFormulas(cases[0][1]).segments[0];
var katex = require('../extension/assets/katex.min.js');
try {
  if (screenshot.latex.endsWith(']')) throw new Error('stray closing marker');
  katex.renderToString(screenshot.latex, { throwOnError: true });
  pass++; console.log('PASS 截图公式实际 KaTeX 解析');
} catch (error) { fail++; console.error('FAIL', error.message); }

// 降级正则（旧 Safari 路径）独立验证
var degradedInline = '((?:^|[^\\\\])\\$(?!\\s)(?:[^$\\n](?:[^$\\n]*?[^\\s$])?)\\$(?!\\d))';
var re = new RegExp(degradedInline, 'g');
var t1 = '动能 $K = (\\gamma - 1)mc^2$ 会急增'.replace(re, '«HIT»');
var t2 = '价格 \\$5 与 $a_1$ 测试'.replace(re, '«HIT»');
console.log('degraded t1:', JSON.stringify(t1));
console.log('degraded t2:', JSON.stringify(t2));
var degradedOk = (t1.match(/«HIT»/g) || []).length === 1 && (t2.match(/«HIT»/g) || []).length === 1;
console.log(degradedOk ? 'PASS' : 'FAIL', '降级正则');
degradedOk ? pass++ : fail++;

console.log('pass=' + pass, 'fail=' + fail);
process.exit(fail ? 1 : 0);
