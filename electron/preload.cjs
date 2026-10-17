/* preload.cjs — 渲染进程桥（contextBridge）
 *
 * 只暴露文件 IO 与菜单转发，不暴露 Node 本体。
 */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('facet', {
  native: true,
  openFile: () => ipcRenderer.invoke('facet:open'),
  saveFile: (name, text, prevPath) => ipcRenderer.invoke('facet:save', name, text, prevPath || null),
  saveFileAs: (name, text) => ipcRenderer.invoke('facet:save-as', name, text),
  onMenu: (cb) => {
    const events = [
      'menu:new', 'menu:open', 'menu:save', 'menu:save-as', 'menu:find', 'menu:snapshot',
      'menu:theme', 'menu:view-src', 'menu:view-render', 'menu:view-ast', 'menu:view-split',
      'menu:export-md', 'menu:export-html', 'menu:export-json',
    ];
    const map = {
      'menu:new': 'new', 'menu:open': 'open', 'menu:save': 'save', 'menu:save-as': 'save-as',
      'menu:find': 'find', 'menu:snapshot': 'snapshot', 'menu:theme': 'theme',
      'menu:view-src': 'view-src', 'menu:view-render': 'view-render',
      'menu:view-ast': 'view-ast', 'menu:view-split': 'view-split',
      'menu:export-md': 'export-md', 'menu:export-html': 'export-html', 'menu:export-json': 'export-json',
    };
    for (const ev of events) ipcRenderer.on(ev, () => cb(map[ev]));
  },
});
