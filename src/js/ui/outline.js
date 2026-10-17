/* outline.js — 大纲（由 AST 直接生成，对应 Typora 模块 44 的升级）
 *
 * Typora 的大纲需要单独扫描标题文本；Facet 的大纲就是 AST 遍历的副产品。
 * 点击条目 → 渲染区滚动到对应块 + 源码区跳到对应行。
 */
import { el, clear, on, escHtml } from './dom.js';
import { walk, plainText } from '../core/ast.js';

export class Outline {
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts; // { onJump(node) }
    this.items = [];
    on(host, 'click', '.ol-item', (ev, item) => {
      const id = item.dataset.id;
      const node = this.items.find((n) => n.id === id);
      if (node && this.opts.onJump) this.opts.onJump(node);
    });
  }

  setAst(ast) {
    this.items = [];
    if (ast) {
      walk(ast, (n) => {
        if (n.type === 'heading') this.items.push(n);
      });
    }
    this.render();
  }

  render() {
    clear(this.host);
    if (!this.items.length) {
      this.host.appendChild(el('div.side-empty', { text: '（没有标题）' }));
      return;
    }
    for (const h of this.items) {
      const text = plainText(h).trim() || '（空标题）';
      const row = el('div.ol-item', {
        class: 'lv' + h.depth,
        dataset: { id: h.id, line: h.pos ? h.pos.line : '' },
        title: text,
      });
      row.appendChild(el('span.ol-h', { text: 'H' + h.depth }));
      row.appendChild(el('span.ol-t', { text }));
      this.host.appendChild(row);
    }
  }
}
