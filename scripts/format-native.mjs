#!/usr/bin/env node
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Format C++ / Objective-C(++) sources with clang-format, excluding vendored
// (third_party), generated (flatc stubs, autolink), and build outputs.
// Invoked by `pnpm format` / `pnpm format:check`. The clang-format binary comes
// from the npm `clang-format` devDependency (node_modules/.bin/clang-format).
import { execFileSync } from "node:child_process";

const check = process.argv.includes("--check");

const out = execFileSync(
  "find",
  [
    "packages",
    "-type",
    "f",
    "(",
    "-name",
    "*.cpp",
    "-o",
    "-name",
    "*.cc",
    "-o",
    "-name",
    "*.h",
    "-o",
    "-name",
    "*.hpp",
    "-o",
    "-name",
    "*.m",
    "-o",
    "-name",
    "*.mm",
    ")",
    "-not",
    "-path",
    "*/node_modules/*",
    "-not",
    "-path",
    "*/third_party/*",
    "-not",
    "-path",
    "*/generated/*",
    "-not",
    "-path",
    "*/fbs-gen/*",
    "-not",
    "-path",
    "*/Pods/*",
    "-not",
    "-path",
    "*/build/*",
    "-not",
    "-path",
    "*/.cxx/*",
    "-not",
    "-path",
    "*/oh_modules/*",
  ],
  { encoding: "utf8" },
);
const files = out.trim().split("\n").filter(Boolean);

if (files.length === 0) {
  console.log("no C++/ObjC files to format");
  process.exit(0);
}

// --dry-run --Werror makes clang-format exit non-zero if any file would change,
// which is what `format:check` wants.
const args = check ? ["--dry-run", "--Werror", ...files] : ["-i", ...files];

try {
  execFileSync("clang-format", args, { stdio: "inherit" });
} catch (e) {
  process.exitCode = e.status ?? 1;
  console.log(
    check
      ? `\nformat:check failed — run \`pnpm format\` to fix the C++/ObjC files above.`
      : `\nclang-format failed.`,
  );
  process.exit(process.exitCode);
}

if (!check) console.log(`formatted ${files.length} C++/ObjC file(s)`);
else console.log(`checked ${files.length} C++/ObjC file(s) — OK`);
