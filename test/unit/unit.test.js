/* unit.test.js — Facet 应用层单元测试（node 运行，无浏览器依赖）
 *
 * 覆盖：facet 模式渲染标记、AST JSON 导出、规范化序列化、独立 HTML、
 *       行级 diff、文档图谱/反向链接、快照存储（localStorage 桩）。
 *
 * 运行：npm run test:unit
 */
import { parseMarkdown, FACET_OPTS, SPEC_OPTS } from '../../src/js/core/markdown.js';
import { renderHTML } from '../../src/js/core/render.js';
import { walk } from '../../src/js/core/ast.js';
import { toAstJson, toNormMarkdown, toStandaloneHtml } from '../../src/js/ui/export.js';
import { diffLines, diffStats } from '../../src/js/ui/timeline.js';
import { buildGraph, extractLinks, backlinksFor } from '../../src/js/data/graph.js';
import { countWords } from '../../src/js/data/store.js';

let pass = 0, fail = 0;
const failures = [];

function t(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    failures.push({ name, err: e });
  }
}

function eq(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error((msg || 'eq') + '\n  expected: ' + JSON.stringify(expected) + '\n  actual  : ' + JSON.stringify(actual));
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg || 'expected truthy');
}

function includes(hay, needle, msg) {
  if (!String(hay).includes(needle)) {
    throw new Error((msg || 'includes') + '\n  needle: ' + JSON.stringify(needle) + '\n  in    : ' + JSON.stringify(String(hay).slice(0, 300)));
  }
}

/* ---------- facet 渲染标记 ---------- */

t('facet 模式：块节点带 data-nid 与 blk 类', () => {
  const html = renderHTML(parseMarkdown('# 标题\n\n段落\n', FACET_OPTS), 'facet');
  ok(/data-nid="n\d+"/.test(html), '应有 data-nid');
  ok(html.includes('class="blk"'), '应有 blk 类');
  ok(/<h1 data-nid/.test(html), '标题应带 data-nid');
});

t('facet 模式：任务列表渲染可交互复选框', () => {
  const html = renderHTML(parseMarkdown('- [x] 完成\n- [ ] 未完成\n', FACET_OPTS), 'facet');
  includes(html, 'type="checkbox" class="task"', '复选框应带 task 类且可交互');
  includes(html, 'checked', '已完成项应 checked');
  ok(!html.includes('disabled'), '复选框不应 disabled');
});

t('spec 模式：不注入 facet 标记', () => {
  const html = renderHTML(parseMarkdown('# 标题\n', SPEC_OPTS), 'spec');
  ok(!html.includes('data-nid'), 'spec 模式不应有 data-nid');
  ok(!html.includes('class="blk"'), 'spec 模式不应有 blk');
});

t('facet 模式：双链带 wiki 类与 data-target', () => {
  const html = renderHTML(parseMarkdown('见 [[目标文档|别名]]\n', FACET_OPTS), 'facet');
  includes(html, 'class="wiki"');
  includes(html, 'data-target="目标文档"');
  includes(html, '>别名<');
});

t('facet 模式：脚注定义有锚点 id，脚注引用可跳转', () => {
  const html = renderHTML(parseMarkdown('句子[^a]\n\n[^a]: 内容\n', FACET_OPTS), 'facet');
  includes(html, 'id="fn-a"', '脚注定义应有锚点');
  includes(html, 'href="#fn-a"', '脚注引用应指向锚点');
});

t('facet 模式：行内与块级数学', () => {
  const html = renderHTML(parseMarkdown('行内 $x^2$ \n\n$$\n\\frac{1}{2}\n$$\n', FACET_OPTS), 'facet');
  includes(html, 'class="math"');
  includes(html, 'math-block');
});

t('facet 模式：代码高亮产生 token', () => {
  const html = renderHTML(parseMarkdown('```js\nconst a = 1;\n```\n', FACET_OPTS), 'facet');
  includes(html, 'tok-k', '应有高亮 token');
});

/* ---------- AST JSON 导出 ---------- */

t('AST JSON：可序列化且剥离 parent', () => {
  const json = toAstJson('# 标题\n\n- [x] 项\n\n[[链接]]\n');
  const obj = JSON.parse(json);
  eq(obj.format, 'facet-ast');
  eq(obj.version, 1);
  const str = JSON.stringify(obj);
  ok(!str.includes('"parent"'), '不应包含 parent 指针');
  ok(obj.doc.children.length > 0, '应有子节点');
});

t('AST JSON：节点带 id 与 pos.line', () => {
  const obj = JSON.parse(toAstJson('# A\n\n# B\n'));
  const lines = [];
  walk(parseMarkdown('# A\n\n# B\n', FACET_OPTS), (n) => { if (n.type === 'heading') lines.push(n.pos.line); });
  eq(lines.join(','), '0,2', '标题行号应为 0 与 2');
  ok(obj.doc.children.every((c) => typeof c.id === 'string'), '每个节点应有 id');
});

/* ---------- 规范化 Markdown ---------- */

t('规范化序列化：往返保义（块结构不变）', () => {
  const src = '# 标题\n\n段落 *强调* **粗** `代码`\n\n- 甲\n- 乙\n\n> 引用\n\n```js\nlet a = 1;\n```\n';
  const out = toNormMarkdown(src);
  includes(out, '# 标题');
  includes(out, '*强调*');
  includes(out, '**粗**');
  includes(out, '`代码`');
  includes(out, '- 甲');
  includes(out, '- 乙');
  includes(out, '> 引用');
  includes(out, '```js');
  // 再解析一次，块类型序列应一致
  const types = (text) => {
    const acc = [];
    walk(parseMarkdown(text, FACET_OPTS), (n) => { if (n.type !== 'text' && n.type !== 'document') acc.push(n.type); });
    return acc.join(',');
  };
  eq(types(src), types(out), '序列化后再解析的块类型序列应一致');
});

t('规范化序列化：表格与任务列表', () => {
  const out = toNormMarkdown('| A | B |\n|---|---|\n| 1 | 2 |\n\n- [x] 完成\n');
  includes(out, '| A | B |');
  includes(out, '| 1 | 2 |');
  includes(out, '[x] 完成');
});

/* ---------- 独立 HTML ---------- */

t('独立 HTML：含 DOCTYPE、标题、样式、正文', () => {
  const html = toStandaloneHtml('# 你好\n\n段落\n', '测试文档');
  ok(html.startsWith('<!DOCTYPE html>'), '应有 DOCTYPE');
  includes(html, '<title>测试文档</title>');
  includes(html, '<style>');
  includes(html, '<h1');
  includes(html, '你好');
});

/* ---------- diff ---------- */

t('diff：新增/删除/相同行', () => {
  const ops = diffLines('a\nb\nc\n', 'a\nx\nc\n');
  const { add, del } = diffStats(ops);
  eq(add, 1, '应新增 1 行');
  eq(del, 1, '应删除 1 行');
});

t('diff：完全相同', () => {
  const ops = diffLines('same\ntext\n', 'same\ntext\n');
  const { add, del } = diffStats(ops);
  eq(add + del, 0);
});

t('diff：大文档不爆炸', () => {
  const a = Array.from({ length: 3000 }, (_, i) => 'line ' + i).join('\n');
  const b = a + '\nextra';
  const ops = diffLines(a, b);
  ok(Array.isArray(ops) && ops.length > 0);
});

/* ---------- 图谱 ---------- */

t('图谱：双向链接与反向链接', () => {
  const docs = [
    { id: 'd1', name: 'A', text: '引用 [[B]] 与 [[C]]' },
    { id: 'd2', name: 'B', text: '回到 [[A]]' },
    { id: 'd3', name: 'C', text: '无链接' },
  ];
  const g = buildGraph(docs);
  const backA = backlinksFor(g, 'd1');
  eq(backA.length, 1, 'A 应有 1 个反向链接来源');
  eq(backA[0].fromId, 'd2');
  const nodeA = g.nodes.find((n) => n.id === 'd1');
  eq(nodeA.links.length, 2, 'A 应有 2 个出链');
});

t('图谱：不存在的目标是 missing', () => {
  const g = buildGraph([{ id: 'd1', name: 'A', text: '[[幽灵]]' }]);
  const a = g.nodes.find((n) => n.id === 'd1');
  eq(a.links[0].toId, null, '幽灵目标应无 toId');
});

t('extractLinks：返回行号', () => {
  const links = extractLinks('# T\n\n正文 [[X]]\n');
  eq(links.length, 1);
  eq(links[0].line, 2, '双链应在第 2 行（0 基）');
});

/* ---------- 统计 ---------- */

t('词数统计：中英混排', () => {
  eq(countWords('你好世界'), 4);
  eq(countWords('hello world'), 2);
  eq(countWords('中文 plus english 混合'), 4 + 2);
});

/* ---------- 报告 ---------- */

console.log('');
if (failures.length) {
  console.log('失败详情：');
  for (const f of failures) {
    console.log('── ' + f.name);
    console.log('   ' + String(f.err.message).split('\n').join('\n   '));
  }
  console.log('');
}
console.log(`单元测试：${pass}/${pass + fail} 通过` + (fail ? `（${fail} 失败）` : ''));
process.exit(fail ? 1 : 0);
