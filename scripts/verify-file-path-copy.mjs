import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');

const projectPath = path.resolve('test-docs');
assert.equal(await page.evaluate((project) => window.__typx.openProject(project), projectPath), true);
await page.waitForTimeout(400);

const firstFile = page.locator('#file-tree .tree-file').first();
const relPath = await firstFile.getAttribute('data-rel');
assert(relPath, 'No Markdown file was listed');
const expectedPath = path.resolve(projectPath, relPath);

await firstFile.dispatchEvent('contextmenu', {
  bubbles: true,
  cancelable: true,
  button: 2,
  clientX: 9999,
  clientY: 9999,
});

const menu = page.locator('#file-menu');
assert.equal(await menu.isVisible(), true);
assert.equal(await menu.locator('button').count(), 4);
assert.equal((await page.locator('#fm-copy-path').innerText()).trim(), '复制文件路径');

const bounds = await menu.boundingBox();
const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
assert(bounds && viewport, 'Context menu geometry was unavailable');
assert(bounds.x >= 8 && bounds.y >= 8, 'Context menu crossed the top or left edge');
assert(bounds.x + bounds.width <= viewport.width - 7, 'Context menu crossed the right edge');
assert(bounds.y + bounds.height <= viewport.height - 7, 'Context menu crossed the bottom edge');

await page.locator('#fm-copy-path').click();
await page.waitForTimeout(150);
assert.equal((await page.locator('#toast').innerText()).trim(), '已复制文件路径');
assert.equal(await menu.isVisible(), false);

const clipboardPath = execFileSync(
  'powershell.exe',
  ['-NoProfile', '-Command', '[Console]::OutputEncoding=[Text.Encoding]::UTF8; Get-Clipboard -Raw'],
  { encoding: 'utf8' },
).trim();
assert.equal(path.normalize(clipboardPath).toLowerCase(), path.normalize(expectedPath).toLowerCase());

await firstFile.click();
await page.waitForTimeout(250);
await firstFile.click({ button: 'right' });
await page.screenshot({ path: path.resolve('docs/images/guide-file-menu.png') });

console.log('PASS file context menu includes Copy file path');
console.log('PASS copied absolute Markdown file path to clipboard');
console.log('PASS four-item context menu stays inside the window');
console.log('SHOT docs/images/guide-file-menu.png');
await browser.close();
