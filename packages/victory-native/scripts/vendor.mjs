// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Vendor the upstream Victory Native XL into src/ and codemod its imports
// onto the scumble lanes. The upstream tree comes from the OFFICIAL npm
// package's bundled src/ (exact version pinned in package.json — dist/
// is never used: pre-compiled JSX cannot render on Lynx). src/ here is a
// GENERATED tree (gitignored) — never hand-edit it: fixes belong in
// shims/, the codemod rules below, or (last resort) a fork branch.
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

import { createRequire } from "node:module";
import { cpSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

const PKG = new URL("..", import.meta.url).pathname;
// The official npm tarball ships the TSX SOURCES alongside dist (dist is
// unusable on Lynx — pre-compiled jsx() calls render an empty patch), so
// victory-native is pinned EXACTLY in package.json and vendored from its src/.
const UPSTREAM = join(
  // resolve the exports "." target (dist/index.js), then climb to the root
  dirname(dirname(createRequire(import.meta.url).resolve("victory-native"))),
  "src",
);
const SRC = join(PKG, "src");

// Rewritten specifiers are EXTENSIONLESS (like upstream's own imports): the
// shims ship as .ts/.tsx sources, and a .js suffix only resolves when the
// consumer's bundler maps .js→.ts/.tsx (extensionAlias) — rspeedy 0.16.5
// dropped that default, breaking a registry install of the .js-suffixed
// tarball ("Can't resolve ../../shims/reanimated.js"). Plain
// resolve.extensions handles extensionless everywhere.
const rulesFor = (relPrefix) => [
  [/@shopify\/react-native-skia"/g, '@scumble/skia-compat"'],
  // One React identity: the app runs @lynx-js/react — a second real-react
  // copy in the bundle makes victory's hooks throw (invalid hook call) and
  // the page renders an empty patch (the white-screen bug).
  [/"react"/g, '"@lynx-js/react"'],
  [/"victory-native"/g, `"${relPrefix}/index"`],
  [/"react-native-reanimated"/g, `"${relPrefix}/shims/reanimated"`],
  [
    /"react-native-gesture-handler\/lib\/typescript\/handlers\/gestureHandlerCommon"/g,
    `"${relPrefix}/shims/gesture-handler"`,
  ],
  [/"react-native-gesture-handler"/g, `"${relPrefix}/shims/gesture-handler"`],
  [/"react-native"/g, `"${relPrefix}/shims/react-native"`],
];

// Whole-file overrides: upstream files whose LOGIC scumble replaces
// outright (not just import lanes). Keyed by path suffix below SRC; value =
// path relative to the package root. The override is written VERBATIM (no
// codemod — its imports are already in final form) and must keep the
// upstream module's export surface.
//
// useAnimatedPath: the reactive shim pays a full subscriber re-render +
// Lynx patch+layout round PER TWEEN FRAME (measured ~280ms/commit on a MI6 —
// data-driven morphs throttled to ~3fps). Our replacement routes timing
// morphs onto scumble's NATIVE pathD animation track: ONE commit per data
// switch, then the render thread lerps per vsync with zero JS. The old
// from==to mount-tween skip (patchRules below, now removed) is generalized
// into it — any equal-geometry data switch settles without tweening.
const overrides = {
  "hooks/useAnimatedPath.ts": "shims/useAnimatedPath.ts",
};

// Logic patches for specific upstream files (applied after the import rules,
// keyed by path suffix below SRC). Real Reanimated animates on the UI thread
// at zero JS cost, so upstream tolerates pointless tweens; our REACTIVE shim
// pays a full subscriber re-render PER FRAME, so a from==to tween (every
// AnimatedPath mount: from and to start as copies of the same path) burns
// ~31 futile render+patch cycles per chart. Skip it when the path is
// unchanged — the tween only makes sense when there is geometry to travel.
const patchRules = {};

rmSync(SRC, { recursive: true, force: true });
try {
  cpSync(UPSTREAM, SRC, { recursive: true });
} catch {
  console.error(
    `victory vendor: cannot read ${UPSTREAM} — run pnpm install first (the upstream tree comes from the npm package's bundled src/).`,
  );
  process.exit(1);
}

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
const POLYFILL_IMPORT = 'import "../shims/polyfills";';
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
  const suffix = relative(SRC, file).split(sep).join("/");
  // Whole-file overrides short-circuit the codemod (their package imports
  // are already final-form; the upstream copy beneath them is discarded).
  // One rewrite: sibling-shim imports ("./reanimated.js") are written for
  // the shim's OWN location — re-anchor them to the destination's depth.
  const override = overrides[suffix];
  if (override !== undefined) {
    const shimText = readFileSync(join(PKG, override), "utf8");
    writeFileSync(file, shimText.replaceAll('"./reanimated"', `"${relPrefix}/shims/reanimated"`));
    touched++;
    continue;
  }
  let text = readFileSync(file, "utf8");
  const before = text;
  for (const [from, to] of rulesFor(relPrefix)) text = text.replace(from, to);
  for (const [from, to] of patchRules[suffix] ?? []) {
    if (!text.includes(from)) {
      console.error(
        `victory vendor: patch rule anchor not found in ${suffix} — upstream drift? Anchor:\n${from}`,
      );
      process.exit(1);
    }
    text = text.replace(from, to);
  }
  if (text !== before) {
    writeFileSync(file, text);
    touched++;
  }
}
console.log(
  `victory vendor: src/ regenerated from upstream; ${touched} file(s) touched (incl. polyfill import)`,
);
