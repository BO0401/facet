# HANDOFF — FaceT 维护交接文档

> **面向对象**：接管本仓库的 AI 助手或人类维护者。
> **自包含声明**：本文档不依赖任何外部记忆系统、笔记软件或对话历史。你需要的全部关键信息都在本仓库内（README + docs/ + 本文档）。任何人清理任何 AI 助手的记忆，都不影响依据本文档继续维护。
> **最后更新**：2026-10-18（v1.0.0 发布 + CI 上线后）
> **仓库**：https://github.com/BO0401/facet ｜ 许可：CC BY-NC-SA 4.0（个人使用自由，商用需授权）

---

## 0. 三十秒版本

FaceT（读作 "Face-T"，品牌名；仓库/代码内机器名恒为小写 `facet`）是一个 Markdown 工作台：源码 / 渲染 / AST 三态同屏，把解析产生的 AST 做成一等公民。自有 CommonMark 0.31.2 引擎，规范测试 652/652（100%）。零运行时第三方依赖（electron 仅作桌面外壳）。当前版本 v1.0.0 已发布，CI 全绿。

接手三步：`npm install` → `npm test`（四套测试必须全绿）→ 读本文档第 7 节代码地图后动代码。

---

## 1. 仓库是什么（一段话）

功能上对标 Typora 的写作体验，核心差异是 **AST 外化**：Typora 把 Markdown ⇄ AST ⇄ HTML 双向管线关在黑盒里只给用户看渲染态；FaceT 把 AST 树、节点 ID、图谱全部暴露为可交互的一等界面。完整的设计推导、仿照清单与排除项见 [docs/SCOPE.md](docs/SCOPE.md)。原创性声明（未复制任何 Typora 源码）见 README 末节。

## 2. 当前状态

| 项 | 值 |
|---|---|
| 版本 | v1.0.0（annotated tag 已推送） |
| 提交数 | 9 笔，全部署名 `bo天天开心 <Zzhang200801@outlook.com>` |
| 默认分支 | main（直推模式，无 dev 分支） |
| CI | GitHub Actions，11 jobs（三平台 × Node 18/20/22 测试矩阵 + 规范门禁 + Windows Electron e2e），**全绿** |
| Release | v1.0.0，资产：`FaceT-Portable-1.0.0.exe`（68MB）+ `facet.web.html`（189KB） |
| 测试基线 | 规范 652/652 ｜ 单元 19/19 ｜ 冒烟 13 断言 ｜ e2e 17/17 |

## 3. 接手第一步（按序执行）

```bash
git clone https://github.com/BO0401/facet.git && cd facet
npm install          # electron 二进制约 100MB，走镜像源（见第 4 节）
npm test             # 规范 + 单元 + 冒烟，必须全绿再动代码
npm run test:electron  # 可选：Electron 端到端（需桌面环境）
```

全绿后按此顺序读：README → docs/SCOPE.md → docs/ARCHITECTURE.md → 本文档第 7 节。

## 4. 环境陷阱（全部为开发机实测踩坑，脚本已内建应对，但你要知道）

| # | 陷阱 | 症状 | 应对 |
|---|---|---|---|
| 1 | **`ELECTRON_RUN_AS_NODE=1`** | 若宿主 IDE/工具自身是 Electron 应用，该环境变量被子进程继承 → `electron.exe` 退化为纯 Node：`--version` 输出 `v18.18.2`、`require('electron')` 返回 exe 路径字符串而非 API | 跑任何 electron 子进程前 `delete env.ELECTRON_RUN_AS_NODE`；`test/e2e/e2e-electron.cjs` 启动器已内建 |
| 2 | **GPU 进程崩溃** | 无 GPU 的沙箱/CI runner 上 GPU 进程 FATAL（0xC0000005），应用起不来 | `--disable-gpu --disable-software-rasterizer --no-sandbox`；e2e 启动器自动降级重试 |
| 3 | **Windows 上 `spawnSync('npx.cmd')` 失败** | 直接 spawn `.cmd` 文件不被 Windows 允许（需 `shell: true`），表现为"工具已安装却报未安装" | 打包脚本已改用 Node API：`@electron/packager` 的 `packager()`、`require.resolve` + `process.execPath` 跑 CLI 入口。**改打包逻辑时不要走回头路** |
| 4 | **electron 二进制下载** | GitHub releases 直连可能超时 | `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/` 后执行 `node node_modules/electron/install.js`；镜像内容经 SHA-256 比对与官方 SHASUMS256.txt 一致 |
| 5 | **e2e 状态污染** | 探针写 localStorage 会影响下次运行，表现为"文档列表为空"等时隐时现的失败 | e2e 验证体加载后 `localStorage.clear()` + 重载，固定"首次启动"视角 |
| 6 | **`String.replace` 替换串含 `$`** | 构建脚本里用字符串做替换串时，`$'`/`$&` 等被当特殊模式展开，污染产物 | 一律用函数式替换：`str.replace(re, () => val)` |
| 7 | **同名顶级声明冲突** | 单文件构建做模块展平时，两个模块的同名顶级函数（曾发生于 `esc`）后者覆盖前者 | 展平后同名声明是经典坑；dom.js 的辅助函数已改名 `escHtml`。新增工具函数时取独特名字 |
| 8 | **PAT 缺 `workflow` scope** | 推送 `.github/workflows/` 被 GitHub 拒绝（Contents API 对该路径返回 404） | 维护用 PAT 必须勾选 `repo` + `workflow` 两个 scope（见第 10 节） |

## 5. 命令速查

| 命令 | 作用 | 用时量级 |
|---|---|---|
| `npm install` | 安装依赖 + 下载 electron 二进制 | 首次数分钟 |
| `npm test` | 规范 + 单元 + 冒烟（CI 同款） | ~10 秒 |
| `npm run test:spec` | CommonMark 652 例差分测试 | ~3 秒 |
| `npm run test:unit` | 应用层单元测试（19 项） | ~1 秒 |
| `npm run test:smoke` | 构建 + DOM 桩跑单文件产物（13 断言） | ~3 秒 |
| `npm run test:electron` | Electron e2e（17 断言，真实 BrowserWindow） | ~20 秒 |
| `npm run build` | 生成 `dist/facet.web.html` + `build/app/` | ~1 秒 |
| `npm start` | Electron 开发模式 | — |
| `npm run dist:dir` | 打包可运行目录 `build/out/Facet-win32-x64/` | ~1 分钟 |
| `npm run dist` | 打包单文件便携 exe 到 `release/` | ~2 分钟 |

详细开发工作流见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 6. 质量红线（违反任何一条都不得提交）

1. **CommonMark 规范测试必须 652/652**。改 `src/js/core/` 任何文件后第一件事就是 `npm run test:spec`。规范测试数据（spec.txt）的 SHA-256 记录在 docs/TESTING.md——若数字对不上，说明测试集被污染，先修数据再修代码。
2. **不得引入运行时第三方依赖**。引擎、TeX 子集、代码高亮全部自研——这是项目的核心卖点之一（"零运行时依赖"徽章）。electron 仅为桌面外壳，`devDependencies` 里的打包/测试工具不在此限。
3. **命名冻结**：小写 `'facet'`（渲染模式名）、`facet.*.v1`（localStorage 存储键）、仓库 URL 中的 `facet` 属冻结 API——改名即用户数据不兼容。品牌名统一 `FaceT`。规则全文见 [docs/NAMING.md](docs/NAMING.md)。
4. **每次改动跑对应测试**：改核心 → spec；改应用层 → unit + smoke；改 electron/ → e2e。

## 7. 代码地图

```
src/js/core/      CommonMark 引擎（项目根基，改动最需谨慎）
  blocks.js        块级解析（Phase 1-3 三阶段；canContain 语义勿改回"是否容器"）
  inlines.js       行内解析（emphasis rule of 3、parent 指针定位）
  ast.js           节点类型定义
  render.js        双模渲染：spec（规范 HTML）/ facet（附加 data-nid 等交互标记）
  index.js         引擎入口
src/js/ui/        应用层
  app.js           编排：启动流程、菜单动作、主题/视图、勾选回调
  panes.js         三态协调器（150ms 防抖、锚点 = 节点 id / pos.line、滚动互斥锁）
  astview.js       AST 树（点击选中、selectByLine）
  dom.js           DOM 辅助（escHtml、debounce）
  export.js        导出：md / 独立 HTML / AST JSON（stripParent 防循环引用）
  timeline.js      快照面板 + LCS 行级 diff（400 万单元格保护）
  find.js outline.js backlinks.js toast.js   查找/大纲/反链/提示
src/js/data/      数据层
  store.js         localStorage（docs/snaps/settings/active 四键，2s 自动快照，上限 50）
  graph.js         双链图谱（extractLinks/buildGraph/backlinksFor）
  fs.js            文件 IO 三档降级：Electron IPC → File System Access API → input+Blob
electron/         桌面外壳（main.cjs 原生对话框/菜单；preload.cjs contextBridge）
build/            bundle.js（单文件构建：拓扑序展平 + 自检）；make-app.js；make-exe.js
test/             run-spec.js（652 差分）；unit/（19 项）；e2e/（Electron 17 断言）
docs/             SCOPE / ARCHITECTURE / DEVELOPMENT / TESTING / NAMING
```

**最易踩的三个代码级暗坑**（均有测试守护，改前先读注释）：
- `addChild` 必须用 `canContain(tipType, tag)` 判断，不是"tip 是否是容器"——否则主题线会落进列表项
- 链接创建后分隔符节点迁入 link 子树，定位必须走 `node.parent.children`，不能 `block.children.indexOf`
- 新 emphasis 节点必须插在 opener **之后**（`splice(oi + 1, ...)`），否则嵌套强调渲染成并列

## 8. 发版流程（v1.0.1 及以后照此执行）

1. 改动全部完成，四套测试本地全绿
2. 更新 `CHANGELOG.md`（Keep a Changelog 格式，新增 Unreleased/版本节）
3. `npm version patch|minor`（自动改 package.json + 打 tag）或手动改版本号
4. `npm run build && npm run dist`（产出 `release/FaceT-Portable-<版本>.exe`）
5. 提交推送（含 tag：`git push && git push origin <tag>`）
6. 创建 GitHub Release，上传 `release/FaceT-Portable-<版本>.exe` 与 `dist/facet.web.html`，release notes 从 CHANGELOG 对应节复制
7. 确认 CI 对新 commit 全绿

历史版本的完整发布记录在 Releases 页；`docs/DEVELOPMENT.md` 有打包细节。

## 9. GitHub 凭据配置（维护操作的唯一入口）

推送用 Personal Access Token（classic），**scopes 必须含 `repo` + `workflow`**（后者用于 CI 文件；缺它推送 `.github/workflows/` 会被拒，表现为 Contents API 返回 404）。

**安全传递方式（不要写入任何文件）**：

```bash
AUTH=$(node -e "console.log(Buffer.from('x-access-token:<TOKEN>').toString('base64'))")
git -c http.extraHeader="Authorization: Basic $AUTH" push origin main
```

- 不要把 token 写进 `.git/config`、remote URL 或任何提交——remote 保持无凭据的 `https://github.com/BO0401/facet.git`
- token 过期/轮换：让用户在 https://github.com/settings/tokens 重新生成，只在新对话里提供
- 若宿主环境本身是 Electron 应用（见第 4 节陷阱 1），跑 electron 子进程前先清 `ELECTRON_RUN_AS_NODE`

## 10. 已知限制（如实告知任何协作者）

| 限制 | 说明 |
|---|---|
| GUI 细节未经人工验收 | 原生文件对话框、菜单每一项、滚动同步的视觉正确性依赖人工使用验证；自动化覆盖不到 |
| GFM 扩展不在 652 例内 | 表格、删除线、双链、脚注、数学是 FaceT 扩展，其正确性由单元测试 + 冒烟 + 人工验收保证，不在 CommonMark 规范测试范围 |
| 仅 Windows 打包验证 | 发布产物只在 win32-x64 上实测；CI 跑 mac/linux 测试但未产出那些平台的安装包 |
| MIT→CC 的兼容性 | CC BY-NC-SA 4.0 不是 OSI 开源协议；部分公司政策禁用 NC 内容，贡献者需知情（见 LICENSE 摘要） |

## 11. 用户背景与协作偏好（维持这些风格）

- 作者：BO0401（bo天天开心），GitHub 提交邮箱 `Zzhang200801@outlook.com`（已验证）
- 项目定位：**个人使用**，无商业化意图；明确排除许可激活/反盗版类功能（见 docs/SCOPE.md 排除节）
- 内容风格要求：基于权威来源，**禁止编造**；冷静干净，无激励性废话；用数据说话
- 协作模式：用户吩咐 → AI 执行到底 → 交付结果；不需要中途频繁确认
- 后续维护由用户在对话中直接提出（功能、bug、文档、发版），按第 8 节流程执行

## 12. 换 AI 接手时的检查清单

新的 AI 助手第一次会话应按序确认：

- [ ] 能访问本仓库（clone 或已有本地副本）
- [ ] `npm install` 成功（electron 二进制就位）
- [ ] `npm test` 四套测试全绿（确认环境无损）
- [ ] 已读 README、docs/SCOPE.md、docs/ARCHITECTURE.md、本文档
- [ ] 已读第 4 节环境陷阱与第 9 节凭据配置（避免重复踩坑）
- [ ] 拿到有效 PAT（repo + workflow scope）再尝试任何推送操作
