/* tex.js — 极简 TeX 渲染（Facet 扩展）
 * 不是完整 TeX 引擎：覆盖常用希腊字母、运算符、上下标、分式、根式。
 * 设计目标：离线零依赖，常见公式可读；复杂公式回退为等宽源码呈现。
 */
const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε',
  zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'θ', iota: 'ι', kappa: 'κ',
  lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π', rho: 'ρ', sigma: 'σ',
  tau: 'τ', upsilon: 'υ', phi: 'φ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ',
  Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω',
};
const SYM = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', leq: '≤', le: '≤',
  geq: '≥', ge: '≥', neq: '≠', ne: '≠', approx: '≈', in: '∈', notin: '∉',
  subset: '⊂', supset: '⊃', cup: '∪', cap: '∩', infty: '∞', partial: '∂',
  nabla: '∇', sum: '∑', prod: '∏', int: '∫', oint: '∮',
  to: '→', rightarrow: '→', leftarrow: '←', Rightarrow: '⇒', Leftarrow: '⇐',
  leftrightarrow: '↔', uparrow: '↑', downarrow: '↓',
  forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', emptyset: '∅',
  ell: 'ℓ', hbar: 'ℏ', Re: 'ℜ', Im: 'ℑ', aleph: 'ℵ', deg: '°', angle: '∠',
  perp: '⊥', parallel: '∥', sim: '∼', simeq: '≃', cong: '≅', equiv: '≡',
  propto: '∝', because: '∵', therefore: '∴', prime: '′',
};
const NAMED = Object.assign({}, GREEK, SYM);

function skipWs(t, i) { while (i < t.length && /\s/.test(t[i])) i++; return i; }

/* 读取一个 {...} 参数（支持嵌套花括号） */
function readBrace(t, i) {
  if (t[i] !== '{') return null;
  let d = 0;
  for (let j = i; j < t.length; j++) {
    if (t[j] === '{') d++;
    else if (t[j] === '}') { d--; if (d === 0) return { end: j, inner: t.slice(i + 1, j) }; }
  }
  return null;
}

/* 结构渲染：分式 / 根式 / 上下标 */
function texStruct(t) {
  let out = '', i = 0;
  while (i < t.length) {
    if (t.startsWith('\\frac', i) || t.startsWith('\\tfrac', i) || t.startsWith('\\dfrac', i)) {
      const kw = t.startsWith('\\tfrac') ? '\\tfrac' : (t.startsWith('\\dfrac') ? '\\dfrac' : '\\frac');
      const a = readBrace(t, skipWs(t, i + kw.length));
      const b = a ? readBrace(t, skipWs(t, a.end + 1)) : null;
      if (a && b) {
        out += '<span class="frac"><span class="num">' + texStruct(a.inner) + '</span>' +
          '<span class="den">' + texStruct(b.inner) + '</span></span>';
        i = b.end + 1;
        continue;
      }
    }
    if (t.startsWith('\\sqrt', i)) {
      const a = readBrace(t, skipWs(t, i + 5));
      if (a) { out += '√<span class="rad">' + texStruct(a.inner) + '</span>'; i = a.end + 1; continue; }
    }
    if (t.startsWith('\\binom', i)) {
      const a = readBrace(t, skipWs(t, i + 6));
      const b = a ? readBrace(t, skipWs(t, a.end + 1)) : null;
      if (a && b) {
        out += '<span class="frac"><span class="num" style="border:0">(</span>' +
          '<span class="den" style="border:0">)</span></span>';
        out = out.replace('</span><span class="den"', texStruct(a.inner) + '</span><span class="den"');
        i = b.end + 1;
        continue;
      }
    }
    out += t[i];
    i++;
  }
  out = out.replace(/\^\{([^{}]*)\}/g, '<sup>$1</sup>');
  out = out.replace(/\^([A-Za-z0-9+\-])/g, '<sup>$1</sup>');
  out = out.replace(/_\{([^{}]*)\}/g, '<sub>$1</sub>');
  out = out.replace(/_([A-Za-z0-9+\-])/g, '<sub>$1</sub>');
  return out;
}

export function tex(src) {
  let t = String(src).trim();
  // 去掉排版指令
  t = t.replace(/\\(left|right|displaystyle|textstyle|scriptstyle|big|Big|bigl|bigr|,|;|!|quad|qquad)\b/g, '');
  // 命名符号
  t = t.replace(/\\([A-Za-z]+)/g, (m, g) => (NAMED[g] !== undefined ? NAMED[g] : m));
  // 反斜杠转义
  t = t.replace(/\\([{}%&$#_])/g, '$1');
  // 环境（matrix/align 等）整体回退为等宽
  if (/\\begin\{/.test(t)) return '<span class="tex-env">' + esc(t) + '</span>';
  return texStruct(t);
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
