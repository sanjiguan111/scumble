// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Module-graph smoke: the full vendored index (contexts, d3, its-fine, all
// three shims) must LOAD without a module-scope crash — a white example page
// once traced to exactly such a failure class. Lives outside src/ (generated).
import { describe, expect, it } from "vitest";

import * as Victory from "../src/index.js";

describe("victory module graph", () => {
  it("loads the full index without throwing", () => {
    expect(Victory.CartesianChart).toBeTruthy();
    expect(Victory.Line).toBeTruthy();
    expect(Victory.Scatter).toBeTruthy();
  });
});

describe("runtime polyfills", () => {
  it("installs the Lynx-runtime builtins the vendored code relies on", async () => {
    await import("../shims/polyfills.js");
    expect((globalThis as Record<string, unknown>).__VICTORY_POLYFILLS__).toBe(true);
    // The exact upstream crash: domain arrays reach .at() on device.
    const domain = [3, 7, 9];
    expect((domain as unknown as { at: (i: number) => number }).at(0)).toBe(3);
    expect((domain as unknown as { at: (i: number) => number }).at(-1)).toBe(9);
    expect((domain as unknown as { at: (i: number) => number }).at(9)).toBeUndefined();
  });
});
