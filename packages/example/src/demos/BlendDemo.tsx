import { Circle, Group, Rect } from "@scumble/react";
import type { BlendMode } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// 每组：一个亮色底 + 两个半重叠的圆，第二个圆用指定 blendMode 压上去
const MODES: Array<{ mode: BlendMode; label: string }> = [
  { mode: "src-over", label: "src-over（默认）" },
  { mode: "multiply", label: "multiply" },
  { mode: "screen", label: "screen" },
  { mode: "overlay", label: "overlay" },
  { mode: "darken", label: "darken" },
  { mode: "lighten", label: "lighten" },
  { mode: "color-dodge", label: "color-dodge" },
  { mode: "difference", label: "difference" },
  { mode: "exclusion", label: "exclusion" },
  { mode: "hard-light", label: "hard-light" },
  { mode: "hue", label: "hue" },
  { mode: "luminosity", label: "luminosity" },
];

// 4 列网格
const COLS = 4;
const CELL_W = 82;
const CELL_H = 92;

function BlendCell({ mode }: { mode: BlendMode }) {
  const idx = MODES.findIndex((m) => m.mode === mode);
  const col = idx % COLS;
  const row = Math.floor(idx / COLS);
  const ox = col * CELL_W;
  const oy = row * CELL_H;
  return (
    <Group>
      {/* 底：亮色渐变感双色块 */}
      <Rect x={ox + 6} y={oy + 10} width={64} height={64} color="#fef3c7" />
      <Rect x={ox + 6} y={oy + 10} width={32} height={64} color="#fca5a5" />
      {/* 第一个圆：普通合成 */}
      <Circle cx={ox + 24} cy={oy + 42} radius={20} color="#2563eb" />
      {/* 第二个圆：blendMode 压上去，与第一个圆半重叠 */}
      <Circle cx={ox + 52} cy={oy + 42} radius={20} color="#f59e0b" blendMode={mode} />
    </Group>
  );
}

export function BlendDemo() {
  return (
    <view>
      <DemoSection
        title="blendMode"
        caption="右圆用指定 blendMode 与左圆/底色合成 · 左上角为 src-over 基准"
        height={300}
        viewPort={{ width: 340, height: 300 }}
      >
        {MODES.map(({ mode }) => (
          <BlendCell key={mode} mode={mode} />
        ))}
      </DemoSection>

      <DemoSection
        title="Group 继承"
        caption="Group blendMode='multiply' 下传给未显式设置的子形状"
        height={160}
      >
        <Group blendMode="multiply">
          <Rect x={30} y={30} width={120} height={100} color="#fde68a" />
          <Circle cx={150} cy={80} radius={50} color="#93c5fd" />
          <Circle cx={230} cy={80} radius={50} color="red" />
        </Group>
      </DemoSection>
    </view>
  );
}
