/* markdown.js — FaceT Markdown 管线门面
 *
 * 管线：Source --parse--> AST --render--> HTML
 * 模式：
 *   'spec'   纯 CommonMark 0.31.2（测试用，全部扩展关闭）
 *   'facet'  FaceT 完整体验（GFM 扩展 + 数学 + 双链 + 脚注 + 图表 + YAML）
 */
import { parseBlocks } from './blocks.js';
import { renderHTML } from './render.js';

export const FACET_OPTS = {
  strikethrough: true, math: true, wikilinks: true, footrefs: true,
  tables: true, diagrams: true, yaml: true, footnotes: true,
};

export const SPEC_OPTS = {
  strikethrough: false, math: false, wikilinks: false, footrefs: false,
  tables: false, diagrams: false, yaml: false, footnotes: false,
};

/* 解析为 AST（含引用定义表） */
export function parseMarkdown(src, opts) {
  return parseBlocks(src, Object.assign({}, SPEC_OPTS, opts));
}

/* 一步到位：解析并渲染 */
export function render(src, mode) {
  const opts = mode === 'facet' ? FACET_OPTS : SPEC_OPTS;
  const ast = parseBlocks(src, opts);
  return { ast, html: renderHTML(ast, mode) };
}
