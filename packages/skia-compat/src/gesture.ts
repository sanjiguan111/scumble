// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * The gesture lane — RNGH (react-native-gesture-handler) semantics over Lynx
 * touch events, scoped to what Victory Native's library code configures:
 * Pan with activeOffset/failOffset windows + activateAfterLongPress, Pinch,
 * Race/Simultaneous composition. The recognizers are PURE state machines
 * ({@link PanRecognizer}/{@link PinchRecognizer}) driven by
 * {@link GestureDetector} — the tests exercise them without a device.
 *
 * Semantics notes (RNGH alignment):
 * - Offset props take a number V (window [−V, V]) or a [min, max] pair; an
 *   axis ACTIVATES when its translation leaves the active window and FAILS
 *   when it leaves the fail window (checked before activation — fail wins).
 * - `activateAfterLongPress(ms)` arms a timer at touch begin; movement past
 *   the long-press slop (10px) fails the gesture, the timer elapsing while
 *   still possible ACTIVATES it.
 * - Without active offsets, long press, or minDistance, pan activates on 10px
 *   of travel (RNGH's default min distance).
 * - State enum values match RNGH's State (UNDETERMINED 0 … END 5).
 * - One deliberate divergence: `absoluteX/absoluteY` are ELEMENT-LOCAL px
 *   (Lynx touch `x/y`), not page coordinates — a scrub consumer wants
 *   element-local anyway; document at the call site.
 */

/** RNGH State values (the subset the pan/pinch lane moves through). */
export enum GestureState {
  UNDETERMINED = 0,
  BEGAN = 1,
  ACTIVE = 2,
  CANCELLED = 3,
  FAILED = 4,
  END = 5,
}

/** One pointer as the detector feeds it: element-local px + identity. */
export interface GesturePointer {
  identifier: number;
  x: number;
  y: number;
}

/** The event shape handed to Pan callbacks (RNGH field names). */
export interface PanGestureEvent {
  translationX: number;
  translationY: number;
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
  state: GestureState;
  numberOfPointers: number;
}

export interface PinchGestureEvent {
  scale: number;
  focalX: number;
  focalY: number;
  state: GestureState;
  numberOfPointers: number;
}

export interface PinchCallbacks {
  onBegin?: (e: PinchGestureEvent) => void;
  onUpdate?: (e: PinchGestureEvent) => void;
  onEnd?: (e: PinchGestureEvent) => void;
  onFinalize?: (e: PinchGestureEvent) => void;
}

/** A number V (window [−V, V]) or an explicit [min, max] window. */
export type OffsetWindow = number | readonly [number, number];

/** True when `v` lies OUTSIDE the window (the activation/failure edge). */
export function outsideWindow(v: number, w: OffsetWindow | undefined): boolean {
  if (w === undefined) return false;
  const [lo, hi] = typeof w === "number" ? [-w, w] : [w[0], w[1]];
  return v < lo || v > hi;
}

const DEFAULT_MIN_DIST = 10;
const LONG_PRESS_SLOP = 10;

interface PanCallbacks {
  onBegin?: (e: PanGestureEvent) => void;
  onStart?: (e: PanGestureEvent) => void;
  onUpdate?: (e: PanGestureEvent) => void;
  onEnd?: (e: PanGestureEvent) => void;
  onFinalize?: (e: PanGestureEvent) => void;
  onTouchesMove?: (e: PanGestureEvent) => void;
}

export interface PanConfig {
  activeOffsetX?: OffsetWindow;
  activeOffsetY?: OffsetWindow;
  failOffsetX?: OffsetWindow;
  failOffsetY?: OffsetWindow;
  activateAfterLongPress?: number;
  minDistance?: number;
  minPointers?: number;
  enabled?: boolean;
}

/** The pure pan state machine. All coordinates element-local px. */
export class PanRecognizer {
  private state = GestureState.UNDETERMINED;
  private bx = 0;
  private by = 0;
  private lx = 0;
  private ly = 0;
  private pointers = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: PanConfig,
    private readonly callbacks: PanCallbacks = {},
  ) {}

  getState(): GestureState {
    return this.state;
  }

  touchBegin(pointers: GesturePointer[], now: () => number = Date.now): void {
    if (this.config.enabled === false) return;
    this.pointers = pointers.length;
    const first = pointers[0];
    this.bx = this.lx = first?.x ?? 0;
    this.by = this.ly = first?.y ?? 0;
    this.state = GestureState.BEGAN;
    this.emit("onBegin");
    if (this.config.activateAfterLongPress !== undefined) {
      const started = now();
      this.timer = setTimeout(
        () => {
          // Elapsed while still possible and within the slop → activate.
          if (this.state === GestureState.BEGAN) this.activate();
          this.timer = null;
        },
        Math.max(0, this.config.activateAfterLongPress - (now() - started)),
      );
    }
  }

  touchMove(pointers: GesturePointer[]): void {
    if (this.config.enabled === false) return;
    this.pointers = pointers.length;
    const first = pointers[0];
    if (!first) return;
    this.lx = first.x;
    this.ly = first.y;
    const dx = this.lx - this.bx;
    const dy = this.ly - this.by;
    this.emit("onTouchesMove");

    if (this.state === GestureState.BEGAN) {
      if (
        this.config.activateAfterLongPress !== undefined &&
        Math.hypot(dx, dy) > LONG_PRESS_SLOP
      ) {
        this.fail();
        return;
      }
      // Fail windows first — RNGH lets failure beat activation.
      if (
        outsideWindow(dy, this.config.failOffsetY) ||
        outsideWindow(dx, this.config.failOffsetX)
      ) {
        this.fail();
        return;
      }
      const hasActiveAxis =
        this.config.activeOffsetX !== undefined || this.config.activeOffsetY !== undefined;
      const activeHit =
        (hasActiveAxis &&
          (outsideWindow(dx, this.config.activeOffsetX) ||
            outsideWindow(dy, this.config.activeOffsetY))) ||
        (!hasActiveAxis &&
          this.config.activateAfterLongPress === undefined &&
          Math.hypot(dx, dy) >= (this.config.minDistance ?? DEFAULT_MIN_DIST));
      if (activeHit && this.pointers >= (this.config.minPointers ?? 1)) {
        this.activate();
        return;
      }
    } else if (this.state === GestureState.ACTIVE) {
      this.emit("onUpdate");
    }
  }

  touchEnd(): void {
    this.clearTimer();
    if (this.state === GestureState.ACTIVE) {
      this.state = GestureState.END;
      this.emit("onEnd");
      this.emit("onFinalize");
    } else if (this.state === GestureState.BEGAN) {
      this.state = GestureState.FAILED;
      this.emit("onFinalize");
    }
    this.state = GestureState.UNDETERMINED;
    this.pointers = 0;
  }

  cancel(): void {
    this.clearTimer();
    if (this.state === GestureState.BEGAN || this.state === GestureState.ACTIVE) {
      this.state = GestureState.CANCELLED;
      this.emit("onFinalize");
    }
    this.state = GestureState.UNDETERMINED;
    this.pointers = 0;
  }

  /** Called by the arbiter when another recognizer wins a race. */
  cancelByArbiter(): void {
    this.cancel();
  }

  private activate(): void {
    this.clearTimer();
    this.state = GestureState.ACTIVE;
    this.emit("onStart");
    this.emit("onUpdate");
  }

  private fail(): void {
    this.clearTimer();
    this.state = GestureState.FAILED;
    this.emit("onFinalize");
    this.state = GestureState.UNDETERMINED;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private emit(key: keyof PanCallbacks): void {
    const cb = this.callbacks[key];
    if (!cb) return;
    (cb as (e: PanGestureEvent) => void)({
      translationX: this.lx - this.bx,
      translationY: this.ly - this.by,
      x: this.lx,
      y: this.ly,
      absoluteX: this.lx,
      absoluteY: this.ly,
      state: this.state,
      numberOfPointers: this.pointers,
    });
  }
}

/** The pure pinch machine: two-pointer scale + focal over the pointer set. */
export class PinchRecognizer {
  private state = GestureState.UNDETERMINED;
  private baseDist = 0;
  private baseFocal = { x: 0, y: 0 };
  private scale = 1;
  private focal = { x: 0, y: 0 };

  constructor(private readonly callbacks: PinchCallbacks = {}) {}

  getState(): GestureState {
    return this.state;
  }

  update(pointers: GesturePointer[]): void {
    if (pointers.length < 2) {
      if (this.state === GestureState.ACTIVE) {
        this.state = GestureState.END;
        this.emit("onEnd");
        this.emit("onFinalize");
      } else if (this.state === GestureState.BEGAN) {
        this.state = GestureState.FAILED;
        this.emit("onFinalize");
      }
      this.state = GestureState.UNDETERMINED;
      return;
    }
    const [a, b] = pointers;
    const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    const focal = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
    if (this.state === GestureState.UNDETERMINED || this.state === GestureState.BEGAN) {
      this.baseDist = dist;
      this.baseFocal = focal;
      this.scale = 1;
      this.focal = focal;
      this.state = GestureState.ACTIVE;
      this.emit("onBegin");
      this.emit("onUpdate");
      return;
    }
    this.scale = this.baseDist > 0 ? dist / this.baseDist : 1;
    this.focal = focal;
    this.emit("onUpdate");
  }

  cancel(): void {
    if (this.state === GestureState.ACTIVE || this.state === GestureState.BEGAN) {
      this.state = GestureState.CANCELLED;
      this.emit("onFinalize");
    }
    this.state = GestureState.UNDETERMINED;
  }

  private emit(key: "onBegin" | "onUpdate" | "onEnd" | "onFinalize"): void {
    const cb = this.callbacks[key];
    if (!cb) return;
    cb({
      scale: this.scale,
      focalX: this.focal.x,
      focalY: this.focal.y,
      state: this.state,
      numberOfPointers: 2,
    });
  }
}

// ---- The RNGH-shaped facade: builders that capture config + callbacks. ----

type AnyBuilder = PanGestureBuilder | PinchGestureBuilder | GestureComposition;

export interface PanGestureBuilder {
  readonly kind: "pan";
  config: PanConfig;
  callbacks: PanCallbacks;
  activateAfterLongPress(ms: number): this;
  activeOffsetX(w: OffsetWindow): this;
  activeOffsetY(w: OffsetWindow): this;
  failOffsetX(w: OffsetWindow): this;
  failOffsetY(w: OffsetWindow): this;
  minDistance(px: number): this;
  minPointers(n: number): this;
  enabled(v: boolean): this;
  onBegin(cb: PanCallbacks["onBegin"]): this;
  onStart(cb: PanCallbacks["onStart"]): this;
  onUpdate(cb: PanCallbacks["onUpdate"]): this;
  onEnd(cb: PanCallbacks["onEnd"]): this;
  onFinalize(cb: PanCallbacks["onFinalize"]): this;
  onTouchesMove(cb: PanCallbacks["onTouchesMove"]): this;
}

export interface PinchGestureBuilder {
  readonly kind: "pinch";
  callbacks: PinchCallbacks;
  onBegin(cb: PinchCallbacks["onBegin"]): this;
  onUpdate(cb: PinchCallbacks["onUpdate"]): this;
  onEnd(cb: PinchCallbacks["onEnd"]): this;
  onFinalize(cb: PinchCallbacks["onFinalize"]): this;
}

export interface GestureComposition {
  readonly kind: "race" | "simultaneous";
  gestures: AnyBuilder[];
}

export const Gesture = {
  Pan(): PanGestureBuilder {
    const b: PanGestureBuilder = {
      kind: "pan",
      config: {},
      callbacks: {},
      activateAfterLongPress(ms) {
        this.config.activateAfterLongPress = ms;
        return this;
      },
      activeOffsetX(w) {
        this.config.activeOffsetX = w;
        return this;
      },
      activeOffsetY(w) {
        this.config.activeOffsetY = w;
        return this;
      },
      failOffsetX(w) {
        this.config.failOffsetX = w;
        return this;
      },
      failOffsetY(w) {
        this.config.failOffsetY = w;
        return this;
      },
      minDistance(px) {
        this.config.minDistance = px;
        return this;
      },
      minPointers(n) {
        this.config.minPointers = n;
        return this;
      },
      enabled(v) {
        this.config.enabled = v;
        return this;
      },
      onBegin(cb) {
        this.callbacks.onBegin = cb;
        return this;
      },
      onStart(cb) {
        this.callbacks.onStart = cb;
        return this;
      },
      onUpdate(cb) {
        this.callbacks.onUpdate = cb;
        return this;
      },
      onEnd(cb) {
        this.callbacks.onEnd = cb;
        return this;
      },
      onFinalize(cb) {
        this.callbacks.onFinalize = cb;
        return this;
      },
      onTouchesMove(cb) {
        this.callbacks.onTouchesMove = cb;
        return this;
      },
    };
    return b;
  },
  Pinch(): PinchGestureBuilder {
    const b: PinchGestureBuilder = {
      kind: "pinch",
      callbacks: {},
      onBegin(cb) {
        this.callbacks.onBegin = cb;
        return this;
      },
      onUpdate(cb) {
        this.callbacks.onUpdate = cb;
        return this;
      },
      onEnd(cb) {
        this.callbacks.onEnd = cb;
        return this;
      },
      onFinalize(cb) {
        this.callbacks.onFinalize = cb;
        return this;
      },
    } as PinchGestureBuilder;
    return b;
  },
  Race(...gestures: AnyBuilder[]): GestureComposition {
    return { kind: "race", gestures };
  },
  Simultaneous(...gestures: AnyBuilder[]): GestureComposition {
    return { kind: "simultaneous", gestures };
  },
};
