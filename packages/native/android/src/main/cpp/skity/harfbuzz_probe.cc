// ndkports layout: headers live one level under the prefab module include
// dir, so the include is <harfbuzz/hb.h>, not <hb.h>.
#include <harfbuzz/hb.h>

// Link probe for the harfbuzz-ndk26-static prefab (Task 17 dependency
// verification): a dynamic initializer references hb_version_string(), which
// forces the needed libharfbuzz.a members to resolve when linking
// libskityrender.so — unreferenced static-library members would otherwise be
// dropped and the link would "succeed" without proving anything.
//
// Replaced by the real shaping helper once the Android Paragraph layout
// backend (SkityParagraphShadowNode) lands.
__attribute__((used)) static const char* kHarfBuzzVersionProbe = hb_version_string();
