// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasUI.h"

#import <Lynx/LynxComponentRegistry.h>

#import "SkityCanvasView.h"
#import "SkityRenderBundle.h"

@implementation SkityCanvasUI

#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_UI("skity-canvas")
#else
LYNX_REGISTER_UI("skity-canvas")
#endif

- (UIView *)createView {
  return [[SkityCanvasView alloc] init];
}

- (void)onReceiveUIOperation:(id)extraData {
  [super onReceiveUIOperation:extraData];
  if ([extraData isKindOfClass:[SkityRenderBundle class]]) {
    [(SkityCanvasView *)self.view consumeRenderBundle:(SkityRenderBundle *)extraData];
  }
}

- (void)detachView {
  [(SkityCanvasView *)self.view destroySession];
  [super detachView];
}

@end
