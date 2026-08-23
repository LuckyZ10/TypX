// 把 assets/icon-*.png 封装成 Windows ICO（PNG-in-ICO，Vista+ 通用），
// 不引第三方依赖：ICONDIR + ICONDIRENTRY + PNG 数据
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SIZES = [16, 32, 48, 64, 256];

const images = SIZES.map((size) => {
  const file = path.join(ROOT, 'assets', size === 256 ? 'icon.png' : `icon-${size}.png`);
  if (!existsSync(file)) throw new Error(`缺少 ${file}，请先运行: electron . --icon-gen`);
  return { size, data: readFileSync(file) };
});

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);

const entries = Buffer.alloc(16 * images.length);
const blobs = [];
let offset = header.length + entries.length;
images.forEach((img, i) => {
  const base = i * 16;
  entries.writeUInt8(img.size === 256 ? 0 : img.size, base); // 宽（0 = 256）
  entries.writeUInt8(img.size === 256 ? 0 : img.size, base + 1); // 高
  entries.writeUInt8(0, base + 2); // 调色板数
  entries.writeUInt8(0, base + 3); // reserved
  entries.writeUInt16LE(1, base + 4); // planes
  entries.writeUInt16LE(32, base + 5); // bitcount
  entries.writeUInt32LE(img.data.length, base + 8);
  entries.writeUInt32LE(offset, base + 12);
  blobs.push(img.data);
  offset += img.data.length;
});

const out = path.join(ROOT, 'assets', 'icon.ico');
writeFileSync(out, Buffer.concat([header, entries, ...blobs]));
console.log(`icon.ico 已生成（${images.length} 个尺寸: ${SIZES.join('/')}，${Math.round((offset / 1024))}KB）`);
