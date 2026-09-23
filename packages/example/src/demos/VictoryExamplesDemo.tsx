// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Official Victory Native XL example charts, ported from the upstream
// example app (example/app/{bar-chart,stacked-area,donut-chart}.tsx) with
// their chart configurations kept as close to verbatim as the Lynx shell
// allows: Bar with rounded corners + value labels + spring animation,
// StackedArea, and a Polar donut with angular insets. Adaptations: the RN
// shell (SafeAreaView/ScrollView/controls) collapses to plain Lynx views,
// fonts use the bundled data-URI (upstream loads inter-medium.ttf), sizes
// ride the explicitSize pattern (RN flex chains are fragile through the
// shim layers), and the donut's gradient slices become solid fills
// (LinearGradient is not shimmed in skia-compat yet).

import { useState } from "@lynx-js/react";
import type { ReactNode } from "@lynx-js/react";

import { useFont } from "@scumble/skia-compat";
import { Bar, CartesianChart, Pie, PolarChart, StackedArea } from "victory-native";

import { PRESS_START_2P } from "./fontData";

// --- upstream data shapes (bar-chart.tsx / stacked-area.tsx / donut) ---
const BAR_DATA = Array.from({ length: 10 }, (_, i) => ({
  month: i + 1,
  listenCount: 20 + Math.round(Math.abs(Math.sin(i * 1.1)) * 70),
}));

const STACK_DATA = Array.from({ length: 12 }, (_, i) => ({
  month: i + 1,
  // Clamped so the bottom layer never dips below the 0 line (upstream feeds
  // it strictly positive data; a negative would pierce the baseline).
  low: Math.max(5, 10 + Math.round(15 * Math.sin(i / 2))),
  med: 35 + Math.round(20 * Math.cos(i / 3)),
  high: 70 + Math.round(15 * Math.sin(i / 1.5 + 1)),
}));

const DONUT_DATA = [
  { label: "Pop", value: 30, color: "#22c55e" },
  { label: "Rock", value: 25, color: "#3b82f6" },
  { label: "Jazz", value: 18, color: "#f59e0b" },
  { label: "Folk", value: 14, color: "#a78bfa" },
  { label: "Latin", value: 10, color: "#f97316" },
];

/** One measured-width section: the explicitSize consumption pattern. */
function ChartSection(props: {
  title: string;
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  return (
    <view style={{ marginBottom: "28px" }}>
      <text style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "8px" }}>
        {props.title}
      </text>
      <view
        style={{ height: `${props.height}px` }}
        bindlayoutchange={(e: { detail?: { width?: number }; params?: { width?: number } }) =>
          setWidth(e.detail?.width ?? e.params?.width ?? 0)
        }
      >
        {width > 0 ? props.children({ width, height: props.height }) : null}
      </view>
    </view>
  );
}

export function VictoryExamplesDemo() {
  const font = useFont(PRESS_START_2P, 8);

  return (
    <view>
      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          Victory Native XL — 官方示例移植
        </text>
        <text style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
          Bar(圆角 + 数值标签 + spring 动画)· StackedArea · Donut(角间隔环)——图表配置取自上游
          example/app,Lynx 壳层适配
        </text>

        <ChartSection title="Bar Chart" height={220}>
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={BAR_DATA}
              xKey="month"
              yKeys={["listenCount"]}
              domainPadding={{ left: 24, right: 24, top: 40 }}
              domain={{ y: [0, 100] }}
              xAxis={{
                font,
                tickCount: 5,
                lineWidth: 0,
                formatXLabel: (value) => `${value}`,
              }}
              frame={{ lineWidth: 0 }}
              yAxis={[{ yKeys: ["listenCount"], font }]}
            >
              {({ points, chartBounds }) => (
                <Bar
                  points={points.listenCount}
                  chartBounds={chartBounds}
                  animate={{ type: "spring" }}
                  innerPadding={0.33}
                  roundedCorners={{ topLeft: 6, topRight: 6 }}
                  labels={{ font, color: "#374151", position: "top" }}
                  color="#3b82f6"
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection title="Stacked Area" height={220}>
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={STACK_DATA}
              xKey="month"
              yKeys={["low", "med", "high"]}
              domainPadding={{ left: 16, right: 16, top: 20 }}
              axisOptions={{
                font,
                lineWidth: { grid: { x: 0, y: 2 }, frame: 0 },
                lineColor: { grid: { x: "#ffffff", y: "#e5e7eb" }, frame: "#9ca3af" },
                labelColor: { x: "#6b7280", y: "#6b7280" },
                tickCount: { x: 6, y: 4 },
              }}
            >
              {({ points, chartBounds }) => (
                <StackedArea
                  points={[points.low, points.med, points.high]}
                  y0={chartBounds.bottom}
                  colors={["#a5b4fc", "#6366f1", "#3730a3"]}
                  animate={{ type: "timing", duration: 400 }}
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection title="Donut Chart" height={240}>
          {({ width, height }) => (
            <PolarChart
              explicitSize={{ width, height }}
              data={DONUT_DATA}
              colorKey="color"
              valueKey="value"
              labelKey="label"
            >
              <Pie.Chart innerRadius="50%">
                {({ slice }) => (
                  <>
                    <Pie.Slice animate={{ type: "spring" }} />
                    <Pie.SliceAngularInset
                      animate={{ type: "spring" }}
                      angularInset={{ angularStrokeWidth: 5, angularStrokeColor: "white" }}
                    />
                  </>
                )}
              </Pie.Chart>
            </PolarChart>
          )}
        </ChartSection>
      </view>
    </view>
  );
}
