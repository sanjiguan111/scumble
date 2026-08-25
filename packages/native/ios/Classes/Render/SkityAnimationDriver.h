// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import <Foundation/Foundation.h>

@class SkityRenderSession;

// Per-frame vsync driver for the native animation engine (ANIMATION_DESIGN.md
// D4). CADisplayLink on the main runloop is the clock; the tick body runs on
// the shared render queue (every canvas's tree lives there — single-threaded
// by contract). Stop-on-idle: a frame where no session reports live
// invalidates the display link, so an unanimated page pays zero cost.
@interface SkityAnimationDriver : NSObject

// Weak table — a session is dropped automatically once it deallocs.
+ (void)registerSession:(SkityRenderSession *)session;

// Arm the loop if it isn't running. Safe from any thread (the actual link
// creation happens on the main thread).
+ (void)wakeUp;

@end
