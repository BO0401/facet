# 命名规范（Naming Convention）

本文档定义 FaceT 项目的命名规范。所有新代码、新文档、新提交信息中的命名
**必须**遵循本文档；对存量名称的修改只能通过独立的 `refactor` 提交进行，
并在提交信息中说明兼容性影响。

## 1. 三个层级，三种写法

| 层级 | 写法 | 用途 | 示例 |
|---|---|---|---|
| 品牌名（对外展示） | **FaceT** | README 标题、界面标题、关于对话框、LICENSE、宣传文案 | `FaceT · 切面` |
| 仓库与地址（机器标识） | **facet**（全小写） | GitHub 仓库名、URL、git remote、npm 包名、目录名 | `github.com/BO0401/facet`、`facet.web.html` |
| 代码标识符（API 语义） | **facet**（全小写） | 渲染模式名、localStorage key、CSS 类名、函数前缀 | `mode === 'facet'`、`facet.docs.v1` |

**核心规则：品牌名永远写作 `FaceT`（驼峰，T 大写）；机器能碰到的名字永远
全小写 `facet`。**

### 为什么这样定

- GitHub 仓库 URL 大小写不敏感，`FaceT` 与 `facet` 指向同一仓库。用全小写
  做 URL/仓库名，避免不同平台（Windows/macOS）文件系统大小写敏感性差异
  导致的 clone 问题。
- 渲染模式名（`'facet'` vs `'spec'`）与 localStorage key（`facet.docs.v1`）
  是持久化 API 的一部分：**改名即用户数据不兼容**，因此冻结为全小写。
  任何"顺手统一大小写"的改动都是破坏性变更，禁止。

## 2. 界面文案

- 产品名出现时：`FaceT · 切面`（主标题）、`FaceT`（品牌位）
- 欢迎文档标题：`欢迎使用 FaceT`
- 关于对话框：`FaceT · 切面` / `One source, many facets.`
- 错误兜底文案：`FaceT 启动失败：…`

## 3. 代码内命名

| 场景 | 规范 | 正例 | 反例 |
|---|---|---|---|
| 渲染模式常量 | `'facet'` / `'spec'` | `renderHTML(ast, 'facet')` | `'FaceT'` |
| localStorage key | `facet.<类别>.v<N>` | `facet.snaps.v1` | `FaceT.snaps.v1` |
| CSS 类 | 小写连字符，无 facet 前缀 | `.blk`、`.wiki`、`.task` | `.FaceT-blk` |
| DOM id | 小写连字符 | `#ast-tree`、`#pane-outline` | `#FaceTree` |
| 变量/函数 | camelCase，语义优先 | `parseMarkdown`、`renderHTML` | `faceTParse` |
| 常量 | UPPER_SNAKE | `SEED`、`BLOCK_TYPES` | `FaceTSeed` |

## 4. 仓库与提交

- 仓库名：`facet`
- 提交信息 scope 只用：`core / ui / data / build / docs / test / repo`
- 版本 tag：`v<major>.<minor>.<patch>`（如 `v1.0.0`）
- 分支：`main`（稳定）、`dev`（可选，迭代期使用）

## 5. 文档与宣传口径

- 一句话定义（中英双语，README 首屏固定使用）：
  > FaceT — Markdown workbench that treats the AST as a first-class citizen.
  > FaceT（切面）——把 Markdown 的 AST 中间层做成一等公民的本地工作台。
- 检索关键词（README / GitHub topics 统一使用）：
  `markdown` `markdown-editor` `ast` `commonmark` `wysiwyg` `electron`
  `offline-first` `notes` `three-pane`
- 差异化表述：三态同屏（Source / Render / AST）、节点 ID 双向映射、
  零运行时依赖、离线优先、CommonMark 0.31.2 规范 652/652。

## 6. 兼容性冻结清单（改名即破坏，禁止）

| 名称 | 位置 | 冻结原因 |
|---|---|---|
| `'facet'` 渲染模式 | `src/js/core/render.js`、调用方 | 已导出 API |
| `facet.docs.v1` 等 4 个 key | `src/js/data/store.js` | 用户存量数据 |
| `data-nid` / `blk` / `wiki` / `task` | render.js 输出 HTML | 测试断言与导出格式依赖 |
| `.tmp/`、`dist/`、`build/app/` | 构建产物目录 | 脚本与 .gitignore 引用 |
