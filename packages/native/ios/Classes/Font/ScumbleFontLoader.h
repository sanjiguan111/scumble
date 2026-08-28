// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Host-injectable font loader for <scumble-paragraph> custom fonts with schemed
// URIs (http(s)://, file://, host schemes). Mirrors the image loader shape:
// requests come from the TASM thread (paragraph layout saw a TypefaceCache
// miss), results may arrive on any loader thread, and the registry then (1)
// stores the bytes in the native TypefaceCache and (2) re-triggers layout on
// every waiting paragraph — fonts are a LAYOUT input, unlike images'
// render-time consumption. `data:` URIs never reach a loader (decoded
// synchronously in the cache).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@class LynxUIContext;

@protocol ScumbleFontLoader <NSObject>
/// Raw ttf/otf bytes for the uri; `onComplete(nil)` = failure. May be called
/// on any thread.
- (void)loadFont:(NSString *)uri onComplete:(void (^)(NSData *_Nullable bytes))onComplete;
@end

/// Built-in loader: http(s) via the shared NSURLSession, file:// paths.
/// Hosts swap it via [ScumbleFontLoaderRegistry setFontLoader:].
@interface BuiltInScumbleFontLoader : NSObject <ScumbleFontLoader>
@end

@interface ScumbleFontLoaderRegistry : NSObject

/// Replace the font loader (nil restores the built-in one).
+ (void)setFontLoader:(nullable id<ScumbleFontLoader>)loader;

/// TASM thread (paragraph layout): register a paragraph as waiting on the
/// uri and start the load if none is in flight. On completion the registry
/// stores the bytes natively and re-triggers layout on every waiter (main
/// queue hop, then findShadowNodeAndRunTask — the public API Lynx's own
/// async-font / inline-image paths use to hop to the layout thread).
+ (void)requestFont:(NSString *)uri sign:(NSInteger)sign uiContext:(LynxUIContext *)uiContext;

@end

NS_ASSUME_NONNULL_END
