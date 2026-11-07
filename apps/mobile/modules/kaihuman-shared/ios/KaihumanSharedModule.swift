import ActivityKit
import ExpoModulesCore
import Foundation
import WidgetKit

// Names must match targets/ios-widget/SharedTodoStore.swift and QuickCaptureTodoIntent.swift.
private let appGroupId = "group.com.kaihuman.app"
private let tokenDefaultsKey = "github-token"
private let pendingUrlKey = "pending-url"

// A copy of targets/ios-widget/FocusActivityAttributes.swift: this pod cannot see the app target's
// sources, and ActivityKit pairs an activity with the widget UI by the attributes type name.
// src/ios-widget.test.ts fails when the two drift apart.
struct FocusActivityAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        var startedAt: Date
        var plannedEnd: Date
    }

    var todoId: String
    var todoText: String
}

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

    // Focus Live Activity. Start is synchronous (Activity.request is); update and end await ActivityKit.

    Function("startFocusActivity") { (todoId: String, todoText: String, minutes: Int) -> String? in
      guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else { return nil }
      let now = Date()
      let state = FocusActivityAttributes.ContentState(
        startedAt: now, plannedEnd: now.addingTimeInterval(Double(max(1, minutes)) * 60)
      )
      do {
        // High relevance keeps the session ahead of other activities on the Lock Screen.
        let activity = try Activity.request(
          attributes: FocusActivityAttributes(todoId: todoId, todoText: todoText),
          content: ActivityContent(state: state, staleDate: nil, relevanceScore: 100),
          pushType: nil
        )
        return activity.id
      } catch {
        return nil
      }
    }

    // Live Activities need no notification permission; present so JS can call it on both platforms.
    AsyncFunction("requestNotificationPermission") { () -> Bool in true }

    AsyncFunction("updateFocusActivity") { (activityId: String, plannedEndMs: Double) in
      guard #available(iOS 16.2, *),
            let activity = Activity<FocusActivityAttributes>.activities.first(where: { $0.id == activityId })
      else { return }
      var state = activity.content.state
      state.plannedEnd = Date(timeIntervalSince1970: plannedEndMs / 1000)
      await activity.update(ActivityContent(state: state, staleDate: nil, relevanceScore: 100))
    }

    AsyncFunction("endFocusActivity") { (activityId: String) in
      guard #available(iOS 16.2, *),
            let activity = Activity<FocusActivityAttributes>.activities.first(where: { $0.id == activityId })
      else { return }
      await activity.end(nil, dismissalPolicy: .immediate)
    }
  }
}
