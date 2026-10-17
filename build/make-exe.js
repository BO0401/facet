/* make-exe.js — 产出单个可分发的便携 exe
 *
 * 主路线：electron-builder 的 portable 目标（自包含单文件，双击即用）。
 * 该路线需要能访问 GitHub releases 下载构建工具链（winCodeSign 等）。
 *
 * 若 electron-builder 不可用，脚本会给出明确的手动替代方案而不是产出坏产物。
 *
 * 产物：release/Facet-Portable-<version>.exe
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = join(ROOT, 'release');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function probe(cmd) {
  const r = spawnSync(NPX, ['--no-install', cmd, '--version'], { encoding: 'utf8', stdio: 'pipe', cwd: ROOT });
  return r.status === 0;
}

function run(args) {
  const r = spawnSync(NPX, args, { encoding: 'utf8', stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) throw new Error('命令失败：' + args.join(' '));
}

mkdirSync(RELEASE, { recursive: true });

if (!probe('electron-builder')) {
  console.error('未安装 electron-builder。执行：');
  console.error('  npm i -D electron-builder');
  console.error('');
  console.error('若网络无法访问 GitHub releases（winCodeSign 等工具链来源），');
  console.error('可改用 npm run dist:dir 产出可运行目录 build/out/Facet-win32-x64/，');
  console.error('再用手头的压缩工具制作自解压包。');
  process.exit(1);
}

console.log('使用 electron-builder 打包便携版…');

const builderConfig = {
  appId: 'cn.facet.app',
  productName: 'Facet',
  copyright: 'MIT',
  directories: {
    output: 'release',
    app: 'build/app',
  },
  files: ['**/*'],
  asar: true,
  win: {
    target: 'portable',
  },
  portable: {
    artifactName: 'Facet-Portable-${version}.exe',
  },
  electronDownload: {
    /* 走 npmmirror 的 electron 二进制缓存，避免 GitHub 限流 */
    mirror: 'https://npmmirror.com/mirrors/electron/',
  },
};

const cfgPath = join(ROOT, '.tmp', 'electron-builder.json');
const { writeFileSync } = await import('fs');
mkdirSync(join(ROOT, '.tmp'), { recursive: true });
writeFileSync(cfgPath, JSON.stringify(builderConfig, null, 2), 'utf8');

try {
  run(['--no-install', 'electron-builder', '--config', cfgPath, '--win', 'portable']);
} catch (e) {
  console.error('');
  console.error('electron-builder 失败。常见原因与对策：');
  console.error('  1. 无法访问 GitHub releases → 设置 ELECTRON_BUILDER_BINARIES_MIRROR 或改用 dist:dir');
  console.error('  2. 缺少 build/app → 先 npm run build');
  process.exit(1);
}

const target = join(RELEASE, `Facet-Portable-${pkg.version}.exe`);
if (!existsSync(target)) {
  console.error('未找到预期产物：' + target);
  console.error('请检查 release/ 目录下的实际文件名。');
  process.exit(1);
}
console.log('');
console.log('单文件便携版：' + target);
