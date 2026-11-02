# 公式渲染助手（Formula Render Assistant）

AI输出的数学物理公式等没渲染好，只显示代码，试试这个小工具吧！

选中网页里的 **LaTeX / Markdown 公式代码**，弹出「∑ 渲染」按钮，一键变成可读公式 —— 就像选中文字弹出的复制/粘贴菜单一样自然。离线可用，不上传任何数据，电脑、手机、平板都能用。

## 它解决什么问题

AI 聊天页面经常把公式输出成原始代码，例如：

```
质能方程 $E = mc^2$ 是狭义相对论的核心结论。
```

选中这段文字 → 点「∑ 渲染」→ 公式立刻变成漂亮的印刷体，支持：

- `$...$`、`$$...$$`、`\(...\)`、`\[...\]` 行内/独立公式
- `\begin{aligned}` `\begin{pmatrix}` 等各类环境（多行推导、矩阵）
- Markdown 行内代码里的公式
- AI 网页中缺失分隔符的裸 LaTeX（如 `x = \int_0^x dt`）；支持截图中末尾单独一行 `]` 的残留标记
- 混合普通文字（没有公式时不会弹按钮，不打扰正常复制）

## 四种使用方式（同一渲染内核）

| 方式 | 适合设备 | 是否需安装 | 说明 |
|---|---|---|---|
| ① 浏览器扩展 | 电脑 Chrome / Edge | 加载文件夹 | 功能最全：选区浮窗、原位替换+撤销、富文本复制、快捷键 `Alt+R` |
| ② 用户脚本 | 手机 / 平板（Kiwi、Via、Edge Canary、Safari+Userscripts） | Tampermonkey 等 | 与扩展同等体验 |
| ③ 书签脚本 | 任何浏览器 | 拖到书签栏 | 零安装；需联网加载 KaTeX |
| ④ 独立渲染台 | 任何设备 | 无 | 整段粘贴渲染，可离线；支持富文本复制 / MathML |

详细安装步骤见 **安装引导**：直接用浏览器打开 `webapp/guide.html`（有手机端图文步骤与常见问题）。

快速上手：

- **电脑**：Chrome 打开 `chrome://extensions` → 开启「开发者模式」→「加载已解压的扩展程序」→ 选择本目录的 `extension` 文件夹。
- **本机路径**：选择 `E:\渲染小工具\extension`。文件夹选择窗口可能不显示文件，这是正常现象；直接点“选择文件夹”。在资源管理器中可确认其中有 `manifest.json`。
- **安装后**：刷新之前已打开的网页。测试本地 HTML 时，在扩展“详细信息”里打开“允许访问文件网址”。浏览器设置页和扩展商店页无法注入，请从工具栏打开“渲染台”。
- **体验**：浏览器打开 `webapp/demo.html`，选中灰色代码，点「∑ 渲染」。
- **渲染台**：浏览器打开 `webapp/console.html`（或双击文件），粘贴长文本一键渲染，可复制进 Word。

## 目录结构

```
渲染小工具/
├─ extension/            浏览器扩展（MV3，KaTeX 已内置，离线可用）
│  ├─ manifest.json
│  ├─ core.js            共享渲染内核：公式识别 + KaTeX 渲染
│  ├─ core-bridge.js     兼容副本（不重复加载）
│  ├─ content.js         选区监听、悬浮按钮、渲染卡片、原位替换
│  ├─ background.js      Service Worker：安装引导、消息转发
│  ├─ popup.html/js      工具栏弹窗
│  ├─ selection-ui.css   弹窗与卡片样式（含深色模式）
│  └─ assets/            katex.min.js / katex.min.css / fonts/（60 个字体文件）
├─ webapp/               网页版（无需安装）
│  ├─ demo.html          演示页（内置同款脚本，可直接体验选中渲染）
│  ├─ console.html       独立渲染台（粘贴渲染、富文本/MathML 复制）
│  ├─ guide.html         安装引导（含手机端步骤、常见问题）
│  └─ assets/ …          同款内核与 KaTeX
├─ userscript/
│  └─ formula-render.user.js   Tampermonkey / Via / Userscripts 用
├─ bookmarklet/
│  └─ formula-render.bookmarklet.txt  书签脚本（javascript: 一步粘贴）
├─ tools/
│  ├─ build.cjs          构建脚本：node tools/build.cjs
│  └─ download-katex.cjs 重新下载 KaTeX 依赖（可选）
└─ dist/
   └─ 公式渲染助手-扩展-v1.0.0.zip  上应用商店 / 分享给朋友用
```

## 技术要点

- 渲染引擎 [KaTeX](https://katex.org)（本地内置，`output: htmlAndMathml`，兼顾显示与可访问性/复制）
- 公式识别容错：代码围栏保护、普通文本零打扰、解析失败原样保留（灰色代码样式）
- 原位替换提供「✕ 撤销」浮标，保留至撤销或页面刷新；撤销恢复原始节点。跨节点选区和输入区域请使用预览、复制。
- 扩展 MV3、无网络权限请求；用户脚本 `@grant none`、书签脚本仅加载 CDN 引擎
- 深色模式自适应（`prefers-color-scheme`）

## 隐私

不收集、不上传任何数据。扩展与用户脚本完全离线工作；仅书签脚本需要联网加载 KaTeX 引擎文件。

## 开发与验证

### 1.0.2：实际网页无反应时

演示页本身带有渲染脚本，因此演示成功不代表扩展已注入其他网页。在 DeepSeek 页选中公式后，点浏览器工具栏里的扩展图标：弹窗会显示连接版本、选中字数和识别数量。未连接时可点“连接 / 修复当前页”；旧版脚本提示需刷新网页。若提示权限问题，在扩展详情中检查该站点的访问权限。

新版使用 `scripting`、`activeTab` 权限检查和修复当前页注入；只处理本地选区，不上传文本。浮窗使用独立样式区域和可用时的浏览器顶层显示，避免网页样式覆盖；工具栏按实际选中内容所在的 iframe 路由。

需要 Node.js；构建不需要安装 npm 依赖或联网。

```sh
npm run build   # 同步内核、内置引擎和字体，生成扩展页面、图标、用户脚本和书签脚本
npm test        # 公式识别、扩展文件完整性、脚本语法及 CSP 检查
npm run package # 构建、测试并生成 dist/formula-render-extension-v1.0.0.zip（Windows）
```

`extension/core.js`、`extension/content.js`、`extension/selection-ui.css` 是共享代码源；扩展的渲染台和引导页由 `webapp` 生成。修改后需重新构建，并在扩展管理页点“重新加载”。不要仅复制空目录，也不要直接选择 ZIP 加载；ZIP 需先解压。

可选浏览器回归测试：安装 Playwright 后执行 `node tools/test-browser.cjs`。支持通过 `PLAYWRIGHT_MODULE` 和 `CHROMIUM_PATH` 指定已有运行时及浏览器，使用项目内独立测试配置，不访问日常浏览器配置。

## License

MIT（KaTeX 为 MIT License）
