import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');

const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
await page.waitForTimeout(500);

const demoMarkdown = [
  '# 把复杂内容，整理成清晰表达',
  '',
  'TypX 让写作、排版与发布保持在同一个干净工作区。左边管理文章，中间专注 Markdown，右边随时确认最终效果。',
  '',
  '## 一套连贯的工作流',
  '',
  '- **写作**：Markdown 语法高亮与自动保存状态提醒',
  '- **排版**：主题实时预览，编辑与预览同步滚动',
  '- **发布**：公众号、知乎与 Markdown 从一个按钮选择',
  '',
  '公式同样可以稳定预览与复制：',
  '',
  '$$',
  'E = mc^2, \\qquad e^{i\\pi}+1=0',
  '$$',
  '',
  '> 工具应该让内容更清楚，而不是让操作本身成为负担。',
  '',
  '## 发布检查',
  '',
  '| 项目 | 状态 |',
  '| --- | --- |',
  '| 标题层级 | 已检查 |',
  '| 图片与公式 | 已检查 |',
  '| 目标平台 | 公众号 |',
].join('\n');

const projectPath = path.resolve('test-docs').replace(/\\/g, '/');
assert.equal(await page.evaluate((p) => window.__typx.openProject(p), projectPath), true);
await page.waitForTimeout(400);

const firstFile = page.locator('#file-tree .tree-file').first();
await firstFile.click();
await page.waitForTimeout(500);
assert.match(await page.locator('#status-path').innerText(), /test-docs/);
assert.equal(await page.locator('#preview').evaluate((frame) => frame.contentDocument?.querySelectorAll('h1').length), 1);

await page.evaluate((markdown) => window.__typx.setMarkdown(markdown), demoMarkdown);
await page.evaluate(() => window.__typx.setTheme('clean'));
await page.waitForTimeout(600);

await page.click('#btn-copy-menu');
assert.equal(await page.locator('#copy-menu').isVisible(), true);
assert.equal(await page.locator('#copy-menu button').count(), 4);
await page.screenshot({ path: path.resolve('docs/design/typx-ui-implemented-copy-menu.png') });
await page.locator('#preview-pane').screenshot({ path: path.resolve('docs/images/guide-copy-menu.png') });
await page.click('#btn-copy-menu');
assert.equal(await page.locator('#copy-menu').isVisible(), false);

await page.click('#btn-project');
assert.equal(await page.locator('#project-pop').isVisible(), true);
assert.equal(await page.locator('#btn-project-switch').isVisible(), true);
await page.screenshot({ path: path.resolve('docs/design/typx-ui-implemented-project-menu.png') });
await page.locator('#sidebar').screenshot({ path: path.resolve('docs/images/guide-project-menu.png') });
await page.click('#btn-sync-settings');
assert.equal(await page.locator('#sync-modal-mask').isVisible(), true);
await page.screenshot({ path: path.resolve('docs/design/typx-ui-implemented-sync-modal.png') });
await page.locator('#sync-modal-mask .sync-modal').screenshot({ path: path.resolve('docs/images/guide-nutstore-sync.png') });
await page.click('#btn-sync-cancel');

await page.click('#btn-settings');
assert.equal(await page.locator('#modal-mask').isVisible(), true);
await page.fill('#theme-name', '简约白 - 我的主题');
await page.fill('#footnote', '本文使用 TypX 排版');
await page.fill('#footer-input', '继续阅读：[TypX 使用教程](https://example.com/typx-guide)');
await page.locator('#modal-mask .modal').screenshot({ path: path.resolve('docs/images/guide-settings.png') });
await page.click('#btn-host');
assert.equal(await page.locator('#host-modal-mask').isVisible(), true);
await page.click('#host-prov [data-p="gitee"]');
await page.locator('#host-modal-mask .modal').screenshot({ path: path.resolve('docs/images/guide-image-host.png') });
await page.click('#btn-host-cancel');
await page.click('#btn-theme-cancel');

await page.click('#view-switch [data-view="edit"]');
assert.equal(await page.locator('#preview-pane').isVisible(), false);
await page.screenshot({ path: path.resolve('docs/images/guide-view-edit.png') });
await page.click('#view-switch [data-view="preview"]');
assert.equal(await page.locator('#editor-pane').isVisible(), false);
await page.screenshot({ path: path.resolve('docs/images/guide-view-preview.png') });
await page.click('#view-switch [data-view="split"]');
assert.equal(await page.locator('#editor-pane').isVisible(), true);
assert.equal(await page.locator('#preview-pane').isVisible(), true);

await firstFile.click({ button: 'right' });
assert.equal(await page.locator('#file-menu').isVisible(), true);
await page.screenshot({ path: path.resolve('docs/images/guide-file-menu.png') });
await page.locator('.document-bar').click();
assert.equal(await page.locator('#file-menu').isVisible(), false);
await page.screenshot({ path: path.resolve('docs/design/typx-ui-implemented.png') });
await page.screenshot({ path: path.resolve('docs/images/ui.png') });
assert.deepEqual(pageErrors, []);

console.log('PASS ui runtime');
console.log('PASS project/file/preview');
console.log('PASS project and publish menus');
console.log('PASS settings and sync modal');
console.log('PASS edit/split/preview modes');
console.log('SHOT 8 user-guide images');
console.log('SHOT docs/design/typx-ui-implemented.png');
console.log('SHOT docs/images/ui.png');
await browser.close();
