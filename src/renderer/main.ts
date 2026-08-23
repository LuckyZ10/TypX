import './style.css';
import { createEditor, type EditorHandle } from './editor';
import { renderMarkdown, mdFileUrlToPath, texToSvg } from './render';
import { htmlToText, inlinePreviewStyles } from './inliner';
import { BASE_CSS, BUILT_IN_THEMES, HLJS_CSS } from './themes';
import type { CopyProfile, CustomTheme, FileEntry, ImageHostConfig, Prefs, Project, ViewMode } from '../shared/types';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;
const preview = $('#preview') as HTMLIFrameElement;

let prefs: Prefs = {
  projects: [],
  viewMode: 'split',
  lastFolder: null,
  themeId: 'clean',
  customThemes: [],
  footnote: '',
  syncScroll: true,
  editorFontSize: 15,
  embedImages: true,
  mathMode: 'svg',
  imageHost: { type: 'off', token: '', repo: '', branch: 'master', dir: 'typx', urlStyle: 'jsdelivr' },
  platformCopy: {
    wechat: { mathMode: 'svg', embedImages: true, footer: '' },
    zhihu: { mathMode: 'off', embedImages: true, footer: '' },
  },
};
let folder: string | null = null;
let files: FileEntry[] = [];
let currentFile: FileEntry | null = null;
let currentMtime = 0;
let dirty = false;
let editor!: EditorHandle;
let suppressDoc = false;
let renderTimer: number | undefined;
let prefsTimer: number | undefined;
let toastTimer: number | undefined;
let previewBody = '';
const expandedDirs = new Set<string>();

/* ---------- 预览文档 ---------- */

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function footnoteHtml(): string {
  const t = prefs.footnote.trim();
  return t ? `<p class="typx-footnote">${escapeHtml(t)}</p>` : '';
}

function docHtml(css: string, body: string): string {
  // KaTeX 样式经 <link> 引入：srcdoc 会继承父页面 typx://app/ 作为基址，
  // 其内相对字体路径（fonts/*.woff2）也由 typx 协议提供
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="katex.min.css"><style>${BASE_CSS}${HLJS_CSS}${css}</style></head><body><div id="__typx">${body}</div></body></html>`;
}

function currentPreviewHtml(cssOverride?: string): string {
  return docHtml(cssOverride ?? currentTheme().css, previewBody + footnoteHtml());
}

function welcomeHtml(): string {
  return `<div style="text-align:center;padding:48px 24px;color:#9aa0a6">
    <div style="font-size:40px;margin-bottom:16px">📝</div>
    <p style="font-size:16px;color:#4b5563;margin:0 0 10px">欢迎使用 TypX</p>
    <p style="margin:4px 0">「打开文件夹」会把目录登记为项目，下次启动自动恢复</p>
    <p style="margin:4px 0">左上角可随时切换项目；顶栏可切换 编辑 / 分屏 / 预览</p>
  </div>`;
}

function scheduleRender(immediate = false): void {
  if (renderTimer) window.clearTimeout(renderTimer);
  if (immediate) {
    doRender();
    return;
  }
  renderTimer = window.setTimeout(doRender, 250);
}

function doRender(): void {
  renderTimer = undefined;
  const md = editor ? editor.getValue() : '';
  const baseDir = currentFile ? fileDir(currentFile.absPath) : (folder ?? '');
  if (md.trim()) {
    previewBody = renderMarkdown(md, baseDir);
  } else {
    previewBody = currentFile ? '<p style="color:#9aa0a6">（这篇是空的）</p>' : welcomeHtml();
  }

  const doc = preview.contentDocument;
  const root = doc?.getElementById('__typx');
  if (root && doc?.defaultView) {
    const y = doc.defaultView.scrollY;
    root.innerHTML = previewBody + footnoteHtml();
    doc.defaultView.scrollTo(0, y);
  } else {
    preview.srcdoc = currentPreviewHtml();
  }
  $('#status-count').textContent = `字数 ${md.replace(/\s/g, '').length}`;
}

/* ---------- 主题 ---------- */

function allThemes(): CustomTheme[] {
  return [...BUILT_IN_THEMES.map((t) => ({ id: t.id, name: t.name, css: t.css })), ...prefs.customThemes];
}

function currentTheme(): CustomTheme {
  return allThemes().find((t) => t.id === prefs.themeId) ?? { id: BUILT_IN_THEMES[0].id, name: BUILT_IN_THEMES[0].name, css: BUILT_IN_THEMES[0].css };
}

function rebuildThemeSelect(): void {
  const sel = $('#sel-theme') as HTMLSelectElement;
  sel.innerHTML = '';
  const g1 = document.createElement('optgroup');
  g1.label = '内置主题';
  for (const t of BUILT_IN_THEMES) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    g1.appendChild(o);
  }
  sel.appendChild(g1);
  if (prefs.customThemes.length) {
    const g2 = document.createElement('optgroup');
    g2.label = '我的主题';
    for (const t of prefs.customThemes) {
      const o = document.createElement('option');
      o.value = t.id;
      o.textContent = t.name;
      g2.appendChild(o);
    }
    sel.appendChild(g2);
  }
  if (![...sel.options].some((o) => o.value === prefs.themeId)) prefs.themeId = BUILT_IN_THEMES[0].id;
  sel.value = prefs.themeId;
  $('#preview-theme-name').textContent = currentTheme().name;
}

/* ---------- 文件树 ---------- */

type ModelNode =
  | { type: 'dir'; name: string; relPath: string; children: ModelNode[] }
  | { type: 'file'; name: string; relPath: string; file: FileEntry };

function buildTreeModel(): ModelNode[] {
  const root: Extract<ModelNode, { type: 'dir' }> = { type: 'dir', name: '', relPath: '', children: [] };
  const dirs = new Map<string, Extract<ModelNode, { type: 'dir' }>>([['', root]]);
  const ensureDir = (rel: string): Extract<ModelNode, { type: 'dir' }> => {
    const hit = dirs.get(rel);
    if (hit) return hit;
    const idx = rel.lastIndexOf('/');
    const parent = ensureDir(idx === -1 ? '' : rel.slice(0, idx));
    const node: Extract<ModelNode, { type: 'dir' }> = { type: 'dir', name: rel.slice(idx + 1), relPath: rel, children: [] };
    parent.children.push(node);
    dirs.set(rel, node);
    return node;
  };
  for (const f of files) {
    const idx = f.relPath.lastIndexOf('/');
    ensureDir(idx === -1 ? '' : f.relPath.slice(0, idx)).children.push({
      type: 'file',
      name: f.name,
      relPath: f.relPath,
      file: f,
    });
  }
  const sortRec = (n: Extract<ModelNode, { type: 'dir' }>): void => {
    n.children.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name, 'zh') : a.type === 'dir' ? -1 : 1));
    n.children.forEach((c) => {
      if (c.type === 'dir') sortRec(c);
    });
  };
  sortRec(root);
  return root.children;
}

function appendNode(node: ModelNode, parent: HTMLElement | DocumentFragment, depth: number): void {
  if (node.type === 'file') {
    const div = document.createElement('div');
    div.className = 'tree-file' + (currentFile?.relPath === node.relPath ? ' active' : '');
    div.dataset.rel = node.relPath;
    div.textContent = node.name;
    div.title = node.relPath;
    parent.appendChild(div);
  } else {
    const det = document.createElement('details');
    det.className = 'tree-dir';
    det.dataset.rel = node.relPath;
    det.open = depth === 0 || expandedDirs.has(node.relPath);
    const sum = document.createElement('summary');
    sum.textContent = node.name;
    det.appendChild(sum);
    const box = document.createElement('div');
    det.appendChild(box);
    for (const c of node.children) appendNode(c, box, depth + 1);
    parent.appendChild(det);
  }
}

function renderTree(): void {
  const treeEl = $('#file-tree');
  treeEl.innerHTML = '';
  $('#tree-empty').style.display = files.length ? 'none' : 'block';
  $('#sidebar-count').textContent = files.length ? `${files.length} 篇` : '';
  $('#sidebar-title').textContent = folder ? (folder.split(/[\\/]/).pop() ?? '项目') : '项目';
  const frag = document.createDocumentFragment();
  for (const node of buildTreeModel()) appendNode(node, frag, 0);
  treeEl.appendChild(frag);
}

/* ---------- 项目系统 ---------- */

function findProject(path: string | null): Project | undefined {
  return path ? prefs.projects.find((p) => p.path === path) : undefined;
}

async function openFolder(p: string, opts: { openLastFile?: boolean } = {}): Promise<boolean> {
  if (p !== folder && dirty && !window.confirm('当前文件未保存，切换项目将丢失修改。继续？')) return false;
  let list: FileEntry[];
  try {
    list = await window.api.listFiles(p);
  } catch (e) {
    toast('读取文件夹失败：' + (e as Error).message);
    return false;
  }
  folder = p;
  files = list;

  // 登记为项目（最近使用的排最前）
  const existing = findProject(p);
  const proj: Project = existing ?? { name: p.split(/[\\/]/).pop() || p, path: p, lastFile: null, lastOpenedAt: 0 };
  proj.lastOpenedAt = Date.now();
  prefs.projects = [proj, ...prefs.projects.filter((x) => x.path !== p)];
  persistPrefsSoon();
  void window.api.watchFolder(p);

  renderTree();
  updateStatus();
  if (files.length) toast(`已载入 ${files.length} 篇`);
  else toast('该文件夹里没有 Markdown 文件');

  // 恢复上次编辑到一半的文章
  if (opts.openLastFile && proj.lastFile) {
    const f = files.find((x) => x.relPath === proj.lastFile);
    if (f) await openFile(f);
  }
  return true;
}

function closeProject(): void {
  void window.api.unwatch();
  folder = null;
  files = [];
  currentFile = null;
  currentMtime = 0;
  dirty = false;
  expandedDirs.clear();
  suppressDoc = true;
  editor.setValue('');
  suppressDoc = false;
  renderTree();
  updateStatus();
  scheduleRender(true);
}

function removeProject(path: string): void {
  prefs.projects = prefs.projects.filter((p) => p.path !== path);
  persistPrefsSoon();
  if (path === folder) closeProject();
  renderProjectList();
}

function toggleProjectPop(show?: boolean): void {
  const pop = $('#project-pop');
  const next = show ?? pop.hidden;
  if (next) renderProjectList();
  pop.hidden = !next;
}

function renderProjectList(): void {
  const list = $('#project-list');
  list.innerHTML = '';
  if (!prefs.projects.length) {
    const d = document.createElement('div');
    d.className = 'project-empty';
    d.textContent = '还没有项目，用下面的按钮添加';
    list.appendChild(d);
    return;
  }
  for (const proj of [...prefs.projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)) {
    const item = document.createElement('div');
    item.className = 'project-item' + (proj.path === folder ? ' active' : '');
    item.dataset.path = proj.path;

    const info = document.createElement('div');
    info.className = 'project-info';
    const nm = document.createElement('div');
    nm.className = 'project-name';
    nm.textContent = proj.name;
    const pt = document.createElement('div');
    pt.className = 'project-path';
    pt.textContent = proj.path;
    info.append(nm, pt);

    const rm = document.createElement('button');
    rm.className = 'project-remove';
    rm.title = '从项目列表移除（不删除文件）';
    rm.textContent = '✕';
    rm.dataset.path = proj.path;

    item.append(info, rm);
    list.appendChild(item);
  }
}

/* ---------- 视图模式 ---------- */

function setViewMode(mode: ViewMode): void {
  prefs.viewMode = mode;
  $('#app').dataset.view = mode;
  document.querySelectorAll<HTMLButtonElement>('#view-switch button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === mode);
  });
  // 隐藏过的 CodeMirror 需要重新测量，否则滚动位置和光标坐标会错位
  if (mode !== 'preview' && editor) editor.view.requestMeasure();
  persistPrefsSoon();
}

/* ---------- 文件操作 ---------- */

function fileDir(absPath: string): string {
  const i = Math.max(absPath.lastIndexOf('\\'), absPath.lastIndexOf('/'));
  return i === -1 ? '' : absPath.slice(0, i);
}

async function refreshTree(silent = false): Promise<void> {
  if (!folder) return;
  try {
    files = await window.api.listFiles(folder);
  } catch {
    return;
  }
  renderTree();
  if (!silent) toast(`已刷新，共 ${files.length} 篇`);
}

async function openFile(f: FileEntry): Promise<void> {
  if (dirty && !window.confirm('当前文件未保存，切换后将丢失修改。继续？')) return;
  try {
    const { content, mtime } = await window.api.readFile(f.absPath);
    currentFile = f;
    currentMtime = mtime;
    dirty = false;
    const proj = findProject(folder);
    if (proj) {
      proj.lastFile = f.relPath;
      persistPrefsSoon();
    }
    suppressDoc = true;
    editor.setValue(content);
    suppressDoc = false;
    scheduleRender(true);
    renderTree();
    updateStatus();
  } catch (e) {
    toast('读取失败：' + (e as Error).message);
  }
}

async function saveCurrent(): Promise<void> {
  if (!currentFile) {
    toast('没有打开的文件');
    return;
  }
  try {
    const { mtime } = await window.api.writeFile(currentFile.absPath, editor.getValue());
    currentMtime = mtime;
    dirty = false;
    updateStatus();
    toast('已保存');
  } catch (e) {
    toast('保存失败：' + (e as Error).message);
  }
}

/* ---------- 状态 / 杂项 ---------- */

function updateStatus(): void {
  $('#status-path').textContent = currentFile ? currentFile.relPath : folder ? '（未打开文件）' : '未打开文件夹';
  const d = $('#status-dirty');
  d.textContent = dirty ? '● 未保存' : '已保存';
  d.className = dirty ? 'warn' : 'ok';
  $('#editor-title').textContent = currentFile ? `${currentFile.name}${dirty ? ' *' : ''}` : '编辑器';
}

function toast(msg: string): void {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  if (toastTimer) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), 2200);
}

function persistPrefsSoon(): void {
  if (prefsTimer) window.clearTimeout(prefsTimer);
  prefsTimer = window.setTimeout(() => void window.api.setPrefs(prefs), 400);
}

/* ---------- 复制 ---------- */

/** 公众号 / 知乎各有独立的复制方案（见 CopyProfile），管线差异互不牵制 */
async function copyRich(platform: 'wechat' | 'zhihu'): Promise<void> {
  const profile = prefs.platformCopy[platform];
  const platformName = platform === 'wechat' ? '公众号' : '知乎';
  const doc = preview.contentDocument;
  if (!doc || !doc.getElementById('__typx')) {
    toast('预览尚未就绪，请稍候再试');
    return;
  }
  if (!editor.getValue().trim()) {
    toast('没有内容可复制');
    return;
  }
  try {
    const parts: string[] = [];
    // 公式先于样式内联处理：SVG/截屏替换需要预览 DOM 仍是原始结构
    if (profile.mathMode === 'svg') {
      const n = replaceMathWithSvg();
      if (n > 0) parts.push(`${n} 个公式已转 SVG`);
    } else if (profile.mathMode === 'image') {
      const n = await replaceMathWithImages();
      if (n > 0) parts.push(`${n} 个公式已转成图片`);
    } else {
      const n = doc.querySelectorAll('.katex').length;
      if (n > 0) parts.push(`${n} 个公式按 HTML 原样复制`);
    }
    // 文末推荐（按平台）：先追加进预览 DOM，再整体内联样式
    appendPlatformFooter(profile);
    let html = inlinePreviewStyles(preview);
    if (profile.embedImages) {
      const r = await processImages(html);
      html = r.html;
      if (r.uploaded + r.fellBack > 0) {
        if (r.uploaded) parts.push(`图床上传 ${r.uploaded} 张`);
        if (r.fellBack) {
          parts.push(`${r.fellBack} 张转 base64${platform === 'wechat' && prefs.imageHost.type === 'off' ? '（公众号可能不显示，可开图床）' : ''}`);
        }
      }
    }
    await window.api.copyRich(html, htmlToText(html));
    toast(
      parts.length
        ? `已复制到${platformName}：${parts.join('，')}。粘贴后请检查效果`
        : `已复制，去${platformName}编辑器粘贴即可`,
    );
  } catch (e) {
    toast('复制失败：' + (e as Error).message);
  } finally {
    // 截屏替换与内联都会改写预览 DOM，无论成败都重铺干净的
    preview.srcdoc = currentPreviewHtml();
  }
}

/** 复制时把平台专属的「文末推荐」渲染成 HTML 追加到预览末尾：
 *  自动加一条分割线，Markdown 支持链接（公众号合集 / 知乎专栏等），
 *  位置在文末脚注之前、正文之后。 */
function appendPlatformFooter(profile: CopyProfile): void {
  const doc = preview.contentDocument;
  const root = doc?.getElementById('__typx');
  if (!doc || !root || !profile.footer.trim()) return;
  const baseDir = currentFile ? fileDir(currentFile.absPath) : (folder ?? '');
  const html = renderMarkdown(`---\n\n${profile.footer.trim()}\n`, baseDir);
  const tpl = doc.createElement('div');
  tpl.innerHTML = html;
  const frag = doc.createDocumentFragment();
  while (tpl.firstChild) frag.appendChild(tpl.firstChild);
  const note = root.querySelector('.typx-footnote');
  if (note?.parentNode) note.parentNode.insertBefore(frag, note);
  else root.appendChild(frag);
}

/** 复制前把预览里的 KaTeX 公式替换为 MathJax 行内 SVG（公众号方案，见 render.ts）。
 *  原始 TeX 从 KaTeX 输出里携带的 annotation 节点取回。 */
function replaceMathWithSvg(collect?: { tex: string; reason: string; context?: string; hasAttr?: boolean; attrVal?: string; outer?: string; katexCount?: number; stamped?: number }[]): number {
  const doc = preview.contentDocument;
  if (!doc || !doc.querySelector('.katex')) return 0;
  let done = 0;
  const processed = new Set<Element>();
  for (const el of Array.from(doc.querySelectorAll('.katex'))) {
    const target = el.closest('.katex-display') ?? el;
    if (processed.has(target)) continue;
    processed.add(target);
    // TeX 源取内层 .katex（data-tex 盖在它上面）；块级公式的包装层 .katex-display 不带属性
    const tex =
      el.getAttribute('data-tex') ??
      target.getAttribute('data-tex') ??
      target.querySelector('annotation[encoding="application/x-tex"]')?.textContent ??
      '';
    if (!tex.trim()) {
      const ctx = target.closest('p')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);
      collect?.push({
        tex,
        reason: 'TeX 源缺失',
        context: ctx ?? '',
        hasAttr: target.hasAttribute('data-tex'),
        attrVal: (target.getAttribute('data-tex') ?? '').slice(0, 60),
        outer: target.outerHTML.slice(0, 180),
        katexCount: doc.querySelectorAll('.katex').length,
        stamped: doc.querySelectorAll('.katex[data-tex]').length,
      });
      continue;
    }
    const display = target.classList.contains('katex-display') || target.getAttribute('data-display') === '1';
    try {
      const svgHtml = texToSvg(tex, display);
      if (!svgHtml) {
        collect?.push({ tex, reason: 'SVG 输出为空' });
        continue;
      }
      const tpl = doc.createElement('div');
      tpl.innerHTML = svgHtml;
      const svg = tpl.firstElementChild;
      if (!svg) {
        collect?.push({ tex, reason: 'SVG 解析失败' });
        continue;
      }
      if (display) {
        const wrap = doc.createElement('p');
        wrap.setAttribute('style', 'text-align: center; margin: 0.8em 0;');
        wrap.appendChild(svg);
        target.replaceWith(wrap);
      } else {
        target.replaceWith(svg);
      }
      done++;
    } catch (e) {
      const ctx = target.closest('p')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 80);
      collect?.push({ tex, reason: (e as Error).message || String(e), context: ctx ?? '' });
    }
  }
  return done;
}

/** 复制前把预览里的 KaTeX 公式逐个截屏为 PNG —— 公式的微排版（上下标/分数的
 *  vlist 垂直堆叠、表格结构、行内定位）依赖几十条 CSS 类规则，公众号的粘贴
 *  管线保不住它们；用 webContents.capturePage 截已渲染的像素最稳。
 *  注意：capturePage 只能截到真实绘制在窗口里的内容。 */
async function replaceMathWithImages(): Promise<number> {
  const doc = preview.contentDocument;
  if (!doc || !doc.querySelector('.katex')) return 0;

  // 纯编辑模式下预览不显示（截不到），临时切回分屏，结束后还原
  const appEl = $('#app');
  const prevView = appEl.dataset.view;
  const viewSwitched = prevView === 'edit';
  if (viewSwitched) appEl.dataset.view = 'split';

  const nextFrame = (): Promise<void> =>
    new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  let done = 0;
  try {
    // .katex-display 内部还嵌着 .katex，取最外层统一处理
    const seen = new Set<Element>();
    const targets: Element[] = [];
    for (const el of Array.from(doc.querySelectorAll('.katex'))) {
      const t = el.closest('.katex-display') ?? el;
      if (!seen.has(t)) {
        seen.add(t);
        targets.push(t);
      }
    }
    const frame = preview.getBoundingClientRect();
    for (const el of targets) {
      (el as HTMLElement).scrollIntoView({ block: 'center' });
      await nextFrame();
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const pad = 1;
      const dataUrl = await window.api.captureRect({
        x: Math.max(0, Math.round(frame.left + r.left - pad)),
        y: Math.max(0, Math.round(frame.top + r.top - pad)),
        width: Math.ceil(r.width + pad * 2),
        height: Math.ceil(r.height + pad * 2),
      });
      if (!dataUrl) continue;
      const img = doc.createElement('img');
      img.className = 'typx-math-img';
      img.src = dataUrl;
      img.style.width = `${Math.ceil(r.width)}px`;
      img.style.height = `${Math.ceil(r.height)}px`;
      if (el.classList.contains('katex-display')) {
        img.style.display = 'block';
        img.style.margin = '0.6em auto';
      } else {
        img.style.display = 'inline-block';
        img.style.verticalAlign = '-0.2em';
      }
      el.replaceWith(img);
      done++;
    }
  } finally {
    if (viewSwitched) appEl.dataset.view = prevView!;
  }
  return done;
}

/** 复制时处理图片：本地图（mdfile://）与公式截图（data:）优先上传图床换 https
 *  外链——公众号正文会过滤 base64 图片、但会自动转存外链图；未配置或上传失败
 *  回退 base64（知乎等平台可用）。http(s) 外链原样保留交给平台转存。 */
async function processImages(html: string): Promise<{ html: string; uploaded: number; fellBack: number }> {
  const host = prefs.imageHost;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let uploaded = 0;
  let fellBack = 0;
  for (const img of Array.from(doc.querySelectorAll('img'))) {
    const src = img.getAttribute('src') ?? '';
    let base64: string | null = null;
    let mime = 'image/png';
    let fileName = 'img.png';
    if (src.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/.exec(src);
      if (m) {
        mime = m[1];
        base64 = m[2];
        fileName = `img.${(mime.split('/')[1] ?? 'png').replace('jpeg', 'jpg')}`;
      }
    } else if (src.startsWith('mdfile:')) {
      const localPath = mdFileUrlToPath(src);
      if (localPath) {
        try {
          const r = await window.api.readFileBase64(localPath);
          base64 = r.base64;
          mime = r.mime;
          fileName = localPath.split(/[\\/]/).pop() ?? 'img.png';
        } catch {
          // 文件读不到（可能已被移动/删除），跳过
        }
      }
    } else {
      continue; // http(s) 外链：公众号 / 知乎粘贴时自动抓取转存
    }
    if (!base64) continue;
    if (host.type === 'github') {
      try {
        const url = await window.api.uploadImage(host, fileName, base64);
        img.setAttribute('src', url);
        uploaded++;
        continue;
      } catch {
        // 上传失败（网络/权限等）回退 base64
      }
    }
    img.setAttribute('src', `data:${mime};base64,${base64}`);
    fellBack++;
  }
  return { html: doc.body.innerHTML, uploaded, fellBack };
}

/* ---------- 编辑器回调 ---------- */

function onDoc(value: string): void {
  if (suppressDoc) return;
  if (!dirty) {
    dirty = true;
    updateStatus();
  }
  $('#status-count').textContent = `字数 ${value.replace(/\s/g, '').length}`;
  scheduleRender();
}

function onEditorScrollRatio(r: number): void {
  if (!prefs.syncScroll) return;
  const w = preview.contentWindow;
  if (!w) return;
  const scroller = w.document.scrollingElement ?? w.document.documentElement;
  const denom = scroller.scrollHeight - w.innerHeight;
  if (denom > 1) w.scrollTo(0, r * denom);
}

/* ---------- 事件绑定 ---------- */

function wireEvents(): void {
  $('#btn-open').addEventListener('click', async () => {
    const p = await window.api.selectFolder();
    if (p) await openFolder(p);
  });

  $('#btn-refresh').addEventListener('click', () => void refreshTree());

  // 项目切换 / 管理
  $('#btn-project').addEventListener('click', (ev) => {
    ev.stopPropagation();
    toggleProjectPop();
  });
  $('#project-list').addEventListener('click', (ev) => {
    const rm = (ev.target as HTMLElement).closest('.project-remove') as HTMLElement | null;
    if (rm?.dataset.path) {
      ev.stopPropagation();
      const proj = findProject(rm.dataset.path);
      if (proj && window.confirm(`从项目列表移除「${proj.name}」？（不会删除磁盘上的文件）`)) removeProject(rm.dataset.path);
      return;
    }
    const item = (ev.target as HTMLElement).closest('.project-item') as HTMLElement | null;
    if (item?.dataset.path) {
      toggleProjectPop(false);
      void openFolder(item.dataset.path, { openLastFile: true });
    }
  });
  $('#btn-project-add').addEventListener('click', async () => {
    toggleProjectPop(false);
    const p = await window.api.selectFolder();
    if (p) await openFolder(p, { openLastFile: true });
  });
  document.addEventListener('click', (ev) => {
    const t = ev.target as HTMLElement;
    if (!t.closest('#project-pop') && !t.closest('#btn-project')) toggleProjectPop(false);
  });

  // 视图模式（编辑 / 分屏 / 预览）
  $('#view-switch').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (b?.dataset.view) setViewMode(b.dataset.view as ViewMode);
  });

  $('#file-tree').addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement).closest('.tree-file') as HTMLElement | null;
    if (!el?.dataset.rel) return;
    const f = files.find((x) => x.relPath === el.dataset.rel);
    if (f) void openFile(f);
  });
  $('#file-tree').addEventListener(
    'toggle',
    (ev) => {
      const t = ev.target as HTMLDetailsElement;
      if (t.tagName === 'DETAILS' && t.dataset.rel) {
        if (t.open) expandedDirs.add(t.dataset.rel);
        else expandedDirs.delete(t.dataset.rel);
      }
    },
    true,
  );

  // 文件树右键菜单：默认程序打开 / 资源管理器定位
  const fileMenu = $('#file-menu');
  let menuFilePath: string | null = null;
  const closeFileMenu = (): void => {
    fileMenu.hidden = true;
  };
  $('#file-tree').addEventListener('contextmenu', (ev) => {
    const el = (ev.target as HTMLElement).closest('.tree-file') as HTMLElement | null;
    if (!el?.dataset.rel) return;
    ev.preventDefault();
    const f = files.find((x) => x.relPath === el.dataset.rel);
    if (!f) return;
    menuFilePath = f.absPath;
    fileMenu.style.left = `${Math.min(ev.clientX, window.innerWidth - 190)}px`;
    fileMenu.style.top = `${Math.min(ev.clientY, window.innerHeight - 92)}px`;
    fileMenu.hidden = false;
  });
  document.addEventListener('click', (ev) => {
    if (!(ev.target as HTMLElement).closest('#file-menu')) closeFileMenu();
  });
  document.addEventListener('contextmenu', (ev) => {
    if (!(ev.target as HTMLElement).closest('.tree-file')) closeFileMenu();
  });
  $('#fm-open-default').addEventListener('click', async () => {
    const p = menuFilePath;
    closeFileMenu();
    if (!p) return;
    const err = await window.api.openPath(p);
    if (err) toast('打开失败：' + err);
  });
  $('#fm-show-folder').addEventListener('click', () => {
    const p = menuFilePath;
    closeFileMenu();
    if (p) void window.api.showInFolder(p);
  });

  $('#sel-theme').addEventListener('change', () => {
    prefs.themeId = ($('#sel-theme') as HTMLSelectElement).value;
    $('#preview-theme-name').textContent = currentTheme().name;
    preview.srcdoc = currentPreviewHtml();
    persistPrefsSoon();
  });

  $('#chk-sync').addEventListener('change', () => {
    prefs.syncScroll = ($('#chk-sync') as HTMLInputElement).checked;
    persistPrefsSoon();
  });

  // 复制方案按平台独立：当前弹窗里编辑的是哪个平台的配置
  let copyTab: 'wechat' | 'zhihu' = 'wechat';
  const fillCopyProfileUi = (): void => {
    const p = prefs.platformCopy[copyTab];
    ($('#sel-math-mode') as HTMLSelectElement).value = p.mathMode;
    ($('#chk-embed') as HTMLInputElement).checked = p.embedImages;
    ($('#footer-input') as HTMLTextAreaElement).value = p.footer;
    document.querySelectorAll<HTMLButtonElement>('#copy-platform button').forEach((b) => {
      b.classList.toggle('active', b.dataset.p === copyTab);
    });
  };
  $('#copy-platform').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (b?.dataset.p) {
      copyTab = b.dataset.p as 'wechat' | 'zhihu';
      fillCopyProfileUi();
    }
  });
  $('#chk-embed').addEventListener('change', () => {
    prefs.platformCopy[copyTab].embedImages = ($('#chk-embed') as HTMLInputElement).checked;
    persistPrefsSoon();
  });
  $('#sel-math-mode').addEventListener('change', () => {
    prefs.platformCopy[copyTab].mathMode = ($('#sel-math-mode') as HTMLSelectElement).value as Prefs['platformCopy']['wechat']['mathMode'];
    persistPrefsSoon();
  });

  $('#btn-copy-rich').addEventListener('click', () => void copyRich('wechat'));
  $('#btn-copy-zhihu').addEventListener('click', () => void copyRich('zhihu'));

  $('#btn-copy-md').addEventListener('click', () => {
    const v = editor.getValue();
    if (!v.trim()) {
      toast('没有内容可复制');
      return;
    }
    void window.api.copyText(v);
    toast('已复制 Markdown 原文');
  });

  window.addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 's') {
      ev.preventDefault();
      void saveCurrent();
    }
  });

  /* ---- 自定义样式弹窗 ---- */
  const mask = $('#modal-mask');
  const TINY_PNG_B64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  $('#btn-css').addEventListener('click', () => {
    const t = currentTheme();
    const isCustom = prefs.customThemes.some((c) => c.id === prefs.themeId);
    ($('#theme-name') as HTMLInputElement).value = isCustom ? t.name : `${t.name} - 改`;
    ($('#css-input') as HTMLTextAreaElement).value = t.css;
    ($('#footnote') as HTMLInputElement).value = prefs.footnote;
    ($('#font-size') as HTMLInputElement).value = String(prefs.editorFontSize);
    ($('#chk-embed') as HTMLInputElement).checked = prefs.platformCopy.wechat.embedImages;
    copyTab = 'wechat';
    fillCopyProfileUi();
    $('#btn-theme-delete').hidden = !isCustom;
    mask.hidden = false;
  });

  const closeModal = () => {
    mask.hidden = true;
    preview.srcdoc = currentPreviewHtml();
  };
  $('#btn-theme-cancel').addEventListener('click', closeModal);
  mask.addEventListener('click', (ev) => {
    if (ev.target === mask) closeModal();
  });

  $('#btn-theme-preview').addEventListener('click', () => {
    const css = ($('#css-input') as HTMLTextAreaElement).value;
    const savedFootnote = prefs.footnote;
    prefs.footnote = ($('#footnote') as HTMLInputElement).value;
    preview.srcdoc = currentPreviewHtml(css);
    prefs.footnote = savedFootnote;
  });

  $('#btn-theme-save').addEventListener('click', () => {
    const name = ($('#theme-name') as HTMLInputElement).value.trim() || '我的主题';
    const css = ($('#css-input') as HTMLTextAreaElement).value;
    const existing = prefs.customThemes.find((t) => t.name === name);
    const theme: CustomTheme = { id: existing ? existing.id : `custom-${Date.now()}`, name, css };
    prefs.customThemes = [...prefs.customThemes.filter((t) => t.id !== theme.id), theme];
    prefs.themeId = theme.id;
    prefs.footnote = ($('#footnote') as HTMLInputElement).value;
    prefs.editorFontSize = Math.min(24, Math.max(12, parseInt(($('#font-size') as HTMLInputElement).value, 10) || 15));
    prefs.platformCopy[copyTab].embedImages = ($('#chk-embed') as HTMLInputElement).checked;
    prefs.platformCopy[copyTab].mathMode = ($('#sel-math-mode') as HTMLSelectElement).value as Prefs['platformCopy']['wechat']['mathMode'];
    prefs.platformCopy[copyTab].footer = ($('#footer-input') as HTMLTextAreaElement).value;
    document.documentElement.style.setProperty('--cm-font-size', `${prefs.editorFontSize}px`);
    rebuildThemeSelect();
    preview.srcdoc = currentPreviewHtml();
    persistPrefsSoon();
    mask.hidden = true;
    toast(`主题「${name}」已保存并应用`);
  });

  $('#btn-theme-delete').addEventListener('click', () => {
    const t = currentTheme();
    if (!window.confirm(`删除主题「${t.name}」？`)) return;
    prefs.customThemes = prefs.customThemes.filter((c) => c.id !== t.id);
    prefs.themeId = BUILT_IN_THEMES[0].id;
    rebuildThemeSelect();
    preview.srcdoc = currentPreviewHtml();
    persistPrefsSoon();
    mask.hidden = true;
    toast('主题已删除');
  });

  /* ---- 图床设置弹窗 ---- */
  const hostMask = $('#host-modal-mask');
  let hostProvider: ImageHostConfig['type'] = 'off';

  const syncHostUi = (): void => {
    $('#host-fields-git').hidden = !(hostProvider === 'gitee' || hostProvider === 'github');
    $('#host-fields-smms').hidden = hostProvider !== 'smms';
    $('#host-url-style-row').hidden = hostProvider !== 'github';
    $('#host-git-note').textContent =
      hostProvider === 'gitee'
        ? 'Gitee 上传接口有频率限制（约每小时 20 次），一次复制大量图片可能部分回退 base64'
        : '外链经 jsDelivr CDN 分发，粘贴图片不显示时可切换链接风格';
    document.querySelectorAll<HTMLButtonElement>('#host-prov button').forEach((b) => {
      b.classList.toggle('active', b.dataset.p === hostProvider);
    });
  };

  const readHostConfig = (): ImageHostConfig => {
    if (hostProvider === 'off') {
      return { type: 'off', token: '', repo: '', branch: 'master', dir: '', urlStyle: 'jsdelivr' };
    }
    if (hostProvider === 'smms') {
      return { type: 'smms', token: ($('#smms-token') as HTMLInputElement).value.trim(), repo: '', branch: 'master', dir: '', urlStyle: 'jsdelivr' };
    }
    return {
      type: hostProvider,
      token: ($('#host-token') as HTMLInputElement).value.trim(),
      repo: ($('#host-repo') as HTMLInputElement).value.trim(),
      branch: ($('#host-branch') as HTMLInputElement).value.trim() || (hostProvider === 'github' ? 'main' : 'master'),
      dir: ($('#host-dir') as HTMLInputElement).value.trim(),
      urlStyle: ($('#host-url-style') as HTMLSelectElement).value as ImageHostConfig['urlStyle'],
    };
  };

  $('#btn-host').addEventListener('click', () => {
    hostProvider = prefs.imageHost.type;
    ($('#host-token') as HTMLInputElement).value = prefs.imageHost.type === 'smms' ? '' : prefs.imageHost.token;
    ($('#smms-token') as HTMLInputElement).value = prefs.imageHost.type === 'smms' ? prefs.imageHost.token : '';
    ($('#host-repo') as HTMLInputElement).value = prefs.imageHost.repo;
    ($('#host-branch') as HTMLInputElement).value = prefs.imageHost.branch;
    ($('#host-dir') as HTMLInputElement).value = prefs.imageHost.dir;
    ($('#host-url-style') as HTMLSelectElement).value = prefs.imageHost.urlStyle;
    $('#host-test-result').textContent = '';
    syncHostUi();
    hostMask.hidden = false;
  });

  $('#host-prov').addEventListener('click', (ev) => {
    const b = (ev.target as HTMLElement).closest('button') as HTMLButtonElement | null;
    if (b?.dataset.p) {
      hostProvider = b.dataset.p as ImageHostConfig['type'];
      syncHostUi();
    }
  });

  $('#btn-host-test').addEventListener('click', async () => {
    const cfg = readHostConfig();
    const el = $('#host-test-result');
    if (cfg.type === 'off' || !cfg.token) {
      el.textContent = '请选择服务商并填写 Token';
      return;
    }
    el.textContent = '上传中…';
    try {
      const url = await window.api.uploadImage(cfg, 'test.png', TINY_PNG_B64);
      el.textContent = '✅ ' + url;
    } catch (e) {
      el.textContent = '❌ ' + (e as Error).message;
    }
  });

  $('#btn-host-save').addEventListener('click', () => {
    prefs.imageHost = readHostConfig();
    persistPrefsSoon();
    hostMask.hidden = true;
    const names: Record<ImageHostConfig['type'], string> = { off: '已关闭', gitee: 'Gitee', github: 'GitHub', smms: 'SM.MS' };
    toast(`图床已保存：${names[prefs.imageHost.type]}`);
  });
  $('#btn-host-cancel').addEventListener('click', () => {
    hostMask.hidden = true;
  });
  hostMask.addEventListener('click', (ev) => {
    if (ev.target === hostMask) hostMask.hidden = true;
  });

  // 引导链接走系统浏览器
  $('#lnk-gitee-guide').addEventListener('click', (ev) => {
    ev.preventDefault();
    void window.api.openExternal('https://gitee.com/profile/personal_access_tokens');
  });
  $('#lnk-smms-guide').addEventListener('click', (ev) => {
    ev.preventDefault();
    void window.api.openExternal('https://sm.ms/apitoken');
  });

  /* ---- 外部文件变化 ---- */
  window.api.onFsChanged(async (info) => {
    await refreshTree(true);
    if (currentFile && info.relPath) {
      const rel = info.relPath.replace(/\\/g, '/');
      if (rel === currentFile.relPath || rel.startsWith(currentFile.relPath + '/')) {
        if (!dirty) {
          try {
            const { content, mtime } = await window.api.readFile(currentFile.absPath);
            if (mtime !== currentMtime) {
              currentMtime = mtime;
              suppressDoc = true;
              editor.setValue(content);
              suppressDoc = false;
              scheduleRender(true);
              toast('文件在外部被修改，已自动重载');
            }
          } catch {
            // 文件可能刚被删除，交给下次刷新
          }
        } else {
          toast('文件在外部被修改（编辑器里有未保存的更改）');
        }
      }
    }
  });
}

/* ---------- 启动 ---------- */

(async function init(): Promise<void> {
  try {
    prefs = { ...prefs, ...(await window.api.getPrefs()) };
  } catch {
    // 首次启动没有偏好文件，用默认值
  }
  // 旧版迁移：全局 mathMode / embedImages 归入公众号方案（公众号管线是先成熟的那套）
  if (prefs.mathMode && prefs.platformCopy.wechat.mathMode !== prefs.mathMode) {
    prefs.platformCopy = {
      ...prefs.platformCopy,
      wechat: { ...prefs.platformCopy.wechat, mathMode: prefs.mathMode },
    };
  }
  document.documentElement.style.setProperty('--cm-font-size', `${prefs.editorFontSize}px`);

  editor = createEditor($('#editor'), onDoc, onEditorScrollRatio);
  rebuildThemeSelect();
  ($('#chk-sync') as HTMLInputElement).checked = prefs.syncScroll;
  setViewMode(prefs.viewMode);
  wireEvents();

  // 调试/测试钩子（--math-test 等自动化流程用，正常使用不涉及）；
  // 尽早注册，避免与测试脚本竞态
  (window as unknown as { __typx: unknown }).__typx = {
    setMarkdown(md: string): void {
      suppressDoc = true;
      editor.setValue(md);
      suppressDoc = false;
      dirty = false;
      scheduleRender(true);
    },
    captureMath: replaceMathWithImages,
    svgMath: replaceMathWithSvg,
    setTheme(id: string): void {
      prefs.themeId = id;
      rebuildThemeSelect();
      preview.srcdoc = currentPreviewHtml();
    },
    async openProject(p: string): Promise<boolean> {
      return openFolder(p, { openLastFile: false });
    },
    async shotPreview(): Promise<string | null> {
      const r = preview.getBoundingClientRect();
      return window.api.captureRect({ x: Math.round(r.left), y: Math.round(r.top), width: Math.ceil(r.width), height: Math.ceil(r.height) });
    },
    async shotWindow(): Promise<string | null> {
      return window.api.captureRect({ x: 0, y: 0, width: window.innerWidth, height: window.innerHeight });
    },
    testFooter: (footerMd: string): { html: string } => {
      appendPlatformFooter({ ...prefs.platformCopy.wechat, footer: footerMd });
      return { html: inlinePreviewStyles(preview) };
    },
    svgMathDetailed: () => {
      const failed: { tex: string; reason: string }[] = [];
      const n = replaceMathWithSvg(failed);
      return { n, failed };
    },
    texToSvg: (tex: string, display: boolean) => {
      try {
        return { ok: true, html: texToSvg(tex, display) };
      } catch (e) {
        return { ok: false, error: String(e), stack: (e as Error).stack?.slice(0, 300) };
      }
    },
    previewFrameRect: (): DOMRect => preview.getBoundingClientRect(),
  };

  previewBody = welcomeHtml();
  preview.srcdoc = currentPreviewHtml();
  updateStatus();

  // 旧版本迁移：lastFolder -> projects
  if (!prefs.projects.length && prefs.lastFolder) {
    prefs.projects = [
      {
        name: prefs.lastFolder.split(/[\\/]/).pop() || prefs.lastFolder,
        path: prefs.lastFolder,
        lastFile: null,
        lastOpenedAt: Date.now(),
      },
    ];
  }

  // 恢复最近使用的项目（连同上次编辑到一半的文章）
  if (prefs.projects.length) {
    const latest = [...prefs.projects].sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)[0];
    await openFolder(latest.path, { openLastFile: true });
  }
})();
