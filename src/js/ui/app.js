/* app.js — Facet 应用外壳：把各面板与数据层接起来
 *
 * 状态机：当前文档 → 源码（唯一真源）→ AST → { 渲染, 大纲, AST 树, 图谱, 统计 }
 * 任何面板的改动最终都回到源码文本，再走同一条解析链路。
 */
import { $, $$, clear, el, escHtml, debounce } from './dom.js';
import { toast, toastError } from './toast.js';
import { AstView } from './astview.js';
import { Outline } from './outline.js';
import { Backlinks } from './backlinks.js';
import { Timeline, diffLines, diffStats } from './timeline.js';
import { Find } from './find.js';
import { Panes } from './panes.js';
import { exportAs } from './export.js';
import {
  listDocs, getDoc, saveDoc, deleteDoc, newDoc, setActiveDoc, getActiveDocId,
  listSnaps, addSnap, deleteSnap, clearSnaps, getSettings, saveSettings, countWords,
} from '../data/store.js';
import { buildGraph } from '../data/graph.js';
import { openFile, saveFile, saveFileAs, nativeMode } from '../data/fs.js';

const SEED = `# 欢迎使用 Facet

> **One source, many facets.** —— 一份源码，多个切面。
> 左边写 *Markdown*，中间看渲染，右边看 **AST**。三态共享同一棵树。

## 这是什么

Facet 是一个本地优先的结构化 Markdown 工作台。它把 Typora 藏进黑盒的
\`Markdown → AST → HTML\` 管线完整外化：

- **三态同屏**：源码 / 渲染 / AST，点击任意一态，另两态跟随定位
- **AST 是一等公民**：每个节点有稳定 id 与源行号，是一切映射的锚
- **导出只是换个渲染器**：md / html / JSON(AST) 共用同一棵 AST

## 快速上手

1. 在左侧输入，中间实时渲染
2. 点右侧 AST 节点 → 中间高亮 + 左侧跳行
3. 点中间的块 → 右侧 AST 选中对应节点
4. \`Ctrl/Cmd + F\` 查找替换，\`Ctrl/Cmd + S\` 保存到本地文件
5. 停止输入 2 秒后自动生成快照，右侧「快照」页可回滚与 diff

## 功能清单

| 能力 | 状态 | 说明 |
|---|---|---|
| CommonMark 0.31.2 | ✅ | 652 个规范用例全部通过 |
| 表格 / 数学 / 代码高亮 | ✅ | 行内 \$E=mc^2\$ 与块级公式 |
| 任务列表 | ✅ | 点中间复选框即回写源码 |
| 双链与反向链接 | ✅ | [[欢迎使用 Facet]] |
| 快照时间轴 | ✅ | 自动 + 手动，可 diff |
| 导出 md/html/JSON | ✅ | AST 作为 IR |

试一下（点中间的方框，源码会同步改写）：

- [x] 三态同屏
- [x] AST 一等公民
- [ ] 你的下一个想法

## 代码

\`\`\`js
// Facet 管线：Source → AST → 任意渲染
const ast = parseMarkdown(src, FACET_OPTS);
const html = renderHTML(ast, 'facet');
\`\`\`

## 数学

行内：\$\\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}\$

块级：

\$\$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
\$\$

## 脚注

这是一个带脚注的句子[^note]。

[^note]: 脚注内容会自动收集到文末。

---

*试试切换右上角的视图按钮：源码 / 渲染 / AST / 分屏。*
`;

export class App {
  constructor() {
    this.doc = null;
    this.fileHandle = null;
    this.filePath = null;
    this.graph = { nodes: [], backlinks: {} };
    this.settings = getSettings();
  }

  async start() {
    this.cacheDom();
    this.buildPanels();
    this.bindGlobal();
    this.applyTheme(this.settings.theme);
    this.applyView(this.settings.view);
    this.applyFontSize(this.settings.fontSize);

    /* 文档加载顺序：URL hash → 活动文档 → 种子文档 */
    const hashDoc = location.hash.startsWith('#doc=') ? location.hash.slice(5) : null;
    let doc = (hashDoc && getDoc(hashDoc)) || getDoc(getActiveDocId());
    if (!doc) {
      doc = newDoc('欢迎使用 Facet', SEED);
      addSnap(doc.id, SEED, true);
    }
    await this.openDoc(doc.id, { force: true });

    /*  Electron 菜单动作 */
    if (window.facet && window.facet.onMenu) {
      window.facet.onMenu((action) => this.menu(action));
    }
  }

  cacheDom() {
    this.dom = {
      docname: $('#docname'),
      doclist: $('#doclist'),
      btnNew: $('#btn-new'),
      btnOpen: $('#btn-open'),
      btnSave: $('#btn-save'),
      btnSaveAs: $('#btn-save-as'),
      btnSnap: $('#btn-snap'),
      exportSel: $('#export'),
      btnTheme: $('#btn-theme'),
      viewBtns: $$('#viewgrp [data-view]'),
      sideTabs: $$('#sidetabs [data-tab]'),
      panes: {
        outline: $('#pane-outline'),
        links: $('#pane-links'),
        snaps: $('#pane-snaps'),
      },
      src: $('#src'),
      render: $('#render'),
      srcWrap: $('#src-wrap'),
      viewWrap: $('#view-wrap'),
      astPane: $('#ast-pane'),
      astTree: $('#ast-tree'),
      btnBlockOnly: $('#btn-blockonly'),
      btnExpand: $('#btn-expand'),
      btnFind: $('#btn-find'),
      findHost: $('#find-host'),
      st: {
        state: $('#st-state'),
        words: $('#st-words'),
        lines: $('#st-lines'),
        nodes: $('#st-nodes'),
        cur: $('#st-cur'),
      },
    };
  }

  buildPanels() {
    /* 三态协调器 */
    this.panes = new Panes(
      { src: this.dom.src, render: this.dom.render },
      {
        onParse: (ast) => this.onParse(ast),
        onSelectNode: (node) => this.onSelectNode(node),
        onStatus: (s) => this.onStatus(s),
        onCheckbox: (line, checked) => this.toggleCheckbox(line, checked),
        onWikilink: (target) => this.openWikilink(target),
        onRequestSnapshot: () => this.autoSnap(),
      },
    );

    /* AST 检视器 */
    this.astView = new AstView(this.dom.astTree, {
      onSelect: (node) => this.panes.jumpToNode(node),
      onHover: (node) => {
        if (node && this.panes.currentNid !== node.id) this.panes.paintHighlight(node.id);
      },
    });
    this.astView.setBlockOnly(this.settings.astBlockOnly);

    /* 大纲 */
    this.outline = new Outline(this.dom.panes.outline, {
      onJump: (node) => this.panes.jumpToNode(node),
    });

    /* 反向链接 */
    this.backlinks = new Backlinks(this.dom.panes.links, {
      onOpenDoc: (id) => this.openDoc(id),
      onJumpLine: (docId, line) => this.openDoc(docId, { jumpLine: line }),
      onCreateDoc: (name) => this.createLinkedDoc(name),
    });

    /* 快照时间轴 */
    this.timeline = new Timeline(this.dom.panes.snaps, {
      onPreview: (snap) => this.previewSnap(snap),
      onRollback: (snap) => this.rollbackSnap(snap),
      onDiff: (snap) => this.diffSnap(snap),
      onDelete: (snap) => {
        deleteSnap(this.doc.id, snap.id);
        this.refreshSnaps();
        toast('快照已删除');
      },
    });

    /* 查找替换 */
    this.find = new Find(this.dom.src, {
      onReplace: () => { this.panes.refresh({ keepHighlight: true }); this.markDirty(); },
    }).mount(this.dom.findHost);

    this.refreshDocList();
  }

  bindGlobal() {
    const d = this.dom;
    d.docname.addEventListener('change', () => {
      if (!this.doc) return;
      const name = d.docname.value.trim() || '未命名文档';
      saveDoc({ id: this.doc.id, name });
      this.doc = getDoc(this.doc.id);
      this.refreshDocList();
      this.refreshGraph();
      toast('已重命名为「' + name + '」');
    });

    d.btnNew.addEventListener('click', () => {
      const doc = newDoc('未命名文档', '# 新文档\n');
      this.openDoc(doc.id, { force: true });
      toast('已新建文档');
    });

    d.btnOpen.addEventListener('click', () => this.openFile());
    d.btnSave.addEventListener('click', () => this.saveFile());
    d.btnSaveAs.addEventListener('click', () => this.saveFileAs());

    d.doclist.addEventListener('change', () => {
      const id = d.doclist.value;
      if (id) this.openDoc(id);
    });

    d.btnSnap.addEventListener('click', () => {
      const s = addSnap(this.doc.id, this.panes.getText(), true);
      if (s) { this.refreshSnaps(); toast('已创建快照'); }
    });

    d.exportSel.addEventListener('change', () => {
      const kind = d.exportSel.value;
      d.exportSel.value = '';
      if (!kind) return;
      try {
        const name = exportAs(kind, this.doc.name, this.panes.getText());
        if (name) toast('已导出 ' + name);
      } catch (e) {
        toastError('导出失败：' + e.message);
      }
    });

    d.btnTheme.addEventListener('click', () => {
      this.applyTheme(this.settings.theme === 'light' ? 'dark' : 'light');
    });

    d.viewBtns.forEach((b) => b.addEventListener('click', () => this.applyView(b.dataset.view)));

    d.sideTabs.forEach((b) => b.addEventListener('click', () => this.applySideTab(b.dataset.tab)));

    d.btnBlockOnly.addEventListener('click', () => {
      const v = !this.astView.blockOnly;
      this.astView.setBlockOnly(v);
      d.btnBlockOnly.classList.toggle('on', v);
      saveSettings({ astBlockOnly: v });
    });
    d.btnExpand.addEventListener('click', () => {
      if (this.astView.collapsed.size) this.astView.expandAll();
      else this.astView.collapseAll();
    });
    d.btnFind.addEventListener('click', () => this.find.show());

    /* 快捷键 */
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); this.saveFile(); }
      else if (mod && e.key.toLowerCase() === 'o') { e.preventDefault(); this.openFile(); }
      else if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); this.find.show(); }
      else if (e.key === 'Escape' && this.find.visible) this.find.hide();
    });
  }

  /* ---------- 文档生命周期 ---------- */

  async openDoc(id, opts = {}) {
    const doc = getDoc(id);
    if (!doc) return;
    this.doc = doc;
    setActiveDoc(id);
    location.hash = 'doc=' + id;
    this.dom.docname.value = doc.name;
    this.dom.doclist.value = id;
    this.panes.setText(doc.text, { snapshot: false });
    this.refreshSnaps();
    this.refreshGraph();
    if (opts.jumpLine !== undefined) {
      requestAnimationFrame(() => this.panes.jumpSourceToLine(opts.jumpLine));
    }
    this.setState('已打开「' + doc.name + '」');
  }

  async createLinkedDoc(name) {
    const doc = newDoc(name, '# ' + name + '\n');
    await this.openDoc(doc.id, { force: true });
    toast('已创建「' + name + '」');
  }

  openWikilink(target) {
    const key = String(target).trim().toLowerCase().replace(/\.md$/i, '');
    const hit = this.graph.nodes.find((n) => n.name.trim().toLowerCase().replace(/\.md$/i, '') === key);
    if (hit) this.openDoc(hit.id);
    else this.createLinkedDoc(target);
  }

  async openFile() {
    try {
      const r = await openFile();
      if (!r) return;
      const doc = newDoc(r.name.replace(/\.md$/i, ''), r.text);
      this.fileHandle = r.handle || null;
      this.filePath = r.path || null;
      addSnap(doc.id, r.text, true);
      await this.openDoc(doc.id, { force: true });
      toast('已打开 ' + r.name);
    } catch (e) {
      toastError('打开失败：' + e.message);
    }
  }

  async saveFile() {
    if (!this.doc) return;
    const text = this.panes.getText();
    try {
      const r = await saveFile(this.doc.name + '.md', text, this.fileHandle);
      if (r) {
        if (r.handle) this.fileHandle = r.handle;
        if (r.path) this.filePath = r.path;
        saveDoc({ id: this.doc.id, text });
        this.setState('已保存到 ' + (r.path || r.name));
        toast('已保存');
      } else {
        await this.saveFileAs();
      }
    } catch (e) {
      toastError('保存失败：' + e.message);
    }
  }

  async saveFileAs() {
    const text = this.panes.getText();
    try {
      const r = await saveFileAs(this.doc.name + '.md', text);
      if (r) {
        if (r.handle) this.fileHandle = r.handle;
        if (r.path) this.filePath = r.path;
        saveDoc({ id: this.doc.id, text });
        this.setState('已另存为 ' + (r.path || r.name));
        toast('已另存为');
      }
    } catch (e) {
      toastError('另存为失败：' + e.message);
    }
  }

  /* ---------- 面板刷新 ---------- */

  onParse(ast) {
    this.astView.setAst(ast);
    this.outline.setAst(ast);
    saveDoc({ id: this.doc.id, text: this.panes.getText() });
    this.refreshGraphSoon();
  }

  onSelectNode(node) {
    this.dom.st.cur.textContent = node.id + (node.pos ? ' · L' + (node.pos.line + 1) : '');
  }

  onStatus(s) {
    this.dom.st.words.textContent = countWords(this.panes.getText());
    this.dom.st.lines.textContent = s.lines;
    this.dom.st.nodes.textContent = s.nodes;
  }

  refreshGraphSoon = debounce(() => this.refreshGraph(), 400);

  refreshGraph() {
    const docs = listDocs();
    this.graph = buildGraph(docs);
    this.backlinks.setGraph(this.graph, this.doc ? this.doc.id : null);
  }

  refreshDocList() {
    const docs = listDocs();
    clear(this.dom.doclist);
    for (const d of docs) {
      const o = el('option', { value: d.id, text: d.name });
      if (this.doc && d.id === this.doc.id) o.selected = true;
      this.dom.doclist.appendChild(o);
    }
  }

  refreshSnaps() {
    if (!this.doc) return;
    this.timeline.setSnaps(listSnaps(this.doc.id), this.panes.getText());
  }

  /* ---------- 快照 ---------- */

  autoSnap = debounce(() => {
    if (!this.doc) return;
    addSnap(this.doc.id, this.panes.getText(), false);
    this.refreshSnaps();
  }, 2000);

  previewSnap(snap) {
    if (!snap) { this.panes.refresh(); return; }
    toast('预览：' + new Date(snap.at).toLocaleString() + '（' + snap.words + ' 词）—— 点「回滚」恢复', 'info', 4000);
    this.dom.render.innerHTML = '<div class="snap-preview">' + escHtml(snap.text.slice(0, 4000)) + '</div>';
  }

  rollbackSnap(snap) {
    this.panes.setText(snap.text, { snapshot: true });
    saveDoc({ id: this.doc.id, text: snap.text });
    addSnap(this.doc.id, snap.text, true);
    this.refreshSnaps();
    toast('已回滚到 ' + new Date(snap.at).toLocaleString());
  }

  diffSnap(snap) {
    const ops = diffLines(snap.text, this.panes.getText());
    const { add, del } = diffStats(ops);
    this.showDiffModal(snap, ops, add, del);
  }

  showDiffModal(snap, ops, add, del) {
    const overlay = el('div.modal-overlay');
    const box = el('div.modal.diff');
    box.appendChild(el('div.modal-h', {}, [
      el('span', { text: '差异：快照 ' + new Date(snap.at).toLocaleString() + ' → 当前' }),
      el('span.diff-stat', { text: '+' + add + ' / -' + del }),
    ]));
    const body = el('div.modal-b.diff-body');
    for (const op of ops) {
      if (op.type === 'same') {
        for (const l of op.a) body.appendChild(el('div.dl', { text: l || ' ' }));
      } else if (op.type === 'del') {
        for (const l of op.a) body.appendChild(el('div.dl.del', { text: '- ' + (l || ' ') }));
      } else {
        for (const l of op.b) body.appendChild(el('div.dl.add', { text: '+ ' + (l || ' ') }));
      }
    }
    box.appendChild(body);
    const close = el('button.btn', { text: '关闭' });
    close.addEventListener('click', () => overlay.remove());
    box.appendChild(el('div.modal-f', {}, [close]));
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  /* ---------- 编辑动作 ---------- */

  toggleCheckbox(line, checked) {
    const lines = this.panes.getText().split('\n');
    if (line >= lines.length) return;
    const src = lines[line];
    const m = /^(\s*(?:[*+-]|\d+[.)])\s+)\[([ xX])\](\s+)([\s\S]*)$/.exec(src);
    if (!m) return;
    lines[line] = m[1] + '[' + (checked ? 'x' : ' ') + ']' + m[3] + m[4];
    this.panes.setText(lines.join('\n'), { keepHighlight: true });
    saveDoc({ id: this.doc.id, text: this.panes.getText() });
    this.setState(checked ? '已勾选（L' + (line + 1) + '）' : '已取消勾选（L' + (line + 1) + '）');
  }

  markDirty() {
    saveDoc({ id: this.doc.id, text: this.panes.getText() });
    this.autoSnap();
  }

  /* ---------- 视图/主题 ---------- */

  applyTheme(theme) {
    this.settings.theme = theme;
    document.documentElement.dataset.theme = theme;
    saveSettings({ theme });
    this.dom.btnTheme.textContent = theme === 'light' ? '☾' : '☀';
    this.dom.btnTheme.title = theme === 'light' ? '切换到深色' : '切换到浅色';
  }

  applyView(view) {
    this.settings.view = view;
    saveSettings({ view });
    const b = document.body;
    b.dataset.view = view;
    this.dom.viewBtns.forEach((x) => x.classList.toggle('on', x.dataset.view === view));
  }

  applySideTab(tab) {
    this.settings.sidebar = tab;
    saveSettings({ sidebar: tab });
    this.dom.sideTabs.forEach((x) => x.classList.toggle('on', x.dataset.tab === tab));
    for (const [k, v] of Object.entries(this.dom.panes)) {
      v.classList.toggle('on', k === tab);
    }
  }

  applyFontSize(px) {
    this.settings.fontSize = px;
    saveSettings({ fontSize: px });
    this.dom.src.style.fontSize = px + 'px';
    this.dom.render.style.fontSize = px + 'px';
  }

  setState(text) {
    this.dom.st.state.textContent = text;
  }

  /* ---------- Electron 菜单 ---------- */

  menu(action) {
    switch (action) {
      case 'new': this.dom.btnNew.click(); break;
      case 'open': this.openFile(); break;
      case 'save': this.saveFile(); break;
      case 'save-as': this.saveFileAs(); break;
      case 'find': this.find.show(); break;
      case 'snapshot': this.dom.btnSnap.click(); break;
      case 'theme': this.dom.btnTheme.click(); break;
      case 'view-src': this.applyView('src'); break;
      case 'view-render': this.applyView('render'); break;
      case 'view-ast': this.applyView('ast'); break;
      case 'view-split': this.applyView('split'); break;
      case 'export-md': exportAs('md', this.doc.name, this.panes.getText()); break;
      case 'export-html': exportAs('html', this.doc.name, this.panes.getText()); break;
      case 'export-json': exportAs('json', this.doc.name, this.panes.getText()); break;
      default: break;
    }
  }
}
