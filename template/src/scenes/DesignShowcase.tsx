import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {MaskReveal, Reveal} from "../lib/reveal";
import {clamp, useEnvelope, useKenBurns, useSpringIn} from "../lib/motion";
import {theme} from "../theme";

/**
 * 参考场景：设计稿/截图 → 展示视频。
 *
 * 分三层叠出「镜头感」：
 *   1. 图片层：Ken Burns 缓慢推近，让静态图有摄影机运动
 *   2. 遮罩层：底部渐变压暗，保证文字对比度（不做这一步文字一定糊）
 *   3. 内容层：强调条 → 眉标 → 主标题 → 副标题，按 6~10 帧错峰入场
 *
 * 所有尺寸都乘 scale（当前画布宽 / 1920），因此同一份组件在 16:9 和 9:16 下比例一致。
 */

export type DesignShowcaseProps = {
  /** 相对 public/ 的路径，例如 "shot.png"。留空则显示占位框，方便先跑通再换素材 */
  imageSrc?: string;
  eyebrow: string;
  title: string;
  subtitle: string;
};

export const DesignShowcase: React.FC<DesignShowcaseProps> = ({
  imageSrc,
  eyebrow,
  title,
  subtitle,
}) => {
  const {width, height, durationInFrames} = useVideoConfig();
  const frame = useCurrentFrame();

  // unit 跟随画布宽度做几何等比；竖版再放大字号，否则在手机上偏小
  const unit = width / theme.base.width;
  const portrait = height > width;
  const scale = unit * (portrait ? 1.3 : 1);

  const zoom = useKenBurns(durationInFrames, 1.06, 1.0);
  const containerIn = useEnvelope({inAt: 0, inDuration: 18});
  const barIn = useSpringIn(14, {stiffness: 140});
  const titleIn = useSpringIn(22, {damping: 200, stiffness: 110});
  const eyebrowIn = useEnvelope({inAt: 30, inDuration: 14});
  const subtitleIn = useEnvelope({inAt: 40, inDuration: 16});

  const padding = theme.base.padding * unit;
  const textWidth = width * (portrait ? 0.88 : 0.74);

  return (
    <AbsoluteFill style={{backgroundColor: theme.colors.canvas, overflow: "hidden"}}>
      <AbsoluteFill style={{transform: `scale(${zoom})`}}>
        {imageSrc ? (
          <Img
            src={staticFile(imageSrc)}
            style={{width: "100%", height: "100%", objectFit: "cover"}}
          />
        ) : (
          <Placeholder scale={scale} />
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{background: theme.colors.scrim}} />

      <AbsoluteFill
        style={{
          padding,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          alignItems: "flex-start",
          gap: theme.base.gap * scale,
          opacity: containerIn,
        }}
      >
        <div
          style={{
            width: 5 * scale,
            height: 56 * scale,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.accent,
            transform: `scaleY(${barIn})`,
            transformOrigin: "bottom",
            marginBottom: 4 * scale,
          }}
        />

        <Reveal progress={eyebrowIn}>
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: theme.base.eyebrowSize * scale,
              letterSpacing: 0.28 * theme.base.eyebrowSize * scale,
              textTransform: "uppercase",
              color: theme.colors.accent,
            }}
          >
            {eyebrow}
          </div>
        </Reveal>

        <MaskReveal
          progress={titleIn}
          style={{maxWidth: textWidth}}
        >
          <div
            style={{
              fontFamily: theme.fonts.sans,
              fontSize: theme.base.titleSize * scale,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: -0.02 * theme.base.titleSize * scale,
              color: theme.colors.text,
              // 允许在文案里用 \n 手动断行，控制标题的版面占比
              whiteSpace: "pre-line",
            }}
          >
            {title}
          </div>
        </MaskReveal>

        <Reveal progress={subtitleIn} distance={18 * scale}>
          <div
            style={{
              fontFamily: theme.fonts.sans,
              fontSize: theme.base.subtitleSize * scale,
              lineHeight: 1.55,
              color: theme.colors.textMuted,
              maxWidth: textWidth * 0.82,
            }}
          >
            {subtitle}
          </div>
        </Reveal>
      </AbsoluteFill>

      {/* 收尾压暗：最后 8 帧轻微降亮，方便和下一个场景衔接 */}
      <AbsoluteFill
        style={{
          backgroundColor: "#000",
          opacity: interpolate(
            frame,
            [durationInFrames - 8, durationInFrames],
            [0, 0.22],
            clamp,
          ),
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

/** 素材未就位时的占位层：一眼能看出「这里该放设计稿」，不影响渲染 */
const Placeholder: React.FC<{scale: number}> = ({scale}) => {
  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.surface,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          border: `${2 * scale}px dashed rgba(245, 247, 250, 0.28)`,
          borderRadius: theme.radius.card * scale,
          padding: `${40 * scale}px ${64 * scale}px`,
          fontFamily: theme.fonts.mono,
          fontSize: 26 * scale,
          color: "rgba(245, 247, 250, 0.5)",
          textAlign: "center",
          lineHeight: 1.7,
        }}
      >
        public/ 里还没有素材
        <br />
        放入设计稿并传入 imageSrc
      </div>
    </AbsoluteFill>
  );
};
