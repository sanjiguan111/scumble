#!/usr/bin/env node
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Runs the host-side C++ unit tests (scripts/tests, GoogleTest via
// tests/CMakeLists.txt — the framework itself comes from habitat,
// DEPS.py → shared/third_party/googletest, so `tools/hab sync` must have run
// once). Plain cmake configure → build → ctest, out-of-tree under tmp. Run:
// `pnpm --filter @lynx-skity/native test:native`.
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const testsDir = resolve(pkgRoot, "tests");
const buildDir = resolve(tmpdir(), "lynx-skity-native-tests");
mkdirSync(buildDir, { recursive: true });

function run(cmd, args) {
  console.log(`[lynx-skity] ${cmd} ${args.join(" ")}`);
  return spawnSync(cmd, args, { cwd: pkgRoot, stdio: "inherit" }).status === 0;
}

const ok =
  run("cmake", ["-S", testsDir, "-B", buildDir, "-DCMAKE_BUILD_TYPE=Debug"]) &&
  run("cmake", ["--build", buildDir, "--parallel"]) &&
  run("ctest", ["--test-dir", buildDir, "--output-on-failure"]);

// Keep a compile database next to the sources (gitignored) so clangd resolves
// the GoogleTest include paths in the editor.
if (ok) {
  try {
    copyFileSync(
      resolve(buildDir, "compile_commands.json"),
      resolve(testsDir, "compile_commands.json"),
    );
  } catch {
    // Non-fatal: editor support only.
  }
}

if (!ok) process.exit(1);
