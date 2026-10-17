/* export.js — 导出（AST 作为 IR，导出只是换个渲染器）
 *
 * 逆推依据：Typora 的 5b/49/5a/64 各写各的（pandoc 子进程 + pdf-lib）。
 * Facet 全部输出共用同一棵 AST：
 *   .md    源码原文（single source of truth）
 *   .html  完整独立 HTML（内联 CSS，可离线打开/打印）
 *   .json  AST（IR 可交换；剥离 parent 指针）
 *   .md.norm 规范化 Markdown（AST → Markdown 序列化，证明 12 Node2Mark 路径）
 */
import { downloadBlob } from '../data/fs.js';
import { parseMarkdown, FACET_OPTS } from '../core/markdown.js';
import { renderHTML } from '../core/render.js';
import { walk } from '../core/ast.js';

function stripParent(node) {
  const copy = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'parent') continue;
    if (k === 'children' || k === 'head' || k === 'rows') continue;
    copy[k] = v;
  }
  const kids = node.children;
  if (kids && kids.length) copy.children = kids.map(stripParent);
  if (node.head) copy.head = node.head.map((c) => stripInlineCell(c));
  if (node.rows) copy.rows = node.rows.map((r) => r.map((c) => stripInlineCell(c)));
  return copy;
}

function stripInlineCell(cell) {
  // 表格单元格是 { value, children } 形态
  if (cell && cell.children) return { value: cell.value, children: cell.children.map(stripParent) };
  return cell;
}

export function toAstJson(text) {
  const ast = parseMarkdown(text, FACET_OPTS);
  return JSON.stringify({
    format: 'facet-ast',
    version: 1,
    generator: 'Facet',
    doc: stripParent(ast),
  }, null, 2);
}

/* 规范化 Markdown 序列化（AST → 源码，对应 Typora 模块 12 Node2Mark） */
export function toNormMarkdown(text) {
  const ast = parseMarkdown(text, FACET_OPTS);
  return serializeDoc(ast).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function serializeDoc(node) {
  const parts = [];
  for (const c of node.children || []) parts.push(serializeBlock(c));
  return parts.join('\n');
}

function serializeBlock(n) {
  switch (n.type) {
    case 'paragraph': return serializeInlines(n) + '\n';
    case 'heading': return '#'.repeat(n.depth) + ' ' + serializeInlines(n) + '\n';
    case 'block_quote':
      return (n.children || []).map(serializeBlock).join('').split('\n')
        .map((l) => (l ? '> ' + l : '>')).join('\n') + '\n';
    case 'thematic_break': return '---\n';
    case 'code_block':
    case 'diagram':
      return '```' + (n.lang || '') + '\n' + String(n.value || '').replace(/\n$/, '') + '\n```\n';
    case 'math_block': return '$$\n' + String(n.value || '').replace(/\n$/, '') + '\n$$\n';
    case 'yaml': return '---\n' + String(n.value || '').replace(/\n$/, '') + '\n---\n';
    case 'html_block': return String(n.value || '') + '\n';
    case 'list': return (n.children || []).map(serializeBlock).join('\n');
    case 'item': {
      const marker = n.listData && n.listData.type === 'ordered'
        ? (n.listData.start || 1) + n.listData.delimiter + ' '
        : (n.listData ? n.listData.bulletChar : '-') + ' ';
      let body = (n.children || []).map(serializeBlock).join('\n').trim();
      // 任务列表：还原 [x] / [ ] 前缀
      if (n.checked !== null && n.checked !== undefined) {
        body = '[' + (n.checked ? 'x' : ' ') + '] ' + body;
      }
      const pad = ' '.repeat(marker.length);
      return marker + body.split('\n').join('\n' + pad) + '\n';
    }
    case 'footnote_def': return '[^' + n.ref + ']: ' + serializeInlines(n) + '\n';
    case 'table': {
      const head = n.head.map((c) => c.value || '');
      const delim = n.align.map((a) => a === 'center' ? ':---:' : (a === 'right' ? '---:' : (a === 'left' ? ':---' : '---')));
      const rows = n.rows.map((r) => r.map((c) => c.value || ''));
      return ['| ' + head.join(' | ') + ' |', '| ' + delim.join(' | ') + ' |']
        .concat(rows.map((r) => '| ' + r.join(' | ') + ' |')).join('\n') + '\n';
    }
    default: return '';
  }
}

function serializeInlines(n) {
  const out = [];
  for (const c of n.children || []) out.push(serializeInline(c));
  return out.join('');
}

function serializeInline(n) {
  switch (n.type) {
    case 'text': return n.value;
    case 'softbreak': return '\n';
    case 'linebreak': return '\\\n';
    case 'emph': return '*' + serializeInlines(n) + '*';
    case 'strong': return '**' + serializeInlines(n) + '**';
    case 'del': return '~~' + serializeInlines(n) + '~~';
    case 'code': return '`' + n.value + '`';
    case 'math': return '$' + n.value + '$';
    case 'link': return '[' + serializeInlines(n) + '](' + n.href + (n.title ? ' "' + n.title + '"' : '') + ')';
    case 'image': return '![' + (n.alt || '') + '](' + n.href + ')';
    case 'wikilink': return '[[' + n.target + (n.alias && n.alias !== n.target ? '|' + n.alias : '') + ']]';
    case 'footref': return '[^' + n.ref + ']';
    case 'html_inline': return n.value;
    default: return '';
  }
}

const EXPORT_CSS = `:root{color-scheme:light dark}
body{max-width:760px;margin:2rem auto;padding:0 1.2rem;font:16px/1.75 -apple-system,"Segoe UI","Noto Sans SC",sans-serif;color:#1f2328}
pre{background:#f6f8fa;padding:.8rem 1rem;border-radius:6px;overflow:auto;font-size:.88em}
code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace}
p code,li code{background:#f6f8fa;padding:.1em .35em;border-radius:4px}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #d0d7de;padding:.4rem .7rem}
blockquote{border-left:4px solid #d0d7de;margin:0;padding:.2rem 1rem;color:#57606a}
img{max-width:100%}.wiki{border-bottom:1px dashed #0969da;color:#0969da;cursor:pointer}
.footnotes{font-size:.9em;color:#57606a}
@media(prefers-color-scheme:dark){body{background:#0d1117;color:#e6edf3}pre,p code,li code{background:#161b22}th,td{border-color:#30363d}blockquote{border-color:#30363d;color:#8b949e}.wiki{color:#58a6ff;border-color:#58a6ff}}
@media print{body{margin:0;max-width:none}}`;

export function toStandaloneHtml(text, title) {
  const ast = parseMarkdown(text, FACET_OPTS);
  const body = renderHTML(ast, 'facet');
  const t = (title || 'document').replace(/[<>:"/\\|?*]/g, '_');
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
    '<title>' + t.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>\n' +
    '<style>' + EXPORT_CSS + '</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n';
}

export function exportAs(kind, docName, text) {
  const base = (docName || 'document').replace(/\.md$/i, '');
  switch (kind) {
    case 'md':
      downloadBlob(base + '.md', text, 'text/markdown;charset=utf-8');
      return base + '.md';
    case 'md-norm':
      downloadBlob(base + '.norm.md', toNormMarkdown(text), 'text/markdown;charset=utf-8');
      return base + '.norm.md';
    case 'html':
      downloadBlob(base + '.html', toStandaloneHtml(text, base), 'text/html;charset=utf-8');
      return base + '.html';
    case 'json':
      downloadBlob(base + '.ast.json', toAstJson(text), 'application/json;charset=utf-8');
      return base + '.ast.json';
    case 'pdf':
      // 借浏览器打印管线（Typora 用 pandoc+pdf-lib 子进程，Facet 用 print CSS）
      printCurrent();
      return null;
    default:
      throw new Error('unknown export kind: ' + kind);
  }
}

function printCurrent() {
  const text = document.querySelector('#src');
  const html = toStandaloneHtml(text ? text.value : '', 'print');
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => { w.print(); }, 350);
}
