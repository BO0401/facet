# 贡献指南

Facet 目前是个人项目，但工程按可协作标准维护。欢迎 issue 与 PR。

## 提 issue

- **Bug**：附最小复现输入、期望输出、实际输出、运行环境
- **功能建议**：先说明使用场景，再谈实现；与 `docs/SCOPE.md` 排除项冲突的建议会被关闭并说明理由

## 提 PR

1. Fork 并切分支：`feat/xxx` 或 `fix/xxx`
2. **改引擎前先看这条**：`npm run test:spec` 必须保持 652/652。任何让规范通过率
   下降的 PR 不会被合入——这是本项目唯一的硬基线。
3. 改动应用层：`npm run test:unit` 必须全绿
4. 改动构建：`npm run test:smoke` 必须全绿
5. 本地跑一遍 `npm test` 全绿再提交
6. PR 描述写清：改了什么、为什么、怎么验证的

## 提交规范

Conventional Commits，`<type>(<scope>): <subject>`：

| type | 用途 |
|---|---|
| `feat` | 新功能 |
| `fix` | 缺陷修复 |
| `docs` | 仅文档 |
| `refactor` | 重构（行为不变） |
| `perf` | 性能 |
| `test` | 测试 |
| `build` | 构建/打包 |
| `ci` | CI |
| `chore` | 杂务 |

scope 用：`core`（引擎）/ `ui`（界面）/ `data`（数据层）/ `build` / `docs` / `test`。

示例：

```
feat(core): 表格扩展支持对齐分隔行
fix(ui): 修正 AST 树折叠状态在刷新后丢失
test(core): 补充 tabs 章节的列宽边界用例
```

## 代码风格

- 原生 ES Module，不用构建期转译；缩进 2 空格；字符串优先单引号
- 注释写「为什么」而不是「是什么」；引擎代码的关键分支注明与参考实现的对应关系
- 不引入运行时第三方依赖（electron 是唯一的开发依赖，用于桌面外壳）
- 新增模块必须同步 `build/bundle.js` 的 `ORDER` 数组（冒烟测试会验证）

## 发布流程

1. 确认 `npm test` 全绿
2. `npm version patch|minor|major`
3. 更新 `CHANGELOG.md`（如实记录修复与已知限制）
4. `npm run dist` 产出 exe，附到 release
5. 推送 tag
