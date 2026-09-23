// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Vendor the upstream Victory Native XL into src/ and codemod its imports
// onto the scumble lanes. The upstream tree itself is hab-synced
// (DEPS.py → upstream/, gitignored); src/ is a GENERATED tree (also
// gitignored) — never hand-edit it: fixes belong in shims/, the codemod
// rules below, or (last resort) a fork branch.
//
//   @shopify/react-native-skia   → @scumble/skia-compat
//   react                        → @lynx-js/react (single React identity)
//   react-native-reanimated      → <rel>/shims/reanimated
//   react-native-gesture-handler → <rel>/shims/gesture-handler
//   react-native                 → <rel>/shims/react-native
//   victory-native (self, tests) → <rel>/index
//
// Shim specifiers are RELATIVE to each file (the walk knows the depth) so
// consumers need no paths/exports configuration for them.

import {
  cpSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";

const PKG = new URL("..", import.meta.url).pathname;
const UPSTREAM = join(PKG, "upstream", "lib", "src");
const SRC = join(PKG, "src");

const rulesFor = (relPrefix) => [
  [/@shopify\/react-native-skia"/g, '@scumble/skia-compat"'],
  // One React identity: the app runs @lynx-js/react — a second real-react
  // copy in the bundle makes victory's hooks throw (invalid hook call) and
  // the page renders an empty patch (the white-screen bug).
  [/"react"/g, '"@lynx-js/react"'],
  [/"victory-native"/g, `"${relPrefix}/index.js"`],
  [/"react-native-reanimated"/g, `"${relPrefix}/shims/reanimated.js"`],
  [
    /"react-native-gesture-handler\/lib\/typescript\/handlers\/gestureHandlerCommon"/g,
    `"${relPrefix}/shims/gesture-handler.js"`,
  ],
  [/"react-native-gesture-handler"/g, `"${relPrefix}/shims/gesture-handler.js"`],
  [/"react-native"/g, `"${relPrefix}/shims/react-native.js"`],
];

rmSync(SRC, { recursive: true, force: true });
cpSync(UPSTREAM, SRC, { recursive: true });

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(ts|tsx)$/.test(name)) files.push(p);
  }
  return files;
}

// The package entry imports the runtime polyfills FIRST — before any chart
// code runs, the patched builtins (Array.prototype.at etc.) must be in place
// for the Lynx JS runtime. Idempotent: skipped when already present.
const ENTRY = join(SRC, "index.ts");
const POLYFILL_IMPORT = 'import "../shims/polyfills.js";';
const entryText = readFileSync(ENTRY, "utf8");

let touched = 0;
if (!entryText.startsWith(POLYFILL_IMPORT)) {
  writeFileSync(ENTRY, `${POLYFILL_IMPORT}\n${entryText}`);
  touched++;
}
for (const file of walk(SRC)) {
  const depth = relative(SRC, file).split(sep).length - 1;
  // shims/ sits at the package root — one level ABOVE src/ — so every file
  // climbs at least one "..".
  const relPrefix = Array(depth + 1)
    .fill("..")
    .join("/");
  let text = readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of rulesFor(relPrefix)) text = text.replace(from, to);
  if (text !== before) {
    writeFileSync(file, text);
    touched++;
  }
}
console.log(
  `victory vendor: src/ regenerated from upstream; ${touched} file(s) touched (incl. polyfill import)`,
);
