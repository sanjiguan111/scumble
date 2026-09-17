import { describe, expect, it } from "vitest";

import { buildMultiPaint } from "../multi-paint.js";
import { MultiPaintList } from "../generated/skityrt/multi-paint-list.js";
import { BlendMode as BM } from "../generated/skityrt/blend-mode.js";
import { LineCap } from "../generated/skityrt/line-cap.js";
import { PaintSlot } from "../generated/skityrt/paint-slot.js";
import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";

function readBack(bytes: ArrayBuffer): MultiPaintList {
  return MultiPaintList.getRootAsMultiPaintList(new flatbuffers.ByteBuffer(new Uint8Array(bytes)));
}

// @lat: [[tests#Graphics parsing layer#Multi-paint blob]]
describe("buildMultiPaint", () => {
  it("returns null for an empty pass list", () => {
    expect(buildMultiPaint([])).toBeNull();
  });

  it("serializes each pass with independent state, in order", () => {
    const bytes = buildMultiPaint([
      { style: "fill", color: 0xffff0000, opacity: 0.5, blendMode: BM.MULTIPLY },
      {
        style: "stroke",
        color: 0xffffffff,
        strokeWidth: 3,
        strokeCap: LineCap.ROUND,
        dash: [6, 4],
      },
    ]);
    expect(bytes).not.toBeNull();
    const list = readBack(bytes!);
    expect(list.passesLength()).toBe(2);

    const p0 = list.passes(0)!;
    expect(p0.style()).toBe(PaintSlot.FILL);
    expect(p0.type()).toBe(1); // COLOR
    expect(p0.color()).toBe(0xffff0000);
    expect(p0.opacity()).toBe(0.5);
    expect(p0.blendMode()).toBe(BM.MULTIPLY);

    const p1 = list.passes(1)!;
    expect(p1.style()).toBe(PaintSlot.STROKE);
    expect(p1.color()).toBe(0xffffffff);
    expect(p1.strokeWidth()).toBe(3);
    expect(p1.strokeCap()).toBe(LineCap.ROUND);
    expect(p1.strokeDashLength()).toBe(2);
    expect(p1.strokeDash(0)).toBe(6);
    expect(p1.strokeDash(1)).toBe(4);
  });

  it("round-trips gradient and filter bytes verbatim", () => {
    const gradient = new Uint8Array([1, 2, 3, 4]);
    const colorFilter = new Uint8Array([9, 8, 7]);
    const bytes = buildMultiPaint([
      {
        style: "fill",
        gradient: gradient.slice().buffer,
        colorFilter: colorFilter.slice().buffer,
      },
    ]);
    const list = readBack(bytes!);
    const p = list.passes(0)!;
    expect(p.type()).toBe(2); // GRADIENT
    expect(Array.from(p.gradientArray() ?? [])).toEqual([1, 2, 3, 4]);
    expect(Array.from(p.colorFilterArray() ?? [])).toEqual([9, 8, 7]);
  });

  it("serializes the image shader fields", () => {
    const bytes = buildMultiPaint([
      {
        style: "fill",
        image: { uri: "https://x/y.png", fit: 2, tx: 1, ty: 2, rect: [1, 2, 3, 4] },
      },
    ]);
    const list = readBack(bytes!);
    const p = list.passes(0)!;
    expect(p.type()).toBe(3); // IMAGE_SHADER
    expect(p.imageUri()).toBe("https://x/y.png");
    expect(p.imageFit()).toBe(2);
    expect(p.imageTx()).toBe(1);
    expect(p.imageTy()).toBe(2);
    expect(p.imageRectLength()).toBe(4);
  });

  it("an inactive pass (no paint source) serializes with type NONE", () => {
    const bytes = buildMultiPaint([{ style: "fill" }]);
    const list = readBack(bytes!);
    expect(list.passes(0)!.type()).toBe(0);
  });
});
