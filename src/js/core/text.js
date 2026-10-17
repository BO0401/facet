/* text.js — 转义 / 反转义 / URI 归一化
 * 规则对齐 CommonMark 0.31.2 与 commonmark.js 参考实现。
 */

/* XML 特殊字符转义（文本与属性通用） */
const XML_SPECIAL = /[&<>"]/;
const XML_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export function escapeXml(s) {
  if (!XML_SPECIAL.test(s)) return s;
  return s.replace(/[&<>"]/g, c => XML_MAP[c]);
}

/* ASCII 可转义标点（CommonMark §2.1 backslash escapes） */
export const ESCAPABLE = "[!\"#$%&'()*+,./:;<=>?@\\[\\\\\\]^_`{|}~-]";
const RE_ESCAPABLE = new RegExp('^' + ESCAPABLE);

export function isEscapable(ch) { return RE_ESCAPABLE.test(ch); }

/* 实体匹配（CommonMark §2.5）：&#xHHHH; / &#DDD; / &name; */
export const ENTITY_RE = /^&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/i;

/* 反转义：反斜杠转义 + 实体 → 字面量（用于链接目标与标题） */
export function unescapeString(s, decodeEntity) {
  if (!/[\\&]/.test(s)) return s;
  return s.replace(/\\[!-\/:-@\[-`{-~]|&(?:#x[a-f0-9]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/gi,
    m => m[0] === '\\' ? m[1] : decodeEntity(m));
}

/* URI 归一化：保留既有 %XX 转义，其余按 UTF-8 百分号编码（大写十六进制）
 * 安全字符集与 mdurl/encode 一致 */
const URL_SAFE = ";/?:@&=+$,-_.!~*'()#";
const HEX2 = /^[0-9a-f]{2}$/i;
export function encodeURL(uri) {
  let out = '';
  for (let i = 0; i < uri.length; i++) {
    const c = uri[i];
    if (c === '%' && HEX2.test(uri.slice(i + 1, i + 3))) {
      out += uri.slice(i, i + 3); i += 2; continue;
    }
    if (/[A-Za-z0-9]/.test(c) || URL_SAFE.includes(c)) { out += c; continue; }
    const bytes = new TextEncoder().encode(c);
    for (const b of bytes) out += '%' + b.toString(16).toUpperCase().padStart(2, '0');
  }
  return out;
}
