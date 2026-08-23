import { chromium } from 'playwright';
import * as fs from 'node:fs';
import * as path from 'node:path';

const OUT_DIR = 'D:/codex/TypX/assets/screenshots';
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
const page = await context.newPage();

await page.goto(`file://${OUT_DIR}/mock-ui.html`);
await sleep(2500); // 等待 CDN 资源和 KaTeX 渲染

async function screenshot(name) {
  const p = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: p, fullPage: false });
  console.log('saved', p);
}

// 1. 默认分屏界面（简约白）
await screenshot('01-split-clean');

// 2. 预览模式
await page.evaluate(() => window.setTypXView('preview'));
await sleep(600);
await screenshot('02-preview-clean');

// 3. 编辑模式
await page.evaluate(() => window.setTypXView('edit'));
await sleep(600);
await screenshot('03-edit-clean');

// 4-9. 不同主题
await page.evaluate(() => window.setTypXView('split'));
const themes = [
  ['orange', '04-theme-orange'],
  ['teal', '05-theme-teal'],
  ['purple', '06-theme-purple'],
  ['geek', '07-theme-geek'],
  ['ink', '08-theme-ink'],
  ['inkpaper', '09-theme-inkpaper'],
];
for (const [id, name] of themes) {
  await page.evaluate((themeId) => window.setTypXTheme(themeId), id);
  await sleep(800);
  await screenshot(name);
}

// 10. 自定义样式弹窗
await page.evaluate(() => window.setTypXTheme('clean'));
await page.evaluate(() => window.showModal('modal-mask'));
await sleep(500);
await screenshot('10-modal-custom-style');
await page.evaluate(() => window.hideModal('modal-mask'));

// 11. 图床设置弹窗
await page.evaluate(() => window.showModal('host-modal-mask'));
await sleep(500);
await screenshot('11-modal-image-host');
await page.evaluate(() => window.hideModal('host-modal-mask'));

// 12. 项目切换面板
await page.evaluate(() => {
  const pop = document.getElementById('project-pop');
  pop.hidden = false;
  pop.style.display = 'flex';
});
await sleep(300);
await screenshot('12-project-switcher');

await browser.close();
console.log('all screenshots done');
