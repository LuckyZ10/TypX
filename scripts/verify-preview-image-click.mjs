import assert from 'node:assert/strict';
import path from 'node:path';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');
page.setDefaultTimeout(8_000);

const projectPath = path.resolve('test-docs').replace(/\\/g, '/');
const projectDir = projectPath.replace(/\//g, '\\'); // reveal 路径统一为 Windows 反斜杠
assert.equal(await page.evaluate((p) => window.__typx.openProject(p), projectPath), true);
await page.waitForTimeout(400);

// 本地相对路径图（含中文与空格文件名）+ 外链图
const markdown = [
  '# image click',
  '',
  '![local](img/pic.png)',
  '',
  '![chinese](<img/图片 示例.png>)',
  '',
  '![web](https://example.com/a.png)',
].join('\n');
await page.evaluate((value) => window.__typx.setMarkdown(value), markdown);
await page.waitForTimeout(600);

// 替换默认动作，避免自动化真的拉起资源管理器/浏览器
await page.evaluate(() => {
  window.__previewImgCalls = [];
  window.__typx.hookPreviewImage((kind, target) => window.__previewImgCalls.push([kind, target]));
});

const clickImg = (alt) => page.locator('#preview').evaluate((frame, a) => {
  const img = Array.from(frame.contentDocument.querySelectorAll('img')).find((el) => el.getAttribute('alt') === a);
  if (!img) throw new Error(`image ${a} was not rendered`);
  img.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
}, alt);

// 1. 本地图片：reveal 到绝对路径（中文与空格正确解码）
await clickImg('local');
await page.waitForTimeout(200);
assert.deepEqual(await page.evaluate(() => window.__previewImgCalls), [
  ['reveal', `${projectDir}\\img\\pic.png`],
]);

await clickImg('chinese');
await page.waitForTimeout(200);
assert.deepEqual(await page.evaluate(() => window.__previewImgCalls.slice(-1)), [
  ['reveal', `${projectDir}\\img\\图片 示例.png`],
]);

// 2. 外链图片：走浏览器打开分支
await clickImg('web');
await page.waitForTimeout(200);
assert.deepEqual(await page.evaluate(() => window.__previewImgCalls.slice(-1)), [
  ['external', 'https://example.com/a.png'],
]);

// 3. 点击图片不触发「跳转 Markdown 源码」：编辑器选区保持不变
const before = await page.evaluate(() => window.__typx.editorState());
await clickImg('local');
await page.waitForTimeout(200);
const after = await page.evaluate(() => window.__typx.editorState());
assert.equal(after.from, before.from);
assert.equal(after.to, before.to);
assert.equal(after.viewMode, 'split');

// 4. 点击普通文字仍按原逻辑跳转源码
await page.locator('#preview').evaluate((frame) => {
  const h1 = frame.contentDocument.querySelector('h1');
  h1.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
});
await page.waitForTimeout(250);
const jumped = await page.evaluate(() => window.__typx.editorState());
assert.equal(jumped.viewMode, 'split');
assert.equal(jumped.selectedText, '# image click');

// 5. 恢复默认动作后钩子不再拦截
await page.evaluate(() => window.__typx.hookPreviewImage(null));
await page.evaluate(() => { window.__previewImgCalls = null; });
assert.equal(await page.evaluate(() => window.__previewImgCalls), null);

console.log('PASS preview image click reveals local file / opens external url');
console.log('PASS image click no longer jumps to markdown source; text clicks still do');
console.log('PASS chinese+space filenames decode correctly');
await browser.close();
