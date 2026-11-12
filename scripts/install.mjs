import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, ensureDirs} from '../server/paths.mjs';

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`命令失败（exit ${result.status}）：${command} ${args.join(' ')}`);
  }
}

ensureDirs();
console.log('安装唯一一套运行时依赖（全机只需执行一次）');
run('npm', fs.existsSync(path.join(ROOT, 'package-lock.json'))
  ? ['ci', '--no-audit', '--no-fund']
  : ['install', '--no-audit', '--no-fund']);

console.log('\n预下载渲染浏览器（缓存到 runtime 的 node_modules/.remotion，全机一份）');
run(process.execPath, [
  '--input-type=module', '-e',
  "import {ensureBrowser} from '@remotion/renderer'; const s = await ensureBrowser(); console.log('browser:', s.type, s.path ?? '');",
], {shell: false});

console.log('\n跑一次冒烟渲染');
run(process.execPath, [path.join(ROOT, 'scripts', 'smoke-render.mjs')], {shell: false});
console.log('\n完成。把 mcp.json.example 中的路径改成本机路径后合并到 ~/.codebuddy/mcp.json，并把 skill/ 目录复制为 ~/.codebuddy/skills/remotion-video-mcp/。');
