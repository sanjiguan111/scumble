// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "SkityImageLoader.h"

#import <CoreGraphics/CoreGraphics.h>
#import <UIKit/UIKit.h>

#include <cstdlib>
#include <cstring>
#include <memory>

#include <skity/io/data.hpp>

#include "SkityMetalContext.h"
#include "SkityRenderSession.h"
#include "image_store.h"

NS_ASSUME_NONNULL_BEGIN

#pragma mark - SkityImagePixels

@implementation SkityImagePixels
@synthesize rgba = _rgba, width = _width, height = _height;

+ (instancetype)pixelsWithRGBA:(NSData *)rgba width:(uint32_t)width height:(uint32_t)height {
  SkityImagePixels *p = [[SkityImagePixels alloc] init];
  p->_rgba = rgba;
  p->_width = width;
  p->_height = height;
  return p;
}

@end

#pragma mark - Built-in loader (data URI / http(s))

// Decode image bytes into premultiplied RGBA (skity kRGBA byte layout).
// 8bpc/32bpp + kCGBitmapByteOrder32Big + PremultipliedLast means the in-memory
// byte order is R,G,B,A on every Apple target — the standard Skia-style combo.
static SkityImagePixels *_Nullable SkityDecodeImageBytes(NSData *data) {
  if (data.length == 0) return nil;
  UIImage *image = [UIImage imageWithData:data];
  if (image == nil) return nil;
  CGImageRef cg = image.CGImage;
  if (cg == nil) return nil;
  const uint32_t w = (uint32_t)CGImageGetWidth(cg);
  const uint32_t h = (uint32_t)CGImageGetHeight(cg);
  if (w == 0 || h == 0) return nil;

  CGColorSpaceRef rgb = CGColorSpaceCreateDeviceRGB();
  CGContextRef ctx = CGBitmapContextCreate(
      nil, w, h, 8, (size_t)w * 4, rgb, kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
  CGColorSpaceRelease(rgb);
  if (ctx == nil) return nil;
  CGContextDrawImage(ctx, CGRectMake(0, 0, w, h), cg);
  const void *px = CGBitmapContextGetData(ctx);
  if (px == nil) {
    CGContextRelease(ctx);
    return nil;
  }
  // One copy hands ownership to the store-independent NSData; the (potentially
  // large) CGBitmapContext is released right here instead of living as long as
  // the decoded image (a zero-copy Data::MakeWithProc-held context saves the
  // copy but couples skity::Data lifetime to Core Graphics — not worth it for
  // v1).
  NSData *rgba = [NSData dataWithBytes:px length:(NSUInteger)w * h * 4];
  CGContextRelease(ctx);
  return [SkityImagePixels pixelsWithRGBA:rgba width:w height:h];
}

@interface BuiltInSkityImageLoader : NSObject <SkityImageLoader>
@end

@implementation BuiltInSkityImageLoader

- (void)loadImage:(NSString *)uri onComplete:(void (^)(SkityImagePixels *_Nullable))onComplete {
  if ([uri hasPrefix:@"data:"]) {
    NSRange marker = [uri rangeOfString:@"base64,"];
    if (marker.location == NSNotFound) {
      onComplete(nil);
      return;
    }
    NSString *b64 = [uri substringFromIndex:marker.location + marker.length];
    NSData *data =
        [[NSData alloc] initWithBase64EncodedString:b64
                                            options:NSDataBase64DecodingIgnoreUnknownCharacters];
    onComplete(SkityDecodeImageBytes(data));
    return;
  }
  if ([uri hasPrefix:@"http://"] || [uri hasPrefix:@"https://"]) {
    // ATS blocks plain http by default; hosts that need it adjust their plist.
    NSURL *url = [NSURL URLWithString:uri];
    if (url == nil) {
      onComplete(nil);
      return;
    }
    NSURLSessionDataTask *task = [[NSURLSession sharedSession]
          dataTaskWithURL:url
        completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable resp,
                            NSError *_Nullable err) {
          // The completion handler runs on a background session queue — decode
          // there too (large bitmaps stay off the main thread).
          if (data == nil || err != nil) {
            onComplete(nil);
            return;
          }
          if ([resp isKindOfClass:[NSHTTPURLResponse class]] &&
              ((NSHTTPURLResponse *)resp).statusCode / 100 != 2) {
            onComplete(nil);
            return;
          }
          onComplete(SkityDecodeImageBytes(data));
        }];
    [task resume];
    return;
  }
  // Unknown scheme: not built-in. Hosts provide their own loader for
  // file:// / asset schemes.
  onComplete(nil);
}

@end

#pragma mark - Registry

// Render-side entry: write pixels into the ImageStore + redraw all live
// sessions, strictly on the render queue (ImageStore threading contract).
//
// Lifetime: `bytes` points into the loader callback's NSData, which dies the
// moment that callback returns — so the copy MUST happen synchronously here,
// before the dispatch. The block then only touches data it owns: `uri` is a
// by-value capture and `px` is our malloc'd copy (handed to skity::Data
// inside the block; freed by the release proc).
static void SkityStoreImageBytes(std::string uri, const void *bytes, size_t len, uint32_t w,
                                 uint32_t h, bool ok) {
  void *px = (ok && bytes != nullptr && len > 0) ? std::malloc(len) : nullptr;
  if (px != nullptr) {
    std::memcpy(px, bytes, len);
  }
  dispatch_async([SkityMetalContext sharedInstance].renderQueue, ^{
    if (px != nullptr) {
      auto data = skity::Data::MakeWithProc(
          px, len, [](const void *ptr, void *) { std::free(const_cast<void *>(ptr)); }, nullptr);
      skityrt::ImageStore::Instance().StorePixels(uri, std::move(data), w, h,
                                                  /*premultiplied=*/true);
    } else {
      skityrt::ImageStore::Instance().MarkFailed(uri);
    }
    for (SkityRenderSession *session in [SkityImageLoaderRegistry liveSessions]) {
      [session drawIfReady]; // already on the render queue
    }
  });
}

@implementation SkityImageLoaderRegistry {
  id<SkityImageLoader> _loader;
  NSMutableSet<NSString *> *_pending;
  NSHashTable<id> *_sessions;
}

+ (instancetype)shared {
  static SkityImageLoaderRegistry *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ registry = [[SkityImageLoaderRegistry alloc] init]; });
  return registry;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _loader = [[BuiltInSkityImageLoader alloc] init];
    _pending = [NSMutableSet set];
    _sessions = [NSHashTable weakObjectsHashTable];
  }
  return self;
}

+ (void)setImageLoader:(nullable id<SkityImageLoader>)loader {
  SkityImageLoaderRegistry *registry = [SkityImageLoaderRegistry shared];
  @synchronized(registry) {
    registry->_loader = loader ?: [[BuiltInSkityImageLoader alloc] init];
  }
}

+ (NSArray<id> *)liveSessions {
  SkityImageLoaderRegistry *registry = [SkityImageLoaderRegistry shared];
  @synchronized(registry) {
    return [registry->_sessions allObjects];
  }
}

+ (void)addSession:(id)session {
  SkityImageLoaderRegistry *registry = [SkityImageLoaderRegistry shared];
  @synchronized(registry) {
    [registry->_sessions addObject:session];
  }
}

+ (void)requestImage:(NSString *)uri {
  if (uri.length == 0) return;
  SkityImageLoaderRegistry *registry = [SkityImageLoaderRegistry shared];
  id<SkityImageLoader> loader;
  @synchronized(registry) {
    if ([registry->_pending containsObject:uri]) return;
    [registry->_pending addObject:uri];
    loader = registry->_loader;
  }
  std::string key = std::string(uri.UTF8String);
  [loader loadImage:uri
         onComplete:^(SkityImagePixels *_Nullable pixels) {
           if (pixels != nil) {
             SkityStoreImageBytes(key, pixels.rgba.bytes, pixels.rgba.length, pixels.width,
                                  pixels.height, true);
           } else {
             SkityStoreImageBytes(key, nullptr, 0, 0, 0, false);
           }
           @synchronized(registry) {
             [registry->_pending removeObject:uri];
           }
         }];
}

@end

NS_ASSUME_NONNULL_END
