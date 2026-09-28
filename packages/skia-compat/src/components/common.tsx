// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Shared prop plumbing for the shim components: RN-Skia prop VALUES
 * (PaintStyle enums, `paint` objects, DashPathEffect children, ClipDef)
 * translated to the scumble prop names. Pure functions — the unit tests
 * exercise these directly; the components below stay thin pass-throughs.
 */

import type { ReactNode } from "@lynx-js/react";

import { PaintStyle } from "../types.js";
import { DashPathEffect } from "./DashPathEffect.js";
import type { SkPaint } from "../useFont.js";

/** The paint-relevant props all shim shapes accept (rest passes through).
 * Animated-able fields take MaybeAnimated — RN-Skia components accept
 * SharedValue props; the shim reads through them at render time. */
export interface ShimShapeProps {
  color?: MaybeAnimated<string | number>;
  style?: MaybeAnimated<PaintStyle | "fill" | "stroke">;
  strokeWidth?: MaybeAnimated<number>;
  opacity?: MaybeAnimated<number>;
  paint?: MaybeAnimated<SkPaint>;
  /** Passed through to scumble (kebab-case or enum-shaped values as scumble takes them). */
  blendMode?: MaybeAnimated<unknown>;
  strokeCap?: MaybeAnimated<unknown>;
  strokeJoin?: MaybeAnimated<unknown>;
  strokeMiter?: MaybeAnimated<number>;
  /** Accepted and ignored — scumble anti-aliases unconditionally. */
  antiAlias?: MaybeAnimated<boolean>;
  /** Accepted for type parity; with style="stroke" set, `color` paints it. */
  stroke?: MaybeAnimated<string | number>;
  children?: ReactNode;
}

export interface ResolvedShimPaint {
  color?: string | number;
  style?: "fill" | "stroke";
  strokeWidth?: number;
  opacity?: number;
  dash?: number[];
  dashOffset?: number;
  children?: ReactNode;
}

/** PaintStyle enum or string → scumble's `style` string. */
export function styleToScumble(
  style: PaintStyle | "fill" | "stroke" | undefined,
): "fill" | "stroke" | undefined {
  if (style === undefined) return undefined;
  if (typeof style === "number") return style === PaintStyle.Stroke ? "stroke" : "fill";
  return style;
}

/**
 * Collect DashPathEffect children → scumble `dash`/`dashOffset` (children are
 * consumed, not forwarded — scumble shapes have no such child lane).
 */
export function extractDash(children: ReactNode): { dash?: number[]; dashOffset?: number } {
  const out: { dash?: number[]; dashOffset?: number } = {};
  for (const child of Array.isArray(children) ? children : [children]) {
    const el = child as { type?: unknown; props?: { intervals?: number[]; phase?: number } } | null;
    if (el && typeof el === "object" && el.type === DashPathEffect && el.props?.intervals) {
      out.dash = el.props.intervals;
      out.dashOffset = el.props.phase;
    }
  }
  return out;
}

/**
 * Merge the shape props with an optional `paint` object's state. Precedence:
 * explicit props win over the paint object (RN-Skia's component-prop layer
 * sits above the paint it references).
 *
 * Passthrough paint props (`blendMode`/`strokeCap`/`strokeJoin`/
 * `strokeMiter`/`antiAlias`) arrive MAYBE-ANIMATED — Victory's AnimatedPath
 * wraps every present prop key into a `{value}` SharedValue, including
 * undefined ones (Candlestick explicitly spreads `{blendMode: undefined}`).
 * They are unwrapped here, and keys resolving to undefined are DROPPED:
 * scumble's paint resolver branches on `prop !== undefined`, and a wrapper
 * object would reach `parseBlendMode`/`parseStrokeCap` and crash on
 * `.toLowerCase`.
 */
export function resolveShimPaint(props: ShimShapeProps): ResolvedShimPaint {
  const { children, blendMode, strokeCap, strokeJoin, strokeMiter, antiAlias, ...rest } = props;
  const dash = extractDash(children);
  const paint = read(props.paint);
  const passthrough: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries({
    blendMode,
    strokeCap,
    strokeJoin,
    strokeMiter,
    antiAlias,
  })) {
    const value = read(raw as MaybeAnimated<unknown>);
    if (value !== undefined) passthrough[key] = value;
  }
  return {
    ...rest,
    ...passthrough,
    color: read(props.color) ?? paint?.color,
    style: styleToScumble(read(props.style) ?? paint?.style),
    strokeWidth: read(props.strokeWidth) ?? paint?.strokeWidth,
    opacity: read(props.opacity),
    ...dash,
  };
}

// ---- MaybeAnimated: RN-Skia components accept SharedValue<T> props that
// update on the UI thread without React; the reactive shim re-renders on
// every write, so components just READ THROUGH {value} wrappers at render
// time. Victory's AnimatedPath passes every prop this way. ----

/** A plain value or a Reanimated-style `{ value }` holder. */
export type MaybeAnimated<T> = T | { value: T };

/** Resolve a MaybeAnimated to its current value. */
export function read<T>(v: MaybeAnimated<T> | undefined): T | undefined {
  if (v !== null && typeof v === "object" && "value" in (v as object)) {
    return (v as { value: T }).value;
  }
  return v as T | undefined;
}

// ---- RN-Skia transform arrays → scumble transform ops ----

/** One RN-Skia transform item (`{translateX}`, `{rotate: RADIANS}`, …). */
export interface RnTransformItem {
  translateX?: number;
  translateY?: number;
  /** Radians in RN-Skia — scumble takes degrees. */
  rotate?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  skewX?: number;
  skewY?: number;
}

/**
 * Normalize an RN-Skia transform array onto scumble's op objects: rotate
 * radians → degrees (folding an `origin` pivot into each rotate op), bare
 * `scale` → scaleX/scaleY. Translate keys are already identical.
 */
export function normalizeRnTransform(
  items: readonly RnTransformItem[],
  origin?: { x: number; y: number },
): Array<Record<string, number>> {
  return items.map((item) => {
    if (item.rotate !== undefined) {
      const op: Record<string, number> = { rotate: (item.rotate * 180) / Math.PI };
      if (origin) {
        op.x = origin.x;
        op.y = origin.y;
      }
      return op;
    }
    if (item.scale !== undefined) return { scaleX: item.scale, scaleY: item.scale };
    return { ...item };
  });
}

// ---- RN numeric styles → Lynx CSS units ----
// Lynx CSS rejects unitless lengths (error 130300 kills the whole
// declaration); RN semantics treat bare numbers as dp. Normalize at the
// compat boundary with a unitless allowlist.

const UNITLESS_STYLE_KEYS = new Set([
  "flex",
  "flexGrow",
  "flexShrink",
  "flexBasis",
  "order",
  "opacity",
  "zIndex",
  "fontWeight",
  "lineHeight",
  "scale",
]);

/** Append "px" to unitless numeric style values (0 stays 0); pass the rest. */
export function normalizeStyle(style: unknown): Record<string, string | number> {
  if (!style || typeof style !== "object" || Array.isArray(style)) {
    return (style as Record<string, string | number>) ?? {};
  }
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(style as Record<string, unknown>)) {
    if (typeof value === "number" && !UNITLESS_STYLE_KEYS.has(key)) {
      out[key] = value === 0 ? 0 : `${value}px`;
    } else if (value !== undefined) {
      out[key] = value as string | number;
    }
  }
  return out;
}
