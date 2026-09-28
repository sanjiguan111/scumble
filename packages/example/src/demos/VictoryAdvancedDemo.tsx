// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Advanced official Victory Native XL examples, ported from the upstream
// example app (example/app/{candlestick,multiple-y-axes,area-range,
// custom-drawing,stacked-bar-charts-complex}.tsx): candlestick windows with
// per-candle styling and missing values, independent multiple Y axes with
// per-axis domains, area range bands, star-shaped custom drawing via
// RN-Skia <Points>, and a stacked bar over non-uniform data. Adaptations:
// chartPressState/transformState lanes are dropped (the gesture lane does
// not respond on device yet — interactivity rides bindtap buttons instead),
// the bundled tesla_stock.json becomes deterministic LCG random-walk data,
// RN controls collapse to Lynx views, fonts use the bundled data-URI, and
// sizes ride the explicitSize pattern.

import { useState } from "@lynx-js/react";
import type { ReactNode } from "@lynx-js/react";

import { Points, useFont, vec } from "@scumble/skia-compat";
import type { SkPoint } from "@scumble/skia-compat";
import {
  Area,
  AreaRange,
  Bar,
  Candlestick,
  CartesianChart,
  Line,
  StackedBar,
} from "victory-native";

import { PRESS_START_2P } from "./fontData";

// --- deterministic data (upstream ships tesla_stock.json / Math.random) ---
const lcg = (() => {
  let s = 20260923;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
})();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatMonthLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`;
};
const formatDayLabel = (ms: number) => {
  const d = new Date(ms);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

let walk = 180;
const OHLC = Array.from({ length: 90 }, (_, i) => {
  const open = walk + (lcg() - 0.5) * 4;
  const close = open + (lcg() - 0.5) * 14;
  const high = Math.max(open, close) + lcg() * 7;
  const low = Math.min(open, close) - lcg() * 7;
  walk = close;
  return { date: new Date(2026, 5, 1 + i).valueOf(), open, high, low, close };
});

function monthTickValues(data: typeof OHLC): number[] {
  const min = data[0]?.date;
  const max = data[data.length - 1]?.date;
  if (min == null || max == null) return [];
  const ticks: number[] = [];
  const cursor = new Date(min);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  cursor.setMonth(cursor.getMonth() + 1);
  while (cursor.valueOf() <= max) {
    ticks.push(cursor.valueOf());
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return ticks;
}

function endpointTickValues(data: typeof OHLC): number[] {
  if (data.length === 0) return [];
  const mid = Math.floor(data.length / 2);
  return [data[0]!.date, data[mid]!.date, data[data.length - 1]!.date];
}

const MAIN_TICKS = monthTickValues(OHLC);
const WINDOW_SIZE = 18;
const WINDOW_STEP = 12;
const MAX_WINDOW_START = OHLC.length - WINDOW_SIZE;

const CANDLE_STYLE_DATA = [
  { session: "Mon", open: 12, high: 18, low: 9, close: 16 },
  { session: "Tue", open: 16, high: 20, low: 13, close: 14 },
  { session: "Wed", open: 14, high: 21, low: 12, close: 19 },
  { session: "Thu", open: 19, high: 23, low: 17, close: 18 },
  { session: "Fri", open: 18, high: 24, low: 15, close: 22 },
  { session: "Sat", open: 22, high: 25, low: 18, close: 20 },
];

const CANDLE_EDGE_DATA: {
  label: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
}[] = [
  { label: "Up", open: 10, high: 18, low: 8, close: 16 },
  { label: "Down", open: 16, high: 19, low: 9, close: 11 },
  { label: "Doji", open: 12, high: 17, low: 7, close: 12 },
  { label: "Gap", open: null, high: 15, low: 10, close: 13 },
  { label: "Thin", open: 14, high: 18, low: 13, close: 13.8 },
];

const DUAL_AXIS_DATA = Array.from({ length: 13 }, (_, i) => ({
  day: i + 1,
  sales: 25 + Math.round(lcg() * 25),
  profit: 10025 + Math.round(lcg() * 25),
}));

const PER_AXIS_DATA = Array.from({ length: 24 }, (_, i) => ({
  time: `${i < 10 ? `0${i}` : i}:00`,
  active: [5, 6, 7, 12, 13, 14, 15, 16].includes(i) ? 1 : 0,
  insideTemp: 15 + lcg() * 7,
  outsideTemp: 7 + lcg() * 5,
  price: 100 + Math.round(lcg() * 100),
}));

const rangeBandData = (n = 13, starting = 1) =>
  Array.from({ length: n }, (_, index) => {
    const middle = 10 + Math.round(lcg() * 30);
    const lower = middle - 2 - Math.round(lcg() * 10);
    const upper = middle + 2 + Math.round(lcg() * 10);
    return { day: index + starting, upper, middle, lower };
  });

const STAR_DATA = Array.from({ length: 13 }, (_, index) => ({
  day: index + 1,
  stars: 5 + Math.round(lcg() * 45),
}));

const STACKED_NON_UNIFORM = [
  { month: 1, favouriteCount: 50, listenCount: 50, sales: 50 },
  { month: 2, listenCount: 50, sales: 50 },
  { month: 3, sales: 50 },
  { month: 4, listenCount: 50, sales: 0 },
  { month: 5, favouriteCount: 50, listenCount: 50, sales: 0 },
];

const STAR_COLORS = ["#0ea5e9", "#22c55e", "#a855f7", "#f97316", "#ec4899"];

/** Upstream calculateStarPoints: 2n-point star polygon around (cx, cy). */
function starPoints(centerX: number, centerY: number, radius: number, points: number): SkPoint[] {
  const vectors: SkPoint[] = [];
  for (let i = 0; i <= 2 * points; i++) {
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const x = centerX + Math.cos(angle) * (i % 2 === 0 ? radius * 2 : radius);
    const y = centerY + Math.sin(angle) * (i % 2 === 0 ? radius * 2 : radius);
    vectors.unshift(vec(x, y));
  }
  return vectors;
}

/** One measured-width section: the explicitSize consumption pattern. */
function ChartSection(props: {
  title: string;
  caption?: string;
  height: number;
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  return (
    <view style={{ marginBottom: "28px" }}>
      <text style={{ fontSize: "13px", fontWeight: "600", color: "#374151", marginBottom: "4px" }}>
        {props.title}
      </text>
      {props.caption ? (
        <text
          style={{ fontSize: "11px", color: "#6b7280", marginBottom: "8px", lineHeight: "16px" }}
        >
          {props.caption}
        </text>
      ) : null}
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

function DemoButton(props: { title: string; onTap: () => void; disabled?: boolean }) {
  return (
    <view
      bindtap={() => {
        if (!props.disabled) props.onTap();
      }}
      style={{
        flex: 1,
        alignItems: "center",
        paddingTop: "8px",
        paddingBottom: "8px",
        borderRadius: "6px",
        backgroundColor: props.disabled ? "#e5e7eb" : "#3b82f6",
      }}
    >
      <text style={{ color: props.disabled ? "#9ca3af" : "#ffffff", fontSize: "11px" }}>
        {props.title}
      </text>
    </view>
  );
}

export function VictoryAdvancedDemo() {
  const font = useFont(PRESS_START_2P, 8);
  const [windowStart, setWindowStart] = useState(70);
  const [bandData, setBandData] = useState(() => rangeBandData());
  const [corners, setCorners] = useState(5);
  const [starColorIdx, setStarColorIdx] = useState(0);

  const windowData = OHLC.slice(windowStart, windowStart + WINDOW_SIZE);
  const axisColor = "#d4d4d8";
  const labelColor = "#6b7280";

  return (
    <view>
      <view style={{ paddingLeft: "16px", paddingRight: "16px", marginBottom: "24px" }}>
        <text
          style={{ fontSize: "15px", fontWeight: "600", color: "#1f2937", marginBottom: "8px" }}
        >
          Victory Native XL — 官方进阶示例
        </text>
        <text style={{ fontSize: "12px", color: "#6b7280", lineHeight: "18px" }}>
          Candlestick(窗口滚动 + 逐蜡烛样式 + 缺失值)· 多 Y 轴(独立刻度 + 逐轴 domain)· AreaRange
          区间带 · 星形自定义绘制(RN-Skia Points)· 非均匀堆叠柱
        </text>

        <ChartSection
          title="Candlestick — 90 日 OHLC"
          caption="随机游走生成的日线;绿涨红跌灰十字,烛芯 1.5px,x 轴按月取 tick"
          height={240}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={OHLC}
              xKey="date"
              yKeys={["open", "high", "low", "close"]}
              domainPadding={{ left: 8, right: 8, top: 16, bottom: 8 }}
              xAxis={{
                font,
                tickValues: MAIN_TICKS,
                lineColor: axisColor,
                labelColor,
                labelOffset: 6,
                formatXLabel: formatMonthLabel,
              }}
              yAxis={[
                {
                  yKeys: ["open", "high", "low", "close"],
                  font,
                  tickCount: 5,
                  lineColor: axisColor,
                  labelColor,
                  labelOffset: 4,
                  formatYLabel: (value: number) => `$${Math.round(Number(value))}`,
                },
              ]}
              frame={{ lineColor: axisColor, lineWidth: 1 }}
            >
              {({ points, chartBounds }) => (
                <Candlestick
                  openPoints={points.open}
                  highPoints={points.high}
                  lowPoints={points.low}
                  closePoints={points.close}
                  chartBounds={chartBounds}
                  candleRatio={0.65}
                  wickStrokeWidth={1.5}
                  candleColors={{
                    positive: "#16a34a",
                    negative: "#dc2626",
                    neutral: "#71717a",
                  }}
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection
          title="Candlestick — 窗口滚动"
          caption="Earlier/Later 切换 18 根窗口,逐蜡烛路径 + timing 250ms 平滑过渡"
          height={200}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={windowData}
              xKey="date"
              yKeys={["open", "high", "low", "close"]}
              domainPadding={{ left: 20, right: 20, top: 10, bottom: 6 }}
              xAxis={{
                font,
                tickValues: endpointTickValues(windowData),
                lineColor: axisColor,
                labelColor,
                formatXLabel: formatDayLabel,
              }}
              yAxis={[
                {
                  yKeys: ["open", "high", "low", "close"],
                  font,
                  tickCount: 4,
                  lineColor: axisColor,
                  labelColor,
                  formatYLabel: (value: number) => `$${Math.round(Number(value))}`,
                },
              ]}
            >
              {({ points, chartBounds }) => (
                <Candlestick
                  openPoints={points.open}
                  highPoints={points.high}
                  lowPoints={points.low}
                  closePoints={points.close}
                  chartBounds={chartBounds}
                  candleCount={WINDOW_SIZE}
                  candleRatio={0.7}
                  wickStrokeWidth={1.25}
                  candleOptions={() => ({})}
                  animate={{ type: "timing", duration: 250 }}
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>
        <view style={{ flexDirection: "row", gap: "12px", marginBottom: "28px" }}>
          <DemoButton
            title="← Earlier"
            disabled={windowStart === 0}
            onTap={() => setWindowStart((s) => Math.max(0, s - WINDOW_STEP))}
          />
          <DemoButton
            title="Later →"
            disabled={windowStart >= MAX_WINDOW_START}
            onTap={() => setWindowStart((s) => Math.min(MAX_WINDOW_START, s + WINDOW_STEP))}
          />
        </view>

        <ChartSection
          title="Candlestick — 逐蜡烛样式与缺失值"
          caption="candleOptions 回调按 high−low 动态调烛芯粗细;null 值蜡烛跳过,minBodyHeight 兜住十字星"
          height={180}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={CANDLE_EDGE_DATA}
              xKey="label"
              yKeys={["open", "high", "low", "close"]}
              domain={{ y: [0, 22] }}
              domainPadding={{ left: 30, right: 30, top: 8 }}
              xAxis={{ font, tickCount: 5, lineColor: axisColor, labelColor }}
              yAxis={[
                {
                  yKeys: ["open", "high", "low", "close"],
                  font,
                  tickCount: 4,
                  lineColor: axisColor,
                  labelColor,
                },
              ]}
            >
              {({ points, chartBounds }) => (
                <Candlestick
                  openPoints={points.open}
                  highPoints={points.high}
                  lowPoints={points.low}
                  closePoints={points.close}
                  chartBounds={chartBounds}
                  candleRatio={0.62}
                  minBodyHeight={2}
                  wickStrokeWidth={1.5}
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection
          title="多 Y 轴 — 独立刻度"
          caption="profit 柱挂左轴($25–50),sales 线挂右轴(10025–10050),两条 y 轴各自定刻度"
          height={210}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={DUAL_AXIS_DATA}
              xKey="day"
              yKeys={["sales", "profit"]}
              domainPadding={{ left: 10, right: 10, top: 10 }}
              xAxis={{
                font,
                labelColor,
                formatXLabel: (value: number) => `${Math.round(Number(value))}`,
                lineColor: axisColor,
              }}
              frame={{ lineColor: "#111827", lineWidth: 2 }}
              yAxis={[
                {
                  yKeys: ["sales"],
                  font,
                  labelColor: "#f97316",
                  formatYLabel: (value: number) => `${Math.round(Number(value))}`,
                  lineColor: "#f9a8d4",
                },
                {
                  yKeys: ["profit"],
                  font,
                  labelColor: "#16a34a",
                  axisSide: "right",
                  lineWidth: 0,
                  tickValues: [10030, 10045],
                },
              ]}
            >
              {({ points, chartBounds }) => (
                <>
                  <Bar color="#1e1e59" points={points.profit} chartBounds={chartBounds} />
                  <Line
                    points={points.sales}
                    color="#a04d4d"
                    strokeWidth={3}
                    animate={{ type: "spring" }}
                  />
                </>
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection
          title="多 Y 轴 — 逐轴 domain"
          caption="active 阶梯面积 [0,1] · price 阶梯线 $[100,200] · 内外温度 natural 曲线 [0,30]°C,三把尺同图"
          height={220}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={PER_AXIS_DATA}
              xKey="time"
              yKeys={["active", "price", "insideTemp", "outsideTemp"]}
              domainPadding={{ left: 6, right: 6, top: 8 }}
              xAxis={{
                font,
                labelColor,
                formatXLabel: (value: string) => `${value}`,
                lineColor: "transparent",
                tickCount: 6,
              }}
              yAxis={[
                {
                  yKeys: ["active"],
                  font,
                  formatYLabel: () => "",
                  domain: [0, 1],
                  lineColor: "#d3d3d3",
                },
                {
                  yKeys: ["price"],
                  font,
                  labelColor,
                  formatYLabel: (value: number) => `$${Math.round(Number(value))}`,
                  axisSide: "left",
                  domain: [100, 200],
                },
                {
                  yKeys: ["insideTemp", "outsideTemp"],
                  font,
                  labelColor,
                  formatYLabel: (value: number) => `${Math.round(Number(value))}°C`,
                  axisSide: "right",
                  domain: [0, 30],
                },
              ]}
            >
              {({ points, chartBounds }) => (
                <>
                  <Area
                    curveType="step"
                    color="#6dc9e8"
                    opacity={0.5}
                    points={points.active}
                    y0={chartBounds.bottom}
                  />
                  <Line
                    points={points.price}
                    curveType="step"
                    color="#a04d4d"
                    strokeWidth={3}
                    opacity={0.8}
                    animate={{ type: "spring" }}
                  />
                  <Line
                    points={points.insideTemp}
                    curveType="natural"
                    color="#1e1e59"
                    strokeWidth={3}
                    animate={{ type: "spring" }}
                  />
                  <Line
                    points={points.outsideTemp}
                    curveType="natural"
                    color="#74b567"
                    strokeWidth={3}
                    animate={{ type: "spring" }}
                  />
                </>
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection
          title="AreaRange — 区间带"
          caption="中线两侧 ±20 的固定带(上)+ upper/lower 独立序列带(下),timing 动画"
          height={190}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={bandData}
              xKey="day"
              yKeys={["middle", "lower", "upper"]}
              domain={{ y: [0, 80] }}
              domainPadding={{ left: 8, right: 8, top: 8 }}
              axisOptions={{ font, lineColor: axisColor, labelColor, tickCount: { x: 6, y: 4 } }}
            >
              {({ points }) => (
                <>
                  <AreaRange
                    points={points.middle.map((p) => ({
                      ...p,
                      y: p.y! + 20,
                      y0: p.y! - 20,
                    }))}
                    animate={{ type: "timing" }}
                    color="#6464ff"
                    opacity={0.2}
                  />
                  <Line
                    points={points.middle}
                    animate={{ type: "timing" }}
                    color="#6464ff"
                    strokeWidth={1}
                  />
                </>
              )}
            </CartesianChart>
          )}
        </ChartSection>

        <ChartSection title="AreaRange — 独立上下界" height={190}>
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={bandData}
              xKey="day"
              yKeys={["middle", "lower", "upper"]}
              domain={{ y: [0, 80] }}
              domainPadding={{ left: 8, right: 8, top: 8 }}
              axisOptions={{ font, lineColor: axisColor, labelColor, tickCount: { x: 6, y: 4 } }}
            >
              {({ points }) => (
                <>
                  <AreaRange
                    upperPoints={points.upper}
                    lowerPoints={points.lower}
                    animate={{ type: "timing" }}
                    color="#6464ff"
                    opacity={0.2}
                  />
                  <Line
                    points={points.middle}
                    animate={{ type: "timing" }}
                    color="#6464ff"
                    strokeWidth={1}
                  />
                </>
              )}
            </CartesianChart>
          )}
        </ChartSection>
        <view style={{ flexDirection: "row", gap: "12px", marginBottom: "28px" }}>
          <DemoButton title="Shuffle Data" onTap={() => setBandData(rangeBandData())} />
          <DemoButton
            title="Add Points"
            disabled={bandData.length >= 30}
            onTap={() => setBandData((d) => [...d, ...rangeBandData(5, d.length + 1)])}
          />
        </view>

        <ChartSection
          title="自定义绘制 — 星形 Points"
          caption="chart bounds 内逐点画多边形(RN-Skia <Points mode=polygon>);角数与颜色可切换"
          height={220}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={STAR_DATA}
              xKey="day"
              yKeys={["stars"]}
              domainPadding={20}
              axisOptions={{ font, lineColor: axisColor, labelColor, tickCount: 5 }}
            >
              {({ points }) => (
                <>
                  {points.stars.map(({ x, y }, i) => (
                    <Points
                      key={`star-${i}`}
                      points={starPoints(x, y ?? 0, 5, corners)}
                      mode="polygon"
                      color={STAR_COLORS[starColorIdx]}
                      strokeWidth={2}
                    />
                  ))}
                </>
              )}
            </CartesianChart>
          )}
        </ChartSection>
        <view style={{ flexDirection: "row", gap: "12px", marginBottom: "28px" }}>
          <DemoButton
            title={`角数: ${corners} → 下一切换`}
            onTap={() => setCorners((c) => (c >= 8 ? 3 : c + 1))}
          />
          <DemoButton
            title="换颜色"
            onTap={() => setStarColorIdx((i) => (i + 1) % STAR_COLORS.length)}
          />
        </view>

        <ChartSection
          title="StackedBar — 非均匀数据"
          caption="缺失键与 0 值段;barOptions 只给顶层/底层段圆角(上游 NonUniformDataSet)"
          height={200}
        >
          {({ width, height }) => (
            <CartesianChart
              explicitSize={{ width, height }}
              data={STACKED_NON_UNIFORM}
              xKey="month"
              yKeys={["favouriteCount", "listenCount", "sales"]}
              domain={{ y: [0, 200] }}
              domainPadding={{ left: 40, right: 40, top: 8 }}
              axisOptions={{
                font,
                lineColor: axisColor,
                labelColor,
                formatXLabel: (value: number) => MONTHS[Number(value) - 1] ?? `${value}`,
              }}
            >
              {({ points, chartBounds }) => (
                <StackedBar
                  barWidth={45}
                  innerPadding={0.33}
                  chartBounds={chartBounds}
                  points={[points.favouriteCount, points.listenCount, points.sales]}
                  colors={["#3b82f6", "#ef4444", "#22c55e"]}
                  barOptions={({ isBottom, isTop }) => ({
                    roundedCorners: isTop
                      ? { topLeft: 5, topRight: 5 }
                      : isBottom
                        ? { bottomRight: 5, bottomLeft: 5 }
                        : undefined,
                  })}
                />
              )}
            </CartesianChart>
          )}
        </ChartSection>
      </view>
    </view>
  );
}
