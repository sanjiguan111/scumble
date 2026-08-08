// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * lynx-skity/parsers — framework-agnostic value parsers for lynx-skity.
 *
 * Converts front-end-friendly values (CSS color strings, paint enums, CSS
 * transforms, SVG path data) into the raw numeric / ArrayBuffer values the
 * native skity intrinsic tags consume. The native layer never parses strings.
 *
 * Shared by @lynx-skity/react and @lynx-skity/vue. See RENDER_ARCHITECTURE.md.
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

export * from "./binary";
export * from "./base64";
export * from "./color";
export * from "./enum";
export * from "./transform";
export * from "./path";
