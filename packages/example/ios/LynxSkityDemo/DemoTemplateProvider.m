#import "DemoTemplateProvider.h"

@implementation DemoTemplateProvider

- (void)loadTemplateWithUrl:(NSString *)url onComplete:(LynxTemplateLoadBlock)callback {
  NSString *encodeUrl = [url
      stringByAddingPercentEncodingWithAllowedCharacters:[NSCharacterSet
                                                              URLFragmentAllowedCharacterSet]];
  NSURL *nsUrl = [NSURL URLWithString:encodeUrl];
  NSURLSessionDataTask *task = [[NSURLSession sharedSession]
      dataTaskWithURL:nsUrl
        completionHandler:^(NSData *_Nullable data, NSURLResponse *_Nullable response,
                            NSError *_Nullable error) {
          dispatch_async(dispatch_get_main_queue(), ^{
            if (error) {
              callback(data, error);
            } else if (!data) {
              NSMutableDictionary *details = [NSMutableDictionary new];
              NSString *errorMsg = [NSString stringWithFormat:@"data from %@ is nil!", url];
              [details setObject:errorMsg forKey:NSLocalizedDescriptionKey];
              NSError *dataError =
                  [NSError errorWithDomain:@"com.skity.example" code:200 userInfo:details];
              callback(nil, dataError);
            } else {
              callback(data, nil);
            }
          });
        }];
  [task resume];
}

@end
