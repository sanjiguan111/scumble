#import "ViewController.h"

#import <Lynx/LynxEnv.h>

static NSString *const kDevServerURL = @"http://localhost:3000/main.lynx.bundle?enable_napi_addon=1";

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
}

- (void)loadBundle {
  NSString *url = [NSString
      stringWithFormat:@"%@?timestamp=%f", kDevServerURL, [[NSDate date] timeIntervalSince1970]];
  [self.lynxView loadTemplateFromURL:url initData:nil];
  [self.lynxView triggerLayout];
}

@end
