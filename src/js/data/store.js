/* store.js — 本地优先持久化（localStorage）
 *
 * 数据模型：
 *   facet.docs.v1      → { [docId]: { id, name, text, updated } }
 *   facet.snaps.v1     → { [docId]: [ { id, at, text, words } ] }   （按时间正序，最新在尾部）
 *   facet.settings.v1  → { theme, view, sidebarTab, ... }
 *   facet.active.v1    → docId
 *
 * 快照策略（对应 Typora 33 autosave + 49 addBackup 的升级版）：
 *   - 内容停止输入 2s 后自动存档（同一内容不重复存）
 *   - 手动「快照」按钮立即存档
 *   - 单文档最多保留 MAX_SNAPS 条，超出淘汰最旧
 */

const K = {
  docs: 'facet.docs.v1',
  snaps: 'facet.snaps.v1',
  settings: 'facet.settings.v1',
  active: 'facet.active.v1',
};

export const MAX_SNAPS = 50;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) {
    // 配额溢出：淘汰最旧快照后重试一次
    if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
      try {
        const snaps = read(K.snaps, {});
        for (const id of Object.keys(snaps)) if (snaps[id].length > 5) snaps[id] = snaps[id].slice(-5);
        localStorage.setItem(K.snaps, JSON.stringify(snaps));
        localStorage.setItem(key, JSON.stringify(value));
        return true;
      } catch { /* 仍失败则放弃 */ }
    }
    return false;
  }
}

/* ---------- 文档 ---------- */

export function listDocs() {
  const docs = read(K.docs, {});
  return Object.values(docs).sort((a, b) => b.updated - a.updated);
}

export function getDoc(id) {
  return read(K.docs, {})[id] || null;
}

export function saveDoc(doc) {
  const docs = read(K.docs, {});
  const prev = docs[doc.id];
  const next = {
    id: doc.id,
    name: doc.name || (prev && prev.name) || '未命名文档',
    text: doc.text !== undefined ? doc.text : (prev && prev.text) || '',
    updated: Date.now(),
  };
  docs[doc.id] = next;
  if (!write(K.docs, docs)) return null;
  return next;
}

export function deleteDoc(id) {
  const docs = read(K.docs, {});
  delete docs[id];
  write(K.docs, docs);
  const snaps = read(K.snaps, {});
  delete snaps[id];
  write(K.snaps, snaps);
  if (read(K.active, null) === id) write(K.active, null);
}

export function newDoc(name = '未命名文档', text = '') {
  const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const doc = saveDoc({ id, name, text });
  setActiveDoc(id);
  return doc;
}

export function setActiveDoc(id) { write(K.active, id); }
export function getActiveDocId() { return read(K.active, null); }

/* ---------- 快照 ---------- */

export function listSnaps(docId) {
  return read(K.snaps, {})[docId] || [];
}

export function addSnap(docId, text, manual = false) {
  const snaps = read(K.snaps, {});
  const list = snaps[docId] || [];
  const last = list[list.length - 1];
  if (last && last.text === text && !manual) return null; // 内容未变
  const snap = {
    id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    at: Date.now(),
    text,
    words: countWords(text),
    manual,
  };
  list.push(snap);
  while (list.length > MAX_SNAPS) list.shift();
  snaps[docId] = list;
  write(K.snaps, snaps);
  return snap;
}

export function getSnap(docId, snapId) {
  return listSnaps(docId).find((s) => s.id === snapId) || null;
}

export function deleteSnap(docId, snapId) {
  const snaps = read(K.snaps, {});
  if (!snaps[docId]) return;
  snaps[docId] = snaps[docId].filter((s) => s.id !== snapId);
  write(K.snaps, snaps);
}

export function clearSnaps(docId) {
  const snaps = read(K.snaps, {});
  snaps[docId] = [];
  write(K.snaps, snaps);
}

/* ---------- 设置 ---------- */

export function getSettings() {
  return Object.assign({
    theme: 'light',
    view: 'split',        // src | render | ast | split
    sidebar: 'outline',   // outline | links | snaps
    astBlockOnly: true,
    fontSize: 15,
  }, read(K.settings, {}));
}

export function saveSettings(patch) {
  const next = Object.assign(getSettings(), patch);
  write(K.settings, next);
  return next;
}

/* ---------- 统计 ---------- */

export function countWords(text) {
  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) || []).length;
  const latin = (text.replace(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g, ' ')
    .match(/[A-Za-z0-9_'’-]+/g) || []).length;
  return cjk + latin;
}
