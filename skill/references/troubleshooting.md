# 错误码 → 处置

| 错误码 | 含义 | 处置 |
|---|---|---|
| `VERSION_MISMATCH` | Remotion 包版本不一致 | 运行 `node scripts/upgrade-runtime.mjs <版本>`，不要在项目里改依赖 |
| `BROWSER_MISSING` | Chrome Headless Shell 缺失 | 运行 `node scripts/install.mjs`（全机只下载一次） |
| `ENTRY_INVALID` | 缺 `src/index.ts` 或未 `registerRoot` | 检查 `create_project` 产物，用 `write_files` 补入口 |
| `PATH_DENIED` | 写入越界 / 输出路径非绝对 / 素材名含路径 | 路径限制在任务目录内；输出传绝对路径 |
| `ASSET_MISSING` | 素材源不存在或 base64 为空 | 用 `remotion_put_assets` 重新放入 `public/` |
| `WEBPACK_FAILED` | 打包失败 | 先 `remotion_validate`，再 `remotion_job_log` 看完整堆栈 |
| `COMPOSITION_NOT_FOUND` | id 不存在 | `remotion_list_compositions` 查实际 id |
| `RENDER_TIMEOUT` | 超时或帧数超上限 | 缩短 `frameRange`、调大 `concurrency`，或改 `config.json` |
| `CANCELLED` | 被 `remotion_cancel_job` 取消 | 重新发起渲染 |
| `JOB_NOT_FOUND` | jobId 不存在或已被 `cleanup` 清理 | 重新 `create_project` |
| `INTERNAL` | 未分类错误 | `remotion_job_log` + `logs/<jobId>.log` |

排查顺序：`remotion_status` → `remotion_validate` → `remotion_job_log` → 本表 → 官方 `/remotion-best-practices`。

常见现象：
- 首帧缺图：多半用了原生 `<img>` 或 `staticFile` 路径带了前导斜杠。
- 中文字体被替换：字体未用 `delayRender()` 包住加载。
- 文字被切笔画：遮罩层级盖在文字之上，调整 `lib/reveal.tsx` 的层级。
- 横竖版比例失衡：尺寸没有乘 `scale`。
- 长任务无响应：`render_video` 默认异步，用 `remotion_job_status` 轮询，不要重复发起。
