/* main.cjs — Electron 主进程
 *
 * Facet 的桌面外壳：提供原生文件对话框与菜单。
 * 渲染层与 Web 版完全同源（index.html + src/js/**），此处只做原生能力桥接。
 */
'use strict';

const path = require('path');
const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');

const isDev = !app.isPackaged;
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 720,
    minHeight: 480,
    title: 'Facet · 切面',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#f6f7f9',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'index.html'));
  if (isDev) mainWindow.webContents.openDevTools({ mode: 'bottom' });

  mainWindow.on('closed', () => { mainWindow = null; });
  buildMenu();
}

/* ---------- 原生文件 IO ---------- */

ipcMain.handle('facet:open', async () => {
  const r = await dialog.showOpenDialog(mainWindow, {
    title: '打开 Markdown 文件',
    filters: [
      { name: 'Markdown', extensions: ['md', 'markdown', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  });
  if (r.canceled || !r.filePaths.length) return null;
  const p = r.filePaths[0];
  const fs = require('fs');
  try {
    return { name: path.basename(p), text: fs.readFileSync(p, 'utf8'), path: p };
  } catch (e) {
    dialog.showErrorBox('打开失败', String(e && e.message || e));
    return null;
  }
});

ipcMain.handle('facet:save', async (_ev, name, text, prevPath) => {
  const fs = require('fs');
  let p = prevPath || null;
  if (!p) {
    const r = await dialog.showSaveDialog(mainWindow, {
      title: '保存 Markdown 文件',
      defaultPath: name,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (r.canceled || !r.filePath) return null;
    p = r.filePath;
  }
  try {
    fs.writeFileSync(p, text, 'utf8');
    return { name: path.basename(p), path: p };
  } catch (e) {
    dialog.showErrorBox('保存失败', String(e && e.message || e));
    return null;
  }
});

ipcMain.handle('facet:save-as', async (_ev, name, text) => {
  const fs = require('fs');
  const r = await dialog.showSaveDialog(mainWindow, {
    title: '另存为',
    defaultPath: name,
    filters: [{ name: 'Markdown', extensions: ['md'] }],
  });
  if (r.canceled || !r.filePath) return null;
  try {
    fs.writeFileSync(r.filePath, text, 'utf8');
    return { name: path.basename(r.filePath), path: r.filePath };
  } catch (e) {
    dialog.showErrorBox('保存失败', String(e && e.message || e));
    return null;
  }
});

/* ---------- 菜单 ---------- */

function send(channel) {
  if (mainWindow) mainWindow.webContents.send(channel);
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: '文件',
      submenu: [
        { label: '新建文档', accelerator: 'CmdOrCtrl+N', click: () => send('menu:new') },
        { label: '打开…', accelerator: 'CmdOrCtrl+O', click: () => send('menu:open') },
        { type: 'separator' },
        { label: '保存', accelerator: 'CmdOrCtrl+S', click: () => send('menu:save') },
        { label: '另存为…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:save-as') },
        { type: 'separator' },
        {
          label: '导出',
          submenu: [
            { label: 'Markdown (.md)', click: () => send('menu:export-md') },
            { label: '独立 HTML', click: () => send('menu:export-html') },
            { label: 'AST JSON', click: () => send('menu:export-json') },
          ],
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '查找替换', accelerator: 'CmdOrCtrl+F', click: () => send('menu:find') },
        { label: '手动快照', accelerator: 'CmdOrCtrl+Shift+K', click: () => send('menu:snapshot') },
        { type: 'separator' },
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { label: '仅源码', accelerator: 'CmdOrCtrl+1', click: () => send('menu:view-src') },
        { label: '仅渲染', accelerator: 'CmdOrCtrl+2', click: () => send('menu:view-render') },
        { label: '仅 AST', accelerator: 'CmdOrCtrl+3', click: () => send('menu:view-ast') },
        { label: '三态分屏', accelerator: 'CmdOrCtrl+4', click: () => send('menu:view-split') },
        { type: 'separator' },
        { label: '切换主题', accelerator: 'CmdOrCtrl+Shift+D', click: () => send('menu:theme') },
        { type: 'separator' },
        { role: 'reload' }, { role: 'toggleDevTools' }, { role: 'resetZoom' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: 'GitHub 仓库',
          click: () => shell.openExternal('https://github.com/your-name/facet'),
        },
        {
          label: '关于 Facet',
          click: () => dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '关于 Facet',
            message: 'Facet · 切面',
            detail: 'One source, many facets.\n本地优先的结构化 Markdown 工作台。\n版本 ' + app.getVersion(),
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ---------- 生命周期 ---------- */

app.whenReady().then(createWindow);

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
