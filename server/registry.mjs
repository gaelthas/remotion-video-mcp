import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {z} from 'zod';
import {
  ROOT, NODE_MODULES, TEMPLATE, SKILL, jobDir, newJobId,
  assertInside, safeAssetName, ensureDirs,
} from './paths.mjs';
import {AppError, toErrorPayload} from './errors.mjs';
import {getConfig} from './config.mjs';
import * as jm from './job-manager.mjs';

const CODECS = ['h264', 'h265', 'vp8', 'vp9', 'av1', 'mp3', 'aac', 'wav', 'prores', 'h264-mkv', 'h264-ts', 'gif'];
const studios = new Map();

const ok = (data) => ({content: [{type: 'text', text: JSON.stringify(data, null, 2)}]});
const fail = (err) => ({isError: true, content: [{type: 'text', text: JSON.stringify(toErrorPayload(err), null, 2)}]});

function versionReport() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const packages = Object.entries(pkg.dependencies)
    .filter(([name]) => name === 'remotion' || name.startsWith('@remotion/'))
    .map(([name, declared]) => {
      let installed = null;
      try {
        installed = JSON.parse(fs.readFileSync(path.join(NODE_MODULES, name, 'package.json'), 'utf8')).version;
      } catch {
        // missing
      }
      return {name, declared, installed};
    });
  return {
    consistent: packages.every((p) => p.installed === p.declared),
    packages,
  };
}

function browserState() {
  const cache = path.join(NODE_MODULES, '.remotion');
  const exists = fs.existsSync(cache);
  return {
    ready: exists && fs.readdirSync(cache).length > 0,
    path: exists ? cache : null,
  };
}

function rootTsx(template, spec, compositionId) {
  const component = template === 'stat' ? 'StatCounter' : template === 'blank' ? 'Blank' : 'DesignShowcase';
  const props = template === 'stat'
    ? 'const props = {label: "Q3 Deliverables", value: 1284, suffix: " 分钟", caption: "数字与进度条共用一个进度源。"};'
    : template === 'blank'
      ? 'const props = {title: "Remotion"};'
      : 'const props = {imageSrc: undefined, eyebrow: "Design to Motion", title: "把设计稿变成动效视频", subtitle: "换掉 imageSrc 和文案。"};';
  return [
    'import React from "react";',
    'import {Composition} from "remotion";',
    `import {${component}} from "./scenes/${component}";`,
    '',
    props,
    '',
    'export const RemotionRoot: React.FC = () => (',
    '  <Composition',
    `    id="${compositionId}"`,
    `    component={${component}}`,
    `    durationInFrames={${spec.durationInFrames}}`,
    `    fps={${spec.fps}}`,
    `    width={${spec.width}}`,
    `    height={${spec.height}}`,
    '    defaultProps={props}',
    '  />',
    ');',
    '',
  ].join('\n');
}

const BLANK_SCENE = [
  'import React from "react";',
  'import {AbsoluteFill, interpolate, useCurrentFrame} from "remotion";',
  '',
  'export const Blank: React.FC<{title?: string}> = ({title = "Remotion"}) => {',
  '  const frame = useCurrentFrame();',
  '  const opacity = interpolate(frame, [0, 20], [0, 1], {',
  '    extrapolateLeft: "clamp",',
  '    extrapolateRight: "clamp",',
  '  });',
  '  return (',
  '    <AbsoluteFill style={{backgroundColor: "#0b1020", color: "white", alignItems: "center", justifyContent: "center", fontSize: 96, opacity}}>',
  '      {title}',
  '    </AbsoluteFill>',
  '  );',
  '};',
  '',
].join('\n');

function projectParams(jobId, extra = {}) {
  const params = jm.projectParams(jobId);
  return {sourceDir: params.sourceDir, ...extra};
}

async function notifyProgress(extra, job) {
  const token = extra?._meta?.progressToken;
  if (!token || !extra?.sendNotification) return;
  try {
    await extra.sendNotification({
      method: 'notifications/progress',
      params: {
        progressToken: token,
        progress: Math.max(0, Math.min(1, job.progress ?? 0)),
        total: 1,
        message: job.stage ?? '',
      },
    });
  } catch {
    // client disconnected
  }
}

async function collect(jobId, extra) {
  const final = await jm.waitForJob(jobId, {onProgress: (job) => notifyProgress(extra, job)});
  const result = jm.readResult(jobId);
  if (final.state !== 'done' || !result?.ok) {
    const err = result?.error;
    if (err) throw new AppError(err.code, err.message, err.hint);
    throw new AppError('INTERNAL', final.error ?? `任务 ${jobId} 未成功完成`);
  }
  return result.result;
}

async function runSync(kind, params, extra) {
  const id = await jm.enqueue(kind, params);
  return await collect(id, extra);
}

export const TOOL_NAMES = [
  'remotion_status', 'remotion_create_project', 'remotion_write_files',
  'remotion_read_files', 'remotion_put_assets', 'remotion_validate',
  'remotion_list_compositions', 'remotion_render_still', 'remotion_render_video',
  'remotion_render_batch', 'remotion_job_status', 'remotion_job_log',
  'remotion_cancel_job', 'remotion_open_studio', 'remotion_close_studio',
  'remotion_export_source', 'remotion_cleanup',
];

export function createMcpServer() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const server = new McpServer(
    {name: 'remotion-video-mcp', version: pkg.version},
    {capabilities: {tools: {}}},
  );
  const define = (name, description, shape, handler) => {
    server.registerTool(name, {description, inputSchema: shape}, async (args, extra) => {
      try {
        return ok(await handler(args, extra));
      } catch (err) {
        return fail(err);
      }
    });
  };

  define('remotion_status', '检查唯一运行时的版本一致性、浏览器缓存、活跃任务与可用传输。出片前必须先调用。', {}, async () => {
    ensureDirs();
    const {httpToken, ...publicConfig} = getConfig();
    return {
      runtimeRoot: ROOT,
      nodeVersion: process.version,
      versions: versionReport(),
      browser: browserState(),
      activeJobs: jm.activeJobs(),
      tools: TOOL_NAMES.length,
      transports: ['stdio', 'http'],
      skillPath: SKILL,
      config: {...publicConfig, httpToken: httpToken ? '***' : null},
      note: 'GitHub 同步上游源码不会改变运行时版本；升级请运行 node scripts/upgrade-runtime.mjs <版本>。',
    };
  });

  define('remotion_create_project', '创建视频任务目录：只写入 TSX 源码与 public/ 素材目录，不安装任何依赖。sourceDir 可为外部项目路径。', {
    name: z.string().optional(),
    template: z.enum(['blank', 'design', 'stat']).default('design'),
    spec: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      fps: z.number().int().positive(),
      durationInFrames: z.number().int().positive(),
    }).optional(),
    sourceDir: z.string().nullable().default(null),
    overwrite: z.boolean().default(false),
  }, async (args) => {
    ensureDirs();
    const jobId = newJobId();
    const root = args.sourceDir ? path.resolve(args.sourceDir) : jobDir(jobId);
    const existing = path.join(root, 'src', 'index.ts');
    if (fs.existsSync(existing) && !args.overwrite) {
      throw new AppError('PATH_DENIED', `${existing} 已存在；需要覆盖请传 overwrite=true`);
    }
    fs.mkdirSync(root, {recursive: true});
    fs.cpSync(path.join(TEMPLATE, 'src'), path.join(root, 'src'), {recursive: true, force: true});
    fs.cpSync(path.join(TEMPLATE, 'public'), path.join(root, 'public'), {recursive: true, force: true});
    const spec = args.spec ?? {width: 1920, height: 1080, fps: 30, durationInFrames: 180};
    const compositionId = args.template === 'stat' ? 'StatCounter' : args.template === 'blank' ? 'Blank' : 'DesignShowcase';
    if (args.template === 'blank') {
      fs.writeFileSync(path.join(root, 'src', 'scenes', 'Blank.tsx'), BLANK_SCENE);
    }
    fs.writeFileSync(path.join(root, 'src', 'Root.tsx'), rootTsx(args.template, spec, compositionId));
    fs.writeFileSync(path.join(root, 'src', 'spec.json'), JSON.stringify({...spec, template: args.template}, null, 2));
    jm.registerProject(jobId, {sourceDir: root, template: args.template, spec});
    return {
      jobId,
      sourceDir: root,
      entryPoint: path.join(root, 'src', 'index.ts'),
      publicDir: path.join(root, 'public'),
      compositionId,
      files: fs.readdirSync(path.join(root, 'src')),
      note: '该目录不含 package.json / node_modules；依赖统一由运行时根目录提供。',
    };
  });

  define('remotion_write_files', '批量写入任务源码文件，路径必须位于任务目录内。', {
    jobId: z.string(),
    files: z.array(z.object({path: z.string(), content: z.string()})),
    mode: z.enum(['overwrite', 'create']).default('overwrite'),
  }, async (args) => {
    const root = jm.projectParams(args.jobId).sourceDir;
    const written = [];
    const skipped = [];
    for (const file of args.files) {
      const target = assertInside(root, path.resolve(root, file.path), '写入路径');
      if (args.mode === 'create' && fs.existsSync(target)) {
        skipped.push(file.path);
        continue;
      }
      fs.mkdirSync(path.dirname(target), {recursive: true});
      fs.writeFileSync(target, file.content);
      written.push(file.path);
    }
    return {written, skipped, root};
  });

  define('remotion_read_files', '回读任务源码，用于校验写入结果。', {
    jobId: z.string(),
    paths: z.array(z.string()),
  }, async (args) => {
    const root = jm.projectParams(args.jobId).sourceDir;
    const files = [];
    const missing = [];
    for (const rel of args.paths) {
      const target = assertInside(root, path.resolve(root, rel), '读取路径');
      if (!fs.existsSync(target)) {
        missing.push(rel);
      } else {
        files.push({path: rel, content: fs.readFileSync(target, 'utf8')});
      }
    }
    return {files, missing};
  });

  define('remotion_put_assets', '把本机文件或 base64 内容放入任务 public/，返回 staticFile() 引用写法。', {
    jobId: z.string(),
    assets: z.array(z.object({
      name: z.string(),
      path: z.string().optional(),
      base64: z.string().optional(),
      mime: z.string().optional(),
    })),
    overwrite: z.boolean().default(true),
  }, async (args) => {
    const root = jm.projectParams(args.jobId).sourceDir;
    const publicDir = path.join(root, 'public');
    fs.mkdirSync(publicDir, {recursive: true});
    const out = [];
    for (const asset of args.assets) {
      const name = safeAssetName(asset.name);
      const target = assertInside(publicDir, path.join(publicDir, name), '素材路径');
      if (fs.existsSync(target) && !args.overwrite) {
        out.push({name, skipped: true, staticFileRef: `staticFile("${name}")`});
        continue;
      }
      if (asset.path && fs.existsSync(asset.path)) {
        fs.copyFileSync(asset.path, target);
      } else if (asset.base64) {
        fs.writeFileSync(target, Buffer.from(asset.base64, 'base64'));
      } else {
        throw new AppError('ASSET_MISSING', `素材 ${name} 既没有可用的 path，也没有 base64`);
      }
      out.push({name, bytes: fs.statSync(target).size, staticFileRef: `staticFile("${name}")`});
    }
    return {assets: out, publicDir};
  });

  define('remotion_validate', '校验入口、Remotion 版本一致性，并用运行时 TypeScript 做类型检查。', {
    jobId: z.string(),
    typecheck: z.boolean().default(true),
  }, async (args, extra) => await runSync('validate', projectParams(args.jobId, {typecheck: args.typecheck}), extra));

  define('remotion_list_compositions', '打包后列出所有可渲染 composition 的 id 与规格。', {
    jobId: z.string(),
    props: z.record(z.string(), z.unknown()).optional(),
  }, async (args, extra) => await runSync('compositions', projectParams(args.jobId, {props: args.props}), extra));

  define('remotion_render_still', '渲染单帧 PNG，用于入场中段/稳定帧/尾帧校对。同步返回结果。', {
    jobId: z.string(),
    compositionId: z.string(),
    frame: z.number().int().nonnegative(),
    outputPath: z.string().nullable().default(null),
    props: z.record(z.string(), z.unknown()).optional(),
    scale: z.number().positive().optional(),
    imageFormat: z.enum(['png', 'jpeg']).optional(),
  }, async (args, extra) => await runSync('still', projectParams(args.jobId, {
    compositionId: args.compositionId,
    frame: args.frame,
    outputPath: args.outputPath,
    props: args.props,
    scale: args.scale,
    imageFormat: args.imageFormat,
  }), extra));

  define('remotion_render_video', '渲染 MP4/GIF/ProRes 或 PNG 序列。默认异步返回 jobId；wait=true 时阻塞到完成并发进度通知。', {
    jobId: z.string(),
    compositionId: z.string(),
    outputPath: z.string().nullable().default(null),
    props: z.record(z.string(), z.unknown()).optional(),
    codec: z.enum(CODECS).optional(),
    crf: z.number().optional(),
    scale: z.number().positive().optional(),
    concurrency: z.number().int().positive().optional(),
    everyNthFrame: z.number().int().positive().optional(),
    sequence: z.boolean().default(false),
    frameRange: z.tuple([z.number().int(), z.number().int()]).optional(),
    imageFormat: z.enum(['jpeg', 'png']).optional(),
    wait: z.boolean().default(false),
  }, async (args, extra) => {
    const id = await jm.enqueue('video', projectParams(args.jobId, {
      compositionId: args.compositionId,
      outputPath: args.outputPath,
      props: args.props,
      codec: args.codec,
      crf: args.crf,
      scale: args.scale,
      concurrency: args.concurrency,
      everyNthFrame: args.everyNthFrame,
      sequence: args.sequence,
      frameRange: args.frameRange,
      imageFormat: args.imageFormat,
    }));
    if (args.wait) return await collect(id, extra);
    return {jobId: id, queued: true, hint: '用 remotion_job_status 轮询，或 remotion_job_log 查日志'};
  });

  define('remotion_render_batch', '参数化批量出片，共用一次打包结果。', {
    jobId: z.string(),
    items: z.array(z.object({
      compositionId: z.string(),
      outputPath: z.string().nullable(),
      props: z.record(z.string(), z.unknown()).optional(),
    })),
    codec: z.enum(CODECS).optional(),
    concurrency: z.number().int().positive().optional(),
    wait: z.boolean().default(false),
  }, async (args, extra) => {
    const id = await jm.enqueue('batch', projectParams(args.jobId, {
      items: args.items,
      codec: args.codec,
      concurrency: args.concurrency,
    }));
    if (args.wait) return await collect(id, extra);
    return {jobId: id, queued: true, count: args.items.length};
  });

  define('remotion_job_status', '查询一个或多个任务的状态、阶段与进度。', {
    jobIds: z.array(z.string()).optional(),
  }, async (args) => ({jobs: jm.listJobs(args.jobIds)}));

  define('remotion_job_log', '读取任务日志尾部，配合 troubleshooting.md 排障。', {
    jobId: z.string(),
    tailLines: z.number().int().positive().default(80),
  }, async (args) => ({jobId: args.jobId, lines: jm.readLog(args.jobId, args.tailLines)}));

  define('remotion_cancel_job', '取消排队或运行中的任务。', {
    jobId: z.string(),
  }, async (args) => jm.cancelJob(args.jobId));

  define('remotion_open_studio', '从唯一运行时启动 Studio 供人工预览，绑定回环地址。', {
    jobId: z.string(),
    port: z.number().int().positive().optional(),
  }, async (args) => {
    const root = jm.projectParams(args.jobId).sourceDir;
    const port = args.port ?? 3000;
    const cli = path.join(NODE_MODULES, '@remotion', 'cli', 'remotion-cli.js');
    const child = spawn(process.execPath, [
      cli, 'studio', path.join(root, 'src', 'index.ts'),
      '--port', String(port),
      '--public-dir', path.join(root, 'public'),
    ], {cwd: ROOT, detached: true, stdio: 'ignore', windowsHide: true});
    child.unref();
    studios.set(child.pid, child);
    return {pid: child.pid, url: `http://127.0.0.1:${port}`, jobId: args.jobId};
  });

  define('remotion_close_studio', '关闭由 remotion_open_studio 启动的 Studio。', {
    pid: z.number().int(),
  }, async (args) => {
    const child = studios.get(args.pid);
    try {
      if (child) child.kill();
      else process.kill(args.pid);
    } catch {
      return {pid: args.pid, closed: false, note: '进程已不存在'};
    }
    studios.delete(args.pid);
    return {pid: args.pid, closed: true};
  });

  define('remotion_export_source', '把任务源码与素材导出到指定目录纳入版本管理；默认不复制依赖。', {
    jobId: z.string(),
    targetDir: z.string(),
    includeDependencies: z.boolean().default(false),
  }, async (args) => {
    if (!path.isAbsolute(args.targetDir)) {
      throw new AppError('PATH_DENIED', 'targetDir 必须是绝对路径');
    }
    const root = jm.projectParams(args.jobId).sourceDir;
    fs.mkdirSync(args.targetDir, {recursive: true});
    const exported = [];
    for (const folder of ['src', 'public']) {
      const from = path.join(root, folder);
      if (!fs.existsSync(from)) continue;
      fs.cpSync(from, path.join(args.targetDir, folder), {recursive: true, force: true});
      exported.push(folder);
    }
    return {
      targetDir: args.targetDir,
      exported,
      dependenciesCopied: false,
      note: args.includeDependencies
        ? '为保证全机只有一套依赖，node_modules 不会复制；目标目录可用本机运行时渲染。'
        : '目标目录不含依赖，仍由本运行时提供 Remotion。',
    };
  });

  define('remotion_cleanup', '按 LRU 清理历史任务与打包缓存。', {
    keepLast: z.number().int().nonnegative().optional(),
    maxCacheBytes: z.number().int().nonnegative().optional(),
  }, async (args) => jm.cleanup({keepLast: args.keepLast, maxCacheBytes: args.maxCacheBytes}));

  return server;
}
