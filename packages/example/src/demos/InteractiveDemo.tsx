import { useEffect, useState } from "@lynx-js/react";
import { Canvas, Circle, Group, Path, Path2D, Rect } from "@gesso/react";

import { DemoSection } from "../components/DemoSection";

const TAP_COLORS = ["#ef4444", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7"];

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

// Approximate a circular arc with line segments (Path2D has no center-form arc()).
function arcPath(cx: number, cy: number, r: number, deg: number): Path2D {
  const p = new Path2D();
  if (deg <= 0) return p;
  p.moveTo(cx + r, cy);
  for (let d = 3; d <= deg; d += 3) {
    const a = (d * Math.PI) / 180;
    p.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  return p;
}

export function InteractiveDemo() {
  const [cidx, setCidx] = useState(0);
  const [show, setShow] = useState(true);
  const [t, setT] = useState(0);

  // One shared timer loop drives all three animations (single per-frame setState
  // → one layout-pass flush, see RENDER_ARCHITECTURE §11.6). NOTE: requestAnimationFrame
  // did not drive redraws on the iOS Lynx JS runtime (canvases stayed blank);
  // setInterval does.
  useEffect(() => {
    console.log("[skity-demo] InteractiveDemo animation timer started");
    const id = setInterval(() => setT((v) => v + 1), 16);
    return () => clearInterval(id);
  }, []);

  const rot = (t * 2) % 360;
  const pulse = 35 + 12 * Math.sin(t * 0.05);
  const arcDeg = ((t % 120) / 120) * 360;

  console.log("[skity-demo] InteractiveDemo animation timer tick == ", t);

  return (
    <view>
      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          点击切色 · {TAP_COLORS[cidx]}
        </text>
        <view
          bindtap={() => setCidx((i) => (i + 1) % TAP_COLORS.length)}
          style={{ width: "100%", height: "150px" }}
        >
          <Canvas style={{ width: "100%", height: "150px" }} viewPort={{ width: 100, height: 100 }}>
            <Circle cx={50} cy={50} radius={35} color={TAP_COLORS[cidx]} />
          </Canvas>
        </view>
        <text style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
          纯 style 变更（fill color）触发 command → repaint
        </text>
      </view>

      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          点击增/删节点 · {show ? "ON" : "OFF"}
        </text>
        <view bindtap={() => setShow((s) => !s)} style={{ width: "100%", height: "150px" }}>
          <Canvas style={{ width: "100%", height: "150px" }} viewPort={{ width: 360, height: 150 }}>
            <Circle cx={70} cy={75} radius={45} color="#3b82f6" />
            {show ? <Rect x={150} y={25} width={100} height={100} color="#ff00ff" /> : null}
          </Canvas>
        </view>
        <text style={{ fontSize: "12px", color: "#6b7280", marginTop: "6px" }}>
          mount/unmount 走 InsertNode/RemoveNode（retained tree 结构变更）
        </text>
      </view>

      <DemoSection title="旋转动画" caption="Group transform rotate（诊断中）">
        <Group transform={{ rotate: rot, x: 150, y: 100 }}>
          <Path path={makeStar(150, 100, 55, 22)} color="#f59e0b" />
        </Group>
      </DemoSection>

      <DemoSection title="脉动" caption="radius 随 sin 波动">
        <Circle cx={150} cy={100} radius={pulse} color="#8b5cf6" />
      </DemoSection>

      <DemoSection title="进度环" caption="Path2D 线段近似弧，0→360° 循环">
        <Path
          path={arcPath(150, 100, 55, arcDeg)}
          color="#3b82f6"
          style="stroke"
          strokeWidth={10}
          strokeCap="round"
        />
      </DemoSection>
    </view>
  );
}
