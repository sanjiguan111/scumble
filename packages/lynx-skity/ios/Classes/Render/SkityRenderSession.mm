// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityRenderSession.h"

#import "SkityMetalContext.h"

@interface SkityRenderSession ()
@property(nonatomic, strong) SkityMetalContext *context;
@property(nonatomic, weak) CAMetalLayer *layer;
@property(nonatomic, assign) BOOL surfaceReady;
// Written on the UI thread, read on the render queue.
@property(nonatomic, strong, nullable) NSData *pendingTree;
@property(nonatomic, assign) float pendingDensity;
@property(nonatomic, assign) uint32_t pendingWidth;
@property(nonatomic, assign) uint32_t pendingHeight;
@end

@implementation SkityRenderSession

- (instancetype)init {
  self = [super init];
  if (self) {
    _context = [SkityMetalContext sharedInstance];
  }
  return self;
}

- (void)attachSurfaceWithLayer:(CAMetalLayer *)layer
                          width:(uint32_t)width
                         height:(uint32_t)height {
  self.layer = layer;
  self.surfaceReady = YES;
  // Draw any RenderTree that arrived before the surface was ready.
  [self postDraw];
}

- (void)updateSizeWithWidth:(uint32_t)width height:(uint32_t)height {
  // The drawable size is owned by the view's layout (SkityCanvasView sets
  // layer.drawableSize); nothing to update in the session.
}

- (void)detachSurface {
  self.surfaceReady = NO;
  self.layer = nil;
}

- (void)setRenderTreeData:(NSData *)data
                   density:(float)density
                     width:(uint32_t)width
                    height:(uint32_t)height {
  self.pendingTree = data;
  self.pendingDensity = density;
  self.pendingWidth = width;
  self.pendingHeight = height;
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
  NSData *data = self.pendingTree;
  if (!self.surfaceReady || self.layer == nil || data.length == 0) return;
  [self.context drawLayer:self.layer
                 treeData:data
               viewportW:self.pendingWidth
               viewportH:self.pendingHeight
                  density:self.pendingDensity];
}

- (void)destroy {
  [self detachSurface];
  self.pendingTree = nil;
}

@end
