export const ERROR_HINTS = {
  VERSION_MISMATCH: 'remotion 与所有 @remotion/* 必须同版本：运行 node scripts/upgrade-runtime.mjs <版本> 后重新 npm ci。',
  BROWSER_MISSING: '渲染浏览器未就绪：运行 node scripts/install.mjs 预下载 Chrome Headless Shell（首次约 120MB，全机仅一份）。',
  ENTRY_INVALID: '任务缺少 src/index.ts，或该文件没有调用 registerRoot(RemotionRoot)。',
  PATH_DENIED: '写入路径必须位于任务目录内；素材名不能包含路径分隔符；输出路径必须是绝对路径。',
  ASSET_MISSING: '素材源文件不存在，或 base64 内容为空。用 remotion_put_assets 先把素材放进 public/。',
  WEBPACK_FAILED: '打包失败。先用 remotion_validate 查类型与入口，再看 remotion_job_log 的完整错误。',
  RENDER_TIMEOUT: '任务超时。缩小帧数、提高 concurrency，或调大 config.json 的 jobTimeoutMs。',
  CANCELLED: '任务已被取消。',
  COMPOSITION_NOT_FOUND: 'compositionId 不存在。先调用 remotion_list_compositions 确认 id。',
  JOB_NOT_FOUND: 'jobId 不存在或已被清理。用 remotion_create_project 新建任务。',
  INTERNAL: '内部错误，查 remotion_job_log 与 logs/<jobId>.log。',
};

export class AppError extends Error {
  constructor(code, message, hint = null) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.hint = hint ?? ERROR_HINTS[code] ?? null;
  }
}

export function toErrorPayload(err) {
  const app = err instanceof AppError
    ? err
    : new AppError('INTERNAL', err && err.message ? err.message : String(err));
  return {
    code: app.code,
    message: app.message,
    hint: app.hint,
    stack: app.stack ? app.stack.split('\n').slice(0, 12).join('\n') : null,
  };
}
