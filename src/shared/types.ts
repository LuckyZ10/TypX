export interface FileEntry {
  /** 相对所打开文件夹的路径，使用 / 分隔，例如 notes/2024/foo.md */
  relPath: string;
  absPath: string;
  name: string;
}

export interface CustomTheme {
  id: string;
  name: string;
  css: string;
}

export interface Project {
  name: string;
  path: string;
  /** 项目内最后打开的文章（相对路径），重新打开项目时自动恢复 */
  lastFile: string | null;
  lastOpenedAt: number;
}

/** 视图模式：仅编辑 / 编辑+预览分屏 / 仅预览（隐藏 Markdown 原文） */
export type ViewMode = 'edit' | 'split' | 'preview';

/** 各平台独立的复制方案：管线差异大（公众号剥 base64、收无 defs SVG；知乎转存 base64、对 HTML 宽容），分开配置互不牵制 */
export interface CopyProfile {
  /** 复制时公式的处理方式：svg=行内 SVG / image=截图 PNG（走图床）/ off=原样 HTML */
  mathMode: 'svg' | 'image' | 'off';
  /** 复制时处理本地图片与公式截图（图床上传或 base64 兜底） */
  embedImages: boolean;
}

/** 图床配置：公众号正文粘贴会过滤 base64 图片，本地图/公式图必须换成 https 外链。
 *  坚果云等 WebDAV 网盘不行——无法提供免登录直链，公众号抓取不到。 */
export interface ImageHostConfig {
  type: 'off' | 'gitee' | 'github' | 'smms';
  /** Gitee/GitHub: 访问令牌；SM.MS: API Token */
  token: string;
  /** Gitee/GitHub：用户名/仓库名（仓库需公开） */
  repo: string;
  branch: string;
  /** 仓库内存放目录，空则放根目录 */
  dir: string;
  /** GitHub 生成的外链风格 */
  urlStyle: 'jsdelivr' | 'fastly' | 'raw';
}

export interface Prefs {
  /** 打开过的文件夹自动登记为项目，启动时恢复最近一个 */
  projects: Project[];
  viewMode: ViewMode;
  /** 兼容旧版本：首次升级时迁移为 projects[0] */
  lastFolder: string | null;
  themeId: string;
  customThemes: CustomTheme[];
  /** 复制时附加在文末的脚注文字，可为空 */
  footnote: string;
  syncScroll: boolean;
  editorFontSize: number;
  /** 复制时把本地图片读取为 base64 data URI 一并放进剪贴板（公众号 / 知乎粘贴后不丢图） */
  embedImages: boolean;
  /** 复制时公式的处理方式：svg=行内 SVG（推荐，微信支持）/ image=截图 PNG（走图床）/ off=原样 HTML */
  mathMode: 'svg' | 'image' | 'off';
  /** 图床（公众号图片必需）：复制时本地图 / 公式图上传换 https 外链 */
  imageHost: ImageHostConfig;
  /** 按平台独立的复制方案 */
  platformCopy: { wechat: CopyProfile; zhihu: CopyProfile };
}

export interface TypXApi {
  selectFolder(): Promise<string | null>;
  listFiles(folder: string): Promise<FileEntry[]>;
  readFile(absPath: string): Promise<{ content: string; mtime: number }>;
  /** 读取二进制文件为 base64（复制时内嵌本地图片用） */
  readFileBase64(absPath: string): Promise<{ base64: string; mime: string }>;
  /** 截取窗口指定区域（DIP 像素）为 PNG data URL，公式转图片用；失败返回 null */
  captureRect(rect: { x: number; y: number; width: number; height: number }): Promise<string | null>;
  /** 上传图片到图床，返回 https 外链；失败抛错（含平台返回信息） */
  uploadImage(cfg: ImageHostConfig, fileName: string, base64: string): Promise<string>;
  /** 用系统默认浏览器打开外部链接 */
  openExternal(url: string): Promise<void>;
  writeFile(absPath: string, content: string): Promise<{ mtime: number }>;
  getPrefs(): Promise<Prefs>;
  setPrefs(prefs: Prefs): Promise<void>;
  /** 以富文本（text/html + 纯文本）写剪贴板，可粘贴进公众号 / 知乎编辑器 */
  copyRich(html: string, text: string): Promise<void>;
  copyText(text: string): Promise<void>;
  watchFolder(folder: string): Promise<void>;
  unwatch(): Promise<void>;
  onFsChanged(cb: (info: { relPath: string | null }) => void): void;
}

declare global {
  interface Window {
    api: TypXApi;
  }
}

export {};
