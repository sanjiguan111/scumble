#!/usr/bin/env node
// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Generates C++ + Java FlatBuffers stubs from packages/lynx-skity/schema/*.fbs
// using the flatc binary fetched by habitat (DEPS.py → shared/third_party/flatc).
//
// Runs automatically on `postinstall`, and manually via
// `pnpm --filter lynx-skity generate-fbs` (re-run after editing the .fbs).
//
// Generates WITHOUT --gen-all: each header only defines its own types and
// #includes the others (guarded), so multiple stubs can be included together
// without redefinition errors. This mirrors lynx-native-svg's flatc usage.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const flatc = resolve(pkgRoot, "shared/third_party/flatc/flatc");
const schemaDir = resolve(pkgRoot, "schema");

if (!existsSync(flatc)) {
  console.warn("[lynx-skity] flatc not found at", flatc);
  console.warn(
    "[lynx-skity] Run `tools/hab sync` first, then `pnpm --filter lynx-skity generate-fbs`.",
  );
  // Non-fatal: an install must not break just because habitat hasn't synced yet.
  process.exit(0);
}

const fbsFiles = ["render_tree_common.fbs", "render_tree_style.fbs", "render_tree.fbs"].map((f) =>
  resolve(schemaDir, f),
);

const cppOut = resolve(pkgRoot, "shared/skity/generated");
const javaOut = resolve(pkgRoot, "android/src/main/fbs-gen");
mkdirSync(cppOut, { recursive: true });
mkdirSync(javaOut, { recursive: true });

// flatc args shared by both backends (no --gen-all; see file header).
const flatcArgs = (lang, out) => [lang, "-o", out, "-I", schemaDir, ...fbsFiles];

console.log("[lynx-skity] generating C++ FlatBuffers stubs →", cppOut);
execFileSync(flatc, flatcArgs("--cpp", cppOut), { stdio: "inherit" });

console.log("[lynx-skity] generating Java FlatBuffers stubs →", javaOut);
// --java-package-prefix aligns the generated package with the rest of the
// Android code (com.skity.graphics.*); C++ stubs stay in namespace `skityrt`.
execFileSync(
  flatc,
  [
    "--java",
    "--java-package-prefix",
    "com.skity.graphics",
    "-o",
    javaOut,
    "-I",
    schemaDir,
    ...fbsFiles,
  ],
  { stdio: "inherit" },
);

console.log("[lynx-skity] FlatBuffers stubs generated.");
