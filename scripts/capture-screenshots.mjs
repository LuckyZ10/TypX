import { _electron } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_DIR = 'D:/codex/TypX/assets/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const electronApp = await _electron.launch({
  args: ['.', '--disable-gpu'],
  cwd: 'D:/codex/TypX',
  env: { ...process.env, NODE_ENV: 'development' },
});

const window = await electronApp.firstWindow();
await window.waitForLoadState('domcontentloaded');
await sleep(1500); // 等待初始化和文件加载

async function screenshot(name) {
  const p = path.join(OUT_DIR, `${name}.png`);
  await window.screenshot({ path: p, fullPage: false });
  console.log('saved', p);
}

async function setTheme(themeId) {
  await window.evaluate((id) => {
    const sel = document.querySelector('#sel-theme');
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, themeId);
  await sleep(600);
}

async function setViewMode(mode) {
  await window.evaluate((m) => {
    const app = document.querySelector('#app');
    if (app) app.dataset.view = m;
    document.querySelectorAll('#view-switch button').forEach((b) => {
      b.classList.toggle('active', b.dataset.view === m);
    });
    if (window.__typx && window.__typx.editor) {
      // 重新测量编辑器
      const ed = document.querySelector('#editor .cm-editor');
      if (ed && ed.cmView && ed.cmView.view) ed.cmView.view.requestMeasure();
    }
  }, mode);
  await sleep(600);
}

async function openModal(btnId) {
  await window.evaluate((id) => document.querySelector(id)?.click(), btnId);
  await sleep(400);
}

async function closeModal(maskId) {
  await window.evaluate((id) => {
    const m = document.querySelector(id);
    if (m) m.hidden = true;
  }, maskId);
  await sleep(300);
}

// 1. 默认分屏界面（简约白）
await screenshot('01-split-clean');

// 2. 预览模式
await setViewMode('preview');
await screenshot('02-preview-clean');

// 3. 编辑模式
await setViewMode('edit');
await screenshot('03-edit-clean');

// 4. 切回分屏，换主题
await setViewMode('split');

await setTheme('orange');
await screenshot('04-theme-orange');

await setTheme('teal');
await screenshot('05-theme-teal');

await setTheme('purple');
await screenshot('06-theme-purple');

await setTheme('geek');
await screenshot('07-theme-geek');

await setTheme('ink');
await screenshot('08-theme-ink');

await setTheme('inkpaper');
await screenshot('09-theme-inkpaper');

// 10. 自定义样式弹窗
await setTheme('clean');
await openModal('#btn-css');
await screenshot('10-modal-custom-style');
await closeModal('#modal-mask');

// 11. 图床设置弹窗
await openModal('#btn-host');
await screenshot('11-modal-image-host');
await closeModal('#host-modal-mask');

// 12. 项目切换面板
await window.evaluate(() => document.querySelector('#btn-project')?.click());
await sleep(400);
await screenshot('12-project-switcher');
await window.evaluate(() => document.querySelector('#btn-project')?.click());
await sleep(300);

await electronApp.close();
console.log('all screenshots done');
