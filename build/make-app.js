/* make-app.js — 用 Electron 打包出可运行目录（含 Facet.exe）
 *
 * 优先 @electron/packager；未安装时给出明确指引。
 * 产物：build/out/Facet-win32-x64/Facet.exe
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'build', 'out');
const APP = join(ROOT, 'build', 'app');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

function hasPackager() {
  const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['--no-install', 'electron-packager', '--version'], {
    encoding: 'utf8', stdio: 'pipe', cwd: ROOT,
  });
  return r.status === 0;
}

if (!existsSync(APP)) {
  console.error('build/app 不存在，请先运行 npm run build');
  process.exit(1);
}
if (!hasPackager()) {
  console.error('未安装 @electron/packager。请先执行：');
  console.error('  npm i -D @electron/packager');
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const args = [
  '--no-install', 'electron-packager',
  APP, 'Facet',
  '--platform=win32', '--arch=x64',
  '--out=' + OUT,
  '--app-version=' + pkg.version,
  '--app-copyright=' + 'MIT',
  '--asar',
  '--overwrite',
  '--ignore=/node_modules/@electron',
];

console.log('打包中（首次运行会下载 Electron 运行时，约 1-2 分钟）…');
const r = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
  encoding: 'utf8', stdio: 'inherit', cwd: ROOT,
});

if (r.status !== 0) {
  console.error('打包失败');
  process.exit(r.status || 1);
}

const exe = join(OUT, 'Facet-win32-x64', 'Facet.exe');
if (!existsSync(exe)) {
  console.error('未找到产物：' + exe);
  process.exit(1);
}
console.log('');
console.log('可运行目录：build/out/Facet-win32-x64/');
console.log('入口程序  ：' + exe);
