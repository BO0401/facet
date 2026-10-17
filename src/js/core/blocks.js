/* blocks.js — CommonMark 块级解析器 + Facet 块级扩展
 *
 * 算法（对齐 commonmark.js 参考实现）：
 *   维护「开放块栈」，逐行三阶段处理——
 *   1) 沿开放块栈向下匹配（continue 返回 0=匹配 1=失败 2=本行已处理完），记录 lastMatched
 *   2) 若最后的容器还能起点新块，依次尝试 blockStarts（1=容器 2=叶子 0=不匹配）
 *   3) 剩余文本归位（惰性段落延续优先）
 *   块内容用 _content 字符串累积（每行带 \n），与参考实现一致。
 *
 * Facet 扩展（opts 开关控制，规范模式下全部关闭）：
 *   tables 表格 / math $$ 块 / yaml 前言 / footnotes 脚注 / diagrams 图表围栏
 */
import { N, resetIds } from './ast.js';
import { createInlineParser, decodeEntity } from './inlines.js';
import { unescapeString } from './text.js';

const CODE_INDENT = 4;

const RE_HTML_BLOCK_OPEN = [
  /./,
  /^<(?:script|pre|textarea|style)(?:\s|>|$)/i,
  /^<!--/,
  /^<[?]/,
  /^<![A-Za-z]/,
  /^<!\[CDATA\[/,
  /^<[/]?(?:address|article|aside|base|basefont|blockquote|body|caption|center|col|colgroup|dd|details|dialog|dir|div|dl|dt|fieldset|figcaption|figure|footer|form|frame|frameset|h[123456]|head|header|hr|html|iframe|legend|li|link|main|menu|menuitem|nav|noframes|ol|optgroup|option|p|param|section|search|summary|table|tbody|td|tfoot|th|thead|title|tr|track|ul)(?:\s|[/]?[>]|$)/i,
  /^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[a-zA-Z_:][a-zA-Z0-9:._-]*(?:\s*=\s*(?:[^"'=<>`\x00-\x20]+|'[^']*'|"[^"]*"))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)\s*$/i,
];
const RE_HTML_BLOCK_CLOSE = [
  /./,
  /<\/(?:script|pre|textarea|style)>/i,
  /-->/,
  /\?>/,
  />/,
  /\]\]>/,
];
const RE_THEMATIC = /^(?:\*[ \t]*){3,}$|^(?:_[ \t]*){3,}$|^(?:-[ \t]*){3,}$/;
/* 行首「可能特殊」字符：命中才会进入 blockStarts 逐一尝试（性能优化）。
 * | 必须在内：Facet 表格扩展以 | 开头，否则会被快路径跳过。 */
const RE_MAYBE_SPECIAL = /^[#`~*+_=<>0-9-$\[|]/;
const RE_NON_SPACE = /[^ \t\f\v\r\n]/;
const RE_BULLET = /^[*+-]/;
const RE_ORDERED = /^(\d{1,9})([.)])/;
const RE_ATX = /^#{1,6}(?:[ \t]+|$)/;
const RE_FENCE = /^`{3,}(?!.*`)|^~{3,}/;
const RE_CLOSING_FENCE = /^(?:`{3,}|~{3,})(?=[ \t]*$)/;
const RE_SETEXT = /^(?:=+|-+)[ \t]*$/;
const RE_LINE_ENDING = /\r\n|\n|\r/;

/* Facet 扩展正则 */
const RE_MATH_FENCE = /^ {0,3}\$\$[ \t]*$/;
const RE_YAML_OPEN = /^---[ \t]*$/;
const RE_YAML_CLOSE = /^(?:---|\.\.\.)[ \t]*$/;
const RE_FOOTNOTE_DEF = /^ {0,3}\[\^([^\]\s]+)\]:[ \t]*(.*)$/;
const RE_FOOTNOTE_CONT = /^(?: {2,}|\t)\S/;
const RE_TABLE_DELIM = /^ {0,3}\|?[ \t]*:?-+:?[ \t]*(\|[ \t]*:?-+:?[ \t]*)*\|?[ \t]*$/;
const DIAGRAM_LANGS = new Set(['mermaid', 'diagram', 'graph', 'flowchart', 'flowchart-td', 'sequencediagram', 'classdiagram', 'gantt', 'statediagram', 'erdiagram', 'journey', 'pie']);

const isSpaceOrTab = c => c === 32 || c === 9 || c === ' ' || c === '\t';
const peek = (ln, pos) => (pos < ln.length ? ln.charCodeAt(pos) : -1);

/* 容器能力：只有这些类型能容纳子块 */
const CONTAINERS = new Set(['document', 'list', 'block_quote', 'item']);
const ACCEPTS_LINES = new Set(['code_block', 'html_block', 'paragraph', 'table', 'math_block', 'yaml', 'footnote_def']);

export function parseBlocks(src, opts) {
  resetIds();
  const o = Object.assign({
    strikethrough: false, math: false, wikilinks: false, footrefs: false,
    tables: false, diagrams: false, yaml: false, footnotes: false,
  }, opts);
  const inlineParser = createInlineParser(o);
  const refmap = {};

  const P = {
    lines: src.split(RE_LINE_ENDING),
    doc: null, tip: null, oldtip: null,
    lineNo: -1, currentLine: '',
    offset: 0, column: 0, nextNonspace: 0, nextNonspaceColumn: 0,
    indent: 0, indented: false, blank: false, partiallyConsumedTab: false,
    allClosed: true, lastMatched: null,
    refmap, inlineParser, opts: o,
  };

  P.doc = N('document', { pos: { line: 0, col: 0 }, open: true });
  P.tip = P.doc;

  /* ---------- 基础动作（与参考实现同构） ---------- */
  P.findNextNonspace = function () {
    const line = this.currentLine;
    let i = this.offset, cols = this.column, c;
    while ((c = line.charAt(i)) !== '') {
      if (c === ' ') { i++; cols++; }
      else if (c === '\t') { i++; cols += 4 - (cols % 4); }
      else break;
    }
    this.blank = c === '' || c === '\n' || c === '\r';
    this.nextNonspace = i;
    this.nextNonspaceColumn = cols;
    this.indent = this.nextNonspaceColumn - this.column;
    this.indented = this.indent >= CODE_INDENT;
  };

  P.advanceOffset = function (count, columns) {
    const line = this.currentLine;
    let c;
    while (count > 0 && (c = line[this.offset])) {
      if (c === '\t') {
        const charsToTab = 4 - (this.column % 4);
        if (columns) {
          this.partiallyConsumedTab = charsToTab > count;
          const adv = charsToTab > count ? count : charsToTab;
          this.column += adv;
          this.offset += this.partiallyConsumedTab ? 0 : 1;
          count -= adv;
        } else {
          this.partiallyConsumedTab = false;
          this.column += charsToTab;
          this.offset += 1;
          count -= 1;
        }
      } else {
        this.partiallyConsumedTab = false;
        this.offset += 1;
        this.column += 1;
        count -= 1;
      }
    }
  };

  P.advanceNextNonspace = function () {
    this.offset = this.nextNonspace;
    this.column = this.nextNonspaceColumn;
    this.partiallyConsumedTab = false;
  };

  P.addLine = function () {
    if (this.partiallyConsumedTab) {
      this.offset += 1; // 跳过被部分消耗的制表符
      const charsToTab = 4 - (this.column % 4);
      this.tip._content += ' '.repeat(charsToTab);
    }
    this.tip._content += this.currentLine.slice(this.offset) + '\n';
  };

  /* canContain：新节点能否挂到当前 tip 下（与参考实现同语义）
   * - list 只能容纳 item；document/block_quote/item 可容纳除 item 外的一切
   * - 其余叶子块一律不可容纳（addChild 时先上浮 finalize） */
  function canContain(tipType, tag) {
    if (tipType === 'list') return tag === 'item';
    if (tipType === 'document' || tipType === 'block_quote' || tipType === 'item') return tag !== 'item';
    return false;
  }

  P.addChild = function (type, lineNo, col) {
    while (!canContain(this.tip.type, type)) this.finalize(this.tip, this.lineNo - 1);
    const node = N(type, { pos: { line: lineNo, col }, open: true, _content: '' });
    node.parent = this.tip;
    this.tip.children.push(node);
    this.tip = node;
    return node;
  };

  P.closeUnmatchedBlocks = function () {
    if (!this.allClosed) {
      while (this.oldtip !== this.lastMatched) {
        const parent = this.oldtip.parent;
        this.finalize(this.oldtip, this.lineNo - 1);
        this.oldtip = parent;
      }
      this.allClosed = true;
    }
  };

  P.finalize = function (block, endLine) {
    block.open = false;
    block.end = { line: endLine, col: 0 };
    finalizeBlock(block, this);
    this.tip = block.parent;
  };

  /* ---------- 块类型 continue ---------- */
  const continues = {
    document: () => 0,
    list: () => 0,
    block_quote: function (parser) {
      if (!parser.indented && peek(parser.currentLine, parser.nextNonspace) === 62 /* > */) {
        parser.advanceNextNonspace();
        parser.advanceOffset(1, false);
        if (isSpaceOrTab(parser.currentLine[parser.offset])) parser.advanceOffset(1, true);
        return 0;
      }
      return 1;
    },
    item: function (parser, container) {
      if (parser.blank) {
        if (!container.children.length) return 1;
        parser.advanceNextNonspace();
      } else if (parser.indent >= container.listData.markerOffset + container.listData.padding) {
        parser.advanceOffset(container.listData.markerOffset + container.listData.padding, true);
      } else {
        return 1;
      }
      return 0;
    },
    heading: () => 1,
    thematic_break: () => 1,
    code_block: function (parser, container) {
      if (container.fenced) {
        const match = parser.indent <= 3 &&
          parser.currentLine.charAt(parser.nextNonspace) === container.fenceChar &&
          parser.currentLine.slice(parser.nextNonspace).match(RE_CLOSING_FENCE);
        if (match && match[0].length >= container.fenceLength) {
          parser.finalize(container, parser.lineNo);
          return 2;
        }
        let i = container.fenceOffset;
        while (i > 0 && isSpaceOrTab(peek(parser.currentLine, parser.offset))) {
          parser.advanceOffset(1, true);
          i--;
        }
      } else {
        if (parser.indent >= CODE_INDENT) parser.advanceOffset(CODE_INDENT, true);
        else if (parser.blank) parser.advanceNextNonspace();
        else return 1;
      }
      return 0;
    },
    html_block: function (parser, container) {
      return (parser.blank && (container.htmlBlockType === 6 || container.htmlBlockType === 7)) ? 1 : 0;
    },
    paragraph: parser => (parser.blank ? 1 : 0),
    table: function (parser) {
      if (parser.blank) return 1;
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (!rest.includes('|')) return 1;
      if (RE_FENCE.test(rest) || RE_ATX.test(rest) || RE_THEMATIC.test(rest) ||
          rest[0] === '>' || RE_BULLET.test(rest) || RE_ORDERED.test(rest)) return 1;
      return 0;
    },
    math_block: function (parser, container) {
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (parser.indent <= 3 && RE_MATH_FENCE.test(rest)) {
        parser.finalize(container, parser.lineNo);
        return 2;
      }
      return 0;
    },
    yaml: function (parser, container) {
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (parser.indent <= 3 && RE_YAML_CLOSE.test(rest)) {
        parser.finalize(container, parser.lineNo);
        return 2;
      }
      return 0;
    },
    footnote_def: function (parser) {
      if (parser.blank) return 1;
      if (RE_FOOTNOTE_CONT.test(parser.currentLine)) {
        parser.advanceOffset(2, true);
        return 0;
      }
      return 1;
    },
  };

  /* ---------- 块起点 ---------- */
  function parseListMarker(parser, container) {
    const rest = parser.currentLine.slice(parser.nextNonspace);
    const data = {
      type: null, tight: true, bulletChar: null, start: null,
      delimiter: null, padding: null, markerOffset: parser.indent,
    };
    let match;
    if (parser.indent >= 4) return null;
    if ((match = rest.match(RE_BULLET))) {
      data.type = 'bullet';
      data.bulletChar = match[0][0];
    } else if ((match = rest.match(RE_ORDERED)) &&
               (container.type !== 'paragraph' || match[1] === '1')) {
      data.type = 'ordered';
      data.start = parseInt(match[1], 10);
      data.delimiter = match[2];
    } else {
      return null;
    }
    const nextc = peek(parser.currentLine, parser.nextNonspace + match[0].length);
    if (!(nextc === -1 || nextc === 9 || nextc === 32)) return null;
    if (container.type === 'paragraph' &&
        !RE_NON_SPACE.test(parser.currentLine.slice(parser.nextNonspace + match[0].length))) {
      return null;
    }
    parser.advanceNextNonspace();
    parser.advanceOffset(match[0].length, true);
    const spacesStartCol = parser.column;
    const spacesStartOffset = parser.offset;
    let nextc2;
    do {
      parser.advanceOffset(1, true);
      nextc2 = peek(parser.currentLine, parser.offset);
    } while (parser.column - spacesStartCol < 5 && isSpaceOrTab(nextc2));
    const blankItem = peek(parser.currentLine, parser.offset) === -1;
    const spacesAfter = parser.column - spacesStartCol;
    if (spacesAfter >= 5 || spacesAfter < 1 || blankItem) {
      data.padding = match[0].length + 1;
      parser.column = spacesStartCol;
      parser.offset = spacesStartOffset;
      if (isSpaceOrTab(peek(parser.currentLine, parser.offset))) parser.advanceOffset(1, true);
    } else {
      data.padding = match[0].length + spacesAfter;
    }
    return data;
  }

  function listsMatch(listData, itemData) {
    return listData.type === itemData.type &&
      listData.delimiter === itemData.delimiter &&
      listData.bulletChar === itemData.bulletChar;
  }

  const blockStarts = [
    /* YAML 前言（仅文档第一行，Facet） */
    function (parser) {
      if (!o.yaml || parser.lineNo !== 0) return 0;
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (parser.indented || !RE_YAML_OPEN.test(rest)) return 0;
      parser.closeUnmatchedBlocks();
      parser.addChild('yaml', parser.lineNo, parser.nextNonspace);
      parser.advanceOffset(parser.currentLine.length - parser.offset, false);
      return 2;
    },

    /* 块引用 */
    function (parser) {
      if (!parser.indented && peek(parser.currentLine, parser.nextNonspace) === 62) {
        parser.advanceNextNonspace();
        parser.advanceOffset(1, false);
        if (isSpaceOrTab(parser.currentLine[parser.offset])) parser.advanceOffset(1, true);
        parser.closeUnmatchedBlocks();
        parser.addChild('block_quote', parser.lineNo, parser.nextNonspace);
        return 1;
      }
      return 0;
    },

    /* ATX 标题 */
    function (parser) {
      let match;
      if (!parser.indented && (match = parser.currentLine.slice(parser.nextNonspace).match(RE_ATX))) {
        parser.advanceNextNonspace();
        parser.advanceOffset(match[0].length, false);
        parser.closeUnmatchedBlocks();
        const h = parser.addChild('heading', parser.lineNo, parser.nextNonspace);
        h.depth = match[0].trim().length;
        h._content = parser.currentLine.slice(parser.offset)
          .replace(/^[ \t]*#+[ \t]*$/, '')
          .replace(/[ \t]+#+[ \t]*$/, '');
        parser.advanceOffset(parser.currentLine.length - parser.offset, false);
        return 2;
      }
      return 0;
    },

    /* 围栏代码块 / 图表围栏（Facet） */
    function (parser) {
      let match;
      if (!parser.indented && (match = parser.currentLine.slice(parser.nextNonspace).match(RE_FENCE))) {
        const fenceLength = match[0].length;
        const infoRaw = parser.currentLine.slice(parser.nextNonspace + fenceLength).trim();
        const isDiagram = o.diagrams && DIAGRAM_LANGS.has(infoRaw.split(/\s+/)[0].toLowerCase());
        parser.closeUnmatchedBlocks();
        const b = parser.addChild(isDiagram ? 'diagram' : 'code_block', parser.lineNo, parser.nextNonspace);
        b.fenced = true;
        b.fenceLength = fenceLength;
        b.fenceChar = match[0][0];
        b.fenceOffset = parser.indent;
        parser.advanceNextNonspace();
        parser.advanceOffset(fenceLength, false);
        return 2;
      }
      return 0;
    },

    /* HTML 块 */
    function (parser, container) {
      if (!parser.indented && peek(parser.currentLine, parser.nextNonspace) === 60 /* < */) {
        const s = parser.currentLine.slice(parser.nextNonspace);
        for (let type = 1; type <= 7; type++) {
          if (RE_HTML_BLOCK_OPEN[type].test(s) &&
              (type < 7 || (container.type !== 'paragraph' &&
                !(!parser.allClosed && !parser.blank && parser.tip.type === 'paragraph')))) {
            parser.closeUnmatchedBlocks();
            const b = parser.addChild('html_block', parser.lineNo, parser.offset);
            b.htmlBlockType = type;
            return 2;
          }
        }
      }
      return 0;
    },

    /* $$ 数学块（Facet） */
    function (parser) {
      if (!o.math) return 0;
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (parser.indented || !RE_MATH_FENCE.test(rest)) return 0;
      parser.closeUnmatchedBlocks();
      parser.addChild('math_block', parser.lineNo, parser.nextNonspace);
      parser.advanceOffset(parser.currentLine.length - parser.offset, false);
      return 2;
    },

    /* 脚注定义（Facet） */
    function (parser) {
      if (!o.footnotes) return 0;
      const rest = parser.currentLine.slice(parser.nextNonspace);
      const m = rest.match(RE_FOOTNOTE_DEF);
      if (parser.indented || !m) return 0;
      parser.closeUnmatchedBlocks();
      const b = parser.addChild('footnote_def', parser.lineNo, parser.nextNonspace);
      b.ref = m[1];
      parser.advanceOffset(parser.currentLine.length - parser.offset, false);
      return 2;
    },

    /* setext 标题 */
    function (parser, container) {
      let match;
      if (!parser.indented && container.type === 'paragraph' &&
          (match = parser.currentLine.slice(parser.nextNonspace).match(RE_SETEXT))) {
        parser.closeUnmatchedBlocks();
        stripRefs(container, parser);
        if (container._content.trim().length > 0) {
          const h = N('heading', {
            pos: container.pos, open: true,
            depth: match[0][0] === '=' ? 1 : 2,
          });
          h._content = container._content;
          h.parent = container.parent;
          const idx = container.parent.children.indexOf(container);
          container.parent.children[idx] = h;
          parser.tip = h;
          parser.advanceOffset(parser.currentLine.length - parser.offset, false);
          return 2;
        }
        return 0;
      }
      return 0;
    },

    /* 主题分隔线 */
    function (parser) {
      if (!parser.indented && RE_THEMATIC.test(parser.currentLine.slice(parser.nextNonspace))) {
        parser.closeUnmatchedBlocks();
        parser.addChild('thematic_break', parser.lineNo, parser.nextNonspace);
        parser.advanceOffset(parser.currentLine.length - parser.offset, false);
        return 2;
      }
      return 0;
    },

    /* 列表项 */
    function (parser, container) {
      let data;
      if ((!parser.indented || container.type === 'list') && (data = parseListMarker(parser, container))) {
        parser.closeUnmatchedBlocks();
        if (parser.tip.type !== 'list' || !listsMatch(container.listData, data)) {
          container = parser.addChild('list', parser.lineNo, parser.nextNonspace);
          container.listData = data;
        }
        const item = parser.addChild('item', parser.lineNo, parser.nextNonspace);
        item.listData = data;
        return 1;
      }
      return 0;
    },

    /* 表格（Facet）：段落首行 + 分隔行 → 表格 */
    function (parser, container) {
      if (!o.tables || container.type !== 'paragraph') return 0;
      const nLines = container._content === '' ? 0 : container._content.split('\n').length - 1;
      if (nLines !== 1) return 0;
      const header = container._content.split('\n')[0];
      if (!header.includes('|')) return 0;
      const rest = parser.currentLine.slice(parser.nextNonspace);
      if (!RE_TABLE_DELIM.test(rest) || !rest.includes('-')) return 0;
      const headCells = splitRow(header);
      const delimCells = splitRow(rest);
      if (headCells.length !== delimCells.length || headCells.length === 0) return 0;
      const align = delimCells.map(c => {
        const t = c.trim();
        const l = t.startsWith(':'), r = t.endsWith(':');
        return l && r ? 'center' : (r ? 'right' : (l ? 'left' : ''));
      });
      parser.closeUnmatchedBlocks();
      container.type = 'table';
      container.align = align;
      container.head = headCells.map(c => ({ value: c, children: [] }));
      container.rows = [];
      container._content = '';
      parser.tip = container;
      parser.advanceOffset(parser.currentLine.length - parser.offset, false);
      return 2;
    },

    /* 缩进代码块 */
    function (parser) {
      if (parser.indented && parser.tip.type !== 'paragraph' && !parser.blank) {
        parser.advanceOffset(CODE_INDENT, true);
        parser.closeUnmatchedBlocks();
        parser.addChild('code_block', parser.lineNo, parser.offset);
        return 2;
      }
      return 0;
    },
  ];

  /* ---------- finalize ---------- */
  function stripRefs(block, parser) {
    while (block._content[0] === '[') {
      const pos = parser.inlineParser.parseReference(block._content, parser.refmap);
      if (!pos) break;
      block._content = block._content.slice(pos);
    }
  }

  function finalizeBlock(block, parser) {
    switch (block.type) {
      case 'paragraph':
        stripRefs(block, parser);
        if (!block._content.trim()) {
          // 整段都是引用定义 → 移除空段落
          const p = block.parent;
          const idx = p.children.indexOf(block);
          if (idx !== -1) p.children.splice(idx, 1);
        }
        break;
      case 'code_block':
        if (block.fenced) {
          const content = block._content;
          const nl = content.indexOf('\n');
          block.lang = unescapeString((nl === -1 ? content : content.slice(0, nl)).trim(), decodeEntity);
          block.value = nl === -1 ? '' : content.slice(nl + 1);
        } else {
          const lines = block._content.split('\n');
          while (lines.length && /^[ \t]*$/.test(lines[lines.length - 1])) lines.pop();
          block.value = lines.join('\n') + (lines.length ? '\n' : '');
        }
        break;
      case 'diagram':
        block.lang = (block._content.split('\n')[0] || '').trim().split(/\s+/)[0] || 'diagram';
        block.value = block._content.slice(block._content.indexOf('\n') + 1);
        break;
      case 'html_block':
        block.value = block._content.replace(/\n$/, '');
        break;
      case 'math_block':
        block.value = block._content.slice(block._content.indexOf('\n') + 1);
        break;
      case 'yaml':
        block.value = block._content.slice(block._content.indexOf('\n') + 1);
        break;
      case 'footnote_def':
        block.value = block._content.replace(RE_FOOTNOTE_DEF, '$2');
        break;
      case 'table': {
        const lines = block._content.split('\n');
        if (lines.length && lines[lines.length - 1] === '') lines.pop();
        block.rows = lines.slice(1).map(l => splitRow(l).map(c => ({ value: c, children: [] })));
        break;
      }
      case 'list': {
        const items = block.children;
        for (let i = 0; i < items.length; i++) {
          if (i < items.length - 1 && items[i].end.line + 1 < items[i + 1].pos.line) {
            block.listData.tight = false;
            break;
          }
          let loose = false;
          for (let j = 0; j < items[i].children.length; j++) {
            if (j < items[i].children.length - 1 &&
                items[i].children[j].end.line + 1 < items[i].children[j + 1].pos.line) {
              loose = true;
              break;
            }
          }
          if (loose) { block.listData.tight = false; break; }
        }
        // 与参考实现一致：列表结束位置取自最后一个 item 的结束位置
        if (items.length) block.end = { line: items[items.length - 1].end.line, col: 0 };
        break;
      }
      case 'item': {
        if (block.children.length) {
          const last = block.children[block.children.length - 1];
          block.end = { line: last.end.line, col: 0 };
        }
        // 任务列表 [x] / [ ]
        if (block.children.length === 1 && block.children[0].type === 'paragraph') {
          const m = /^\[([ xX])\][ \t]+([\s\S]*)$/.exec(block.children[0]._content);
          if (m) {
            block.checked = m[1].toLowerCase() === 'x';
            block.children[0]._content = m[2];
          }
        }
        break;
      }
    }
  }

  /* ---------- 主循环 ---------- */
  function incorporateLine(ln) {
    P.oldtip = P.tip;
    P.offset = 0; P.column = 0; P.blank = false; P.partiallyConsumedTab = false;
    P.currentLine = ln.indexOf('\u0000') !== -1 ? ln.replace(/\0/g, '\uFFFD') : ln;

    // Phase 1：沿开放块栈匹配
    let container = P.doc;
    let allMatched = true;
    let lastChild;
    while ((lastChild = container.children[container.children.length - 1]) && lastChild.open) {
      container = lastChild;
      P.findNextNonspace();
      const r = continues[container.type](P, container);
      if (r === 0) continue;
      if (r === 2) return;
      allMatched = false;
      container = container.parent;
      break;
    }
    P.allClosed = container === P.oldtip;
    P.lastMatched = container;

    // Phase 2：尝试新块起点
    let matchedLeaf = container.type !== 'paragraph' && ACCEPTS_LINES.has(container.type);
    while (!matchedLeaf) {
      P.findNextNonspace();
      if (!P.indented && !RE_MAYBE_SPECIAL.test(ln.slice(P.nextNonspace))) {
        P.advanceNextNonspace();
        break;
      }
      let i = 0, res = 0;
      while (i < blockStarts.length) {
        res = blockStarts[i](P, container);
        if (res === 1) { container = P.tip; break; }
        if (res === 2) { container = P.tip; matchedLeaf = true; break; }
        i++;
      }
      if (i === blockStarts.length) { P.advanceNextNonspace(); break; }
    }

    // Phase 3：剩余文本归位
    if (!P.allClosed && !P.blank && P.tip.type === 'paragraph') {
      P.addLine(); // 惰性段落延续
    } else {
      P.closeUnmatchedBlocks();
      const t = container.type;
      if (ACCEPTS_LINES.has(t)) {
        P.addLine();
        if (t === 'html_block' && container.htmlBlockType >= 1 && container.htmlBlockType <= 5 &&
            RE_HTML_BLOCK_CLOSE[container.htmlBlockType].test(P.currentLine.slice(P.offset))) {
          P.finalize(container, P.lineNo);
        }
      } else if (P.offset < ln.length && !P.blank) {
        container = P.addChild('paragraph', P.lineNo, P.offset);
        P.advanceNextNonspace();
        P.addLine();
      }
    }
  }

  const lines = P.lines;
  let len = lines.length;
  if (src.charCodeAt(src.length - 1) === 10) len -= 1;
  for (P.lineNo = 0; P.lineNo < len; P.lineNo++) incorporateLine(lines[P.lineNo]);
  while (P.tip) P.finalize(P.tip, len - 1);

  /* 行内解析（此时引用定义已完整） */
  processInlines(P.doc, P);

  return P.doc;
}

/* ---------- 工具 ---------- */
function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = [];
  let cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (c === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  cells.push(cur.trim());
  return cells;
}

function markLines(nodes, line) {
  for (const n of nodes) {
    if (!n.pos) n.pos = { line, col: 0 };
    if (n.children && n.children.length) markLines(n.children, line);
  }
}

function processInlines(doc, parser) {
  parser.inlineParser.refmap = parser.refmap;
  (function walk(node) {
    for (const b of node.children) {
      if ((b.type === 'paragraph' || b.type === 'heading' || b.type === 'footnote_def') && '_content' in b) {
        parser.inlineParser.parse(b);
        markLines(b.children, b.pos.line);
      } else if (b.type === 'table') {
        for (const c of b.head) {
          const fake = { children: [], _content: c.value };
          parser.inlineParser.parse(fake);
          c.children = fake.children;
        }
        for (const row of b.rows) {
          for (const c of row) {
            const fake = { children: [], _content: c.value };
            parser.inlineParser.parse(fake);
            c.children = fake.children;
          }
        }
        markLines(b.head.flatMap(c => c.children), b.pos.line);
        for (const row of b.rows) markLines(row.flatMap(c => c.children), b.pos.line);
      } else {
        walk(b);
      }
    }
  })(doc);
}
