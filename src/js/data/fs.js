/* fs.js — 文件 IO 抽象层
 *
 * 三档能力，按运行环境自动降级：
 *   1. Electron（preload 注入 window.facet）：原生打开/保存对话框，真实文件路径
 *   2. 浏览器 File System Access API（showOpenFilePicker/showSaveFilePicker）：真实文件句柄
 *   3. 兜底：<input type=file> 打开 + Blob 下载保存
 *
 * 对上层只暴露 open()/save()/saveAs() 三个语义。
 */

const hasFSA = typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

export function nativeMode() {
  if (typeof window !== 'undefined' && window.facet && window.facet.native) return 'electron';
  return hasFSA ? 'fsa' : 'download';
}

export function nativeLabel() {
  return { electron: '原生文件对话框', fsa: '文件系统访问 API', download: '下载/上传' }[nativeMode()];
}

/* 打开：返回 { name, text, path? } 或 null（取消） */
export async function openFile() {
  if (nativeMode() === 'electron') {
    const r = await window.facet.openFile();
    return r || null;
  }
  if (nativeMode() === 'fsa') {
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md', '.markdown', '.txt'] } }],
        multiple: false,
      });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = el_input();
    input.onchange = async () => {
      const f = input.files && input.files[0];
      resolve(f ? { name: f.name, text: await f.text() } : null);
    };
    input.click();
  });
}

function el_input() {
  const i = document.createElement('input');
  i.type = 'file';
  i.accept = '.md,.markdown,.txt,text/markdown,text/plain';
  i.style.display = 'none';
  document.body.appendChild(i);
  setTimeout(() => i.remove(), 60000);
  return i;
}

/* 保存：优先写回原路径/句柄；失败或首次保存时走 saveAs */
export async function saveFile(name, text, handle) {
  if (nativeMode() === 'electron') {
    const r = await window.facet.saveFile(name, text, handle || null);
    return r || null; // { name, path } 或 null（用户取消/需要另存）
  }
  if (handle) {
    try {
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return { name, handle };
    } catch { /* 句柄失效则另存 */ }
  }
  return saveFileAs(name, text);
}

/* 另存为 */
export async function saveFileAs(name, text) {
  if (nativeMode() === 'electron') {
    const r = await window.facet.saveFileAs(name, text);
    return r || null;
  }
  if (nativeMode() === 'fsa') {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: 'Markdown', accept: { 'text/markdown': ['.md'] } }],
      });
      const w = await handle.createWritable();
      await w.write(text);
      await w.close();
      return { name, handle };
    } catch (e) {
      if (e && e.name === 'AbortError') return null;
      throw e;
    }
  }
  downloadBlob(name, text, 'text/markdown;charset=utf-8');
  return { name, handle: null };
}

export function downloadBlob(name, content, mime) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}
