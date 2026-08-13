import { Circle, Rect, RRect } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

const OPACITIES = [0.25, 0.5, 0.75, 1];

export function ShapesDemo() {
  return (
    <view>
      <DemoSection title="Fill" caption="Circle · Rect · RRect — color 接受命名色 / hex">
        <Circle cx={50} cy={100} radius={45} color="#3b82f6" />
        <Rect x={120} y={55} width={90} height={90} color="#22c55e" />
        <RRect x={240} y={55} width={90} height={90} radii={22} color="#ef4444" />
      </DemoSection>

      <DemoSection title="Stroke" caption="style='stroke' + strokeWidth">
        <Circle cx={50} cy={100} radius={45} color="#3b82f6" style="stroke" strokeWidth={6} />
        <Rect
          x={120}
          y={55}
          width={90}
          height={90}
          color="#22c55e"
          style="stroke"
          strokeWidth={6}
        />
        <RRect
          x={240}
          y={55}
          width={90}
          height={90}
          radii={22}
          color="#ef4444"
          style="stroke"
          strokeWidth={6}
        />
      </DemoSection>

      <DemoSection title="Opacity" caption="opacity 0.25 → 1.0（alpha 折进 paint color）">
        {OPACITIES.map((o, i) => (
          <Circle key={i} cx={55 + i * 75} cy={100} radius={34} color="#8b5cf6" opacity={o} />
        ))}
      </DemoSection>

      <DemoSection title="RRect radii" caption="number(均匀) / {x,y}(per-axis)">
        <RRect x={20} y={50} width={90} height={100} radii={12} color="#f59e0b" />
        <RRect x={140} y={50} width={90} height={100} radii={36} color="#06b6d4" />
        <RRect x={260} y={50} width={90} height={100} radii={{ x: 40, y: 16 }} color="#ec4899" />
      </DemoSection>
    </view>
  );
}
