// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityRenderSession.h"

#import "SkityMetalContext.h"
#import <UIKit/UIScreen.h>

@interface SkityRenderSession ()
@property(nonatomic, strong) SkityMetalContext *context;
@property(nonatomic, weak) CAMetalLayer *layer;
@property(nonatomic, assign) BOOL surfaceReady;
// Written on the UI thread, read on the render queue.
@property(nonatomic, strong, nullable) NSData *pendingCommands;
@end

@implementation SkityRenderSession

- (instancetype)init {
  self = [super init];
  if (self) {
    _context = [SkityMetalContext sharedInstance];
  }
  return self;
}

- (void)attachSurfaceWithLayer:(CAMetalLayer *)layer {
  self.layer = layer;
  self.surfaceReady = YES;
  // Draw any RenderTree that arrived before the surface was ready.
  [self postDraw];
}

- (void)detachSurface {
  [self.context purgeRetainedTreeForLayer:self.layer];
  self.surfaceReady = NO;
  self.layer = nil;
}

- (void)applyCommands:(NSData *)commands {
  self.pendingCommands = commands;
  [self postDraw];
}

- (void)postDraw {
  __weak __typeof__(self) weakSelf = self;
  dispatch_async(self.context.renderQueue, ^{
    __strong __typeof__(weakSelf) strongSelf = weakSelf;
    [strongSelf drawIfReady];
  });
}

- (void)drawIfReady {
  // Runs on the shared render queue.
  if (!self.surfaceReady || self.layer == nil) return;
  // The retained tree persists across frames (Step 3b: no snapshot), so every
  // postDraw redraws the current state. Size is read fresh from the layer's
  // drawableSize (an early command may arrive before layoutSubviews sets it).
  CGSize drawable = self.layer.drawableSize;
  if (drawable.width <= 0 || drawable.height <= 0) return;
  [self.context drawLayer:self.layer
                 commands:self.pendingCommands
                viewportW:(uint32_t)drawable.width
                viewportH:(uint32_t)drawable.height
                  density:[UIScreen mainScreen].scale];
  self.pendingCommands = nil;
}

- (void)destroy {
  [self detachSurface];
}

@end
