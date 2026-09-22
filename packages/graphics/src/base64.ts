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

/**
 * Base64-encode raw little-endian float32s for a native string prop — the
 * transport for the stroke dash intervals (`SetPaint.stroke_dash:[float]`).
 * Not a FlatBuffer: the native side reads the bytes directly as a float array
 * (`ByteBuffer.asFloatBuffer` / `memcpy`), matching flatbuffers' byte order.
 *
 * @param values The float values (e.g. dash intervals `[on, off, ...]`).
 * @returns The base64 string for the `strokeDash` prop; `""` for empty input
 *   (an empty payload clears the pattern natively — solid stroke).
 *
 * @example
 * floatsToBase64([8, 4]);  // dash 8px on, 4px off
 */
export function floatsToBase64(values: number[]): string {
  if (values.length === 0) return "";
  const buf = new ArrayBuffer(values.length * 4);
  const view = new DataView(buf);
  for (let i = 0; i < values.length; i++) view.setFloat32(i * 4, values[i], true);
  return bytesToBase64(buf);
}

// Reverse lookup for {@link base64ToBytes}: B64_CHARS index → 6-bit value.
const B64_VALUES = new Int8Array(256).fill(-1);
for (let i = 0; i < B64_CHARS.length; i++) {
  B64_VALUES[B64_CHARS.charCodeAt(i)] = i;
}

/**
 * Base64-decode a string back to bytes — the JS-side counterpart of the native
 * decode. Used by {@link createFontMetrics} to unpack the `data:` URI a span
 * `fontFamily` carries (the one font form whose bytes JS can reach
 * synchronously), so measurement and rendering consume the identical binary.
 * Hand-written (no `atob`) so it runs in Lynx's JSC runtime, like the encoder.
 *
 * ASCII whitespace is skipped (the padding a long data: URI may pick up);
 * anything else outside the alphabet throws — a wrong-length or corrupted
 * payload must fail loudly, not silently mis-decode a font.
 *
 * @param s The base64 payload (padding optional; interior `=` is invalid).
 * @returns The decoded bytes.
 *
 * @example
 * base64ToBytes(bytesToBase64(buf));  // round-trips to the original bytes
 */
export function base64ToBytes(s: string): Uint8Array {
  // Count decodable chars first so the output buffer is allocated once.
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const isPad = c === 61; // '='
    const isSpace = c === 32 || c === 9 || c === 10 || c === 13; // space, tab, LF, CR
    if (isPad || isSpace) continue;
    if (B64_VALUES[c] < 0) {
      throw new Error(`base64: invalid character ${JSON.stringify(s[i])} at ${i}`);
    }
    n++;
  }
  // 4 chars → 3 bytes; a trailing 2- or 3-char group carries 1 or 2 bytes.
  const bytes = new Uint8Array(Math.floor(n / 4) * 3 + (n % 4 === 2 ? 1 : n % 4 === 3 ? 2 : 0));
  if (n % 4 === 1) {
    throw new Error("base64: invalid length (a 1-char trailing group carries no bytes)");
  }

  let out = 0;
  let acc = 0; // up to four 6-bit groups pending a byte-triple flush
  let bits = 0;
  for (let i = 0; i < s.length; i++) {
    const v = B64_VALUES[s.charCodeAt(i)];
    if (v < 0) continue; // padding or whitespace — already validated above
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes[out++] = (acc >> bits) & 0xff;
    }
  }
  return bytes;
}
