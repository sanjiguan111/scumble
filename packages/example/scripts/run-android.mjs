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

// Probe result: "up" (HTTP 200), "refused" (nothing listening), or
// "no-response" (port held but no HTTP answer — stale server or mid-compile).
function probeDevServer(timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(BUNDLE_URL, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve(res.statusCode === 200 ? "up" : "no-response");
    });
    req.on("error", (e) =>
      resolve(e.code === "ECONNREFUSED" || e.code === "ENOTFOUND" ? "refused" : "no-response"),
    );
    req.on("timeout", () => {
      req.destroy();
      resolve("no-response");
    });
  });
}

async function isDevServerUp() {
  return (await probeDevServer()) === "up";
}

// PID of whatever holds the port, or null (lsof is present on macOS/linux).
function portListenerPid(port) {
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const pid = r.stdout?.trim().split("\n")[0];
  return pid || null;
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
  throw new Error(
    `\ndev server did not become ready at ${BUNDLE_URL}\n` +
      `  check the dev-server terminal for errors, and whether a stale process holds the port:\n` +
      `  lsof -nP -iTCP:3000 -sTCP:LISTEN`,
  );
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
const initial = await probeDevServer();
if (initial === "up") {
  console.log("✓ dev server already up (reusing it)");
} else if (initial === "no-response") {
  // Someone holds the port but never answers: usually a stale dev server.
  // (A freshly started one still compiling recovers within a minute.)
  const pid = portListenerPid(3000);
  console.log(
    `⚠ port 3000 is held${pid ? ` by PID ${pid}` : ""} but not answering` +
      ` — waiting up to 60s in case it is still compiling…`,
  );
  try {
    await waitForBundle(60000);
  } catch {
    console.error(`✗ dev server at ${BUNDLE_URL} never answered.`);
    if (pid) {
      console.error(`  PID ${pid} holds port 3000 without responding — likely a stale dev server.`);
      console.error(`  Kill it and re-run:  kill ${pid}`);
    } else {
      console.error("  Inspect the port:  lsof -nP -iTCP:3000 -sTCP:LISTEN");
    }
    process.exit(1);
  }
} else {
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
