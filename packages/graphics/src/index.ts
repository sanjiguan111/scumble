// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * @lynx-skity/graphics — framework-agnostic value parsers for lynx-skity.
 *
 * Converts the values users like to write — CSS color strings, paint enums
 * (`"round"`, `"evenodd"`, …), CSS `transform` lists, SVG path `d` strings —
 * into the raw numeric / FlatBuffer-byte values the native skity intrinsic
 * tags (`<skity-*>`) consume. **The native layer never parses strings**: every
 * string-shaped value is resolved here, in JS, before it crosses into native,
 * which keeps all parsing logic in one place and the native side a thin memcpy.
 *
 * The package also exposes {@link Path2D}, a command-style path builder with
 * the same shape as the Web Canvas `Path2D`, for authoring paths imperatively
 * instead of via an SVG `d` string.
 *
 * Framework-agnostic: shared by `@lynx-skity/react` (and a future Vue layer).
 * It is a pure build-time utility with no native code, so it ships compiled
 * `dist/` (the vendored FlatBuffers runtime needs a `tsc` whole-program emit
 * to erase its type-only re-exports). See `RENDER_ARCHITECTURE.md` for the
 * end-to-end data-flow.
 *
 * @example
 * import { parseColor, parsePath, Path2D } from "@lynx-skity/graphics";
 *
 * parseColor("rebeccapurple");           // 0xff663399  (packed 0xAARRGGBB)
 * parseColor("rgb(100% 50% 25% / 50%)"); // 0x80ff8040
 * parsePath("M0 0 L10 10 Z");            // ArrayBuffer — PathCommandList bytes
 * new Path2D().moveTo(0, 0).lineTo(10, 10).close();  // imperative equivalent
 */

// Lynx's JSC runtime has no TextEncoder / TextDecoder (web APIs); the vendored
// flatbuffers runtime instantiates them as Builder / ByteBuffer instance fields
// (`new Builder()` runs `new TextEncoder()`). Without a polyfill, parsePath /
// parseTransform throw at builder construction and the whole page fails to
// render. Our nested FlatBuffers (PathCommandList / TransformOpList) carry only
// numbers, so encode/decode are never actually called — the polyfill just has
// to exist with the right shape.
{
  const g: any = globalThis;
  if (typeof g.TextEncoder === "undefined") {
    g.TextEncoder = class {
      encode(input: string = ""): Uint8Array {
        const bytes: number[] = [];
        for (let i = 0; i < input.length; i++) {
          const c = input.charCodeAt(i);
          if (c < 0x80) bytes.push(c);
          else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
          else bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
        }
        return new Uint8Array(bytes);
      }
    };
  }
  if (typeof g.TextDecoder === "undefined") {
    g.TextDecoder = class {
      decode(input: Uint8Array = new Uint8Array(0)): string {
        let out = "";
        for (let i = 0; i < input.length; i++) out += String.fromCharCode(input[i]);
        return out;
      }
    };
  }
}

// Shared enum-byte constants + the CmdOp type used across path/transform.
export * from "./binary";
// bytes ⇄ base64 — for Lynx's string-only prop channel (it won't marshal bytes).
export * from "./base64";
// Color: any CSS Color 4 string (or number/tuple/object) → packed 0xAARRGGBB.
export * from "./color";
// Paint enums: friendly string literals → skityrt LineCap/LineJoin/FillRule bytes.
export * from "./enum";
// Transform: a CSS `transform` list → TransformOpList FlatBuffer bytes.
export * from "./transform";
// Path: an SVG `d` string (or a Path2D builder) → PathCommandList FlatBuffer bytes.
export * from "./path";
// Gradient: a linear gradient spec → nested Gradient FlatBuffer bytes (USER_SPACE).
export * from "./gradient";
// Clip: group clip shapes (rect/rrect/path) → nested ClipList FlatBuffer bytes.
export * from "./clip";
// Filters: paint filter specs (blur/dropShadow/colorMatrix/colorBlend/maskBlur)
// → nested Filter FlatBuffer bytes.
export * from "./filter";
// Paragraph: styled span specs → nested SpanList FlatBuffer bytes (the
// <Paragraph> layout input).
export * from "./paragraph";
// Animation: track specs → nested AnimationList FlatBuffer bytes (render-side
// per-vsync interpolation — ANIMATION_DESIGN.md).
export * from "./animation";
