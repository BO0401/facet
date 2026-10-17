/* toast.js — 轻量通知 */
import { el, clear } from './dom.js';

let host = null;

function ensureHost() {
  if (host) return host;
  host = el('div#toast-host');
  document.body.appendChild(host);
  return host;
}

export function toast(msg, kind = 'info', ms = 2600) {
  const node = el('div.toast', { class: kind, text: msg });
  ensureHost().appendChild(node);
  requestAnimationFrame(() => node.classList.add('show'));
  setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 300);
  }, ms);
  return node;
}

export function toastError(msg) { return toast(msg, 'error', 4000); }
