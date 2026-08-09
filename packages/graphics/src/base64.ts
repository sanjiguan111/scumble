// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * Base64-encode FlatBuffer bytes for transport through Lynx's string prop
 * channel. Lynx props marshal NSNumber / NSString / NSArray but not NSData or
 * byte[], so the JS-built nested FlatBuffer bytes (PathCommandList /
 * TransformOpList) are base64-encoded here and decoded back to bytes on the
 * native side (`-[NSData initWithBase64EncodedString:]` / `Base64.decode`).
 *
 * The native decode is a mechanical encoding conversion — no string→structure
 * parsing — so the "native never parses" principle (RENDER_ARCHITECTURE.md §1)
 * is preserved. Hand-written (no btoa) so it runs in Lynx's JSC runtime.
 */
const B64_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/**
 * Base64-encode `bytes` for a native string prop. See the module note above
 * for why this round-trip exists (Lynx won't marshal raw bytes through props).
 *
 * @param bytes Raw nested-FlatBuffer bytes (from `parsePath` / `parseTransform`
 *   / `Path2D#toBytes`).
 * @returns The base64 string for the `d` / `transform` prop.
 *
 * @example
 * bytesToBase64(parsePath("M0 0 L10 10 Z")!);  // "AAAB..." — the string for `d`
 */
export function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes);
  let out = "";
  for (let i = 0; i < arr.length; i += 3) {
    const b0 = arr[i];
    const b1 = i + 1 < arr.length ? arr[i + 1] : 0;
    const b2 = i + 2 < arr.length ? arr[i + 2] : 0;
    out += B64_CHARS[b0 >> 2];
    out += B64_CHARS[((b0 & 0x03) << 4) | (b1 >> 4)];
    out += i + 1 < arr.length ? B64_CHARS[((b1 & 0x0f) << 2) | (b2 >> 6)] : "=";
    out += i + 2 < arr.length ? B64_CHARS[b2 & 0x3f] : "=";
  }
  return out;
}
