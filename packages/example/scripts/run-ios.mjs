#!/usr/bin/env node
// Build, install and launch the iOS app on the Simulator. If the dev server
// isn't running, open it in a NEW terminal window (like run-android.mjs), so it
// stays independent — shared across android/ios launches and stoppable on its
// own.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, "..");
const IOS_DIR = join(EXAMPLE_DIR, "ios");
const WORKSPACE = "LynxSkityDemo.xcworkspace";
const SCHEME = "LynxSkityDemo";
const CONFIGURATION = "Debug";
const BUNDLE_ID = "com.skity.example";
const BUNDLE_URL = "http://localhost:3000/main.lynx.bundle";
const DERIVED_DATA = "build";

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

function runQuiet(cmd, args) {
  return spawnSync(cmd, args, { encoding: "utf8" });
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
      "For reproducible installs: sudo gem install bundler",
  );
  run("pod", ["install"], { cwd: IOS_DIR });
}

// 3) build for the Simulator
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
    "generic/platform=iOS Simulator",
    "-derivedDataPath",
    DERIVED_DATA,
    "build",
  ],
  { cwd: IOS_DIR },
);

// 4) pick / boot a Simulator and install + launch
function findApp() {
  const productsDir = join(
    IOS_DIR,
    DERIVED_DATA,
    "Build",
    "Products",
    `${CONFIGURATION}-iphonesimulator`,
  );
  const app = join(productsDir, `${SCHEME}.app`);
  if (!existsSync(app)) {
    console.error(`✗ built .app not found at ${app}`);
    process.exit(1);
  }
  return app;
}

function bootedDevice() {
  const out = runQuiet("xcrun", ["simctl", "list", "devices", "booted", "-j"]).stdout;
  try {
    const parsed = JSON.parse(out);
    for (const runtime of Object.values(parsed.devices || {})) {
      for (const d of runtime) {
        if (d.state === "Booted") return d.udid;
      }
    }
  } catch (_) {}
  return null;
}

function bootAnyIphone() {
  const out = runQuiet("xcrun", ["simctl", "list", "devices", "available", "-j"]).stdout;
  let udid = null;
  try {
    const parsed = JSON.parse(out);
    for (const runtime of Object.values(parsed.devices || {})) {
      for (const d of runtime) {
        if (/iPhone/.test(d.name)) {
          udid = d.udid;
          break;
        }
      }
      if (udid) break;
    }
  } catch (_) {}
  if (!udid) {
    console.error("✗ no available iPhone Simulator found.");
    console.error(`  Open ${WORKSPACE} in Xcode and pick a destination manually.`);
    process.exit(1);
  }
  run("xcrun", ["simctl", "boot", udid]);
  run("open", ["-a", "Simulator"]);
  return udid;
}

const appPath = findApp();
const device = bootedDevice() || bootAnyIphone();
run("xcrun", ["simctl", "install", device, appPath]);
run("xcrun", ["simctl", "launch", device, BUNDLE_ID]);

console.log(
  "\n✓ app launched. dev server runs in its own terminal — edit src/App.tsx and reload to iterate.",
);
