import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {AppError} from './errors.mjs';

export const ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
export const NODE_MODULES = path.join(ROOT, 'node_modules');
export const TEMPLATE = path.join(ROOT, 'template');
export const SKILL = path.join(ROOT, 'skill');
export const WORKSPACES = path.join(ROOT, 'workspaces');
export const STATE = path.join(ROOT, 'state');
export const CACHE = path.join(ROOT, 'cache');
export const BUNDLES = path.join(CACHE, 'bundles');
export const OUT = path.join(ROOT, 'out');
export const LOGS = path.join(ROOT, 'logs');

const RUNTIME_DIRS = [
  WORKSPACES, STATE, path.join(STATE, 'jobs'), path.join(STATE, 'results'),
  path.join(STATE, 'locks'), path.join(STATE, 'slots'), path.join(STATE, 'cancel'),
  BUNDLES, OUT, LOGS,
];

export function ensureDirs() {
  for (const dir of RUNTIME_DIRS) {
    fs.mkdirSync(dir, {recursive: true});
  }
}

export function isInside(parent, child) {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export function assertInside(parent, child, label = '路径') {
  if (!isInside(parent, child)) {
    throw new AppError('PATH_DENIED', `${label}越出允许范围：${child}`);
  }
  return path.resolve(child);
}

export function safeAssetName(name) {
  const base = path.basename(String(name));
  if (!base || base !== String(name) || base === '.' || base === '..') {
    throw new AppError('PATH_DENIED', `素材名不能包含路径分隔符：${name}`);
  }
  return base;
}

const cryptoRandom = () => Math.random().toString(36).slice(2, 8);

export function newJobId() {
  const stamp = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
  return `${stamp}-${cryptoRandom()}`;
}

export function jobDir(jobId) {
  return path.join(WORKSPACES, jobId);
}

export function resolveJobRoot(jobId, params) {
  return params && params.sourceDir ? path.resolve(params.sourceDir) : jobDir(jobId);
}

export function paramFile(jobId) {
  return path.join(STATE, 'jobs', `${jobId}.json`);
}

export function resultFile(jobId) {
  return path.join(STATE, 'results', `${jobId}.json`);
}

export function logFile(jobId) {
  return path.join(LOGS, `${jobId}.log`);
}

export function cancelFlag(jobId) {
  return path.join(STATE, 'cancel', jobId);
}

export function absoluteOutput(jobId, requested, defaultName) {
  if (!requested) {
    const dir = path.join(OUT, jobId);
    fs.mkdirSync(dir, {recursive: true});
    return path.join(dir, defaultName);
  }
  if (!path.isAbsolute(requested)) {
    throw new AppError('PATH_DENIED', `输出路径必须是绝对路径：${requested}`);
  }
  const abs = path.normalize(requested);
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  return abs;
}

export function removeDirRecursive(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      removeDirRecursive(target);
    } else {
      fs.unlinkSync(target);
    }
  }
  fs.rmdirSync(dir);
}

export function dirSize(dir) {
  if (!fs.existsSync(dir)) return 0;
  let total = 0;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const target = path.join(dir, entry.name);
    total += entry.isDirectory() ? dirSize(target) : fs.statSync(target).size;
  }
  return total;
}
