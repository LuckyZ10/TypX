export interface BuiltinTheme {
  id: string;
  name: string;
  css: string;
}

/** 预览文档的骨架样式：只定结构（内边距、图片宽度），颜色字体交给主题 */
export const BASE_CSS = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body { background: #ffffff; }
#__typx { padding: 24px 32px; font-size: 15px; line-height: 1.85; letter-spacing: 0.05em; word-break: break-word; }
img { max-width: 100%; }
ul, ol { padding-left: 1.8em; }
li { margin: 0.35em 0; }
table { border-collapse: collapse; }
.typx-footnote { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 2.2em; }
`;

/** 代码高亮基础配色（GitHub Light 风格），深色主题里用 .hljs-* 覆盖 */
export const HLJS_CSS = `
.hljs { color: #24292e; background: #f6f8fa; }
.hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-doctag, .hljs-template-tag { color: #d73a49; }
.hljs-name, .hljs-tag { color: #22863a; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: #032f62; }
.hljs-number, .hljs-symbol, .hljs-bullet, .hljs-variable, .hljs-template-variable, .hljs-link { color: #e36209; }
.hljs-title, .hljs-title.class_, .hljs-title.function_, .hljs-section { color: #6f42c1; }
.hljs-built_in, .hljs-type { color: #e36209; }
.hljs-attr, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: #005cc5; }
.hljs-meta { color: #6a737d; }
.hljs-emphasis { font-style: italic; }
.hljs-strong { font-weight: 700; }
.hljs-deletion { color: #b31d28; }
`;

const FONT_STACK = `-apple-system, BlinkMacSystemFont, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif`;
const MONO_STACK = `'Cascadia Code', 'JetBrains Mono', Consolas, 'Courier New', monospace`;

export const BUILT_IN_THEMES: BuiltinTheme[] = [
  {
    id: 'clean',
    name: '简约白',
    css: `
#__typx { font-family: ${FONT_STACK}; color: #333333; }
h1 { font-size: 1.5em; font-weight: 600; text-align: center; margin: 1.8em 0 1.2em; color: #111111; }
h2 { font-size: 1.3em; font-weight: 600; margin: 1.6em 0 1em; padding-bottom: 0.3em; border-bottom: 1px solid #eaecef; color: #111111; }
h3 { font-size: 1.15em; font-weight: 600; margin: 1.4em 0 0.8em; color: #222222; }
h4 { font-size: 1em; font-weight: 600; margin: 1.2em 0 0.6em; color: #222222; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #1f2328; }
a { color: #0366d6; text-decoration: none; border-bottom: 1px solid rgba(3, 102, 214, 0.3); }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #57606a; background: #f8f9fa; border-left: 3px solid #d0d7de; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #f6f8fa; border-radius: 6px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: inherit; font-size: inherit; border-radius: 0; }
code { font-family: ${MONO_STACK}; background: rgba(175, 184, 193, 0.2); color: #c0392b; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #d8dee4; padding: 8px 12px; }
th { background: #f6f8fa; font-weight: 600; }
img { display: block; margin: 1.2em auto; }
hr { border: none; border-top: 1px solid #e0e4e8; margin: 2em 0; }
`,
  },
  {
    id: 'orange',
    name: '橙心',
    css: `
#__typx { font-family: ${FONT_STACK}; color: #3f3f3f; }
h1 { font-size: 1.5em; font-weight: 700; text-align: center; margin: 1.8em 0 1.2em; color: #d9480f; }
h2 { font-size: 1.3em; font-weight: 700; margin: 1.6em 0 1em; padding-bottom: 0.3em; border-bottom: 2px solid #ffe8d9; color: #e8590c; }
h3 { font-size: 1.15em; font-weight: 700; margin: 1.4em 0 0.8em; color: #e8590c; }
h4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.6em; color: #e8590c; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #d9480f; }
a { color: #e8590c; text-decoration: none; border-bottom: 1px solid #ffd8a8; }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #8a6552; background: #fff7f2; border-left: 4px solid #ff8a4c; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #fdf3ec; border-radius: 6px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: #c2410c; font-size: inherit; border-radius: 0; }
.hljs { background: #fdf3ec; color: #7c2d12; }
code { font-family: ${MONO_STACK}; background: #fff1e8; color: #d9480f; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #ffd9be; padding: 8px 12px; }
th { background: #fff3ea; font-weight: 600; color: #c2410c; }
img { display: block; margin: 1.2em auto; border-radius: 6px; }
hr { border: none; border-top: 2px dashed #ffd8a8; margin: 2em 0; }
`,
  },
  {
    id: 'teal',
    name: '蓝绿清新',
    css: `
#__typx { font-family: ${FONT_STACK}; color: #37474f; }
h1 { font-size: 1.5em; font-weight: 700; text-align: center; margin: 1.8em 0 1.2em; color: #00796b; }
h2 { font-size: 1.3em; font-weight: 700; margin: 1.6em 0 1em; padding-bottom: 0.3em; border-bottom: 2px solid #b2dfdb; color: #00796b; }
h3 { font-size: 1.15em; font-weight: 700; margin: 1.4em 0 0.8em; color: #00897b; }
h4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.6em; color: #00897b; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #00695c; }
a { color: #00897b; text-decoration: none; border-bottom: 1px solid #80cbc4; }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #546e7a; background: #e0f2f1; border-left: 4px solid #26a69a; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #f1f8f6; border-radius: 6px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: #00695c; font-size: inherit; border-radius: 0; }
.hljs { background: #f1f8f6; color: #33691e; }
code { font-family: ${MONO_STACK}; background: #e0f2f1; color: #00796b; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #b2dfdb; padding: 8px 12px; }
th { background: #e0f2f1; font-weight: 600; color: #00695c; }
img { display: block; margin: 1.2em auto; border-radius: 6px; }
hr { border: none; border-top: 2px dashed #b2dfdb; margin: 2em 0; }
`,
  },
  {
    id: 'purple',
    name: '优雅紫',
    css: `
#__typx { font-family: ${FONT_STACK}; color: #424242; }
h1 { font-size: 1.5em; font-weight: 700; text-align: center; margin: 1.8em 0 1.2em; color: #5e35b1; }
h2 { font-size: 1.3em; font-weight: 700; margin: 1.6em 0 1em; padding: 0.15em 0.6em; border-left: 4px solid #7e57c2; background: #f3f0ff; color: #5e35b1; border-radius: 0 4px 4px 0; }
h3 { font-size: 1.15em; font-weight: 700; margin: 1.4em 0 0.8em; color: #673ab7; }
h4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.6em; color: #673ab7; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #5e35b1; }
a { color: #7e57c2; text-decoration: none; border-bottom: 1px solid #d1c4e9; }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #6d6d6d; background: #f6f3ff; border-left: 4px solid #9775fa; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #f7f5ff; border-radius: 6px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: #5e35b1; font-size: inherit; border-radius: 0; }
.hljs { background: #f7f5ff; color: #4527a0; }
code { font-family: ${MONO_STACK}; background: #ede7f6; color: #6a3fc0; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #d1c4e9; padding: 8px 12px; }
th { background: #f3f0ff; font-weight: 600; color: #5e35b1; }
img { display: block; margin: 1.2em auto; border-radius: 6px; }
hr { border: none; border-top: 2px dashed #d1c4e9; margin: 2em 0; }
`,
  },
  {
    id: 'geek',
    name: '极客黑',
    css: `
body { background: #282c34; }
#__typx { font-family: ${FONT_STACK}; color: #abb2bf; background: #282c34; }
h1 { font-size: 1.5em; font-weight: 700; text-align: center; margin: 1.8em 0 1.2em; color: #98c379; }
h2 { font-size: 1.3em; font-weight: 700; margin: 1.6em 0 1em; padding-bottom: 0.3em; border-bottom: 1px solid #3e4451; color: #e5c07b; }
h3 { font-size: 1.15em; font-weight: 700; margin: 1.4em 0 0.8em; color: #e06c75; }
h4 { font-size: 1em; font-weight: 700; margin: 1.2em 0 0.6em; color: #e06c75; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #e5c07b; }
a { color: #61afef; text-decoration: none; border-bottom: 1px dashed #61afef; }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #7f848e; background: #2c313c; border-left: 4px solid #61afef; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #21252b; border-radius: 6px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: #abb2bf; font-size: inherit; border-radius: 0; }
.hljs { background: #21252b; color: #abb2bf; }
.hljs-comment, .hljs-quote { color: #5c6370; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-template-tag { color: #c678dd; }
.hljs-name, .hljs-tag { color: #e06c75; }
.hljs-string, .hljs-regexp, .hljs-addition, .hljs-attribute { color: #98c379; }
.hljs-number, .hljs-symbol, .hljs-bullet, .hljs-variable, .hljs-template-variable, .hljs-link { color: #d19a66; }
.hljs-title, .hljs-title.class_, .hljs-title.function_, .hljs-section { color: #61afef; }
.hljs-built_in, .hljs-type { color: #d19a66; }
.hljs-attr, .hljs-selector-attr, .hljs-selector-class, .hljs-selector-id { color: #d19a66; }
code { font-family: ${MONO_STACK}; background: #3e4451; color: #98c379; padding: 2px 5px; border-radius: 4px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #3e4451; padding: 8px 12px; }
th { background: #2c313c; font-weight: 600; color: #e5c07b; }
img { display: block; margin: 1.2em auto; border-radius: 6px; }
hr { border: none; border-top: 1px solid #3e4451; margin: 2em 0; }
`,
  },
  {
    id: 'ink',
    name: '墨青标签',
    css: `
#__typx { font-family: ${FONT_STACK}; color: #1a1a1a; }
h1 { font-size: 1.5em; font-weight: 700; text-align: center; letter-spacing: 0.05em; margin: 1.8em 0 1.2em; color: #1a1a1a; }
/* Typlatex Article Ink 的 H2 装修：深黑灰标签块（右下大圆角 ≈0.92H）。
   原版用 ::before/::after 画块与浅灰轨道，伪元素过不了公众号粘贴，
   这里直接把 H2 本体做成标签，预览与粘贴效果一致 */
h2 {
  font-size: 1.3em;
  font-weight: 700;
  line-height: 1.2;
  margin: 1.5em 0 0.8em;
  width: fit-content;
  color: #ffffff;
  background-color: #212122;
  padding: 12px 26px 12px 16px;
  border-radius: 0 0 42px 0;
}
h3 { font-size: 1.12em; font-weight: 700; margin: 1.3em 0 0.7em; color: #1a1a1a; }
h4 { font-size: 1em; font-weight: 700; margin: 1.1em 0 0.6em; color: #1a1a1a; }
p { margin: 1em 0; }
strong { font-weight: 700; color: #ef7060; }
/* 文内斜体也用墨青蓝（与图注/链接一致） */
em { font-style: italic; color: #0b53c2; }
a { color: #0b53c2; text-decoration: none; border-bottom: 1px solid rgba(11, 83, 194, 0.3); }
blockquote { margin: 1.2em 0; padding: 0.6em 1em; color: #3f3f3f; background: #f7f6f3; border-left: 3px solid #b9b5ae; border-radius: 0 4px 4px 0; }
pre { margin: 1.2em 0; padding: 14px 16px; background: #f5f4f0; border: 1px solid #e4e2dc; border-radius: 4px; overflow-x: auto; font-size: 13.5px; line-height: 1.6; }
pre code { font-family: ${MONO_STACK}; padding: 0; background: none; color: inherit; font-size: inherit; border-radius: 0; }
code { font-family: ${MONO_STACK}; background: #f5f4f0; color: #c0392b; padding: 2px 5px; border-radius: 3px; font-size: 0.9em; }
table { margin: 1.2em 0; width: 100%; }
th, td { border: 1px solid #d9d5ce; padding: 8px 12px; }
th { background: #f5f4f0; font-weight: 700; }
tr:nth-child(even) td { background: #fafaf7; }
/* 斜体图注（Typlatex 规则）：图片单独成段，空一行后整段斜体
   （*图 1：xxx*）→ 蓝色居中小字。选择器在预览 iframe 里实时匹配，
   复制时样式逐元素内联，粘贴到公众号同样生效 */
p:has(> img:only-child) + p:has(> em:only-child),
p:has(> a:only-child > img:only-child) + p:has(> em:only-child) {
  color: #0b53c2;
  text-align: center;
  font-size: 0.9em;
  margin: 0.2em 0 1.4em;
}
/* 图注紧跟图片：压缩图片段的下边距，让图注贴住图片 */
p:has(> img:only-child):has(+ p:has(> em:only-child)),
p:has(> a:only-child > img:only-child):has(+ p:has(> em:only-child)) {
  margin-bottom: 0.3em;
}
img { display: block; margin: 1.2em auto; }
hr { border: none; border-top: 1px solid #b9b5ae; margin: 2em 0; }
`,
  },
  {
    id: 'inkpaper',
    name: '墨笺论文',
    css: `
/* Typlatex Article Ink 完整移植：衬线宋体 + 两端对齐 + 三线表 + 深色标签 H2 */
#__typx {
  font-family: 'Times New Roman', 'Noto Serif SC', 'Source Han Serif SC', 'SimSun', 'Songti SC', serif;
  font-size: 16px; /* 原版小四 12pt */
  line-height: 1.6;
  letter-spacing: normal;
  color: #1a1a1a;
  text-align: justify;
}
h1, h2, h3, h4 {
  font-family: Arial, 'Noto Sans SC', 'Source Han Sans SC', 'SimHei', 'Microsoft YaHei', sans-serif;
  color: #1a1a1a;
}
h1 { font-size: 1.42em; font-weight: 700; text-align: center; letter-spacing: 0.05em; line-height: 1.3; margin: 1.6em 0 1.1em; }
h2 {
  font-family: 'Microsoft YaHei', 'Noto Sans SC', 'Source Han Sans SC', sans-serif;
  font-size: 1.33em; font-weight: 700; line-height: 1.2;
  margin: 1.5em 0 0.8em;
  width: fit-content;
  color: #ffffff;
  background-color: #212122;
  padding: 12px 26px 12px 16px;
  border-radius: 0 0 42px 0;
}
h3 { font-size: 0.96em; font-weight: 700; margin: 1.1em 0 0.5em; }
h4 { font-size: 0.88em; font-weight: 700; margin: 1em 0 0.45em; }
h5 { font-size: 0.88em; font-weight: 400; font-style: italic; font-family: 'Times New Roman', 'SimSun', serif; margin: 0.9em 0 0.4em; }
h6 { font-size: 0.88em; font-weight: 700; font-family: 'Times New Roman', 'SimSun', serif; margin: 0.9em 0 0.4em; }

p { margin: 0 0 2px; }
p:has(> img:only-child), p:has(> a:only-child > img:only-child) { text-align: center; margin: 0.6em 0; }

strong { font-weight: 700; color: #ef7060; }
em { font-style: italic; color: #0b53c2; }
a { color: #0b53c2; text-decoration: none; border-bottom: 1px solid rgba(11, 83, 194, 0.25); }

/* 斜体图注：图片段之后整段斜体 → 蓝色居中 */
p:has(> img:only-child) + p:has(> em:only-child),
p:has(> a:only-child > img:only-child) + p:has(> em:only-child) {
  color: #0b53c2; text-align: center; font-size: 0.9em; margin: 0.2em 0 1.3em;
}
p:has(> img:only-child):has(+ p:has(> em:only-child)),
p:has(> a:only-child > img:only-child):has(+ p:has(> em:only-child)) { margin-bottom: 0.3em; }

blockquote {
  margin: 0.7em 0; padding: 4px 0 4px 12px;
  border-left: 3px solid #b9b5ae;
  color: #3f3f3f; font-size: 0.95em; line-height: 1.5;
}
blockquote ul, blockquote ol { padding-left: 1.4em; }
ul, ol { margin: 0.4em 0 0.7em; padding-left: 1.6em; }
li { margin: 0 0 1.5px; }

code {
  font-family: Consolas, 'Courier New', 'Noto Sans Mono CJK SC', monospace;
  font-size: 0.88em; background: #f5f4f0; border-radius: 2px; padding: 0 3px; color: #1a1a1a;
}
pre {
  font-family: Consolas, 'Courier New', 'Noto Sans Mono CJK SC', monospace;
  font-size: 0.86em; line-height: 1.35;
  background: #f5f4f0; border: 1px solid #b9b5ae; border-radius: 2px;
  padding: 7px 9px; margin: 0.7em 0;
  white-space: pre-wrap; word-break: break-all;
}
pre code { background: none; padding: 0; font-size: inherit; color: inherit; border-radius: 0; }

/* 三线表（booktabs 风格）；margin 不用 auto（auto 会按预览宽算成 px，粘贴后错位） */
table {
  border-top: 2px solid #000000; border-bottom: 2px solid #000000;
  border-collapse: collapse; margin: 0.8em 0 1em; font-size: 0.86em; line-height: 1.3;
}
thead th { border-bottom: 1px solid #000000; font-weight: 700; padding: 4px 8px; text-align: center; }
td { padding: 4px 8px; border: none; }
tbody tr:nth-child(2n) { background: #fafaf7; }

img { max-width: 100%; }
hr { border: none; border-top: 1px solid #999999; margin: 15px 0; }
mark { background: #fff2a8; padding: 0 1px; }
kbd { font-family: Consolas, monospace; font-size: 0.85em; border: 1px solid #999999; border-bottom-width: 2px; border-radius: 2px; padding: 0 3px; }
`,
  },
];
