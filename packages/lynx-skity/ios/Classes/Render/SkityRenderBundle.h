// Copyright 2026 The Lynx Authors. All rights reserved.
// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
/// Wraps a serialized FlatBuffer skityrt::RenderTree for transport from the
/// ShadowNode layer (SkityCanvasShadowNode) to the LynxUI layer
/// (SkityCanvasUI) via Lynx's extra-data channel (getExtraBundle →
/// onReceiveUIOperation:).
///
/// iOS counterpart of android/.../render/SkityRenderBundle.kt, trimmed to the
/// skity MVP (no nativePtr / event map / animation flags).
#import <CoreGraphics/CoreGraphics.h>
#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface SkityRenderBundle : NSObject

/// Serialized skityrt::RenderTree FlatBuffer bytes.
@property(nonatomic, strong, readonly) NSData *renderTreeData;

/// Logical viewport (dp) used when building the render tree.
@property(nonatomic, assign, readonly) CGSize viewportSize;

/// Screen scale (points → pixels), passed through to SkityRenderer::Draw.
@property(nonatomic, assign, readonly) float density;

- (instancetype)initWithData:(NSData *)data viewport:(CGSize)viewportSize density:(float)density;

@end

NS_ASSUME_NONNULL_END
