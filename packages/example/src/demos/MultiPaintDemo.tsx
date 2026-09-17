import { Circle, Paint, Path, Path2D, RRect } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// 同心星形 path（PaintDemo 同款）。
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

export function MultiPaintDemo() {
  return (
    <view>
      <DemoSection
        title="multi-stroke 同心描边"
        caption="同一 shape 的 3 个 stroke paint：宽→窄依次叠画（单槽通道只能有一个 stroke）"
        height={200}
      >
        <Circle cx={180} cy={100} radius={70}>
          <Paint style="stroke" color="#1e3a8a" strokeWidth={24} />
          <Paint style="stroke" color="#3b82f6" strokeWidth={12} />
          <Paint style="stroke" color="#93c5fd" strokeWidth={3} />
        </Circle>
      </DemoSection>

      <DemoSection
        title="fill + halo stroke"
        caption="形状自带 fill 作基础 pass，再叠两层描边：半透明宽光晕 + 实线细边"
        height={200}
      >
        <RRect x={80} y={40} width={200} height={120} radii={16}>
          <Paint style="stroke" color="#f9731655" strokeWidth={18} />
          <Paint style="stroke" color="#f97316" strokeWidth={3} />
        </RRect>
      </DemoSection>

      <DemoSection
        title="per-pass opacity"
        caption="每个 paint 独立 opacity：三个半透明圆自然混色（单槽通道的 opacity 由两 paints 共享）"
        height={220}
      >
        <Circle cx={120} cy={110} radius={60}>
          <Paint color="#ef4444" opacity={0.55} />
        </Circle>
        <Circle cx={180} cy={110} radius={60}>
          <Paint color="#22c55e" opacity={0.55} />
        </Circle>
        <Circle cx={150} cy={70} radius={60}>
          <Paint color="#3b82f6" opacity={0.55} />
        </Circle>
      </DemoSection>

      <DemoSection
        title="per-pass dash & cap"
        caption="同一颗星：dashed 描边 + 实线细描边 + 半透明填充，三 pass 各自独立"
        height={260}
      >
        <Path path={makeStar(180, 130, 90, 45)}>
          <Paint color="#f59e0b44" />
          <Paint style="stroke" color="#f59e0b" strokeWidth={10} dash={[12, 8]} strokeCap="round" />
          <Paint style="stroke" color="#7c2d12" strokeWidth={2} />
        </Path>
      </DemoSection>

      <DemoSection
        title="per-pass blendMode"
        caption="两个 fill paint 叠画：底层 src-over 铺色，顶层 multiply 混入背景"
        height={200}
      >
        <RRect x={40} y={40} width={280} height={120} radii={12}>
          <Paint color="#e0f2fe" />
          <Paint color="#f472b6" blendMode="multiply" />
        </RRect>
      </DemoSection>
    </view>
  );
}
