/* backlinks.js — 反向链接 / 文档图谱面板
 *
 * 逆推依据：Typora 的 45（文件搜索）与 44（大纲）从不相连。
 * FaceT 用 [[wikilink]] 把它们接起来：哪些文档引用了当前文档。
 */
import { el, clear, on, escHtml } from './dom.js';

export class Backlinks {
  /**
   * @param {HTMLElement} host
   * @param {{ onOpenDoc(docId), onJumpLine(docId, line), docs }} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.graph = null;
    this.docId = null;
    on(host, 'click', '.bl-doc', (ev, row) => {
      if (ev.target.closest('.bl-line')) return;
      this.opts.onOpenDoc && this.opts.onOpenDoc(row.dataset.doc);
    });
    on(host, 'click', '.bl-line', (ev, row) => {
      this.opts.onJumpLine && this.opts.onJumpLine(row.dataset.doc, Number(row.dataset.line));
    });
  }

  setGraph(graph, docId) {
    this.graph = graph;
    this.docId = docId;
    this.render();
  }

  render() {
    clear(this.host);
    if (!this.graph || !this.docId) {
      this.host.appendChild(el('div.side-empty', { text: '（无文档）' }));
      return;
    }
    const back = (this.graph.backlinks[this.docId] || []);
    const byDoc = new Map();
    for (const b of back) {
      if (!byDoc.has(b.fromId)) byDoc.set(b.fromId, { fromId: b.fromId, fromName: b.fromName, hits: [] });
      byDoc.get(b.fromId).hits.push(b);
    }
    const list = Array.from(byDoc.values()).sort((a, b) => b.hits.length - a.hits.length);

    /* 反向链接区 */
    this.host.appendChild(el('div.side-h', { text: '反向链接 ' + (list.length ? '(' + list.length + ')' : '') }));
    if (!list.length) {
      this.host.appendChild(el('div.side-empty', { text: '还没有文档链接到这里' }));
    }
    for (const d of list) {
      const box = el('div.bl-doc', { dataset: { doc: d.fromId } });
      box.appendChild(el('div.bl-name', { text: d.fromName }));
      const lines = el('div.bl-lines');
      for (const h of d.hits) {
        lines.appendChild(el('button.bl-line', {
          dataset: { doc: d.fromId, line: h.line },
          text: 'L' + ((h.line || 0) + 1) + ' · ' + h.target,
          title: '跳到 ' + d.fromName + ' 第 ' + ((h.line || 0) + 1) + ' 行',
        }));
      }
      box.appendChild(lines);
      this.host.appendChild(box);
    }

    /* 出链区 */
    const me = this.graph.nodes.find((n) => n.id === this.docId);
    this.host.appendChild(el('div.side-h', { text: '出链' }));
    if (!me || !me.links.length) {
      this.host.appendChild(el('div.side-empty', { text: '本文档没有 [[双链]]' }));
    }
    for (const l of (me ? me.links : [])) {
      const row = el('button.bl-out' + (l.toId ? '' : ' missing'), {
        dataset: { doc: l.toId || '' },
        title: l.toId ? '打开 ' + l.target : '目标文档不存在（点击创建）',
      });
      row.appendChild(el('span.bl-o-t', { text: l.target }));
      row.appendChild(el('span.bl-o-l', { text: l.toId ? 'L' + ((l.line || 0) + 1) : '＋ 创建' }));
      if (l.toId) {
        row.addEventListener('click', () => this.opts.onOpenDoc && this.opts.onOpenDoc(l.toId));
      } else {
        row.addEventListener('click', () => this.opts.onCreateDoc && this.opts.onCreateDoc(l.target));
      }
      this.host.appendChild(row);
    }
  }
}
