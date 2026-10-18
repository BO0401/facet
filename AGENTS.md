# AGENTS.md — AI 维护者指令卡

本仓库由 AI 助手协作维护。完整交接文档见 [HANDOFF.md](HANDOFF.md)，本文件只放最关键的约束。

## 项目

FaceT（品牌名）/ `facet`（机器名）——Markdown 工作台，AST 一等公民，三态同屏。自有 CommonMark 0.31.2 引擎，规范测试 652/652。零运行时第三方依赖。详见 README.md。

## 铁律

1. 改 `src/js/core/` 后必须 `npm run test:spec`，**必须 652/652**
2. 不得引入运行时第三方依赖（electron 仅为桌面外壳）
3. 命名冻结：小写 `'facet'`（渲染模式名）、`facet.*.v1`（存储键）、URL 中的 `facet` 不可改名；品牌名统一 `FaceT`（规范见 docs/NAMING.md）
4. 不添加许可激活/反盗版/机器指纹类功能（作者个人使用，docs/SCOPE.md 明确排除）
5. 内容基于权威来源，禁止编造；风格冷静干净，无废话

## 常用命令

```bash
npm install        # electron 二进制走 npmmirror 镜像（见 HANDOFF.md 第 4 节）
npm test           # 规范 + 单元 + 冒烟（提交前必跑）
npm run test:electron   # Electron e2e（17 断言）
npm run build      # 产出 dist/facet.web.html + build/app/
npm run dist       # 产出 release/FaceT-Portable-<版本>.exe
```

## 环境陷阱（速查）

- 宿主是 Electron 应用时，子进程会继承 `ELECTRON_RUN_AS_NODE=1` 导致 electron.exe 退化为纯 Node——跑前先 delete 该变量
- 无 GPU 环境 GPU 进程崩溃——加 `--disable-gpu --disable-software-rasterizer --no-sandbox`
- Windows 上不要 `spawnSync('npx.cmd')`——用 Node API 或 `process.execPath`
- PAT 推送需 `repo` + `workflow` 双 scope；经 `git -c http.extraHeader` 传递，不写入任何文件

完整 8 条陷阱表、代码地图、发版流程、凭据配置见 [HANDOFF.md](HANDOFF.md)。
