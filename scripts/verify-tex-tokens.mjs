// 复现 TypX 渲染管线里的公式 token 行为：各种 $ 写法哪种会产生空 TeX
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

let pending = [];
marked.use({
  walkTokens(token) {
    const t = token;
    if ((t.type === 'inlineKatex' || t.type === 'blockKatex')) {
      pending.push({ tex: t.text, display: !!t.displayMode, type: t.type });
    }
  },
});

const cases = [
  ['行内', '文字 $E=mc^2$ 文字'],
  ['多行块级', '$$\nE=mc^2\n$$'],
  ['单行块级(独立段)', '$$E=mc^2$$'],
  ['单行块级(前后无空格)', '$$ E = mc^2 $$'],
  ['行内夹杂单行块', '前面 $$E=mc^2$$ 后面'],
  ['空行内', '$ $'],
  ['空单行块', '$$ $$'],
  ['空多行块', '$$\n\n$$'],
  ['反斜杠空格', '$\\ $'],
  ['两个行内相邻', '$a$ $b$'],
];

for (const [name, md] of cases) {
  pending = [];
  const html = marked.parse(md, { async: false });
  const katexCount = (html.match(/class="katex"/g) ?? []).length;
  const displayCount = (html.match(/katex-display/g) ?? []).length;
  const toks = pending.map((p) => ({ tex: JSON.stringify(p.tex), display: p.display, type: p.type }));
  console.log(
    name.padEnd(14),
    '| tokens:', pending.length,
    '| .katex:', katexCount,
    '| display:', displayCount,
    '|', toks.map((t) => `${t.tex}${t.display ? '(D)' : ''}`).join(' ') || '(无token)',
  );
}
