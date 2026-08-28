// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityCanvasUI.h"

#import <Lynx/LynxComponentRegistry.h>
#import <Lynx/LynxEvent.h>
#import <Lynx/LynxUIMethodProcessor.h>

#import "SkityCanvasView.h"

// action name → skityrt::AnimControlAction enum value (node_animation.h).
static int SkityAnimActionCode(NSString *name) {
  if ([name isEqualToString:@"play"]) return 0;
  if ([name isEqualToString:@"pause"]) return 1;
  if ([name isEqualToString:@"seek"]) return 2;
  if ([name isEqualToString:@"cancel"]) return 3;
  return -1;
}

// Custom-event type (D5): the React layer binds onAnimationFinish.
static NSString *const kAnimationFinishEvent = @"scumbleanimationfinish";

@implementation SkityCanvasUI

#if LYNX_LAZY_LOAD
LYNX_LAZY_REGISTER_UI("scumble-canvas")
#else
LYNX_REGISTER_UI("scumble-canvas")
#endif

- (UIView *)createView {
  SkityCanvasView *view = [[SkityCanvasView alloc] init];
  // Finish events (D5): the view delivers on the main queue; emit through the
  // event emitter (the LynxCustomEvent sendCustomEvent channel).
  __weak __typeof__(self) weakSelf = self;
  view.animationFinishDispatcher =
      ^(NSString *handle) { [weakSelf sendAnimationFinishEvent:handle]; };
  return view;
}

- (void)sendAnimationFinishEvent:(NSString *)handle {
  LynxCustomEvent *event = [[LynxCustomEvent alloc] initWithName:kAnimationFinishEvent
                                                      targetSign:self.sign
                                                          params:@{@"handle" : handle}];
  [self.context.eventEmitter sendCustomEvent:event];
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

// Playback control, the invoke-lane entry (ANIMATION_CONTROL_DESIGN.md D2).
// Params (scalars only): handle (string), action ("play"|"pause"|"seek"|
// "cancel"), time (ms, seek only). The body does exactly one thing: forward
// onto the render queue; all state lives with the retained tree.
LYNX_UI_METHOD(animateControl) {
  NSString *handle = params[@"handle"];
  NSString *actionName = params[@"action"];
  int action = actionName != nil ? SkityAnimActionCode(actionName) : -1;
  if (handle.length == 0 || action < 0) {
    callback(kUIMethodParamInvalid, nil);
    return;
  }
  double timeMs = [params[@"time"] doubleValue];
  SkityCanvasView *target = (SkityCanvasView *)self.view;
  if (![target isKindOfClass:[SkityCanvasView class]]) {
    callback(kUIMethodNodeNotFound, nil);
    return;
  }
  [target controlAnimation:handle
                    action:action
                    timeMs:timeMs
                    onDone:^(BOOL ok) {
                      // Fires on the render queue; the callback crosses back.
                      callback(ok ? kUIMethodSuccess : kUIMethodParamInvalid, nil);
                    }];
}

@end
