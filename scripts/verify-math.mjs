// 开发用自检：marked + marked-katex-extension 渲染是否产出 KaTeX HTML
import { marked } from 'marked';
import markedKatex from 'marked-katex-extension';

marked.use({ gfm: true, breaks: false });
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

// [markdown 片段, 期望输出包含 katex]
const cases = [
  ['行内 $E = mc^2$ 与 $e^{i\\pi} + 1 = 0$', true],
  ['紧贴标点的公式 ($a^2+b^2=c^2$)，nonStandard 模式应识别', true],
  ['$$\n\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}\n$$', true],
  ['转义美元 \\$100 与 \\$200 不应被当作公式', false],
  ['单个 $ 符号不成公式', false],
];

let failed = false;
for (const [md, expectKatex] of cases) {
  const out = marked.parse(md, { async: false });
  const hasKatex = out.includes('katex');
  const pass = hasKatex === expectKatex;
  console.log(pass ? 'PASS' : 'FAIL', '|', JSON.stringify(md.slice(0, 30)));
  if (!pass) failed = true;
}
process.exit(failed ? 1 : 0);
