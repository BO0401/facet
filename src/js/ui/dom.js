/* dom.js — 极小 DOM 工具集（无第三方依赖） */

/* 创建元素：el('div.cls#id', {attrs}, [children|string]) */
export function el(spec, attrs, children) {
  const m = /^([a-z0-9-]*)((?:[.#][a-z0-9_-]+)*)$/i.exec(spec);
  if (!m) throw new Error('bad spec: ' + spec);
  const node = document.createElement(m[1] || 'div');
  if (m[2]) {
    for (const part of m[2].match(/[.#][a-z0-9_-]+/gi)) {
      if (part[0] === '.') node.classList.add(part.slice(1));
      else node.id = part.slice(1);
    }
  }
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === null || v === undefined || v === false) continue;
      if (k === 'text') node.textContent = String(v);
      else if (k === 'html') node.innerHTML = String(v);
      else if (k === 'dataset') Object.assign(node.dataset, v);
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  if (children === null || children === undefined) return parent;
  if (Array.isArray(children)) {
    for (const c of children) append(parent, c);
  } else if (children instanceof Node) {
    parent.appendChild(children);
  } else {
    parent.appendChild(document.createTextNode(String(children)));
  }
  return parent;
}

export const $ = (sel, root) => (root || document).querySelector(sel);
export const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/* 事件委托：on(root, 'click', '.sel', handler) */
export function on(root, type, selector, handler) {
  root.addEventListener(type, (ev) => {
    const t = ev.target.closest(selector);
    if (t && root.contains(t)) handler(ev, t);
  });
}

/* HTML 属性/文本转义（命名避开 core/tex.js 的 esc，单文件构建时防作用域冲突） */
export function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* 防抖 */
export function debounce(fn, ms) {
  let t = 0;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
