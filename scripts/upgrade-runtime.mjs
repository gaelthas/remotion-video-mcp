import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT} from '../server/paths.mjs';

const version = process.argv[2];
const noInstall = process.argv.includes('--no-install');
if (!version || !/^\d+\.\d+\.\d+/.test(version)) {
  console.error('用法：node scripts/upgrade-runtime.mjs <Remotion 版本> [--no-install]');
  process.exit(1);
}

const check = spawnSync('npm', ['view', `remotion@${version}`, 'version'], {
  cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
});
if (check.status !== 0 || !check.stdout.trim()) {
  console.error(`npm 上不存在 remotion@${version}`);
  process.exit(1);
}

const pkgPath = path.join(ROOT, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
let changed = 0;
for (const name of Object.keys(pkg.dependencies)) {
  if (name === 'remotion' || name.startsWith('@remotion/')) {
    if (pkg.dependencies[name] !== version) changed++;
    pkg.dependencies[name] = version;
  }
}
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
fs.writeFileSync(path.join(ROOT, 'VERSION'), `${version}\n`);
console.log(`已把 ${changed} 个 Remotion 包统一到 ${version}`);

if (noInstall) {
  const lock = spawnSync('npm', ['install', '--package-lock-only', '--no-audit', '--no-fund'], {
    cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32',
  });
  process.exit(lock.status ?? 1);
}

for (const [command, args, options] of [
  ['npm', ['install', '--no-audit', '--no-fund'], {stdio: 'inherit', shell: process.platform === 'win32'}],
  [process.execPath, ['--input-type=module', '-e', "import {ensureBrowser} from '@remotion/renderer'; await ensureBrowser();"], {stdio: 'inherit', shell: false}],
  [process.execPath, [path.join(ROOT, 'scripts', 'smoke-render.mjs')], {stdio: 'inherit', shell: false}],
]) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {cwd: ROOT, ...options});
  if (result.status !== 0) {
    console.error(`升级流程在 ${command} 处失败，请修复后重试`);
    process.exit(result.status ?? 1);
  }
}
console.log(`\n升级完成：${version}。提交 package.json、package-lock.json、VERSION。`);
