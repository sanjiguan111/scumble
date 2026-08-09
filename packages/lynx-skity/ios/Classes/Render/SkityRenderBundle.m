// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityRenderBundle.h"

@implementation SkityRenderBundle

- (instancetype)initWithData:(NSData *)data viewport:(CGSize)viewportSize density:(float)density {
  self = [super init];
  if (self) {
    _renderTreeData = data;
    _viewportSize = viewportSize;
    _density = density;
  }
  return self;
}

@end
