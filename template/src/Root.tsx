import React from "react";
import {Composition} from "remotion";
import {DesignShowcase} from "./scenes/DesignShowcase";
import type {DesignShowcaseProps} from "./scenes/DesignShowcase";
import {StatCounter} from "./scenes/StatCounter";
import type {StatCounterProps} from "./scenes/StatCounter";

/**
 * 一个 Composition = 一条可渲染的片子。
 * 同一组件挂不同画布尺寸即可同时产出横竖版，改一处两边生效。
 *
 * 两个参考场景代表两种起点：
 *   DesignShowcase —— 有外部素材（设计稿/截图），靠图片承载信息
 *   StatCounter    —— 无外部素材，靠 props 与数值承载信息
 */

const showcaseProps: DesignShowcaseProps = {
  // 素材就位后改成 "shot.png"（文件放在 public/ 下）
  imageSrc: undefined,
  eyebrow: "Design to Motion",
  title: "把设计稿变成动效视频",
  subtitle: "换掉 imageSrc 和文案，其余交给时间轴。",
};

const statProps: StatCounterProps = {
  label: "Q3 Deliverables",
  value: 1284,
  suffix: " 分钟",
  caption: "数字与进度条共用一个进度源，永远同步。",
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DesignShowcase"
        component={DesignShowcase}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={showcaseProps}
      />

      <Composition
        id="DesignShowcaseVertical"
        component={DesignShowcase}
        durationInFrames={180}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          ...showcaseProps,
          title: "竖版标题\n手动换行控制节奏",
        }}
      />

      <Composition
        id="StatCounter"
        component={StatCounter}
        durationInFrames={120}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={statProps}
      />
    </>
  );
};
