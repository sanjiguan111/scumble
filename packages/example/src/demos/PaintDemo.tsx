import { Path, Path2D } from "@gesso/react";

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

// Two nested rects as a single path (two subpaths). even-odd punches the inner
// rect out (回字); nonzero fills over it. makeStar's star outline is a
// non-self-intersecting polygon, for which both fill rules fill identically —
// so nested subpaths are needed to demonstrate even-odd visually.
function nestedRects(x: number): Path2D {
  return new Path2D().addRect(x, 40, 100, 100).addRect(x + 25, 65, 50, 50);
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

      <DemoSection
        title="fillRule"
        caption="嵌套路径：nonzero(内框被覆盖) vs even-odd(内框镂空成回字)"
      >
        <Path path={nestedRects(60)} color="#f59e0b" />
        <Path path={nestedRects(200)} color="#f59e0b" fillRule="even-odd" />
      </DemoSection>

      <DemoSection title="dash" caption="dash=[on,off] 间隔；dashOffset 平移相位" height={330}>
        <Path path="M40 50 L320 50" color="#3b82f6" style="stroke" strokeWidth={6} dash={[16, 8]} />
        <Path
          path="M40 105 L320 105"
          color="#22c55e"
          style="stroke"
          strokeWidth={6}
          dash={[2, 10]}
          strokeCap="round"
        />
        <Path
          path="M40 160 L320 160"
          color="#ec4899"
          style="stroke"
          strokeWidth={6}
          dash={[16, 8]}
          dashOffset={12}
        />
        <Path
          path={makeStar(180, 245, 60, 32)}
          color="#f59e0b"
          style="stroke"
          strokeWidth={4}
          dash={[10, 6]}
        />
      </DemoSection>
    </view>
  );
}
