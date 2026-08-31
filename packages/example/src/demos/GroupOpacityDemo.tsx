import { Circle, ClipRRect, Group, Rect } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// 半重叠的红/蓝圆（纯色便于像素核对：saveLayer 语义下重叠区 == 蓝单独区 ==
// (128,128,255)；折叠 alpha 下重叠区 == 蓝 0.5 over 红 0.5 over 白 ==
// (128,64,192)，明显更脏）。
function OverlapPair({ ox, oy }: { ox: number; oy: number }) {
  return (
    <Group>
      <Circle cx={ox + 36} cy={oy} radius={30} color="#ff0000" />
      <Circle cx={ox + 66} cy={oy} radius={30} color="#0000ff" />
    </Group>
  );
}

export function GroupOpacityDemo() {
  return (
    <view>
      <DemoSection
        title="重叠对照：Group opacity 0.5 vs 叶子各自 0.5"
        caption="左：组整体经离屏层合成，重叠区与蓝单独区同色；右：alpha 折进每个 paint，重叠区叠加成 75% 更实"
        height={170}
      >
        {/* 左：saveLayer —— 整组先在层内合成，再整体 50% */}
        <Group>
          <Rect x={16} y={20} width={140} height={130} color="#ffffff" />
          <Group opacity={0.5}>
            <OverlapPair ox={30} oy={85} />
          </Group>
        </Group>
        {/* 右：折叠 alpha —— 每圆各自 50%（叶子路径，无 Group opacity） */}
        <Group>
          <Rect x={204} y={20} width={140} height={130} color="#ffffff" />
          <Circle cx={240} cy={85} radius={30} color="#ff0000" opacity={0.5} />
          <Circle cx={270} cy={85} radius={30} color="#0000ff" opacity={0.5} />
        </Group>
      </DemoSection>

      <DemoSection
        title="嵌套 Group 0.5 × 0.5"
        caption="链上每个 authored 因子各开一层：净效果 25%，重叠区仍与蓝单独区同色 (191,191,255)"
        height={160}
      >
        <Group>
          <Rect x={60} y={20} width={140} height={120} color="#ffffff" />
          <Group opacity={0.5}>
            <Group opacity={0.5}>
              <OverlapPair ox={74} oy={80} />
            </Group>
          </Group>
        </Group>
        {/* 参照：单层 0.25 的叶子（应与嵌套结果一致） */}
        <Group>
          <Rect x={220} y={20} width={140} height={120} color="#ffffff" />
          <Group opacity={0.25}>
            <OverlapPair ox={234} oy={80} />
          </Group>
        </Group>
      </DemoSection>

      <DemoSection
        title="clip + 旋转"
        caption="clip 在层内裁剪、旋转走保守包围盒：边缘无 halo、无内容被裁丢"
        height={180}
      >
        <Group opacity={0.5}>
          <Group transform={{ rotate: 30 }}>
            <ClipRRect x={30} y={30} width={130} height={120} radii={20} />
            <Circle cx={95} cy={90} radius={48} color="#2563eb" />
            <Circle cx={125} cy={90} radius={48} color="#f59e0b" />
          </Group>
        </Group>
        <Group opacity={0.5}>
          <Group transform={{ rotate: 30, x: 250, y: 90 }}>
            <Circle cx={0} cy={0} radius={48} color="#ef4444" />
            <Rect x={-70} y={-20} width={60} height={40} color="#10b981" />
          </Group>
        </Group>
      </DemoSection>

      <DemoSection
        title="fade 动画（overlay 驱动）"
        caption="动画 opacity 写 overlay 槽进同一 lane：整组均匀淡入淡出，重叠区不闪烁"
        height={170}
      >
        <Group
          animate={{
            property: "opacity",
            from: 1,
            to: 0.3,
            duration: 1200,
            iterations: Infinity,
            autoReverse: true,
            easing: "ease-in-out",
          }}
        >
          <OverlapPair ox={120} oy={85} />
        </Group>
      </DemoSection>
    </view>
  );
}
