// Declarative skity elements (rendered natively via the scumble-canvas behavior
// + virtual shape elements registered in ScumbleBehavior.kt).
export * from "./elements";

// NAPI addon facade — removed in Phase 5 once the skity render path is live.
export { ScumbleModule } from "../generated/ScumbleModule";
