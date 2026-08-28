#!/usr/bin/env node
// Build, install and launch the Android app. If the dev server isn't running,
// open it in a NEW terminal window (like `react-native run-android` does), so it
// stays independent — shared across android/ios launches and stoppable on its own.
//
// JDK is provided by mise (mise.toml `java = "17"`); gradlew inherits it.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import http from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXAMPLE_DIR = join(__dirname, "..");
const ANDROID_DIR = join(EXAMPLE_DIR, "android");
const APP_COMPONENT = "com.scumble.example/com.scumble.example.MainActivity";
const BUNDLE_URL = "http://localhost:3000/main.lynx.bundle";
const PORTS = [3000, 3001];
const IS_WIN = process.platform === "win32";

function findSdk() {
  const cands = [
    process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT,
    join(homedir(), "Library", "Android", "sdk"),
  ].filter(Boolean);
  for (const c of cands) if (existsSync(join(c, "platform-tools", "adb"))) return c;
  throw new Error(
    "Android SDK not found. Set ANDROID_HOME (or ANDROID_SDK_ROOT), or install the SDK.",
  );
}

const ANDROID_HOME = findSdk();
const adb = join(ANDROID_HOME, "platform-tools", "adb");
const gradlew = IS_WIN ? "gradlew.bat" : "./gradlew";
const env = { ...process.env, ANDROID_HOME };

function run(cmd, args, opts = {}) {
  console.log(`\n▶ ${cmd} ${args.join(" ")}`);
  const r = spawnSync(cmd, args, { stdio: "inherit", env, shell: IS_WIN, ...opts });
  if (r.status !== 0) {
    console.error(`✗ command failed: ${cmd} ${args.join(" ")}`);
    process.exit(r.status ?? 1);
  }
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

// Open `pnpm dev` in a new terminal window (mac/win/linux). Falls back to a
// hint if no GUI terminal can be spawned.
function openDevServerInNewTerminal() {
  const cmd = `cd "${EXAMPLE_DIR}" && pnpm dev`;
  console.log(`▶ starting dev server in a new terminal window…`);
  if (process.platform === "darwin") {
    const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const script = `tell application "Terminal"\n  activate\n  do script "${escaped}"\nend tell`;
    const r = spawnSync("osascript", ["-e", script], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("failed to open a new Terminal window via osascript");
  } else if (IS_WIN) {
    spawn("cmd", ["/c", "start", '"Lynx dev server"', "cmd", "/k", cmd], {
      detached: true,
      stdio: "ignore",
      shell: true,
    }).unref();
  } else {
    spawn("sh", ["-c", `{ gnome-terminal -- bash -lc "${cmd}" || xterm -e "${cmd}"; } &`], {
      detached: true,
      stdio: "ignore",
    }).unref();
  }
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

// 2) adb reverse so the device's localhost:3000/3001 reach the host dev server
for (const p of PORTS) run(adb, ["reverse", `tcp:${p}`, `tcp:${p}`]);

// 3) build + install the debug APK (JDK comes from mise)
run(gradlew, ["installDebug"], { cwd: ANDROID_DIR });

// 4) launch the app
run(adb, ["shell", "am", "start", "-n", APP_COMPONENT]);

console.log(
  "\n✓ app launched. dev server runs in its own terminal — edit src/App.tsx to hot-reload.",
);
