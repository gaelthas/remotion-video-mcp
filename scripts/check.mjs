import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {ROOT, TEMPLATE} from '../server/paths.mjs';

let failures = 0;
const files = [];
for (const dir of ['server', 'scripts']) {
  const root = path.join(ROOT, dir);
  for (const name of fs.readdirSync(root)) {
    if (name.endsWith('.mjs')) files.push(path.join(root, name));
  }
}

for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], {cwd: ROOT, encoding: 'utf8'});
  if (result.status !== 0) {
    failures++;
    console.error(`语法错误 ${path.relative(ROOT, file)}\n${result.stderr}`);
  }
}

for (const json of ['package.json', 'package-lock.json', 'config.example.json', 'mcp.json.example', 'tsconfig.base.json']) {
  const file = path.join(ROOT, json);
  if (!fs.existsSync(file)) {
    failures++;
    console.error(`缺少 ${json}`);
    continue;
  }
  try {
    JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    failures++;
    console.error(`${json} 不是合法 JSON：${err.message}`);
  }
}

for (const file of ['src/index.ts', 'src/Root.tsx', 'src/theme.ts', 'src/lib/motion.ts', 'src/lib/reveal.tsx', 'src/scenes/DesignShowcase.tsx', 'src/scenes/StatCounter.tsx']) {
  if (!fs.existsSync(path.join(TEMPLATE, file))) {
    failures++;
    console.error(`模板缺少 ${file}`);
  }
}

console.log(`${files.length} 个 mjs、5 个 JSON、7 个模板文件检查完毕；失败 ${failures} 项`);
process.exit(failures > 0 ? 1 : 0);
