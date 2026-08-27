// Path boolean ops (Skia path ops): union / intersect / difference / xor via
// Path2D.op — a lazy composition the native renderer evaluates per frame
// (skity PathOp::Execute). No JS-side geometry computation.

import { Path, Path2D } from "@gesso/react";

import { DemoSection } from "../components/DemoSection";

// The same operand pair across the four ops: a circle overlapping a square.
const CIRCLE = new Path2D().addCircle(120, 100, 60);
const SQUARE = new Path2D().addRect(120, 40, 120, 120);

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

export function PathOpsDemo() {
  return (
    <view>
      <DemoSection
        title="Union — 圆 ∪ 方"
        caption="Path2D.op(circle, square, 'union')，渲染期布尔求值"
        height={200}
      >
        <Path path={Path2D.op(CIRCLE, SQUARE, "union")} color="#3b82f6" />
      </DemoSection>

      <DemoSection title="Intersect — 圆 ∩ 方" caption="两图形交集部分" height={200}>
        <Path path={Path2D.op(CIRCLE, SQUARE, "intersect")} color="#22c55e" />
      </DemoSection>

      <DemoSection title="Difference — 圆 − 方" caption="圆中方形区域被挖除" height={200}>
        <Path path={Path2D.op(CIRCLE, SQUARE, "difference")} color="#f59e0b" />
      </DemoSection>

      <DemoSection title="XOR — 圆 ⊕ 方" caption="并集减交集（不重叠部分）" height={200}>
        <Path path={Path2D.op(CIRCLE, SQUARE, "xor")} color="#ef4444" />
      </DemoSection>

      <DemoSection
        title="组合链 — (星 ∪ 圆) − 洞"
        caption="左深链：op(op(star, circle, union), hole, difference)"
        height={220}
      >
        {/* Left-deep chain flattens into one operand fold list. */}
        <Path
          path={Path2D.op(
            Path2D.op(makeStar(180, 110, 70, 30), new Path2D().addCircle(180, 110, 42), "union"),
            new Path2D().addCircle(180, 110, 16),
            "difference",
          )}
          color="#8b5cf6"
        />
      </DemoSection>

      <DemoSection
        title="右嵌套 — 方 − (圆 ∩ 方)"
        caption="右操作数为组合：nested PathOpList 子树"
        height={200}
      >
        {/* Right-nested composition rides the operand's nested sub-tree. */}
        <Path
          path={Path2D.op(
            new Path2D().addRect(60, 40, 240, 120),
            Path2D.op(CIRCLE, SQUARE, "intersect"),
            "difference",
          )}
          color="#0ea5e9"
        />
      </DemoSection>

      <DemoSection
        title="布尔结果 + trim / stroke"
        caption="trim 与 stroke 作用于布尔结果（x或形状截取 0.15–0.85）"
        height={200}
      >
        <Path
          path={Path2D.op(CIRCLE, SQUARE, "xor")}
          color="#a855f7"
          style="stroke"
          strokeWidth={6}
          strokeCap="round"
          start={0.15}
          end={0.85}
        />
      </DemoSection>
    </view>
  );
}
