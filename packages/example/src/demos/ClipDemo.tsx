import {
  Circle,
  ClipPath,
  ClipRect,
  ClipRRect,
  Group,
  Path,
  Path2D,
  RRect,
  Rect,
} from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// 轮廓标注样式：原始图形 = 灰色虚线；clip 区域 = 黑色虚线
const GHOST = "#9ca3af";
const CLIP_EDGE = "#111827";
const OUTLINE = { style: "stroke" as const, strokeWidth: 2, dash: [4, 4] };

// difference 演示用的圆形挖洞路径
const HOLE = new Path2D().addCircle(150, 100, 55);

export function ClipDemo() {
  return (
    <view>
      <DemoSection
        title="clipRect"
        caption="填充=裁剪后 · 灰虚线=原始图形 · 黑虚线=clip 区域"
        height={220}
      >
        <Group>
          <ClipRect x={30} y={30} width={130} height={130} />
          <Circle cx={95} cy={95} radius={80} color="#3b82f6" />
        </Group>
        {/* 原始图形轮廓（未被裁剪的完整范围） */}
        <Circle cx={95} cy={95} radius={80} color={GHOST} {...OUTLINE} />
        {/* clip 区域轮廓 */}
        <Rect x={30} y={30} width={130} height={130} color={CLIP_EDGE} {...OUTLINE} />
      </DemoSection>

      <DemoSection title="clipRRect" caption="圆角矩形裁剪（radii 24 / {x:40,y:16}）" height={220}>
        <Group>
          <ClipRRect x={30} y={30} width={140} height={140} radii={24} />
          <Circle cx={100} cy={100} radius={80} color="#22c55e" />
        </Group>
        <Circle cx={100} cy={100} radius={80} color={GHOST} {...OUTLINE} />
        <RRect x={30} y={30} width={140} height={140} radii={24} color={CLIP_EDGE} {...OUTLINE} />
        <Group>
          <ClipRRect x={210} y={30} width={120} height={140} radii={{ x: 40, y: 16 }} />
          <Circle cx={270} cy={100} radius={80} color="#8b5cf6" />
        </Group>
        <Circle cx={270} cy={100} radius={80} color={GHOST} {...OUTLINE} />
        <RRect
          x={210}
          y={30}
          width={120}
          height={140}
          radii={{ x: 40, y: 16 }}
          color={CLIP_EDGE}
          {...OUTLINE}
        />
      </DemoSection>

      <DemoSection
        title="clipPath"
        caption="三角形窗口裁剪（左） / difference：三角形外才可见（右）"
        height={220}
      >
        <Group>
          <ClipPath path="M40 170 L95 20 L150 170 Z" />
          <Circle cx={95} cy={95} radius={70} color="#f59e0b" />
        </Group>
        <Circle cx={95} cy={95} radius={70} color={GHOST} {...OUTLINE} />
        <Path path="M40 170 L95 20 L150 170 Z" color={CLIP_EDGE} {...OUTLINE} />
        <Group>
          <ClipPath path="M210 170 L265 20 L320 170 Z" op="difference" />
          <Circle cx={265} cy={100} radius={80} color="#06b6d4" />
        </Group>
        <Circle cx={265} cy={100} radius={80} color={GHOST} {...OUTLINE} />
        <Path path="M210 170 L265 20 L320 170 Z" color={CLIP_EDGE} {...OUTLINE} />
      </DemoSection>

      <DemoSection
        title="difference"
        caption="先 intersect 圆角框，再 difference 挖掉中心圆（两个 clip 叠加）"
        height={220}
      >
        <Group>
          <ClipRRect x={60} y={30} width={180} height={140} radii={20} />
          <ClipPath path={HOLE} op="difference" />
          <Rect x={60} y={30} width={180} height={140} color="#ec4899" />
        </Group>
        <RRect x={60} y={30} width={180} height={140} radii={20} color={CLIP_EDGE} {...OUTLINE} />
        <Path path={HOLE} color={CLIP_EDGE} {...OUTLINE} />
      </DemoSection>

      <DemoSection
        title="paint 继承"
        caption="Group 的 color/opacity 下传给未设置 paint 的子形状；子 Group 可再覆盖"
      >
        <Group color="#3b82f6" opacity={0.7}>
          <Circle cx={50} cy={70} radius={35} />
          <Rect x={100} y={35} width={70} height={70} />
          <Group color="#ef4444">
            <Circle cx={210} cy={70} radius={35} />
            <Circle cx={290} cy={70} radius={35} color="#22c55e" />
          </Group>
        </Group>
      </DemoSection>
    </view>
  );
}
