import React from "react";
import {AbsoluteFill, interpolate, useVideoConfig} from "remotion";
import {MaskReveal, Reveal} from "../lib/reveal";
import {useEnvelope, useSpringIn} from "../lib/motion";
import {theme} from "../theme";

/**
 * 参考场景：数据/指标动画。不需要任何外部素材，全部由 props 驱动。
 *
 * 展示三件通用技法：
 *   1. 数字滚动由 spring 进度驱动（不是逐帧线性，读起来更顺）
 *   2. 进度条与数字共用同一个进度源，两者天然同步
 *   3. 背景用径向渐晕代替图片，纯代码也能有层次
 *
 * 适合：季度数据、产品指标、榜单排名、参数化批量出片。
 */

export type StatCounterProps = {
  /** 指标名，小字 */
  label: string;
  /** 目标数值 */
  value: number;
  prefix?: string;
  suffix?: string;
  /** 小数位，默认 0 */
  decimals?: number;
  /** 底部注解 */
  caption?: string;
  /** 数字与进度条的颜色 */
  accent?: string;
};

const format = (value: number, decimals: number): string =>
  value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

export const StatCounter: React.FC<StatCounterProps> = ({
  label,
  value,
  prefix = "",
  suffix = "",
  decimals = 0,
  caption,
  accent = theme.colors.accent,
}) => {
  const {width, height} = useVideoConfig();
  const unit = width / theme.base.width;
  const portrait = height > width;
  const scale = unit * (portrait ? 1.3 : 1);

  // 数值动画的节奏比文字慢：spring 走完约 1 秒，读数过程才看得清
  const countIn = useSpringIn(6, {damping: 200, stiffness: 42});
  const labelIn = useEnvelope({inAt: 0, inDuration: 14});
  const captionIn = useEnvelope({inAt: 34, inDuration: 16});
  const barIn = useSpringIn(10, {damping: 200, stiffness: 60});

  const shown = Number(interpolate(countIn, [0, 1], [0, value]));

  return (
    <AbsoluteFill
      style={{
        backgroundColor: theme.colors.canvas,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* 径向渐晕：纯代码的光源，替代背景图 */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 50% 42%, ${accent}22 0%, rgba(0,0,0,0) 58%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 18 * scale,
          width: width * 0.66,
        }}
      >
        <Reveal progress={labelIn}>
          <div
            style={{
              fontFamily: theme.fonts.mono,
              fontSize: 24 * scale,
              letterSpacing: 0.22 * 24 * scale,
              textTransform: "uppercase",
              color: theme.colors.textMuted,
            }}
          >
            {label}
          </div>
        </Reveal>

        <MaskReveal progress={countIn} style={{maxWidth: "100%"}}>
          <div
            style={{
              fontFamily: theme.fonts.sans,
              fontSize: 216 * scale,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: -0.03 * 216 * scale,
              color: theme.colors.text,
              // 等宽数字，滚动时不会左右抖动
              fontVariantNumeric: "tabular-nums",
              whiteSpace: "nowrap",
            }}
          >
            {/* 单位按 0.34em 缩放并对齐基线：和数字同号会显得头重脚轻，中文单位尤其明显 */}
            <span style={{color: accent, fontSize: "0.34em", marginRight: "0.06em"}}>
              {prefix}
            </span>
            {format(shown, decimals)}
            <span style={{color: accent, fontSize: "0.34em", marginLeft: "0.06em"}}>
              {suffix}
            </span>
          </div>
        </MaskReveal>

        <div
          style={{
            width: "100%",
            height: 4 * scale,
            borderRadius: theme.radius.pill,
            backgroundColor: "rgba(245, 247, 250, 0.12)",
            marginTop: 12 * scale,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${barIn * 100}%`,
              height: "100%",
              borderRadius: theme.radius.pill,
              backgroundColor: accent,
            }}
          />
        </div>

        {caption ? (
          <Reveal progress={captionIn} distance={16 * scale}>
            <div
              style={{
                marginTop: 16 * scale,
                fontFamily: theme.fonts.sans,
                fontSize: 26 * scale,
                lineHeight: 1.5,
                color: theme.colors.textMuted,
                textAlign: "center",
              }}
            >
              {caption}
            </div>
          </Reveal>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
