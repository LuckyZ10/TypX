import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');
page.setDefaultTimeout(8_000);

const projectPath = path.resolve('test-docs').replace(/\\/g, '/');
assert.equal(await page.evaluate((p) => window.__typx.openProject(p), projectPath), true);
await page.waitForTimeout(400);

const markdown = '# ctx menu\n\nhello TypX world TypX end.\n';
await page.evaluate((value) => window.__typx.setMarkdown(value), markdown);
await page.waitForTimeout(300);

// 双击选中第 3 行的第一个 TypX，并记下坐标供右键复用
const wordRect = await page.evaluate(() => {
  const line = document.querySelectorAll('.cm-content .cm-line')[2];
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  const range = document.createRange();
  const start = node.textContent.indexOf('TypX');
  range.setStart(node, start);
  range.setEnd(node, start + 4);
  return range.getBoundingClientRect().toJSON();
});
await page.mouse.dblclick(wordRect.x + 8, wordRect.y + wordRect.height / 2);
await page.waitForTimeout(300);
assert.equal((await page.evaluate(() => window.__typx.editorState())).selectedText, 'TypX');

// 1. 选中文本后右键：菜单出现，剪切/复制可用，粘贴/全选始终可用
await page.mouse.click(wordRect.x + 8, wordRect.y + wordRect.height / 2, { button: 'right' });
await page.waitForTimeout(200);
assert.equal(await page.locator('#edit-menu').isVisible(), true);
assert.equal(await page.locator('#em-cut').isDisabled(), false);
assert.equal(await page.locator('#em-copy').isDisabled(), false);
assert.equal(await page.locator('#em-paste').isDisabled(), false);
assert.equal(await page.locator('#em-select-all').isDisabled(), false);
await page.screenshot({ path: path.resolve('docs/design/typx-ui-edit-context-menu.png') });

// 2. 复制：剪贴板内容等于选中词
await page.locator('#em-copy').click();
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => window.api.readText()), 'TypX');
assert.equal(await page.locator('#edit-menu').isVisible(), false, 'menu should close after action');

// 3. 粘贴：替换当前选中的 TypX 为剪贴板内容
await page.evaluate(() => window.api.copyText('PASTED'));
await page.mouse.dblclick(wordRect.x + 8, wordRect.y + wordRect.height / 2);
await page.waitForTimeout(300);
await page.mouse.click(wordRect.x + 8, wordRect.y + wordRect.height / 2, { button: 'right' });
await page.waitForTimeout(200);
await page.locator('#em-paste').click();
await page.waitForTimeout(300);
const content = await page.evaluate(() => document.querySelector('.cm-content').textContent);
assert.ok(content.includes('PASTED'), 'pasted text should be in the document');
assert.equal(content.split('TypX').length - 1, 1, 'the selected occurrence should be replaced');

// 4. 剪切：删除选中文本并写入剪贴板
const lastRect = await page.evaluate(() => {
  const line = document.querySelectorAll('.cm-content .cm-line')[2];
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  const range = document.createRange();
  const start = node.textContent.lastIndexOf('TypX');
  range.setStart(node, start);
  range.setEnd(node, start + 4);
  return range.getBoundingClientRect().toJSON();
});
await page.mouse.dblclick(lastRect.x + 8, lastRect.y + lastRect.height / 2);
await page.waitForTimeout(300);
await page.mouse.click(lastRect.x + 8, lastRect.y + lastRect.height / 2, { button: 'right' });
await page.waitForTimeout(200);
await page.locator('#em-cut').click();
await page.waitForTimeout(300);
assert.equal(await page.evaluate(() => window.api.readText()), 'TypX');
assert.equal((await page.evaluate(() => document.querySelector('.cm-content').textContent)).includes('TypX'), false, 'cut text should be removed');

// 5. 无选区右键：剪切/复制禁用；右键在选区外会收起选区（原生行为）
await page.locator('.cm-content').click();
await page.waitForTimeout(200);
const line1 = await page.evaluate(() => document.querySelectorAll('.cm-content .cm-line')[0].getBoundingClientRect().toJSON());
await page.mouse.click(line1.x + 60, line1.y + line1.height / 2, { button: 'right' });
await page.waitForTimeout(200);
assert.equal(await page.locator('#edit-menu').isVisible(), true);
assert.equal(await page.locator('#em-cut').isDisabled(), true);
assert.equal(await page.locator('#em-copy').isDisabled(), true);

// 6. 全选：选中范围从 0 开始，覆盖粘贴/剪切后的完整文档
await page.locator('#em-select-all').click();
await page.waitForTimeout(300);
const state = await page.evaluate(() => window.__typx.editorState());
assert.equal(state.from, 0);
assert.equal(state.selectedText, '# ctx menu\n\nhello PASTED world  end.\n');

console.log('PASS editor context menu shows cut/copy/paste/select-all');
console.log('PASS copy/cut write clipboard, paste replaces selection');
console.log('PASS menu disables cut/copy without selection; select-all works');
console.log('PASS right-click outside selection collapses it (native behavior)');
console.log('SHOT docs/design/typx-ui-edit-context-menu.png');
await browser.close();
