<div align="center">

# FaceT · 切面

**One source, many facets.** —— 一份源码，多个切面。

**把 Markdown 的 AST 中间层做成一等公民的本地工作台。**
A Markdown workbench that treats the AST as a first-class citizen —
source / render / AST panes in sync, offline-first, zero runtime dependencies.

[![License: CC BY-NC-SA 4.0](https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc-sa/4.0/)
[![CI](https://github.com/BO0401/facet/actions/workflows/ci.yml/badge.svg)](https://github.com/BO0401/facet/actions/workflows/ci.yml)
[![CommonMark](https://img.shields.io/badge/CommonMark-652%2F652-brightgreen.svg)](docs/TESTING.md)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Web-blue.svg)](#快速开始--quick-start)
[![Runtime deps](https://img.shields.io/badge/runtime_deps-0-brightgreen.svg)](#技术栈--tech-stack)

</div>

## FaceT 是什么

FaceT 是一个**本地优先（local-first）、离线可用**的 Markdown 编辑器与阅读工作台。
与常见 Markdown 编辑器（Typora、Obsidian、MarkText 等）最大的不同：它把
`Markdown → AST → HTML` 这条通常被藏进黑盒的双向管线**完整外化**——

你可以在同一屏里同时看到**源码（Source）、渲染结果（Render）、语法树（AST）**
三个切面，点其中任何一个，另外两个跟随定位。AST 不是实现细节，而是你**可以直接
查看、点击、操作，并作为导出与一切转换基准**的一等公民。

关键词覆盖：`markdown editor` · `markdown reader` · `AST viewer` · `WYSIWYG` ·
`three-pane` · `CommonMark 0.31.2` · `wikilink` · `backlinks` · `Electron` ·
`offline-first` · `note-taking` · `zero-dependency`

如果你在寻找一个 **Typora alternative**：FaceT 是功能反推后的**独立实现**
（未复制任何 Typora 源码，见[声明](#声明--disclaimer)），且额外提供 Typora
没有的 AST 三态工作台。

## 为什么做 FaceT

对 Typora 1.12.3 做逆向还原时发现：它的 `19 MarkParser`（解析）、`13 NodeDef`
（AST）、`12 Node2Mark`（回写）、`14 Node2HTML`（渲染）四件套在内部非常清晰，
但产品决策是把它们全部关进黑盒——源码区是 `hidden` 的，AST 从不暴露。

FaceT 的反推决策：**AST 不该是被隐藏的实现细节，它应该是用户可以直接看到、
点击、操作、并作为一切转换基准的一等公民。**

> Typora 让你相信"你写的东西就是它显示的样子"；
> FaceT 让你知道"你写的东西，先变成一棵树，再变成任何样子"。

## 功能特性

| 能力 | 说明 |
|---|---|
| **三态同屏** | 源码 / 渲染 / AST 分屏或单独切换；点任意一态，另两态跟随定位高亮 |
| **AST 检视器** | 树形展开、类型 + 关键属性标注、节点 id 与源行号可见、仅块级过滤 |
| **WYSIWYG 渲染** | 表格（含对齐）、数学（轻量 TeX 子集）、代码高亮、图表围栏、脚注、YAML 前言、删除线 |
| **任务列表可交互** | 点渲染区的复选框，源码同步改写（经 AST 行号回写） |
| **大纲** | 由 AST 遍历直接生成，点击跳转 |
| **双链与反向链接** | `[[wikilink]]` 连通「哪些文档引用了这一篇」 |
| **快照时间轴** | 停止输入 2s 自动存档（可手动），可预览、回滚、行级 LCS diff |
| **导出** | `.md` / 规范化 `.md` / 独立 `.html` / `.ast.json`（AST 作为 IR 可交换）/ 打印 PDF |
| **主题** | 浅色 / 深色 |
| **查找替换** | 支持正则、区分大小写、全部替换 |
| **本地文件 IO** | Electron 原生对话框；Web 端 File System Access API 降级；无账号、无云、无遥测 |

引擎是**自有实现**，CommonMark 0.31.2 规范 **652/652 用例全部通过**
（真实通过率与修复记录见 [docs/TESTING.md](docs/TESTING.md)）。

明确**不做**（个人使用场景，见 [docs/SCOPE.md](docs/SCOPE.md)）：
许可激活 / 反盗版 / 机器指纹 / 试用倒计时、遥测、自动更新、云图床、账号系统。

## 快速开始 / Quick Start

### 桌面版（Windows 便携 exe）

从 [Releases](https://github.com/BO0401/facet/releases/latest) 下载
`FaceT-Portable-<version>.exe`，双击即用（单文件自包含，首次运行解压到临时目录，
卸载即删临时目录，不留垃圾）。

### Web 单文件版

`dist/facet.web.html` 是**单文件、零依赖、离线可用**的完整版（约 190 KB），
双击即可打开，也可直接分发这一个文件。

### 从源码构建

```bash
git clone https://github.com/BO0401/facet.git
cd facet
npm install
npm start              # Electron 开发模式
npm run dist           # 产出 release/FaceT-Portable-<version>.exe
```

测试与打包命令详见 [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)。

## 质量与测试

| 层级 | 基线 | 内容 |
|---|---|---|
| CommonMark 0.31.2 规范 | **652/652（100.00%）** | 与参考实现差分测试，逐字节对齐 |
| 应用层单元测试 | 19/19 | 渲染标记、AST JSON、序列化往返、diff、图谱、统计 |
| 构建冒烟 | 13 断言 | DOM 桩执行单文件产物 |
| Electron 端到端 | **17/17** | 真实 BrowserWindow + 渲染进程探针（启动/原生桥/三态/交互） |

报告的数字全部真实跑出，不谎报——方法论与抓到的缺陷清单见
[docs/TESTING.md](docs/TESTING.md)。

## 文档

| 文档 | 内容 |
|---|---|
| [HANDOFF.md](HANDOFF.md) | **维护交接文档**：接手步骤、环境陷阱、质量红线、代码地图、发版流程、凭据配置（自包含，换 AI 维护先读这个） |
| [AGENTS.md](AGENTS.md) | AI 维护者指令卡（铁律 + 命令速查，多数 AI 编码工具自动读取） |
| [docs/NAMING.md](docs/NAMING.md) | 命名规范：品牌名 / 仓库名 / 代码标识符三层规则 |
| [docs/SCOPE.md](docs/SCOPE.md) | 范围基准：仿照清单 / 新增 / 明确排除 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 架构、目录、关键设计决策、与 Typora 模块对应关系 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 环境、命令、工作流、构建产物、调试技巧 |
| [docs/TESTING.md](docs/TESTING.md) | 测试基线：652/652 真实通过率、e2e 17/17、修复记录 |
| [CHANGELOG.md](CHANGELOG.md) | 版本历史 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 提交规范与贡献流程 |

## 技术栈

- **运行时**：零第三方依赖（CommonMark 引擎、TeX 子集、代码高亮全部自研）；electron 仅为桌面外壳
- **语言**：原生 ES Module + 原生 DOM（无框架）
- **打包**：electron-packager（可运行目录）/ electron-builder（单文件便携版）/ 自有模块展平器（Web 单文件）
- **测试**：CommonMark 652 例规范测试 + 19 项单元测试 + 构建冒烟 + Electron 端到端 17 项

## 许可 / License

[CC BY-NC-SA 4.0](https://creativecommons.org/licenses/by-nc-sa/4.0/)
（知识共享署名-非商业性使用-相同方式共享 4.0 国际许可协议）：

- ✅ **允许**：个人使用、学习、研究、修改、非商业分发
- ❌ **不允许**：商业使用（含基于本作品的商业发行）——需先获得授权
- 📋 **要求**：再分发时保留署名与许可链接，演绎作品以相同协议分发

CommonMark 规范测试数据为 CC-BY-4.0（CommonMark spec），详见
[docs/TESTING.md](docs/TESTING.md)。

## 声明 / Disclaimer

本项目为**功能反推设计**的独立实现：未使用、未复制任何 Typora 源码。
逆向结论本身受限于静态分析与 V8 字节码不可反编译。
产品名 FaceT 与 Typora 无关联。

---

<div align="center">

**FaceT · 切面** — One source, many facets.
Copyright © 2026 [bo天天开心](https://github.com/BO0401)

</div>
