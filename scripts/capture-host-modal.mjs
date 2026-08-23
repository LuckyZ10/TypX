import { chromium } from 'playwright';
import * as path from 'node:path';

const OUT_DIR = 'D:/codex/TypX/assets/screenshots';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();

await page.goto(`file://${OUT_DIR}/mock-host-modal.html`);
await new Promise((r) => setTimeout(r, 800));

const p = path.join(OUT_DIR, '11-modal-image-host.png');
await page.screenshot({ path: p, fullPage: false });
console.log('saved', p);

await browser.close();
