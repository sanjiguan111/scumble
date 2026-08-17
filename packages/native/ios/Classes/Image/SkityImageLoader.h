// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.
//
// Platform image loading for <Image> nodes (iOS side). The TASM setter fires
// SkityImageLoaderRegistry.requestImage(_:) when a node first carries a uri;
// pixels land in the shared ImageStore from the render queue and every live
// session redraws (see SkityImageLoader.mm).

#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

/// Decoded bitmap payload handed to the registry: premultiplied RGBA bytes
/// (skity kRGBA layout) + dimensions.
@interface SkityImagePixels : NSObject
@property(nonatomic, strong, readonly) NSData *rgba;
@property(nonatomic, assign, readonly) uint32_t width;
@property(nonatomic, assign, readonly) uint32_t height;
+ (instancetype)pixelsWithRGBA:(NSData *)rgba width:(uint32_t)width height:(uint32_t)height;
@end

/// Host-injectable loader. The built-in one covers `data:` URIs and
/// `http(s)://` URLs; hosts with their own image pipeline (cache/CDN) swap it
/// via SkityImageLoaderRegistry.setImageLoader:.
@protocol SkityImageLoader <NSObject>
- (void)loadImage:(NSString *)uri onComplete:(void (^)(SkityImagePixels *_Nullable))onComplete;
@end

/// Pending-request dedup + result routing into the ImageStore. Thread-safe
/// (requests arrive on the TASM thread; results on arbitrary loader threads;
/// the store write + redraw happen on the render queue).
@interface SkityImageLoaderRegistry : NSObject
/// Host injection (nil restores the built-in loader).
+ (void)setImageLoader:(nullable id<SkityImageLoader>)loader;
/// Fire (or join) the load for `uri`; no-op while a request is in flight.
/// `onComplete`-style retries are not attempted — a failed uri stays blank.
+ (void)requestImage:(NSString *)uri;
/// Live-session registry (weak); the render-side store write pings every
/// session so the late-arriving bitmap shows up without a Lynx layout pass.
+ (void)addSession:(id)session;
/// Snapshot of the live sessions (render-queue callers iterate it).
+ (NSArray<id> *)liveSessions;
@end

NS_ASSUME_NONNULL_END
