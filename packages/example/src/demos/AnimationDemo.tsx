// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

import { Circle, Group, Path, Rect } from "@gesso/react";

import { DemoSection } from "../components/DemoSection";

// Heart via cubic beziers (same d string as PathsDemo).
const HEART =
  "M150 60 C100 20 30 40 30 100 C30 150 90 190 150 220 C210 190 270 150 270 100 C270 40 200 20 150 60 Z";

// Draw-on loop: the trim window sweeps 0→1 forever. Compare PathsDemo's
// setInterval + setState version — this one ships ONE description down the
// command stream; the render thread interpolates every frame (zero JS, zero
// Lynx layout passes; ANIMATION_DESIGN.md).
function TrimLoop() {
  return (
    <Path
      path={HEART}
      color="#22c55e"
      style="stroke"
      strokeWidth={6}
      animate={{
        property: "pathEnd",
        from: 0,
        to: 1,
        duration: 2000,
        iterations: Infinity,
        easing: "ease-in-out",
      }}
    />
  );
}

// Two tracks on one node: opacity breathing (auto-reverse) + a fill color
// shift — exercises the paint-overlay merge under group inheritance.
function BreathingCircle() {
  return (
    <Circle
      cx={150}
      cy={110}
      radius={60}
      animate={[
        {
          property: "opacity",
          from: 1,
          to: 0.35,
          duration: 900,
          iterations: Infinity,
          autoReverse: true,
        },
        {
          property: "fillColor",
          from: "#3b82f6",
          to: "#ec4899",
          duration: 1800,
          iterations: Infinity,
          autoReverse: true,
        },
      ]}
    />
  );
}

// Transform tracks with a pivot: rotation appends to any base transform
// (overlay components, never rebuilt bytes). The small square translates via
// a Group-level track — whole-subtree animation.
function TransformSpin() {
  return (
    <Group
      animate={{
        property: "translateX",
        from: -30,
        to: 30,
        duration: 1200,
        iterations: Infinity,
        autoReverse: true,
      }}
    >
      <Rect
        x={110}
        y={70}
        width={80}
        height={80}
        color="#f59e0b"
        animate={{
          property: "rotate",
          from: 0,
          to: 360,
          duration: 3000,
          iterations: Infinity,
          cx: 150,
          cy: 110,
        }}
      />
      <Rect
        x={190}
        y={70}
        width={44}
        height={44}
        color="#06b6d4"
        animate={{
          property: "scale",
          from: 0.6,
          to: 1.2,
          duration: 900,
          iterations: Infinity,
          autoReverse: true,
          cx: 212,
          cy: 92,
        }}
      />
    </Group>
  );
}

// Finite animation with fill: the dot eases across and STAYS (fill:
// "forwards" pins the terminal value; the vsync driver stops once nothing is
// live). Both tracks are forwards — the end state is the demo's point.
// NOTE: this section's viewPort is 360×80 — cy must stay within 80 or the
// dot renders outside the logical viewport (translateX only moves x).
function EaseInForwards() {
  return (
    <Circle
      cx={40}
      cy={40}
      radius={16}
      color="#a855f7"
      animate={[
        {
          property: "translateX",
          from: 0,
          to: 220,
          duration: 1500,
          easing: "ease-in-out",
          fill: "forwards",
        },
        { property: "opacity", from: 0, to: 1, duration: 400, fill: "forwards" },
      ]}
    />
  );
}

export function AnimationDemo() {
  return (
    <view>
      <DemoSection
        title="Native animation — trim loop"
        caption="pathEnd 0→1 无限循环；纯 native 插值，零 JS 每帧参与"
        height={240}
      >
        <TrimLoop />
      </DemoSection>
      <DemoSection
        title="Multi-track — opacity + fillColor"
        caption="一个节点两条轨道：呼吸透明度 + 颜色渐变（autoReverse）"
        height={220}
      >
        <BreathingCircle />
      </DemoSection>
      <DemoSection
        title="Transform tracks — rotate · scale · translate"
        caption="带 pivot 的旋转缩放 + Group 级平移（overlay 追加语义）"
        height={220}
      >
        <TransformSpin />
      </DemoSection>
      <DemoSection
        title="Finite + fill forwards"
        caption="弹性 cubic-bezier 入场后停在终值；驱动空闲自停"
        height={80}
      >
        <EaseInForwards />
      </DemoSection>
    </view>
  );
}
