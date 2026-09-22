// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `SkPathBuilder` — RN-Skia's incremental builder, the path-construction
 * lane Victory uses most (`Skia.PathBuilder.Make()` + addRect/addRRect/
 * lineTo/arcToOval, `build()`). A thin facade over {@link SkPath}: every
 * mutation lands on the wrapped path immediately, `build()` hands it over.
 */

import { SkPath } from "./SkPath.js";
import { FillType, type NonUniformRRect, type SkRect } from "./types.js";

export class SkPathBuilder {
  private readonly path = new SkPath();

  static Make(): SkPathBuilder {
    return new SkPathBuilder();
  }

  moveTo(x: number, y: number): this {
    this.path.moveTo(x, y);
    return this;
  }

  lineTo(x: number, y: number): this {
    this.path.lineTo(x, y);
    return this;
  }

  addRect(r: SkRect): this {
    this.path.addRect(r);
    return this;
  }

  addRRect(r: NonUniformRRect): this {
    this.path.addRRect(r);
    return this;
  }

  addOval(oval: SkRect): this {
    this.path.addOval(oval);
    return this;
  }

  addCircle(cx: number, cy: number, radius: number): this {
    this.path.addCircle(cx, cy, radius);
    return this;
  }

  addPath(p: SkPath): this {
    this.path.addPath(p);
    return this;
  }

  /** Canvas-style oval arc — see {@link SkPath.arcToOval}. */
  arcToOval(oval: SkRect, startAngle: number, sweepAngle: number, forceMoveTo: boolean): this {
    this.path.arcToOval(oval, startAngle, sweepAngle, forceMoveTo);
    return this;
  }

  close(): this {
    this.path.close();
    return this;
  }

  setFillType(t: FillType): this {
    this.path.fillType = t;
    return this;
  }

  build(): SkPath {
    return this.path;
  }
}
