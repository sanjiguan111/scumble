// <Image>: bitmap drawing with declarative fit modes. Sources load
// asynchronously on the platform side (data URI decodes locally, http goes
// through the built-in loader) — each node stays blank until its pixels land.

import { useEffect, useState } from "@lynx-js/react";

import { Group, Image, Rect, useImage, type Fit, type ImageSamplingOptions } from "@scumble/react";

import { DemoSection } from "../components/DemoSection";

// 64×64 four-quadrant probe (red/green/blue/yellow; bottom half alpha≈0.55)
// — small enough to inline, colorful enough to read fit crops and blends.
const QUADRANT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAcElEQVR42u3QMQEAIAwDsApDIsIQgZchowc5YiCZZJpyygQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIECBAgIAPArJmN81NlQABAgQIECBAgAABAgQIECBAgAABAgQIECBAgAABAgQIEPBBwAP+Bc3Swt5TugAAAABJRU5ErkJggg==";

const REMOTE_URL = "https://picsum.photos/seed/scumble/300/200";

const FITS: { fit: Fit; caption: string }[] = [
  { fit: "fill", caption: "拉伸变形" },
  { fit: "contain", caption: "完整显示留白" },
  { fit: "cover", caption: "填满裁切" },
  { fit: "fitWidth", caption: "宽撑满" },
  { fit: "fitHeight", caption: "高撑满" },
  { fit: "none", caption: "原尺寸居中" },
  { fit: "scaleDown", caption: "只缩不放大" },
];

// 64×64 → 4.4× 放大:nearest 呈像素块,linear 平滑;mipmap 生效依赖 GPU 纹理带 mip 链。
// cubic B/C 已透传但当前发布版 skity 未消费,待其发版后生效,故不入对比。
const SAMPLINGS: { sampling: ImageSamplingOptions; caption: string }[] = [
  { sampling: {}, caption: "默认 linear" },
  { sampling: { filter: "nearest" }, caption: "nearest 像素块" },
  { sampling: { mipmap: "linear" }, caption: "mipmap linear" },
  { sampling: { filter: "nearest", mipmap: "nearest" }, caption: "nearest+mipmap" },
];

export function ImageDemo() {
  const local = useImage(QUADRANT_PNG);
  const remote = useImage(REMOTE_URL);

  // Animate the destination rect: dst-only changes must NOT re-issue a load
  // (the uri stays the same entry in the native image store).
  const [grow, setGrow] = useState(false);
  useEffect(() => {
    const t = setInterval(() => setGrow((g) => !g), 1500);
    return () => clearInterval(t);
  }, []);

  return (
    <view>
      <DemoSection
        title="data URI — 零网络"
        caption="内联 64×64 四象限 PNG(下半 55% 透明)"
        height={200}
      >
        <Image image={local} x={10} y={10} width={180} height={180} />
        <Rect x={200} y={10} width={150} height={180} color="#1f2937" />
        <Image image={local} rect={{ x: 200, y: 10, width: 150, height: 180 }} fit="cover" />
      </DemoSection>

      <DemoSection
        title="http(s) — 异步到达"
        caption="picsum 远程图,加载完成后自动上屏"
        height={220}
      >
        <Image image={remote} x={10} y={10} width={200} height={140} />
        <Group opacity={0.6}>
          <Image image={remote} x={220} y={10} width={130} height={140} fit="cover" />
        </Group>
        <Image image="https://invalid.example/missing.png" x={10} y={158} width={80} height={50} />
        <Rect x={220} y={158} width={130} height={50} color="#374151" />
      </DemoSection>

      <DemoSection
        title="fit 七值画廊"
        caption={`上排→下排: ${FITS.map((f) => f.fit).join(" · ")}(同一图,同一非等比 80×64 目标)`}
        height={180}
      >
        {FITS.map((f, i) => (
          <Group key={f.fit}>
            <Rect
              x={8 + (i % 4) * 88}
              y={8 + Math.floor(i / 4) * 88}
              width={80}
              height={64}
              color="#111827"
            />
            <Image
              image={local}
              x={8 + (i % 4) * 88}
              y={8 + Math.floor(i / 4) * 88}
              width={80}
              height={64}
              fit={f.fit}
            />
          </Group>
        ))}
      </DemoSection>

      <DemoSection title="目标矩形动画" caption="宽高定时切换,不重发图片请求" height={200}>
        <Image
          image={local}
          x={20}
          y={10}
          width={grow ? 280 : 140}
          height={grow ? 160 : 80}
          fit="cover"
        />
      </DemoSection>

      <DemoSection
        title="sampling 采样对比"
        caption="同一 64×64 图放大 4.4×:nearest 块状 / linear 平滑;mipmap 需纹理带 mip 链"
        height={230}
      >
        {SAMPLINGS.map((s, i) => (
          <Group key={i}>
            <Rect
              x={8 + (i % 2) * 158}
              y={8 + Math.floor(i / 2) * 100}
              width={150}
              height={92}
              color="#111827"
            />
            <Image
              image={local}
              x={8 + (i % 2) * 158}
              y={8 + Math.floor(i / 2) * 100}
              width={150}
              height={92}
              fit="fill"
              sampling={s.sampling}
            />
          </Group>
        ))}
      </DemoSection>
    </view>
  );
}
