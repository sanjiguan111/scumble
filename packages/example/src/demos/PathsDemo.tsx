import { useEffect, useState } from "react";

import { Path, Path2D } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// Heart via cubic beziers (SVG d string → parsed → base64).
const HEART =
  "M150 60 C100 20 30 40 30 100 C30 150 90 190 150 220 C210 190 270 150 270 100 C270 40 200 20 150 60 Z";

// Open elliptical arc via the A command (endpoint parametrization).
const ARC = "M40 150 A 60 60 0 0 1 260 150";

function makeStar(cx: number, cy: number, outer: number, inner: number): Path2D {
  const p = new Path2D();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) p.moveTo(x, y);
    else p.lineTo(x, y);
  }
  p.close();
  return p;
}

// Animated draw-on effect: sweep `end` 0→1 (setInterval drives repaint — rAF
// doesn't on Lynx).
function TrimAnimation() {
  const [end, setEnd] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setEnd((e) => (e >= 1 ? 0 : e + 0.02)), 50);
    return () => clearInterval(timer);
  }, []);
  return <Path path={HEART} color="#22c55e" style="stroke" strokeWidth={6} end={end} />;
}

export function PathsDemo() {
  return (
    <view>
      <DemoSection
        title="SVG path d — heart"
        caption="cubic bezier，字符串解析为嵌套 FlatBuffer"
        height={240}
      >
        <Path path={HEART} color="#ef4444" />
      </DemoSection>

      <DemoSection title="Arc (A command)" caption="椭圆弧端点参数化 large-arc/sweep flags">
        <Path path={ARC} color="#3b82f6" style="stroke" strokeWidth={8} />
      </DemoSection>

      <DemoSection title="Path trim — start/end" caption="start 0.25 / end 0.75，截取路径中段 50%">
        {/* Full path faint underneath, trimmed path on top . */}
        <Path path={ARC} color="#3b82f6" style="stroke" strokeWidth={2} opacity={0.25} />
        <Path
          path={ARC}
          color="#3b82f6"
          style="stroke"
          strokeWidth={8}
          strokeCap="round"
          start={0.25}
          end={0.75}
        />
      </DemoSection>

      <DemoSection title="Path trim — animated" caption="end 0→1 循环（绘制进度效果）" height={240}>
        <TrimAnimation />
      </DemoSection>

      <DemoSection
        title="Path trim — multi-contour"
        caption="两圆各自独立截取 0.25–0.75（Skia trim 语义，每 contour 独立）"
      >
        {/* Two circles = two contours; each contour is trimmed independently
            against its own length (Skia SkTrimPathEffect semantics). */}
        <Path
          path={new Path2D().addCircle(110, 100, 60).addCircle(290, 100, 60)}
          color="#8b5cf6"
          style="stroke"
          strokeWidth={6}
          start={0.25}
          end={0.75}
        />
      </DemoSection>

      <DemoSection title="Path2D 链式 — star" caption="moveTo/lineTo/close 命令式构建">
        <Path path={makeStar(150, 100, 58, 24)} color="#f59e0b" />
      </DemoSection>

      <DemoSection title="addCircle / addRoundedRect" caption="Path2D 内置形状方法">
        <Path path={new Path2D().addCircle(60, 100, 45)} color="#22c55e" />
        <Path path={new Path2D().addRoundedRect(140, 55, 180, 90, 28)} color="#a855f7" />
      </DemoSection>
    </view>
  );
}
