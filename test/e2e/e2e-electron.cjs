/* e2e-electron.js — FaceT 桌面版端到端验证（自包含启动器）
 *
 * 两种用法：
 *   1) node test/e2e/e2e-electron.js          —— 由 Node 驱动：
 *      自动定位 Electron 二进制，清理 ELECTRON_RUN_AS_NODE（该变量会让
 *      electron.exe 退化为纯 Node，见 docs/TESTING.md「已知环境陷阱」），
 *      启动被测应用，等待 marker 文件后汇总退出码。
 *   2) electron test/e2e/e2e-electron.js     —— 在 Electron 内直接运行：
 *      创建真实 BrowserWindow 加载 index.html，在渲染进程中做 DOM 探针，
 *      结果写入 .tmp/e2e-result.json。
 *
 * 可选环境变量：
 *   FACET_E2E_GPU_ARGS=1  —— 追加 --disable-gpu --disable-software-rasterizer
 *                             （无 GPU/容器/沙箱环境需要）
 *   FACET_E2E_KEEP=1      —— 保留 marker 文件（默认成功后清理）
 */
'use strict';

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const MARKER = path.join(ROOT, '.tmp', 'e2e-result.json');
const RUN_AS_ELECTRON = !!(process.versions.electron && process.type === 'browser');

if (!RUN_AS_ELECTRON) {
  runAsLauncher();
} else {
  runAsElectron();
}

/* ================= 启动器（Node 侧） ================= */

function runAsLauncher() {
  const { spawnSync } = require('child_process');

  const candidates = [
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe'),
    path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron'),
  ];
  const electronBin = candidates.find((p) => fs.existsSync(p));
  if (!electronBin) {
    console.error('未找到 Electron 二进制。请先执行：npm install');
    process.exit(2);
  }

  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE; // 否则 electron.exe 退化为纯 Node 运行
  const gpuFallbackArgs = ['--disable-gpu', '--disable-software-rasterizer', '--no-sandbox'];
  const baseArgs = [path.join(__dirname, 'e2e-electron.cjs')];
  if (process.env.FACET_E2E_GPU_ARGS === '1') baseArgs.push(...gpuFallbackArgs);

  fs.mkdirSync(path.dirname(MARKER), { recursive: true });
  try { fs.unlinkSync(MARKER); } catch (_) {}

  console.log('启动 Electron 端到端验证…');

  let r = spawnSync(electronBin, baseArgs, { encoding: 'utf8', stdio: 'inherit', env, cwd: ROOT });

  if (!fs.existsSync(MARKER)) {
    // 无 GPU / 容器 / 沙箱环境常见：GPU 进程崩溃导致 FATAL。禁用 GPU 重试一次
    // （只影响硬件加速，不影响功能验证覆盖面）。
    console.error('');
    console.error('首次运行未产出结果（多为 GPU 进程不可用），禁用 GPU 加速重试…');
    console.error('（提示：可通过 FACET_E2E_GPU_ARGS=1 跳过首次尝试）');
    console.error('');
    try { fs.unlinkSync(MARKER); } catch (_) {}
    r = spawnSync(electronBin, [...baseArgs, ...gpuFallbackArgs], {
      encoding: 'utf8', stdio: 'inherit', env, cwd: ROOT,
    });
  }

  if (r.status !== 0 && !fs.existsSync(MARKER)) {
    console.error('Electron 进程异常退出，status=' + r.status);
    process.exit(r.status || 1);
  }

  let result;
  try {
    result = JSON.parse(fs.readFileSync(MARKER, 'utf8'));
  } catch (e) {
    console.error('未找到验证结果 marker：' + MARKER);
    process.exit(1);
  }

  const w = Math.max(...result.checks.map((c) => c.name.length)) + 2;
  for (const c of result.checks) {
    const line = '  ' + (c.pass ? '✓' : '✗') + ' ' + c.name.padEnd(w);
    console.log(line + (c.detail ? ' ' + String(c.detail).slice(0, 72) : ''));
  }
  console.log('');
  console.log(
    `Electron ${result.electron} / Chrome ${result.chrome} / Node ${result.node}`
  );
  console.log(`端到端验证：${result.pass}/${result.total} 通过`);

  if (process.env.FACET_E2E_KEEP !== '1') {
    try { fs.unlinkSync(MARKER); } catch (_) {}
  }
  process.exit(result.ok ? 0 : 1);
}

/* ================= 验证体（Electron 侧） ================= */

function runAsElectron() {
  const { app, BrowserWindow } = require('electron');

  const checks = [];
  function check(name, pass, detail) {
    checks.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) });
  }

  app.disableHardwareAcceleration();

  app.whenReady().then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 900,
      show: false,
      webPreferences: {
        preload: path.join(ROOT, 'electron', 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });

    try {
      await win.loadFile(path.join(ROOT, 'index.html'));
      check('loadFile(index.html)', true);
    } catch (e) {
      check('loadFile(index.html)', false, e && e.message);
      return finish();
    }

    // 清空持久化状态并重载：保证每次 e2e 都是「首次启动」视角，
    // 不受上一次运行（如联动测试写入的内容）污染。
    try {
      await win.webContents.executeJavaScript('localStorage.clear()');
      await win.loadFile(path.join(ROOT, 'index.html'));
    } catch (e) {
      check('localStorage 清理与重载', false, e && e.message);
      return finish();
    }

    // 等待应用启动（DOMContentLoaded + 首渲染 + 150ms 防抖）
    await new Promise((r) => setTimeout(r, 1500));

    const probe = await win.webContents.executeJavaScript(`(() => {
      const out = {};
      const $ = (s) => document.querySelector(s);
      out.hasSourceEditor = !!$('#src');
      out.renderHtmlLen = (($('#render') || {}).innerHTML || '').length;
      out.astTreeLen = (($('#ast-tree') || {}).innerHTML || '').length;
      out.outlineLen = (($('#pane-outline') || {}).innerHTML || '').length;
      out.statusText = (($('#statusbar') || {}).textContent || '').trim();
      const dl = $('#doclist');
      out.docOptions = dl && dl.options ? dl.options.length : -1;
      out.hasNativeBridge = typeof window.facet === 'object' && window.facet !== null;
      out.nativeBridgeKeys = out.hasNativeBridge ? Object.keys(window.facet).join(',') : '';
      out.hasCheckbox = !!document.querySelector('#render input.task, #render .task');
      out.hasTable = !!document.querySelector('#render table');
      out.hasWiki = !!document.querySelector('#render .wiki, #render [data-target]');
      out.hasFnAnchor = !!document.querySelector('#render [id^="fn-"]');
      try {
        out.storeKeys = Object.keys(localStorage).sort().join(',');
      } catch (e) { out.storeKeys = 'ERR:' + e.message; }
      return out;
    })()`);

    check('原生桥 window.facet 注入', probe.hasNativeBridge, probe.nativeBridgeKeys);
    check('源码编辑器存在', probe.hasSourceEditor);
    check('渲染面板非空', probe.renderHtmlLen > 500, 'len=' + probe.renderHtmlLen);
    check('AST 树已渲染', probe.astTreeLen > 50, 'len=' + probe.astTreeLen);
    check('大纲已渲染', probe.outlineLen > 10, 'len=' + probe.outlineLen);
    check('状态栏有内容', probe.statusText.length > 0, probe.statusText.split('\n')[0].slice(0, 40));
    check('渲染含任务复选框', probe.hasCheckbox);
    check('渲染含表格', probe.hasTable);
    check('渲染含双链', probe.hasWiki);
    check('渲染含脚注锚点', probe.hasFnAnchor);
    check('文档列表有条目', probe.docOptions > 0, 'options=' + probe.docOptions);
    check('localStorage 四键就绪',
      probe.storeKeys === 'facet.active.v1,facet.docs.v1,facet.settings.v1,facet.snaps.v1',
      probe.storeKeys);

    // 交互：菜单事件送达渲染层（主题切换）
    try {
      win.webContents.send('menu:theme');
      await new Promise((r) => setTimeout(r, 300));
      const theme = await win.webContents.executeJavaScript(
        "document.documentElement.getAttribute('data-theme') || 'unset'"
      );
      check('菜单事件可送达渲染层（主题切换）', theme !== 'unset', 'data-theme=' + theme);
    } catch (e) {
      check('菜单事件可送达渲染层（主题切换）', false, e && e.message);
    }

    // 交互：视图切换
    try {
      win.webContents.send('menu:view-src');
      await new Promise((r) => setTimeout(r, 300));
      const v = await win.webContents.executeJavaScript(
        "(document.documentElement.getAttribute('data-view') || document.body.getAttribute('data-view') || 'unknown')"
      );
      check('视图切换菜单事件生效', v !== 'unknown', 'data-view=' + v);
    } catch (e) {
      check('视图切换菜单事件生效', false, e && e.message);
    }

    // 交互：编辑 → 渲染联动（在源码框输入，渲染面板应更新）
    try {
      await win.webContents.executeJavaScript(`(() => {
        const src = document.querySelector('#src');
        src.value = '# E2E 联动测试\\n\\n输入后渲染面板应出现 h1。';
        src.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await new Promise((r) => setTimeout(r, 400));
      const h1 = await win.webContents.executeJavaScript(
        "!!document.querySelector('#render h1') && document.querySelector('#render h1').textContent"
      );
      check('编辑→渲染联动', !!h1, 'h1=' + h1);
    } catch (e) {
      check('编辑→渲染联动', false, e && e.message);
    }

    // 控制台 error 级输出（在交互发生后继续观察 1.2s）
    const consoleErrors = [];
    const onMsg = (_e, lvl, msg) => { if (lvl >= 2) consoleErrors.push(msg); };
    win.webContents.on('console-message', onMsg);
    await new Promise((r) => setTimeout(r, 1200));
    win.webContents.off('console-message', onMsg);
    check('渲染进程无 error 级控制台输出', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));

    finish();

    function finish() {
      const pass = checks.filter((c) => c.pass).length;
      const result = {
        ok: pass === checks.length,
        pass,
        total: checks.length,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        checks,
        ts: new Date().toISOString(),
      };
      fs.mkdirSync(path.dirname(MARKER), { recursive: true });
      fs.writeFileSync(MARKER, JSON.stringify(result, null, 2), 'utf8');
      app.exit(0);
    }
  });

  app.on('window-all-closed', () => app.quit());
}
