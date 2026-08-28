#!/usr/bin/env node
// Build, install and launch the iOS app on the Simulator — RN run-ios style:
//   • builds into Xcode's DEFAULT DerivedData (no -derivedDataPath), so the
//     CLI and the Xcode GUI share one build cache and reuse each other's
//     incremental builds (pods/skity native aren't recompiled from scratch);
//   • targets the currently-booted Simulator by default (or --simulator <name>),
//     and the xcodebuild -destination points at that exact device.
// If the dev server isn't running, open it in a NEW terminal window, so it
// stays independent — shared across android/ios launches and stoppable on its
// own.
import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, "..");
const IOS_DIR = join(EXAMPLE_DIR, "ios");
const WORKSPACE = "ScumbleDemo.xcworkspace";
const SCHEME = "ScumbleDemo";
const CONFIGURATION = "Debug";
const BUNDLE_ID = "com.skity.example";
const BUNDLE_URL = "http://localhost:3000/main.lynx.bundle";

if (process.platform !== "darwin") {
  console.error("✗ iOS launch is only supported on macOS.");
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", ...opts });
  if (r.status !== 0) {
    console.error(`✗ command failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
}

function runQuiet(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function hasCommand(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status === 0;
}

function isDevServerUp() {
  return new Promise((resolve) => {
    const req = http.get(BUNDLE_URL, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBundle(timeoutMs = 120000) {
  const start = Date.now();
  process.stdout.write("▶ waiting for dev server");
  while (Date.now() - start < timeoutMs) {
    if (await isDevServerUp()) {
      console.log("");
      return;
    }
    process.stdout.write(".");
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`\ndev server did not become ready at ${BUNDLE_URL}`);
}

function openDevServerInNewTerminal() {
  const cmd = `cd "${EXAMPLE_DIR}" && pnpm dev`;
  console.log(`▶ starting dev server in a new terminal window…`);
  const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const script = `tell application "Terminal"\n  activate\n  do script "${escaped}"\nend tell`;
  const r = spawnSync("osascript", ["-e", script], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("failed to open a new Terminal window via osascript");
}

// 1) dev server: reuse if running, otherwise open it in a new terminal window
if (!(await isDevServerUp())) {
  try {
    openDevServerInNewTerminal();
  } catch (e) {
    console.error(`✗ ${e.message}.`);
    console.error("  Start it manually in another terminal:  pnpm dev");
    process.exit(1);
  }
  try {
    await waitForBundle();
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
} else {
  console.log("✓ dev server already up (reusing it)");
}

// 2) install pinned Ruby gems (Gemfile) then pod install via bundler. Pinning
//    CocoaPods through bundler avoids Podfile.lock drift across machines
//    (React Native convention).
if (hasCommand("bundle")) {
  run("bundle", ["install"], { cwd: IOS_DIR });
  run("bundle", ["exec", "pod", "install"], { cwd: IOS_DIR });
} else {
  console.log(
    "⚠ bundler not found — falling back to system `pod`. " +
      "For reproducible installs run `mise install` (mise.toml pins ruby 3.4.9)",
  );
  run("pod", ["install"], { cwd: IOS_DIR });
}

// 3) pick the target Simulator — the booted one by default, --simulator <name>
//    to override, else the first available iPhone. Build + install target it.
function simDevices(filter) {
  const out = runQuiet("xcrun", ["simctl", "list", "devices", filter, "-j"]).stdout;
  try {
    const parsed = JSON.parse(out);
    return Object.values(parsed.devices || {}).flat();
  } catch (_) {
    return [];
  }
}

function simulatorArg() {
  const i = process.argv.indexOf("--simulator");
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

function pickDevice() {
  const want = simulatorArg();
  if (want) {
    const m = simDevices("available").find(
      (d) => d.name.toLowerCase().includes(want.toLowerCase()) || d.udid === want,
    );
    if (!m) {
      console.error(
        `✗ --simulator "${want}" not found. List with: xcrun simctl list devices available`,
      );
      process.exit(1);
    }
    return m;
  }
  const booted = simDevices("booted").find((d) => d.state === "Booted");
  if (booted) {
    console.log(`✓ reusing booted Simulator: ${booted.name}`);
    return booted;
  }
  const iphone = simDevices("available").find((d) => /iPhone/.test(d.name));
  if (!iphone) {
    console.error("✗ no available iPhone Simulator found.");
    console.error(`  Open ${WORKSPACE} in Xcode and pick a destination manually.`);
    process.exit(1);
  }
  return iphone;
}

const device = pickDevice();
if (device.state !== "Booted") {
  run("xcrun", ["simctl", "boot", device.udid]);
  run("open", ["-a", "Simulator"]);
}
const DESTINATION = `platform=iOS Simulator,id=${device.udid}`;

// 4) build into the DEFAULT DerivedData (no -derivedDataPath) so the Xcode GUI
//    and this CLI share one incremental build cache.
run(
  "xcodebuild",
  [
    "-workspace",
    WORKSPACE,
    "-scheme",
    SCHEME,
    "-configuration",
    CONFIGURATION,
    "-destination",
    DESTINATION,
    "build",
  ],
  { cwd: IOS_DIR },
);

// 5) locate the built .app via build settings (resolves the default DerivedData
//    path, which isn't project-local).
function findApp() {
  const r = runQuiet(
    "xcodebuild",
    [
      "-workspace",
      WORKSPACE,
      "-scheme",
      SCHEME,
      "-configuration",
      CONFIGURATION,
      "-destination",
      DESTINATION,
      "-showBuildSettings",
    ],
    { cwd: IOS_DIR },
  );
  const m = r.stdout.match(/^\s*BUILT_PRODUCTS_DIR = (.+)$/m);
  if (!m) {
    console.error("✗ could not resolve BUILT_PRODUCTS_DIR from xcodebuild.");
    process.exit(1);
  }
  const app = join(m[1].trim(), `${SCHEME}.app`);
  if (!existsSync(app)) {
    console.error(`✗ built .app not found at ${app}`);
    process.exit(1);
  }
  return app;
}

const appPath = findApp();
run("xcrun", ["simctl", "install", device.udid, appPath]);
run("xcrun", ["simctl", "launch", device.udid, BUNDLE_ID]);

console.log(
  "\n✓ app launched. dev server runs in its own terminal — edit src/App.tsx and reload to iterate.",
);
