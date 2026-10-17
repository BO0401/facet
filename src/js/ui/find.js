/* find.js — 文档内查找替换（对应 Typora 模块 36）
 *
 * 在源码 textarea 上工作：查找用 window.find 语义的自实现（可靠且可高亮全部命中），
 * 替换直接改 textarea 值并触发刷新。
 */
import { el, clear } from './dom.js';

export class Find {
  /**
   * @param {HTMLTextAreaElement} src
   * @param {{ onReplace(): void }} hooks
   */
  constructor(src, hooks = {}) {
    this.src = src;
    this.hooks = hooks;
    this.matches = [];   // [{start, end}]
    this.cursor = -1;
    this.query = '';
    this.useRe = false;
    this.caseSensitive = false;
    this.build();
  }

  build() {
    this.root = el('div#findbar', { class: 'hidden' });
    this.input = el('input#find-input', { type: 'text', placeholder: '查找', spellcheck: 'false' });
    this.count = el('span.find-count', { text: '' });
    this.replInput = el('input#repl-input', { type: 'text', placeholder: '替换为', spellcheck: 'false' });
    this.replRow = el('div.find-repl-row.hidden');
    this.replRow.appendChild(this.replInput);

    const mkBtn = (text, title, fn) => {
      const b = el('button.find-btn', { text, title });
      b.addEventListener('click', fn);
      return b;
    };

    this.root.appendChild(this.input);
    this.root.appendChild(this.count);
    this.root.appendChild(mkBtn('↑', '上一个', () => this.step(-1)));
    this.root.appendChild(mkBtn('↓', '下一个', () => this.step(1)));
    this.root.appendChild(mkBtn('Aa', '区分大小写', (e) => {
      this.caseSensitive = !this.caseSensitive;
      e.currentTarget.classList.toggle('on', this.caseSensitive);
      this.run();
    }));
    this.root.appendChild(mkBtn('.*', '正则表达式', (e) => {
      this.useRe = !this.useRe;
      e.currentTarget.classList.toggle('on', this.useRe);
      this.run();
    }));
    this.root.appendChild(mkBtn('替换', '替换当前命中', () => this.replaceOne()));
    this.root.appendChild(mkBtn('全部', '替换全部命中', () => this.replaceAll()));
    this.root.appendChild(mkBtn('✕', '关闭', () => this.hide()));

    this.input.addEventListener('input', () => this.run());
    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this.step(e.shiftKey ? -1 : 1); }
      if (e.key === 'Escape') this.hide();
    });
  }

  mount(parent) { parent.appendChild(this.root); parent.appendChild(this.replRow); return this; }

  show(initial) {
    this.root.classList.remove('hidden');
    this.replRow.classList.remove('hidden');
    if (initial !== undefined) this.input.value = initial;
    this.input.focus();
    this.input.select();
    this.run();
  }

  hide() {
    this.root.classList.add('hidden');
    this.replRow.classList.add('hidden');
    this.matches = [];
    this.cursor = -1;
    this.count.textContent = '';
  }

  get visible() { return !this.root.classList.contains('hidden'); }

  run() {
    this.query = this.input.value;
    this.matches = [];
    this.cursor = -1;
    if (!this.query) { this.count.textContent = ''; return; }
    const text = this.src.value;
    try {
      if (this.useRe) {
        const re = new RegExp(this.query, this.caseSensitive ? 'gm' : 'gim');
        let m;
        while ((m = re.exec(text)) !== null) {
          this.matches.push({ start: m.index, end: m.index + m[0].length });
          if (m[0].length === 0) re.lastIndex++;
          if (this.matches.length > 10000) break;
        }
      } else {
        const q = this.caseSensitive ? this.query : this.query.toLowerCase();
        const t = this.caseSensitive ? text : text.toLowerCase();
        let i = t.indexOf(q);
        while (i !== -1) {
          this.matches.push({ start: i, end: i + q.length });
          i = t.indexOf(q, i + q.length);
        }
      }
    } catch {
      this.count.textContent = '正则错误';
      return;
    }
    this.count.textContent = this.matches.length ? '1/' + this.matches.length : '无结果';
    if (this.matches.length) {
      // 从当前光标处开始
      const pos = this.src.selectionStart;
      let idx = this.matches.findIndex((m) => m.start >= pos);
      this.cursor = idx === -1 ? 0 : idx;
      this.reveal();
    }
  }

  step(dir) {
    if (!this.matches.length) { this.run(); if (!this.matches.length) return; }
    this.cursor = (this.cursor + dir + this.matches.length) % this.matches.length;
    this.count.textContent = (this.cursor + 1) + '/' + this.matches.length;
    this.reveal();
  }

  reveal() {
    const m = this.matches[this.cursor];
    if (!m) return;
    this.src.focus({ preventScroll: true });
    this.src.setSelectionRange(m.start, m.end);
    const lines = this.src.value.slice(0, m.start).split('\n').length;
    const lineHeight = this.src.scrollHeight / Math.max(1, this.src.value.split('\n').length);
    this.src.scrollTop = Math.max(0, (lines - 1) * lineHeight - this.src.clientHeight / 2);
  }

  replaceOne() {
    const m = this.matches[this.cursor];
    if (!m) return;
    const repl = this.replInput.value;
    this.src.value = this.src.value.slice(0, m.start) + repl + this.src.value.slice(m.end);
    this.hooks.onReplace && this.hooks.onReplace();
    this.run();
    this.step(1);
  }

  replaceAll() {
    if (!this.matches.length) return;
    const repl = this.replInput.value;
    let out = '';
    let last = 0;
    for (const m of this.matches) {
      out += this.src.value.slice(last, m.start) + repl;
      last = m.end;
    }
    out += this.src.value.slice(last);
    const n = this.matches.length;
    this.src.value = out;
    this.hooks.onReplace && this.hooks.onReplace();
    this.run();
    this.count.textContent = '已替换 ' + n + ' 处';
  }
}
