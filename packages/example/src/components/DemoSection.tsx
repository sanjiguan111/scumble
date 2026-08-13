// Reusable detail-page section: a small title + a full-width Canvas host + an
// optional caption. Most demos render their shapes straight into this Canvas.
// Demos that need a custom viewport / interactive wrapper just don't use it.

import type { ReactNode } from "@lynx-js/react";
import { Canvas } from "@lynx-skity/react";

interface DemoSectionProps {
  title: string;
  caption?: string;
  height?: number;
  viewPort?: { x?: number; y?: number; width: number; height: number };
  children?: ReactNode;
}

export function DemoSection({
  title,
  caption,
  height = 200,
  viewPort,
  children,
}: DemoSectionProps) {
  // Default to a 360×height logical space so shapes authored in ~0–360 logical
  // px are scaled (xMidYMid meet) to fit the canvas: small screens shrink the
  // whole scene instead of clipping the right edge. Pass `viewPort` to override
  // (e.g. the Viewport demo's 100×100 / 200×200).
  const vp = viewPort ?? { width: 360, height };
  return (
    <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
      <text style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}>
        {title}
      </text>
      <Canvas style={{ width: "100%", height: `${height}px` }} viewPort={vp}>
        {children}
      </Canvas>
      {caption ? (
        <text style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>{caption}</text>
      ) : null}
    </view>
  );
}
