/* timeline.js — 快照时间轴（Typora 33 autosave + 49 addBackup 的升级）
 *
 * 每个快照可预览、可回滚、可与当前版本 diff。
 * diff 为行级 LCS（足够文档场景，体积小零依赖）。
 */
import { el, clear, on, escHtml } from './dom.js';

export class Timeline {
  /**
   * @param {HTMLElement} host
   * @param {{ onRollback(snap), onPreview(snap|null), onDelete(snap), onDiff(snap) }} opts
   */
  constructor(host, opts = {}) {
    this.host = host;
    this.opts = opts;
    this.snaps = [];
    this.currentText = '';
    on(host, 'click', '.tl-item', (ev, item) => {
      if (ev.target.closest('.tl-act')) return;
      this.opts.onPreview && this.opts.onPreview(this.snaps.find((s) => s.id === item.dataset.id) || null);
    });
    on(host, 'click', '.tl-rollback', (ev, btn) => {
      const s = this.snaps.find((x) => x.id === btn.dataset.id);
      if (s) this.opts.onRollback && this.opts.onRollback(s);
    });
    on(host, 'click', '.tl-diff', (ev, btn) => {
      const s = this.snaps.find((x) => x.id === btn.dataset.id);
      if (s) this.opts.onDiff && this.opts.onDiff(s);
    });
    on(host, 'click', '.tl-del', (ev, btn) => {
      const s = this.snaps.find((x) => x.id === btn.dataset.id);
      if (s) this.opts.onDelete && this.opts.onDelete(s);
    });
  }

  setSnaps(snaps, currentText) {
    this.snaps = snaps.slice().sort((a, b) => b.at - a.at); // 最新在上
    this.currentText = currentText;
    this.render();
  }

  render() {
    clear(this.host);
    if (!this.snaps.length) {
      this.host.appendChild(el('div.side-empty', { text: '还没有快照。停止输入 2 秒后会自动存档。' }));
      return;
    }
    for (const s of this.snaps) {
      const row = el('div.tl-item', { dataset: { id: s.id } });
      row.appendChild(el('div.tl-time', { text: fmtTime(s.at) + (s.manual ? ' · 手动' : '') }));
      row.appendChild(el('div.tl-meta', { text: s.words + ' 词 · ' + s.text.length + ' 字符' }));
      const acts = el('div.tl-acts');
      acts.appendChild(el('button.tl-act.tl-rollback', { dataset: { id: s.id }, text: '回滚', title: '用此快照替换当前内容' }));
      acts.appendChild(el('button.tl-act.tl-diff', { dataset: { id: s.id }, text: 'diff', title: '与当前版本比较' }));
      acts.appendChild(el('button.tl-act.tl-del', { dataset: { id: s.id }, text: '✕', title: '删除此快照' }));
      row.appendChild(acts);
      this.host.appendChild(row);
    }
  }
}

function fmtTime(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/* ---------- 行级 diff（LCS） ---------- */

export function diffLines(a, b) {
  const A = a.split('\n'), B = b.split('\n');
  const n = A.length, m = B.length;
  // 大文档保护：超过 2000 行退化为整体替换标记
  if (n * m > 4_000_000) {
    return [{ type: 'replace', a: A, b: B }];
  }
  const dp = new Uint32Array((n + 1) * (m + 1));
  const W = m + 1;
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * W + j] = A[i] === B[j]
        ? dp[(i + 1) * W + j + 1] + 1
        : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (A[i] === B[j]) { out.push({ type: 'same', a: A[i], b: B[j] }); i++; j++; }
    else if (dp[(i + 1) * W + j] >= dp[i * W + j + 1]) { out.push({ type: 'del', a: A[i] }); i++; }
    else { out.push({ type: 'add', b: B[j] }); j++; }
  }
  while (i < n) out.push({ type: 'del', a: A[i++] });
  while (j < m) out.push({ type: 'add', b: B[j++] });
  // 合并相邻同类行
  const merged = [];
  for (const op of out) {
    const last = merged[merged.length - 1];
    if (last && last.type === op.type) { if (op.a !== undefined) last.a.push(op.a); if (op.b !== undefined) last.b.push(op.b); }
    else merged.push({ type: op.type, a: op.a !== undefined ? [op.a] : [], b: op.b !== undefined ? [op.b] : [] });
  }
  return merged;
}

export function diffStats(ops) {
  let add = 0, del = 0;
  for (const op of ops) {
    if (op.type === 'add') add += op.b.length;
    if (op.type === 'del') del += op.a.length;
  }
  return { add, del };
}
