import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import markedKatex from 'marked-katex-extension';
import { mathjax } from 'mathjax-full/js/mathjax';
import { TeX } from 'mathjax-full/js/input/tex';
import { SVG } from 'mathjax-full/js/output/svg';
import { browserAdaptor } from 'mathjax-full/js/adaptors/browserAdaptor';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages';

marked.use({ gfm: true, breaks: false });

// 数学公式：$...$ 行内、$$...$$ 块级。
// nonStandard 让 $ 紧贴文字/标点也能识别（如 "($x$)"），正文里的美元符号需写作 \$ 转义
marked.use(markedKatex({ throwOnError: false, nonStandard: true }));

// 复制时需要把公式换回 TeX 重新排版：新版 KaTeX 输出里已不带 annotation，
// 改在解析期用 walkTokens 按文档顺序收集公式 token，渲染后写进 data-tex
let pendingFormulas: { tex: string; display: boolean }[] = [];
marked.use({
  walkTokens(token) {
    const t = token as { type?: string; text?: string; displayMode?: boolean };
    if ((t.type === 'inlineKatex' || t.type === 'blockKatex') && typeof t.text === 'string') {
      pendingFormulas.push({ tex: t.text, display: !!t.displayMode });
    }
  },
});

/* 复制到公众号时公式用 MathJax 输出行内 SVG：微信编辑器不支持公式 HTML，
   但接受不带 <defs> 的 SVG（mdnice/doocs 同款方案）。fontCache:'none' 让
   字形路径内联在使用处、不产生 <defs>；矢量随字号缩放，也无需图床上传。 */
const mjAdaptor = browserAdaptor();
RegisterHTMLHandler(mjAdaptor);
const mjTex = new TeX({ packages: AllPackages });
const mjSvg = new SVG({ fontCache: 'none' });
const mjDoc = mathjax.document('', { InputJax: mjTex, OutputJax: mjSvg });

export function texToSvg(texSrc: string, display: boolean): string {
  const container = mjDoc.convert(texSrc, { display, em: 16, ex: 8, containerWidth: 960 }) as HTMLElement;
  const svg = container.querySelector('svg');
  if (!svg) return '';
  // mjx-container 是自定义元素，公众号会剥掉它；把它上面的垂直对齐搬到 svg 上
  const va = container.style.verticalAlign;
  if (va) svg.style.verticalAlign = va;
  svg.style.maxWidth = '100%';
  return svg.outerHTML;
}

/**
 * Markdown -> 预览用 HTML 片段。
 * 图片地址解析在 DOMPurify 消毒之前做：
 * Windows 盘符路径（D:\a.png）会被 DOMPurify 默认的 URI 白名单当成非法
 * scheme「d:」而丢掉 src，所以先改写成 mdfile:// 再消毒（白名单同步放行 mdfile:）。
 * 代码高亮在 DOM 后处理阶段完成，不依赖 marked 的 renderer 钩子。
 */
export function renderMarkdown(md: string, baseDir: string): string {
  pendingFormulas = [];
  const rawHtml = marked.parse(md, { async: false }) as string;
  const parsed = new DOMParser().parseFromString(rawHtml, 'text/html');
  resolveImages(parsed, baseDir);
  // TeX 源按文档顺序盖到 .katex 上（顺序与 token 流一致，数量不一致时放弃以保安全）
  const kats = Array.from(parsed.querySelectorAll('.katex'));
  if (kats.length === pendingFormulas.length) {
    kats.forEach((el, i) => {
      el.setAttribute('data-tex', pendingFormulas[i].tex);
      el.setAttribute('data-display', pendingFormulas[i].display ? '1' : '0');
    });
  }
  const clean = DOMPurify.sanitize(parsed.body.innerHTML, {
    ALLOWED_URI_REGEXP:
      /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|mdfile):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  highlightCodeBlocks(doc);
  return doc.body.innerHTML;
}

function highlightCodeBlocks(doc: Document): void {
  for (const el of Array.from(doc.querySelectorAll('pre code'))) {
    const cls = el.getAttribute('class') ?? '';
    const m = /language-([\w+#.-]+)/.exec(cls);
    try {
      if (m && hljs.getLanguage(m[1])) {
        hljs.highlightElement(el as HTMLElement);
      } else {
        el.innerHTML = hljs.highlightAuto(el.textContent ?? '').value;
      }
    } catch {
      // 高亮失败时保留原文
    }
    el.classList.add('hljs');
  }
}

/** 相对路径图片 -> mdfile:// 协议（主进程读本地文件返回），http(s)/data: 外链保持不变 */
function resolveImages(doc: Document, baseDir: string): void {
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    if (!src || /^(https?:|data:|mdfile:|blob:)/i.test(src)) continue;
    if (src.startsWith('//')) {
      img.setAttribute('src', 'https:' + src);
      continue;
    }
    if (!baseDir) continue;
    img.setAttribute('src', toMdFileUrl(resolveLocalPath(baseDir, src)));
  }
}

function resolveLocalPath(base: string, rel: string): string {
  if (/^[a-zA-Z]:[\\/]/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) {
    return rel.replace(/\//g, '\\');
  }
  const parts = base.replace(/\//g, '\\').split('\\').filter(Boolean);
  for (const seg of rel.replace(/\//g, '\\').split('\\')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('\\');
}

function toMdFileUrl(p: string): string {
  const encoded = p.replace(/\\/g, '/').split('/').map(encodeURIComponent).join('/');
  // mdfile 注册为 standard 协议，Chromium 要求非空 host（空 host 的
  // mdfile:///... 会直接解析失败），因此固定用 "md" 作 host，真实路径放 pathname
  return `mdfile://md/${encoded}`;
}

/** toMdFileUrl 的反操作：mdfile://md/D:/x/y.png -> D:\x\y.png；非 mdfile 地址返回 null */
export function mdFileUrlToPath(src: string): string | null {
  if (!src.startsWith('mdfile:')) return null;
  try {
    const u = new URL(src);
    let p = decodeURIComponent(u.pathname);
    if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
    else p = p.replace(/\//g, '\\');
    return p;
  } catch {
    return null;
  }
}
