// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License, Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Color parsing derived from react-native-skity (Apache-2.0):
// https://github.com/.../react-native-skity/src/renderer/binding/color.ts
//
// Full CSS Color 4 support: named colors, hex (#rgb / #rrggbb / #rgba /
// #rrggbbaa), rgb()/rgba() (legacy + modern syntax, with percentages),
// hsl()/hsla() (hue in deg/rad/turn/grad), and hwb().

/**
 * Accepted color input. Any of:
 * - a CSS color **string** — named colors (`"rebeccapurple"`), hex
 *   (`"#fff"`, `"#rrggbbaa"`), and the `rgb()`/`rgba()`/`hsl()`/`hsla()`/`hwb()`
 *   functions, including modern space-separated + `/`-alpha syntax (full
 *   CSS Color 4);
 * - a packed **`0xAARRGGBB` number** — passed through unchanged;
 * - an **`[r, g, b, a?]`** tuple (RGB channels 0–255, alpha 0–1, default 1);
 * - an **`{ r, g, b, a? }`** object (same channel ranges as the tuple).
 *
 * Used by the `color` / `fill` / `stroke` props on the skity components.
 */
export type Color =
  | string
  | number
  | { r: number; g: number; b: number; a?: number }
  | [number, number, number, number?];

// css named colors map
// https://drafts.csswg.org/css-color-4/#typedef-named-color
const NamedColors: { [key: string]: number } = {
  aliceblue: 0xfff0f8ff,
  antiquewhite: 0xfffaebd7,
  aqua: 0xff00ffff,
  aquamarine: 0xff7fffd4,
  azure: 0xfff0ffff,
  beige: 0xfff5f5dc,
  bisque: 0xffffe4c4,
  black: 0xff000000,
  blanchedalmond: 0xffffebcd,
  blue: 0xff0000ff,
  blueviolet: 0xff8a2be2,
  brown: 0xffa52a2a,
  burlywood: 0xffdeb887,
  cadetblue: 0xff5f9ea0,
  chartreuse: 0xff7fff00,
  chocolate: 0xffd2691e,
  coral: 0xffff7f50,
  cornflowerblue: 0xff6495ed,
  cornsilk: 0xfffff8dc,
  crimson: 0xffdc143c,
  cyan: 0xff00ffff,
  darkblue: 0xff00008b,
  darkcyan: 0xff008b8b,
  darkgoldenrod: 0xffb8860b,
  darkgray: 0xffa9a9a9,
  darkgreen: 0xff006400,
  darkkhaki: 0xffbdb76b,
  darkmagenta: 0xff8b008b,
  darkolivegreen: 0xff556b2f,
  darkorange: 0xffff4500,
  darkorchid: 0xff9932cc,
  darkred: 0xff8b0000,
  darksalmon: 0xffe9967a,
  darkseagreen: 0xff8fbc8f,
  darkslateblue: 0xff483d8b,
  darkslategray: 0xff2f4f4f,
  darkturquoise: 0xff00ced1,
  darkviolet: 0xff9400d3,
  deeppink: 0xffff1493,
  deepskyblue: 0xff00bfff,
  dimgray: 0xff696969,
  dimgrey: 0xff696969,
  dodgerblue: 0xff1e90ff,
  firebrick: 0xffb22222,
  floralwhite: 0xfffffaf0,
  forestgreen: 0xff228b22,
  fuchsia: 0xffff00ff,
  gainsboro: 0xffdcdcdc,
  ghostwhite: 0xfff8f8ff,
  gold: 0xffffd700,
  goldenrod: 0xffdaa520,
  gray: 0xff808080,
  grey: 0xff808080,
  green: 0xff008000,
  greenyellow: 0xffadff2f,
  honeydew: 0xfff0fff0,
  hotpink: 0xffff69b4,
  indianred: 0xffcd5c5c,
  indigo: 0xff4b0082,
  ivory: 0xfffffff0,
  khaki: 0xfff0e68c,
  lavender: 0xffe6e6fa,
  lavenderblush: 0xfffff0f5,
  lawngreen: 0xff7cfc00,
  lemonchiffon: 0xfffffacd,
  lightblue: 0xffadd8e6,
  lightcoral: 0xfff08080,
  lightcyan: 0xffe0ffff,
  lightgoldenrodyellow: 0xfffafad2,
  lightgray: 0xffd3d3d3,
  lightgrey: 0xffd3d3d3,
  lightgreen: 0xff90ee90,
  lightpink: 0xffffb6c1,
  lightsalmon: 0xffffa07a,
  lightseagreen: 0xff20b2aa,
  lightskyblue: 0xff87cefa,
  lightslategray: 0xff778899,
  lightslategrey: 0xff778899,
  lightsteelblue: 0xffb0c4de,
  lightyellow: 0xffffffe0,
  lime: 0xff00ff00,
  limegreen: 0xff32cd32,
  linen: 0xfffaf0e6,
  magenta: 0xffff00ff,
  maroon: 0xff800000,
  mediumaquamarine: 0xff66cdaa,
  mediumblue: 0xff0000cd,
  mediumorchid: 0xffba55d3,
  mediumpurple: 0xff9370db,
  mediumseagreen: 0xff3cb371,
  mediumslateblue: 0xff7b68ee,
  mediumspringgreen: 0xff00fa9a,
  mediumturquoise: 0xff48d1cc,
  mediumvioletred: 0xffc71585,
  midnightblue: 0xff191970,
  mintcream: 0xfff5fffa,
  mistyrose: 0xffffe4e1,
  moccasin: 0xffffe4b5,
  navajowhite: 0xffffdead,
  navy: 0xff000080,
  oldlace: 0xfffdf5e6,
  olive: 0xff808000,
  olivedrab: 0xff6b8e23,
  orange: 0xffffa500,
  orangered: 0xffff4500,
  orchid: 0xffda70d6,
  palegoldenrod: 0xffeee8aa,
  palegreen: 0xff98fb98,
  paleturquoise: 0xffafeeee,
  palevioletred: 0xffdb7093,
  papayawhip: 0xffffefd5,
  peachpuff: 0xffffdab9,
  peru: 0xffcd853f,
  pink: 0xffffc0cb,
  plum: 0xffdda0dd,
  powderblue: 0xffb0e0e6,
  purple: 0xff800080,
  rebeccapurple: 0xff663399,
  red: 0xffff0000,
  rosybrown: 0xffbc8f8f,
  royalblue: 0xff4169e1,
  saddlebrown: 0xff8b4513,
  salmon: 0xfffa8072,
  sandybrown: 0xfff4a460,
  seagreen: 0xff2e8b57,
  seashell: 0xfffff5ee,
  sienna: 0xffa0522d,
  silver: 0xffc0c0c0,
  skyblue: 0xff87ceeb,
  slateblue: 0xff6a5acd,
  slategray: 0xff708090,
  snow: 0xfffffafa,
  springgreen: 0xff00ff7f,
  steelblue: 0xff4682b4,
  tan: 0xffd2b48c,
  teal: 0xff008080,
  thistle: 0xffd8bfd8,
  tomato: 0xffff6347,
  transparent: 0x00000000,
  turquoise: 0xff40e0d0,
  violet: 0xff9400d3,
  wheat: 0xfff5deb3,
  white: 0xffffffff,
  whitesmoke: 0xfff5f5f5,
  yellow: 0xffffff00,
  yellowgreen: 0xff9acd32,
};

function parseHexColorString(colorStr: string): number {
  let hex = colorStr.slice(1);

  // Expand shorthand: #RGB -> #RRGGBB, #RGBA -> #RRGGBBAA (CSS order).
  if (hex.length === 3 || hex.length === 4) {
    hex = hex
      .split("")
      .map((c) => c + c)
      .join("");
  }

  if (hex.length !== 6 && hex.length !== 8) {
    throw new Error(`Invalid hex color format: ${colorStr}`);
  }

  // hex is now CSS order #RRGGBB or #RRGGBBAA. parseInt(.., 16) already
  // yields 0–255 integers, so do NOT scale them.
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) : 0xff;

  // Pack as AARRGGBB (the internal color layout used across the library).
  return (((a & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>> 0;
}

type TokenType =
  | "number"
  | "percent"
  | "deg" // Degrees. There are 360 degrees in a full circle.
  | "rad" // Radians. There are 2π radians in a full circle.
  | "grad" // Gradians. There are 400 gradians in a full circle.
  | "turn" // Turns. There are 1 turn in a full circle.
  | "slash"
  | "comma"
  | "paren-left"
  | "paren-right"
  | "identifier"
  | "eof";

interface Token {
  type: TokenType;
  value?: number | string;
}

class StringScanner {
  content: string;
  private startIndex: number;

  tokenList: Token[] = [];

  tokenIndex: number = 0;

  constructor(content: string) {
    this.content = content;
    this.startIndex = 0;

    this.parseTokenList();
  }

  private parseTokenList() {
    while (this.startIndex < this.content.length) {
      this.skipWhitespace();

      const token = this.parseToken();

      if (token.type === "eof") {
        break;
      }

      this.tokenList.push(token);
    }
  }

  private skipWhitespace() {
    while (
      this.startIndex < this.content.length &&
      /\s/.test(this.content.charAt(this.startIndex))
    ) {
      this.startIndex++;
    }
  }

  private parseToken(): Token {
    if (this.startIndex >= this.content.length) {
      return { type: "eof", value: undefined };
    }

    const ch = this.content.charAt(this.startIndex);
    if (ch === "(") {
      this.startIndex++;
      return { type: "paren-left", value: undefined };
    } else if (ch === ")") {
      this.startIndex++;
      return { type: "paren-right", value: undefined };
    } else if (ch === ",") {
      this.startIndex++;
      return { type: "comma", value: undefined };
    } else if (ch === "/") {
      this.startIndex++;
      return { type: "slash", value: undefined };
    } else if (ch === "%") {
      this.startIndex++;
      return { type: "percent", value: undefined };
    } else {
      if (/[a-zA-Z]/.test(ch)) {
        return this.parseIdentifierToken();
      } else if (
        /[0-9]/.test(ch) ||
        (ch === "." && /[0-9]/.test(this.content.charAt(this.startIndex + 1)))
      ) {
        return this.parseNumberToken();
      } else {
        throw new Error(`Unexpected content at index ${this.startIndex}: ${this.content}`);
      }
    }
  }

  private parseIdentifierToken(): Token {
    const startIndex = this.startIndex;

    while (this.startIndex < this.content.length) {
      if (!/[a-zA-Z0-9_]/.test(this.content.charAt(this.startIndex))) {
        break;
      }

      this.startIndex++;
    }

    const identifier = this.content.slice(startIndex, this.startIndex);

    return { type: "identifier", value: identifier };
  }

  private parseNumberToken(): Token {
    let negative = false;
    // check if it's a negative number
    if (this.content.charAt(this.startIndex) === "-") {
      negative = true;
      this.startIndex++;
    }

    let startWithDot = false;
    // check if it's a decimal number
    if (this.content.charAt(this.startIndex) === ".") {
      startWithDot = true;
      this.startIndex++;
    }

    const startIndex = this.startIndex;

    let containsDot = false;

    while (this.startIndex < this.content.length) {
      const ch = this.content.charAt(this.startIndex);
      if (ch === ".") {
        if (startWithDot || containsDot) {
          throw new Error(
            `Invalid number format: ${this.content.slice(startIndex, this.startIndex + 1)}`,
          );
        }
        containsDot = true;
        this.startIndex++;
        continue;
      }

      if (!/[0-9]/.test(ch)) {
        break;
      }

      this.startIndex++;
    }
    const numberStr = this.content.slice(startIndex, this.startIndex);

    let number = parseFloat(numberStr);

    if (negative) {
      number = -number;
    }

    if (startWithDot) {
      number /= Math.pow(10, numberStr.length);
    }

    if (this.content.charAt(this.startIndex) === "%") {
      // percentage
      this.startIndex++;
      return { type: "percent", value: number };
    } else if (!/\s/.test(this.content.charAt(this.startIndex))) {
      // if no space after number, check if this is a valid <angle> value
      if (this.content.slice(this.startIndex, this.startIndex + 3) === "deg") {
        this.startIndex += 3;
        return { type: "deg", value: number };
      } else if (this.content.slice(this.startIndex, this.startIndex + 3) === "rad") {
        this.startIndex += 3;
        return { type: "rad", value: number };
      } else if (this.content.slice(this.startIndex, this.startIndex + 4) === "turn") {
        this.startIndex += 4;
        return { type: "turn", value: number };
      } else if (this.content.slice(this.startIndex, this.startIndex + 4) === "grad") {
        this.startIndex += 4;
        return { type: "grad", value: number };
      } else {
        // not <angle> return normal number token
        return { type: "number", value: number };
      }
    } else {
      return { type: "number", value: number };
    }
  }

  currentToken(): Token {
    if (this.tokenIndex >= this.tokenList.length) {
      return { type: "eof", value: undefined };
    }

    return this.tokenList[this.tokenIndex] || { type: "eof", value: undefined };
  }

  consumeToken(type: TokenType, value?: string): boolean {
    const token = this.currentToken();

    if (token.type !== type) {
      return false;
    }

    if (value !== undefined && token.value !== value) {
      return false;
    }

    this.tokenIndex++;
    return true;
  }
}

function parseRGBColor(colorStr: string): number {
  /**
   * legacy rgb() : rgb ( <percent> , <percent> , <percent> (, <number> | <percent>)? ) | rgb ( <number> , <number> , <number> (, <number> | <percent>)? )
   * modern rgb() : rgb ( <number> | <percent>  <number> | <percent>  <number> | <percent> (/ <number> | <percent>)? )
   */
  const scanner = new StringScanner(colorStr);

  // consume 'rgb || rgba
  if (!scanner.consumeToken("identifier", "rgb") && !scanner.consumeToken("identifier", "rgba")) {
    throw new Error(`Invalid rgb color format: ${colorStr}`);
  }

  // consume '('
  if (!scanner.consumeToken("paren-left")) {
    throw new Error(`Invalid rgb color format: ${colorStr}`);
  }

  let r = 0;
  let g = 0;
  let b = 0;
  let a = 1;

  let modernSyntax = false;
  let usePercentage = false;

  // parse red component
  if (scanner.currentToken().type === "number") {
    r = scanner.currentToken().value as number;
    scanner.consumeToken("number");
    usePercentage = false;
  } else if (scanner.currentToken().type === "percent") {
    r = (scanner.currentToken().value as number) / 100;
    scanner.consumeToken("percent");

    r = Math.round(r * 255);

    usePercentage = true;
  }

  if (scanner.currentToken().type !== "comma") {
    modernSyntax = true;
  }

  if (!modernSyntax && !scanner.consumeToken("comma")) {
    throw new Error(`Invalid rgb color format: ${colorStr}`);
  }

  // parse green component
  if (scanner.currentToken().type === "number") {
    if (!modernSyntax && usePercentage) {
      throw new Error(
        `Invalid rgb color format: ${colorStr}, legacy syntax needs to use same format for all rgb components`,
      );
    }

    g = scanner.currentToken().value as number;
    scanner.consumeToken("number");
  } else if (scanner.currentToken().type === "percent") {
    if (!modernSyntax && !usePercentage) {
      throw new Error(
        `Invalid rgb color format: ${colorStr}, legacy syntax needs to use same format for all rgb components`,
      );
    }

    g = (scanner.currentToken().value as number) / 100;
    scanner.consumeToken("percent");

    g = Math.round(g * 255);
  }

  if (!modernSyntax && !scanner.consumeToken("comma")) {
    throw new Error(`Invalid rgb color format: ${colorStr}`);
  }

  // parse blue component
  if (scanner.currentToken().type === "number") {
    if (!modernSyntax && usePercentage) {
      throw new Error(
        `Invalid rgb color format: ${colorStr}, legacy syntax needs to use same format for all rgb components`,
      );
    }

    b = scanner.currentToken().value as number;
    scanner.consumeToken("number");
  } else if (scanner.currentToken().type === "percent") {
    if (!modernSyntax && !usePercentage) {
      throw new Error(
        `Invalid rgb color format: ${colorStr}, legacy syntax needs to use same format for all rgb components`,
      );
    }

    b = (scanner.currentToken().value as number) / 100;
    scanner.consumeToken("percent");

    b = Math.round(b * 255);
  }

  if (scanner.currentToken().type !== "paren-right") {
    // contains alpha component

    // legacy syntax rgb(r, g, b, a)
    // modern syntax rgb(r g b / a)
    if (!modernSyntax && !scanner.consumeToken("comma")) {
      throw new Error(`Invalid rgb color format: ${colorStr}`);
    } else if (modernSyntax && !scanner.consumeToken("slash")) {
      throw new Error(`Invalid rgb color format: ${colorStr}`);
    }

    if (scanner.currentToken().type === "number") {
      a = scanner.currentToken().value as number;
      scanner.consumeToken("number");
    } else if (scanner.currentToken().type === "percent") {
      a = (scanner.currentToken().value as number) / 100;
      scanner.consumeToken("percent");
    }
  } else {
    a = 1.0;
  }

  if (!scanner.consumeToken("paren-right")) {
    throw new Error(`Invalid rgb color format: ${colorStr}`);
  }

  // AARRGGBB
  return (
    (((Math.round(a * 255) & 0xff) << 24) | ((r & 0xff) << 16) | ((g & 0xff) << 8) | (b & 0xff)) >>>
    0
  );
}

function hueToRGB(p: number, q: number, t: number): number {
  if (t < 0) {
    t += 1;
  } else if (t > 1) {
    t -= 1;
  }

  if (t < 1 / 6) {
    return p + (q - p) * 6 * t;
  } else if (t < 1 / 2) {
    return q;
  } else if (t < 2 / 3) {
    return p + (q - p) * (2 / 3 - t) * 6;
  }

  return p;
}

/**
 * @param hue hue value in degree, radian, turn, or grad
 * @param saturation saturation value in percent
 * @param lightness lightness value in percent
 * @param alpha alpha value in range [0, 1]
 */
function hslaToARGB(hue: Token, saturation: number, lightness: number, alpha: number): number {
  saturation /= 100;
  lightness /= 100;

  let h: number = 0;

  if (hue.type === "number") {
    h = (hue.value as number) / 360;
  } else if (hue.type === "deg") {
    h = (hue.value as number) / 360;
  } else if (hue.type === "rad") {
    h = (hue.value as number) / (2 * Math.PI);
  } else if (hue.type === "turn") {
    h = hue.value as number;
  } else if (hue.type === "grad") {
    h = (hue.value as number) / 400;
  }

  let r = 0;
  let g = 0;
  let b = 0;

  if (saturation === 0) {
    r = g = b = lightness;
  } else {
    const q =
      lightness < 0.5
        ? lightness * (1 + saturation)
        : lightness + saturation - lightness * saturation;
    const p = 2 * lightness - q;

    r = Math.round(hueToRGB(p, q, h + 1 / 3) * 255);
    g = Math.round(hueToRGB(p, q, h) * 255);
    b = Math.round(hueToRGB(p, q, h - 1 / 3) * 255);
  }

  // AARRGGBB
  return (
    (((Math.round(alpha * 255) & 0xff) << 24) |
      ((r & 0xff) << 16) |
      ((g & 0xff) << 8) |
      (b & 0xff)) >>>
    0
  );
}

function parseHSLColor(colorStr: string): number {
  const scanner = new StringScanner(colorStr);

  if (!scanner.consumeToken("identifier", "hsl") && !scanner.consumeToken("identifier", "hsla")) {
    throw new Error(`Invalid hsl color format: ${colorStr}`);
  }

  if (!scanner.consumeToken("paren-left")) {
    throw new Error(`Invalid hsl color format: ${colorStr}`);
  }

  const hueToken = scanner.currentToken();
  if (
    hueToken.type !== "number" &&
    hueToken.type !== "deg" &&
    hueToken.type !== "rad" &&
    hueToken.type !== "turn" &&
    hueToken.type !== "grad"
  ) {
    throw new Error(`Invalid hsl color format: ${colorStr}`);
  }

  scanner.consumeToken(hueToken.type);

  let legacySyntax = false;

  if (scanner.consumeToken("comma")) {
    legacySyntax = true;
  }

  let s: number = 0.0;
  let l: number = 0.0;
  let a: number = 1.0;

  if (legacySyntax) {
    if (scanner.currentToken().type !== "percent") {
      throw new Error(`Invalid hsl color format: ${colorStr}`);
    }

    s = scanner.currentToken().value as number;
    scanner.consumeToken("percent");

    if (!scanner.consumeToken("comma")) {
      throw new Error(`Invalid hsl color format: ${colorStr}`);
    }

    if (scanner.currentToken().type !== "percent") {
      throw new Error(`Invalid hsl color format: ${colorStr}`);
    }

    l = scanner.currentToken().value as number;
    scanner.consumeToken("percent");
  } else {
    if (scanner.currentToken().type === "number") {
      s = scanner.currentToken().value as number;
      scanner.consumeToken("number");
    } else if (scanner.currentToken().type === "percent") {
      s = scanner.currentToken().value as number;
      scanner.consumeToken("percent");
    } else {
      throw new Error(`Invalid hsl color format: ${colorStr}`);
    }

    if (scanner.currentToken().type === "number") {
      l = scanner.currentToken().value as number;
      scanner.consumeToken("number");
    } else if (scanner.currentToken().type === "percent") {
      l = scanner.currentToken().value as number;
      scanner.consumeToken("percent");
    } else {
      throw new Error(`Invalid hsl color format: ${colorStr}`);
    }
  }

  if (scanner.currentToken().type !== "paren-right") {
    if (legacySyntax) {
      if (!scanner.consumeToken("comma")) {
        throw new Error(`Invalid hsl color format: ${colorStr}`);
      }

      if (scanner.currentToken().type === "number") {
        a = scanner.currentToken().value as number;
        scanner.consumeToken("number");
      } else if (scanner.currentToken().type === "percent") {
        a = (scanner.currentToken().value as number) / 100;
        scanner.consumeToken("percent");
      } else {
        throw new Error(`Invalid hsl color format: ${colorStr}`);
      }
    } else {
      if (!scanner.consumeToken("slash")) {
        throw new Error(`Invalid hsl color format: ${colorStr}`);
      }

      if (scanner.currentToken().type === "number") {
        a = scanner.currentToken().value as number;
        scanner.consumeToken("number");
      } else if (scanner.currentToken().type === "percent") {
        a = (scanner.currentToken().value as number) / 100;
        scanner.consumeToken("percent");
      } else {
        throw new Error(`Invalid hsl color format: ${colorStr}`);
      }
    }
  } else if (!scanner.consumeToken("paren-right")) {
    throw new Error(`Invalid hsl color format: ${colorStr}`);
  }

  return hslaToARGB(hueToken, s, l, a);
}

function hueToRGBComp(hueToken: Token): { r: number; g: number; b: number } {
  let h: number = 0;

  if (hueToken.type === "number") {
    h = hueToken.value as number;
  } else if (hueToken.type === "deg") {
    h = hueToken.value as number;
  } else if (hueToken.type === "rad") {
    h = ((hueToken.value as number) * 360) / (2 * Math.PI);
  } else if (hueToken.type === "turn") {
    h = (hueToken.value as number) * 360;
  } else if (hueToken.type === "grad") {
    h = ((hueToken.value as number) * 360) / 400;
  }

  h = ((h % 360) + 360) % 360;

  const c = 1;
  const x = 1 - Math.abs(((h / 60) % 2) - 1);

  let r = 0,
    g = 0,
    b = 0;

  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  return { r, g, b }; // 0~1
}

function hwbToARGB(hueToken: Token, w: number, b: number, a: number): number {
  if (w + b >= 1) {
    const gray = w / (1 - b);
    return (
      (((Math.round(a * 255) & 0xff) << 24) |
        ((Math.round(gray * 255) & 0xff) << 16) |
        ((Math.round(gray * 255) & 0xff) << 8) |
        (Math.round(gray * 255) & 0xff)) >>>
      0
    );
  }

  const hue = hueToRGBComp(hueToken);

  const red = hue.r * (1 - w - b) + w;
  const green = hue.g * (1 - w - b) + w;
  const blue = hue.b * (1 - w - b) + w;

  return (
    (((Math.round(a * 255) & 0xff) << 24) |
      ((Math.round(red * 255) & 0xff) << 16) |
      ((Math.round(green * 255) & 0xff) << 8) |
      (Math.round(blue * 255) & 0xff)) >>>
    0
  );
}

function parseHWBColor(colorStr: string): number {
  const scanner = new StringScanner(colorStr);

  if (!scanner.consumeToken("identifier", "hwb")) {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  if (!scanner.consumeToken("paren-left")) {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  const hueToken = scanner.currentToken();
  if (
    hueToken.type !== "number" &&
    hueToken.type !== "deg" &&
    hueToken.type !== "rad" &&
    hueToken.type !== "turn" &&
    hueToken.type !== "grad"
  ) {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  scanner.consumeToken(hueToken.type);

  let w: number = 0;
  let b: number = 0;
  let a: number = 1.0;

  if (scanner.currentToken().type === "number") {
    w = scanner.currentToken().value as number;
    scanner.consumeToken("number");
  } else if (scanner.currentToken().type === "percent") {
    w = (scanner.currentToken().value as number) / 100;
    scanner.consumeToken("percent");
  } else {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  if (scanner.currentToken().type === "number") {
    b = scanner.currentToken().value as number;
    scanner.consumeToken("number");
  } else if (scanner.currentToken().type === "percent") {
    b = (scanner.currentToken().value as number) / 100;
    scanner.consumeToken("percent");
  } else {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  if (scanner.currentToken().type !== "paren-right") {
    if (!scanner.consumeToken("slash")) {
      throw new Error(`Invalid hwb color format: ${colorStr}`);
    }

    if (scanner.currentToken().type === "number") {
      a = scanner.currentToken().value as number;
      scanner.consumeToken("number");
    } else if (scanner.currentToken().type === "percent") {
      a = (scanner.currentToken().value as number) / 100;
      scanner.consumeToken("percent");
    } else {
      throw new Error(`Invalid hwb color format: ${colorStr}`);
    }
  } else if (!scanner.consumeToken("paren-right")) {
    throw new Error(`Invalid hwb color format: ${colorStr}`);
  }

  return hwbToARGB(hueToken, w, b, a);
}

function parseColorString(colorStr: string): number {
  if (colorStr.startsWith("#")) {
    return parseHexColorString(colorStr);
  } else if (colorStr.startsWith("rgb")) {
    return parseRGBColor(colorStr);
  } else if (colorStr.startsWith("hsl")) {
    return parseHSLColor(colorStr);
  } else if (colorStr.startsWith("hwb")) {
    return parseHWBColor(colorStr);
  } else {
    const namedColor = NamedColors[colorStr.toLowerCase()];
    if (namedColor !== undefined) {
      return namedColor;
    } else {
      throw new Error(`Unknown color format: ${colorStr}`);
    }
  }
}

/**
 * Resolve any accepted {@link Color} to a packed `0xAARRGGBB` number — the
 * value the native `color` / `fill` / `stroke` props consume directly.
 *
 * String parsing follows [CSS Color 4](https://drafts.csswg.org/css-color-4/):
 * named colors, `#rgb`/`#rgba`/`#rrggbb`/`#rrggbbaa` hex, and the
 * `rgb()`/`rgba()`/`hsl()`/`hsla()`/`hwb()` functions (legacy comma syntax and
 * modern space-separated syntax with `/` alpha; hue accepts deg/rad/turn/grad).
 * Numbers are passed through and tuples/objects are packed without parsing.
 * Throws on strings it cannot recognize.
 *
 * @returns A 32-bit `0xAARRGGBB` integer (alpha in the high byte).
 * @throws  {Error} if a string is not a recognized CSS color format.
 *
 * @example
 * parseColor("red");                  // 0xffff0000
 * parseColor("#ff8c0042");            // 0xff8c0042
 * parseColor("hsl(120 100% 50%)");    // 0xff00ff00
 * parseColor(0xff8c0042);             // 0xff8c0042  (number passthrough)
 * parseColor([255, 140, 0]);          // 0xffff8c00  (alpha defaults to 1)
 */
export function parseColor(color: Color): number {
  if (typeof color === "number") {
    return color;
  } else if (typeof color === "object") {
    if (Array.isArray(color)) {
      const r = color[0] ?? 0;
      const g = color[1] ?? 0;
      const b = color[2] ?? 0;
      const a = color[3] ?? 1;
      return (
        (((Math.round(a * 255) & 0xff) << 24) |
          ((r & 0xff) << 16) |
          ((g & 0xff) << 8) |
          (b & 0xff)) >>>
        0
      );
    } else {
      const r = color.r ?? 0;
      const g = color.g ?? 0;
      const b = color.b ?? 0;
      const a = color.a ?? 1;
      return (
        (((Math.round(a * 255) & 0xff) << 24) |
          ((r & 0xff) << 16) |
          ((g & 0xff) << 8) |
          (b & 0xff)) >>>
        0
      );
    }
  } else if (typeof color === "string") {
    return parseColorString(color);
  }

  throw new Error(`Unsupported color format: ${color}`);
}
