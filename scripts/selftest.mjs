import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {ROOT, OUT, ensureDirs} from '../server/paths.mjs';
import {TOOL_NAMES} from '../server/registry.mjs';

ensureDirs();
const child = spawn(process.execPath, [path.join(ROOT, 'server', 'stdio.mjs')], {
  cwd: ROOT,
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (chunk) => process.stderr.write(`[server] ${chunk}`));

let buffer = '';
let nextId = 1;
const pending = new Map();
child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  let index;
  while ((index = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      continue;
    }
    if (message.id !== undefined && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    }
  }
});

function request(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, resolve);
    child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', id, method, params})}\n`);
    setTimeout(() => {
      if (pending.has(id)) {
        pending.delete(id);
        reject(new Error(`${method} 超时`));
      }
    }, 90000);
  });
}

const notify = (method, params) => child.stdin.write(`${JSON.stringify({jsonrpc: '2.0', method, params})}\n`);

async function call(name, args) {
  const response = await request('tools/call', {name, arguments: args});
  const text = response.result?.content?.[0]?.text ?? '{}';
  const data = JSON.parse(text);
  if (response.result?.isError) throw new Error(`${name}: ${data.code} ${data.message}`);
  return data;
}

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

try {
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: {name: 'remotion-video-mcp-selftest', version: '1.0.0'},
  });
  assert(init.result?.serverInfo?.name === 'remotion-video-mcp', 'initialize 未返回预期 serverInfo');
  notify('notifications/initialized', {});

  const list = await request('tools/list', {});
  const names = list.result.tools.map((tool) => tool.name);
  assert(names.length === TOOL_NAMES.length, `工具数量不符：${names.length}`);
  for (const name of TOOL_NAMES) assert(names.includes(name), `缺少工具 ${name}`);

  const status = await call('remotion_status', {});
  assert(status.versions.consistent, 'Remotion 版本不一致');
  assert(status.tools === TOOL_NAMES.length, 'status 工具数不符');

  const project = await call('remotion_create_project', {
    template: 'blank',
    spec: {width: 640, height: 360, fps: 30, durationInFrames: 30},
    sourceDir: null,
  });
  assert(project.jobId && fs.existsSync(project.entryPoint), 'create_project 未生成入口');

  const written = await call('remotion_write_files', {
    jobId: project.jobId,
    files: [{path: 'src/note.txt', content: 'selftest'}],
  });
  assert(written.written.length === 1, 'write_files 失败');

  const read = await call('remotion_read_files', {jobId: project.jobId, paths: ['src/note.txt']});
  assert(read.files[0]?.content === 'selftest', 'read_files 内容不符');

  const assets = await call('remotion_put_assets', {
    jobId: project.jobId,
    assets: [{name: 'pixel.png', base64: 'aGVsbG8='}],
  });
  assert(assets.assets[0].staticFileRef === 'staticFile("pixel.png")', 'put_assets 失败');

  const validated = await call('remotion_validate', {jobId: project.jobId, typecheck: false});
  assert(validated.ok === true, 'validate 未通过');

  const target = path.join(OUT, 'selftest-export');
  const exported = await call('remotion_export_source', {jobId: project.jobId, targetDir: target});
  assert(exported.exported.includes('src') && !exported.dependenciesCopied, 'export_source 失败');

  const cleanup = await call('remotion_cleanup', {keepLast: 10});
  assert(Array.isArray(cleanup.removedJobs), 'cleanup 失败');

  if (process.argv.includes('--full')) {
    const compositions = await call('remotion_list_compositions', {jobId: project.jobId});
    assert(Array.isArray(compositions) && compositions.some((c) => c.id === 'Blank'), 'list_compositions 未返回 Blank');
    const still = await call('remotion_render_still', {jobId: project.jobId, compositionId: 'Blank', frame: 0, outputPath: null});
    assert(still.bytes > 0, 'render_still 未产出文件');
    const video = await call('remotion_render_video', {
      jobId: project.jobId,
      compositionId: 'Blank',
      outputPath: null,
      frameRange: [0, 29],
      codec: 'h264',
      wait: true,
    });
    assert(video.bytes > 0, 'render_video 未产出文件');
  }

  console.log(`自检通过：${names.length} 个工具、版本一致、项目/读写/素材/校验/导出/清理链路正常${process.argv.includes('--full') ? '，并已完成真实单帧与视频渲染' : ''}`);
} catch (err) {
  console.error('自检失败：', err.message);
  process.exitCode = 1;
} finally {
  child.kill();
}
