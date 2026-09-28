// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// The W5 payoff: Victory Native XL's REAL API — CartesianChart + render-prop
// Line/Scatter — running unmodified on scumble. Everything below the
// component surface is the adapter stack: hab-synced upstream tree (import
// specifiers rewritten by vendor.mjs), the reactive Reanimated shim driving
// AnimatedPath transitions (tap to swap datasets), font measurement for the
// axis labels (W2), and the RNGH-shaped gesture lane (press/scrub rides the
// open touch-delivery issue — W4's known caveat).

import { useEffect, useState } from "@lynx-js/react";

import { useFont } from "@scumble/skia-compat";
import { CartesianChart, Line, Scatter } from "victory-native";

import { PRESS_START_2P } from "./fontData";
import { perfMark, perfMarkOnce, perfLogSince, perfCommit, perfQueueLag } from "../components/perf";

const SERIES = {
  sales: {
    color: "#22c55e",
    data: Array.from({ length: 12 }, (_, i) => ({
      day: i + 1,
      value: 25 + Math.round(30 * Math.sin(i / 1.8) + i * 3),
    })),
  },
  costs: {
    color: "#f97316",
    data: Array.from({ length: 12 }, (_, i) => ({
      day: i + 1,
      value: 60 - Math.round(18 * Math.cos(i / 2.1) + i),
    })),
  },
} as const;

export function VictoryChartDemo() {
  perfMarkOnce("victory-mount");
  const victoryRenderStart = Date.now();
  const [which, setWhich] = useState<keyof typeof SERIES>("sales");
  const set = SERIES[which];
  const font = useFont(PRESS_START_2P, 8);
  // Explicit sizing (measured container width) instead of the RN flex
  // chain: flex-inheritance through the shim layers is fragile on Lynx
  // (auto-height intermediaries collapse the basis-0/grow-1 chain), while
  // explicitSize makes ChartWrapper use fixed width/height styles directly.
  const [width, setWidth] = useState(0);
  // [perf probe] every-commit lane: mount latency, tap→commit, JS render cost.
  useEffect(() => {
    perfLogSince("victory-mount", "VictoryChart mount→commit");
    perfLogSince("victory-tap", "tap→commit");
    perfCommit(Date.now() - victoryRenderStart, "render(js)");
    perfQueueLag("post-commit");
  });

  return (
    <view>
      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          Victory Native XL — 未改动一行上游代码
        </text>
        <text style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
          CartesianChart + Line/Scatter 原样运行 · 轴标签 = JS 字体测量 · 点击切换数据集 = 反应式
          Reanimated shim 驱动 AnimatedPath 过渡
        </text>
        <view
          bindtap={() => {
            perfMark("victory-tap");
            setWhich(which === "sales" ? "costs" : "sales");
          }}
        >
          <view
            style={{ height: "260px" }}
            bindlayoutchange={(e: { detail?: { width?: number }; params?: { width?: number } }) =>
              setWidth(e.detail?.width ?? e.params?.width ?? 0)
            }
          >
            <CartesianChart
              explicitSize={width > 0 ? { width, height: 260 } : undefined}
              data={[...set.data]}
              xKey="day"
              yKeys={["value"]}
              domainPadding={12}
              axisOptions={{
                font,
                lineWidth: { grid: { x: 0, y: 2 }, frame: 0 },
                lineColor: {
                  grid: { x: "#ffffff", y: "#e5e7eb" },
                  frame: "#9ca3af",
                },
                labelColor: { x: "#6b7280", y: "#6b7280" },
                tickCount: { x: 6, y: 4 },
                formatXLabel: (v) => `${v}`,
                formatYLabel: (v) => `${v}`,
              }}
            >
              {({ points }) => (
                <>
                  <Line
                    points={points.value}
                    color={set.color}
                    strokeWidth={2.5}
                    curveType="natural"
                  />
                  <Scatter
                    points={points.value}
                    color={set.color}
                    radius={4}
                    animate={{ type: "spring" }}
                  />
                </>
              )}
            </CartesianChart>
          </view>
        </view>
      </view>
    </view>
  );
}
