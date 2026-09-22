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

/** The paint-relevant props all shim shapes accept (rest passes through). */
export interface ShimShapeProps {
  color?: string | number;
  style?: PaintStyle | "fill" | "stroke";
  strokeWidth?: number;
  opacity?: number;
  paint?: SkPaint;
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
 */
export function resolveShimPaint(props: ShimShapeProps): ResolvedShimPaint {
  const { children, ...rest } = props;
  const dash = extractDash(children);
  const paint = props.paint;
  return {
    ...rest,
    color: props.color ?? paint?.color,
    style: styleToScumble(props.style ?? paint?.style),
    strokeWidth: props.strokeWidth ?? paint?.strokeWidth,
    ...dash,
  };
}
