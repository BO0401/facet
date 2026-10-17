# 测试

Facet 的质量基线只有一条硬规则：**报告的数字必须是真实跑出来的，不谎报**。

## 运行

```bash
npm test              # 全部：规范 + 单元 + 冒烟
npm run test:spec     # CommonMark 0.31.2 规范 652 例
npm run test:unit     # 应用层单元测试（19 项）
npm run test:smoke    # 构建产物冒烟（先 build 再用 DOM 桩跑单文件）
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

## 4. 覆盖边界（如实声明）

- 规范测试只覆盖 CommonMark 0.31.2；GFM 表格/删除线、数学、双链、脚注、图表、
  YAML 是 Facet 扩展，**不在 652 例之内**，其正确性由单元测试 + 冒烟测试 +
  人工验收保证。
- `dist/facet.web.html` 的浏览器实测（点击交互、滚动同步、主题切换）依赖人工验收；
  node 桩不模拟布局与事件委托的完整链路。
- Electron 打包产物的启动验证需在目标 Windows 环境人工执行（CI 不签名的 exe 无法跑 GUI）。
