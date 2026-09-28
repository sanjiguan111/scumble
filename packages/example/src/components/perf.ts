// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Lightweight latency probes for the on-device performance investigation —
// log lines land in the Lynx DevTool console (and NSLog/logcat in debug).
//
//   tap→commit   — handler entry to post-commit passive effect.
//   render(js)   — body entry to post-commit passive effect.
//   queue-lag    — how late a `setTimeout(0)` fired right after a commit:
//                  large ⇒ the JS thread was congested (render loop / task
//                  queue), small ⇒ the thread is free and the cost was
//                  inside the measured span itself.
//   tap→paint    — tap mark → layoutchange of a size-changing text: the
//                  USER-VISIBLE latency (patch + layout actually ran).
//   commit rate  — commits in the trailing second: exposes render loops.
//
// The probe never logs per-frame during animations (throttled), because
// console lines serialize through the DevTool bridge and measuring with a
// firehose changes the result.
const marks = new Map<string, number>();

/** Overwrite (latest wins) — mark at a tap/handler entry. */
export function perfMark(key: string): void {
  marks.set(key, Date.now());
}

/** Set only if absent — mark the FIRST body entry (mount timing). */
export function perfMarkOnce(key: string): void {
  if (!marks.has(key)) marks.set(key, Date.now());
}

/** Log and clear a pending mark; no-op when the mark is absent. */
export function perfLogSince(key: string, label: string): void {
  const t0 = marks.get(key);
  if (t0 === undefined) return;
  marks.delete(key);
  console.log(`[perf] ${label}: ${Date.now() - t0}ms`);
}

// ---- commit-rate + render-log throttle ----

const commitTimes: number[] = [];
let lastRateWarn = 0;
let quietCommits = 0;

/**
 * Call once per commit (from a passive effect). Counts the trailing-second
 * commit rate (loop detector) and throttles per-commit logging: `label`
 * logs only when it exceeds `thresholdMs` or every 25th quiet commit.
 */
export function perfCommit(renderMs: number, label: string, thresholdMs = 80): void {
  const now = Date.now();
  commitTimes.push(now);
  while (commitTimes.length > 0 && now - commitTimes[0]! > 1000) commitTimes.shift();
  if (commitTimes.length >= 20 && now - lastRateWarn > 2000) {
    lastRateWarn = now;
    console.log(
      `[perf] COMMIT RATE: ${commitTimes.length} commits in ${now - commitTimes[0]!}ms — render loop`,
    );
  }
  if (renderMs >= thresholdMs) {
    console.log(`[perf] ${label}: ${renderMs}ms (rate ${commitTimes.length}/s)`);
    quietCommits = 0;
  } else if (++quietCommits % 25 === 0) {
    console.log(`[perf] ${label}: ${renderMs}ms (25 quiet commits, rate ${commitTimes.length}/s)`);
  }
}

/**
 * Fire-and-forget event-loop congestion probe: logs how late a `setTimeout(0)`
 * posted NOW actually runs. Call right after a commit.
 */
export function perfQueueLag(label: string): void {
  const t0 = Date.now();
  setTimeout(() => {
    console.log(`[perf] queue-lag(${label}): ${Date.now() - t0}ms`);
  }, 0);
}
