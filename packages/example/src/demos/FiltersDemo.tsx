// Paint filters: image filters (<Blur>/<DropShadow>), color filters
// (<ColorMatrix>/<ColorBlend>) and the mask filter (<MaskBlur>) as
// declarative children of a shape. Several
// filters of the same kind compose in declaration order.

import {
  Blur,
  Circle,
  ColorBlend,
  ColorMatrix,
  DropShadow,
  Group,
  MaskBlur,
  Paint,
  Path,
  Path2D,
  Rect,
  RRect,
} from "@lynx-skity/react";

import { DemoSection } from "../components/DemoSection";

// 4×5 row-major (Skia layout): luminance weights → grayscale.
const GRAYSCALE = [
  0.2126,
  0.7152,
  0.0722,
  0,
  0, //
  0.2126,
  0.7152,
  0.0722,
  0,
  0, //
  0.2126,
  0.7152,
  0.0722,
  0,
  0, //
  0,
  0,
  0,
  1,
  0,
];

// Sepia approximation (the classic W3C filter matrix).
const SEPIA = [
  0.393,
  0.769,
  0.189,
  0,
  0, //
  0.349,
  0.686,
  0.168,
  0,
  0, //
  0.272,
  0.534,
  0.131,
  0,
  0, //
  0,
  0,
  0,
  1,
  0,
];

const FLOWER =
  "M150 40 C120 80 60 90 60 140 C60 190 110 200 150 170 C190 200 240 190 240 140 C240 90 180 80 150 40 Z";

export function FiltersDemo() {
  return (
    <view>
      <DemoSection title="Blur — image filter" caption="高斯模糊整个绘制层,sigma=8" height={200}>
        <Circle cx={110} cy={100} radius={60} color="#3b82f6">
          <Blur blur={8} />
        </Circle>
        <Rect x={190} y={40} width={120} height={120} color="#22c55e">
          <Blur blur={{ x: 2, y: 14 }} />
        </Rect>
      </DemoSection>

      <DemoSection
        title="DropShadow — image filter"
        caption="投影:dx/dy 偏移 + blur + color"
        height={200}
      >
        <Circle cx={100} cy={95} radius={55} color="#f59e0b">
          <DropShadow dx={0} dy={10} blur={10} color="#00000055" />
        </Circle>
        <RRect x={180} y={35} width={140} height={110} radii={16} color="#8b5cf6">
          <DropShadow dx={12} dy={4} blur={6} color="#ef444466" />
        </RRect>
      </DemoSection>

      <DemoSection
        title="Compose — blur + dropShadow"
        caption="同类多个滤镜按声明序组合(先声明先应用)"
        height={200}
      >
        <Path path={FLOWER} color="#ec4899">
          <Blur blur={2} />
          <DropShadow dx={0} dy={14} blur={8} color="#00000044" />
        </Path>
      </DemoSection>

      <DemoSection
        title="ColorMatrix — color filter"
        caption="左:原图 中:灰度 右:复古棕调"
        height={200}
      >
        <Group>
          <Path path={FLOWER} color="#ec4899" />
          <Group transform={{ translateX: 130 }}>
            <Path path={FLOWER} color="#ec4899">
              <ColorMatrix matrix={GRAYSCALE} />
            </Path>
          </Group>
          <Group transform={{ translateX: 260 }}>
            <Path path={FLOWER} color="#ec4899">
              <ColorMatrix matrix={SEPIA} />
            </Path>
          </Group>
        </Group>
      </DemoSection>

      <DemoSection
        title="ColorBlend — color filter"
        caption="src-in:用颜色替换彩色保留 alpha"
        height={200}
      >
        <Path path={FLOWER} color="#ec4899">
          <ColorBlend mode="src-in" color="#0ea5e9" />
        </Path>
      </DemoSection>

      <DemoSection
        title="MaskBlur — mask filter"
        caption="羽化 alpha 蒙版(inner style:内羽化)"
        height={200}
      >
        <Circle cx={110} cy={100} radius={70} color="#14b8a6">
          <MaskBlur blur={30} />
        </Circle>
        <Circle cx={260} cy={100} radius={70} color="#f43f5e">
          <MaskBlur blur={30} style="inner" />
        </Circle>
      </DemoSection>

      <DemoSection
        title="Paint stroke + filter"
        caption="<Paint style=stroke> 内的滤镜只作用于描边"
        height={200}
      >
        <Path path={new Path2D().addCircle(170, 100, 60)} color="#94a3b8">
          <Paint style="stroke" color="#6366f1" strokeWidth={10}>
            <Blur blur={4} />
          </Paint>
        </Path>
      </DemoSection>
    </view>
  );
}
