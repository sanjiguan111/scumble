// Central demo registry consumed by both HomePage (list) and DemoPage (detail).
// Add a category by appending here + creating its component file.

import type { ReactNode } from "@lynx-js/react";

import { GradientDemo } from "./GradientDemo";
import { InteractiveDemo } from "./InteractiveDemo";
import { PaintDemo } from "./PaintDemo";
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
    subtitle: "LinearGradient · 多 stop · mode",
    accent: "#8b5cf6",
    render: () => <GradientDemo />,
  },
  {
    key: "paths",
    title: "Paths",
    subtitle: "SVG d · Path2D · arc",
    accent: "#22c55e",
    render: () => <PathsDemo />,
  },
  {
    key: "transform",
    title: "Transform",
    subtitle: "translate · scale · rotate · matrix",
    accent: "#a855f7",
    render: () => <TransformDemo />,
  },
  {
    key: "paint",
    title: "Paint",
    subtitle: "stroke cap/join/width · fillRule",
    accent: "#ef4444",
    render: () => <PaintDemo />,
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
];

export function findDemo(key?: string): DemoConfig | undefined {
  return DEMOS.find((d) => d.key === key);
}
