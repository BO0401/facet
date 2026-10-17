/* main.js — FaceT 入口 */
import { App } from './ui/app.js';

const app = new App();
app.start().catch((e) => {
  console.error('[facet] boot failed', e);
  document.body.innerHTML = '<pre style="padding:2rem;color:#c00">FaceT 启动失败：' + String(e && e.stack || e) + '</pre>';
});

/* 暴露给调试与自动化测试 */
window.__facet = app;
