import path from 'node:path';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {ROOT} from '../server/paths.mjs';
import {getConfig} from '../server/config.mjs';

const cfg = getConfig();
const url = `http://${cfg.httpHost}:${cfg.httpPort}/mcp`;
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'http.mjs')], {
  cwd: ROOT,
  stdio: ['ignore', 'ignore', 'pipe'],
});
let ready = false;
child.stderr.on('data', (chunk) => {
  process.stderr.write(`[http] ${chunk}`);
  if (String(chunk).includes('http ready')) ready = true;
});

async function rpc(method, params) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(cfg.httpToken ? {authorization: `Bearer ${cfg.httpToken}`} : {}),
    },
    body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
  });
  const text = await response.text();
  const jsonLine = text.split('\n').find((line) => line.startsWith('data:'));
  const payload = JSON.parse(jsonLine ? jsonLine.slice(5).trim() : text);
  if (!payload.result) throw new Error(`${method} 无 result：${text.slice(0, 400)}`);
  return payload.result;
}

try {
  for (let i = 0; i < 50 && !ready; i++) await delay(200);
  if (!ready) throw new Error('HTTP 服务未就绪');
  const init = await rpc('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {name: 'remotion-video-mcp-http-selftest', version: '1.0.0'},
  });
  if (init.serverInfo?.name !== 'remotion-video-mcp') throw new Error('serverInfo 不符');
  const tools = await rpc('tools/list', {});
  if (tools.tools.length !== 17) throw new Error(`工具数不符：${tools.tools.length}`);
  console.log(`HTTP 自检通过：${url}，${tools.tools.length} 个工具`);
} catch (err) {
  console.error('HTTP 自检失败：', err.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
