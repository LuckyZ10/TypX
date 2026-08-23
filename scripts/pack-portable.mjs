// 手工打包免安装解压版：Electron 运行时目录 + resources/app（不依赖 electron-builder，
// 规避 winCodeSign 缓存在非管理员 Windows 上解压符号链接失败的问题）
import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

const ROOT = path.resolve(import.meta.dirname, '..');
const ELECTRON_DIST = path.join(ROOT, 'node_modules', 'electron', 'dist');
const OUT = path.join(ROOT, 'release', `TypX-${pkg.version}-win-x64-portable`);

if (!existsSync(ELECTRON_DIST)) {
  console.error('找不到 node_modules/electron/dist，请先 npm install');
  process.exit(1);
}
if (!existsSync(path.join(ROOT, 'dist', 'main', 'index.js'))) {
  console.error('找不到 dist/main/index.js，请先 npm run build');
  process.exit(1);
}

console.log(`打包到 ${OUT} ...`);
// rm 偶发 EBUSY（杀进程后句柄延迟释放/杀软扫描），重试几次；
// 仍失败则不中断——后面按覆盖式更新，只是残留旧文件
let rmFailed = false;
for (let i = 0; i < 3; i++) {
  try {
    await rm(OUT, { recursive: true, force: true });
    break;
  } catch (e) {
    if (i === 2) {
      console.warn('旧目录暂时被锁，改为覆盖式打包');
      rmFailed = true;
    } else {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
}
await mkdir(path.join(OUT, 'resources', 'app'), { recursive: true });

// 1) Electron 运行时（electron.exe、dll、locales 等）。
//    跳过 default_app.asar：有 resources/app 时它不会被加载，
//    且它常被杀进程残留的句柄锁住导致复制/删除失败
await cp(ELECTRON_DIST, OUT, {
  recursive: true,
  filter: (src) => !src.endsWith('default_app.asar'),
});

// 2) 应用本体放到 resources/app，Electron 会优先于 default_app.asar 加载
await cp(path.join(ROOT, 'dist'), path.join(OUT, 'resources', 'app', 'dist'), { recursive: true });
await cp(path.join(ROOT, 'package.json'), path.join(OUT, 'resources', 'app', 'package.json'));

// 3) electron.exe -> TypX.exe
await rm(path.join(OUT, 'electron.exe'), { force: true });
await cp(path.join(ELECTRON_DIST, 'electron.exe'), path.join(OUT, 'TypX.exe'));

// 4) 用 electron-builder 缓存里的 rcedit 修正 exe 元信息（任务管理器/属性里显示 TypX）
function findRcedit() {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'electron-builder', 'Cache', 'winCodeSign');
  if (!existsSync(base)) return null;
  for (const entry of readdirSync(base)) {
    const p = path.join(base, entry, 'rcedit-x64.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

const rcedit = findRcedit();
if (rcedit) {
  const exe = path.join(OUT, 'TypX.exe');
  try {
    execFileSync(
      rcedit,
      [
        exe,
        '--set-version-string', 'ProductName', 'TypX',
        '--set-version-string', 'FileDescription', 'TypX - Markdown Typesetter',
        '--set-version-string', 'OriginalFilename', 'TypX.exe',
        '--set-product-version', pkg.version,
        '--set-file-version', pkg.version,
      ],
      { stdio: 'inherit' },
    );
    console.log('rcedit: exe 元信息已更新');
  } catch (e) {
    console.warn('rcedit 失败（不影响功能，仅元信息）:', String(e));
  }
} else {
  console.warn('未找到 rcedit，跳过 exe 元信息修改（不影响功能）');
}

console.log('打包完成');
