// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// ES2021/2022 polyfills for the Lynx JS runtime (iOS JSC via PrimJS): the
// vendored Victory code uses Array.prototype.at (9 call sites) — Node has it
// (the 252-case suite runs green there) but the on-device runtime does not
// ("ixNum.at is not a function", caught via Lynx DevTool). This module is
// imported FIRST by the package entry (vendor.mjs prepends the import), so
// every consumer gets the patched builtins before any chart code runs.

const globalObject = globalThis as unknown as Record<string, unknown>;

/** Array.prototype.at — negative-index element access. */
function arrayAt<T>(this: T[], index: number): T | undefined {
  const len = this.length;
  const i = index < 0 ? len + index : index;
  return i >= 0 && i < len ? this[i] : undefined;
}

/** String.prototype.at — same semantics over UTF-16 code units. */
function stringAt(this: string, index: number): string | undefined {
  const len = this.length;
  const i = index < 0 ? len + index : index;
  return i >= 0 && i < len ? this[i] : undefined;
}

function install(name: string, target: object, key: string, value: unknown): void {
  const current = (target as Record<string, unknown>)[key];
  if (current === undefined) {
    Object.defineProperty(target, key, { value, writable: true, configurable: true });
  } else {
    console.log(`[victory-native/polyfills] ${name} already present, keeping runtime's own`);
  }
}

install("Array.prototype.at", Array.prototype, "at", arrayAt);
install("String.prototype.at", String.prototype, "at", stringAt);
install("Object.hasOwn", Object, "hasOwn", function hasOwn(obj: object, key: PropertyKey): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
});
install("Array.prototype.findLast", Array.prototype, "findLast", function findLast<
  T,
>(this: T[], predicate: (v: T, i: number, a: T[]) => boolean): T | undefined {
  for (let i = this.length - 1; i >= 0; i--) {
    if (predicate(this[i]!, i, this)) return this[i];
  }
  return undefined;
});
install("Array.prototype.findLastIndex", Array.prototype, "findLastIndex", function findLastIndex<
  T,
>(this: T[], predicate: (v: T, i: number, a: T[]) => boolean): number {
  for (let i = this.length - 1; i >= 0; i--) {
    if (predicate(this[i]!, i, this)) return i;
  }
  return -1;
});

// Marker for tests: the module installed (or verified) the patched builtins.
globalObject.__VICTORY_POLYFILLS__ = true;
