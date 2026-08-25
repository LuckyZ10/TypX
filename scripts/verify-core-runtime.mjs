import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');
page.setDefaultTimeout(8_000);

try {
  const markdown = [
  '# 核心回归',
  '',
  '行内公式 $E = mc^2$。',
  '',
  '$$',
  '\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}',
  '$$',
  '',
  '| 项目 | 状态 |',
  '| --- | --- |',
  '| TypX | 正常 |',
  ].join('\n');

  await page.evaluate((value) => window.__typx.setMarkdown(value), markdown);
  await page.waitForTimeout(700);
  const math = await page.evaluate(() => ({
    katex: document.querySelector('#preview').contentDocument.querySelectorAll('.katex').length,
    svg: window.__typx.svgMathDetailed(),
  }));
  assert(math.katex >= 2, 'KaTeX preview did not render');
  assert(math.svg.n >= 2, 'SVG conversion did not convert formulas');
  assert.deepEqual(math.svg.failed, []);
  console.log('PASS KaTeX preview and SVG conversion');

  const footer = await page.evaluate(() => window.__typx.testFooter('[合集](https://example.com/album)'));
  assert.match(footer.html, /<hr/i);
  assert.match(footer.html, /https:\/\/example\.com\/album/);
  console.log('PASS platform footer inlining');

  await page.click('#btn-copy-menu');
  await page.click('#btn-copy-wechat-menu');
  await page.waitForTimeout(900);
  assert.match(await page.locator('#toast').innerText(), /已复制.*公众号/);
  console.log('PASS WeChat copy pipeline');
  await page.click('#btn-copy-menu');
  await page.click('#btn-copy-zhihu');
  await page.waitForTimeout(900);
  assert.match(await page.locator('#toast').innerText(), /已复制.*知乎/);
  assert.equal(await page.locator('#btn-copy-rich').innerText(), '复制到知乎');
  console.log('PASS Zhihu copy pipeline');

  // 测试结束恢复默认目标，避免回归脚本改变用户的常用操作。
  await page.click('#btn-copy-menu');
  await page.click('#btn-copy-wechat-menu');
  await page.waitForTimeout(500);

  await page.reload();
  await page.waitForTimeout(900);
} finally {
  await browser.close();
}
