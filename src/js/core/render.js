/* render.js — AST → HTML 双模渲染器
 *
 * spec 模式：输出规范 CommonMark HTML（转义/pre/code/br 规则逐字对齐参考实现），
 *           用于 652 个规范用例测试。
 * facet 模式：同一 AST 附加 data-nid 节点映射、语法高亮、TeX 渲染、双链/脚注等
 *           Facet 扩展呈现。两模式共用同一套块/行内遍历与 cr/lit/tag 缓冲逻辑。
 */
import { escapeXml } from './text.js';
import { plainText } from './ast.js';
import { tex, esc } from './tex.js';
import { highlight } from './highlight.js';

class Renderer {
  constructor(facet) {
    this.facet = !!facet;
    this.buffer = '';
    this.lastOut = '\n';
    this.disableTags = 0;
  }

  lit(s) { this.buffer += s; this.lastOut = s; }
  cr() { if (this.lastOut !== '\n') this.lit('\n'); }
  out(s) { this.lit(escapeXml(s)); }

  tag(name, attrs, selfclosing) {
    if (this.disableTags > 0) return;
    this.buffer += '<' + name;
    if (attrs && attrs.length) {
      for (const [k, v] of attrs) this.buffer += ' ' + k + '="' + v + '"';
    }
    if (selfclosing) this.buffer += ' /';
    this.buffer += '>';
    this.lastOut = '>';
  }

  /* 节点附加属性：facet 模式注入 data-nid / class */
  attrs(node, extra) {
    const a = [];
    if (this.facet && node.id) a.push(['data-nid', node.id]);
    if (this.facet && BLOCK_CLASSES.has(node.type)) a.push(['class', 'blk']);
    if (extra) a.push(...extra);
    return a;
  }

  /* ---------- 块 ---------- */
  render(ast) {
    const footnotes = [];
    for (const b of ast.children) {
      if (b.type === 'footnote_def') { footnotes.push(b); continue; }
      this.block(b);
    }
    if (footnotes.length && this.facet) {
      this.cr();
      this.tag('hr', []);
      this.cr();
      this.lit('<section class="footnotes">');
      for (const f of footnotes) {
        this.cr();
        this.lit('<div class="footdef" id="fn-' + esc(f.ref) + '" data-nid="' + f.id + '"><b>[' + esc(f.ref) + ']</b> ');
        this.inlines(f);
        this.lit('</div>');
      }
      this.lit('</section>');
      this.cr();
    }
    return this.buffer;
  }

  block(node) {
    switch (node.type) {
      case 'document':
        for (const c of node.children) this.block(c);
        break;

      case 'paragraph': {
        const gp = node.parent && node.parent.parent;
        const tight = gp && gp.type === 'list' && gp.listData.tight;
        if (tight && !this.facet) {
          // 紧凑列表：不包 <p>，但行内内容照常渲染（与参考实现的 walker 行为一致）
          this.inlines(node);
          return;
        }
        this.cr();
        this.tag('p', this.attrs(node));
        this.inlines(node);
        this.tag('/p');
        this.cr();
        break;
      }

      case 'heading': {
        this.cr();
        this.tag('h' + node.depth, this.attrs(node));
        this.inlines(node);
        this.tag('/h' + node.depth);
        this.cr();
        break;
      }

      case 'code_block': {
        this.cr();
        this.tag('pre', this.attrs(node));
        const attrs = [];
        if (node.lang) {
          let cls = escapeXml(node.lang.split(/\s+/)[0]);
          if (!/^language-/.test(cls)) cls = 'language-' + cls;
          attrs.push(['class', cls]);
        }
        this.tag('code', attrs);
        if (this.facet) this.lit(highlight(node.value, node.lang));
        else this.out(node.value);
        this.tag('/code');
        this.tag('/pre');
        this.cr();
        break;
      }

      case 'diagram': {
        this.cr();
        this.lit('<div' + this.facetAttr(node) + ' class="blk diagram" data-lang="' + esc(node.lang) + '">' +
          '<div class="diagram-tag">[' + esc(node.lang) + ' diagram]</div>' +
          '<pre class="diagram-src">' + esc(node.value.replace(/\n$/, '')) + '</pre></div>');
        this.cr();
        break;
      }

      case 'block_quote': {
        this.cr();
        this.tag('blockquote', this.attrs(node));
        this.cr();
        for (const c of node.children) this.block(c);
        this.cr();
        this.tag('/blockquote');
        this.cr();
        break;
      }

      case 'list': {
        const tagname = node.listData.type === 'bullet' ? 'ul' : 'ol';
        const attrs = this.attrs(node);
        if (node.listData.type === 'ordered' && node.listData.start !== 1) {
          attrs.push(['start', String(node.listData.start)]);
        }
        this.cr();
        this.tag(tagname, attrs);
        this.cr();
        for (const item of node.children) this.block(item);
        this.cr();
        this.tag('/' + tagname);
        this.cr();
        break;
      }

      case 'item': {
        const attrs = this.attrs(node);
        if (this.facet) {
          attrs.push(['class', (node.checked !== null && node.checked !== undefined) ? 'task blk' : 'blk']);
          this.tag('li', attrs);
          if (node.checked !== null && node.checked !== undefined) {
            // 可交互勾选：改动经 panes.js 的 onCheckbox 回到源码
            this.lit('<input type="checkbox" class="task"' + (node.checked ? ' checked' : '') + '>');
          }
          for (const c of node.children) {
            if (c.type === 'paragraph') this.inlines(c);
            else this.block(c);
          }
        } else {
          this.tag('li', attrs);
          for (const c of node.children) this.block(c);
        }
        this.tag('/li');
        this.cr();
        break;
      }

      case 'thematic_break':
        this.cr();
        this.tag('hr', this.attrs(node), true);
        this.cr();
        break;

      case 'html_block':
        this.cr();
        this.lit(node.value);
        this.cr();
        break;

      case 'table': {
        this.cr();
        this.lit('<table' + this.facetAttr(node) + ' class="blk">');
        this.cr();
        this.lit('<thead><tr>');
        node.head.forEach((c, i) => {
          const style = node.align[i] ? ' style="text-align:' + node.align[i] + '"' : '';
          this.lit('<th' + style + '>');
          this.inlines(c);
          this.lit('</th>');
        });
        this.lit('</tr></thead>');
        this.cr();
        this.lit('<tbody>');
        for (const row of node.rows) {
          this.lit('<tr>');
          row.forEach((c, i) => {
            const style = node.align[i] ? ' style="text-align:' + node.align[i] + '"' : '';
            this.lit('<td' + style + '>');
            this.inlines(c);
            this.lit('</td>');
          });
          this.lit('</tr>');
        }
        this.lit('</tbody></table>');
        this.cr();
        break;
      }

      case 'math_block': {
        this.cr();
        this.lit('<div' + this.facetAttr(node) + ' class="blk math-block"><span class="math">' +
          tex(node.value) + '</span></div>');
        this.cr();
        break;
      }

      case 'yaml': {
        this.cr();
        this.lit('<div' + this.facetAttr(node) + ' class="blk yaml-block"><div class="yaml-tag">YAML</div><pre>' +
          esc(node.value) + '</pre></div>');
        this.cr();
        break;
      }

      case 'footnote_def':
        // 由 render() 统一在文末输出
        break;

      default:
        if (node.children) for (const c of node.children) this.block(c);
    }
  }

  facetAttr(node) {
    return this.facet && node.id ? ' data-nid="' + node.id + '"' : '';
  }

  /* ---------- 行内 ---------- */
  inlines(node) {
    for (const c of node.children) this.inline(c);
  }

  inline(node) {
    switch (node.type) {
      case 'text':
        this.out(node.value);
        break;
      case 'softbreak':
        this.lit('\n');
        break;
      case 'linebreak':
        this.tag('br', [], true);
        this.cr();
        break;
      case 'emph':
        this.tag('em', this.attrs(node));
        this.inlines(node);
        this.tag('/em');
        break;
      case 'strong':
        this.tag('strong', this.attrs(node));
        this.inlines(node);
        this.tag('/strong');
        break;
      case 'del':
        this.tag('del', this.attrs(node));
        this.inlines(node);
        this.tag('/del');
        break;
      case 'code':
        this.tag('code', this.attrs(node));
        this.out(node.value);
        this.tag('/code');
        break;
      case 'link': {
        const attrs = this.attrs(node);
        attrs.push(['href', escapeXml(node.href)]);
        if (node.title) attrs.push(['title', escapeXml(node.title)]);
        this.tag('a', attrs);
        this.inlines(node);
        this.tag('/a');
        break;
      }
      case 'image': {
        const attrs = this.attrs(node);
        attrs.push(['src', escapeXml(node.href)]);
        attrs.push(['alt', escapeXml(plainText(node))]);
        if (node.title) attrs.push(['title', escapeXml(node.title)]);
        this.tag('img', attrs, true);
        break;
      }
      case 'html_inline':
        this.lit(node.value);
        break;
      case 'math':
        this.lit('<span' + this.facetAttr(node) + ' class="math">' + tex(node.value) + '</span>');
        break;
      case 'wikilink':
        this.lit('<span' + this.facetAttr(node) + ' class="wiki" data-target="' + esc(node.target) + '">' +
          esc(node.alias) + '</span>');
        break;
      case 'footref':
        this.lit('<sup' + this.facetAttr(node) + ' class="fnref"><a href="#fn-' + esc(node.ref) + '">[' +
          esc(node.ref) + ']</a></sup>');
        break;
      default:
        if (node.children) this.inlines(node);
    }
  }
}

const BLOCK_CLASSES = new Set([
  'paragraph', 'heading', 'code_block', 'block_quote', 'list',
  'table', 'math_block', 'diagram', 'yaml', 'item',
]);

/* 对外入口 */
export function renderHTML(ast, mode) {
  const r = new Renderer(mode === 'facet');
  return r.render(ast);
}
