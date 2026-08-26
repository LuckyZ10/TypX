import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
const page = browser.contexts()[0].pages().find((candidate) => candidate.url().startsWith('typx://'));
assert(page, 'TypX renderer page was not found');
page.setDefaultTimeout(8_000);

try {
  const markdown = [
    '# 点击定位测试',
    '',
    '第一段正文。',
    '',
    '## 目标段落',
    '',
    '这里是需要定位的正文，包含 **加粗内容**。',
    '',
    '- 第一项',
    '- 第二项',
    '',
    '$$',
    'E = mc^2',
    '$$',
  ].join('\n');

  await page.evaluate((value) => window.__typx.setMarkdown(value), markdown);
  await page.click('#view-switch [data-view="preview"]');
  await page.waitForTimeout(300);

  const paragraphOffset = await page.locator('#preview').evaluate((frame) => {
    const doc = frame.contentDocument;
    const paragraph = Array.from(doc.querySelectorAll('p')).find((el) => el.textContent?.includes('这里是需要定位'));
    if (!paragraph) throw new Error('target paragraph was not rendered');
    const offset = Number(paragraph.getAttribute('data-source-offset'));
    paragraph.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    return offset;
  });
  await page.waitForTimeout(150);

  const paragraphState = await page.evaluate(() => window.__typx.editorState());
  assert.equal(paragraphState.viewMode, 'edit');
  assert.equal(paragraphState.offset, paragraphOffset);
  assert.equal(paragraphOffset, markdown.indexOf('这里是需要定位'));

  await page.click('#view-switch [data-view="split"]');
  const listOffset = await page.locator('#preview').evaluate((frame) => {
    const item = frame.contentDocument.querySelectorAll('li')[1];
    if (!item) throw new Error('second list item was not rendered');
    const offset = Number(item.getAttribute('data-source-offset'));
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 }));
    return offset;
  });
  await page.waitForTimeout(150);

  const listState = await page.evaluate(() => window.__typx.editorState());
  assert.equal(listState.viewMode, 'split');
  assert.equal(listState.offset, listOffset);
  assert.equal(listOffset, markdown.indexOf('- 第二项'));

  const copied = await page.evaluate(() => window.__typx.testFooter(''));
  assert.doesNotMatch(copied.html, /data-source-(?:offset|end)/);
  console.log('PASS preview click jumps to Markdown source');
  console.log('PASS preview-only mode switches to editor');
  console.log('PASS split mode stays split');
  console.log('PASS source metadata is removed from published HTML');
} finally {
  await browser.close();
}
