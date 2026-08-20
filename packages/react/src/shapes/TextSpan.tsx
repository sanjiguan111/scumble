// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

/**
 * One styled run of text inside a {@link Paragraph}. A data-only declarative
 * child — the parent's collector reads these props and serializes them into
 * the `spans` payload, so this component never mounts. The text rides the
 * `text` prop or JSX children (trimmed), whichever is given:
 *
 * @example
 * <TextSpan text="Hello " />
 * <TextSpan color="#3b82f6">skity</TextSpan>
 */

export function TextSpan(_props: import("../types").TextSpanProps): null {
  // Data-only component; consumed by the parent Paragraph. Returning null is
  // harmless because the parent extracts the props and emits a childless
  // intrinsic element, so this child is never rendered.
  return null;
}
