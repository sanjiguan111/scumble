// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Lockstep version bump for the three published packages (@scumble/react,
// @scumble/graphics, @scumble/native) plus the native podspec — they version
// together because react's peerDependencies use `workspace:^`, which resolves
// to a narrow 0.x caret range.
//
// Usage: pnpm bump 0.2.0
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

if (!version || !/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version)) {
  console.error("Usage: pnpm bump <semver>   e.g. pnpm bump 0.2.0");
  process.exit(1);
}

const manifests = ["react", "graphics", "native"].map((name) =>
  join(root, "packages", name, "package.json"),
);
const podspec = join(root, "packages", "native", "scumble.podspec");

for (const file of manifests) {
  const json = JSON.parse(readFileSync(file, "utf8"));
  const prev = json.version;
  if (prev === version) continue;
  json.version = version;
  // Keep key order and trailing newline stable for prettier-clean diffs.
  writeFileSync(file, JSON.stringify(json, null, 2) + "\n");
  console.log(`${file.replace(`${root}/`, "")}: ${prev} -> ${version}`);
}

{
  const src = readFileSync(podspec, "utf8");
  const next = src.replace(/s\.version\s*=\s*'[^']*'/, `s.version = '${version}'`);
  if (next !== src) {
    writeFileSync(podspec, next);
    console.log(`packages/native/scumble.podspec: -> ${version}`);
  }
}
