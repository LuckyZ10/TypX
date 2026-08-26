import { app, ipcMain, net, type BrowserWindow } from 'electron';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { autoUpdater, type UpdateInfo } from 'electron-updater';
import type { ProgressInfo } from 'builder-util-runtime';
import type { UpdateState } from '../shared/types';

type GetWindow = () => BrowserWindow | null;

const isUpdateTest = process.argv.includes('--update-test');
const isUpdateFallbackTest = process.argv.includes('--update-fallback-test');
let getWindow: GetWindow = () => null;
let ready = false;
let checking = false;
let startupTimer: NodeJS.Timeout | undefined;
let errorRecovery: Promise<UpdateState> | null = null;
let state: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion(),
  message: '启动后会自动检查更新',
};

function hasPackagedUpdateConfig(): boolean {
  return app.isPackaged && existsSync(path.join(process.resourcesPath, 'app-update.yml'));
}

function isSupported(): boolean {
  return isUpdateTest || isUpdateFallbackTest || hasPackagedUpdateConfig();
}

function unsupportedState(): UpdateState {
  return {
    status: 'unsupported',
    currentVersion: app.getVersion(),
    message: app.isPackaged
      ? '当前是便携版，自动更新仅支持 TypX 安装版'
      : '开发模式不会连接正式更新服务',
  };
}

function publish(next: UpdateState): UpdateState {
  state = { ...next, currentVersion: app.getVersion() };
  const target = getWindow();
  if (target && !target.isDestroyed()) target.webContents.send('update:state', state);
  return state;
}

function cleanError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/latest\.yml/i.test(raw) && /(404|cannot find)/i.test(raw)) return '更新文件尚未准备完整，请稍后再试';
  return raw.replace(/https?:\/\/\S+/gi, '更新服务器').replace(/\s+/g, ' ').trim().slice(0, 180) || '未知错误';
}

function parseVersion(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/i);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

function compareVersions(left: string, right: string): number | null {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return null;
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

async function latestGithubReleaseVersion(): Promise<string | null> {
  try {
    const response = await net.fetch('https://api.github.com/repos/LuckyZ10/TypX/releases/latest', {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `TypX/${app.getVersion()}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { tag_name?: unknown };
    return typeof data.tag_name === 'string' ? data.tag_name.replace(/^v/i, '') : null;
  } catch {
    return null;
  }
}

function recoverUpdateError(error: unknown): Promise<UpdateState> {
  if (errorRecovery) return errorRecovery;
  errorRecovery = (async () => {
    checking = false;
    const latestVersion = await latestGithubReleaseVersion();
    const comparison = latestVersion ? compareVersions(app.getVersion(), latestVersion) : null;
    if (comparison !== null && comparison >= 0) {
      return publish({ status: 'up-to-date', currentVersion: app.getVersion(), message: '当前已是最新版本' });
    }
    if (latestVersion && comparison === -1) {
      return publish({
        status: 'error',
        currentVersion: app.getVersion(),
        version: latestVersion,
        message: `发现 TypX ${latestVersion}，但更新文件尚未准备完整，请稍后再试`,
      });
    }
    return publish({ status: 'error', currentVersion: app.getVersion(), message: `检查更新失败：${cleanError(error)}` });
  })().finally(() => {
    errorRecovery = null;
  });
  return errorRecovery;
}

function versionState(status: UpdateState['status'], info: UpdateInfo, message: string): UpdateState {
  return publish({ status, currentVersion: app.getVersion(), version: info.version, message });
}

function wireUpdaterEvents(): void {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.autoRunAppAfterInstall = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    checking = true;
    publish({ status: 'checking', currentVersion: app.getVersion(), message: '正在检查更新…' });
  });
  autoUpdater.on('update-available', (info) => {
    checking = false;
    versionState('available', info, `发现 TypX ${info.version}，准备下载…`);
  });
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    publish({
      status: 'downloading',
      currentVersion: app.getVersion(),
      version: state.version,
      percent: Math.max(0, Math.min(100, progress.percent)),
      transferred: progress.transferred,
      total: progress.total,
      message: `正在下载 TypX ${state.version ?? ''}`.trim(),
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    checking = false;
    versionState('downloaded', info, `TypX ${info.version} 已下载，重启后即可完成更新`);
  });
  autoUpdater.on('update-not-available', () => {
    checking = false;
    publish({ status: 'up-to-date', currentVersion: app.getVersion(), message: '当前已是最新版本' });
  });
  autoUpdater.on('error', (error) => {
    void recoverUpdateError(error);
  });
}

async function runMockCheck(): Promise<UpdateState> {
  if (checking || state.status === 'downloading') return state;
  checking = true;
  publish({ status: 'checking', currentVersion: app.getVersion(), message: '正在检查更新…' });
  await new Promise((resolve) => setTimeout(resolve, 180));
  publish({ status: 'available', currentVersion: app.getVersion(), version: '0.6.3', message: '发现 TypX 0.6.3，准备下载…' });
  for (const percent of [18, 52, 86, 100]) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    publish({
      status: 'downloading',
      currentVersion: app.getVersion(),
      version: '0.6.3',
      percent,
      transferred: percent,
      total: 100,
      message: '正在下载 TypX 0.6.3',
    });
  }
  checking = false;
  return publish({
    status: 'downloaded',
    currentVersion: app.getVersion(),
    version: '0.6.3',
    message: 'TypX 0.6.3 已下载，重启后即可完成更新',
  });
}

async function checkForUpdates(): Promise<UpdateState> {
  if (!isSupported()) return publish(unsupportedState());
  if (isUpdateTest) return runMockCheck();
  if (isUpdateFallbackTest) return recoverUpdateError(new Error('Cannot find latest.yml in the latest release artifacts (HttpError: 404)'));
  if (checking || state.status === 'downloading' || state.status === 'downloaded') return state;

  try {
    checking = true;
    await autoUpdater.checkForUpdates();
  } catch (error) {
    return recoverUpdateError(error);
  }
  return state;
}

export function setupUpdater(getMainWindow: GetWindow): void {
  if (ready) return;
  ready = true;
  getWindow = getMainWindow;
  state = isSupported() ? state : unsupportedState();
  if (!isUpdateTest && !isUpdateFallbackTest && isSupported()) wireUpdaterEvents();

  ipcMain.handle('update:get-state', () => state);
  ipcMain.handle('update:check', () => checkForUpdates());
  ipcMain.handle('update:install', () => {
    if (state.status !== 'downloaded') throw new Error('更新尚未下载完成');
    if (isUpdateTest) return;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
  });
}

export function scheduleStartupUpdateCheck(): void {
  if (!isSupported() || isUpdateTest || isUpdateFallbackTest || startupTimer) return;
  startupTimer = setTimeout(() => {
    startupTimer = undefined;
    void checkForUpdates();
  }, 8_000);
}
