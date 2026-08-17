// Licensed under the Apache License Version 2.0 that may not be used except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, it, expect } from "vitest";

import * as flatbuffers from "../generated/flatbuffers/flatbuffers.js";
import { Filter } from "../generated/skityrt/filter.js";
import { FilterKind } from "../generated/skityrt/filter-kind.js";
import { BlurStyle } from "../generated/skityrt/blur-style.js";
import { buildColorFilter, buildImageFilter, buildMaskFilter } from "../filter.js";

// Read the nested-flatbuffer bytes back as a Filter — exactly what the native
// render side does with the paint-filter payload.
function readBack(bytes: ArrayBuffer): Filter {
  const bb = new flatbuffers.ByteBuffer(new Uint8Array(bytes));
  return Filter.getRootAsFilter(bb);
}

const GRAYSCALE = [
  0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0, 0, 0,
  1, 0,
];

describe("buildImageFilter → nested Filter", () => {
  it("serializes a single blur leaf directly (uniform and per-axis)", () => {
    const f = readBack(buildImageFilter([{ kind: "blur", blur: 4 }])!);
    expect(f.kind()).toBe(FilterKind.IMAGE_BLUR);
    expect(f.fx()).toBe(4);
    expect(f.fy()).toBe(4);

    const axial = readBack(buildImageFilter([{ kind: "blur", blur: { x: 2, y: 6 } }])!);
    expect(axial.fx()).toBe(2);
    expect(axial.fy()).toBe(6);
    expect(axial.childrenLength()).toBe(0);
  });

  it("serializes a dropShadow with color parsed to 0xAARRGGBB", () => {
    const f = readBack(
      buildImageFilter([{ kind: "dropShadow", dx: 0, dy: 8, blur: 6, color: "#00000055" }])!,
    );
    expect(f.kind()).toBe(FilterKind.IMAGE_DROP_SHADOW);
    expect(f.fx()).toBe(0); // dx
    expect(f.fy()).toBe(8); // dy
    expect(f.fz()).toBe(6); // sigma
    expect(f.color()).toBe(0x55000000);
  });

  it("composes several filters in declaration order ([0] innermost)", () => {
    const bytes = buildImageFilter([
      { kind: "blur", blur: 2 },
      { kind: "dropShadow", dx: 0, dy: 8, blur: 6, color: "black" },
    ])!;
    const f = readBack(bytes);
    expect(f.kind()).toBe(FilterKind.IMAGE_COMPOSE);
    expect(f.childrenLength()).toBe(2);
    expect(f.children(0)!.kind()).toBe(FilterKind.IMAGE_BLUR); // first declared = innermost
    expect(f.children(1)!.kind()).toBe(FilterKind.IMAGE_DROP_SHADOW);
  });

  it("returns null for none / wrong-kind specs", () => {
    expect(buildImageFilter([])).toBeNull();
    expect(buildImageFilter([{ kind: "colorMatrix", matrix: GRAYSCALE }])).toBeNull();
  });
});

describe("buildColorFilter → nested Filter", () => {
  it("serializes a colorMatrix with its 20 floats", () => {
    const f = readBack(buildColorFilter([{ kind: "colorMatrix", matrix: GRAYSCALE }])!);
    expect(f.kind()).toBe(FilterKind.COLOR_MATRIX);
    expect(f.matrixLength()).toBe(20);
    expect(f.matrix(0)).toBeCloseTo(0.2126);
    expect(f.matrix(19)).toBe(0);
  });

  it("serializes a colorBlend with mode byte + color", () => {
    const f = readBack(
      buildColorFilter([{ kind: "colorBlend", color: "#ff000080", mode: "src-in" }])!,
    );
    expect(f.kind()).toBe(FilterKind.COLOR_BLEND);
    expect(f.color()).toBe(0x80ff0000);
    expect(f.mode()).toBe(5); // skityrt BlendMode SRC_IN == 5 (== skity order)
  });

  it("drops invalid matrices (wrong length / non-finite) and nulls out when nothing survives", () => {
    expect(buildColorFilter([{ kind: "colorMatrix", matrix: [1, 2, 3] }])).toBeNull();
    expect(
      buildColorFilter([{ kind: "colorMatrix", matrix: [...GRAYSCALE.slice(0, 19), NaN] }]),
    ).toBeNull();
    // A valid sibling keeps the list alive; the invalid one is skipped.
    const f = readBack(
      buildColorFilter([
        { kind: "colorMatrix", matrix: [1, 2, 3] },
        { kind: "colorBlend", color: "red", mode: "multiply" },
      ])!,
    );
    expect(f.kind()).toBe(FilterKind.COLOR_BLEND);
  });
});

describe("buildMaskFilter → nested Filter", () => {
  it("serializes maskBlur with the skity 1-based BlurStyle bytes", () => {
    const normal = readBack(buildMaskFilter([{ kind: "maskBlur", blur: 8 }])!);
    expect(normal.kind()).toBe(FilterKind.MASK_BLUR);
    expect(normal.fx()).toBe(8);
    expect(normal.style()).toBe(BlurStyle.NORMAL); // 1, not 0
    expect(
      readBack(buildMaskFilter([{ kind: "maskBlur", blur: 8, style: "inner" }])!).style(),
    ).toBe(BlurStyle.INNER);
  });

  it("takes only the first maskBlur (no compose) and nulls for none", () => {
    expect(buildMaskFilter([{ kind: "blur", blur: 4 }])).toBeNull();
    const f = readBack(
      buildMaskFilter([
        { kind: "maskBlur", blur: 8 },
        { kind: "maskBlur", blur: 99 },
      ])!,
    );
    expect(f.fx()).toBe(8); // first wins
    expect(f.childrenLength()).toBe(0);
  });
});
