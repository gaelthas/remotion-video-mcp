# A 类：素材驱动

1. 盘点素材：尺寸、比例、是否有文字、透明通道。用 `remotion_put_assets` 放进 `public/`。
2. 画布规格：横版 1920×1080、竖版 1080×1920；同一组件在 `Root.tsx` 注册两个 Composition 可同时出片。
3. 时间结构：0–15 帧入场，15–90 帧主体，90–150 帧停留，150–180 帧收尾。用 `<Series>` 串多场景。
4. 镜头手法：静态图用 `useKenBurns(durationInFrames, 1.06, 1.0)` 缓慢推近，幅度不超过 1.1；位移用 `useTween`，不要手写帧差。
5. 可读性红线：图上有文字必须叠底部渐变遮罩；主标题与背景对比度 ≥ 4.5:1；文字距边缘 ≥ 画布宽的 5%。
6. 错峰入场：强调条 → 眉标 → 主标题 → 副标题，每层差 6–10 帧，用 `useSpringIn(delay)`。
7. 校对四帧后出片：先看 `remotion_render_still` 的 0 / 26 / 60 / 170 帧，再 `remotion_render_video`。

素材缺失时在渲染日志里表现为 `ASSET_MISSING` 或浏览器 404；先用 `remotion_put_assets`，不要改路径写法。
