import { access, readFile } from 'node:fs/promises';
import path from 'node:path';

const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const releaseDir = path.resolve('release');
const metadataPath = path.join(releaseDir, 'latest.yml');

function metadataValue(text, key) {
  return text.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1]?.trim();
}

try {
  const metadata = await readFile(metadataPath, 'utf8');
  const version = metadataValue(metadata, 'version');
  const installerName = metadataValue(metadata, 'path');
  if (version !== pkg.version) throw new Error(`latest.yml 版本是 ${version ?? '空'}，package.json 是 ${pkg.version}`);
  if (!installerName) throw new Error('latest.yml 缺少安装包 path');

  const installerPath = path.join(releaseDir, installerName);
  await access(installerPath);
  await access(`${installerPath}.blockmap`);

  const packagedConfigPath = path.join(releaseDir, 'win-unpacked', 'resources', 'app-update.yml');
  const packagedConfig = await readFile(packagedConfigPath, 'utf8');
  if (!/provider:\s*github/i.test(packagedConfig) || !/owner:\s*LuckyZ10/i.test(packagedConfig) || !/repo:\s*TypX/i.test(packagedConfig)) {
    throw new Error('app-update.yml 的 GitHub 发布地址不完整');
  }

  console.log(`update artifacts ok: TypX ${version} / ${installerName}`);
} catch (error) {
  console.error(`update artifacts invalid: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
