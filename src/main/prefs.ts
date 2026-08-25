import { app } from 'electron';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { Prefs } from '../shared/types';

const DEFAULTS: Prefs = {
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
  copyTarget: 'wechat',
};

function prefsPath(): string {
  return path.join(app.getPath('userData'), 'preferences.json');
}

export function loadPrefs(): Prefs {
  try {
    const raw = fs.readFileSync(prefsPath(), 'utf-8');
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Prefs>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs: Prefs): void {
  const file = prefsPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(prefs, null, 2), 'utf-8');
}
