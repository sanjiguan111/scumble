// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Playback control, React side (ANIMATION_CONTROL_DESIGN.md D6).
 *
 * The controller is the SPEC ITSELF: `createAnimation({...})` returns a plain
 * track spec carrying a minted playback handle plus imperative methods
 * (`pause()/play()/seekTo()/cancel()/onFinish()`). Handing it to `animate`
 * rides the handle down the SetAnimation command (`animationHandle` prop);
 * calling a method dispatches `animateControl` through the owning canvas's
 * UI-method lane. No hooks, no refs — a spec held in user code is stable
 * across re-renders by construction, and every shape stays a plain function.
 *
 * Transport: the canvas root's RefProxy forwards `NodesRef.invoke` through
 * Lynx's selector machinery (§G.3). Canvases register themselves here while
 * mounted; a control dispatch broadcasts to every live canvas — the one
 * holding the handle executes, the others answer "unknown handle" (harmless).
 *
 * Completion: `gessoAnimationFinish` fires on the canvas root carrying the
 * handle; the canvas demuxes it through the registry below
 * (`controller.onFinish`).
 */

import type { AnimationSpec } from "../types";

/** The imperative surface on a `createAnimation()` spec. */
export interface AnimationController {
  /** The minted playback handle (what the native tree registers). */
  readonly handle: string;
  /** Freeze in place (overlay holds; the driver goes idle). */
  pause(): void;
  /** Resume from the freeze, or restart an idle/finished node from t=0. */
  play(): void;
  /** Jump the timeline (ms, delay counts); repaints immediately. */
  seekTo(timeMs: number): void;
  /** Drop the tracks and return to base values (fires no finish event). */
  cancel(): void;
  /** Set (or with null, clear) the natural-completion callback. */
  onFinish(callback: (() => void) | null): void;
}

/** A track spec with a minted playback handle and controller attached. */
export interface ControlledAnimationSpec extends AnimationSpec {
  /** Playback handle + imperative control (createAnimation attaches this). */
  controller: AnimationController;
}

// ---- Module-level state (JS thread singleton) ----

const finishHandlers = new Map<string, () => void>();

/** What a mounted Canvas provides; commands ride its `invoke` lane. */
export interface AnimationControlHost {
  invokeAnimateControl(params: {
    handle: string;
    action: "play" | "pause" | "seek" | "cancel";
    time?: number;
  }): void;
}

const controlHosts = new Set<AnimationControlHost>();

let nextHandleId = 0;

function dispatch(handle: string, action: "play" | "pause" | "seek" | "cancel", time?: number) {
  // Broadcast: canvases that don't hold the handle answer an error code
  // (a no-op). Precise routing isn't worth a per-canvas registry on top of
  // the native handle→node map, which already IS the routing.
  for (const host of controlHosts) {
    host.invokeAnimateControl({ handle, action, time });
  }
}

/**
 * Mint a controllable animation spec: usable directly as `animate` (a plain
 * spec plus the handle), with `spec.controller` as the imperative surface.
 *
 * @example
 * const spin = createAnimation({ property: "rotate", from: 0, to: 360,
 *   duration: 3000, iterations: Infinity });
 * spin.controller.onFinish(() => console.log("done"));
 * <Rect animate={spin} ... />
 * <button bindtap={() => spin.controller.pause()} />
 */
export function createAnimation(spec: AnimationSpec): ControlledAnimationSpec {
  const handle = `ga${++nextHandleId}`;
  const controller: AnimationController = {
    handle,
    pause: () => dispatch(handle, "pause"),
    play: () => dispatch(handle, "play"),
    seekTo: (timeMs: number) => dispatch(handle, "seek", timeMs),
    cancel: () => dispatch(handle, "cancel"),
    onFinish: (callback) => {
      if (callback === null) finishHandlers.delete(handle);
      else finishHandlers.set(handle, callback);
    },
  };
  return { ...spec, controller };
}

/**
 * Extract a node's playback handle from its `animate` prop: the first
 * `createAnimation()` entry's handle (control is node-granular — one handle
 * steers ALL of the node's tracks). Plain specs → undefined (uncontrolled;
 * exactly the pre-control behavior).
 */
export function animationHandleOf(
  animate: AnimationSpec | (AnimationSpec | null | false)[] | null | undefined,
): string | undefined {
  const first: AnimationSpec | null | undefined = Array.isArray(animate)
    ? animate.find((s): s is AnimationSpec => !!s)
    : (animate as AnimationSpec | null | undefined);
  if (first == null) return undefined;
  return "controller" in first ? (first as ControlledAnimationSpec).controller.handle : undefined;
}

/** Canvas mounts: claim the dispatch lane (unregister on unmount). */
export function registerControlHost(host: AnimationControlHost): void {
  controlHosts.add(host);
}

export function unregisterControlHost(host: AnimationControlHost): void {
  controlHosts.delete(host);
}

/** Canvas receives `gessoanimationfinish` → route by handle. */
export function fireAnimationFinish(handle: unknown): void {
  if (typeof handle === "string") finishHandlers.get(handle)?.();
}
