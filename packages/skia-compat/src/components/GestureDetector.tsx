// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * `<GestureDetector gesture={…}>` — the RNGH-shaped detector over Lynx touch
 * events. Wraps children in a plain `view` carrying
 * bindtouchstart/move/end/cancel; the touch payloads (element-local px,
 * `e.detail.touches`) feed the recognizer runtime built from the gesture
 * spec (builders/compositions from {@link Gesture}).
 *
 * The runtime lives in a REF and rebuilds only when the gesture object's
 * IDENTITY changes (the RNGH contract: a new builder instance = new config).
 * Re-renders triggered by the callbacks' own setState must not reset a
 * mid-flight gesture. Composition arbitration: `Race` cancels every other
 * recognizer when one activates; `Simultaneous` runs all independently. A
 * bare builder behaves like a single-gesture race. Coordinates handed to
 * callbacks are ELEMENT-LOCAL px (see the gesture module note) — a scrub
 * consumer maps them with its own element-width ratio.
 */

import { useRef } from "@lynx-js/react";
import type { ReactNode } from "@lynx-js/react";

import {
  GestureState,
  PanRecognizer,
  PinchRecognizer,
  type GestureComposition,
  type GesturePointer,
  type PanGestureBuilder,
  type PinchGestureBuilder,
} from "../gesture.js";

type AnyBuilder = PanGestureBuilder | PinchGestureBuilder | GestureComposition;

interface Runtime {
  pan: PanRecognizer[];
  pinch: PinchRecognizer[];
  race: boolean;
}

/** Build the recognizer runtime from a gesture spec (exported for tests). */
export function buildRuntime(gesture: AnyBuilder): Runtime {
  const runtime: Runtime = { pan: [], pinch: [], race: false };
  const add = (g: AnyBuilder, race: boolean): void => {
    if (g.kind === "pan") {
      runtime.pan.push(new PanRecognizer(g.config, g.callbacks));
    } else if (g.kind === "pinch") {
      runtime.pinch.push(new PinchRecognizer(g.callbacks));
    } else {
      runtime.race = runtime.race || race || g.kind === "race";
      for (const sub of g.gestures) add(sub, g.kind === "race");
    }
  };
  add(gesture, false);
  return runtime;
}

/**
 * The Lynx touch event as DELIVERED to handlers: `touches`/`changedTouches`
 * are TOP-LEVEL instance properties (the TouchEvent contract — NOT under
 * `detail`, which only carries the first finger's `{x, y}`). The declared
 * Lynx types are looser than the runtime shape, hence the union read — this
 * was a real on-device bug: reading `detail.touches` only fed every
 * recognizer empty pointer sets and pan never activated.
 */
export type LynxTouchEvent = {
  touches?: GesturePointer[];
  changedTouches?: GesturePointer[];
  detail?: { x?: number; y?: number; touches?: GesturePointer[] };
};

/** Extract the pointer set from a Lynx touch event (exported for tests). */
export function toPointers(e: LynxTouchEvent): GesturePointer[] {
  const touches = e.touches ?? e.detail?.touches ?? [];
  return (touches ?? []).map((t) => ({ identifier: t.identifier, x: t.x, y: t.y }));
}

export interface GestureDetectorProps {
  gesture: AnyBuilder;
  children?: ReactNode;
  style?: Record<string, string | number>;
}

export function GestureDetector(props: GestureDetectorProps) {
  const { gesture, children, style } = props;
  // Ref-held runtime + pointer set: survives re-renders, rebuilds only when
  // the gesture spec object identity changes.
  const state = useRef<{ spec: AnyBuilder; runtime: Runtime; pointers: GesturePointer[] } | null>(
    null,
  );
  if (state.current === null || state.current.spec !== gesture) {
    state.current = { spec: gesture, runtime: buildRuntime(gesture), pointers: [] };
  }

  const onStart = (e: LynxTouchEvent) => {
    const s = state.current!;
    s.pointers = toPointers(e);
    for (const p of s.runtime.pan) p.touchBegin(s.pointers);
    for (const p of s.runtime.pinch) p.update(s.pointers);
  };
  const onMove = (e: LynxTouchEvent) => {
    const s = state.current!;
    s.pointers = toPointers(e);
    for (const p of s.runtime.pan) {
      const before = p.getState();
      p.touchMove(s.pointers);
      if (
        s.runtime.race &&
        before !== GestureState.ACTIVE &&
        p.getState() === GestureState.ACTIVE
      ) {
        // This one just activated — the race is won; cancel the rest.
        for (const other of s.runtime.pan) if (other !== p) other.cancelByArbiter();
        for (const other of s.runtime.pinch) other.cancel();
      }
    }
    for (const p of s.runtime.pinch) p.update(s.pointers);
  };
  const onFinish = () => {
    const s = state.current!;
    for (const p of s.runtime.pan) p.touchEnd();
    for (const p of s.runtime.pinch) p.update([]);
    s.pointers = [];
  };
  const onCancel = () => {
    const s = state.current!;
    for (const p of s.runtime.pan) p.cancel();
    for (const p of s.runtime.pinch) p.cancel();
    s.pointers = [];
  };

  // Handlers are attached with a cast: Lynx's declared touch-event types
  // carry the loose `detail: {x, y}` shape (see LynxTouchEvent).
  return (
    <view
      bindtouchstart={onStart as never}
      bindtouchmove={onMove as never}
      bindtouchend={onFinish as never}
      bindtouchcancel={onCancel as never}
      style={style}
    >
      {children}
    </view>
  );
}
