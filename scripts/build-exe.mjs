import {spawnSync} from 'node:child_process';
import {ROOT} from '../server/paths.mjs';

const link = process.argv.includes('--link');
const bun = spawnSync('bun', ['--version'], {cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32'});

if (bun.status === 0) {
  console.log(`检测到 bun ${bun.stdout.trim()}，可编译单文件入口：`);
  console.log('  bun build --compile server/stdio.mjs --outfile dist/remotion-video-mcp.exe');
  console.log('注意：exe 旁的 node_modules（原生 compositor）与浏览器缓存仍需保留，不能只分发单个 exe。');
} else {
  console.log('未检测到 bun。推荐用 npm 的命令入口，无需编译：');
  console.log('  npm link        # 生成 remotion-video-mcp 与 remotion-video-mcp-http 两个命令');
}

if (link) {
  const result = spawnSync('npm', ['link'], {cwd: ROOT, stdio: 'inherit', shell: process.platform === 'win32'});
  process.exit(result.status ?? 1);
}
