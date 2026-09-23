// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Type bridge for the UPSTREAM import specifier: the bundler redirects
// "victory-native" to @scumble/victory-native (lynx.config resolve.alias);
// this ambient declaration gives tsc the same view. (A tsconfig paths entry
// pointing at the wrapper's d.ts got picked up by rspack as a MODULE target
// — "module has no exports" — so keep it ambient-only.)
declare module "victory-native" {
  export * from "@scumble/victory-native";
}
