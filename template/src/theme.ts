/**
 * 设计变量层：从设计稿里抽取的色板、字体、间距、圆角。
 *
 * 规则：视频里出现的所有颜色和字号都必须来自这里，不要在组件里写死十六进制。
 * 换一个设计稿时只改这个文件，成片视觉就会整体跟着变。
 */

export const theme = {
  colors: {
    /** 画布底色，通常取设计稿最外层背景 */
    canvas: "#0B0D12",
    /** 卡片/浮层底色 */
    surface: "#141821",
    /** 主文字 */
    text: "#F5F7FA",
    /** 次级文字 */
    textMuted: "rgba(245, 247, 250, 0.62)",
    /** 品牌强调色，取自设计稿主色 */
    accent: "#5B8CFF",
    /** 遮罩渐变，用于压暗图片以便文字可读 */
    scrim: "linear-gradient(to top, rgba(6, 8, 12, 0.86) 0%, rgba(6, 8, 12, 0.45) 38%, rgba(6, 8, 12, 0) 68%)",
  },
  fonts: {
    sans: '"Inter", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif',
    mono: '"JetBrains Mono", "Cascadia Mono", ui-monospace, monospace',
  },
  /** 以设计基准宽度 1920 为 1 单位，具体像素在组件里乘 scale */
  base: {
    width: 1920,
    padding: 120,
    titleSize: 92,
    subtitleSize: 30,
    eyebrowSize: 22,
    gap: 28,
  },
  radius: {
    card: 28,
    pill: 999,
  },
} as const;
