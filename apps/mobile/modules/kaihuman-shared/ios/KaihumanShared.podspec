Pod::Spec.new do |s|
  s.name           = 'KaihumanShared'
  s.version        = '0.1.0'
  s.summary        = 'App Group bridge between the kaihuman app and its widgets'
  s.description    = 'Reads and writes App Group files, mirrors the GitHub token and reloads widget timelines.'
  s.license        = 'MIT'
  s.author         = 'kaihuman'
  s.homepage       = 'https://github.com/kaihuman-hq/kaihuman'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/kaihuman-hq/kaihuman.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
