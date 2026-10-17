/* make-app.js — 用 Electron 打包出可运行目录（含 Facet.exe）
 *
 * 优先 @electron/packager 的 Node API（不依赖 npx/shell，跨平台稳定）。
 * 产物：build/out/Facet-win32-x64/Facet.exe
 */
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'out');
const APP = join(ROOT, 'build', 'app');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

let packager;
try {
  ({ packager } = await import('@electron/packager'));
} catch (e) {
  console.error('未安装 @electron/packager。请先执行：');
  console.error('  npm i -D @electron/packager');
  process.exit(1);
}

if (!existsSync(APP)) {
  console.error('build/app 不存在，请先运行 npm run build');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

console.log('打包中（首次运行会下载 Electron 运行时 zip，约 1-2 分钟）…');

const paths = await packager({
  dir: APP,
  name: 'Facet',
  platform: 'win32',
  arch: 'x64',
  out: OUT,
  appVersion: pkg.version,
  appCopyright: 'MIT',
  asar: true,
  overwrite: true,
  ignore: /^\/node_modules\/@electron/,
  download: {
    /* 走 npmmirror 的 electron 二进制缓存，避免 GitHub 限流 */
    mirrorOptions: { mirror: 'https://npmmirror.com/mirrors/electron/' },
  },
});

const exe = join(paths[0], 'Facet.exe');
if (!existsSync(exe)) {
  console.error('未找到产物：' + exe);
  process.exit(1);
}
console.log('');
console.log('可运行目录：' + paths[0]);
console.log('入口程序  ：' + exe);
