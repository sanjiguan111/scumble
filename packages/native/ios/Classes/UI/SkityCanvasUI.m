// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasUI.h"

#import <Lynx/LynxComponentRegistry.h>

#import "SkityCanvasView.h"

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
  if ([extraData isKindOfClass:[NSData class]]) {
    [(SkityCanvasView *)self.view consumeCommands:(NSData *)extraData];
  } else if ([extraData isKindOfClass:[NSDictionary class]]) {
    // Multi-key payload: the command batch + the paragraph glyph runs laid
    // out during measure (same flush; the render queue applies batch first).
    NSDictionary *payload = (NSDictionary *)extraData;
    NSData *batch = payload[@"batch"];
    NSData *runs = payload[@"runs"];
    if (batch != nil || runs != nil) {
      [(SkityCanvasView *)self.view consumePayloadWithBatch:batch paragraphRuns:runs];
    }
  }
}

- (void)detachView {
  [(SkityCanvasView *)self.view destroySession];
  [super detachView];
}

@end
