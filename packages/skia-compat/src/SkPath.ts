// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `SkPath` — the RN-Skia path object, backed by scumble's `Path2D`
 * (`@scumble/graphics`). All mutations delegate to the wrapped builder and
 * return `this` (RN-Skia chainability); `fillType` rides along and the
 * component layer forwards it to scumble's `fillRule`. `toSVGString` is the
 * d-string serialization (`Path2D#toDString`).
 */

import { Path2D, type PathOpName } from "@scumble/graphics";

import { FillType, type NonUniformRRect, type SkRect } from "./types.js";

/** Append a rounded rect with per-corner elliptical radii to `p`. */
export function appendRRect(p: Path2D, r: NonUniformRRect): void {
  const { x, y, width: w, height: h } = r.rect;
  const rad = (c?: NonUniformRRect["topLeft"]): [number, number] => [c?.x ?? 0, c?.y ?? c?.x ?? 0];
  const [tlx, tly] = rad(r.topLeft);
  const [trx, try_] = rad(r.topRight);
  const [brx, bry] = rad(r.bottomRight);
  const [blx, bly] = rad(r.bottomLeft);
  p.moveTo(x + tlx, y);
  p.lineTo(x + w - trx, y);
  // A zero-radius corner needs no arc — the next lineTo walks the vertex.
  if (trx > 0 || try_ > 0) p.arcTo(trx, try_, 0, false, true, x + w, y + try_);
  p.lineTo(x + w, y + h - bry);
  if (brx > 0 || bry > 0) p.arcTo(brx, bry, 0, false, true, x + w - brx, y + h);
  p.lineTo(x + blx, y + h);
  if (blx > 0 || bly > 0) p.arcTo(blx, bly, 0, false, true, x, y + h - bly);
  p.lineTo(x, y + tly);
  if (tlx > 0 || tly > 0) p.arcTo(tlx, tly, 0, false, true, x + tlx, y);
  p.close();
}

/**
 * Append a Canvas/Skia-style oval arc: angles in degrees, 0° at 3 o'clock,
 * positive clockwise (y-down screen convention). Converted to the SVG
 * endpoint-arc form scumble's `arcTo` takes — `largeArc` from |sweep| > 180,
 * `sweep` flag from the sign.
 */
export function appendOvalArc(
  p: Path2D,
  oval: SkRect,
  startAngleDeg: number,
  sweepDeg: number,
  forceMoveTo: boolean,
  hasCurrentPoint: boolean,
): void {
  const [x, y, w, h] = oval;
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = w / 2;
  const ry = h / 2;
  const a0 = (startAngleDeg * Math.PI) / 180;
  const a1 = ((startAngleDeg + sweepDeg) * Math.PI) / 180;
  const sx = cx + rx * Math.cos(a0);
  const sy = cy + ry * Math.sin(a0);
  const ex = cx + rx * Math.cos(a1);
  const ey = cy + ry * Math.sin(a1);
  if (forceMoveTo || !hasCurrentPoint) {
    p.moveTo(sx, sy);
  }
  p.arcTo(rx, ry, 0, Math.abs(sweepDeg) % 360 > 180, sweepDeg > 0, ex, ey);
}

/** The RN-Skia `SkPath` over scumble's `Path2D`. */
export class SkPath {
  /** The wrapped scumble path — what the component layer renders. */
  readonly p2d: Path2D;
  fillType: FillType;
  /** True once any command landed (Skia's `isEmpty` inverse, cheaply). */
  private touched = false;

  constructor(p2d: Path2D = new Path2D()) {
    this.p2d = p2d;
    this.fillType = FillType.Winding;
  }

  moveTo(x: number, y: number): this {
    this.p2d.moveTo(x, y);
    this.touched = true;
    return this;
  }

  lineTo(x: number, y: number): this {
    this.p2d.lineTo(x, y);
    return this;
  }

  quadTo(cpx: number, cpy: number, x: number, y: number): this {
    this.p2d.quadTo(cpx, cpy, x, y);
    return this;
  }

  cubicTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): this {
    this.p2d.cubicTo(cp1x, cp1y, cp2x, cp2y, x, y);
    return this;
  }

  /** Canvas-style arc inside `oval` — see {@link appendOvalArc}. */
  arcToOval(oval: SkRect, startAngle: number, sweepAngle: number, forceMoveTo: boolean): this {
    appendOvalArc(this.p2d, oval, startAngle, sweepAngle, forceMoveTo, this.touched);
    this.touched = true;
    return this;
  }

  addRect(r: SkRect): this {
    this.p2d.addRect(r[0]!, r[1]!, r[2]!, r[3]!);
    this.touched = true;
    return this;
  }

  addRRect(r: NonUniformRRect): this {
    appendRRect(this.p2d, r);
    this.touched = true;
    return this;
  }

  addOval(oval: SkRect): this {
    // Full ellipse = 360° sweep in its bounding oval.
    appendOvalArc(this.p2d, oval, 0, 360, true, true);
    this.p2d.close();
    this.touched = true;
    return this;
  }

  addCircle(cx: number, cy: number, r: number): this {
    this.p2d.addCircle(cx, cy, r);
    this.touched = true;
    return this;
  }

  addPoly(points: ReadonlyArray<{ x: number; y: number }>, close: boolean): this {
    points.forEach((pt, i) =>
      i === 0 ? this.p2d.moveTo(pt.x, pt.y) : this.p2d.lineTo(pt.x, pt.y),
    );
    if (close) this.p2d.close();
    this.touched = points.length > 0 || this.touched;
    return this;
  }

  addPath(other: SkPath): this {
    this.p2d.addPath(other.p2d);
    this.touched = true;
    return this;
  }

  close(): this {
    this.p2d.close();
    return this;
  }

  copy(): SkPath {
    const c = SkPath.fromSVGString(this.p2d.toDString());
    c.fillType = this.fillType;
    return c;
  }

  /** Skia path op against another path — lazily evaluated at render time. */
  op(other: SkPath, op: PathOpName): SkPath {
    const out = new SkPath(Path2D.op(this.p2d, other.p2d, op));
    return out;
  }

  /** Serialize back to an SVG `d` string (normalized absolute form). */
  toSVGString(): string {
    return this.p2d.toDString();
  }

  /** RN-Skia name for the SVG-string constructor. */
  static fromSVGString(d: string): SkPath {
    return new SkPath(Path2D.fromDString(d));
  }
}
