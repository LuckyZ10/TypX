import { chromium } from 'playwright';

const b = await chromium.connectOverCDP('http://localhost:9222');
const page = b.contexts()[0].pages().find((p) => p.url().startsWith('typx://'));
await page.waitForTimeout(600);
const log = (k, v) => console.log(k.padEnd(22), JSON.stringify(v));

await page.evaluate((p) => window.__typx.openProject(p), 'E:/Codex/7.TypeX/test-docs');
await page.waitForTimeout(500);

await page.locator('#file-tree .tree-file').first().click({ button: 'right' });
await page.waitForTimeout(300);
log('menu visible', await page.evaluate(() => !document.querySelector('#file-menu').hidden));
log('menu label', await page.evaluate(() => document.querySelector('#fm-mark-published').textContent));

await page.click('#fm-mark-published');
await page.waitForTimeout(300);
log('badge', await page.evaluate(() => {
  const f = document.querySelector('.tree-file.published');
  return { has: !!f, badgeText: f ? getComputedStyle(f, '::after').content : null, title: f?.title };
}));
log('count', await page.evaluate(() => document.querySelector('#sidebar-count').textContent));

await page.locator('.tree-file').first().click({ button: 'right' });
await page.waitForTimeout(200);
log('menu label now', await page.evaluate(() => document.querySelector('#fm-mark-published').textContent));
await page.click('#fm-mark-published');
await page.waitForTimeout(300);
log('after untoggle', await page.evaluate(() => ({
  badge: document.querySelectorAll('.tree-file.published').length,
  count: document.querySelector('#sidebar-count').textContent,
})));

// 持久化验证：标记后 reload，徽章还在
await page.locator('.tree-file').first().click({ button: 'right' });
await page.waitForTimeout(200);
await page.click('#fm-mark-published');
await page.waitForTimeout(600); // 等 persistPrefsSoon 的 400ms 防抖落盘
await page.reload();
await page.waitForTimeout(1500);
log('after reload', await page.evaluate(() => ({
  badge: document.querySelectorAll('.tree-file.published').length,
  count: document.querySelector('#sidebar-count').textContent,
})));
// 清理：取消标记，避免污染测试项目状态
await page.locator('.tree-file').first().click({ button: 'right' });
await page.waitForTimeout(200);
await page.click('#fm-mark-published');
await page.waitForTimeout(400);
log('cleaned', await page.evaluate(() => document.querySelectorAll('.tree-file.published').length));
await b.close();
