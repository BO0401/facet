/* ast.js — FaceT AST 基础设施
 * 每个节点带稳定 id 与源行号 pos.line（0 基），这是三态联动的锚点。
 */
let SEQ = 0;

export function resetIds() { SEQ = 0; }
export function nid() { return 'n' + (++SEQ); }

export function N(type, props) {
  const n = { type, id: nid(), children: [] };
  if (props) Object.assign(n, props);
  return n;
}

/* 深度优先遍历所有块级与行内节点 */
export function walk(node, enter) {
  if (enter(node) === false) return;
  const kids = node.children || [];
  for (const c of kids) walk(c, enter);
  if (node.items) for (const it of node.items) {
    walk(it, enter);
    if (it.sub) for (const s of it.sub) walk(s, enter);
  }
}

/* 行内节点的纯文本（用于图片 alt、大纲标题、状态栏统计） */
export function plainText(node) {
  if (!node) return '';
  switch (node.type) {
    case 'text': return node.value || '';
    case 'code': return node.value || '';
    case 'html_inline': return node.value || '';
    case 'softbreak': return '\n';
    case 'linebreak': return '\n';
    case 'math': return node.value || '';
    case 'wikilink': return node.alias || node.target || '';
    case 'footref': return '[' + (node.ref || '') + ']';
    default:
      return (node.children || []).map(plainText).join('');
  }
}

/* 块级节点判定（AST 树视图用） */
export const BLOCK_TYPES = new Set([
  'document', 'paragraph', 'heading', 'block_quote', 'list', 'item',
  'code_block', 'html_block', 'thematic_break', 'table', 'math_block',
  'diagram', 'yaml', 'footnote_def',
]);
