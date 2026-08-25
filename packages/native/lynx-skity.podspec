Pod::Spec.new do |s|
  s.name = 'lynx-skity'
  s.version = '0.0.1'
  s.summary = 'Skity GPU rendering for Lynx (iOS)'
  s.homepage = 'https://github.com/lynx-family/lynx'
  s.license = { :type => 'Apache-2.0' }
  s.author = 'Lynx'
  s.source = { :path => '.' }

  s.ios.deployment_target = '13.0'

  # iOS ShadowNode / LynxUI / View / Metal bridge (ios/Classes) + the
  # cross-platform C++ core SkityRenderer (shared/skity) — the same Draw entry
  # point Android reaches via JNI. The podspec lives at the package root so both
  # trees are inside the pod root and CocoaPods compiles them (source_files
  # outside the podspec dir are silently skipped, which is why this can't live
  # under ios/ while referencing ../shared).
  s.source_files = 'ios/Classes/**/*.{h,m,mm}', 'shared/skity/SkityRenderer.{h,cc}',
                   'shared/skity/retained_render_tree.{h,cc}',
                   'shared/skity/node_animation.{h,cc}', 'shared/skity/easing.{h,cc}',
                   'shared/skity/render_cache.{h,cc}', 'shared/skity/render_cache_core.h',
                   'shared/skity/image_store.{h,cc}', 'shared/skity/font_registry.{h,cc}',
                   'shared/skity/base64.{h,cc}', 'shared/skity/typeface_cache.{h,cc}'
  s.public_header_files = 'ios/Classes/**/*.h', 'shared/skity/SkityRenderer.h',
                          'shared/skity/retained_render_tree.h', 'shared/skity/image_store.h',
                          'shared/skity/font_registry.h', 'shared/skity/base64.h',
                          'shared/skity/typeface_cache.h'

  s.dependency 'Lynx'
  s.dependency 'skity', '1.1.0-alpha.3'

  s.ios.frameworks = 'Metal', 'QuartzCore', 'UIKit', 'CoreGraphics'

  # ${PODS_TARGET_SRCROOT} = this pod's source root = the podspec dir
  # (packages/native), so shared/skity and the FlatBuffer stubs resolve.
  # skity's own headers (<skity/skity.hpp>, <skity/gpu/...>) come from the
  # skity pod dependency.
  s.pod_target_xcconfig = {
    'HEADER_SEARCH_PATHS' => [
      '$(inherited)',
      '"${PODS_TARGET_SRCROOT}/shared/skity"',
      '"${PODS_TARGET_SRCROOT}/shared/skity/generated"',
      '"${PODS_TARGET_SRCROOT}/shared/third_party/flatbuffers/include"',
    ].join(' '),
    'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17',
    'CLANG_CXX_LIBRARY' => 'libc++',
  }
end
