import {Easing, interpolate, spring, useCurrentFrame, useVideoConfig} from "remotion";
import type {SpringConfig} from "remotion";

/**
 * 动效工具层：把「时间 → 进度值」的换算集中在这里，场景组件只消费 0..1 的进度。
 * 所有返回值都是 0..1（kenBurns 除外，返回缩放倍数），可以直接喂给 opacity / transform。
 */

/** 超出时间窗时钳制，避免提前出现或结束后继续漂移 */
const clamp = {extrapolateLeft: "clamp", extrapolateRight: "clamp"} as const;

/**
 * 弹性入场。默认参数偏「克制」：无过冲、约 0.5 秒到位，适合 UI 类画面。
 * 想要更有冲击力，把 damping 降到 12~18（会过冲）。
 */
export const useSpringIn = (
  delay = 0,
  config: Partial<SpringConfig> = {},
): number => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  return spring({
    frame: frame - delay,
    fps,
    config: {damping: 200, stiffness: 120, mass: 1, ...config},
  });
};

/**
 * 透明/位移包络：在 [inAt, inAt+inDuration] 淡入，在 [outAt, outAt+outDuration] 淡出。
 * 用于整段字幕、画面卡片这类需要「出现—停留—退出」的元素。
 */
export const useEnvelope = (options: {
  inAt?: number;
  inDuration?: number;
  outAt?: number;
  outDuration?: number;
} = {}): number => {
  const {inAt = 0, inDuration = 15, outAt, outDuration = 15} = options;
  const frame = useCurrentFrame();

  const fadeIn = interpolate(frame, [inAt, inAt + inDuration], [0, 1], clamp);
  const fadeOut =
    outAt === undefined
      ? 1
      : interpolate(frame, [outAt, outAt + outDuration], [1, 0], clamp);

  return Math.min(fadeIn, fadeOut);
};

/**
 * 缓慢推近（Ken Burns）。静态设计稿靠这一层获得「镜头感」，幅度控制在 1.02~1.08，
 * 超过 1.1 会让人看出是在缩放图片而不是在拍摄。
 */
export const useKenBurns = (
  durationInFrames: number,
  from = 1.06,
  to = 1.0,
): number => {
  const frame = useCurrentFrame();

  return interpolate(frame, [0, durationInFrames], [from, to], {
    ...clamp,
    easing: Easing.out(Easing.cubic),
  });
};

/**
 * 通用补间：给定帧窗口和输出区间，自动钳制并带缓动。
 * 需要精确控制某个属性时用这个，不要手写 (frame - x) / y。
 */
export const useTween = (
  outputRange: [number, number],
  inputRange: [number, number] = [0, 30],
  easing: (input: number) => number = Easing.out(Easing.cubic),
): number => {
  const frame = useCurrentFrame();

  return interpolate(frame, inputRange, outputRange, {...clamp, easing});
};

export {clamp};
