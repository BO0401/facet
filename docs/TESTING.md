# 测试

Facet 的质量基线只有一条硬规则：**报告的数字必须是真实跑出来的，不谎报**。

## 运行

```bash
npm test              # 全部：规范 + 单元 + 冒烟
npm run test:spec     # CommonMark 0.31.2 规范 652 例
npm run test:unit     # 应用层单元测试（19 项）
npm run test:smoke    # 构建产物冒烟（先 build 再用 DOM 桩跑单文件）
npm run test:electron # Electron 桌面版端到端（真实 BrowserWindow + 渲染进程探针）
```

## 1. CommonMark 规范测试（`test/spec.json` + `test/run-spec.js`）

| 项 | 值 |
|---|---|
| 规范版本 | CommonMark 0.31.2 |
| 用例总数 | 652 |
| **当前通过率** | **652 / 652（100.00%）** |
| 数据来源 | `npm:commonmark-spec@0.31.2`（spec.txt） |
| spec.txt SHA-256 | `257c41ad946f7a1414a499aca402a1aa8fdac3678532266611348c1cf54f4b80` |
| 许可 | CC-BY-4.0（CommonMark spec） |

说明：

- 规范示例中的 `→` 字符代表制表符，`test/spec.json` 已按规范前言约定转换为真实 `\t`（输入与期望 HTML 同步转换），`note` 字段有记录。
- 测试以 **spec 模式**（`SPEC_OPTS`：全部 Facet 扩展关闭）运行，保证与 CommonMark 参考实现的逐字节一致。
- runner 支持 `--section="Tabs"` 按章节过滤、`--show=N` 控制失败详情数量、`--all` 输出全量。
- 退出码：全部通过为 0，否则为 1（CI 可直接用）。

### 达成 100% 之前修掉的偏差（均为自有实现与参考实现的语义差异）

| 偏差 | 现象 | 根因 |
|---|---|---|
| `addChild` 上浮条件 | `***` 落在 `<li>` 内 | 用「是否容器」代替参考实现的 `canContain(新节点类型)`；list 只能容纳 item |
| emphasis 插入位置 | `__foo_ bar_` 渲染成两个并列 `<em>` | 新 emph 节点插到了 opener **之前**，参考实现在其后（`insertAfter`） |
| 链接内 emphasis | `*foo [*bar*](/url)*` 内容被清空 | 链接创建后分隔符节点已迁入链接子树，`indexOf` 找不到；改为 parent 指针定位 |
| `isSpaceOrTab` | 列表 padding 全错（`-    foo` 当作 2 列） | 比较字符码与字符串，恒为 false |
| 链接标题正则 | `'title'` / `(title)` 标题不解析 | 单引号替代缺闭合引号，且缺 `\|` 分隔符 |
| 列表结束位置 | 空行分隔的嵌套列表判成 tight | list/item finalize 未把结束位置传给父层（参考实现取自最后一个子块） |
| `RE_MAYBE_SPECIAL` | Facet 表格完全不解析 | `\|` 不在快路径字符集，Phase 2 被跳过 |

## 2. 应用层单元测试（`test/unit/unit.test.js`）

19 项，覆盖 facet 渲染标记（`data-nid`/`blk`/可交互复选框/双链/脚注锚点/高亮 token）、
AST JSON 导出（无 parent 循环）、AST→Markdown 规范化序列化往返、独立 HTML、
行级 diff（LCS）、文档图谱与反向链接、词数统计。

这一层在开发过程中抓出过 5 个真实缺陷：双链/脚注引用把 match 字符串当数组取捕获组
（`m[1]` 取到第二个字符）、blockquote 序列化漏掉子块、任务列表序列化丢失勾选状态等。

## 3. 构建产物冒烟（`test/unit/bundle-smoke.js`）

`build/bundle.js` 会把全部 ESM 模块剥掉 import/export 后拼进单个 IIFE 生成
`dist/facet.web.html`。这种「模块展平」有真实的作用域风险，因此冒烟测试用最小 DOM 桩
在 node 里完整执行内联脚本，验证：脚本无异常、App 启动、文档加载、
渲染产物含标题/表格/复选框/双链/脚注/`data-nid`、AST 树与大纲已渲染、状态栏统计正常。

抓出过的构建缺陷：`String.replace` 的替换串里含 `$`（`mainExtra += '$'`）被当作
`$'` 特殊模式展开，污染了整个产物——已改为函数式替换。

## 4. Electron 桌面版端到端（`test/e2e/e2e-electron.cjs`）

脚本自包含双模式：`node test/e2e/e2e-electron.cjs` 由 Node 驱动（自动定位
Electron 二进制、清理环境、等 marker 汇总），Electron 侧创建真实
`BrowserWindow` 加载 `index.html`，在渲染进程里做 DOM 探针与菜单事件交互。

当前基线：**17 / 17 通过**（Electron 28.3.3 / Chrome 120 / Node 18.18.2）。

| 类别 | 断言 |
|---|---|
| 启动 | `loadFile(index.html)`、清空持久化后重载（保证「首次启动」视角） |
| 原生桥 | `window.facet` 注入，含 `openFile/saveFile/saveFileAs/onMenu` |
| 三态 | 源码编辑器、渲染面板非空、AST 树、大纲、状态栏统计 |
| 渲染特性 | 任务复选框、表格、双链、脚注锚点 |
| 数据层 | 文档列表 option、localStorage 四键（`facet.docs.v1` 等） |
| 交互 | 菜单事件送达渲染层（主题切换 / 视图切换）、编辑→渲染联动 |
| 健康度 | 渲染进程无 error 级控制台输出 |

抓出过的真实缺陷：**首次启动时文档下拉框为空**（`refreshDocList()` 在
`buildPanels()` 末尾执行，早于种子文档创建；且 `openDoc()` 不刷新列表，
新建/打开的文档也不会出现在下拉框）——已在 `openDoc()` 内统一刷新修复。

### 已知环境陷阱（开发机实测，已内建应对）

| 现象 | 根因 | 脚本应对 |
|---|---|---|
| `require('electron')` 返回 exe 路径字符串、`app` 为 undefined | 宿主（WorkBuddy 本身是 Electron 应用）设置了 `ELECTRON_RUN_AS_NODE=1`，子进程继承后 electron.exe 退化为纯 Node | 启动器 spawn 时 `delete env.ELECTRON_RUN_AS_NODE` |
| GPU 进程崩溃 `0xC0000005` → `FATAL: GPU process isn't usable` | 无 GPU / 容器 / 沙箱环境 | 首次运行无 marker 时自动以 `--disable-gpu --disable-software-rasterizer --no-sandbox` 重试一次（只影响硬件加速，不影响功能覆盖）；`FACET_E2E_GPU_ARGS=1` 可跳过首次尝试 |
| 测试间状态污染（上次的「联动测试」内容残留） | e2e 的编辑联动会写入 localStorage | 验证体加载后先 `localStorage.clear()` 再重载，固定「首次启动」视角 |

### 打包产物的启动验证

`npm run dist:dir`（electron-packager）与 `npm run dist`（electron-builder portable）
的产物启动验证：在无显示/沙箱的开发机上以 `--no-sandbox --disable-gpu` 启动，
进程存活至手动终止、无 FATAL 崩溃即视为通过（进程内 DOM 探针无法从外部注入，
该层覆盖由源码模式 e2e 承担——两者加载同源的 `index.html` + `src/`）。

## 5. 覆盖边界（如实声明）

- 规范测试只覆盖 CommonMark 0.31.2；GFM 表格/删除线、数学、双链、脚注、图表、
  YAML 是 Facet 扩展，**不在 652 例之内**，其正确性由单元测试 + 冒烟测试 +
  人工验收保证。
- `dist/facet.web.html` 的浏览器实测（点击交互、滚动同步、主题切换）依赖人工验收；
  node 桩不模拟布局与事件委托的完整链路。
- e2e 探针不覆盖：原生文件对话框（打开/保存）、菜单每一项、快捷键、
  滚动同步的视觉正确性、打包 exe 内部进程的 DOM 细节。这些依赖人工 GUI 验收。
