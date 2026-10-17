/* inlines.js — CommonMark 行内解析器
 * 语义对齐 commonmark.js 参考实现：分隔符栈（openers_bottom）、
 * 括号栈（行内/引用/折叠/简写链接）、实体、代码 span、自动链接、原始 HTML。
 * FaceT 扩展（strikethrough / math / wikilink / footref）由 opts 开关控制，
 * 规范模式下全部关闭，保证 CommonMark 用例逐字通过。
 */
import { N } from './ast.js';
import { ENTITIES } from './entities.js';
import { unescapeString, encodeURL, ESCAPABLE, ENTITY_RE } from './text.js';

const C_NEWLINE = 10, C_BACKTICK = 96, C_OPEN_BRACKET = 91, C_CLOSE_BRACKET = 93;
const C_LESSTHAN = 60, C_BANG = 33, C_BACKSLASH = 92, C_AMPERSAND = 38;
const C_OPEN_PAREN = 40, C_CLOSE_PAREN = 41, C_COLON = 58, C_DOLLAR = 36;

const ESCAPED_CHAR = '\\\\' + ESCAPABLE;
const RE_PUNCT = /^[!"#$%&'()*+,\-./:;<=>?@\[\]\\^_`{|}~\p{P}\p{S}]/u;
const RE_TICKS = /`+/;
const RE_TICKS_HERE = /^`+/;
const RE_EMAIL_AUTOLINK = /^<([a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*)>/;
const RE_AUTOLINK = /^<[A-Za-z][A-Za-z0-9.+-]{1,31}:[^<>\x00-\x20]*>/i;
const RE_SPNL = /^ *(?:\n *)?/;
const RE_WS_CHAR = /^[ \t\n\x0b\x0c\x0d]/;
const RE_UNICODE_WS = /^\s/;
const RE_FINAL_SPACE = / *$/;
const RE_INITIAL_SPACE = /^ */;
const RE_SPACE_AT_EOL = /^ *(?:\n|$)/;
const RE_LINK_LABEL = /^\[(?:[^\\\[\]]|\\.){0,1000}\]/s;
const RE_WIKILINK = /^\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/;
const RE_FOOTREF = /^\[\^([^\]\s]+)\](?!:)/;

const RE_LINK_TITLE = new RegExp(
  '^(?:"(' + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\"\x00])*"' +
  "|'(" + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\\'\x00])*\'' +
  '|\\((?:' + ESCAPED_CHAR + '|\\\\[^\\\\]|[^\\\\()\x00])*\\))'
);
const RE_LINK_DEST_BRACES = /^(?:<(?:[^<>\n\\\x00]|\\.)*>)/;

/* HTML 标签 / 注释 / 声明 / CDATA（CommonMark §6.6） */
const TAGNAME = '[A-Za-z][A-Za-z0-9-]*';
const ATTRIBUTENAME = '[a-zA-Z_:][a-zA-Z0-9:._-]*';
const ATTRIBUTEVALUE = "(?:[^\"'=<>`\\x00-\\x20]+|'[^']*'|\"[^\"]*\")";
const ATTRIBUTE = '(?:\\s+' + ATTRIBUTENAME + '(?:\\s*=\\s*' + ATTRIBUTEVALUE + ')?)';
const OPENTAG = '<' + TAGNAME + ATTRIBUTE + '*\\s*/?>';
const CLOSETAG = '</' + TAGNAME + '\\s*[>]';
const HTMLCOMMENT = '<!-->|<!--->|<!--[\\s\\S]*?-->';
const PROCESSINGINSTRUCTION = '[<][?][\\s\\S]*?[?][>]';
const DECLARATION = '<![A-Za-z]+[^>]*>';
const CDATA = '<!\\[CDATA\\[[\\s\\S]*?\\]\\]>';
const RE_HTML_TAG = new RegExp('^(?:' + OPENTAG + '|' + CLOSETAG + '|' + HTMLCOMMENT + '|' + PROCESSINGINSTRUCTION + '|' + DECLARATION + '|' + CDATA + ')');

/* 实体解码（CommonMark §2.5） */
export function decodeEntity(m) {
  const body = m.slice(1, -1);
  if (body[0] === '#') {
    let cp;
    if (body[1] === 'x' || body[1] === 'X') cp = parseInt(body.slice(2), 16);
    else cp = parseInt(body.slice(1), 10);
    if (!Number.isFinite(cp) || cp === 0 || cp > 0x10FFFF || (cp >= 0xD800 && cp <= 0xDFFF)) return '\uFFFD';
    return String.fromCodePoint(cp);
  }
  const ch = ENTITIES[body];
  return ch === undefined ? m : ch;
}

function normalizeReference(s) {
  return s.slice(1, -1).trim().replace(/[ \t\r\n]+/g, ' ').toLowerCase().toUpperCase();
}

export function createInlineParser(opts) {
  const o = opts || {};
  const smart = false;
  const useStrike = !!o.strikethrough;
  const useMath = !!o.math;
  const useWiki = !!o.wikilinks;
  const useFoot = !!o.footrefs;

  // 普通字符游程：排除所有有特殊含义的字符
  let mainExtra = '';
  if (useStrike) mainExtra += '~';
  if (useMath) mainExtra += '$';
  const RE_MAIN = new RegExp('^[^\\n`\\[\\]\\\\!<&*_' + mainExtra + ']+');

  const P = {
    subject: '', pos: 0, delimiters: null, brackets: null, refmap: {},

    match(re) {
      const m = re.exec(this.subject.slice(this.pos));
      if (m === null) return null;
      this.pos += m.index + m[0].length;
      return m[0];
    },
    /* 需要捕获组时用这个：返回完整 match 数组并推进 pos */
    matchGroups(re) {
      const m = re.exec(this.subject.slice(this.pos));
      if (m === null) return null;
      this.pos += m.index + m[0].length;
      return m;
    },
    peek() { return this.pos < this.subject.length ? this.subject.charCodeAt(this.pos) : -1; },
    spnl() { this.match(RE_SPNL); return true; },

    /* ---------- 各类行内结构 ---------- */
    parseBackticks(block) {
      const ticks = this.match(RE_TICKS_HERE);
      if (ticks === null) return false;
      const afterOpen = this.pos;
      let matched;
      while ((matched = this.match(RE_TICKS)) !== null) {
        if (matched === ticks) {
          let contents = this.subject.slice(afterOpen, this.pos - ticks.length).replace(/\n/gm, ' ');
          if (contents.length > 0 && /[^ ]/.test(contents) &&
              contents[0] === ' ' && contents[contents.length - 1] === ' ') {
            contents = contents.slice(1, -1);
          }
          block.children.push(N('code', { value: contents }));
          return true;
        }
      }
      this.pos = afterOpen;
      block.children.push(N('text', { value: ticks }));
      return true;
    },

    parseBackslash(block) {
      this.pos += 1;
      if (this.peek() === C_NEWLINE) {
        this.pos += 1;
        block.children.push(N('linebreak'));
      } else {
        const ch = this.subject.charAt(this.pos);
        if (ch && /[!-\/:-@\[-`{-~]/.test(ch)) {
          block.children.push(N('text', { value: ch }));
          this.pos += 1;
        } else {
          block.children.push(N('text', { value: '\\' }));
        }
      }
      return true;
    },

    parseAutolink(block) {
      let m = this.match(RE_EMAIL_AUTOLINK);
      if (m) {
        const dest = m.slice(1, -1);
        block.children.push(N('link', {
          href: encodeURL('mailto:' + dest), title: '',
          children: [N('text', { value: dest })],
        }));
        return true;
      }
      m = this.match(RE_AUTOLINK);
      if (m) {
        const dest = m.slice(1, -1);
        block.children.push(N('link', {
          href: encodeURL(dest), title: '',
          children: [N('text', { value: dest })],
        }));
        return true;
      }
      return false;
    },

    parseHtmlTag(block) {
      const m = this.match(RE_HTML_TAG);
      if (m === null) return false;
      block.children.push(N('html_inline', { value: m }));
      return true;
    },

    scanDelims(cc) {
      let numdelims = 0;
      const startpos = this.pos;
      while (this.peek() === cc) { numdelims++; this.pos += 1; }
      if (numdelims === 0) return null;

      const charBefore = startpos === 0 ? '\n' : this.subject.charAt(startpos - 1);
      const ccAfter = this.peek();
      const charAfter = ccAfter === -1 ? '\n' : String.fromCodePoint(ccAfter);

      const afterWs = RE_UNICODE_WS.test(charAfter);
      const afterPunct = RE_PUNCT.test(charAfter);
      const beforeWs = RE_UNICODE_WS.test(charBefore);
      const beforePunct = RE_PUNCT.test(charBefore);

      const leftFlanking = !afterWs && (!afterPunct || beforeWs || beforePunct);
      const rightFlanking = !beforeWs && (!beforePunct || afterWs || afterPunct);

      let canOpen, canClose;
      if (cc === 95 /* _ */) {
        canOpen = leftFlanking && (!rightFlanking || beforePunct);
        canClose = rightFlanking && (!leftFlanking || afterPunct);
      } else {
        canOpen = leftFlanking;
        canClose = rightFlanking;
      }
      this.pos = startpos;
      return { numdelims, canOpen, canClose };
    },

    handleDelim(cc, block) {
      const res = this.scanDelims(cc);
      if (!res) return false;
      const numdelims = res.numdelims;
      const startpos = this.pos;
      this.pos += numdelims;
      const node = N('text', { value: this.subject.slice(startpos, this.pos) });
      node.parent = block;
      block.children.push(node);
      if (res.canOpen || res.canClose) {
        const d = {
          cc, numdelims, origdelims: numdelims, node,
          prev: this.delimiters, next: null, canOpen: res.canOpen, canClose: res.canClose,
        };
        if (this.delimiters !== null) this.delimiters.next = d;
        this.delimiters = d;
      }
      return true;
    },

    removeDelimiter(d) {
      if (d.prev !== null) d.prev.next = d.next;
      if (d.next === null) this.delimiters = d.prev;
      else d.next.prev = d.prev;
    },

    removeDelimitersBetween(bottom, top) {
      if (bottom.next !== top) { bottom.next = top; top.prev = bottom; }
    },

    processEmphasis(stackBottom) {
      const openersBottom = new Map();
      const bottomKey = (d) => d.cc + '|' + (d.canOpen ? 1 : 0) + '|' + (d.origdelims % 3);

      // 从栈顶向下找 stack_bottom 之上第一个 closer
      let closer = this.delimiters;
      while (closer !== null && closer.prev !== stackBottom) closer = closer.prev;

      while (closer !== null) {
        if (!closer.canClose) { closer = closer.next; continue; }

        const key = bottomKey(closer);
        let opener = closer.prev;
        let openerFound = false;
        while (opener !== null && opener !== stackBottom && opener !== openersBottom.get(key)) {
          const oddMatch = (closer.canOpen || opener.canClose) &&
            closer.origdelims % 3 !== 0 && (opener.origdelims + closer.origdelims) % 3 === 0;
          if (opener.cc === closer.cc && opener.canOpen && !oddMatch) { openerFound = true; break; }
          opener = opener.prev;
        }
        const oldCloser = closer;

        if (closer.cc === 42 || closer.cc === 95 || closer.cc === 126 /* * _ ~ */) {
          if (!openerFound) {
            closer = closer.next;
          } else {
            const useDelims = (closer.numdelims >= 2 && opener.numdelims >= 2) ? 2 : 1;
            const openerInl = opener.node;
            const closerInl = closer.node;

            opener.numdelims -= useDelims;
            closer.numdelims -= useDelims;
            openerInl.value = openerInl.value.slice(0, openerInl.value.length - useDelims);
            closerInl.value = closerInl.value.slice(0, closerInl.value.length - useDelims);

            const type = closer.cc === 126 ? 'del' : (useDelims === 1 ? 'emph' : 'strong');
            const emph = N(type);

            const block = this.block;
            const arr = openerInl.parent.children; // 分隔符可能已在链接节点内
            const oi = arr.indexOf(openerInl);
            const ci = arr.indexOf(closerInl);
            emph.children = arr.splice(oi + 1, ci - oi - 1);
            for (const c of emph.children) c.parent = emph;
            emph.parent = openerInl.parent;
            arr.splice(oi + 1, 0, emph); // 与参考实现一致：插到 opener 之后

            // 先摘除 opener 与 closer 之间的分隔符（顺序须与参考实现一致）
            this.removeDelimitersBetween(opener, closer);

            // opener 耗尽则连同文本节点一起移除
            if (opener.numdelims === 0) {
              arr.splice(arr.indexOf(openerInl), 1);
              this.removeDelimiter(opener);
            }
            // closer 耗尽则移除并前进
            if (closer.numdelims === 0) {
              arr.splice(arr.indexOf(closerInl), 1);
              const temp = closer.next;
              this.removeDelimiter(closer);
              closer = temp;
            }
          }
        }
        if (!openerFound) {
          openersBottom.set(key, oldCloser.prev);
          if (!oldCloser.canOpen) this.removeDelimiter(oldCloser);
        }
      }
      // 清空分隔符栈
      while (this.delimiters !== null && this.delimiters !== stackBottom) {
        this.removeDelimiter(this.delimiters);
      }
    },

    parseLinkTitle() {
      const title = this.match(RE_LINK_TITLE);
      return title === null ? null : unescapeString(title.slice(1, -1), decodeEntity);
    },

    parseLinkDestination() {
      const res = this.match(RE_LINK_DEST_BRACES);
      if (res === null) {
        if (this.peek() === C_LESSTHAN) return null;
        const savepos = this.pos;
        let openparens = 0;
        let c;
        while ((c = this.peek()) !== -1) {
          if (c === C_BACKSLASH && /[!-\/:-@\[-`{-~]/.test(this.subject.charAt(this.pos + 1))) {
            this.pos += 1;
            if (this.peek() !== -1) this.pos += 1;
          } else if (c === C_OPEN_PAREN) {
            this.pos += 1; openparens += 1;
          } else if (c === C_CLOSE_PAREN) {
            if (openparens < 1) break;
            this.pos += 1; openparens -= 1;
          } else if (RE_WS_CHAR.test(String.fromCodePoint(c))) {
            break;
          } else {
            this.pos += 1;
          }
        }
        if (this.pos === savepos && c !== C_CLOSE_PAREN) return null;
        if (openparens !== 0) return null;
        return encodeURL(unescapeString(this.subject.slice(savepos, this.pos), decodeEntity));
      }
      return encodeURL(unescapeString(res.slice(1, -1), decodeEntity));
    },

    parseLinkLabel() {
      const m = this.match(RE_LINK_LABEL);
      if (m === null || m.length > 1001) return 0;
      return m.length;
    },

    parseOpenBracket(block) {
      const startpos = this.pos;
      this.pos += 1;
      const node = N('text', { value: '[' });
      block.children.push(node);
      this.addBracket(node, startpos, false);
      return true;
    },

    parseBang(block) {
      const startpos = this.pos;
      this.pos += 1;
      if (this.peek() === C_OPEN_BRACKET) {
        this.pos += 1;
        const node = N('text', { value: '![' });
        block.children.push(node);
        this.addBracket(node, startpos + 1, true);
      } else {
        block.children.push(N('text', { value: '!' }));
      }
      return true;
    },

    addBracket(node, index, image) {
      if (this.brackets !== null) this.brackets.bracketAfter = true;
      this.brackets = {
        node, prev: this.brackets, prevDelimiter: this.delimiters,
        index, image, active: true,
      };
    },
    removeBracket() { this.brackets = this.brackets.prev; },

    parseCloseBracket(block) {
      this.pos += 1;
      const startpos = this.pos;
      const opener = this.brackets;
      if (opener === null) { block.children.push(N('text', { value: ']' })); return true; }
      if (!opener.active) {
        block.children.push(N('text', { value: ']' }));
        this.removeBracket();
        return true;
      }
      const isImage = opener.image;
      let dest = null, title = null, matched = false;

      const savepos = this.pos;
      if (this.peek() === C_OPEN_PAREN) {
        this.pos += 1;
        if (this.spnl() &&
            (dest = this.parseLinkDestination()) !== null &&
            this.spnl() &&
            ((RE_WS_CHAR.test(this.subject.charAt(this.pos - 1)) && (title = this.parseLinkTitle())) || true) &&
            this.spnl() &&
            this.peek() === C_CLOSE_PAREN) {
          this.pos += 1;
          matched = true;
        } else {
          this.pos = savepos;
        }
      }

      if (!matched) {
        const beforelabel = this.pos;
        const n = this.parseLinkLabel();
        let reflabel = null;
        if (n > 2) reflabel = this.subject.slice(beforelabel, beforelabel + n);
        else if (!opener.bracketAfter) reflabel = this.subject.slice(opener.index, startpos);
        if (n === 0) this.pos = savepos;
        if (reflabel) {
          const link = this.refmap[normalizeReference(reflabel)];
          if (link) { dest = link.destination; title = link.title; matched = true; }
        }
      }

      if (matched) {
        const node = N(isImage ? 'image' : 'link', {
          href: dest, title: title || '', children: [],
        });
        const idx = block.children.indexOf(opener.node);
        node.children = block.children.splice(idx + 1);
        for (const c of node.children) c.parent = node; // 分隔符随内容迁入链接
        block.children.splice(idx, 1);
        block.children.push(node);
        this.processEmphasis(opener.prevDelimiter);
        this.removeBracket();
        // 链接内不允许再含链接：停用所有更早的 [  opener
        if (!isImage) {
          let b = this.brackets;
          while (b !== null) {
            if (!b.image) b.active = false;
            b = b.prev;
          }
        }
        return true;
      }
      this.removeBracket();
      this.pos = startpos;
      block.children.push(N('text', { value: ']' }));
      return true;
    },

    parseEntity(block) {
      const m = this.match(ENTITY_RE);
      if (m === null) return false;
      block.children.push(N('text', { value: decodeEntity(m) }));
      return true;
    },

    parseMath(block) {
      // 行内 $...$：起始 $ 后须为非空白、非 $；结束 $ 前须为非空白；不跨行
      const next = this.subject.charAt(this.pos + 1);
      if (next === '' || next === '$' || /\s/.test(next)) return false;
      let j = this.pos + 1;
      while (j < this.subject.length && this.subject[j] !== '$' && this.subject[j] !== '\n') j++;
      if (this.subject[j] !== '$' || j === this.pos + 1) return false;
      if (/\s/.test(this.subject[j - 1])) return false;
      const inner = this.subject.slice(this.pos + 1, j);
      this.pos = j + 1;
      block.children.push(N('math', { value: inner }));
      return true;
    },

    parseWikiLink(block) {
      const m = this.matchGroups(RE_WIKILINK);
      if (m === null) return false;
      const target = m[1].trim();
      block.children.push(N('wikilink', { target, alias: (m[2] || m[1]).trim() }));
      return true;
    },

    parseFootref(block) {
      const m = this.matchGroups(RE_FOOTREF);
      if (m === null) return false;
      block.children.push(N('footref', { ref: m[1] }));
      return true;
    },

    parseString(block) {
      const m = this.match(RE_MAIN);
      if (m === null) return false;
      block.children.push(N('text', { value: m }));
      return true;
    },

    parseNewline(block) {
      this.pos += 1;
      const kids = block.children;
      const last = kids[kids.length - 1];
      if (last && last.type === 'text' && last.value[last.value.length - 1] === ' ') {
        const hardbreak = last.value[last.value.length - 2] === ' ';
        last.value = last.value.replace(RE_FINAL_SPACE, '');
        kids.push(N(hardbreak ? 'linebreak' : 'softbreak'));
      } else {
        kids.push(N('softbreak'));
      }
      this.match(RE_INITIAL_SPACE);
      return true;
    },

    parseInline(block) {
      const c = this.peek();
      if (c === -1) return false;
      let res = false;
      switch (c) {
        case C_NEWLINE: res = this.parseNewline(block); break;
        case C_BACKSLASH: res = this.parseBackslash(block); break;
        case C_BACKTICK: res = this.parseBackticks(block); break;
        case 42: case 95: res = this.handleDelim(c, block); break;
        case 126: // ~
          if (useStrike) {
            const r = this.scanDelims(c);
            if (r && r.numdelims <= 2) res = this.handleDelim(c, block);
          }
          break;
        case C_DOLLAR:
          if (useMath) res = this.parseMath(block);
          break;
        case C_OPEN_BRACKET:
          if (useWiki) res = this.parseWikiLink(block);
          if (!res && useFoot) res = this.parseFootref(block);
          if (!res) res = this.parseOpenBracket(block);
          break;
        case C_BANG: res = this.parseBang(block); break;
        case C_CLOSE_BRACKET: res = this.parseCloseBracket(block); break;
        case C_LESSTHAN: res = this.parseAutolink(block) || this.parseHtmlTag(block); break;
        case C_AMPERSAND: res = this.parseEntity(block); break;
        default: res = this.parseString(block); break;
      }
      if (!res) {
        this.pos += 1;
        block.children.push(N('text', { value: String.fromCodePoint(c) }));
      }
      return true;
    },

    /* 入口：把块的字符串内容解析为行内子节点 */
    parse(block) {
      this.block = block;
      this.subject = block._content.trim();
      this.pos = 0;
      this.delimiters = null;
      this.brackets = null;
      while (this.parseInline(block)) { /* 直到末尾 */ }
      this.processEmphasis(null);
      delete this.block;
    },

    /* 链接引用定义：从字符串开头尝试解析，返回消耗的字符数（0 = 失败） */
    parseReference(s, refmap) {
      this.subject = s;
      this.pos = 0;
      const startpos = 0;

      const matchChars = this.parseLinkLabel();
      if (matchChars === 0) return 0;
      const rawlabel = this.subject.slice(0, matchChars);

      if (this.peek() === C_COLON) this.pos += 1;
      else { this.pos = startpos; return 0; }

      this.spnl();
      const dest = this.parseLinkDestination();
      if (dest === null) { this.pos = startpos; return 0; }

      const beforetitle = this.pos;
      this.spnl();
      let title = null;
      if (this.pos !== beforetitle) title = this.parseLinkTitle();
      if (title === null) this.pos = beforetitle;

      let atLineEnd = true;
      if (this.match(RE_SPACE_AT_EOL) === null) {
        if (title === null) {
          atLineEnd = false;
        } else {
          title = null;
          this.pos = beforetitle;
          atLineEnd = this.match(RE_SPACE_AT_EOL) !== null;
        }
      }
      if (!atLineEnd) { this.pos = startpos; return 0; }

      const normlabel = normalizeReference(rawlabel);
      if (normlabel === '') { this.pos = startpos; return 0; }
      if (!refmap[normlabel]) {
        refmap[normlabel] = { destination: dest, title: title === null ? '' : title };
      }
      return this.pos - startpos;
    },
  };
  return P;
}
