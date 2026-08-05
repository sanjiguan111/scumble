#include <lynx/registration.h>

#include "shared/elements/LynxSkityElement.h"

LYNX_REGISTER_ELEMENT(
    "LynxSkityElementModule",
    "x-lynx-skity",
    CreateLynxSkityElementNativeView,
    false,
    nullptr)
