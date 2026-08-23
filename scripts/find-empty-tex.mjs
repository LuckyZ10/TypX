// 在真实文章里找出会产生空 TeX token 的公式原文及行号
import { readFileSync } from 'node:fs';
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

const file = process.argv[2];
const md = readFileSync(file, 'utf-8');

let all = [];
marked.use({
  walkTokens(token) {
    const t = token;
    if (t.type === 'inlineKatex' || t.type === 'blockKatex') {
      all.push({ raw: t.raw, text: t.text, display: !!t.displayMode, type: t.type });
    }
  },
});

marked.parse(md, { async: false });

console.log('总公式数:', all.length);
const bad = all.filter((p) => !String(p.text ?? '').trim());
console.log('空 TeX 公式数:', bad.length);
for (const b of bad) {
  const idx = md.indexOf(b.raw);
  const line = idx === -1 ? '?' : md.slice(0, idx).split('\n').length;
  console.log(`- 第 ${line} 行 | type=${b.type} display=${b.display} | raw=${JSON.stringify(b.raw)} | codepoints=${[...b.raw].map((c) => c.codePointAt(0).toString(16)).join(' ')}`);
}
