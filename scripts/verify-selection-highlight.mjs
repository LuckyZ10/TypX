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

const markdown = [
  '# match test',
  '',
  'TypX is great and TypX is fast because TypX is local.',
  '',
  'select TypX here TypX there.',
].join('\n');
await page.evaluate((value) => window.__typx.setMarkdown(value), markdown);
await page.waitForTimeout(300);
await page.locator('.cm-content').click();

// 双击第 3 行行首的 TypX：触发选区 + 同词匹配高亮（选中行必然是 activeLine）
const wordRect = await page.evaluate(() => {
  const line = document.querySelectorAll('.cm-content .cm-line')[2];
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
  const node = walker.nextNode();
  const range = document.createRange();
  range.setStart(node, 0);
  range.setEnd(node, 4);
  return range.getBoundingClientRect().toJSON();
});
await page.mouse.dblclick(wordRect.x + 20, wordRect.y + wordRect.height / 2);
await page.waitForTimeout(700);

const probe = () => page.evaluate(() => ({
  state: window.__typx.editorState(),
  selection: Array.from(document.querySelectorAll('.cm-selectionLayer .cm-selectionBackground')).map((el) => getComputedStyle(el).backgroundColor),
  matches: Array.from(document.querySelectorAll('.cm-selectionMatch')).map((el) => getComputedStyle(el).backgroundColor),
  activeLine: Array.from(document.querySelectorAll('.cm-activeLine')).map((el) => getComputedStyle(el).backgroundColor),
  focused: document.querySelector('.cm-editor').classList.contains('cm-focused'),
}));

// 1. 选中生效：双击选中 TypX，选区背景是主题蓝；activeLine 必须半透明，否则会盖住选区层
const focused = await probe();
assert.equal(focused.state.selectedText, 'TypX');
assert.deepEqual(focused.selection, ['rgb(220, 231, 248)'], 'focused selection should be #dce7f8');
assert.equal(focused.focused, true);
assert.ok(/^rgba\(/.test(focused.activeLine[0]), `activeLine must be translucent (got ${focused.activeLine[0]})`);

// 2. 像素级验证：选中文字在当前行上确实可见（选区层 z-index=-2，被不透明行背景遮挡时像素与未选中处相同）
const shot = await page.screenshot({ type: 'png' });
const pixels = await page.evaluate(async ({ b64, sel }) => {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const scaleX = img.naturalWidth / innerWidth, scaleY = img.naturalHeight / innerHeight;
  const at = (r) => Array.from(ctx.getImageData(Math.round((r.x + r.width / 2) * scaleX), Math.round((r.y + r.height / 2) * scaleY), 1, 1).data).slice(0, 3);
  return { selected: at(sel) };
}, { b64: shot.toString('base64'), sel: wordRect });
const [r, g, b] = pixels.selected;
assert.ok(b - r > 15, `selected pixel should be visibly blue, got rgb(${pixels.selected})`);
console.log(`selected pixel on active line: rgb(${pixels.selected})`);
await page.locator('.cm-editor').screenshot({ path: path.resolve('docs/design/verify-selection-match.png') });

// 3. 同词匹配高亮：其余 4 处 TypX 被标记为柔和蓝，而不是默认荧光绿 #99ff7780
assert.equal(focused.matches.length, 4, 'other occurrences should be marked');
for (const color of focused.matches) {
  assert.equal(color, 'rgba(42, 92, 170, 0.13)', 'match highlight should use the TypX soft blue');
}

// 4. 失焦淡化：点击预览后，编辑器选区不再是全强度蓝，而是暖灰
await page.locator('#preview-pane').click({ position: { x: 30, y: 30 } });
await page.waitForTimeout(600);
const blurred = await probe();
assert.equal(blurred.focused, false);
assert.deepEqual(blurred.selection, ['rgb(233, 233, 227)'], 'unfocused selection should dim to #e9e9e3');
await page.locator('#editor-pane').screenshot({ path: path.resolve('docs/design/verify-selection-blur.png') });

console.log('PASS selection visible on active line (pixel-level)');
console.log('PASS selection background (focused #dce7f8 / blurred #e9e9e3)');
console.log('PASS selection-match highlight uses soft blue instead of fluorescent green');
console.log('SHOT docs/design/verify-selection-match.png, verify-selection-blur.png');
await browser.close();
