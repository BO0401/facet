/* run-spec.js — CommonMark 0.31.2 规范测试运行器
 * 用法：node test/run-spec.js [--section=关键词] [--show=N] [--all]
 * 退出码：全部通过 0，否则 1。
 */
import { readFileSync } from 'node:fs';
import { parseMarkdown } from '../src/js/core/markdown.js';
import { renderHTML } from '../src/js/core/render.js';

const args = process.argv.slice(2);
const argOf = (name) => {
  const a = args.find(x => x.startsWith('--' + name + '='));
  return a ? a.slice(name.length + 3) : null;
};
const sectionFilter = argOf('section');
const showN = argOf('show') ? parseInt(argOf('show'), 10) : (args.includes('--all') ? Infinity : 8);

const spec = JSON.parse(readFileSync(new URL('./spec.json', import.meta.url), 'utf8'));

let pass = 0;
const fails = [];
const bySection = new Map();

for (const ex of spec.examples) {
  if (sectionFilter && !ex.section.toLowerCase().includes(sectionFilter.toLowerCase())) continue;
  let html;
  try {
    const ast = parseMarkdown(ex.example, {});
    html = renderHTML(ast, 'spec');
  } catch (e) {
    html = '!!THREW: ' + e.message;
  }
  if (html === ex.html) {
    pass++;
  } else {
    fails.push(ex);
    bySection.set(ex.section, (bySection.get(ex.section) || 0) + 1);
  }
}

const total = pass + fails.length;
console.log('CommonMark ' + spec.version + ' 规范测试：' + pass + '/' + total + ' 通过（' +
  (100 * pass / total).toFixed(2) + '%）');

if (fails.length) {
  console.log('\n失败分布（按章节）：');
  for (const [sec, n] of [...bySection.entries()].sort((a, b) => b[1] - a[1])) {
    console.log('  ' + String(n).padStart(3) + '  ' + sec);
  }
  console.log('\n失败详情（前 ' + Math.min(showN, fails.length) + ' 个）：');
  for (const ex of fails.slice(0, showN === Infinity ? fails.length : showN)) {
    console.log('\n── [' + ex.section + '] ─────────────────────────────');
    console.log('输入    : ' + JSON.stringify(ex.example));
    console.log('期望    : ' + JSON.stringify(ex.html));
    console.log('实际    : ' + JSON.stringify(ex.html === undefined ? '' : ex.html));
    const got = (() => {
      try { return renderHTML(parseMarkdown(ex.example, {}), 'spec'); } catch (e) { return '!!THREW: ' + e.message; }
    })();
    console.log('得到    : ' + JSON.stringify(got));
    // 首个差异位置
    let i = 0;
    while (i < ex.html.length && i < got.length && ex.html[i] === got[i]) i++;
    if (i < ex.html.length || i < got.length) {
      console.log('差异@' + i + ': 期望 …' + JSON.stringify(ex.html.slice(Math.max(0, i - 20), i + 30)) +
        '  得到 …' + JSON.stringify(got.slice(Math.max(0, i - 20), i + 30)));
    }
  }
}

process.exit(fails.length ? 1 : 0);
