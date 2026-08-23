# TypX — 本地 Markdown 排版工具

<p><img src="assets/icon.png" width="96" alt="TypX" /></p>

Markdown Nice（mdnice）的本地文件夹版：用 Electron + TypeScript 编写。选择一个本地文件夹，左侧文件树浏览所有 Markdown 文章，右侧按主题实时排版，一键把「行内样式化」的 HTML 复制到微信公众号 / 知乎编辑器。

📖 **完整功能教程见 [docs/使用教程.md](docs/使用教程.md)**

## 功能

- **项目系统**：打开过的文件夹自动登记为项目；启动时恢复最近项目与该项目里上次编辑的文章；侧边栏顶部可随时切换 / 移除项目
- **视图模式**：编辑 / 分屏 / 预览三档切换，预览模式隐藏 Markdown 原文，适合阅读与校对排版（选择会被记住）
- **本地文件夹**：递归列出目录下所有 `.md` / `.markdown` / `.mdx`（自动跳过 `node_modules`、`.git` 等目录），外部修改自动重载
- **三栏界面**：文件树 · CodeMirror 6 编辑器（Ctrl+S 保存）· 主题预览（同步滚动）
- **主题系统**：内置 7 套主题（简约白 / 橙心 / 蓝绿清新 / 优雅紫 / 极客黑 / 墨青标签 / 墨笺论文），支持用 CSS 自定义并保存为「我的主题」
- **一键复制**：把 CSS 计算样式逐元素内联成 `style` 属性（mdnice 同款原理），粘贴进公众号 / 知乎排版不丢
- **双平台独立方案**：「复制到公众号」与「复制到知乎」是两条独立管线，公式/图片策略分别配置互不牵制——公众号默认公式转行内 SVG（微信验证方案）；知乎默认公式原样 HTML（知乎对 HTML 宽容），后续可各自演进。在「自定义样式」→「复制方案」里按平台调整
- **文末推荐**：按平台配置的 Markdown 推荐链接（如公众号合集、知乎专栏），复制时自动加分割线渲染追加到文末
- **复制带图**：复制时自动把文章里的本地图片读取为 base64 一并放进剪贴板，粘贴到公众号 / 知乎无需再手动插图（可在「自定义样式」里开关）
- **代码高亮**：highlight.js，GFM 表格、任务列表、引用块全支持
- **数学公式**：KaTeX 预览（行内 `$...$`、块级 `$$...$$`，美元符号用 `\$` 转义）；复制时默认把公式转为**行内 SVG**（微信编辑器支持的无 defs 矢量，随字号缩放、无需图床上传，公式再多也不怕）；也可切换为截图 PNG（走图床）或原样 HTML
- **斜体图注**（墨青标签主题）：图片单独成段、空一行后整段斜体（`*图 1：xxx*`）→ 自动变蓝色居中图注，复制后样式保留
- **本地图片**：预览时相对路径图片通过 `mdfile://` 协议直接显示；复制时自动转 base64 内嵌（见「关于图片和公式的说明」）
- **图床（公众号必需）**：公众号正文粘贴会过滤 base64 图片，复制时本地图片与公式截图自动上传图床换 https 外链，粘贴时公众号自动转存。顶栏「☁ 图床」支持三个服务商：**Gitee**（国内快，推荐）、**SM.MS**（免建仓库，只需一个 Token）、**GitHub**（jsDelivr CDN），均可一键测试。坚果云等 WebDAV 网盘不能用作图床（无法提供免登录直链）
- **偏好持久化**：项目列表、主题、图床配置、脚注等保存在 `userData/preferences.json`

## 快速开始

```bash
npm install
npm run dev        # 构建并启动
```

其他命令：

```bash
npm run typecheck  # TypeScript 类型检查
npm run build      # 仅构建（esbuild 打包主进程 / preload / 渲染层）
npm run dist:dir   # 打包免安装解压版（release/TypX-x.x.x-win-x64-portable/，zip 需另行压缩）
npm run dist       # 打包 NSIS 安装包（electron-builder；非管理员 Windows 可能因 winCodeSign 缓存解压失败，建议优先用 dist:dir）
```

> 国内网络下若 Electron 二进制下载失败，带镜像环境变量重试：
> `ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install`

## 使用流程

1. 「打开文件夹」选择你的 Markdown 目录（自动登记为项目，下次启动免重新选择）
2. 左侧点选文章，右侧实时预览；顶栏「编辑 / 分屏 / 预览」随时切换视图
3. 顶栏切换主题，或「自定义样式」里改 CSS（可先「仅预览」，满意后「保存并应用」）
4. 点「复制到公众号」或「复制到知乎」，去对应编辑器里 Ctrl+V

## 关于图片和公式的说明

预览中本地相对路径图片直接显示；点「复制到公众号 / 知乎」时，本地图片会被读取为 base64 data URI 放进剪贴板内容，粘贴后平台编辑器一般会识别并转存到自己的图床（实测路径与 [wechat-md](https://github.com/situ2001/wechat-md) 的方案一致）。两点提醒：

- 公众号对 base64 图片的转存**大多数情况正常**，但个别图（超大、特殊格式）可能显示上传失败——遇到时把该图换成 `http(s)` 外链（图床）最稳；远程外链图片公众号 / 知乎粘贴时会自动拉取转存
- base64 会让剪贴板内容变大（1MB 图 ≈ 1.33MB 文本），图片很多的大文章复制会稍慢，属正常现象

数学公式：预览由 KaTeX 字体渲染；复制时默认转**行内 SVG**——微信编辑器不支持公式 HTML，但接受不带 `<defs>` 的 SVG（mdnice/doocs 同款方案），矢量随字号缩放且无需图床，公式密集的文章（数百个）也能稳定粘贴。截图 PNG 模式适合少数平台不支持 SVG 的场景（走图床上传，公式多时粘贴压力大）；个别 MathJax 不支持的 TeX 写法会自动保留 HTML 原样。

## 技术结构

```
src/
├─ main/          Electron 主进程：窗口、自定义协议(typx:// 页面、mdfile:// 本地图片)、
│                 IPC(文件夹/文件读写/监听)、剪贴板富文本、偏好存储
├─ preload/       contextBridge 暴露类型安全的 window.api
├─ shared/        主/渲染进程共享类型
└─ renderer/      界面：CodeMirror 编辑器、marked + highlight.js 渲染、
                  主题 CSS、样式内联器（iframe 计算样式 -> 行内 style）
```

安全设计：`contextIsolation` + `sandbox` 开启，渲染层无 Node 权限；预览 iframe `sandbox="allow-same-origin"`（禁止执行脚本）；Markdown HTML 经 DOMPurify 消毒。

## 已知取舍

- 复制到公众号时，长代码行会按 `pre-wrap` 折行显示（未做逐行 section 拆分）
- 保存文件时行尾统一为 LF

## 协议

本项目采用 [PolyForm Noncommercial 1.0.0](LICENSE) 协议：**个人学习、研究与非商业用途免费使用与修改；未经授权，禁止商业使用**（如需商业授权请联系作者）。

## 致谢

本项目借鉴了前人的宝贵实践：

- 排版思路与公众号适配经验来自 [mdnice（Markdown Nice）](https://mdnice.com) 与 [doocs/md](https://github.com/doocs/md)，尤其是[《和微信公众号编辑器战斗的日子》](https://product.mdnice.com/article/intro/battle-with-wechat/)中总结的「公众号接受无 defs SVG 公式」等关键结论
- 「墨青标签 / 墨笺论文」主题设计源自 Typlatex Article Ink 排版样式
- 构建 [Electron](https://www.electronjs.org) · [esbuild](https://esbuild.github.io) · [CodeMirror 6](https://codemirror.net) · [marked](https://marked.js.org) · [KaTeX](https://katex.org) · [MathJax](https://www.mathjax.org) · [highlight.js](https://highlightjs.org) · [DOMPurify](https://github.com/cure53/DOMPurify)，感谢以上开源项目
