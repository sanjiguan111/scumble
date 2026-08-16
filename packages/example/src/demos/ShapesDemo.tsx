import { useEffect, useState } from "@lynx-js/react";

import { Circle, Ellipse, Line, Points, Polygon, Polyline, Rect, RRect, vec } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

const OPACITIES = [0.25, 0.5, 0.75, 1];

// Animated sine wave: the points array updates every frame, shipped as a bare
// float vector through the SetGeometry channel (no path recompilation).
// setInterval drives repaint (rAF doesn't on Lynx).
function WaveAnimation() {
  const [t, setT] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setT((v) => (v >= 1 ? 0 : v + 0.02)), 50);
    return () => clearInterval(timer);
  }, []);
  const points = Array.from({ length: 64 }, (_, i) =>
    vec(20 + i * 6, 80 + Math.sin(t * Math.PI * 2 + i * 0.22) * 50),
  );
  return <Polyline points={points} color="#06b6d4" strokeWidth={4} />;
}

export function ShapesDemo() {
  return (
    <view>
      <DemoSection title="Fill" caption="Circle · Rect · RRect — color 接受命名色 / hex">
        <Circle cx={50} cy={100} radius={45} color="#3b82f6" />
        <Rect x={120} y={55} width={90} height={90} color="#22c55e" />
        <RRect x={240} y={55} width={90} height={90} radii={22} color="#ef4444" />
      </DemoSection>

      <DemoSection
        title="Ellipse · Line"
        caption="Ellipse rx/ry；Line 默认 stroke（线条无内部可填充）"
      >
        <Ellipse cx={65} cy={100} rx={55} ry={38} color="#8b5cf6" />
        <Line x1={150} y1={40} x2={230} y2={150} color="#0ea5e9" strokeWidth={5} />
        <Line
          x1={230}
          y1={40}
          x2={150}
          y2={150}
          color="#f97316"
          strokeWidth={5}
          strokeCap="round"
        />
      </DemoSection>

      <DemoSection
        title="Polyline · Polygon"
        caption="points 接受 SVG 字符串 / vec() 数组；Polygon 自动闭合"
      >
        <Polyline points="20,40 60,120 100,50 140,130" color="#14b8a6" strokeWidth={4} />
        <Polygon
          points={[vec(220, 30), vec(300, 60), vec(280, 140), vec(200, 120)]}
          color="#ec4899"
        />
        <Polyline
          points={[vec(220, 30), vec(300, 60), vec(280, 140), vec(200, 120)]}
          color="#6366f1"
          style="stroke"
          strokeWidth={3}
        />
      </DemoSection>

      <DemoSection
        title="Points (drawPoints)"
        caption="mode: points(零长线段+round cap，直径=strokeWidth) / lines(点对) / polygon(开放折线)"
      >
        <Points points="40,60 80,120 120,50 20,130 100,140" color="#3b82f6" strokeWidth={10} />
        <Points points="160,40 220,140 160,140 220,40" mode="lines" color="#f97316" strokeWidth={3} />
        <Points
          points={[vec(250, 40), vec(320, 70), vec(255, 100), vec(320, 130), vec(250, 145)]}
          mode="polygon"
          color="#22c55e"
          strokeWidth={3}
          strokeCap="round"
        />
      </DemoSection>

      <DemoSection
        title="Points 动画"
        caption="顶点每帧更新 → SetGeometry 增量通道（不重编 path）"
        height={180}
      >
        <WaveAnimation />
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
