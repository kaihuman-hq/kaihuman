import ExpoModulesCore
import Foundation
import WidgetKit

// Names must match targets/ios-widget/SharedTodoStore.swift and QuickCaptureTodoIntent.swift.
private let appGroupId = "group.com.kaihuman.app"
private let tokenDefaultsKey = "github-token"
private let pendingUrlKey = "pending-url"

public class KaihumanSharedModule: Module {
  private var containerURL: URL? {
    FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
  }

  private var defaults: UserDefaults? {
    UserDefaults(suiteName: appGroupId)
  }

  public func definition() -> ModuleDefinition {
    Name("KaihumanShared")

    Function("readSharedFile") { (name: String) -> String? in
      guard let url = self.containerURL?.appendingPathComponent(name) else { return nil }
      return try? String(contentsOf: url, encoding: .utf8)
    }

    Function("writeSharedFile") { (name: String, content: String) in
      guard let url = self.containerURL?.appendingPathComponent(name) else { return }
      try content.write(to: url, atomically: true, encoding: .utf8)
    }

    Function("reloadWidgets") {
      WidgetCenter.shared.reloadAllTimelines()
    }

    // The Keychain copy is written from JS via expo-secure-store; this is the widgets' fallback.
    Function("setSharedToken") { (token: String?) in
      if let token {
        self.defaults?.set(token, forKey: tokenDefaultsKey)
      } else {
        self.defaults?.removeObject(forKey: tokenDefaultsKey)
      }
    }

    Function("consumePendingUrl") { () -> String? in
      guard let defaults = self.defaults, let url = defaults.string(forKey: pendingUrlKey) else {
        return nil
      }
      defaults.removeObject(forKey: pendingUrlKey)
      return url
    }
  }
}
