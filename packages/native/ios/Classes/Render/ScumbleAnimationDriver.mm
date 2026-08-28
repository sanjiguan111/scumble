// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "ScumbleAnimationDriver.h"

#import <QuartzCore/QuartzCore.h>

#import "ScumbleMetalContext.h"
#import "ScumbleRenderSession.h"

// Single-frame pipeline: the display link fires on the main thread → one
// dispatch_async onto the render queue → every live session ticks its tree
// (redrawing when live) → back on main, continue (no-op: the link keeps
// firing) or invalidate when fully idle. `inFlight` drops frames while a tick
// block is still queued, so a busy render queue never builds a backlog.
@implementation ScumbleAnimationDriver {
  CADisplayLink *_link;
  NSHashTable<ScumbleRenderSession *> *_sessions; // weak objects
  BOOL _inFlight;
}

+ (instancetype)sharedInstance {
  static ScumbleAnimationDriver *instance;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ instance = [[ScumbleAnimationDriver alloc] init]; });
  return instance;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _sessions = [NSHashTable weakObjectsHashTable];
  }
  return self;
}

+ (void)registerSession:(ScumbleRenderSession *)session {
  if (session == nil) return;
  ScumbleAnimationDriver *driver = [ScumbleAnimationDriver sharedInstance];
  @synchronized(driver->_sessions) {
    [driver->_sessions addObject:session];
  }
}

+ (void)wakeUp {
  dispatch_async(dispatch_get_main_queue(), ^{
    ScumbleAnimationDriver *driver = [ScumbleAnimationDriver sharedInstance];
    if (driver->_link != nil) return; // already armed
    driver->_link = [CADisplayLink displayLinkWithTarget:driver
                                                selector:@selector(displayLinkFired:)];
    [driver->_link addToRunLoop:[NSRunLoop mainRunLoop] forMode:NSRunLoopCommonModes];
  });
}

- (void)displayLinkFired:(CADisplayLink *)link {
  @synchronized(self) {
    if (_inFlight) return; // previous tick still queued — drop this frame
    _inFlight = YES;
  }
  NSArray<ScumbleRenderSession *> *snapshot;
  @synchronized(_sessions) {
    snapshot = [_sessions allObjects];
  }
  uint64_t nowNs = (uint64_t)(link.targetTimestamp * 1e9);
  dispatch_queue_t renderQueue = [ScumbleMetalContext sharedInstance].renderQueue;
  dispatch_async(renderQueue, ^{
    BOOL anyLive = NO;
    for (ScumbleRenderSession *session in snapshot) {
      if ([session tickAnimations:nowNs]) anyLive = YES;
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      @synchronized(self) {
        self->_inFlight = NO;
      }
      if (!anyLive) {
        // Idle: every tree finished (fill=forwards values stay pinned in the
        // overlays; they just no longer need a clock).
        [self->_link invalidate];
        self->_link = nil;
      }
    });
  });
}

@end
