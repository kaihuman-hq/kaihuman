Pod::Spec.new do |s|
  s.name           = 'KaihumanIntelligence'
  s.version        = '0.1.0'
  s.summary        = 'Apple Intelligence and Vision bridge for the kaihuman app'
  s.description    = 'Runs Foundation Models prompts with guided generation and document text recognition.'
  s.license        = 'MIT'
  s.author         = 'kaihuman'
  s.homepage       = 'https://github.com/kaihuman-hq/kaihuman'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/kaihuman-hq/kaihuman.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  # Weak: FoundationModels only exists on iOS 26+, the app still launches on older systems.
  s.weak_frameworks = 'FoundationModels'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
