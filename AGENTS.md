# AGENTS.md

TypX：Electron + CodeMirror 6 的 Markdown 排版工具（公众号 / 知乎）。界面与文档为中文，
提交信息沿用 `vX.Y.Z：变更点；变更点` 风格。

## 构建 / 测试 / 验证

- 构建：`node esbuild.mjs`；类型检查：`npm run typecheck`；启动：`npm run dev`。
- 端到端验证：`npx electron . --remote-debugging-port=9222` 启动后，另开终端跑
  `scripts/verify-*.mjs`（Playwright over CDP，依赖渲染层 `window.__typx` 测试钩子）。
  新功能要配一个 verify 脚本；涉及选中/遮挡的视觉问题用像素采样断言，不要只查 DOM 样式。
- renderer 改动后 `page.reload()` 可能命中 `typx://` 缓存的旧 `app.js`——行为没变化就重启应用再下结论。

## 发布（重要）

- Windows 安装包**只在 GitHub Actions 上构建**：push `v*` tag 自动触发
  `.github/workflows/release-build.yml`（本机非管理员终端会因 winCodeSign 符号链接失败，详见
  [docs/构建与发布.md](docs/构建与发布.md)）。
- 发布 = `npm version` → 提交 → push main → push tag → 核对草稿 Release 的 `latest.yml` → 正式发布。
- `latest.yml` 是自动更新源，发布前必须核对 version / path / sha512。

## 其他

- git 走 `127.0.0.1:7897` 本地代理访问 github.com；代理程序没开时 fetch/push 会失败。
- `npm run dist:dir`（便携版）不依赖 electron-builder，本机可跑。
- 用户级验证脚本约定：`scripts/verify-*.mjs`，均连接 9222，不要假定应用已在运行。
