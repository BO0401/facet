/* bundle-smoke.js — 用最小 DOM 桩在 node 里跑单文件构建产物
 *
 * 目的：不依赖浏览器验证 dist/facet.web.html 的内联脚本能完整执行：
 * 模块拼接无引用错误、App 能启动、渲染管线产出预期 HTML。
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ---------- 最小 DOM 桩 ---------- */

class ClassList {
  constructor(node) { this.node = node; this.set = new Set(); }
  add(...c) { for (const x of c) this.set.add(x); }
  remove(...c) { for (const x of c) this.set.delete(x); }
  toggle(c, force) {
    const want = force === undefined ? !this.set.has(c) : force;
    if (want) this.set.add(c); else this.set.delete(c);
    return want;
  }
  contains(c) { return this.set.has(c); }
}

class Elem {
  constructor(tag) {
    this.tagName = String(tag || 'div').toUpperCase();
    this.children = [];
    this.childNodes = this.children;
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this._text = '';
    this._html = '';
    this.classList = new ClassList(this);
    this.parentNode = null;
    this.listeners = {};
    this.value = '';
    this.id = '';
    this.title = '';
    this.checked = false;
    this.scrollTop = 0;
    this.scrollHeight = 100;
    this.clientHeight = 50;
    this.selectionStart = 0;
  }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k]; }
  addEventListener(type, fn) { (this.listeners[type] = this.listeners[type] || []).push(fn); }
  removeEventListener() {}
  dispatch(type, ev) { for (const fn of this.listeners[type] || []) fn(ev || { target: this, preventDefault() {}, currentTarget: this }); }
  closest() { return null; }
  contains() { return false; }
  getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
  scrollIntoView() {}
  focus() {}
  select() {}
  setSelectionRange(a, b) { this.selectionStart = a; this.selectionEnd = b; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get textContent() { return this._text; }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); }
  click() { this.dispatch('click'); }
}

/* 依据 index.html 的 id 建桩 */
const IDS = ['docname', 'doclist', 'btn-new', 'btn-open', 'btn-save', 'btn-save-as', 'btn-snap',
  'export', 'btn-theme', 'src', 'render', 'src-wrap', 'view-wrap', 'ast-pane', 'ast-tree',
  'btn-blockonly', 'btn-expand', 'btn-find', 'find-host', 'st-state', 'st-words', 'st-lines',
  'st-nodes', 'st-cur', 'pane-outline', 'pane-links', 'pane-snaps', 'find-input', 'repl-input',
  'findbar'];
const byId = new Map();
for (const id of IDS) {
  const e = new Elem(id === 'src' ? 'textarea' : (id === 'doclist' || id === 'export' ? 'select' : (id === 'docname' || id === 'find-input' || id === 'repl-input' ? 'input' : 'div')));
  e.id = id;
  byId.set(id, e);
}
const body = new Elem('body');
body.dataset = {};
const head = new Elem('head');
const documentElement = new Elem('html');
documentElement.dataset = {};

const documentStub = {
  body,
  documentElement,
  createElement: (t) => new Elem(t),
  createTextNode: (t) => { const e = new Elem('#text'); e._text = String(t); return e; },
  createDocumentFragment: () => new Elem('#fragment'),
  getElementById: (id) => byId.get(id) || null,
  querySelector: (sel) => {
    const m = /^#([\w-]+)$/.exec(sel);
    if (m) return byId.get(m[1]) || null;
    if (sel === 'body') return body;
    return null;
  },
  querySelectorAll: () => [],
  addEventListener: () => {},
};

const store = new Map();
globalThis.document = documentStub;
globalThis.window = {
  document: documentStub,
  addEventListener: () => {},
  location: { hash: '', origin: 'file://' },
  localStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  },
  requestAnimationFrame: (fn) => setTimeout(fn, 0),
  setTimeout,
};
globalThis.localStorage = globalThis.window.localStorage;
globalThis.location = globalThis.window.location;
globalThis.requestAnimationFrame = globalThis.window.requestAnimationFrame;
globalThis.Node = Elem;

/* ---------- 执行构建产物 ---------- */

const html = readFileSync(join(ROOT, 'dist', 'facet.web.html'), 'utf8');
const m = html.match(/<script>\n([\s\S]*?)\n<\/script>/);
if (!m) { console.error('未找到内联脚本'); process.exit(1); }

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓ ' + name);
  else { console.log('  ✗ ' + name); failed++; }
}

try {
  // 包一层以捕获运行期错误
  new Function(m[1])();
  console.log('内联脚本执行：无异常');
} catch (e) {
  console.error('内联脚本执行失败：', e && e.stack || e);
  process.exit(1);
}

await new Promise((r) => setTimeout(r, 50)); // 等 start() 的异步链路

const app = globalThis.window.__facet;
check('window.__facet 已挂载', !!app);
check('当前文档已加载', !!app.doc);
check('源码已填入', byId.get('src').value.length > 100);
check('渲染产物含标题', byId.get('render').innerHTML.includes('<h1'));
check('渲染产物含表格', byId.get('render').innerHTML.includes('<table'));
check('渲染产物含复选框', byId.get('render').innerHTML.includes('class="task"'));
check('渲染产物含双链', byId.get('render').innerHTML.includes('class="wiki"'));
check('渲染产物含脚注区', byId.get('render').innerHTML.includes('footdef'));
check('渲染产物含 data-nid', byId.get('render').innerHTML.includes('data-nid'));
check('AST 树已渲染', byId.get('ast-tree').children.length > 0);
check('大纲已渲染', byId.get('pane-outline').children.length > 0);
check('状态栏词数已更新', Number(byId.get('st-words')._text) > 0);
check('词数统计合理', Number(byId.get('st-words')._text) > 10);

console.log(failed ? `\n冒烟测试失败 ${failed} 项` : '\n冒烟测试全部通过');
process.exit(failed ? 1 : 0);
