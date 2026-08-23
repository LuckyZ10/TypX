import { app, BrowserWindow, Menu, protocol } from 'electron';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { setupIpc } from './ipc';

// mdfile:// 供预览里的本地图片使用；typx:// 承载渲染进程页面（拿到正常 origin，
// srcdoc 预览 iframe 才能被父页面访问，用于把计算样式内联成行内样式）
protocol.registerSchemesAsPrivileged([
  { scheme: 'mdfile', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'typx', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

let win: BrowserWindow | null = null;

async function createWindow(): Promise<void> {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 980,
    minHeight: 640,
    title: 'TypX',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F10') win?.webContents.toggleDevTools();
  });

  if (process.argv.includes('--smoke')) {
    console.log('[smoke] app-ready');
    win.webContents.on('console-message', (_e, _level, message) => console.log('[renderer]', message));
    win.webContents.once('did-finish-load', () => {
      console.log('[smoke] renderer-loaded');
      // 验证 KaTeX 样式与字体、mdfile:// 本地图片协议可访问（含 MIME 正确性）
      void win!
        .webContents.executeJavaScript(
          `(async () => {
            const css = await fetch('katex.min.css');
            const font = await fetch('fonts/KaTeX_Main-Regular.woff2');
            const png = await fetch('mdfile://md/D%3A/codex/TypX/test-docs/img/pic.png');
            const pngSize = png.ok ? (await png.arrayBuffer()).byteLength : 0;
            const cn = await fetch('mdfile://md/D%3A/codex/TypX/test-docs/img/%E5%9B%BE%E7%89%87%20%E7%A4%BA%E4%BE%8B.png');
            // 真实 <img> 加载路径（与预览 iframe 相同的加载方式）
            const imgLoad = await new Promise((res) => {
              const im = new Image();
              im.onload = () => res('loaded ' + im.naturalWidth + 'x' + im.naturalHeight);
              im.onerror = () => res('error');
              im.src = 'mdfile://md/D%3A/codex/TypX/test-docs/img/pic.png';
            });
            // 复制时的本地图片 base64 内嵌（window.api 由 preload 暴露）
            const b64 = await window.api.readFileBase64('D:/codex/TypX/test-docs/img/pic.png');
            // 公式转图片依赖的截屏通道（capturePage 需要窗口真实绘制）
            const cap = await window.api.captureRect({ x: 0, y: 0, width: 120, height: 40 });
            return JSON.stringify({
              css: css.status, cssType: css.headers.get('content-type'),
              font: font.status, fontType: font.headers.get('content-type'),
              png: png.status, pngType: png.headers.get('content-type'), pngSize,
              cn: cn.status,
              imgLoad,
              b64Mime: b64.mime, b64Len: b64.base64.length,
              cap: cap ? (cap.startsWith('data:image/png') ? 'png:' + cap.length : 'bad:' + cap.slice(0, 24)) : 'null',
            });
          })()`,
        )
        .then((r) => console.log('[smoke] katex-assets', r))
        .catch((e) => {
          console.log('[smoke] katex-assets-error', String(e));
          process.exitCode = 1;
        })
        .finally(() => {
          setTimeout(() => {
            console.log('[smoke] ok');
            app.quit();
          }, 400);
        });
    });
  }

  if (process.argv.includes('--math-test')) {
    console.log('[mathtest] start');
    const md = [
      '# 公式截图测试',
      '',
      '行内公式 $E = mc^2$ 与 $e^{i\\pi} + 1 = 0$，再来一个分数 $\\frac{a+b}{c}$。',
      '',
      '$$',
      '\\int_{-\\infty}^{\\infty} e^{-x^2} \\, dx = \\sqrt{\\pi}',
      '$$',
      '',
      '结尾行内式 $a^2 + b^2 = c^2$。',
    ].join('\n');
    void win!
      .webContents.executeJavaScript(
        `(async () => {
          for (let i = 0; i < 50 && !window.__typx; i++) await new Promise((r) => setTimeout(r, 100));
          if (!window.__typx) return JSON.stringify({ error: 'hook not ready' });
          const probe = window.__typx.texToSvg('E = mc^2', false);
          window.__typx.setMarkdown(${JSON.stringify(md)});
          await new Promise((r) => setTimeout(r, 900));
          const katexCount = document.querySelector('#preview').contentDocument.querySelectorAll('.katex').length;
          const annCount = document.querySelector('#preview').contentDocument.querySelectorAll('annotation').length;
          const mathmlCount = document.querySelector('#preview').contentDocument.querySelectorAll('.katex-mathml').length;
          // SVG 模式（公众号方案），带回失败明细
          const svgRes = window.__typx.svgMathDetailed();
          const svgN = svgRes.n;
          const svgFailed = svgRes.failed;
          const svgEls = Array.from(
            document.querySelector('#preview').contentDocument.querySelectorAll('#__typx svg'),
          );
          const hasDefs = svgEls.some((s) => s.querySelector('defs'));
          // 截图模式
          const n = await window.__typx.captureMath();
          const frame = window.__typx.previewFrameRect();
          const imgs = Array.from(
            document.querySelector('#preview').contentDocument.querySelectorAll('img.typx-math-img'),
          ).map((im) => im.src);
          const full = await window.api.captureRect({
            x: Math.round(frame.left), y: Math.round(frame.top),
            width: Math.ceil(frame.width), height: Math.ceil(frame.height),
          });
          return JSON.stringify({ probe, katexCount, annCount, mathmlCount, svgN, svgFailed, svgCount: svgEls.length, hasDefs, n, count: imgs.length, imgs, full, frame: { w: frame.width, h: frame.height } });
        })()`,
      )
      .then(async (r) => {
        const data = JSON.parse(r) as {
          probe?: unknown; katexCount?: number; annCount?: number; mathmlCount?: number;
          svgN?: number; svgFailed?: { tex: string; reason: string; context?: string; hasAttr?: boolean; attrVal?: string; outer?: string; katexCount?: number; stamped?: number }[]; svgCount?: number; hasDefs?: boolean; error?: string;
          n?: number; count?: number; imgs?: string[]; full?: string; frame?: { w: number; h: number };
        };
        if (data.error) {
          console.log('[mathtest] error', data.error);
          app.exit(1);
          return;
        }
        const out = path.join(process.cwd(), 'capture-debug');
        await fs.mkdir(out, { recursive: true });
        (data.imgs ?? []).slice(0, 6).forEach((src, i) => {
          const b64 = src.split(',')[1] ?? '';
          void fs.writeFile(path.join(out, `math-${i}.png`), Buffer.from(b64, 'base64'));
        });
        if (data.full) {
          void fs.writeFile(path.join(out, 'preview-full.png'), Buffer.from(data.full.split(',')[1] ?? '', 'base64'));
        }
        console.log('[mathtest] probe', JSON.stringify(data.probe).slice(0, 600));
        console.log('[mathtest] katex', data.katexCount, 'annotation', data.annCount, 'mathml', data.mathmlCount);
        for (const f of data.svgFailed ?? []) {
          console.log('[mathtest] FAILED-SVG |', f.reason, '| attr=' + f.hasAttr + ':' + JSON.stringify(f.attrVal), '| katex=' + f.katexCount + '/stamped=' + f.stamped, '| outer=' + JSON.stringify((f.outer ?? '').slice(0, 120)), '| ctx=' + JSON.stringify(f.context ?? ''));
        }
        console.log('[mathtest] svg', data.svgN, 'els', data.svgCount, 'hasDefs', data.hasDefs, '| image', data.n, 'replaced', data.count, 'frame', JSON.stringify(data.frame));
        console.log('[mathtest] saved to capture-debug/');
        setTimeout(() => app.quit(), 1200);
      })
      .catch((e) => {
        console.log('[mathtest] error', String(e));
        app.exit(1);
      });
  }

  if (process.env.TYPX_DEV_URL) {
    await win.loadURL(process.env.TYPX_DEV_URL);
  } else {
    await win.loadURL('typx://app/index.html');
  }
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  // 本地图片：mdfile://md/D:/path/img.png -> 读文件返回
  protocol.handle('mdfile', async (request) => {
    try {
      const u = new URL(request.url);
      let p = decodeURIComponent(u.pathname);
      // '/D:/foo'（libuv 会当成当前盘符下的 D: 目录，必须去掉前导斜杠）
      if (/^\/[a-zA-Z]:\//.test(p)) p = p.slice(1);
      else p = p.replace(/\//g, '\\'); // '//server/share' -> UNC '\\server\share'
      const data = await fs.readFile(p);
      return new Response(data, {
        headers: { 'content-type': MIME[path.extname(p).toLowerCase()] ?? 'application/octet-stream' },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  // 渲染进程页面：typx://app/<file> -> dist/renderer/<file>
  protocol.handle('typx', async (request) => {
    try {
      const u = new URL(request.url);
      const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html';
      const file = path.join(__dirname, '../renderer', rel);
      const data = await fs.readFile(file);
      return new Response(data, {
        headers: { 'content-type': MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' },
      });
    } catch {
      return new Response('Not Found', { status: 404 });
    }
  });

  setupIpc(() => win);
  void createWindow();
});

app.on('window-all-closed', () => app.quit());
