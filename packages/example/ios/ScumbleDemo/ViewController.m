#import "ViewController.h"

#import <Lynx/LynxEnv.h>

static NSString *const kDevServerURL =
    @"http://localhost:3000/main.lynx.bundle?enable_napi_addon=1";

// Hot-reload: lynx.config.ts pushes `data: reload` over an SSE stream on port
// 3001 whenever a recompile finishes. Subscribe to it and reload the bundle on
// each event — without this, editing src/App.tsx never reaches the running app.
static NSString *const kHotReloadURL = @"http://localhost:3001/hot-reload";

@interface ViewController () <NSURLSessionDataDelegate>
@property(nonatomic, strong) NSURLSessionDataTask *sseTask;
@property(nonatomic, strong) NSMutableData *sseBuffer;
@end

@implementation ViewController

- (void)viewDidLoad {
  [super viewDidLoad];
  self.view.backgroundColor = [UIColor whiteColor];

  CGSize screenSize = self.view.bounds.size;

  LynxView *lynxView = [[LynxView alloc] initWithBuilderBlock:^(LynxViewBuilder *builder) {
    builder.config = [LynxEnv sharedInstance].config;
    builder.screenSize = screenSize;
    builder.fontScale = 1.0;
  }];

  lynxView.preferredLayoutWidth = screenSize.width;
  lynxView.preferredLayoutHeight = screenSize.height;
  lynxView.layoutWidthMode = LynxViewSizeModeExact;
  lynxView.layoutHeightMode = LynxViewSizeModeExact;
  lynxView.frame = self.view.bounds;

  self.lynxView = lynxView;
  [self.view addSubview:lynxView];

  [self loadBundle];
  [self startHotReload];
}

- (void)loadBundle {
  NSString *url = [NSString
      stringWithFormat:@"%@&timestamp=%f", kDevServerURL, [[NSDate date] timeIntervalSince1970]];
  [self.lynxView loadTemplateFromURL:url initData:nil];
  [self.lynxView triggerLayout];
}

#pragma mark - Hot reload (SSE)

- (void)startHotReload {
  NSURL *url = [NSURL URLWithString:kHotReloadURL];
  NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:url];
  [request setValue:@"text/event-stream" forHTTPHeaderField:@"Accept"];

  self.sseBuffer = [NSMutableData data];
  NSURLSessionConfiguration *config = [NSURLSessionConfiguration defaultSessionConfiguration];
  NSURLSession *session = [NSURLSession sessionWithConfiguration:config
                                                        delegate:self
                                                   delegateQueue:nil];
  self.sseTask = [session dataTaskWithRequest:request];
  [self.sseTask resume];
  NSLog(@"[hot-reload] subscribed to %@", kHotReloadURL);
}

// SSE is a long-lived HTTP stream; dataTask delivers chunks here as they arrive.
- (void)URLSession:(NSURLSession *)session
          dataTask:(NSURLSessionDataTask *)dataTask
    didReceiveData:(NSData *)data {
  [self.sseBuffer appendData:data];
  NSString *content = [[NSString alloc] initWithData:self.sseBuffer encoding:NSUTF8StringEncoding];

  // SSE frames are separated by a blank line (\n\n). Drain complete frames and
  // keep any trailing partial in the buffer for the next chunk.
  NSRange sep = [content rangeOfString:@"\n\n"];
  while (sep.location != NSNotFound) {
    NSString *frame = [content substringToIndex:sep.location];
    content = [content substringFromIndex:sep.location + sep.length];
    if ([frame containsString:@"data: reload"]) {
      NSLog(@"[hot-reload] reload signal — reloading bundle");
      dispatch_async(dispatch_get_main_queue(), ^{ [self loadBundle]; });
    }
    sep = [content rangeOfString:@"\n\n"];
  }
  self.sseBuffer = [[content dataUsingEncoding:NSUTF8StringEncoding] mutableCopy];
}

@end
