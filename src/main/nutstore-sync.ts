import { app, safeStorage } from 'electron';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type { ProjectSyncConfig, SyncConnectInput, SyncResult } from '../shared/types';

const DAV_ORIGIN = 'https://dav.jianguoyun.com';
const DAV_ROOT = '/dav';
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'release', '.git', '.vscode', '.idea']);
const MAX_FILE_BYTES = 100 * 1024 * 1024;

interface CredentialRecord {
  username: string;
  password: string;
}

interface CredentialFile {
  version: 1;
  projects: Record<string, CredentialRecord>;
}

interface SyncStateEntry {
  localHash: string;
  remoteEtag: string;
}

interface SyncState {
  version: 1;
  entries: Record<string, SyncStateEntry>;
}

interface LocalEntry {
  relPath: string;
  absPath: string;
  hash: string;
  bytes: Uint8Array;
}

interface RemoteEntry {
  relPath: string;
  etag: string;
  isDirectory: boolean;
}

function projectKey(projectPath: string): string {
  return createHash('sha256').update(path.resolve(projectPath).toLowerCase()).digest('hex').slice(0, 24);
}

function credentialPath(): string {
  return path.join(app.getPath('userData'), 'sync-credentials.json');
}

function statePath(projectPath: string): string {
  return path.join(app.getPath('userData'), 'sync-state', `${projectKey(projectPath)}.json`);
}

async function readCredentialFile(): Promise<CredentialFile> {
  try {
    return JSON.parse(await fs.readFile(credentialPath(), 'utf-8')) as CredentialFile;
  } catch {
    return { version: 1, projects: {} };
  }
}

async function saveCredential(projectPath: string, username: string, password: string): Promise<void> {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储暂不可用，无法安全保存坚果云应用密码');
  const file = await readCredentialFile();
  file.projects[projectKey(projectPath)] = {
    username,
    password: safeStorage.encryptString(password).toString('base64'),
  };
  await fs.mkdir(path.dirname(credentialPath()), { recursive: true });
  await fs.writeFile(credentialPath(), JSON.stringify(file, null, 2), 'utf-8');
}

async function readCredential(projectPath: string): Promise<{ username: string; password: string }> {
  const file = await readCredentialFile();
  const record = file.projects[projectKey(projectPath)];
  if (!record) throw new Error('未找到坚果云凭据，请重新连接');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储暂不可用，无法读取坚果云应用密码');
  try {
    return { username: record.username, password: safeStorage.decryptString(Buffer.from(record.password, 'base64')) };
  } catch {
    throw new Error('坚果云凭据无法解密，请重新连接');
  }
}

async function deleteCredential(projectPath: string): Promise<void> {
  const file = await readCredentialFile();
  delete file.projects[projectKey(projectPath)];
  await fs.mkdir(path.dirname(credentialPath()), { recursive: true });
  await fs.writeFile(credentialPath(), JSON.stringify(file, null, 2), 'utf-8');
  await fs.rm(statePath(projectPath), { force: true });
}

async function readSyncState(projectPath: string): Promise<SyncState> {
  try {
    return JSON.parse(await fs.readFile(statePath(projectPath), 'utf-8')) as SyncState;
  } catch {
    return { version: 1, entries: {} };
  }
}

async function saveSyncState(projectPath: string, state: SyncState): Promise<void> {
  const file = statePath(projectPath);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(state, null, 2), 'utf-8');
}

function normalizeRemotePath(remotePath: string): string {
  const clean = remotePath.trim().replace(/\\/g, '/').replace(/\/{2,}/g, '/').replace(/^\/+|\/+$/g, '');
  if (!clean) throw new Error('云端目录不能为空');
  if (clean.split('/').some((part) => part === '.' || part === '..')) throw new Error('云端目录不能包含 . 或 ..');
  return '/' + clean;
}

function encodeRemotePath(remotePath: string): string {
  return normalizeRemotePath(remotePath).split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function remoteUrl(remotePath: string, relPath = ''): string {
  const root = encodeRemotePath(remotePath);
  const rel = relPath.split('/').filter(Boolean).map(encodeURIComponent).join('/');
  return `${DAV_ORIGIN}${DAV_ROOT}/${root}${rel ? `/${rel}` : ''}`;
}

function authHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`, 'utf-8').toString('base64')}`;
}

async function davFetch(url: string, username: string, password: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Authorization', authHeader(username, password));
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    if (response.status === 401 || response.status === 403) throw new Error('坚果云账号或应用密码不正确');
    return response;
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw new Error('连接坚果云超时');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureRemoteDirectory(remotePath: string, username: string, password: string, relDir = ''): Promise<void> {
  const rootParts = normalizeRemotePath(remotePath).split('/').filter(Boolean);
  const relParts = relDir.split('/').filter(Boolean);
  const parts = [...rootParts, ...relParts];
  for (let i = 1; i <= parts.length; i++) {
    const url = `${DAV_ORIGIN}${DAV_ROOT}/${parts.slice(0, i).map(encodeURIComponent).join('/')}`;
    const response = await davFetch(url, username, password, { method: 'MKCOL' });
    if (![201, 405].includes(response.status) && !response.ok) {
      throw new Error(`创建坚果云目录失败（${response.status}）`);
    }
  }
}

function xmlDecode(value: string): string {
  return value.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function tagValue(xml: string, tag: string): string {
  const match = xml.match(new RegExp(`<(?:[a-zA-Z][\\w.-]*:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[a-zA-Z][\\w.-]*:)?${tag}>`, 'i'));
  return match ? xmlDecode(match[1].trim()) : '';
}

async function listRemoteDirectory(
  remotePath: string,
  username: string,
  password: string,
  relDir = '',
  out = new Map<string, RemoteEntry>(),
): Promise<Map<string, RemoteEntry>> {
  const url = remoteUrl(remotePath, relDir);
  const response = await davFetch(url, username, password, {
    method: 'PROPFIND',
    headers: { Depth: '1', 'Content-Type': 'application/xml; charset=utf-8' },
    body: '<?xml version="1.0"?><d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getetag/></d:prop></d:propfind>',
  });
  if (response.status === 404) return out;
  if (response.status !== 207 && !response.ok) throw new Error(`读取坚果云目录失败（${response.status}）`);
  const xml = await response.text();
  const blocks = xml.match(/<(?:[a-zA-Z][\w.-]*:)?response\b[\s\S]*?<\/(?:[a-zA-Z][\w.-]*:)?response>/gi) ?? [];
  const basePath = new URL(url).pathname.replace(/\/+$/, '');
  for (const block of blocks) {
    const hrefRaw = tagValue(block, 'href');
    if (!hrefRaw) continue;
    const hrefPath = new URL(hrefRaw, DAV_ORIGIN).pathname.replace(/\/+$/, '');
    if (hrefPath === basePath) continue;
    let decoded: string;
    try {
      decoded = decodeURIComponent(hrefPath);
    } catch {
      decoded = hrefPath;
    }
    const baseDecoded = decodeURIComponent(basePath);
    if (!decoded.startsWith(baseDecoded + '/')) continue;
    const childName = decoded.slice(baseDecoded.length + 1).split('/')[0];
    if (!childName) continue;
    const relPath = relDir ? `${relDir}/${childName}` : childName;
    const isDirectory = /<(?:[a-zA-Z][\w.-]*:)?collection\b/i.test(block);
    const entry: RemoteEntry = { relPath, etag: tagValue(block, 'getetag'), isDirectory };
    out.set(relPath, entry);
    if (isDirectory) await listRemoteDirectory(remotePath, username, password, relPath, out);
  }
  return out;
}

async function scanLocalProject(projectPath: string): Promise<Map<string, LocalEntry>> {
  const root = path.resolve(projectPath);
  const result = new Map<string, LocalEntry>();
  const visit = async (dir: string, relDir: string): Promise<void> => {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = (relDir ? `${relDir}/${entry.name}` : entry.name).replace(/\\/g, '/');
      if (entry.isDirectory()) {
        await visit(absPath, relPath);
      } else if (entry.isFile()) {
        const stat = await fs.stat(absPath);
        if (stat.size > MAX_FILE_BYTES) continue;
        const bytes = await fs.readFile(absPath);
        result.set(relPath, {
          relPath,
          absPath,
          bytes,
          hash: createHash('sha256').update(bytes).digest('hex'),
        });
      }
    }
  };
  await visit(root, '');
  return result;
}

async function downloadRemote(remotePath: string, relPath: string, username: string, password: string): Promise<Uint8Array> {
  const response = await davFetch(remoteUrl(remotePath, relPath), username, password, { method: 'GET' });
  if (!response.ok) throw new Error(`下载 ${relPath} 失败（${response.status}）`);
  return new Uint8Array(await response.arrayBuffer());
}

async function uploadRemote(remotePath: string, relPath: string, bytes: Uint8Array, username: string, password: string): Promise<void> {
  const parent = relPath.includes('/') ? relPath.slice(0, relPath.lastIndexOf('/')) : '';
  if (parent) await ensureRemoteDirectory(remotePath, username, password, parent);
  const response = await davFetch(remoteUrl(remotePath, relPath), username, password, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: Buffer.from(bytes),
  });
  if (!response.ok) throw new Error(`上传 ${relPath} 失败（${response.status}）`);
}

function conflictPath(absPath: string): string {
  const ext = path.extname(absPath);
  const stem = path.basename(absPath, ext);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return path.join(path.dirname(absPath), `${stem}.坚果云冲突-${stamp}${ext}`);
}

async function writeLocal(projectPath: string, relPath: string, bytes: Uint8Array): Promise<void> {
  const target = path.resolve(projectPath, ...relPath.split('/'));
  const root = path.resolve(projectPath) + path.sep;
  if (!target.startsWith(root)) throw new Error(`非法同步路径：${relPath}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, bytes);
}

async function performSync(
  projectPath: string,
  config: ProjectSyncConfig,
  username: string,
  password: string,
): Promise<SyncResult> {
  const stat = await fs.stat(projectPath).catch(() => null);
  if (!stat?.isDirectory()) throw new Error('本地项目目录不存在');
  const remotePath = normalizeRemotePath(config.remotePath);
  await ensureRemoteDirectory(remotePath, username, password);

  const previous = await readSyncState(projectPath);
  const local = await scanLocalProject(projectPath);
  const remoteAll = await listRemoteDirectory(remotePath, username, password);
  const remote = new Map([...remoteAll].filter(([, entry]) => !entry.isDirectory));
  let uploaded = 0;
  let downloaded = 0;
  const conflicts: string[] = [];
  const paths = new Set([...local.keys(), ...remote.keys()]);

  for (const relPath of [...paths].sort((a, b) => a.localeCompare(b, 'zh'))) {
    const localEntry = local.get(relPath);
    const remoteEntry = remote.get(relPath);
    const old = previous.entries[relPath];

    if (localEntry && !remoteEntry) {
      await uploadRemote(remotePath, relPath, localEntry.bytes, username, password);
      uploaded++;
      continue;
    }
    if (!localEntry && remoteEntry) {
      const bytes = await downloadRemote(remotePath, relPath, username, password);
      await writeLocal(projectPath, relPath, bytes);
      downloaded++;
      continue;
    }
    if (!localEntry || !remoteEntry) continue;

    let localChanged = old ? localEntry.hash !== old.localHash : false;
    let remoteChanged = old ? remoteEntry.etag !== old.remoteEtag : false;
    if (!old) {
      const remoteBytes = await downloadRemote(remotePath, relPath, username, password);
      const remoteHash = createHash('sha256').update(remoteBytes).digest('hex');
      if (remoteHash === localEntry.hash) continue;
      localChanged = true;
      remoteChanged = true;
    }

    if (localChanged && remoteChanged) {
      const remoteBytes = await downloadRemote(remotePath, relPath, username, password);
      const conflict = conflictPath(localEntry.absPath);
      await fs.writeFile(conflict, remoteBytes);
      await uploadRemote(remotePath, relPath, localEntry.bytes, username, password);
      conflicts.push(path.relative(projectPath, conflict).replace(/\\/g, '/'));
      uploaded++;
    } else if (localChanged) {
      await uploadRemote(remotePath, relPath, localEntry.bytes, username, password);
      uploaded++;
    } else if (remoteChanged) {
      const bytes = await downloadRemote(remotePath, relPath, username, password);
      await writeLocal(projectPath, relPath, bytes);
      downloaded++;
    }
  }

  const finalLocal = await scanLocalProject(projectPath);
  const finalRemote = await listRemoteDirectory(remotePath, username, password);
  const entries: Record<string, SyncStateEntry> = {};
  for (const [relPath, localEntry] of finalLocal) {
    const remoteEntry = finalRemote.get(relPath);
    if (remoteEntry && !remoteEntry.isDirectory) entries[relPath] = { localHash: localEntry.hash, remoteEtag: remoteEntry.etag };
  }
  await saveSyncState(projectPath, { version: 1, entries });
  return { uploaded, downloaded, conflicts, finishedAt: Date.now() };
}

export async function connectNutstore(input: SyncConnectInput): Promise<SyncResult> {
  const username = input.username.trim();
  const password = input.appPassword.trim();
  if (!username || !password) throw new Error('请填写坚果云账号邮箱和应用密码');
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密存储暂不可用，无法安全保存坚果云应用密码');
  const config: ProjectSyncConfig = {
    provider: 'nutstore',
    username,
    remotePath: normalizeRemotePath(input.remotePath),
    autoSync: true,
  };
  const result = await performSync(input.projectPath, config, username, password);
  await saveCredential(input.projectPath, username, password);
  return result;
}

export async function syncNutstoreProject(projectPath: string, config: ProjectSyncConfig): Promise<SyncResult> {
  const credential = await readCredential(projectPath);
  if (credential.username !== config.username) throw new Error('坚果云账号已变化，请重新连接');
  return performSync(projectPath, config, credential.username, credential.password);
}

export async function disconnectNutstore(projectPath: string): Promise<void> {
  await deleteCredential(projectPath);
}
