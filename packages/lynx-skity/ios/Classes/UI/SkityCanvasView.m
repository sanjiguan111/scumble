// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasView.h"

#import <Metal/Metal.h>
#import <QuartzCore/CAMetalLayer.h>

#import "SkityMetalContext.h"
#import "SkityRenderBundle.h"
#import "SkityRenderSession.h"

@implementation SkityCanvasView {
  SkityRenderSession *_session;
  BOOL _layerReady;
}

+ (Class)layerClass {
  return [CAMetalLayer class];
}

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _session = [[SkityRenderSession alloc] init];

    CAMetalLayer *ml = (CAMetalLayer *)self.layer;
    ml.device = [SkityMetalContext sharedInstance].device;
    // Transparent background: where skity draws nothing, let the Lynx view
    // behind show through instead of an opaque black layer.
    ml.opaque = NO;
    ml.pixelFormat = MTLPixelFormatBGRA8Unorm;
    // The Metal layer is redrawn every frame by the GPU pipeline. Disable Core
    // Animation's implicit animations on it (sublayers aren't covered by
    // UIView's suppression), mirroring react-native-skity SkityView.mm.
    ml.actions = @{
      @"contents" : [NSNull null],
      @"onOrderIn" : [NSNull null],
      @"onOrderOut" : [NSNull null],
      @"bounds" : [NSNull null],
      @"position" : [NSNull null],
    };
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];

  CGFloat scale = [[UIScreen mainScreen] scale];
  CAMetalLayer *ml = (CAMetalLayer *)self.layer;
  ml.contentsScale = scale;
  CGFloat w = self.bounds.size.width * scale;
  CGFloat h = self.bounds.size.height * scale;
  ml.drawableSize = CGSizeMake(w, h);

  if (!_layerReady && w > 0 && h > 0) {
    _layerReady = YES;
    [_session attachSurfaceWithLayer:ml width:(uint32_t)w height:(uint32_t)h];
  }
}

- (void)consumeRenderBundle:(SkityRenderBundle *)bundle {
  if (bundle == nil) return;
  CAMetalLayer *ml = (CAMetalLayer *)self.layer;
  [_session setRenderTreeData:bundle.renderTreeData
                      density:bundle.density
                        width:(uint32_t)ml.drawableSize.width
                       height:(uint32_t)ml.drawableSize.height];
}

- (void)destroySession {
  [_session destroy];
}

@end
