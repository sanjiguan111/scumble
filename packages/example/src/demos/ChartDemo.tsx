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
// Tap the chart to swap datasets (the re-render lane — every d-string,
// builder path, and label re-resolves through one layout-pass flush).

import { useState } from "@lynx-js/react";
import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";

import {
  Canvas,
  DashPathEffect,
  Group,
  Line,
  Path,
  Skia,
  Text,
  useFont,
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

export function ChartDemo() {
  const [which, setWhich] = useState<"revenue" | "costs">("revenue");
  const set = DATASETS[which];
  const font = useFont(PRESS_START_2P, 10);

  // --- the W2 payoff: measure the y labels in JS and derive the gutter ---
  // ticks() depends on the domain only, so a provisional scale settles the
  // tick values (and thus the label widths) before the plot box exists.
  const yMax = Math.max(...set.values);
  const yTicks = scaleLinear().domain([0, yMax]).nice().ticks(4);
  const tickTexts = yTicks.map((t) => `${t}`);
  const gutter = Math.max(...tickTexts.map((t) => font.measureText(t))) + 10;
  const margin = { top: 12, right: 12, bottom: 22, left: gutter };

  const plot = {
    x: margin.left,
    y: margin.top,
    w: W - margin.left - margin.right,
    h: H - margin.top - margin.bottom,
  };

  // --- d3 runs unmodified: the scales and d-string generators ---
  const x = scalePoint<number>()
    .domain(set.values.map((_, i) => i))
    .range([plot.x + plot.w / 24, plot.x + plot.w - plot.w / 24]);
  const y = scaleLinear()
    .domain([0, yMax])
    .range([plot.y + plot.h, plot.y])
    .nice();

  const lineD =
    line<number>()
      .x((_, i) => x(i) ?? 0)
      .y((v) => y(v) ?? 0)
      .curve(curveMonotoneX)(set.values) ?? "";

  const areaD =
    area<number>()
      .x((_, i) => x(i) ?? 0)
      .y0(() => y(0) ?? 0)
      .y1((v) => y(v) ?? 0)
      .curve(curveMonotoneX)(set.values) ?? "";

  // --- the RN-Skia imperative lane: markers via PathBuilder ---
  const markers = Skia.PathBuilder.Make();
  set.values.forEach((v, i) => markers.addCircle(x(i) ?? 0, y(v) ?? 0, 3));
  const markersPath = markers.build();

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
          d3-scale/shape 原样运行 · RN-Skia API shim 渲染 · y 轴留白由 JS 字体测量得出 ·
          点击切换数据集
        </text>
        <view bindtap={() => setWhich(which === "revenue" ? "costs" : "revenue")}>
          <Canvas
            style={{ width: "100%", height: 260 }}
            viewPort={{ x: 0, y: 0, width: W, height: H }}
          >
            {/* Plot area — clip keeps the monotone curve inside its gutter box. */}
            <Group clip={{ rect: [plot.x, plot.y, plot.w, plot.h] }}>
              <Path path={areaD} color={set.color} opacity={0.15} />
              <Path path={lineD} color={set.color} style="stroke" strokeWidth={2.5} />
              <Path path={markersPath} color={set.color} />
            </Group>

            {/* Grid: dashed lines via the DashPathEffect child lane. */}
            {yTicks.map((t) =>
              t === 0 ? null : (
                <Line
                  key={`g${t}`}
                  p1={{ x: plot.x, y: y(t) ?? 0 }}
                  p2={{ x: plot.x + plot.w, y: y(t) ?? 0 }}
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
            {yTicks.map((t, i) => (
              <Text
                key={`y${t}-${i}`}
                x={margin.left - 8 - font.measureText(tickTexts[i] ?? "")}
                y={(y(t) ?? 0) + 3}
                text={tickTexts[i] ?? ""}
                color="#6b7280"
                font={font}
              />
            ))}

            {/* X labels: month initials under each point. */}
            {MONTHS.map((m, i) => (
              <Text
                key={`x${i}`}
                x={(x(i) ?? 0) - 5}
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
