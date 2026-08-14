import {
  Circle,
  LinearGradient,
  Paint,
  RadialGradient,
  Rect,
  SweepGradient,
  TwoPointConicalGradient,
  vec,
} from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// Gradient demo. All shader geometry (start/end, c, r) is absolute logical px
// in the DemoSection's 360-wide viewport (USER_SPACE_ON_USE, matching RN-Skia);
// sweep angles are degrees.
export function GradientDemo() {
  return (
    <view>
      <DemoSection title="linear · 2 stops" caption="水平 红→蓝" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <LinearGradient start={vec(20, 0)} end={vec(340, 0)} colors={["#ff0000", "#0000ff"]} />
        </Rect>
      </DemoSection>

      <DemoSection title="linear · multi-stop" caption="黄→绿→青（默认均匀分布）" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <LinearGradient
            start={vec(20, 0)}
            end={vec(340, 0)}
            colors={["#facc15", "#22c55e", "#06b6d4"]}
          />
        </Rect>
      </DemoSection>

      <DemoSection title="linear · on circle" caption="圆上的对角渐变">
        <Circle cx={180} cy={100} radius={70}>
          <LinearGradient
            start={vec(110, 30)}
            end={vec(250, 170)}
            colors={["#a855f7", "#ec4899"]}
          />
        </Circle>
      </DemoSection>

      <DemoSection title="linear · mode repeat" caption="渐变段在范围外重复" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <LinearGradient
            start={vec(140, 0)}
            end={vec(220, 0)}
            colors={["#ef4444", "#3b82f6"]}
            mode="repeat"
          />
        </Rect>
      </DemoSection>

      <DemoSection title="radial · on circle" caption="中心亮 → 边缘暗">
        <Circle cx={110} cy={100} radius={70}>
          <RadialGradient c={vec(110, 100)} r={70} colors={["#fefce8", "#f97316"]} />
        </Circle>
        <Circle cx={260} cy={100} radius={70}>
          <RadialGradient
            c={vec(260, 100)}
            r={70}
            colors={["#22d3ee", "#1e3a8a"]}
            positions={[0, 0.7]}
          />
        </Circle>
      </DemoSection>

      <DemoSection title="radial · mode mirror" caption="渐变段镜像往返" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <RadialGradient c={vec(180, 50)} r={40} colors={["#ef4444", "#3b82f6"]} mode="mirror" />
        </Rect>
      </DemoSection>

      <DemoSection title="sweep · full turn" caption="0–360° 色相环" height={140}>
        <Rect x={20} y={20} width={320} height={100}>
          <SweepGradient
            c={vec(180, 70)}
            colors={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#ef4444"]}
          />
        </Rect>
      </DemoSection>

      <DemoSection title="sweep · partial arc" caption="90°–270° 局部扇形" height={140}>
        <Rect x={20} y={20} width={320} height={100}>
          <SweepGradient c={vec(180, 70)} start={90} end={270} colors={["#f97316", "#06b6d4"]} />
        </Rect>
      </DemoSection>

      <DemoSection title="conical · off-center focal" caption="焦点偏移的两圆渐变">
        <Circle cx={180} cy={100} radius={70}>
          <TwoPointConicalGradient
            start={vec(150, 70)}
            startR={0}
            end={vec(180, 100)}
            endR={70}
            colors={["#fef9c3", "#7c3aed"]}
          />
        </Circle>
      </DemoSection>

      <DemoSection title="conical · ring" caption="内圆半径 > 0" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <TwoPointConicalGradient
            start={vec(180, 50)}
            startR={10}
            end={vec(180, 50)}
            endR={90}
            colors={["#ef4444", "#3b82f6"]}
          />
        </Rect>
      </DemoSection>

      <DemoSection title="stroke · gradient" caption="fill 渐变 + 描边渐变（双 pass）">
        <Circle cx={180} cy={100} radius={70}>
          <LinearGradient
            start={vec(110, 30)}
            end={vec(250, 170)}
            colors={["#a855f7", "#ec4899"]}
          />
          <Paint style="stroke" strokeWidth={8}>
            <SweepGradient
              c={vec(180, 100)}
              colors={["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#ef4444"]}
            />
          </Paint>
        </Circle>
      </DemoSection>

      <DemoSection title="stroke · solid via <Paint>" caption="Paint 纯色描边覆盖" height={100}>
        <Rect x={20} y={20} width={320} height={60}>
          <LinearGradient start={vec(20, 0)} end={vec(340, 0)} colors={["#0ea5e9", "#6366f1"]} />
          <Paint style="stroke" strokeWidth={6} color="#f59e0b" />
        </Rect>
      </DemoSection>
    </view>
  );
}
