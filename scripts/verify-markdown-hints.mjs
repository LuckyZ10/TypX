import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');
page.setDefaultTimeout(8_000);

try {
  await page.evaluate(() => window.__typx.setSyntaxHints(true));

  await page.evaluate(() => window.__typx.setMarkdown('**第一条：用更短的波长。**光波越短'));
  let warnings = await page.evaluate(() => window.__typx.syntaxWarnings());
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /可能缺少空格/);

  await page.evaluate(() => window.__typx.setMarkdown('**第一条：用更短的波长。** 光波越短'));
  warnings = await page.evaluate(() => window.__typx.syntaxWarnings());
  assert.equal(warnings.length, 0);

  await page.evaluate(() => window.__typx.setMarkdown('这里有意写 **光波'));
  warnings = await page.evaluate(() => window.__typx.syntaxWarnings());
  assert.equal(warnings.length, 1);
  assert.match(warnings[0].message, /可以忽略/);

  await page.evaluate(() => window.__typx.setMarkdown('`**代码里的星号**`\n\n\\*\\*转义星号'));
  warnings = await page.evaluate(() => window.__typx.syntaxWarnings());
  assert.equal(warnings.length, 0);

  await page.evaluate(() => window.__typx.setSyntaxHints(false));
  const toggleOff = await page.locator('#chk-markdown-hints').isChecked();
  assert.equal(toggleOff, false);

  console.log('PASS malformed strong emphasis is reported as a non-blocking hint');
  console.log('PASS valid strong emphasis, code and escaped markers are ignored');
  console.log('PASS syntax hints can be disabled without editing Markdown');
} finally {
  await browser.close();
}
