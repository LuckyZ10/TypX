import { contextBridge, ipcRenderer } from 'electron';
import type { TypXApi } from '../shared/types';

const api: TypXApi = {
  selectFolder: () => ipcRenderer.invoke('folder:select'),
  listFiles: (folder) => ipcRenderer.invoke('folder:list', folder),
  readFile: (absPath) => ipcRenderer.invoke('file:read', absPath),
  readFileBase64: (absPath) => ipcRenderer.invoke('file:readBase64', absPath),
  captureRect: (rect) => ipcRenderer.invoke('app:captureRect', rect),
  uploadImage: (cfg, fileName, base64) => ipcRenderer.invoke('imagehost:upload', cfg, fileName, base64),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  showInFolder: (p) => ipcRenderer.invoke('shell:showInFolder', p),
  writeFile: (absPath, content) => ipcRenderer.invoke('file:save', absPath, content),
  getPrefs: () => ipcRenderer.invoke('prefs:get'),
  setPrefs: (prefs) => ipcRenderer.invoke('prefs:set', prefs),
  copyRich: (html, text) => ipcRenderer.invoke('clipboard:writeRich', html, text),
  copyText: (text) => ipcRenderer.invoke('clipboard:writeText', text),
  readText: () => ipcRenderer.invoke('clipboard:readText'),
  watchFolder: (folder) => ipcRenderer.invoke('watch:start', folder),
  unwatch: () => ipcRenderer.invoke('watch:stop'),
  onFsChanged: (cb) => {
    ipcRenderer.on('fs:changed', (_e, info) => cb(info));
  },
  connectNutstore: (input) => ipcRenderer.invoke('sync:nutstore-connect', input),
  syncProject: (projectPath, config) => ipcRenderer.invoke('sync:project', projectPath, config),
  disconnectNutstore: (projectPath) => ipcRenderer.invoke('sync:nutstore-disconnect', projectPath),
  getUpdateState: () => ipcRenderer.invoke('update:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  onUpdateState: (cb) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof cb>[0]): void => cb(state);
    ipcRenderer.on('update:state', listener);
    return () => ipcRenderer.removeListener('update:state', listener);
  },
};

contextBridge.exposeInMainWorld('api', api);
