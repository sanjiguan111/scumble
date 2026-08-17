// Licensed under the Apache License Version 2.0 that may not be used except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Paint filter components — declarative children of a shape (or <Paint>), in
// the react-native-skia style. Data-only: each renders null; the parent
// shape's resolvePaint collects their props and serializes them into the
// paint's *Filter base64 props (image filters: blur/dropShadow; color
// filters: colorMatrix/colorBlend; mask filter: maskBlur). Several filters of
// the same kind compose in declaration order (the first declared applies
// first / innermost). Like shaders, a filter child routes to the paint the
// shape actually draws with — inside a <Paint style="stroke"> it targets the
// stroke paint.

import type {
  BlurProps,
  ColorBlendProps,
  ColorMatrixProps,
  DropShadowProps,
  MaskBlurProps,
} from "../types";

/** Image filter: blur the shape's rendered layer. See {@link BlurProps}. */
export function Blur(_props: BlurProps): null {
  return null;
}

/** Image filter: drop a blurred colored copy behind the shape. */
export function DropShadow(_props: DropShadowProps): null {
  return null;
}

/** Color filter: per-pixel 4×5 color matrix (grayscale, sepia, channel swap…). */
export function ColorMatrix(_props: ColorMatrixProps): null {
  return null;
}

/** Color filter: blend a constant color onto the source (Skia BlendMode). */
export function ColorBlend(_props: ColorBlendProps): null {
  return null;
}

/** Mask filter: feather the shape's alpha mask (Skia's blur MaskFilter). */
export function MaskBlur(_props: MaskBlurProps): null {
  return null;
}
