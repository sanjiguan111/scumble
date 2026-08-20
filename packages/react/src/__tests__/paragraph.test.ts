import { describe, it, expect } from "vitest";

import { bytesToBase64, buildSpanList } from "@lynx-skity/graphics";

import { collectSpans, normalizeParagraphProps, resolveSpanText } from "../shapes/Paragraph";
import { TextSpan } from "../shapes/TextSpan";

// childElements consumes plain {type, props} objects — no JSX needed.
const span = (props: Record<string, unknown>) => ({ type: TextSpan, props });

describe("collectSpans", () => {
  it("keeps <TextSpan> children in declaration order and skips everything else", () => {
    const spans = collectSpans([
      "ignored string child",
      span({ text: "one" }),
      { type: function NotASpan() {}, props: {} },
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
    expect(resolveSpanText({ children: ["a", { type: TextSpan, props: {} }, "b"] })).toBe("ab");
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

  it("falls back to one empty span when there is no <TextSpan> child", () => {
    const n = normalizeParagraphProps({ width: 100 } as never)!;
    expect(n.spans).toBe(bytesToBase64(buildSpanList([{ text: "" }])));
  });

  it("serializes JSX-children text spans like text-prop spans", () => {
    const n = normalizeParagraphProps({ width: 100 } as never, [span({ children: "  hi  " })])!;
    expect(n.spans).toBe(bytesToBase64(buildSpanList([{ text: "hi" }])));
  });

  it("maps textAlign to its byte and defaults the layout scalars", () => {
    const base = { width: 100 };
    expect(normalizeParagraphProps({ ...base } as never)).toMatchObject({
      textAlign: 0, // left
      lineHeight: 1,
      maxLines: 0,
      x: 0,
      y: 0,
      width: 100,
    });
    expect(normalizeParagraphProps({ ...base, textAlign: "center" } as never)!.textAlign).toBe(1);
    expect(normalizeParagraphProps({ ...base, textAlign: "right" } as never)!.textAlign).toBe(2);
    expect(normalizeParagraphProps({ ...base, textAlign: "justify" } as never)!.textAlign).toBe(0);
    expect(
      normalizeParagraphProps({ ...base, lineHeight: 1.5, maxLines: 3, x: 4, y: 5 } as never),
    ).toMatchObject({ lineHeight: 1.5, maxLines: 3, x: 4, y: 5 });
  });
});
