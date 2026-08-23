import { app, BrowserWindow, clipboard, dialog, ipcMain, shell, type Rectangle } from 'electron';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { loadPrefs, savePrefs } from './prefs';
import type { FileEntry, ImageHostConfig } from '../shared/types';

/* 上传缓存：内容哈希 -> 外链。同一张图（含公式截图）重复复制时秒回、
   不再消耗图床的请求配额。上限 1000 条，超出按最旧淘汰。 */
const uploadCache = new Map<string, string>();
let uploadCacheSaveTimer: NodeJS.Timeout | null = null;

function uploadCachePath(): string {
  return path.join(app.getPath('userData'), 'upload-cache.json');
}

function loadUploadCache(): void {
  try {
    const raw = JSON.parse(fs.readFileSync(uploadCachePath(), 'utf-8')) as Record<string, string>;
    for (const [k, v] of Object.entries(raw)) uploadCache.set(k, v);
  } catch {
    // 首次运行没有缓存文件
  }
}

function saveUploadCacheSoon(): void {
  if (uploadCacheSaveTimer) clearTimeout(uploadCacheSaveTimer);
  uploadCacheSaveTimer = setTimeout(() => {
    uploadCacheSaveTimer = null;
    try {
      while (uploadCache.size > 1000) {
        const oldest = uploadCache.keys().next().value;
        if (oldest === undefined) break;
        uploadCache.delete(oldest);
      }
      fs.writeFileSync(uploadCachePath(), JSON.stringify(Object.fromEntries(uploadCache)), 'utf-8');
    } catch {
      // 缓存写失败不影响主流程
    }
  }, 1000);
}

const MD_EXT = /\.(md|markdown|mdx)$/i;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'release', '.git', '.vscode', '.idea']);

const MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
};

export function walkMarkdown(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  const rec = (dir: string, rel: string): void => {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    for (const ent of entries) {
      const childRel = rel ? `${rel}/${ent.name}` : ent.name;
      const childAbs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name) || ent.name.startsWith('.')) continue;
        rec(childAbs, childRel);
      } else if (ent.isFile() && MD_EXT.test(ent.name)) {
        out.push({ relPath: childRel, absPath: childAbs, name: ent.name });
      }
    }
  };
  rec(root, '');
  return out;
}

let watcher: fs.FSWatcher | null = null;
let watchDebounce: NodeJS.Timeout | null = null;

export function setupIpc(getWin: () => BrowserWindow | null): void {
  ipcMain.handle('folder:select', async () => {
    const res = await dialog.showOpenDialog({ properties: ['openDirectory'] });
    return res.canceled ? null : (res.filePaths[0] ?? null);
  });

  ipcMain.handle('folder:list', (_e, folder: string) => walkMarkdown(folder));

  ipcMain.handle('file:read', (_e, absPath: string) => {
    let content = fs.readFileSync(absPath, 'utf-8');
    if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
    return { content, mtime: fs.statSync(absPath).mtimeMs };
  });

  ipcMain.handle('file:save', (_e, absPath: string, content: string) => {
    fs.writeFileSync(absPath, content, 'utf-8');
    return { mtime: fs.statSync(absPath).mtimeMs };
  });

  const IMAGE_MIME: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.avif': 'image/avif',
    '.ico': 'image/x-icon',
  };
  ipcMain.handle('file:readBase64', (_e, absPath: string) => {
    const buf = fs.readFileSync(absPath);
    return { base64: buf.toString('base64'), mime: IMAGE_MIME[path.extname(absPath).toLowerCase()] ?? 'application/octet-stream' };
  });

  ipcMain.handle('app:captureRect', async (_e, rect: Rectangle) => {
    const w = getWin();
    if (!w) return null;
    try {
      const img = await w.webContents.capturePage(rect);
      if (img.isEmpty()) return null;
      // 缩回 1x 逻辑像素：公众号可能剥掉行内宽高样式，此时图片按原始像素渲染，
      // 高 DPI 截图（如 150% 缩放）会整体放大、破坏行距
      const scaled = img.resize({ width: Math.max(1, Math.round(rect.width)) });
      return scaled.toDataURL();
    } catch {
      return null;
    }
  });

  // 图床：上传图片换 https 外链（公众号粘贴时会自动抓取转存这类外链图）
  loadUploadCache();
  ipcMain.handle(
    'imagehost:upload',
    async (_e, cfg: ImageHostConfig, fileName: string, base64: string): Promise<string> => {
      if (cfg.type === 'off' || !cfg.token.trim()) throw new Error('图床未配置（缺少 Token）');
      const buf = Buffer.from(base64, 'base64');
      const hash = createHash('sha1').update(buf).digest('hex').slice(0, 12);
      const ext = (fileName.match(/\.[a-zA-Z0-9]+$/)?.[0] ?? '.png').toLowerCase();
      const cacheKey = `${cfg.type}|${cfg.repo}|${cfg.branch}|${cfg.dir}|${cfg.urlStyle}|${hash}`;
      const cached = uploadCache.get(cacheKey);
      if (cached) return cached;

      const remember = (url: string): string => {
        uploadCache.set(cacheKey, url);
        saveUploadCacheSoon();
        return url;
      };

      if (cfg.type === 'smms') {
        const mime = MIME_BY_EXT[ext] ?? 'image/png';
        const form = new FormData();
        form.append('smfile', new Blob([buf], { type: mime }), fileName);
        const res = await fetch('https://sm.ms/api/v2/upload', {
          method: 'POST',
          headers: { Authorization: cfg.token.trim() },
          body: form,
        });
        const data = (await res.json().catch(() => null)) as
          | { success?: boolean; data?: { url?: string }; code?: string; images?: string; message?: string }
          | null;
        if (data?.success && data.data?.url) return remember(data.data.url);
        // 同图已传过：sm.ms 返回 image_repeated，images 字段是既有链接
        if (data?.code === 'image_repeated' && typeof data.images === 'string') return remember(data.images);
        throw new Error(`SM.MS ${res.status}: ${data?.message ?? '上传失败'}`);
      }

      // gitee / github：按内容哈希命名，同图复用同一路径
      if (!cfg.repo.includes('/')) throw new Error('图床未配置（需要 用户名/仓库）');
      const [owner, repo] = cfg.repo.split('/').map((s) => s.trim()).filter(Boolean);
      const branch = cfg.branch.trim() || 'master';
      const name = `typx-${hash}${ext}`;
      const dir = cfg.dir.replace(/^\/+|\/+$/g, '');
      const repoPath = (dir ? `${dir}/${name}` : name).split('/').map(encodeURIComponent).join('/');

      if (cfg.type === 'gitee') {
        const api = `https://gitee.com/api/v5/repos/${owner}/${repo}/contents/${repoPath}`;
        const payloadBase = { access_token: cfg.token.trim(), content: base64, message: `TypX upload ${name}` };
        let res = await fetch(api, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...payloadBase, branch }),
        });
        if (!res.ok) {
          // 已存在（内容哈希命名的旧图）：查 sha 后走更新
          const get = await fetch(`${api}?access_token=${encodeURIComponent(cfg.token.trim())}&ref=${encodeURIComponent(branch)}`);
          if (get.ok) {
            const { sha } = (await get.json()) as { sha?: string };
            if (sha) {
              res = await fetch(api, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...payloadBase, sha, branch }),
              });
            }
          }
        }
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(`Gitee ${res.status}: ${text.slice(0, 140)}`);
        }
        return remember(`https://gitee.com/${owner}/${repo}/raw/${encodeURIComponent(branch)}/${repoPath}`);
      }

      // github
      const res = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/contents/${repoPath}`,
        {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${cfg.token.trim()}`,
            Accept: 'application/vnd.github+json',
            'User-Agent': 'TypX',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ message: `TypX upload ${name}`, content: base64, branch }),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`GitHub ${res.status}: ${text.slice(0, 140)}`);
      }
      if (cfg.urlStyle === 'raw') {
        return remember(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(branch)}/${repoPath}`);
      }
      const cdn = cfg.urlStyle === 'fastly' ? 'https://fastly.jsdelivr.net/gh' : 'https://cdn.jsdelivr.net/gh';
      return remember(`${cdn}/${owner}/${repo}@${encodeURIComponent(branch)}/${repoPath}`);
    },
  );

  ipcMain.handle('shell:openExternal', (_e, url: string) => {
    if (/^https?:\/\//i.test(url)) return shell.openExternal(url);
  });
  ipcMain.handle('shell:openPath', (_e, p: string) => shell.openPath(p));
  ipcMain.handle('shell:showInFolder', (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle('prefs:get', () => loadPrefs());
  ipcMain.handle('prefs:set', (_e, prefs: Parameters<typeof savePrefs>[0]) => savePrefs(prefs));

  ipcMain.handle('clipboard:writeRich', (_e, html: string, text: string) => {
    clipboard.write({ html, text });
  });
  ipcMain.handle('clipboard:writeText', (_e, text: string) => {
    clipboard.writeText(text);
  });

  ipcMain.handle('watch:start', (_e, folder: string) => {
    stopWatch();
    try {
      watcher = fs.watch(folder, { recursive: true }, (_evt, file) => {
        const rel = file ? String(file) : null;
        if (watchDebounce) clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          getWin()?.webContents.send('fs:changed', { relPath: rel });
        }, 300);
      });
    } catch {
      // 递归监听失败时静默降级：用户仍可手动刷新
    }
  });

  ipcMain.handle('watch:stop', () => stopWatch());
}

function stopWatch(): void {
  if (watchDebounce) clearTimeout(watchDebounce);
  watchDebounce = null;
  if (watcher) {
    try {
      watcher.close();
    } catch {
      // ignore
    }
    watcher = null;
  }
}
