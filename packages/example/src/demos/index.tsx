// Central demo registry consumed by both HomePage (list) and DemoPage (detail).
// Add a category by appending here + creating its component file.

import type { ReactNode } from "@lynx-js/react";

import { BlendDemo } from "./BlendDemo";
import { BiDiDemo } from "./BiDiDemo";
import { ClipDemo } from "./ClipDemo";
import { FiltersDemo } from "./FiltersDemo";
import { GradientDemo } from "./GradientDemo";
import { ImageDemo } from "./ImageDemo";
import { ImageShaderDemo } from "./ImageShaderDemo";
import { ParagraphDemo } from "./ParagraphDemo";
import { InteractiveDemo } from "./InteractiveDemo";
import { PaintDemo } from "./PaintDemo";
import { PathOpsDemo } from "./PathOpsDemo";
import { AnimationDemo } from "./AnimationDemo";
import { PathsDemo } from "./PathsDemo";
import { ShapesDemo } from "./ShapesDemo";
import { TransformDemo } from "./TransformDemo";
import { ViewportDemo } from "./ViewportDemo";

export interface DemoConfig {
  key: string;
  title: string;
  subtitle: string;
  accent: string;
  render: () => ReactNode;
}

export const DEMOS: DemoConfig[] = [
  {
    key: "shapes",
    title: "Shapes",
    subtitle: "Circle · Rect · RRect · opacity",
    accent: "#3b82f6",
    render: () => <ShapesDemo />,
  },
  {
    key: "gradient",
    title: "Gradient",
    subtitle: "Linear · Radial · Sweep · Conical · stroke",
    accent: "#8b5cf6",
    render: () => <GradientDemo />,
  },
  {
    key: "paths",
    title: "Paths",
    subtitle: "SVG d · Path2D · arc · trim",
    accent: "#22c55e",
    render: () => <PathsDemo />,
  },
  {
    key: "animation",
    title: "Animation",
    subtitle: "native interpolation · zero JS per frame",
    accent: "#f97316",
    render: () => <AnimationDemo />,
  },
  {
    key: "pathops",
    title: "Path Ops",
    subtitle: "union · intersect · difference · xor",
    accent: "#14b8a6",
    render: () => <PathOpsDemo />,
  },
  {
    key: "filters",
    title: "Filters",
    subtitle: "Blur · DropShadow · ColorMatrix · ColorBlend · MaskBlur",
    accent: "#6366f1",
    render: () => <FiltersDemo />,
  },
  {
    key: "transform",
    title: "Transform",
    subtitle: "translate · scale · rotate · matrix",
    accent: "#a855f7",
    render: () => <TransformDemo />,
  },
  {
    key: "clip",
    title: "Clip",
    subtitle: "ClipRect · ClipRRect · ClipPath · difference · paint 继承",
    accent: "#0ea5e9",
    render: () => <ClipDemo />,
  },
  {
    key: "paint",
    title: "Paint",
    subtitle: "stroke cap/join/width · fillRule",
    accent: "#ef4444",
    render: () => <PaintDemo />,
  },
  {
    key: "blend",
    title: "Blend",
    subtitle: "multiply · screen · difference · Group 继承",
    accent: "#d946ef",
    render: () => <BlendDemo />,
  },
  {
    key: "interactive",
    title: "Interactive",
    subtitle: "tap · mount/unmount · animation",
    accent: "#f59e0b",
    render: () => <InteractiveDemo />,
  },
  {
    key: "viewport",
    title: "Viewport",
    subtitle: "viewBox 缩放对比",
    accent: "#06b6d4",
    render: () => <ViewportDemo />,
  },
  {
    key: "image",
    title: "Image",
    subtitle: "data URI · http(s) · fit 七值 · sampling · 异步上屏",
    accent: "#14b8a6",
    render: () => <ImageDemo />,
  },
  {
    key: "image-shader",
    title: "ImageShader",
    subtitle: "纹理填充 · repeat/mirror/decal · stroke 纹理",
    accent: "#f43f5e",
    render: () => <ImageShaderDemo />,
  },
  {
    key: "paragraph",
    title: "Paragraph",
    subtitle: "富文本 · 换行对齐 · maxLines · onLayout",
    accent: "#10b981",
    render: () => <ParagraphDemo />,
  },
  {
    key: "bidi",
    title: "BiDi",
    subtitle: "RTL · auto 检测 · 混排 · 物理对齐",
    accent: "#f97316",
    render: () => <BiDiDemo />,
  },
];

export function findDemo(key?: string): DemoConfig | undefined {
  return DEMOS.find((d) => d.key === key);
}
