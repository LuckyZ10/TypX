/**
 * 复刻 mdnice 的核心能力：把预览 iframe 里由 CSS 算出来的样式
 * 逐元素写进行内 style，得到的 HTML 可直接粘贴进公众号 / 知乎编辑器。
 */

const INLINE_PROPS = [
  'color',
  'background-color',
  'font-size',
  'font-family',
  'font-weight',
  'font-style',
  'line-height',
  'letter-spacing',
  'text-align',
  'text-decoration',
  'text-indent',
  'white-space',
  'word-break',
  'word-spacing',
  'vertical-align',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-radius',
  'display',
  'width',
  'max-width',
  'list-style-type',
  'list-style-position',
  'border-collapse',
  'border-spacing',
  'table-layout',
  'box-sizing',
  'box-shadow',
  'opacity',
  'position',
];

/** 公式内部（.katex 子树）额外内联的定位属性：KaTeX 的上下标/分数
 *  依赖 vlist 的 top 偏移与 0 高行占位，缺了整棵公式树就会散架 */
const KATEX_EXTRA_PROPS = ['top', 'right', 'bottom', 'left', 'height', 'min-height', 'min-width'];

export function inlinePreviewStyles(iframe: HTMLIFrameElement): string {
  const doc = iframe.contentDocument;
  const root = doc?.getElementById('__typx');
  if (!doc || !root || !doc.defaultView) throw new Error('预览尚未就绪');

  const win = doc.defaultView;

  // KaTeX 输出里带一份给屏幕阅读器的 MathML 副本，靠 CSS 藏起来；
  // 粘贴目标没有对应字体/样式时它会显形成重复内容，复制前直接移除
  root.querySelectorAll('.katex-mathml').forEach((el) => el.remove());

  const apply = (el: Element): void => {
    const computed = win.getComputedStyle(el);
    const style = (el as HTMLElement).style;
    const props = el.closest('.katex') ? [...INLINE_PROPS, ...KATEX_EXTRA_PROPS] : INLINE_PROPS;
    for (const prop of props) {
      const value = computed.getPropertyValue(prop);
      // 'auto' 多为未设置的定位/边距，内联无意义
      if (!value || value === 'auto') continue;
      // 未设置的边框计算值形如 "medium none currentcolor"，内联只会白白撑大 HTML
      if (prop.startsWith('border') && /\bnone\b/.test(value)) continue;
      style.setProperty(prop, value);
    }
  };

  apply(root);
  root.querySelectorAll('*').forEach(apply);

  // 图片：主题用 margin:auto 居中，但计算样式会把 auto 解析成基于
  // 预览窗宽度的 px 值，原样内联到公众号必然错位（预览窗越宽偏得越多，
  // 撑满宽度的图片 auto=0 所以"有些偏有些不偏"）。恢复为 auto、去掉锁死的
  // 像素宽度，并给独占段落的图片补父级 text-align:center 双保险。
  for (const img of Array.from(root.querySelectorAll('img'))) {
    // 公式截屏图：宽高就是公式尺寸，必须原样保留，不能套用正文图片的自适应规则
    if (img.classList.contains('typx-math-img')) continue;
    const computed = win.getComputedStyle(img);
    const st = (img as HTMLElement).style;
    st.setProperty('margin-top', computed.getPropertyValue('margin-top'));
    st.setProperty('margin-bottom', computed.getPropertyValue('margin-bottom'));
    st.setProperty('margin-left', 'auto');
    st.setProperty('margin-right', 'auto');
    st.setProperty('max-width', '100%');
    st.removeProperty('width');
    const p = img.parentElement;
    if (p && p.tagName === 'P' && p.children.length === 1) {
      (p as HTMLElement).style.setProperty('text-align', 'center');
    }
  }

  return root.outerHTML;
}

export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent ?? '';
}
