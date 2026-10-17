# 变更日志

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/) 与
[Conventional Commits](https://www.conventionalcommits.org/zh-hans/)。

## [1.0.0] - 2026-10-17

首个完整版本：自有 CommonMark 引擎（规范 652/652）+ FaceT 三态工作台 + Windows 便携 exe。

### 新增

- **Markdown 引擎（`src/js/core/`，自有实现，零依赖）**
  - 块级解析器：三阶段主循环（开放块栈 continue 匹配 → blockStarts → 惰性段落延续），
    `_content` 字符串内容模型，`canContain` 上浮，列宽/制表符部分消耗（partiallyConsumedTab）
  - 行内解析器：强调规则 of 3（openers_bottom 索引）、括号栈（行内/引用/折叠/简写链接）、
    实体解码、自动链接、HTML 行内、硬换行
  - 双模渲染器：`spec` 模式输出规范 HTML（测试用）/ `facet` 模式附加
    `data-nid`、`blk` 类、高亮、TeX、双链、脚注标记
  - FaceT 扩展（opts 开关）：表格（含对齐）、`$$`/`$` 数学、YAML 前言、脚注、
    图表围栏、删除线、`[[双链]]`、脚注引用
  - 轻量 TeX 子集（递归括号配对，`\frac{\sqrt{}}` 不再截断）与代码高亮（单正则分词）
- **三态工作台（`src/js/ui/`）**
  - 源码 / 渲染 / AST 三态同屏，分屏与单独切换，滚动同步
  - 双向映射：点 AST 节点 → 渲染高亮 + 源码跳行；点渲染块 → AST 选中；
    源码光标 → 就近定位
  - AST 检视器：树形、类型标注、id/行号可见、仅块级过滤、展开折叠
  - 大纲（AST 遍历副产品）、反向链接与出链、快照时间轴（自动 + 手动、回滚、行级 LCS diff）
  - 任务列表可交互勾选（经 AST 行号回写源码）
  - 查找替换（正则 / 大小写 / 全部替换）、浅色深色主题、导出
    （md / 规范化 md / 独立 html / AST JSON / 打印）
- **数据层（`src/js/data/`）**：localStorage 持久化（文档 / 快照 / 设置）、
  双链图谱、文件 IO 三档降级（Electron 原生 / File System Access API / 下载上传）
- **桌面外壳（`electron/`）**：原生文件对话框、应用菜单、contextBridge 桥
- **构建（`build/`）**：单文件 Web 版（`dist/facet.web.html`，模块展平 + 构建自检）、
  Electron 运行目录、electron-packager 可运行目录版、electron-builder 单文件便携版
- **工程化**：MIT LICENSE、范围声明（SCOPE.md）、CI（GitHub Actions 三平台跑测试）、
  issue / PR 模板、Conventional Commits 规范

### 测试

- CommonMark 0.31.2 规范：**652/652（100.00%）**（spec.txt sha256 已记录，
  `→` 制表符已按规范约定转换）
- 应用层单元测试 19 项：facet 渲染标记、AST JSON、序列化往返、diff、图谱、统计
- 构建冒烟：DOM 桩执行单文件产物，验证启动与渲染链路
- Electron 端到端 **17/17**：真实 BrowserWindow + 渲染进程 DOM 探针，
  覆盖启动、原生桥、三态、渲染特性、数据层、菜单事件交互、编辑→渲染联动、控制台健康度
  （`test/e2e/e2e-electron.cjs`；自动清理 `ELECTRON_RUN_AS_NODE` 与无 GPU 环境降级）

### 打包产物（本机实测）

| 产物 | 路径 | 启动验证 |
|---|---|---|
| 可运行目录 | `build/out/FaceT-win32-x64/FaceT.exe` | 启动存活，无 FATAL |
| 单文件便携版 | `release/FaceT-Portable-1.0.0.exe`（约 68 MB） | 启动存活，无 FATAL |
| Web 单文件 | `dist/facet.web.html`（189 KB，零依赖） | 冒烟测试 13 项断言全过 |

### 修复（开发过程中修掉的实现偏差）

- `addChild` 用「是否容器」代替 `canContain(新节点类型)` → 主题线落入列表项内
- emphasis 新节点插入位置在 opener 之前 → 嵌套强调渲染成并列
- 链接创建后分隔符节点迁入子树，`indexOf` 失效 → 链接内 emphasis 内容被清空
- `isSpaceOrTab` 比较字符码与字符串恒为 false → 列表 padding 全错
- 链接标题正则：单引号替代缺闭合引号且缺 `|` 分隔符 → `'…'`/`(…)` 标题不解析
- 列表结束位置未向父层传递 → 空行分隔的嵌套列表误判 tight
- `RE_MAYBE_SPECIAL` 缺 `|` → FaceT 表格扩展被 Phase 2 快路径跳过
- 双链/脚注把 match 字符串当数组取捕获组 → `m[1]` 取到第二个字符
- `String.replace` 替换串含 `$` 被当特殊模式展开 → 构建产物被污染
- 块引用序列化漏掉子块；任务列表序列化丢失勾选状态
- `refreshDocList()` 早于种子文档创建执行且 `openDoc()` 不刷新列表
  → 首次启动文档下拉框为空、新建/打开的文档不入列表（e2e 抓出）
- `spawn('npx.cmd')` 在 Windows 上无法直接启动 `.cmd` → 打包脚本改用 Node API

[1.0.0]: https://github.com/BO0401/facet/releases/tag/v1.0.0
