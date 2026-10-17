/* panes.js — 三态同屏与双向映射（Facet 的核心交互）
 *
 * 源码（textarea）/ 渲染（facet HTML）/ AST（树）三态共享同一棵 AST：
 *   源码改动 → 重新解析 → 渲染 + AST 刷新
 *   任意一态的点击/光标 → 另两态定位高亮（锚点是节点 id 与 pos.line）
 *
 * 架构不变量（来自设计文档）：任何视图的改动都必须经 AST 回到源码，
 * 不允许绕过 AST 直接改 DOM。勾选任务列表即走「AST 定位行 → 改源码」路径。
 */
import { el, clear, on, debounce, escHtml } from './dom.js';
import { parseMarkdown, FACET_OPTS } from '../core/markdown.js';
import { renderHTML } from '../core/render.js';
import { walk } from '../core/ast.js';

export class Panes {
  /**
   * @param {Object} refs { src, render, gutter }
   * @param {Object} hooks {
   *   onParse(ast), onSelectNode(node), onStatus(stat),
   *   onCheckbox(line, checked), onWikilink(target), onRequestSnapshot()
   * }
   */
  constructor(refs, hooks = {}) {
    this.src = refs.src;
    this.renderPane = refs.render;
    this.hooks = hooks;
    this.ast = null;
    this.syncing = 0;          // 滚动同步互斥锁
    this.lastText = null;

    /* 源码输入 → 全链路刷新（150ms 防抖） */
    this.src.addEventListener('input', debounce(() => this.refresh(), 150));

    /* 源码光标 → 就近定位渲染块与 AST 行 */
    this.src.addEventListener('cursor', () => this.locateFromSource());
    this.src.addEventListener('click', () => this.locateFromSource());
    this.src.addEventListener('keyup', (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'PageUp', 'PageDown', 'Home', 'End'].includes(e.key)) {
        this.locateFromSource();
      }
    });

    /* 渲染区点击：块高亮 / 任务勾选 / 双链跳转 */
    on(this.renderPane, 'click', '[data-nid]', (ev, target) => {
      const nid = target.dataset.nid;
      const node = this.findNode(nid);
      if (!node) return;
      if (ev.target.closest('input.task')) return; // 勾选框单独处理
      this.highlightNode(nid, { scrollSource: true, selectAst: true });
      this.hooks.onSelectNode && this.hooks.onSelectNode(node);
    });

    /* 任务列表勾选 → 经 AST 行号回写源码 */
    on(this.renderPane, 'change', 'input.task', (ev, box) => {
      const li = box.closest('[data-nid]');
      const node = li ? this.findNode(li.dataset.nid) : null;
      if (!node || node.pos == null) return;
      this.hooks.onCheckbox && this.hooks.onCheckbox(node.pos.line, box.checked);
    });

    /* 双链点击 */
    on(this.renderPane, 'click', '.wiki', (ev, target) => {
      const t = target.dataset.target;
      if (t && this.hooks.onWikilink) this.hooks.onWikilink(t);
    });

    /* 滚动同步（比例同步 + 互斥） */
    let lock = 0;
    const sync = (from, to) => {
      if (lock) return;
      lock = 1;
      const fr = from.scrollTop / Math.max(1, from.scrollHeight - from.clientHeight);
      to.scrollTop = fr * Math.max(1, to.scrollHeight - to.clientHeight);
      requestAnimationFrame(() => { lock = 0; });
    };
    this.src.addEventListener('scroll', () => sync(this.src, this.renderPane), { passive: true });
    this.renderPane.addEventListener('scroll', () => sync(this.renderPane, this.src), { passive: true });
  }

  /* ---------- 主链路 ---------- */

  setText(text, opts = {}) {
    if (this.src.value !== text) this.src.value = text;
    this.refresh(opts);
  }

  getText() { return this.src.value; }

  refresh(opts = {}) {
    const text = this.src.value;
    this.lastText = text;
    let ast;
    try {
      ast = parseMarkdown(text, FACET_OPTS);
    } catch (e) {
      // 解析异常不应打断编辑：保留上一次 AST，仅报告
      console.error('[facet] parse error', e);
      if (this.ast) ast = this.ast;
      else ast = parseMarkdown('', FACET_OPTS);
    }
    this.ast = ast;
    this.renderPane.innerHTML = renderHTML(ast, 'facet');
    if (this.hooks.onParse) this.hooks.onParse(ast);
    if (this.hooks.onStatus) this.hooks.onStatus(this.stat(ast));
    if (opts.keepHighlight && this.currentNid) this.paintHighlight(this.currentNid);
    if (opts.snapshot) this.hooks.onRequestSnapshot && this.hooks.onRequestSnapshot();
  }

  stat(ast) {
    let blocks = 0, nodes = 0;
    walk(ast, (n) => { nodes++; });
    const countBlocks = (n) => {
      if (n.type !== 'document' && (n.children || []).length === 0 && n.pos) blocks++;
      else if (n.pos && n.type !== 'document') blocks++;
      for (const c of n.children || []) countBlocks(c);
    };
    if (ast) countBlocks(ast);
    const text = this.lastText || '';
    return { nodes, blocks, lines: text ? text.split('\n').length : 0, chars: text.length };
  }

  findNode(nid) {
    let found = null;
    walk(this.ast, (n) => { if (n.id === nid) found = n; });
    return found;
  }

  /* ---------- 高亮与定位 ---------- */

  paintHighlight(nid) {
    for (const n of this.renderPane.querySelectorAll('.hl')) n.classList.remove('hl');
    const target = this.renderPane.querySelector('[data-nid="' + nid + '"]');
    if (target) {
      target.classList.add('hl');
      const r = target.getBoundingClientRect();
      const p = this.renderPane.getBoundingClientRect();
      if (r.top < p.top || r.bottom > p.bottom) {
        target.scrollIntoView({ block: 'nearest' });
      }
    }
    this.currentNid = nid;
  }

  highlightNode(nid, opts = {}) {
    this.paintHighlight(nid);
    const node = this.findNode(nid);
    if (!node) return;
    if (opts.selectAst && this.hooks.onSelectNode) this.hooks.onSelectNode(node);
    if (opts.scrollSource && node.pos) this.jumpSourceToLine(node.pos.line);
  }

  /* 源码光标 → 渲染/AST 就近定位 */
  locateFromSource() {
    if (!this.ast) return;
    const line = this.lineAtCursor();
    let best = null;
    walk(this.ast, (n) => {
      if (!n.pos || n.type === 'document') return;
      if (n.pos.line <= line && (!best || n.pos.line >= best.pos.line)) best = n;
    });
    if (best && best.id !== this.currentNid) {
      this.paintHighlight(best.id);
      if (this.hooks.onSelectNode) this.hooks.onSelectNode(best);
    }
  }

  lineAtCursor() {
    const pos = this.src.selectionStart;
    const upto = this.src.value.slice(0, pos);
    return upto.split('\n').length - 1;
  }

  /* 跳转到源码指定行并选中该行 */
  jumpSourceToLine(line) {
    const lines = this.src.value.split('\n');
    const target = Math.max(0, Math.min(lines.length - 1, line));
    let start = 0;
    for (let i = 0; i < target; i++) start += lines[i].length + 1;
    const end = start + lines[target].length;
    this.src.focus({ preventScroll: true });
    this.src.setSelectionRange(start, end);
    const lineHeight = this.src.scrollHeight / Math.max(1, lines.length);
    this.src.scrollTop = Math.max(0, target * lineHeight - this.src.clientHeight / 2);
  }

  /* 供大纲/反链跳转 */
  jumpToNode(node) {
    if (!node) return;
    this.highlightNode(node.id, { scrollSource: true, selectAst: true });
  }
}
