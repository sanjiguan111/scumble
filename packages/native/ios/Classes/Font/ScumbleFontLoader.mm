// Licensed under the Apache License Version 2.0 that can be found in the
// LICENSE file in the root directory of this source tree.

#import "ScumbleFontLoader.h"

#import <Lynx/LynxUIContext.h>

#include "typeface_cache.h"

// Re-layout trigger: dirty the paragraph and let Lynx schedule the layout
// pass. ScumbleNodeBase declares the paragraph dirty flag; pulling the header
// here would couple the loader to the node layer, so the task talks to the
// flag through a small category-free helper below.
#import "../Node/ScumbleNodeBase.h"
#import <Lynx/LynxShadowNode.h>

@implementation BuiltInScumbleFontLoader

- (void)loadFont:(NSString *)uri onComplete:(void (^)(NSData *_Nullable))onComplete {
  if ([uri hasPrefix:@"file://"]) {
    // Local file — small read, still off the caller's thread for symmetry
    // with the network path.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{
      NSString *path = [NSURL URLWithString:uri].path;
      NSData *bytes = path != nil ? [NSData dataWithContentsOfFile:path] : nil;
      onComplete(bytes);
    });
    return;
  }
  if (![uri hasPrefix:@"http://"] && ![uri hasPrefix:@"https://"]) {
    // Host schemes: hosts provide their own loader; the built-in one can't.
    dispatch_async(dispatch_get_global_queue(QOS_CLASS_UTILITY, 0), ^{ onComplete(nil); });
    return;
  }
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
        dataTaskWithURL:[NSURL URLWithString:uri]
      completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable response,
                          NSError *_Nullable error) {
        // Completion lands on the session's delegate queue.
        BOOL ok = error == nil && data.length > 0 &&
                  [response isKindOfClass:[NSHTTPURLResponse class]] &&
                  ((NSHTTPURLResponse *)response).statusCode / 100 == 2;
        onComplete(ok ? data : nil);
      }];
  [task resume];
}

@end

// One paragraph waiting for one uri. The uiContext is weak: a destroyed page
// drops out of the wait list naturally (same stance as the image registry's
// weak session table).
@interface ScumbleFontWaiter : NSObject
@property(nonatomic, weak, nullable) LynxUIContext *uiContext;
@property(nonatomic, assign) NSInteger sign;
@end

@implementation ScumbleFontWaiter
@end

@implementation ScumbleFontLoaderRegistry {
  id<ScumbleFontLoader> _loader;
  NSMutableSet<NSString *> *_pending;
  NSMutableDictionary<NSString *, NSMutableArray<ScumbleFontWaiter *> *> *_waiting;
}

+ (instancetype)shared {
  static ScumbleFontLoaderRegistry *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{ registry = [[ScumbleFontLoaderRegistry alloc] init]; });
  return registry;
}

- (instancetype)init {
  self = [super init];
  if (self) {
    _loader = [[BuiltInScumbleFontLoader alloc] init];
    _pending = [NSMutableSet set];
    _waiting = [NSMutableDictionary dictionary];
  }
  return self;
}

+ (void)setFontLoader:(nullable id<ScumbleFontLoader>)loader {
  ScumbleFontLoaderRegistry *registry = [ScumbleFontLoaderRegistry shared];
  @synchronized(registry) {
    registry->_loader = loader ?: [[BuiltInScumbleFontLoader alloc] init];
  }
}

+ (void)requestFont:(NSString *)uri sign:(NSInteger)sign uiContext:(LynxUIContext *)uiContext {
  if (uri.length == 0) return;
  ScumbleFontLoaderRegistry *registry = [ScumbleFontLoaderRegistry shared];
  id<ScumbleFontLoader> loader;
  @synchronized(registry) {
    ScumbleFontWaiter *waiter = [[ScumbleFontWaiter alloc] init];
    waiter.uiContext = uiContext;
    waiter.sign = sign;
    NSMutableArray *list = registry->_waiting[uri];
    if (list == nil) {
      list = [NSMutableArray array];
      registry->_waiting[uri] = list;
    }
    [list addObject:waiter];
    if ([registry->_pending containsObject:uri]) return;
    [registry->_pending addObject:uri];
    loader = registry->_loader;
  }
  std::string key = std::string(uri.UTF8String);
  [loader loadFont:uri
        onComplete:^(NSData *_Nullable bytes) {
          // Any loader thread — the cache is mutex-guarded, and a nil payload
          // records a sticky failure (the uri never re-requests).
          skityrt::TypefaceCache::Instance().StoreBytes(key, bytes != nil ? bytes.bytes : nullptr,
                                                        (size_t)bytes.length);
          NSArray<ScumbleFontWaiter *> *waiters;
          ScumbleFontLoaderRegistry *reg = [ScumbleFontLoaderRegistry shared];
          @synchronized(reg) {
            [reg->_pending removeObject:uri];
            waiters = reg->_waiting[uri];
            [reg->_waiting removeObjectForKey:uri];
          }
          if (waiters.count == 0) return;
          // Hop to main first (library convention — the layout event does
          // the same), then findShadowNodeAndRunTask hops to the layout
          // thread internally.
          dispatch_async(dispatch_get_main_queue(), ^{
            for (ScumbleFontWaiter *waiter in waiters) {
              LynxUIContext *ctx = waiter.uiContext;
              if (ctx == nil) continue;
              [ctx findShadowNodeAndRunTask:waiter.sign
                                       task:^(LynxShadowNode *node) {
                                         if (![node isKindOfClass:[ScumbleNodeBase class]]) return;
                                         ((ScumbleNodeBase *)node).dirtyParagraph = YES;
                                         [node setNeedsLayout];
                                       }];
            }
          });
        }];
}

@end
