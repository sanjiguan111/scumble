// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

// Module augmentation: @lynx-js/react's type entry has no DEFAULT export,
// but the vendored Victory code (upstream style) does `import React from
// "react"` — codemodded to "@lynx-js/react". Bundlers' interop synthesizes
// the default at runtime; this declaration gives typecheck the same view.
import * as LynxReact from "@lynx-js/react";

declare module "@lynx-js/react" {
  export default LynxReact;
}
