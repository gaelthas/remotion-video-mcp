import fs from 'node:fs';
import path from 'node:path';
import {ROOT} from './paths.mjs';

const DEFAULTS = {
  renderConcurrency: 2,
  jobTimeoutMs: 1800000,
  maxFrames: 108000,
  maxOutputBytes: 2147483648,
  keepLastJobs: 20,
  maxCacheBytes: 5368709120,
  httpPort: 3789,
  httpHost: '127.0.0.1',
  httpToken: null,
};

let cached = null;

export function getConfig() {
  if (cached) return cached;
  const file = path.join(ROOT, 'config.json');
  let user = {};
  if (fs.existsSync(file)) {
    try {
      user = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      throw new Error(`config.json 解析失败：${err.message}`);
    }
  }
  cached = {...DEFAULTS, ...user};
  return cached;
}

export function resetConfig() {
  cached = null;
}
