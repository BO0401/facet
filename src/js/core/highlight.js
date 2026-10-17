/* highlight.js — 轻量语法高亮（FaceT 扩展）
 * 自研词法着色，覆盖常见语言关键字/注释/字符串/数字。
 * 非完整语法分析器：目标是代码块可读，不是语言级精确。
 */
import { esc } from './tex.js';

const KW = {
  js: 'const|let|var|function|return|if|else|for|while|do|class|extends|new|import|export|from|default|async|await|try|catch|finally|throw|typeof|instanceof|in|of|this|super|null|undefined|true|false|switch|case|break|continue|yield|static|get|set|delete|void',
  jsx: 'const|let|var|function|return|if|else|for|while|class|extends|new|import|export|from|default|async|await|try|catch|throw|typeof|this|null|undefined|true|false|render|component',
  ts: 'const|let|var|function|return|if|else|for|while|class|extends|implements|new|import|export|from|default|async|await|try|catch|throw|typeof|interface|type|enum|public|private|protected|readonly|null|undefined|true|false|string|number|boolean|void|as|satisfies',
  python: 'def|class|import|from|return|if|elif|else|for|while|in|not|and|or|is|try|except|finally|with|as|lambda|yield|pass|raise|global|nonlocal|None|True|False|async|await|print|self|del|assert|break|continue',
  java: 'public|private|protected|class|interface|extends|implements|static|final|void|int|long|double|float|char|boolean|String|return|if|else|for|while|do|new|try|catch|import|package|this|super|null|true|false|abstract|throws|switch|case|break|continue',
  c: '#include|#define|#ifdef|#ifndef|#endif|#pragma|int|char|float|double|void|long|short|unsigned|signed|return|if|else|for|while|do|struct|typedef|sizeof|static|const|switch|case|break|continue|default|printf|malloc|free|NULL|enum|union',
  cpp: '#include|#define|namespace|class|public|private|protected|template|typename|return|if|else|for|while|new|delete|const|auto|constexpr|using|std|cout|cin|endl|int|void|struct|nullptr|true|false|virtual|override',
  go: 'package|import|func|var|const|type|struct|interface|return|if|else|for|range|go|defer|chan|map|select|switch|case|default|nil|true|false|string|int|int8|int32|int64|uint|float64|error|byte|rune|make|append',
  rust: 'fn|let|mut|const|static|struct|enum|impl|trait|pub|use|mod|match|if|else|for|while|loop|return|self|Self|Some|None|Ok|Err|true|false|as|dyn|ref|move|crate|where',
  sql: 'SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|BY|ORDER|LIMIT|AND|OR|NOT|NULL|AS|DISTINCT|COUNT|SUM|AVG|MAX|MIN|HAVING|INDEX|PRIMARY|KEY|FOREIGN',
  bash: 'if|then|else|elif|fi|for|in|do|done|echo|cd|ls|mkdir|rm|cp|mv|cat|grep|export|function|return|while|case|esac|sudo|apt|npm|git|curl|source|local|set|unset|alias',
  sh: 'if|then|else|elif|fi|for|in|do|done|echo|cd|ls|mkdir|rm|cp|mv|cat|grep|export|function|return|while|case|esac|sudo|source|local',
  json: 'true|false|null',
  yaml: 'true|false|null|yes|no',
  css: 'color|background|margin|padding|border|font|display|position|width|height|flex|grid|important',
};

const MARKUP = new Set(['html', 'xml', 'svg', 'vue', 'htm']);
const HASH_LANGS = new Set(['python', 'bash', 'sh', 'shell', 'yaml', 'yml', 'r', 'ruby', 'toml', 'makefile', 'perl', 'dockerfile']);

export function highlight(code, lang) {
  const L = (lang || '').toLowerCase();
  if (MARKUP.has(L)) {
    return esc(code)
      .replace(/(&lt;\/?)([\w:-]+)/g, '$1<span class="tok-t">$2</span>')
      .replace(/([\w:@-]+)=(&quot;[^&]*&quot;)/g, '<span class="tok-a">$1</span>=<span class="tok-s">$2</span>')
      .replace(/(&lt;!--[\s\S]*?--&gt;)/g, '<span class="tok-c">$1</span>');
  }
  const kw = new Set((KW[L] || KW.js).split('|').filter(Boolean));
  const hash = HASH_LANGS.has(L);
  const re = new RegExp(
    '(\\/\\/[^\\n]*|\\/\\*[\\s\\S]*?\\*\\/' + (hash ? '|#[^\\n]*' : '') + ')' +
    '|("(?:[^"\\\\\\n]|\\\\.)*"|\'(?:[^\'\\\\\\n]|\\\\.)*\'|`(?:[^`\\\\]|\\\\.)*`)' +
    '|\\b(\\d+\\.?\\d*)\\b|([A-Za-z_#][\\w$]*)|([\\s\\S])', 'g');
  let out = '', m;
  while ((m = re.exec(code))) {
    const e = m[0];
    if (m[1]) out += '<span class="tok-c">' + esc(e) + '</span>';
    else if (m[2]) out += '<span class="tok-s">' + esc(e) + '</span>';
    else if (m[3]) out += '<span class="tok-n">' + esc(e) + '</span>';
    else if (m[4]) out += (kw.has(e) ? '<span class="tok-k">' + esc(e) + '</span>' : esc(e));
    else out += esc(e);
  }
  return out;
}
