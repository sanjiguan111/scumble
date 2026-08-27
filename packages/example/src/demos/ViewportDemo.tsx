import { Circle, Rect } from "@gesso/react";

import { DemoSection } from "../components/DemoSection";

// The same three shapes (authored in 0–100 logical px) under three different
// viewport settings, to show how viewPort scales child geometry to fit.
// Inlined in each Canvas (Canvas children must be skity shapes, not <view>).

export function ViewportDemo() {
  return (
    <view>
      <DemoSection
        title="viewPort 100×100"
        caption="100×100 逻辑空间 → xMidYMid meet 缩放居中"
        height={150}
        viewPort={{ width: 100, height: 100 }}
      >
        <Rect x={5} y={5} width={40} height={40} color="#ef4444" />
        <Circle cx={70} cy={30} radius={20} color="#3b82f6" />
        <Rect x={55} y={55} width={40} height={40} color="#22c55e" style="stroke" strokeWidth={2} />
      </DemoSection>

      <DemoSection
        title="viewPort 200×200"
        caption="逻辑空间更大 → 同画布内图形更小"
        height={150}
        viewPort={{ width: 200, height: 200 }}
      >
        <Rect x={5} y={5} width={40} height={40} color="#ef4444" />
        <Circle cx={70} cy={30} radius={20} color="#3b82f6" />
        <Rect x={55} y={55} width={40} height={40} color="#22c55e" style="stroke" strokeWidth={2} />
      </DemoSection>

      <DemoSection title="无 viewPort" caption="坐标直接当物理像素（1:1）" height={150}>
        <Rect x={5} y={5} width={40} height={40} color="#ef4444" />
        <Circle cx={70} cy={30} radius={20} color="#3b82f6" />
        <Rect x={55} y={55} width={40} height={40} color="#22c55e" style="stroke" strokeWidth={2} />
      </DemoSection>
    </view>
  );
}
