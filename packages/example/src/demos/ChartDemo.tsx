// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// The Victory-lane vertical slice: a minimal line chart built ENTIRELY from
// the @scumble/skia-compat adapter surface (the RN-Skia API) over scumble,
// with d3-scale/d3-shape running unmodified for scales and path generation —
// the exact division of labor a ported Victory Native would have:
//
//   d3 (pure JS)          → scales, line/area d-strings, ticks
//   skia-compat shim      → SkPath/PathBuilder, Path/Line/Text/Group, useFont
//   font metrics (W2)     → y-label gutter width measured in JS, right-aligned labels
//
// W3 transitions, both lanes a port needs:
//   - FIRST MOUNT draw-in rides scumble's declarative trim animation — the
//     render thread interpolates pathEnd 0→1, zero JS per frame.
//   - Tap swaps datasets with a path MORPH: useTween (the withTiming
//     replacement — setInterval, rAF is dead on the iOS Lynx runtime) drives
//     t, each frame morphs line/area/markers via Skia.Path.Interpolate
//     (both datasets are 12-point monotoneX, so command structures match).

import { useEffect, useMemo, useState } from "@lynx-js/react";
import { createAnimation } from "@scumble/react";
import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";

import {
  Canvas,
  DashPathEffect,
  Easing,
  Group,
  Line,
  Path,
  Skia,
  Text,
  useFont,
  useTween,
  type SkPath,
} from "@scumble/skia-compat";

import { PRESS_START_2P } from "./fontData";

const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const DATASETS = {
  revenue: {
    label: "Revenue",
    color: "#22c55e",
    values: [42, 55, 48, 71, 66, 89, 84, 102, 96, 118, 110, 131],
  },
  costs: {
    label: "Costs",
    color: "#f97316",
    values: [60, 58, 63, 55, 61, 57, 64, 60, 58, 66, 62, 59],
  },
} as const;

// Logical coordinate space (the canvas maps it onto the styled surface,
// xMidYMid meet) — width-independent layout.
const W = 360;
const H = 240;

// First-mount draw-in: render-thread trim, zero JS per frame.
const DRAW_IN = createAnimation({
  property: "pathEnd",
  from: 0,
  to: 1,
  duration: 900,
  easing: "ease-out",
});

const MORPH_MS = 450;

/** Everything derived from one dataset — rebuilt on tap, morphed per frame. */
function seriesOf(
  values: readonly number[],
  color: string,
  plot: { x: number; y: number; w: number; h: number },
) {
  const x = scalePoint<number>()
    .domain(values.map((_, i) => i))
    .range([plot.x + plot.w / 24, plot.x + plot.w - plot.w / 24]);
  const y = scaleLinear()
    .domain([0, Math.max(...values)])
    .range([plot.y + plot.h, plot.y])
    .nice();
  const lineD =
    line<number>()
      .x((_, i) => x(i) ?? 0)
      .y((v) => y(v) ?? 0)
      .curve(curveMonotoneX)(values) ?? "";
  const areaD =
    area<number>()
      .x((_, i) => x(i) ?? 0)
      .y0(() => y(0) ?? 0)
      .y1((v) => y(v) ?? 0)
      .curve(curveMonotoneX)(values) ?? "";
  const markers = Skia.PathBuilder.Make();
  values.forEach((v, i) => markers.addCircle(x(i) ?? 0, y(v) ?? 0, 3));
  return {
    color,
    x,
    y,
    ticks: y.ticks(4),
    line: Skia.Path.MakeFromSVGString(lineD)!,
    area: Skia.Path.MakeFromSVGString(areaD)!,
    markers: markers.build(),
  };
}

type Series = ReturnType<typeof seriesOf>;

export function ChartDemo() {
  const [which, setWhich] = useState<"revenue" | "costs">("revenue");
  const font = useFont(PRESS_START_2P, 10);
  const tween = useTween(1);
  // The morph SOURCE series (captured at tap time, mid-flight included).
  const [morphFrom, setMorphFrom] = useState<Series | null>(null);
  // Trim draw-in only for the first mount: the morph churns the path prop
  // every frame afterwards, and a persistent animate would risk re-running
  // the trim on each update.
  const [drewIn, setDrewIn] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setDrewIn(true), 900);
    return () => clearTimeout(id);
  }, []);

  // --- the W2 payoff: measure the y labels in JS and derive the gutter ---
  // ticks() depends on the domain only, so a provisional scale settles the
  // tick values (and thus the label widths) before the plot box exists.
  const yMax = Math.max(...DATASETS[which].values);
  const tickTexts = scaleLinear()
    .domain([0, yMax])
    .nice()
    .ticks(4)
    .map((t) => `${t}`);
  const gutter = Math.max(...tickTexts.map((t) => font.measureText(t))) + 10;
  const margin = { top: 12, right: 12, bottom: 22, left: gutter };
  const plot = {
    x: margin.left,
    y: margin.top,
    w: W - margin.left - margin.right,
    h: H - margin.top - margin.bottom,
  };

  const target = useMemo(
    () => seriesOf(DATASETS[which].values, DATASETS[which].color, plot),
    [which, gutter], // plot derives from gutter deterministically
  );

  const t = tween.value;
  const morphing = morphFrom !== null && t < 1;
  // Per-frame morph: same command structures (12-pt monotoneX / 12 circles),
  // so Interpolate never nulls in practice; the fallback snaps anyway.
  const mix = (from: SkPath, to: SkPath): SkPath =>
    morphing ? (Skia.Path.Interpolate(from, to, t) ?? to) : to;
  const series =
    morphing && morphFrom
      ? {
          ...target,
          line: mix(morphFrom.line, target.line),
          area: mix(morphFrom.area, target.area),
          markers: mix(morphFrom.markers, target.markers),
        }
      : target;

  const swap = () => {
    // Capture what is VISIBLE right now (mid-flight included) as the source.
    const from =
      morphing && morphFrom
        ? {
            ...target,
            line: mix(morphFrom.line, target.line),
            area: mix(morphFrom.area, target.area),
            markers: mix(morphFrom.markers, target.markers),
          }
        : target;
    setMorphFrom(from);
    setWhich(which === "revenue" ? "costs" : "revenue");
    tween.start({ duration: MORPH_MS, easing: Easing.easeInOutCubic });
  };

  const baseline = plot.y + plot.h;

  return (
    <view>
      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          Chart — Victory lane (skia-compat + d3)
        </text>
        <text style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
          d3 原样运行 · 入场描线 = 渲染线程 trim 动画(零 JS)· 点击切换数据 = useTween +
          Path.Interpolate 逐帧 morph
        </text>
        <view bindtap={swap}>
          <Canvas
            style={{ width: "100%", height: 260 }}
            viewPort={{ x: 0, y: 0, width: W, height: H }}
          >
            {/* Plot area — clip keeps the monotone curve inside its gutter box. */}
            <Group clip={{ rect: [plot.x, plot.y, plot.w, plot.h] }}>
              <Path path={series.area} color={target.color} opacity={0.15} />
              <Path
                path={series.line}
                color={target.color}
                style="stroke"
                strokeWidth={2.5}
                animate={drewIn ? undefined : DRAW_IN}
              />
              <Path path={series.markers} color={target.color} />
            </Group>

            {/* Grid: dashed lines via the DashPathEffect child lane. */}
            {target.ticks.map((tt) =>
              tt === 0 ? null : (
                <Line
                  key={`g${tt}`}
                  p1={{ x: plot.x, y: target.y(tt) ?? 0 }}
                  p2={{ x: plot.x + plot.w, y: target.y(tt) ?? 0 }}
                  color="#e5e7eb"
                  strokeWidth={1}
                >
                  <DashPathEffect intervals={[3, 4]} />
                </Line>
              ),
            )}

            {/* Baseline axis (solid). */}
            <Line
              p1={{ x: plot.x, y: baseline }}
              p2={{ x: plot.x + plot.w, y: baseline }}
              color="#9ca3af"
              strokeWidth={1.5}
            />

            {/* Y labels: right-aligned against the measured gutter (baseline y). */}
            {target.ticks.map((tt, i) => (
              <Text
                key={`y${tt}-${i}`}
                x={margin.left - 8 - font.measureText(`${tt}`)}
                y={(target.y(tt) ?? 0) + 3}
                text={`${tt}`}
                color="#6b7280"
                font={font}
              />
            ))}

            {/* X labels: month initials under each point. */}
            {MONTHS.map((m, i) => (
              <Text
                key={`x${i}`}
                x={(target.x(i) ?? 0) - 5}
                y={baseline + 16}
                text={m}
                color="#6b7280"
                font={font}
              />
            ))}
          </Canvas>
        </view>
      </view>
    </view>
  );
}
