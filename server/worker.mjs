import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {
  ensureBrowser, getCompositions, makeCancelSignal, renderMedia,
  renderStill, selectComposition,
} from '@remotion/renderer';
import {
  ROOT, NODE_MODULES, TEMPLATE, BUNDLES, WORKSPACES,
  ensureDirs, resolveJobRoot, absoluteOutput,
} from './paths.mjs';
import {AppError, toErrorPayload} from './errors.mjs';
import {getConfig} from './config.mjs';
import * as jm from './job-manager.mjs';

const paramFile = process.argv[2];
if (!paramFile) {
  console.error('缺少任务参数文件');
  process.exit(1);
}

const job = JSON.parse(fs.readFileSync(paramFile, 'utf8'));
process.chdir(ROOT);
ensureDirs();

const log = (...parts) => jm.appendLog(job.id, parts.map(String).join(' '));
let lastStage = {name: '', progress: -1};
const stage = (name, progress) => {
  const value = progress ?? 0;
  if (name === lastStage.name && Math.abs(value - lastStage.progress) < 0.01) return;
  lastStage = {name, progress: value};
  try {
    jm.updateJob(job.id, {state: 'running', stage: name, progress: value});
  } catch (err) {
    log(`状态写入失败（不影响渲染）：${err.message}`);
  }
};
const checkCancel = () => {
  if (jm.isCancelled(job.id)) throw new AppError('CANCELLED', `任务 ${job.id} 已取消`);
};

function hashSources(root) {
  const hash = crypto.createHash('sha256');
  for (const folder of ['src', 'public']) {
    const base = path.join(root, folder);
    if (!fs.existsSync(base)) continue;
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name))) {
        const target = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(target);
        } else if (entry.isFile()) {
          hash.update(path.relative(root, target));
          hash.update(fs.readFileSync(target));
        }
      }
    };
    walk(base);
  }
  return hash.digest('hex');
}

async function ensureBrowserReady() {
  const status = await ensureBrowser();
  log(`browser=${status.type}${status.path ? ` ${status.path}` : ''}`);
  if (status.type === 'no-browser') {
    throw new AppError('BROWSER_MISSING', 'Chrome Headless Shell 不可用');
  }
  return status;
}

async function getServeUrl() {
  const root = resolveJobRoot(job.id, job.params);
  const entry = path.join(root, 'src', 'index.ts');
  const publicDir = path.join(root, 'public');
  if (!fs.existsSync(entry)) {
    throw new AppError('ENTRY_INVALID', `缺少入口文件：${entry}`);
  }
  const entryContent = fs.readFileSync(entry, 'utf8');
  if (!entryContent.includes('registerRoot')) {
    throw new AppError('ENTRY_INVALID', `${entry} 未调用 registerRoot()`);
  }
  fs.mkdirSync(publicDir, {recursive: true});

  const hash = hashSources(root);
  const outDir = path.join(BUNDLES, hash.slice(0, 20));
  if (fs.existsSync(path.join(outDir, 'index.html'))) {
    log(`bundle cache hit ${hash.slice(0, 12)}`);
    return outDir;
  }

  await jm.withLockAsync(`bundle-${hash.slice(0, 12)}`, async () => {
    if (fs.existsSync(path.join(outDir, 'index.html'))) return;
    checkCancel();
    stage('bundling', 0.02);
    log(`bundling ${entry} -> ${outDir}`);
    fs.mkdirSync(outDir, {recursive: true});
    await bundle({
      entryPoint: entry,
      rootDir: ROOT,
      publicDir,
      outDir,
      enableCaching: false,
      onProgress: (percent) => stage('bundling', 0.02 + Math.min(0.18, (percent / 100) * 0.18)),
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...(config.resolve ?? {}),
          modules: ['node_modules', NODE_MODULES],
        },
      }),
    });
  });
  return outDir;
}

async function pickComposition(serveUrl, id, props) {
  await ensureBrowserReady();
  try {
    return await selectComposition({serveUrl, id, inputProps: props ?? {}});
  } catch (err) {
    if (/No composition|not found/i.test(err.message ?? '')) {
      throw new AppError('COMPOSITION_NOT_FOUND', `找不到 composition：${id}`);
    }
    throw err;
  }
}

function assertFrameBudget(composition, frameRange, everyNthFrame) {
  const max = getConfig().maxFrames;
  const [start, end] = frameRange ?? [0, composition.durationInFrames - 1];
  const frames = Math.ceil((end - start + 1) / Math.max(1, everyNthFrame ?? 1));
  if (frames > max) {
    throw new AppError('RENDER_TIMEOUT', `请求 ${frames} 帧，超过上限 ${max}`);
  }
  return {start, end, frames};
}

async function renderOne({serveUrl, compositionId, outputPath, props, options, progressBase, progressSpan}) {
  const composition = await pickComposition(serveUrl, compositionId, props);
  const budget = assertFrameBudget(composition, options.frameRange, options.everyNthFrame);
  const outputLocation = absoluteOutput(job.id, outputPath, `${compositionId}.${options.sequence ? 'png' : (options.codec ?? 'h264') === 'gif' ? 'gif' : 'mp4'}`);
  checkCancel();

  if (options.sequence) {
    fs.mkdirSync(outputLocation, {recursive: true});
    for (let frame = budget.start; frame <= budget.end; frame += Math.max(1, options.everyNthFrame ?? 1)) {
      checkCancel();
      const file = path.join(outputLocation, `frame-${String(frame).padStart(5, '0')}.png`);
      await renderStill({
        composition,
        serveUrl,
        output: file,
        frame,
        inputProps: props ?? {},
        imageFormat: 'png',
        overwrite: true,
        scale: options.scale ?? 1,
      });
      const ratio = (frame - budget.start + 1) / Math.max(1, budget.frames);
      stage('rendering', progressBase + progressSpan * ratio);
    }
    return {outputPath: outputLocation, sequence: true, frames: budget.frames, codec: 'png'};
  }

  const {cancelSignal, cancel} = makeCancelSignal();
  const watcher = setInterval(() => {
    if (jm.isCancelled(job.id)) cancel();
  }, 300);
  try {
    await renderMedia({
      composition,
      serveUrl,
      codec: options.codec ?? 'h264',
      outputLocation,
      inputProps: props ?? {},
      crf: options.crf ?? 18,
      imageFormat: options.imageFormat ?? 'jpeg',
      frameRange: options.frameRange ?? null,
      everyNthFrame: options.everyNthFrame ?? 1,
      concurrency: options.concurrency ?? null,
      scale: options.scale ?? 1,
      overwrite: true,
      cancelSignal,
      onProgress: ({progress}) => {
        checkCancel();
        stage('rendering', progressBase + progressSpan * Math.min(1, Math.max(0, progress)));
      },
    });
  } finally {
    clearInterval(watcher);
  }
  const bytes = fs.existsSync(outputLocation) ? fs.statSync(outputLocation).size : 0;
  return {
    outputPath: outputLocation,
    bytes,
    codec: options.codec ?? 'h264',
    width: composition.width,
    height: composition.height,
    fps: composition.fps,
    durationInFrames: budget.frames,
    warning: bytes > getConfig().maxOutputBytes ? '输出体积超过 config.json 的 maxOutputBytes' : null,
  };
}

function typecheck(root) {
  const tsconfig = {
    extends: path.join(ROOT, 'tsconfig.base.json'),
    compilerOptions: {
      baseUrl: root,
      paths: {'*': [path.join(NODE_MODULES, '*')]},
    },
    include: ['src/**/*'],
  };
  const file = path.join(root, 'tsconfig.json');
  fs.writeFileSync(file, JSON.stringify(tsconfig, null, 2));
  const tsc = path.join(NODE_MODULES, 'typescript', 'bin', 'tsc');
  const result = spawnSync(process.execPath, [tsc, '--project', file], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
  return {ok: result.status === 0, diagnostics: output ? output.split('\n').slice(0, 60) : []};
}

function versionReport() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const deps = Object.entries(pkg.dependencies)
    .filter(([name]) => name === 'remotion' || name.startsWith('@remotion/'))
    .map(([name, declared]) => {
      let installed = null;
      try {
        installed = JSON.parse(fs.readFileSync(path.join(NODE_MODULES, name, 'package.json'), 'utf8')).version;
      } catch {
        // missing package
      }
      return {name, declared, installed};
    });
  const versions = new Set(deps.map((d) => d.installed));
  return {consistent: versions.size === 1 && deps.every((d) => d.installed === d.declared), packages: deps};
}

async function runValidate() {
  const root = resolveJobRoot(job.id, job.params);
  const entry = path.join(root, 'src', 'index.ts');
  if (!fs.existsSync(entry) || !fs.readFileSync(entry, 'utf8').includes('registerRoot')) {
    throw new AppError('ENTRY_INVALID', `${entry} 缺失或未调用 registerRoot()`);
  }
  const versions = versionReport();
  if (!versions.consistent) {
    throw new AppError('VERSION_MISMATCH', `Remotion 包版本不一致：${JSON.stringify(versions.packages)}`);
  }
  const check = job.params.typecheck === false ? {ok: true, diagnostics: []} : typecheck(root);
  return {ok: check.ok && versions.consistent, versions, diagnostics: check.diagnostics};
}

async function runCompositions() {
  const serveUrl = await getServeUrl();
  await ensureBrowserReady();
  const compositions = await getCompositions({serveUrl, inputProps: {}});
  return compositions.map((c) => ({
    id: c.id,
    width: c.width,
    height: c.height,
    fps: c.fps,
    durationInFrames: c.durationInFrames,
    defaultProps: c.defaultProps ?? null,
  }));
}

async function runStill() {
  const serveUrl = await getServeUrl();
  const composition = await pickComposition(serveUrl, job.params.compositionId, job.params.props);
  const output = absoluteOutput(job.id, job.params.outputPath, `frame-${job.params.frame ?? 0}.png`);
  await renderStill({
    composition,
    serveUrl,
    output,
    frame: job.params.frame ?? 0,
    inputProps: job.params.props ?? {},
    imageFormat: job.params.imageFormat ?? 'png',
    overwrite: true,
    scale: job.params.scale ?? 1,
  });
  return {
    outputPath: output,
    bytes: fs.statSync(output).size,
    frame: job.params.frame ?? 0,
    width: composition.width,
    height: composition.height,
  };
}

async function runVideo() {
  const serveUrl = await getServeUrl();
  const result = await renderOne({
    serveUrl,
    compositionId: job.params.compositionId,
    outputPath: job.params.outputPath,
    props: job.params.props,
    options: job.params,
    progressBase: 0.2,
    progressSpan: 0.8,
  });
  return result;
}

async function runBatch() {
  const serveUrl = await getServeUrl();
  const results = [];
  const items = job.params.items ?? [];
  for (let i = 0; i < items.length; i++) {
    checkCancel();
    const item = items[i];
    results.push(await renderOne({
      serveUrl,
      compositionId: item.compositionId,
      outputPath: item.outputPath,
      props: item.props ?? {},
      options: {...job.params, ...item},
      progressBase: (i / Math.max(1, items.length)) * 0.8 + 0.2,
      progressSpan: (1 / Math.max(1, items.length)) * 0.8,
    }));
  }
  return {results, count: results.length};
}

async function runSmoke() {
  const smokeDir = path.join(WORKSPACES, `smoke-${job.id}`);
  fs.mkdirSync(smokeDir, {recursive: true});
  fs.cpSync(path.join(TEMPLATE, 'src'), path.join(smokeDir, 'src'), {recursive: true});
  fs.mkdirSync(path.join(smokeDir, 'public'), {recursive: true});
  job.params.sourceDir = smokeDir;

  const serveUrl = await getServeUrl();
  const composition = await pickComposition(serveUrl, 'StatCounter', {});
  const still = absoluteOutput(job.id, null, 'smoke.png');
  await renderStill({composition, serveUrl, output: still, frame: 0, inputProps: {}, overwrite: true});
  const video = await renderOne({
    serveUrl,
    compositionId: 'StatCounter',
    outputPath: null,
    props: {},
    options: {codec: 'h264', frameRange: [0, 29], crf: 23},
    progressBase: 0.5,
    progressSpan: 0.5,
  });
  return {still, video, browser: 'ready', compositionId: composition.id};
}

async function main() {
  stage('starting', 0.01);
  checkCancel();
  switch (job.kind) {
    case 'validate': return await runValidate();
    case 'compositions': return await runCompositions();
    case 'still': return await runStill();
    case 'video': return await runVideo();
    case 'batch': return await runBatch();
    case 'smoke': return await runSmoke();
    default: throw new AppError('INTERNAL', `未知任务类型：${job.kind}`);
  }
}

function safeWriteResult(value) {
  try {
    jm.writeResult(job.id, value);
  } catch (err) {
    console.error(`结果写入失败：${err.message}`);
  }
}

function safeFinish(patch) {
  try {
    jm.updateJob(job.id, patch);
  } catch (err) {
    console.error(`状态写入失败：${err.message}`);
  }
}

main()
  .then((result) => {
    safeWriteResult({ok: true, result});
    safeFinish({state: 'done', progress: 1, stage: 'done'});
    log('done');
  })
  .catch((err) => {
    const payload = toErrorPayload(err);
    safeWriteResult({ok: false, error: payload});
    safeFinish({
      state: payload.code === 'CANCELLED' || jm.isCancelled(job.id) ? 'cancelled' : 'failed',
      stage: payload.code === 'CANCELLED' ? 'cancelled' : 'failed',
      error: `${payload.code}: ${payload.message}`,
    });
    log(`ERROR ${payload.code}: ${payload.message}`);
    process.exitCode = 1;
  });
