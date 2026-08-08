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
export * from "./binary";
export * from "./color";
export * from "./enum";
export * from "./transform";
export * from "./path";
