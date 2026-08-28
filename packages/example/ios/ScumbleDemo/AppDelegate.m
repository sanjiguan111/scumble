#import "AppDelegate.h"
#import "DemoTemplateProvider.h"
#import "ViewController.h"

#import <Lynx/LynxConfig.h>
#import <Lynx/LynxEnv.h>

@implementation AppDelegate

- (BOOL)application:(UIApplication *)application
    didFinishLaunchingWithOptions:(NSDictionary *)launchOptions {
  [self setupLynxEnv];

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

@end
