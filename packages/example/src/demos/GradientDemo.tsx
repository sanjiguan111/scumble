import { Circle, LinearGradient, Rect, vec } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// Linear gradient demo. start/end are absolute logical-px points in the
// DemoSection's 360-wide viewport (USER_SPACE_ON_USE, matching RN-Skia).
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
    </view>
  );
}
