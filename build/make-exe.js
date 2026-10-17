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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = join(ROOT, 'release');
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

/* 探测 electron-builder 是否可用：直接解析其 Node 入口（不依赖 npx/shell） */
function hasBuilder() {
  try {
    const req = createRequire(join(ROOT, 'package.json'));
    const bin = req.resolve('electron-builder/out/cli/cli.js');
    return existsSync(bin) ? bin : null;
  } catch (e) {
    return null;
  }
}

mkdirSync(RELEASE, { recursive: true });

const builderCli = hasBuilder();
if (!builderCli) {
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
mkdirSync(join(ROOT, '.tmp'), { recursive: true });
writeFileSync(cfgPath, JSON.stringify(builderConfig, null, 2), 'utf8');

try {
  /* 直接用 Node 运行 electron-builder 的 CLI 入口，避开 npx/.cmd 的
     Windows spawn 限制（.cmd 需要 shell:true 才能启动） */
  const r = spawnSync(process.execPath, [builderCli, '--config', cfgPath, '--win', 'portable'], {
    encoding: 'utf8', stdio: 'inherit', cwd: ROOT,
  });
  if (r.status !== 0) throw new Error('electron-builder 退出码 ' + r.status);
} catch (e) {
  console.error('');
  console.error('electron-builder 失败：' + e.message);
  console.error('常见原因与对策：');
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
