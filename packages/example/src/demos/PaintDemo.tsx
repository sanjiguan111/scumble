import { Path, Path2D } from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

const CAPS = ["butt", "round", "square"] as const;
const JOINS = ["miter", "round", "bevel"] as const;
const WIDTHS = [2, 8, 16];

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

export function PaintDemo() {
  return (
    <view>
      <DemoSection title="strokeCap" caption="butt / round / square（同一条线的端点）">
        {CAPS.map((cap, i) => (
          <Path
            key={cap}
            path={`M40 ${50 + i * 50} L320 ${50 + i * 50}`}
            color="#3b82f6"
            style="stroke"
            strokeWidth={20}
            strokeCap={cap}
          />
        ))}
      </DemoSection>

      <DemoSection title="strokeJoin" caption="miter / round / bevel（折线拐角）">
        {JOINS.map((join, i) => (
          <Path
            key={join}
            path={`M${30 + i * 110} 160 L${85 + i * 110} 50 L${140 + i * 110} 160`}
            color="#ef4444"
            style="stroke"
            strokeWidth={16}
            strokeJoin={join}
          />
        ))}
      </DemoSection>

      <DemoSection title="strokeWidth" caption="2 / 8 / 16">
        {WIDTHS.map((w, i) => (
          <Path
            key={w}
            path={`M40 ${50 + i * 55} L320 ${50 + i * 55}`}
            color="#22c55e"
            style="stroke"
            strokeWidth={w}
          />
        ))}
      </DemoSection>

      <DemoSection title="fillRule" caption="同一星形：nonzero(实心) vs even-odd(中心镂空)">
        <Path path={makeStar(90, 100, 55, 22)} color="#f59e0b" />
        <Path path={makeStar(250, 100, 55, 22)} color="#f59e0b" fillRule="even-odd" />
      </DemoSection>
    </view>
  );
}
