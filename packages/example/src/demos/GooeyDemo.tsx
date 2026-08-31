import { Blur, Circle, ColorMatrix, Group, Line, Paint, Paragraph, TextSpan } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// Gooey 配方:RGB 恒等 + alpha 行 18x-7 —— alpha 超过阈值 ≈0.39 拉回 1,以下压到 0。
// 配合前置 blur,重叠区的叠加 alpha 越过阈值 → 融合;单独 shape 的实心区不受影响。
const GOOEY = [
  1,
  0,
  0,
  0,
  0, //
  0,
  1,
  0,
  0,
  0, //
  0,
  0,
  1,
  0,
  0, //
  0,
  0,
  0,
  18,
  -7,
];

function Blobs({ ox, oy }: { ox: number; oy: number }) {
  return (
    <Group>
      <Circle cx={ox + 40} cy={oy} radius={26} color="#ec4899" />
      <Circle cx={ox + 84} cy={oy + 8} radius={26} color="#ec4899" />
      <Circle cx={ox + 62} cy={oy - 26} radius={20} color="#ec4899" />
      <Line x1={ox + 20} y1={oy + 34} x2={ox + 120} y2={oy + 34} color="#ec4899" strokeWidth={18} />
    </Group>
  );
}

export function GooeyDemo() {
  return (
    <view>
      <DemoSection
        title="Gooey 融合（layer prop）"
        caption="整组先离屏栅格化 → blur12 → alpha 阈值 → blur2 收边:重叠处 alpha 叠加过阈值,圆与粗线融成一体（metaball）"
        height={180}
      >
        <Group
          layer={
            <Paint>
              <Blur blur={12} />
              <ColorMatrix matrix={GOOEY} />
              <Blur blur={2} />
            </Paint>
          }
        >
          <Blobs ox={70} oy={90} />
        </Group>
        <Group
          layer={
            <Paint>
              <Blur blur={12} />
              <ColorMatrix matrix={GOOEY} />
              <Blur blur={2} />
            </Paint>
          }
        >
          <Circle cx={280} cy={90} radius={26} color="#8b5cf6" />
          <Circle cx={280} cy={128} radius={18} color="#8b5cf6" />
        </Group>
      </DemoSection>

      <DemoSection
        title="对照:滤镜直接挂 Group（per-shape 继承）"
        caption="同样的滤镜链作为 Group 的裸子元素:每个 shape 各自 blur+阈值,重叠处不融合、边缘各自硬化——这是 layer prop 存在的理由"
        height={180}
      >
        <Group>
          <Blur blur={12} />
          <ColorMatrix matrix={GOOEY} />
          <Blur blur={2} />
          <Blobs ox={70} oy={90} />
        </Group>
      </DemoSection>

      <DemoSection
        title="layer={true} + opacity"
        caption="强制离屏无效果:层合成 alpha 与组 opacity 共存（精确组透明度）;纯隔离用途,注意全画布离屏的成本"
        height={160}
      >
        <Group layer={true} opacity={0.6}>
          <Circle cx={100} cy={80} radius={40} color="#ff0000" />
          <Circle cx={130} cy={80} radius={40} color="#0000ff" />
        </Group>
        <Group layer={false} opacity={0.6}>
          <Circle cx={230} cy={80} radius={40} color="#ff0000" />
          <Circle cx={260} cy={80} radius={40} color="#0000ff" />
        </Group>
      </DemoSection>

      <DemoSection
        title="Paragraph 穿层"
        caption="文本与图形同层离屏 blur:glyph 绘制进层,整层一起模糊（组级效果对 Paragraph 同样生效）"
        height={150}
      >
        <Group
          layer={
            <Paint>
              <Blur blur={2} />
            </Paint>
          }
        >
          <Circle cx={60} cy={80} radius={34} color="#22c55e" />
          <Paragraph x={110} y={50} width={230} fontSize={15}>
            <TextSpan text="Text under a group-level blur — glyphs rasterize into the layer and soften together with the circle." />
          </Paragraph>
        </Group>
      </DemoSection>
    </view>
  );
}
