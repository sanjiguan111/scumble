#import "AppDelegate.h"
#import "DemoTemplateProvider.h"
#import "ViewController.h"

#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>
#ifdef DEBUG
#import <Lynx/DevToolSettings.h>
#import <Lynx/LynxServiceDevToolProtocol.h>
#import <LynxServiceAPI/ServiceAPI.h>
#endif

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  [self setupLynxEnv];
#ifdef DEBUG
  [self setupLynxDevTool];
#endif

  self.window = [[UIWindow alloc] initWithFrame:[UIScreen mainScreen].bounds];
  ViewController *vc = [[ViewController alloc] init];
  self.window.rootViewController = vc;
  [self.window makeKeyAndVisible];
  return YES;
}

#pragma mark - Lynx Env Setup

- (void)setupLynxEnv {
  LynxEnv *env = [LynxEnv sharedInstance];
  [env setLynxDebugEnabled:YES];

  LynxConfig *globalConfig = [[LynxConfig alloc] initWithProvider:[DemoTemplateProvider new]];
  [env prepareConfig:globalConfig];
}

#ifdef DEBUG
// Lynx DevTool enablement (docs describe the 4.1 API; the 4.0.2 pods ship
// DevToolSettings switches directly and vend the service via
// LYNX_SERVICE_GET — see Pods headers, verified against LynxDevtool 4.0.2).
- (void)setupLynxDevTool {
  DevToolSettings *settings = [DevToolSettings sharedInstance];
  settings.devToolEnabled = YES;
  settings.logBoxEnabled = YES;
  settings.longPressMenuEnabled = YES;

  // Session debugging: required for the Lynx DevTool desktop connection.
  [LYNX_SERVICE_GET(LynxServiceDevToolProtocol) enableAllSessions];
}
#endif

@end
