/* astview.js — AST 检视器
 *
 * 外化 Typora 模块 13（NodeDef）：把内部节点树变成可点击的一等公民。
 * - 块级/行内分层展示，类型 + 关键属性标注
 * - 点击节点 → 回调 onSelect(node)（渲染高亮 + 源码跳转由此驱动）
 * - 「仅块级」过滤、展开/折叠全部
 */
import { el, clear, on, escHtml } from './dom.js';
import { BLOCK_TYPES } from '../core/ast.js';

/* 每个类型的展示信息 */
const TYPE_META = {
  document:    { tag: 'doc',   kind: 'container' },
  paragraph:   { tag: 'p',     kind: 'block' },
  heading:     { tag: 'h1-6',  kind: 'block', prop: (n) => 'level=' + n.depth },
  block_quote: { tag: 'quote', kind: 'container' },
  list:        { tag: 'list',  kind: 'container', prop: (n) => (n.listData && n.listData.type === 'ordered' ? 'ol start=' + n.listData.start : 'ul') + (n.listData && !n.listData.tight ? ' loose' : '') },
  item:        { tag: 'item',  kind: 'container', prop: (n) => n.checked === undefined ? '' : (n.checked ? '☑' : '☐') },
  code_block:  { tag: 'code',  kind: 'block', prop: (n) => n.fenced ? 'fenced ' + (n.lang || '') : 'indented' },
  diagram:     { tag: 'diag',  kind: 'block', prop: (n) => n.lang || '' },
  html_block:  { tag: 'html',  kind: 'block' },
  thematic_break: { tag: 'hr', kind: 'block' },
  table:       { tag: 'table', kind: 'block', prop: (n) => (n.rows ? n.rows.length + 1 : 1) + '行' },
  math_block:  { tag: 'math',  kind: 'block' },
  yaml:        { tag: 'yaml',  kind: 'block' },
  footnote_def:{ tag: 'fn',    kind: 'block', prop: (n) => '^' + (n.ref || '') },
  text:        { tag: 'txt',   kind: 'inline', prop: (n) => preview(n.value) },
  softbreak:   { tag: '⏎',     kind: 'inline' },
  linebreak:   { tag: '␍',     kind: 'inline' },
  emph:        { tag: 'em',    kind: 'inline' },
  strong:      { tag: 'strong',kind: 'inline' },
  del:         { tag: 'del',   kind: 'inline' },
  code:        { tag: '`',     kind: 'inline', prop: (n) => preview(n.value) },
  link:        { tag: 'a',     kind: 'inline', prop: (n) => n.href },
  image:       { tag: 'img',   kind: 'inline', prop: (n) => n.href },
  html_inline: { tag: '<>',    kind: 'inline', prop: (n) => preview(n.value) },
  math:        { tag: 'tex',   kind: 'inline', prop: (n) => preview(n.value) },
  wikilink:    { tag: '[[]]',  kind: 'inline', prop: (n) => '→ ' + n.target },
  footref:     { tag: 'fn*',   kind: 'inline', prop: (n) => '^' + n.ref },
};

function preview(s) {
  if (!s) return '';
  const one = String(s).replace(/\s+/g, ' ').trim();
  return one.length > 24 ? one.slice(0, 24) + '…' : one;
}

export class AstView {
  /**
   * @param {HTMLElement} host
   * @param {{ onSelect?: (node, path:number[]) => void,
   *           onHover?: (node|null) => void,
   *           blockOnly?: boolean }} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.ast = null;
    this.blockOnly = opts.blockOnly !== false;
    this.selectedId = null;
    this.collapsed = new Set();

    host.classList.add('astview');
    on(host, 'click', '.ast-row', (ev, row) => {
      const id = row.dataset.id;
      if (ev.target.closest('.ast-twisty')) {
        if (this.collapsed.has(id)) this.collapsed.delete(id);
        else this.collapsed.add(id);
        this.render();
        return;
      }
      this.select(id);
    });
    on(host, 'mouseover', '.ast-row', (ev, row) => {
      const n = this.findNode(row.dataset.id);
      if (this.opts.onHover) this.opts.onHover(n || null);
    });
    on(host, 'mouseleave', '.ast-row', () => {
      if (this.opts.onHover) this.opts.onHover(null);
    });
  }

  setAst(ast) {
    this.ast = ast;
    this.collapsed.clear();
    this.render();
  }

  setBlockOnly(v) {
    this.blockOnly = v;
    this.render();
  }

  findNode(id) {
    let found = null;
    const walk = (n) => {
      if (found || !n) return;
      if (n.id === id) { found = n; return; }
      for (const c of n.children || []) walk(c);
    };
    walk(this.ast);
    return found;
  }

  select(id) {
    this.selectedId = id;
    const n = this.findNode(id);
    this.render();
    if (n && this.opts.onSelect) {
      const path = [];
      const findPath = (node, trail) => {
        if (!node || path.length) return;
        const t = trail.concat(node.id);
        if (node.id === id) { path.push(...t); return; }
        for (const c of node.children || []) findPath(c, t);
      };
      findPath(this.ast, []);
      this.opts.onSelect(n, path);
    }
  }

  selectByLine(line) {
    // 选中与源码行最接近的块节点（渲染点击 → AST 定位）
    if (!this.ast) return;
    let best = null;
    const walk = (n) => {
      if (!n || !BLOCK_TYPES.has(n.type) || n.type === 'document') return;
      if (n.pos && n.pos.line <= line) {
        if (!best || n.pos.line >= best.pos.line) best = n;
      }
      for (const c of n.children || []) walk(c);
    };
    walk(this.ast);
    if (best) this.select(best.id);
  }

  expandAll() { this.collapsed.clear(); this.render(); }
  collapseAll() {
    this.collapsed.clear();
    const walk = (n, depth) => {
      if (!n || depth < 1) return;
      if ((n.children || []).length) this.collapsed.add(n.id);
      for (const c of n.children || []) walk(c, depth + 1);
    };
    if (this.ast) walk(this.ast.children[0], 0);
    this.render();
  }

  render() {
    if (!this.host) return;
    clear(this.host);
    if (!this.ast) {
      this.host.appendChild(el('div.ast-empty', { text: '（无文档）' }));
      return;
    }
    const frag = document.createDocumentFragment();
    this.renderNode(this.ast, 0, frag, []);
    this.host.appendChild(frag);
  }

  renderNode(node, depth, frag, trail) {
    const meta = TYPE_META[node.type] || { tag: node.type, kind: BLOCK_TYPES.has(node.type) ? 'block' : 'inline' };
    if (this.blockOnly && meta.kind === 'inline' && node.type !== 'text') {
      // 仅块级模式：跳过纯行内节点，但保留其文本预览在父节点上
      return;
    }
    const kids = (node.children || []).filter((c) => {
      const m = TYPE_META[c.type] || {};
      return !(this.blockOnly && m.kind === 'inline');
    });
    const hasKids = kids.length > 0;
    const isCollapsed = this.collapsed.has(node.id);
    const idTrail = trail.concat(node.id);

    const row = el('div.ast-row', {
      class: 'k-' + meta.kind + (this.selectedId === node.id ? ' sel' : ''),
      dataset: { id: node.id, line: node.pos ? node.pos.line : '' },
      style: 'padding-left:' + (depth * 14 + 6) + 'px',
    });
    row.appendChild(el('span.ast-twisty', { text: hasKids ? (isCollapsed ? '▸' : '▾') : '·' }));
    row.appendChild(el('span.ast-type', { text: node.type }));
    const tagEl = el('span.ast-tag', { text: meta.tag });
    row.appendChild(tagEl);
    const prop = meta.prop ? meta.prop(node) : '';
    if (prop) row.appendChild(el('span.ast-prop', { text: prop }));
    if (node.pos) row.appendChild(el('span.ast-pos', { text: 'L' + (node.pos.line + 1) }));
    row.appendChild(el('span.ast-id', { text: node.id }));
    frag.appendChild(row);

    if (hasKids && !isCollapsed) {
      for (const c of kids) this.renderNode(c, depth + 1, frag, idTrail);
    }
  }
}
