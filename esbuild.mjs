import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

await rm('dist', { recursive: true, force: true });

// 主进程：CJS，external electron（由运行时提供）
await build({
  entryPoints: ['src/main/index.ts'],
  outfile: 'dist/main/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['electron', 'fsevents'],
  logLevel: 'info',
});

// preload：同样 CJS
await build({
  entryPoints: ['src/preload/index.ts'],
  outfile: 'dist/preload/index.js',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node18',
  external: ['electron', 'fsevents'],
  logLevel: 'info',
});

// 渲染进程：iife 单文件，避免 file:// 下 ES Module 的跨源限制
await build({
  entryPoints: ['src/renderer/main.ts'],
  outfile: 'dist/renderer/app.js',
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'chrome120',
  // mathjax-full 的 components/version.js 在未定义 PACKAGE_VERSION 时会 eval('require')，
  // 被 CSP（script-src 'self'，无 unsafe-eval）拦截导致整个渲染层崩溃；定义后走常量分支
  define: { PACKAGE_VERSION: '"3.2.1"' },
  logLevel: 'info',
});

await cp('src/renderer/index.html', 'dist/renderer/index.html');

// KaTeX：预览 iframe 通过 <link href="katex.min.css"> 引用，字体按其相对路径解析
await cp('node_modules/katex/dist/katex.min.css', 'dist/renderer/katex.min.css');
await cp('node_modules/katex/dist/fonts', 'dist/renderer/fonts', { recursive: true });

console.log('build done');
