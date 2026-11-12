---
name: remotion-video-mcp
description: 用本机唯一一套 Remotion 运行时（remotion-video-mcp）制作视频并渲染交付。当任务涉及片头/动效展示/产品演示/短视频、设计稿或截图转视频、数据与指标动画、字幕与音画对齐、参数化或批量出片、导出 MP4/GIF/PNG 序列，或排查 Remotion 渲染报错时使用。画面由 React 代码按时间轴计算，产物是可版本管理的成片文件。
agent_created: true
---

# Remotion 视频合成（MCP 版）

## 前提

本机只安装一套运行时，路径由 MCP 服务报告。**不要在业务项目里执行 `npm install`、`npx remotion`、`npx tsc`**，也不要创建 `package.json` / `node_modules`。所有依赖、Chrome Headless Shell、TypeScript 都由运行时根目录提供。

需要"像真实拍摄的画面"时不要用本技能，那是图生视频的领域。

| 不适用 | 走哪里 |
|---|---|
| 出 UI 稿、组件、设计系统 | 画布设计 |
| AI 生成写实视频/图片 | 图生视频 |
| 剪辑已有实拍素材、加转场 | 剪辑软件 |

## 工作流（按顺序调用工具）

1. `remotion_status` — 必做。确认 `versions.consistent=true`、`browser.ready=true`。浏览器未就绪时让用户运行 `node scripts/install.mjs`，不要自己在项目里装浏览器。
2. 先定规格再动手：尺寸（1920×1080 / 1080×1920 / 1080×1080）、时长、fps（默认 30）、交付格式。
3. `remotion_create_project` — 传 `spec` 与 `template`（`design` / `stat` / `blank`）。源码默认落在运行时 `workspaces/<jobId>/`；用户要求把源码放进自己项目时传绝对 `sourceDir`。返回 `jobId`，后续所有工具都用它。
4. `remotion_write_files` 写场景、`remotion_put_assets` 把素材放进 `public/`，用返回的 `staticFile("name")` 引用。
5. `remotion_validate` — 校验入口、版本一致性和类型；失败先修再渲染。
6. `remotion_list_compositions` — 确认 id、尺寸、fps、帧数。
7. `remotion_render_still` 抽 4 帧校对：0、入场中段、稳定帧、尾帧。必须看图片：素材是否加载、字体是否被替换、文字有没有被遮罩切到笔画、对比度、贴边溢出。
8. `remotion_render_video`（或 `remotion_render_batch` 批量）。默认异步返回 `jobId`，用 `remotion_job_status` 轮询；需要一次性等待时传 `wait=true`。
9. 交付：报文件路径、规格（尺寸/fps/时长/编码）、改哪几个文件能换内容。需要纳入 git 时用 `remotion_export_source`（不含依赖）。

需要人工交互预览：`remotion_open_studio` / `remotion_close_studio`。排障：`remotion_job_log` + `skill/references/troubleshooting.md`。清理历史任务与缓存：`remotion_cleanup`。

## 任务路由

| 类型 | 典型说法 | 起点 | 参考 |
|---|---|---|---|
| A 素材驱动 | 设计稿/截图做片头、产品展示 | `scenes/DesignShowcase.tsx` | `references/design-to-motion.md` |
| B 数据/文案驱动 | 指标动画、季度数据、一次出十条 | `scenes/StatCounter.tsx` | `references/parametric-batch.md` |
| C 纯图形/文字动效 | 片头字、LOGO 演绎 | `blank` 模板 + `lib/motion.ts` | `references/api-cheatsheet.md` |
| D 只问不建 | API 怎么写、报错怎么修 | 不建工程 | `references/api-cheatsheet.md` |

A 与 B 可用 `<Series>` 串接，每个场景独立校对。

## 硬性规则

- `remotion` 与所有 `@remotion/*` 版本必须完全一致；由运行时保证，不要在项目里改版本。
- 素材放 `public/`，用 `staticFile("a.png")` 引用，路径不加前导斜杠，不要 `import` 图片。
- 图片必须用 `<Img>`，原生 `<img>` 不参与帧同步。
- 自定义字体用 `delayRender()` + `continueRender()` 包住加载。
- `interpolate` 必须显式写 `extrapolateLeft/Right: "clamp"`。
- 图上有文字必须有遮罩渐变。
- 中文单行不超过 24 字，手动 `\n` 断行。
- 依赖内容的时长用 `calculateMetadata`，不要写死猜帧数。
- 动效统一走 `src/lib/motion.ts` 与 `src/lib/reveal.tsx`，不要在组件里手写 `(frame - x) / y`。
- 所有尺寸乘 `scale = width / 1920`（竖版再 ×1.3），横竖共用一套代码。
- 输出路径用绝对路径；不传时产物在 `out/<renderJobId>/`。

## 错误码速查

`VERSION_MISMATCH` / `BROWSER_MISSING` / `ENTRY_INVALID` / `PATH_DENIED` / `ASSET_MISSING` / `WEBPACK_FAILED` / `COMPOSITION_NOT_FOUND` / `RENDER_TIMEOUT` / `CANCELLED` / `JOB_NOT_FOUND`。每条的处置见 `references/troubleshooting.md`。

## 参考索引

| 文件 | 何时读 |
|---|---|
| `references/design-to-motion.md` | A 类：素材盘点、镜头手法、可读性红线 |
| `references/parametric-batch.md` | B 类：props、批量、字幕音频对齐 |
| `references/api-cheatsheet.md` | C/D 类：API 写法、spring 取值、交付参数 |
| `references/troubleshooting.md` | 任何报错：错误码 → 处置 |

Remotion 官方最佳实践由 `/remotion-best-practices`（`npx skills add remotion-dev/skills`）提供，本技能不复制 API 文档。
