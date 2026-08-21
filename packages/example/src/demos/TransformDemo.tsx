import { Circle, Group, Rect } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// A 4×4 column-major matrix: scale 1.4 + translate(160, 30).
// Columns laid out flat: [sx,0,0,0, 0,sy,0,0, 0,0,1,0, tx,ty,0,1].
const MATRIX: number[] = [1.4, 0, 0, 0, 0, 1.4, 0, 0, 0, 0, 1, 0, 160, 30, 0, 1];

export function TransformDemo() {
  return (
    <view>
      <DemoSection title="Translate" caption="同一方块定义，靠 Group 的 translateX/Y 定位">
        <Rect x={0} y={50} width={80} height={80} color="#3b82f6" />
        <Group transform={{ translateX: 100, translateY: 0 }}>
          <Rect x={0} y={50} width={80} height={80} color="#22c55e" />
        </Group>
        <Group transform={{ translateX: 200, translateY: 20 }}>
          <Rect x={0} y={50} width={80} height={80} color="#ef4444" />
        </Group>
      </DemoSection>

      <DemoSection title="Rotate" caption="rotate(45°) 绕指定中心 — 灰色为旋转前参考">
        <Rect x={40} y={40} width={80} height={80} color="#cbd5e1" />
        <Group transform={{ rotate: 45, x: 160, y: 80 }}>
          <Rect x={120} y={40} width={80} height={80} color="#a855f7" />
        </Group>
        <Group transform={{ rotate: -30, x: 280, y: 80 }}>
          <Rect x={240} y={40} width={80} height={80} color="#f59e0b" />
        </Group>
      </DemoSection>

      <DemoSection title="Scale" caption="scaleX/scaleY 放大（含坐标缩放）">
        <Circle cx={60} cy={100} radius={25} color="#3b82f6" />
        <Group transform={{ scaleX: 1.6, scaleY: 1.6 }}>
          <Circle cx={150} cy={62} radius={25} color="#22c55e" />
        </Group>
      </DemoSection>

      <DemoSection title="嵌套 Group" caption="translate(外) × rotate(内) 组合变换">
        <Group transform={{ translateX: 40 }}>
          <Group transform={{ rotate: 30, x: 60, y: 100 }}>
            <Rect x={20} y={60} width={80} height={80} color="#ec4899" />
          </Group>
        </Group>
      </DemoSection>

      <DemoSection title="4×4 matrix" caption="number[16] column-major：scale 1.4 + translate">
        <Group transform={MATRIX}>
          <Rect x={0} y={0} width={70} height={70} color="#06b6d4" />
        </Group>
      </DemoSection>

      <DemoSection title="shape 级 transform" caption="transform 直接挂在形状上（不必包 Group）" height={130}>
        {/* 灰色参考：未旋转；蓝/橙：同一 Rect 定义，仅 transform 不同 */}
        <Rect x={20} y={10} width={60} height={60} color="#cbd5e1" />
        <Rect x={20} y={10} width={60} height={60} color="#3b82f6" transform={{ rotate: 45, x: 50, y: 40 }} />
        <Rect x={20} y={10} width={60} height={60} color="#f59e0b" transform={{ translateX: 160, scaleY: 0.6 }} />
      </DemoSection>

      <DemoSection title="op 数组组合" caption="transform={[op, op]} 依序复合：先 translate 后 rotate" height={130}>
        {/* 与上面嵌套 Group 小节等价：外平移 40 + 内绕(60,100) 旋转 30° */}
        <Group transform={[{ translateX: 40 }]}>
          <Group transform={[{ rotate: 30, x: 60, y: 100 }]}>
            <Rect x={20} y={60} width={80} height={80} color="#ec4899" />
          </Group>
        </Group>
        <Rect
          x={200}
          y={60}
          width={80}
          height={80}
          color="#14b8a6"
          transform={[{ translateX: -15 }, { rotate: 15, x: 240, y: 100 }]}
        />
      </DemoSection>
    </view>
  );
}
