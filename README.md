# Facet · 切面

> **One source, many facets.** —— 一份源码，多个切面。

本地优先的结构化 Markdown 工作台。把 Typora 藏进黑盒的 `Markdown → AST → HTML`
双向管线完整外化：**源码 / AST / 渲染三态同屏**，AST 是一等公民，导出只是换个渲染器。

## 为什么做这个

对 Typora 1.12.3 做逆向还原时发现：它的 `19 MarkParser`（解析）、`13 NodeDef`
（AST）、`12 Node2Mark`（回写）、`14 Node2HTML`（渲染）四件套在内部非常清晰，
但产品决策是把它们全部关进黑盒——源码区是 `hidden` 的，AST 从不暴露。

Facet 的反推决策：**AST 不该是被隐藏的实现细节，它应该是用户可以直接看到、
点击、操作、并作为一切转换基准的一等公民。**

> Typora 让你相信"你写的东西就是它显示的样子"；
> Facet 让你知道"你写的东西，先变成一棵树，再变成任何样子"。

## 功能

| 能力 | 说明 |
|---|---|
| **三态同屏** | 源码 / 渲染 / AST 分屏或单独切换；点任意一态，另两态跟随定位高亮 |
| **AST 检视器** | 树形展开、类型 + 关键属性标注、节点 id 与源行号可见 |
| **WYSIWYG 渲染** | 表格、数学（轻量 TeX 子集）、代码高亮、图表围栏、脚注、YAML、任务列表 |
| **任务列表可交互** | 点渲染区的复选框，源码同步改写（经 AST 行号回写） |
| **大纲** | 由 AST 遍历直接生成，点击跳转 |
| **双链与反向链接** | `[[wikilink]]` 连通「哪些文档引用了这一篇」 |
| **快照时间轴** | 停止输入 2s 自动存档（可手动），可预览、回滚、行级 diff |
| **导出** | `.md` / 规范化 `.md` / 独立 `.html` / `.ast.json`（IR 可交换）/ 打印 PDF |
| **主题** | 浅色 / 深色 |
| **查找替换** | 支持正则、区分大小写、全部替换 |
| **本地文件 IO** | Electron 原生对话框；Web 端 File System Access API 降级 |

引擎是**自有实现**，CommonMark 0.31.2 规范 **652/652 用例全部通过**
（真实通过率见 [docs/TESTING.md](docs/TESTING.md)）。

明确**不做**（个人使用场景，见 [docs/SCOPE.md](docs/SCOPE.md)）：
许可激活 / 反盗版 / 机器指纹 / 试用倒计时、遥测、自动更新、云图床、账号系统。

## 快速开始

### 桌面版（Windows exe）

下载 `release/` 下的便携版单文件，双击即用（首次运行解压到临时目录）。
或从源码构建：

```bash
npm install
npm run dist        # 产出 release/Facet-Portable-<version>.exe
```

### Web 版

`dist/facet.web.html` 是单文件、零依赖、离线可用的完整版，双击即可打开。

### 开发

```bash
npm install
npm start           # Electron 开发模式
npm test            # 规范 + 单元 + 冒烟测试
```

详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [docs/SCOPE.md](docs/SCOPE.md) | 范围基准：仿照清单 / 新增 / 明确排除 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构、目录、关键设计决策、与 Typora 模块对应关系 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 环境、命令、工作流、构建产物、调试技巧 |
| [docs/TESTING.md](docs/TESTING.md) | 测试基线：652/652 真实通过率与修复记录 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 提交规范与贡献流程 |

## 技术栈

- **运行时**：零第三方依赖（引擎、TeX 子集、代码高亮全部自研）；electron 仅为桌面外壳
- **语言**：原生 ES Module + 原生 DOM
- **打包**：electron-packager / electron-builder / iexpress 兜底
- **测试**：CommonMark 652 例规范测试 + 19 项单元测试 + 构建冒烟

## 许可

MIT，见 [LICENSE](LICENSE)。CommonMark 规范测试数据为 CC-BY-4.0（CommonMark spec）。

## 声明

本项目为**功能反推设计**的独立实现：未使用、未复制任何 Typora 源码。
逆向结论本身受限于静态分析与 V8 字节码不可反编译。
