import React from "react";

/**
 * 遮罩上推：文字从下方裁切线内升起，比单纯淡入更有层次。
 * 传入 progress（0..1），内部用父级 overflow:hidden 做裁剪。
 * 注意：容器需要明确的宽度约束（否则会撑满），标题类文本建议配合 maxWidth 使用。
 */
export const MaskReveal: React.FC<{
  progress: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({progress, children, style}) => {
  const visible = progress > 0.001;

  return (
    <div style={{overflow: "hidden", ...style}}>
      <div
        style={{
          transform: `translateY(${(1 - progress) * 112}%)`,
          // 前 40% 进度内完成淡入，避免遮罩边缘切出硬边
          opacity: Math.min(1, progress * 2.5) * (visible ? 1 : 0),
          // 给下伸字母（g/p/y/中文下缘）留出空间，避免被裁掉
          paddingBottom: "0.12em",
          marginBottom: "-0.12em",
        }}
      >
        {children}
      </div>
    </div>
  );
};

/**
 * 淡入 + 小幅位移，用于副标题、标签、分页这类不需要强调的元素。
 */
export const Reveal: React.FC<{
  progress: number;
  distance?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({progress, distance = 24, children, style}) => {
  return (
    <div
      style={{
        opacity: progress,
        transform: `translateY(${(1 - progress) * distance}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};
