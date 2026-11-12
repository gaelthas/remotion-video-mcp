import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {
  ROOT, STATE, BUNDLES, OUT, ensureDirs, newJobId, jobDir, paramFile,
  resultFile, logFile, cancelFlag, removeDirRecursive, dirSize,
} from './paths.mjs';
import {AppError} from './errors.mjs';
import {getConfig} from './config.mjs';

const stateFile = path.join(STATE, 'jobs.json');
const locksDir = path.join(STATE, 'locks');
const slotsDir = path.join(STATE, 'slots');
const RENDER_KINDS = new Set(['still', 'video', 'batch', 'compositions', 'smoke']);
const TERMINAL = new Set(['done', 'failed', 'cancelled']);
const children = new Map();

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.max(1, ms));
}

function lockPath(name) {
  return path.join(locksDir, `${name.replace(/[^a-zA-Z0-9_-]/g, '_')}.lock`);
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function tryLock(name) {
  ensureDirs();
  const file = lockPath(name);
  const token = crypto.randomUUID();
  try {
    const handle = fs.openSync(file, 'wx');
    fs.writeSync(handle, JSON.stringify({pid: process.pid, at: Date.now(), token}));
    fs.closeSync(handle);
    return {file, token};
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    try {
      const info = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!pidAlive(info.pid) || Date.now() - info.at > 15000) fs.unlinkSync(file);
    } catch {
      try {
        fs.unlinkSync(file);
      } catch {
        // another process released it
      }
    }
    return null;
  }
}

function unlock(lock) {
  if (!lock) return;
  try {
    const info = JSON.parse(fs.readFileSync(lock.file, 'utf8'));
    if (info.token === lock.token) fs.unlinkSync(lock.file);
  } catch {
    // lock file already gone or unreadable
  }
}

export function withLockSync(name, fn) {
  const deadline = Date.now() + 10000;
  let lock = null;
  while (!lock && Date.now() < deadline) {
    lock = tryLock(name);
    if (!lock) sleepSync(25);
  }
  if (!lock) throw new AppError('INTERNAL', `获取锁超时：${name}`);
  try {
    return fn();
  } finally {
    unlock(lock);
  }
}

export async function withLockAsync(name, fn) {
  const deadline = Date.now() + 20000;
  let lock = null;
  while (!lock && Date.now() < deadline) {
    lock = tryLock(name);
    if (!lock) await delay(25);
  }
  if (!lock) throw new AppError('INTERNAL', `获取锁超时：${name}`);
  try {
    return await fn();
  } finally {
    unlock(lock);
  }
}

function readStateSync() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return {jobs: {}};
  }
}

function writeStateSync(state) {
  const tmp = `${stateFile}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      fs.renameSync(tmp, stateFile);
      return;
    } catch (err) {
      if (!['EPERM', 'EBUSY', 'EACCES'].includes(err.code)) throw err;
      sleepSync(25);
    }
  }
  fs.copyFileSync(tmp, stateFile);
  try {
    fs.unlinkSync(tmp);
  } catch {
    // best effort
  }
}

export function updateJob(jobId, patch) {
  return withLockSync('state', () => {
    const state = readStateSync();
    const current = state.jobs[jobId] ?? {jobId, createdAt: Date.now()};
    state.jobs[jobId] = {...current, ...patch, jobId, updatedAt: Date.now()};
    writeStateSync(state);
    return state.jobs[jobId];
  });
}

export function getJob(jobId) {
  return readStateSync().jobs[jobId] ?? null;
}

export function registerProject(jobId, params) {
  return withLockSync('state', () => {
    const state = readStateSync();
    state.jobs[jobId] = {
      jobId,
      kind: 'project',
      state: 'ready',
      progress: 0,
      stage: 'ready',
      params,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    writeStateSync(state);
    return state.jobs[jobId];
  });
}

export function projectParams(jobId) {
  const job = getJob(jobId);
  if (!job) throw new AppError('JOB_NOT_FOUND', `找不到任务 ${jobId}`);
  return job.params ?? {};
}

export function listJobs(jobIds) {
  const state = readStateSync();
  const ids = jobIds && jobIds.length ? jobIds : Object.keys(state.jobs);
  return ids.map((id) => state.jobs[id] ?? {jobId: id, state: 'missing'});
}

export function activeJobs() {
  return Object.values(readStateSync().jobs).filter((j) => !TERMINAL.has(j.state)).length;
}

export function appendLog(jobId, text) {
  ensureDirs();
  const line = String(text).replace(/\s+$/, '');
  if (line) fs.appendFileSync(logFile(jobId), `${line}\n`);
}

export function readLog(jobId, tailLines = 80) {
  const file = logFile(jobId);
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-tailLines);
}

export function writeResult(jobId, result) {
  ensureDirs();
  fs.writeFileSync(resultFile(jobId), JSON.stringify(result, null, 2));
}

export function readResult(jobId) {
  const file = resultFile(jobId);
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function isCancelled(jobId) {
  return fs.existsSync(cancelFlag(jobId));
}

export function cancelJob(jobId) {
  ensureDirs();
  const job = getJob(jobId);
  if (!job) throw new AppError('JOB_NOT_FOUND', `找不到任务 ${jobId}`);
  if (TERMINAL.has(job.state)) return {jobId, state: job.state, note: '任务已结束'};
  fs.writeFileSync(cancelFlag(jobId), String(Date.now()));
  const entry = children.get(jobId);
  if (entry) {
    entry.child.kill();
  } else {
    updateJob(jobId, {state: 'cancelling', stage: 'cancelling'});
  }
  return {jobId, state: 'cancelling'};
}

export function clearCancelFlag(jobId) {
  try {
    fs.unlinkSync(cancelFlag(jobId));
  } catch {
    // no flag
  }
}

async function acquireSlot() {
  const cfg = getConfig();
  const count = Math.max(1, cfg.renderConcurrency);
  for (;;) {
    for (let i = 0; i < count; i++) {
      const file = path.join(slotsDir, `slot-${i}.lock`);
      try {
        const handle = fs.openSync(file, 'wx');
        fs.writeSync(handle, JSON.stringify({pid: process.pid, at: Date.now()}));
        fs.closeSync(handle);
        return file;
      } catch (err) {
        if (err.code !== 'EEXIST') throw err;
      }
      try {
        const info = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!pidAlive(info.pid) || Date.now() - info.at > 60000) fs.unlinkSync(file);
      } catch {
        // slot released between reads
      }
    }
    await delay(200);
  }
}

function releaseSlot(file) {
  if (!file) return;
  try {
    fs.unlinkSync(file);
  } catch {
    // already gone
  }
}

export async function enqueue(kind, params) {
  ensureDirs();
  const id = newJobId();
  const record = {
    jobId: id,
    kind,
    state: 'queued',
    progress: 0,
    stage: 'queued',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  withLockSync('state', () => {
    const state = readStateSync();
    state.jobs[id] = record;
    writeStateSync(state);
  });
  fs.writeFileSync(paramFile(id), JSON.stringify({id, kind, params}, null, 2));

  const slot = RENDER_KINDS.has(kind) ? await acquireSlot() : null;
  const child = spawn(process.execPath, [path.join(ROOT, 'server', 'worker.mjs'), paramFile(id)], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  children.set(id, {child, slot});
  child.stdout.on('data', (chunk) => appendLog(id, chunk.toString()));
  child.stderr.on('data', (chunk) => appendLog(id, chunk.toString()));
  child.on('exit', (code, signal) => {
    releaseSlot(slot);
    children.delete(id);
    try {
      const current = getJob(id);
      if (!current || TERMINAL.has(current.state)) return;
      if (code === 0) {
        updateJob(id, {state: 'done', progress: 1, stage: 'done'});
      } else if (isCancelled(id)) {
        updateJob(id, {state: 'cancelled', stage: 'cancelled'});
      } else {
        updateJob(id, {
          state: 'failed',
          stage: 'failed',
          error: `worker 退出 code=${code} signal=${signal ?? 'none'}`,
        });
      }
    } catch (err) {
      appendLog(id, `收尾状态写入失败：${err.message}`);
    }
  });
  return id;
}

export async function waitForJob(jobId, {timeoutMs, onProgress} = {}) {
  const cfg = getConfig();
  const deadline = Date.now() + (timeoutMs ?? cfg.jobTimeoutMs);
  let lastKey = '';
  while (Date.now() < deadline) {
    const job = getJob(jobId);
    if (!job) throw new AppError('JOB_NOT_FOUND', `找不到任务 ${jobId}`);
    if (onProgress) {
      const key = `${job.state}:${job.stage}:${Math.round((job.progress ?? 0) * 100)}`;
      if (key !== lastKey) {
        lastKey = key;
        await onProgress(job);
      }
    }
    if (TERMINAL.has(job.state)) return job;
    if (Date.now() - job.createdAt > cfg.jobTimeoutMs) {
      cancelJob(jobId);
      throw new AppError('RENDER_TIMEOUT', `任务 ${jobId} 超时`);
    }
    await delay(250);
  }
  throw new AppError('RENDER_TIMEOUT', `等待任务 ${jobId} 超时`);
}

export function cleanup({keepLast, maxCacheBytes} = {}) {
  ensureDirs();
  const cfg = getConfig();
  const keep = keepLast ?? cfg.keepLastJobs;
  const state = readStateSync();
  const ordered = Object.values(state.jobs).sort((a, b) => b.createdAt - a.createdAt);
  const removedJobs = [];
  for (const job of ordered.slice(keep)) {
    if (!TERMINAL.has(job.state)) continue;
    removeDirRecursive(jobDir(job.jobId));
    for (const file of [paramFile(job.jobId), resultFile(job.jobId), logFile(job.jobId), cancelFlag(job.jobId)]) {
      try {
        fs.unlinkSync(file);
      } catch {
        // already gone
      }
    }
    delete state.jobs[job.jobId];
    removedJobs.push(job.jobId);
  }
  writeStateSync(state);

  const limit = maxCacheBytes ?? cfg.maxCacheBytes;
  let freedBytes = 0;
  let size = dirSize(BUNDLES);
  if (size > limit) {
    const dirs = fs.readdirSync(BUNDLES, {withFileTypes: true})
      .filter((e) => e.isDirectory())
      .map((e) => ({dir: path.join(BUNDLES, e.name), at: fs.statSync(path.join(BUNDLES, e.name)).mtimeMs}))
      .sort((a, b) => a.at - b.at);
    for (const item of dirs) {
      if (size <= limit) break;
      const bytes = dirSize(item.dir);
      removeDirRecursive(item.dir);
      size -= bytes;
      freedBytes += bytes;
    }
  }
  return {removedJobs, freedBytes, cacheBytes: Math.max(0, size), outDir: OUT};
}
