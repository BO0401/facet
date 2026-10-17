# 架构

## 一条管线，三个切面

```
                 ┌──────────────────────────────────────────┐
  源码 (text) ──▶ │ parseBlocks()  src/js/core/blocks.js      │
                 │   + inlines.js（行内）                     │
                 └──────────────────┬───────────────────────┘
                                    ▼
                          AST（每个节点带稳定 id + pos.line）
                                    │
         ┌──────────────────────────┼───────────────────────────┐
         ▼                          ▼                           ▼
  renderHTML(ast,'facet')    serializeBlock()             toAstJson()
  src/js/core/render.js      src/js/ui/export.js          （IR 导出）
         │                          │                           │
         ▼                          ▼                           ▼
    渲染面板（三态之一）       规范化 Markdown               .ast.json
```

**核心不变量**：任何视图的改动都必须经 AST 回到源码，不允许绕过 AST 直接改 DOM。
任务列表勾选即走「AST 定位行号 → 改源码文本 → 重新解析」的路径。

## 目录

```
index.html              应用外壳（顶栏 / 侧栏 / 三态 / 状态栏）
src/css/app.css         双主题样式（CSS 变量，无预处理器）
src/js/main.js          入口
src/js/core/            Markdown 引擎（与 UI 完全解耦，可独立测试）
  entities.js           HTML5 命名实体表（2125 条，仅带分号形式）
  text.js               转义 / 实体解码 / URL 编码（mdurl 式）
  ast.js                节点工厂 N()、walk()、plainText()、BLOCK_TYPES
  inlines.js            行内解析器（强调规则 of 3、括号栈、引用链接）
  blocks.js             块级解析器（三阶段主循环、_content 内容模型）
  render.js             双模渲染器（spec 规范 HTML / facet 增强标记）
  markdown.js           门面：parseMarkdown / render / FACET_OPTS
  tex.js                轻量 TeX 子集（递归括号配对）
  highlight.js          轻量代码高亮（单正则分词）
src/js/data/            数据层
  store.js              localStorage 持久化（文档 / 快照 / 设置）
  graph.js              双链提取、文档图谱、反向链接
  fs.js                 文件 IO 三档降级（Electron / FSA / 下载上传）
src/js/ui/              界面层
  dom.js toast.js       极小 DOM 工具与通知
  panes.js              三态协调器（滚动同步、双向定位、勾选回写）
  astview.js            AST 检视器（树形 / 类型标注 / 点击定位）
  outline.js            大纲（AST 遍历副产品）
  backlinks.js          反向链接与出链
  timeline.js           快照时间轴 + 行级 LCS diff
  find.js               查找替换（含正则）
  export.js             导出（md / 规范化 md / html / AST JSON / 打印）
  app.js                应用外壳 orchestration
electron/main.cjs       主进程（原生对话框 + 菜单）
electron/preload.cjs    contextBridge 桥
build/bundle.js         构建：单文件 Web 版 + Electron 运行目录
build/make-app.js       electron-packager 打包
build/make-exe.js       单文件便携 exe
test/spec.json          CommonMark 652 例（→ 已转 tab）
test/run-spec.js        规范测试 runner
test/unit/              单元测试 + 构建冒烟
```

## 关键设计决策

### 1. 三态共享一棵 AST

`Panes` 是唯一的协调点：源码 `input` → 防抖 150ms → `parseMarkdown` →
`renderHTML(ast,'facet')` 写入渲染面板，同时把 AST 推给 AST 树与大纲。
反向：渲染面板点击（事件委托取 `data-nid`）或 AST 树点击 → `paintHighlight` +
`jumpSourceToLine`。源码光标移动 → 就近块定位。三者的锚点都是**节点 id 与
`pos.line`**，不依赖任何文本匹配。

### 2. facet 模式的渲染标记

`render.js` 的 `Renderer` 有 `facet` 开关：

| 标记 | 用途 |
|---|---|
| `data-nid="n42"` | 节点 id，三态映射锚点 |
| `class="blk"` | 块级节点（高亮与 CSS） |
| `class="wiki" data-target="X"` | 双链（点击跳转/创建） |
| `class="task"` 复选框 | 可交互任务列表 |
| `id="fn-x"` / `href="#fn-x"` | 脚注锚点 |

spec 模式（测试用）全部关闭，保证与 CommonMark 参考实现逐字节一致。

### 3. 快照而非版本库

`store.js` 的策略：输入停止 2s 自动存档（内容未变不重复存）、手动按钮立即存、
单文档上限 50 条、配额溢出时自动淘汰最旧。回滚 = 用快照文本替换源码
（经 `setText` 走完整解析链路，不是直接改 DOM）。

### 4. 文件 IO 三档降级

`fs.js` 按运行环境选择：Electron（preload 注入的 `window.facet`，原生对话框）→
File System Access API（真实文件句柄，可保存回原文件）→ `<input type=file>` +
Blob 下载。上层只面对 `openFile()/saveFile()/saveFileAs()` 三个语义。

### 5. 单文件构建的模块展平

`build/bundle.js` 按拓扑序拼接模块，剥掉 `import`/`export` 关键字后包进一个 IIFE。
两个坑及其解法：

- 同名顶级声明会互相覆盖（`esc` 曾在 tex.js 与 dom.js 各有一份）→ dom.js 的改名 `escHtml`
- `String.replace` 替换串中的 `$` 是特殊语法 → 一律用函数式替换

## 与 Typora 的对应关系

本项目的上游依据是 Typora 1.12.3 的逆向结果（见 `Typora_REA_还原主要功能.md`）：

| Typora 内部模块 | Facet 对应 | 差异 |
|---|---|---|
| `19 MarkParser` | `core/blocks.js` + `core/inlines.js` | 自有实现，覆盖 CommonMark 0.31.2 全集 + Facet 扩展 |
| `13 NodeDef` | `core/ast.js` + `ui/astview.js` | **外化**：Typora 藏起来，Facet 是一等公民 |
| `14 Node2HTML` | `core/render.js` | 双模：spec / facet |
| `12 Node2Mark` | `ui/export.js` serializeBlock | 显式暴露为「导出规范化 Markdown」 |
| `20` contenteditable 内核 | textarea + AST 驱动渲染 | 删掉 450KB 的选区/撤销/输入法驯服成本 |
| `33` autosave + `49` addBackup | `data/store.js` + `ui/timeline.js` | 升级为可调取、可 diff 的快照时间轴 |
| `44` 大纲 + `45` 文件搜索 | `ui/outline.js` + `data/graph.js` | **接起来**：反向链接把两者连通 |
| `51`/`4c` 主题 | `css/app.css` CSS 变量 | 浅色/深色 |
| MathJax3 / CodeMirror | `core/tex.js` / `core/highlight.js` | 零第三方运行时依赖 |

未做（范围外）：许可激活/反盗版（个人使用不需要）、遥测、自动更新、云图床、
账号系统、pandoc 外部转换。详见 `SCOPE.md`。
