# B 类：数据与批量

1. props 类型化：场景组件导出 `type XxxProps`，`Root.tsx` 的 `defaultProps` 与之对应；渲染时用 `props` 覆盖，不改代码。
2. 时长依赖内容时用 `calculateMetadata({props})` 返回 `durationInFrames`，不要写死。
3. 数字滚动与进度条共用同一个进度源（`useSpringIn` 或 `useTween`），避免两者不同步。
4. 批量：`remotion_render_batch` 的 `items` 每个给 `compositionId` + `outputPath` + `props`。共享一次打包结果，比循环 `render_video` 快。
5. 字幕：做成独立场景组件，按帧窗口显隐，用 `useEnvelope`；中文单行 ≤ 24 字。
6. 音频对齐：音频文件放 `public/`，`<Audio src={staticFile("bgm.mp3")} />`；先定 fps 与总帧数，再按秒换算帧。
7. 交付校验：每条片子记录 `outputPath`、尺寸、fps、帧数、字节数；`remotion_job_status` 全部 `done` 后再报完成。

横竖版共用一套 props，只换 Composition 的 width/height；所有视觉尺寸乘 `scale`。
