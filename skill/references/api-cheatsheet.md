# API 速查（Remotion 4.x）

- 入口 `src/index.ts`：`registerRoot(RemotionRoot)`，缺失会报 `ENTRY_INVALID`。
- 注册：`<Composition id component durationInFrames fps width height defaultProps />`。
- 帧：`useCurrentFrame()`、`useVideoConfig()`；`interpolate(frame,[a,b],[x,y],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})`。
- 弹性：`spring({frame, fps, config:{damping:200, stiffness:120, mass:1}})`；`damping` 降到 12–18 会有过冲。
- 素材：`<Img src={staticFile("a.png")} />`；`<Audio>`、`<Video>` 同理。原生 `<img>` 不参与帧同步。
- 字体：`@remotion/google-fonts` 或 `delayRender()`/`continueRender()` 包住 `document.fonts.load`。
- 串场：`<Series>` / `<Sequence from durationInFrames>`；过渡用 `@remotion/transitions`。
- 出片参数（工具字段）：`codec` = h264 / h265 / vp8 / vp9 / av1 / mp3 / aac / wav / prores / h264-mkv / h264-ts / gif；`crf` 默认 18；`scale`；`frameRange` `[起,止]`；`everyNthFrame`；`sequence=true` 出 PNG 序列。
- GIF：`codec="gif"` + `everyNthFrame=2`。给剪辑：`codec="prores"`。序列帧：`sequence=true`。
- 属性覆盖：`props` 传对象；`remotion_list_compositions` 可先查 `defaultProps`。

版本规则：`remotion` 与所有 `@remotion/*` 必须同版本，由运行时统一锁定；混版报 `VERSION_MISMATCH`。
