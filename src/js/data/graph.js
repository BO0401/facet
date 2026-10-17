/* graph.js — 文档图谱与反向链接
 *
 * 数据源是各文档 AST 中的 wikilink 节点（[[目标]]）。
 * 反向链接 = 「哪些文档引用了当前文档」。
 * 图谱 = 全部文档的引用关系（侧栏「链接」页 + 状态栏计数）。
 */
import { parseMarkdown, FACET_OPTS } from '../core/markdown.js';
import { walk } from '../core/ast.js';

/* 提取一篇文档中的全部 [[wikilink]] 目标（含行号） */
export function extractLinks(text) {
  const ast = parseMarkdown(text, FACET_OPTS);
  const out = [];
  walk(ast, (n) => {
    if (n.type === 'wikilink') {
      out.push({ target: n.target, alias: n.alias || n.target, line: n.pos ? n.pos.line : null, id: n.id });
    }
  });
  return out;
}

/* 规范化文档名 → wikilink 目标匹配键 */
function norm(s) {
  return String(s || '').trim().toLowerCase().replace(/\.md$/i, '');
}

/* 构建全库图谱：
 * { nodes: [{id,name,links}], backlinks: { [docId]: [{fromId, fromName, line, target}] } } */
export function buildGraph(docs) {
  const byName = new Map();
  for (const d of docs) byName.set(norm(d.name), d);

  const nodes = docs.map((d) => ({ id: d.id, name: d.name, links: [] }));
  const backlinks = {};
  for (const d of docs) backlinks[d.id] = [];

  for (const d of docs) {
    let links;
    try { links = extractLinks(d.text); } catch { continue; }
    const seen = new Set();
    for (const l of links) {
      const key = norm(l.target);
      if (seen.has(key)) continue;
      seen.add(key);
      const target = byName.get(key);
      const node = nodes.find((n) => n.id === d.id);
      node.links.push({ target: l.target, toId: target ? target.id : null, line: l.line });
      if (target && target.id !== d.id) {
        backlinks[target.id].push({ fromId: d.id, fromName: d.name, line: l.line, target: l.target });
      }
    }
  }
  return { nodes, backlinks };
}

/* 当前文档的反向链接（按来源文档聚合） */
export function backlinksFor(graph, docId) {
  const list = graph.backlinks[docId] || [];
  const byDoc = new Map();
  for (const b of list) {
    if (!byDoc.has(b.fromId)) byDoc.set(b.fromId, { fromId: b.fromId, fromName: b.fromName, hits: [] });
    byDoc.get(b.fromId).hits.push(b);
  }
  return Array.from(byDoc.values()).sort((a, b) => b.hits.length - a.hits.length);
}
