/* bundle.js — 构建产物
 *
 * 1) dist/facet.web.html —— 单文件 Web 版（CSS/JS 全部内联，零依赖离线可用）
 * 2) build/app/ —— Electron 运行目录（index.html + src/ + electron/ + package.json）
 *
 * 单文件化方式：把 <link> 与 <script type="module"> 替换为内联内容。
 * ESM 的 import 在单文件中不可用，因此用 importmap + 展平处理：
 * 由于本项目的模块全部是同源相对路径，直接按依赖序拼接即可——
 * 但更稳妥的做法是保留 ESM：把全部模块内联进一个 <script type="module"> 不行（import 语句仍在）。
 * 所以这里采用「模块内联 + import 语句剥离」策略：按拓扑序拼接各模块的导出声明。
 *
 * 实践经验：这种剥离容易出错。Facet 采用更简单的方案——单文件中保留 ESM 结构，
 * 用 <script type="module"> 内联全部模块源码，import 语句改写为对同一 script 内
 * 顶层声明的引用不可行（ESM 顶层声明在模块作用域）。
 *
 * 结论：Web 单文件版通过「把所有模块包进一个 IIFE 作用域」实现：
 *   每个模块的 export 关键字被移除，import 被替换为解构赋值（见 inlineModule）。
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, existsSync } from 'fs';
import { dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');

/* 模块依赖顺序（拓扑序：被依赖者在前） */
const ORDER = [
  'js/core/entities.js',
  'js/core/text.js',
  'js/core/ast.js',
  'js/core/tex.js',
  'js/core/highlight.js',
  'js/core/inlines.js',
  'js/core/blocks.js',
  'js/core/render.js',
  'js/core/markdown.js',
  'js/data/store.js',
  'js/data/graph.js',
  'js/data/fs.js',
  'js/ui/dom.js',
  'js/ui/toast.js',
  'js/ui/astview.js',
  'js/ui/outline.js',
  'js/ui/backlinks.js',
  'js/ui/timeline.js',
  'js/ui/find.js',
  'js/ui/panes.js',
  'js/ui/export.js',
  'js/ui/app.js',
  'js/main.js',
];

/* 把一个 ESM 模块转成可拼接片段：剥掉 import/export 关键字，收集导出名 */
function inlineModule(code) {
  const exports = [];
  let out = code;

  // 收集导出名
  for (const m of out.matchAll(/export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) {
    exports.push(m[1]);
  }
  for (const m of out.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) exports.push(name);
    }
  }

  // import ... from '...' → 注释（依赖已在同一作用域内前置）
  out = out.replace(/^\s*import\s[^;]*?from\s*['"][^'"]*['"];?\s*$/gm, '');
  // import '...' → 移除
  out = out.replace(/^\s*import\s*['"][^'"]*['"];?\s*$/gm, '');
  // export { ... } → 移除
  out = out.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
  // export default X → X
  out = out.replace(/^\s*export\s+default\s+/gm, '');
  // export const/let/var/function/class → 同名声明
  out = out.replace(/^\s*export\s+(?=(?:async\s+)?(?:const|let|var|function|class)\s)/gm, '');

  return { code: out, exports };
}

function build() {
  /* ---------- 1. Web 单文件 ---------- */
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const css = readFileSync(join(SRC, 'css', 'app.css'), 'utf8');

  const parts = [];
  parts.push('/* Facet 单文件构建产物 —— 由 build/bundle.js 生成，请勿手改 */');
  parts.push('(function(){');
  parts.push("'use strict';");
  for (const rel of ORDER) {
    const full = join(SRC, rel);
    if (!existsSync(full)) throw new Error('missing module: ' + rel);
    const { code } = inlineModule(readFileSync(full, 'utf8'));
    parts.push('/* ===== ' + rel + ' ===== */');
    parts.push(code);
  }
  parts.push('})();');
  const js = parts.join('\n');

  /* 注意：必须用函数式替换——JS 源码里含 '$' 字符（如 mainExtra += '$'），
   * 字符串替换会把 $' / $& 当特殊模式展开，导致产物被污染。 */
  const outHtml = html
    .replace('<link rel="stylesheet" href="src/css/app.css">', () => '<style>\n' + css + '\n</style>')
    .replace('<script type="module" src="src/js/main.js"></script>', () => '<script>\n' + js + '\n</script>');

  mkdirSync(join(ROOT, 'dist'), { recursive: true });
  writeFileSync(join(ROOT, 'dist', 'facet.web.html'), outHtml, 'utf8');
  const kb = (n) => (n / 1024).toFixed(1) + ' KB';
  console.log('dist/facet.web.html      ' + kb(Buffer.byteLength(outHtml)) + '（单文件，零依赖离线可用）');

  /* ---------- 2. Electron 运行目录 ---------- */
  const appDir = join(ROOT, 'build', 'app');
  rmSync(appDir, { recursive: true, force: true });
  mkdirSync(appDir, { recursive: true });
  cpSync(join(ROOT, 'index.html'), join(appDir, 'index.html'));
  cpSync(SRC, join(appDir, 'src'), { recursive: true });
  cpSync(join(ROOT, 'electron'), join(appDir, 'electron'), { recursive: true });
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  writeFileSync(join(appDir, 'package.json'), JSON.stringify({
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    license: pkg.license,
    main: 'electron/main.cjs',
  }, null, 2) + '\n', 'utf8');
  console.log('build/app/               Electron 运行目录已就绪');

  /* ---------- 3. 校验：单文件里不应再出现裸 import/export 与外部引用 ---------- */
  const problems = [];
  if (/^\s*import\s/m.test(outHtml.replace(/<style>[\s\S]*?<\/style>/, ''))) problems.push('残留 import 语句');
  if (/src="src\//.test(outHtml)) problems.push('残留外部 script 引用');
  if (/href="src\//.test(outHtml)) problems.push('残留外部 css 引用');
  if (problems.length) {
    console.error('构建自检失败：' + problems.join('；'));
    process.exit(1);
  }
  console.log('构建自检通过（无外部资源引用）');
}

build();
