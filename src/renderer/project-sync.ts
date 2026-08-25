import type { Project, ProjectSyncConfig, SyncResult } from '../shared/types';

export type ProjectSyncState = 'idle' | 'syncing' | 'error';

interface SyncContext {
  folder: string;
  project: Project;
}

export interface ProjectSyncControllerDeps {
  getContext(): SyncContext | null;
  refreshProject(): Promise<void>;
  persist(): void;
  render(): void;
  toast(message: string): void;
  closeProjectMenu(): void;
}

export interface ProjectSyncController {
  getState(): ProjectSyncState;
  reset(): void;
  schedule(): void;
  run(options?: { quiet?: boolean }): Promise<SyncResult | null>;
  wire(): void;
}

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector(selector) as T;

function summary(result: SyncResult): string {
  const parts = [`上传 ${result.uploaded}`, `下载 ${result.downloaded}`];
  if (result.conflicts.length) parts.push(`冲突副本 ${result.conflicts.length}`);
  return parts.join(' · ');
}

export function createProjectSyncController(deps: ProjectSyncControllerDeps): ProjectSyncController {
  let state: ProjectSyncState = 'idle';
  let timer: number | undefined;

  const setState = (next: ProjectSyncState): void => {
    state = next;
    deps.render();
  };

  const run = async (options: { quiet?: boolean } = {}): Promise<SyncResult | null> => {
    const context = deps.getContext();
    if (!context?.project.sync || state === 'syncing') return null;
    setState('syncing');
    try {
      const result = await window.api.syncProject(context.folder, context.project.sync);
      context.project.sync.lastSyncAt = result.finishedAt;
      state = 'idle';
      deps.persist();
      await deps.refreshProject();
      deps.render();
      if (!options.quiet || result.conflicts.length) {
        deps.toast(result.conflicts.length ? `同步完成，已保留 ${result.conflicts.length} 个冲突副本` : `坚果云同步完成：${summary(result)}`);
      }
      return result;
    } catch (error) {
      setState('error');
      if (!options.quiet) deps.toast(`坚果云同步失败：${(error as Error).message}`);
      throw error;
    }
  };

  const schedule = (): void => {
    const context = deps.getContext();
    if (!context?.project.sync?.autoSync) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      timer = undefined;
      void run({ quiet: true }).catch(() => undefined);
    }, 1400);
  };

  const wire = (): void => {
    const mask = $('#sync-modal-mask');
    const resultEl = $('#sync-test-result');
    const showResult = (message: string, error = false): void => {
      resultEl.textContent = message;
      resultEl.classList.toggle('error', error);
      resultEl.hidden = false;
    };
    const closeModal = (): void => {
      mask.hidden = true;
    };
    const openModal = (): void => {
      const context = deps.getContext();
      if (!context) {
        deps.toast('请先打开一个项目');
        return;
      }
      const sync = context.project.sync;
      ($('#sync-username') as HTMLInputElement).value = sync?.username ?? '';
      const password = $('#sync-password') as HTMLInputElement;
      password.value = '';
      password.placeholder = sync ? '留空则沿用已保存的应用密码' : '坚果云第三方应用密码';
      ($('#sync-remote-path') as HTMLInputElement).value = sync?.remotePath ?? `/TypX/${context.project.name}`;
      ($('#sync-auto') as HTMLInputElement).checked = sync?.autoSync ?? true;
      $('#btn-sync-connect').textContent = sync ? '保存并同步' : '连接并同步';
      resultEl.hidden = true;
      deps.closeProjectMenu();
      mask.hidden = false;
    };

    $('#btn-sync-settings').addEventListener('click', openModal);
    $('#btn-sync-now').addEventListener('click', () => {
      deps.closeProjectMenu();
      void run().catch(() => undefined);
    });
    $('#btn-sync-open').addEventListener('click', () => {
      deps.closeProjectMenu();
      void window.api.openExternal('https://www.jianguoyun.com/d/home');
    });
    $('#btn-sync-disconnect').addEventListener('click', async () => {
      const context = deps.getContext();
      if (!context?.project.sync) return;
      if (!window.confirm(`断开「${context.project.name}」与坚果云的同步？云端和本地文件都不会被删除。`)) return;
      try {
        await window.api.disconnectNutstore(context.folder);
        delete context.project.sync;
        state = 'idle';
        deps.persist();
        deps.render();
        deps.closeProjectMenu();
        deps.toast('已断开坚果云同步');
      } catch (error) {
        deps.toast(`断开失败：${(error as Error).message}`);
      }
    });
    $('#btn-sync-help').addEventListener('click', () => {
      void window.api.openExternal('https://help.jianguoyun.com/?p=2064');
    });
    $('#btn-sync-cancel').addEventListener('click', closeModal);
    mask.addEventListener('click', (event) => {
      if (event.target === mask) closeModal();
    });
    $('#btn-sync-connect').addEventListener('click', async () => {
      const context = deps.getContext();
      if (!context) return;
      const username = ($('#sync-username') as HTMLInputElement).value.trim();
      const appPassword = ($('#sync-password') as HTMLInputElement).value.trim();
      const remotePath = ($('#sync-remote-path') as HTMLInputElement).value.trim();
      const autoSync = ($('#sync-auto') as HTMLInputElement).checked;
      if (!username || !remotePath || (!context.project.sync && !appPassword)) {
        showResult('请填写账号邮箱、应用密码和云端目录。', true);
        return;
      }
      const button = $('#btn-sync-connect') as HTMLButtonElement;
      button.disabled = true;
      button.textContent = '连接中…';
      setState('syncing');
      try {
        let result: SyncResult;
        if (context.project.sync && !appPassword) {
          if (username !== context.project.sync.username) throw new Error('修改账号时需要重新填写应用密码');
          const config: ProjectSyncConfig = { provider: 'nutstore', username, remotePath, autoSync };
          result = await window.api.syncProject(context.folder, config);
        } else {
          result = await window.api.connectNutstore({ projectPath: context.folder, username, appPassword, remotePath });
        }
        context.project.sync = { provider: 'nutstore', username, remotePath, autoSync, lastSyncAt: result.finishedAt };
        state = 'idle';
        deps.persist();
        await deps.refreshProject();
        deps.render();
        showResult(`连接成功：${summary(result)}`);
        deps.toast(result.conflicts.length ? `已连接，保留了 ${result.conflicts.length} 个冲突副本` : '坚果云已连接并完成同步');
        window.setTimeout(closeModal, 650);
      } catch (error) {
        setState('error');
        showResult((error as Error).message, true);
      } finally {
        button.disabled = false;
        button.textContent = context.project.sync ? '保存并同步' : '连接并同步';
      }
    });
  };

  return {
    getState: () => state,
    reset() {
      state = 'idle';
      if (timer) window.clearTimeout(timer);
      timer = undefined;
    },
    schedule,
    run,
    wire,
  };
}
