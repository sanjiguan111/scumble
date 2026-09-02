import { describe, it, expect } from "vitest";

import { bytesToBase64, buildSpanList } from "@scumble/graphics";

import {
  collectSpans,
  normalizeParagraphProps,
  resolveSpanText,
  Paragraph,
} from "../shapes/Paragraph";
import { TextSpan } from "../shapes/TextSpan";
import { LinearGradient } from "../shaders/LinearGradient";
import { Paint } from "../Paint";
import { ColorMatrix } from "../filters/filters";

// childElements consumes plain {type, props} objects — no JSX needed.
// `as never` because a hand-built element literal isn't a real ReactNode.
const span = (props: Record<string, unknown>) => ({ type: TextSpan, props }) as never;

describe("collectSpans", () => {
  it("keeps <TextSpan> children in declaration order and skips everything else", () => {
    const spans = collectSpans([
      "ignored string child",
      span({ text: "one" }),
      { type: function NotASpan() {}, props: {} } as never,
      span({ text: "two" }),
    ]);
    expect(spans.map((s) => s.text)).toEqual(["one", "two"]);
  });

  it("returns [] for null/boolean children", () => {
    expect(collectSpans(undefined)).toEqual([]);
    expect(collectSpans(false)).toEqual([]);
  });
});

describe("resolveSpanText", () => {
  it("treats JSX children text as equivalent to the text prop", () => {
    expect(resolveSpanText({ text: "hi" })).toBe("hi");
    expect(resolveSpanText({ children: "hi" })).toBe("hi");
  });

  it("prefers the text prop when both are given", () => {
    expect(resolveSpanText({ text: "prop", children: "children" })).toBe("prop");
  });

  it("trims JSX indentation whitespace from child text", () => {
    expect(resolveSpanText({ children: "\n    padded\n  " })).toBe("padded");
    expect(resolveSpanText({ children: ["Hello ", "skity"] })).toBe("Hello skity");
  });

  it("yields empty text for nested elements / no text at all", () => {
    // Nested elements inside a span are ignored — only plain text is collected.
    expect(resolveSpanText({ children: ["a", { type: TextSpan, props: {} } as never, "b"] })).toBe(
      "ab",
    );
    expect(resolveSpanText({})).toBe("");
  });
});

describe("normalizeParagraphProps", () => {
  it("returns null without a positive width (nothing to lay out)", () => {
    expect(normalizeParagraphProps({} as never)).toBeNull();
    expect(normalizeParagraphProps({ width: 0 } as never)).toBeNull();
    expect(normalizeParagraphProps({ width: -5 } as never)).toBeNull();
  });

  it("merges paragraph-level defaults into each span (span fields win)", () => {
    const n = normalizeParagraphProps(
      { width: 300, fontFamily: "serif", fontSize: 18, fontWeight: 600, color: "#ff0000" } as never,
      [span({ text: "styled" }), span({ text: "own", fontSize: 9, color: "#0000ff" })],
    )!;
    // Assert against the exact expected serialization — the merge is only
    // observable through the bytes the intrinsic element receives.
    expect(n.spans).toBe(
      bytesToBase64(
        buildSpanList([
          // inherits every paragraph default…
          { text: "styled", fontFamily: "serif", fontSize: 18, fontWeight: 600, color: "#ff0000" },
          // …until the span sets its own
          { text: "own", fontFamily: "serif", fontSize: 9, fontWeight: 600, color: "#0000ff" },
        ]),
      ),
    );
  });

  it("merges paragraph-level decoration defaults; span fields win", () => {
    const n = normalizeParagraphProps(
      {
        width: 300,
        decoration: "underline",
        decorationColor: "#ef4444",
        decorationStyle: "wavy",
      } as never,
      [
        span({ text: "inherits" }),
        span({ text: "own", decoration: ["underline", "line-through"], decorationThickness: 3 }),
      ],
    )!;
    expect(n.spans).toBe(
      bytesToBase64(
        buildSpanList([
          // inherits every paragraph decoration default…
          {
            text: "inherits",
            decoration: "underline",
            decorationColor: "#ef4444",
            decorationStyle: "wavy",
          },
          // …until the span sets its own (unset fields still fall through)
          {
            text: "own",
            decoration: ["underline", "line-through"],
            decorationColor: "#ef4444",
            decorationThickness: 3,
            decorationStyle: "wavy",
          },
        ]),
      ),
    );
  });

  it("falls back to one empty span when there is no <TextSpan> child", () => {
    const n = normalizeParagraphProps({ width: 100 } as never)!;
    expect(n.spans).toBe(bytesToBase64(buildSpanList([{ text: "" }])));
  });

  it("serializes JSX-children text spans like text-prop spans", () => {
    const n = normalizeParagraphProps({ width: 100 } as never, [span({ children: "  hi  " })])!;
    expect(n.spans).toBe(bytesToBase64(buildSpanList([{ text: "hi" }])));
  });

  it("maps textAlign/direction to their bytes and defaults the layout scalars", () => {
    const base = { width: 100 };
    expect(normalizeParagraphProps({ ...base } as never)).toMatchObject({
      textAlign: 0, // left
      direction: 0, // ltr
      lineHeight: 1,
      maxLines: 0,
      x: 0,
      y: 0,
      width: 100,
    });
    expect(normalizeParagraphProps({ ...base, textAlign: "center" } as never)!.textAlign).toBe(1);
    expect(normalizeParagraphProps({ ...base, textAlign: "right" } as never)!.textAlign).toBe(2);
    expect(normalizeParagraphProps({ ...base, textAlign: "justify" } as never)!.textAlign).toBe(0);
    expect(normalizeParagraphProps({ ...base, direction: "rtl" } as never)!.direction).toBe(1);
    expect(normalizeParagraphProps({ ...base, direction: "auto" } as never)!.direction).toBe(2);
    expect(normalizeParagraphProps({ ...base, direction: "ttb" } as never)!.direction).toBe(0);
    expect(
      normalizeParagraphProps({ ...base, lineHeight: 1.5, maxLines: 3, x: 4, y: 5 } as never),
    ).toMatchObject({ lineHeight: 1.5, maxLines: 3, x: 4, y: 5 });
  });
});

describe("Paragraph paint routing", () => {
  // Calling the component directly returns the intrinsic element (a plain
  // object from createElement) — inspect its props without a renderer.
  const elementFor = (props: Record<string, unknown>) =>
    Paragraph(props as never) as unknown as { props: Record<string, unknown> };

  it("routes a gradient child onto the fill slot next to the spans payload", () => {
    const el = elementFor({
      width: 100,
      children: [
        {
          type: LinearGradient,
          props: { start: [0, 0], end: [100, 0], colors: ["#ff0000", "#0000ff"] },
        },
        span({ text: "hi" }),
      ],
    });
    expect(typeof el.props.fillGradient).toBe("string");
    expect(el.props.fill).toBeUndefined(); // no color fill — the span colors apply
    expect(el.props.spans).toBeDefined(); // the layout payload rides along
  });

  it("routes <Paint color> to the node fill (span colors are then overridden)", () => {
    const el = elementFor({
      width: 100,
      children: [{ type: Paint, props: { color: "#ff0000", children: [] } }, span({ text: "hi" })],
    });
    expect(el.props.fill).toBe(0xffff0000);
  });

  it("routes a <ColorMatrix> child onto the fill color-filter slot", () => {
    const el = elementFor({
      width: 100,
      children: [
        {
          type: ColorMatrix,
          props: {
            matrix: [
              0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0, 0, 0.2126, 0.7152, 0.0722, 0,
              0, 0, 0, 0, 1, 0,
            ],
          },
        },
        span({ text: "hi" }),
      ],
    });
    expect(typeof el.props.fillColorFilter).toBe("string");
  });

  it("keeps the paragraph `color` prop OUT of the node fill (it is the span default)", () => {
    const el = elementFor({ width: 100, color: "#00ff00", children: [span({ text: "hi" })] });
    expect(el.props.fill).toBeUndefined();
    // …and it lands in the spans payload as the span default color instead.
    expect(el.props.spans).toBe(bytesToBase64(buildSpanList([{ text: "hi", color: "#00ff00" }])));
  });

  it("does not emit undefined paint props (Android marshals them to 0)", () => {
    const el = elementFor({ width: 100, children: [span({ text: "hi" })] });
    expect(el.props.opacity).toBeUndefined();
    expect(el.props.blendMode).toBeUndefined();
  });
});
