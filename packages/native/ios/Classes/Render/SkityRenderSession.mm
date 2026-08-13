// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityRenderSession.h"

#import "SkityMetalContext.h"
#import <UIKit/UIScreen.h>

@interface SkityRenderSession ()
@property(nonatomic, strong) SkityMetalContext *context;
@property(nonatomic, weak) CAMetalLayer *layer;
@property(nonatomic, assign) BOOL surfaceReady;
// Process-unique key into SkityMetalContext's retained-tree map. Allocated per
// session so a remounted canvas (new session) never reuses a prior canvas's
// tree even if the CAMetalLayer pointer is recycled by malloc.
@property(nonatomic, assign) NSInteger treeKey;
@end

@implementation SkityRenderSession

- (instancetype)init {
  self = [super init];
  if (self) {
    _context = [SkityMetalContext sharedInstance];
    _treeKey = [SkityMetalContext nextTreeKey];
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
  [self.context purgeRetainedTreeForKey:self.treeKey];
  self.surfaceReady = NO;
  self.layer = nil;
}

- (void)applyCommands:(NSData *)commands {
  // Apply each batch in full on the render queue, then draw. Previously the
  // batch sat in a single `pendingCommands` slot that the next batch would
  // overwrite before drawIfReady ran — under rapid updates that dropped the
  // first batch's structural Insert, so nodes never entered the retained tree
  // and never rendered. Applying directly on the render queue guarantees every
  // batch is applied.
  __weak __typeof__(self) weakSelf = self;
  NSData *cmds = commands;
  dispatch_async(self.context.renderQueue, ^{
    __strong __typeof__(weakSelf) strongSelf = weakSelf;
    if (cmds != nil && cmds.length > 0) {
      [strongSelf.context applyCommandBatch:cmds treeKey:strongSelf.treeKey];
    }
    [strongSelf drawIfReady];
  });
}

- (void)postDraw {
  __weak __typeof__(self) weakSelf = self;
  dispatch_async(self.context.renderQueue, ^{
    __strong __typeof__(weakSelf) strongSelf = weakSelf;
    [strongSelf drawIfReady];
  });
}

- (void)drawIfReady {
  // Runs on the shared render queue. Draw only — commands are applied in
  // applyCommands: (or already in the tree when the surface attaches).
  if (!self.surfaceReady || self.layer == nil) return;
  CGSize drawable = self.layer.drawableSize;
  if (drawable.width <= 0 || drawable.height <= 0) return;
  [self.context drawLayer:self.layer
                  treeKey:self.treeKey
                viewportW:(uint32_t)drawable.width
                viewportH:(uint32_t)drawable.height
                  density:[UIScreen mainScreen].scale];
}

- (void)destroy {
  [self detachSurface];
}

- (void)dealloc {
  // Safety net: if detachView/destroy was skipped or delayed, still drop the
  // tree on dealloc so the retained-tree map can't leak or be inherited by a
  // later canvas. Idempotent with detachSurface (erase on a missing key no-ops).
  [_context purgeRetainedTreeForKey:_treeKey];
}

@end
