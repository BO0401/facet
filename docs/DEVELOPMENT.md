# 开发指南

## 环境要求

- Node.js >= 18（开发用 22 验证）
- Windows / macOS / Linux 均可开发；打包脚本面向 Windows（exe 交付物）

## 快速开始

```bash
git clone <repo> && cd facet
npm install          # 唯一依赖是 electron（开发依赖）
npm start            # 启动 Electron 桌面版（自动 build）
```

纯 Web 版（不装 electron 也能跑）：用任意静态服务器打开项目根目录即可，
例如 `npx serve .` 后访问 `http://localhost:3000`。
**不要用 `file://` 直接打开 `index.html`**——ES Module 在 file 协议下被 CORS 拦。
`dist/facet.web.html` 是单文件版，可以直接双击打开。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm test` | 规范 + 单元 + 冒烟（CI 同款） |
| `npm run test:spec` | CommonMark 652 例 |
| `npm run test:unit` | 应用层单元测试 |
| `npm run test:smoke` | 构建 + 单文件冒烟 |
| `npm run test:electron` | Electron 端到端（需先 `npm install`，17 项断言） |
| `npm run build` | 生成 `dist/facet.web.html` 与 `build/app/` |
| `npm start` | Electron 开发运行 |
| `npm run dist:dir` | 打包成可运行目录（`build/out/Facet-win32-x64/`） |
| `npm run dist` | 打包成单个便携 exe（`release/`） |

## 开发工作流

1. **改引擎**（`src/js/core/**`）：先跑 `npm run test:spec`。规范测试是硬基线，
   任何让 652 例掉出 100% 的改动不得合入。
2. **改应用层**：跑 `npm run test:unit`；涉及构建产物时跑 `npm run test:smoke`。
3. **改 UI**：`npm start` 起 Electron，DevTools 自动打开（`isDev` 时）。
4. **提交**：Conventional Commits（见 `CONTRIBUTING.md`）。
5. **发布**：`npm version <major|minor|patch>` → 更新 `CHANGELOG.md` → 推送 tag。

## 提交信息规范

```
<type>(<scope>): <subject>

type: feat / fix / docs / style / refactor / perf / test / build / ci / chore
scope: core / ui / data / build / docs / test
```

示例：`feat(core): 表格扩展支持对齐分隔行`、`fix(ui): 修正 AST 树折叠状态丢失`。

## 构建产物说明

### `dist/facet.web.html`（单文件 Web 版）

`build/bundle.js` 把全部模块按拓扑序剥掉 import/export 后拼进一个 IIFE。
新增模块时必须同步更新 `build/bundle.js` 里的 `ORDER` 数组，否则链接会
`ReferenceError`（冒烟测试会抓到）。

### `build/app/`（Electron 运行目录）

`index.html` + `src/` + `electron/` + 最小 `package.json`。
electron-packager 把这个目录打成 `Facet.exe`。

### `release/`（单文件便携版）

`build/make-exe.js`：electron-builder 的 portable 目标，产出
`release/Facet-Portable-<version>.exe`（约 68 MB，自包含单文件，双击即用，
首次运行解压到临时目录）。两个打包脚本都直接调用各自的 Node API
（`@electron/packager` / electron-builder 的 CLI 入口），不经过 npx——
Windows 上 `spawn('npx.cmd')` 无法直接启动 `.cmd`。

electron 二进制下载走 npmmirror 镜像（`electronDownload.mirror`），
避免 GitHub releases 限流。

## 端到端测试的环境注意事项

`npm run test:electron` 在以下开发机环境会自动应对（详见 `docs/TESTING.md`）：

- 宿主是 Electron 应用（如 WorkBuddy/VS Code）时，`ELECTRON_RUN_AS_NODE=1`
  会被继承，导致 electron.exe 退化为纯 Node——启动器会清理该变量。
- 无 GPU / 容器 / 沙箱环境 GPU 进程崩溃——自动以 `--disable-gpu` 重试。

## 调试技巧

- 引擎问题：`node test/run-spec.js --section="Tabs" --show=10` 定位到具体用例。
- 渲染问题：浏览器打开 `dist/facet.web.html`，控制台可直接调
  `__facet.panes.refresh()`、`__facet.astView.select('n5')`。
- 解析问题：`node --input-type=module -e "import {parseMarkdown} from './src/js/core/markdown.js'; console.log(JSON.stringify(parseMarkdown('...', {}), (k,v)=>k==='parent'?undefined:v, 2))"`
  （注意 AST 带 parent 指针，JSON 化时必须剔除，否则循环引用）。

## 已知限制

- 图表围栏（mermaid 等）只做源码展示与类型标注，不渲染图形（范围决策，见 `SCOPE.md`）。
- 打印/PDF 借浏览器打印管线，分页控制有限。
- `file://` 直开多文件版不可用（ESM CORS），单文件版无此问题。
