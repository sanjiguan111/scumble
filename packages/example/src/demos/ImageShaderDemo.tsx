// <ImageShader>: a bitmap as a shape's fill/stroke texture. Like the
// gradients it is a declarative data-only child; the bitmap loads via the
// same platform loader + ImageStore as <Image>, so a shader-filled shape
// stays blank until its pixels land.

import { Circle, Group, ImageShader, Line, Path, Rect, useImage } from "@gesso/react";

import { DemoSection } from "../components/DemoSection";

// 64×64 four-quadrant probe (red/green/blue/yellow; bottom half alpha≈0.55)
// — same inline PNG as ImageDemo; small tiles read tiling modes well.
const QUADRANT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAcElEQVR42u3QMQEAIAwDsApDIsIQgZchowc5YiCZZJpyygQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgIAPArJmN81NlQABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIEPBBwAP+Bc3Swt5TugAAAABJRU5ErkJggg==";

const REMOTE_URL = "https://picsum.photos/seed/gesso/300/200";

export function ImageShaderDemo() {
  const local = useImage(QUADRANT_PNG);
  const remote = useImage(REMOTE_URL);

  return (
    <view>
      <DemoSection
        title="decal + cover — rect 内裁切填充"
        caption="图 fit 进 rect,rect 外透明(decal);第二个用 contain 留 letterbox"
        height={210}
      >
        <Rect x={10} y={10} width={180} height={180}>
          <ImageShader
            image={local}
            fit="cover"
            rect={{ x: 10, y: 10, width: 180, height: 180 }}
            tx="decal"
            ty="decal"
          />
        </Rect>
        <Rect x={200} y={10} width={150} height={180}>
          <ImageShader
            image={local}
            fit="contain"
            rect={{ x: 200, y: 10, width: 150, height: 180 }}
            tx="decal"
            ty="decal"
          />
        </Rect>
      </DemoSection>

      <DemoSection
        title="repeat / mirror 平铺"
        caption="64×64 小图以 1:1 平铺大 rect;mirror 沿轴向镜像"
        height={200}
      >
        <Group>
          <Rect x={10} y={10} width={180} height={180}>
            <ImageShader image={local} tx="repeat" ty="repeat" />
          </Rect>
        </Group>
        <Rect x={200} y={10} width={150} height={180}>
          <ImageShader image={local} tx="mirror" ty="repeat" />
        </Rect>
      </DemoSection>

      <DemoSection
        title="非矩形几何填充"
        caption="Circle 与 Path 用图作 fill(shader 跟随几何)"
        height={220}
      >
        <Circle cx={100} cy={110} radius={80}>
          <ImageShader
            image={local}
            fit="cover"
            rect={{ x: 20, y: 30, width: 160, height: 160 }}
            tx="decal"
            ty="decal"
          />
        </Circle>
        <Path path="M220 30 L340 30 L340 150 Q280 190 220 150 Z">
          <ImageShader
            image={local}
            fit="cover"
            rect={{ x: 220, y: 30, width: 120, height: 120 }}
            tx="repeat"
            ty="repeat"
          />
        </Path>
      </DemoSection>

      <DemoSection
        title="stroke 纹理"
        caption="粗描边用图作 stroke paint(style=stroke 路由)"
        height={140}
      >
        <Rect x={10} y={20} width={160} height={100} strokeWidth={16} style="stroke">
          <ImageShader image={local} tx="repeat" ty="repeat" />
        </Rect>
        <Line x1={200} y1={30} x2={340} y2={110} strokeWidth={16} style="stroke">
          <ImageShader image={local} tx="mirror" ty="mirror" />
        </Line>
      </DemoSection>

      <DemoSection
        title="http(s) 异步 shader"
        caption="远程图到达后自动补画(shader 与 <Image> 共享 ImageStore)"
        height={200}
      >
        <Circle cx={100} cy={100} radius={80}>
          <ImageShader
            image={remote}
            fit="cover"
            rect={{ x: 20, y: 20, width: 160, height: 160 }}
            tx="decal"
            ty="decal"
          />
        </Circle>
        <Rect x={200} y={20} width={140} height={160}>
          <ImageShader
            image={remote}
            fit="cover"
            rect={{ x: 200, y: 20, width: 140, height: 160 }}
            tx="decal"
            ty="decal"
          />
        </Rect>
      </DemoSection>
    </view>
  );
}
