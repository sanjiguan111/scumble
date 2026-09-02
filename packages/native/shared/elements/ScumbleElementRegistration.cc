#include <lynx/registration.h>

#include "shared/elements/ScumbleElement.h"

LYNX_REGISTER_ELEMENT("ScumbleElementModule", "x-scumble", CreateScumbleElementNativeView, false,
                      nullptr)
