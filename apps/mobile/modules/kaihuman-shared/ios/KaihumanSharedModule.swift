import ActivityKit
import CoreSpotlight
import ExpoModulesCore
import Foundation
import UniformTypeIdentifiers
import WidgetKit

// Names must match targets/ios-widget/SharedTodoStore.swift and QuickCaptureTodoIntent.swift.
private let appGroupId =
  Bundle.main.object(forInfoDictionaryKey: "KHAppGroup") as? String ?? "group.com.kaihuman.app"
private let tokenDefaultsKey = "github-token"
private let pendingUrlKey = "pending-url"
// Names must match FocusTimerState in targets/ios-widget/FocusIntents.swift.
private let focusActivityIdKey = "focus-activity-id"
private let focusControlKind = "FocusTimerControl"
private let spotlightDomains = ["kaihuman.todo", "kaihuman.note"]

/// One row of spotlight-items.json (src/spotlight/spotlight.ts). `id` is the deep link.
private struct SpotlightRow: Decodable {
    var id: String
    var kind: String
    var title: String
    var subtitle: String?
}

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

  /// Mirrors the running session for the Control Center focus toggle.
  private func setFocusActivity(_ id: String?) {
    if let id {
      defaults?.set(id, forKey: focusActivityIdKey)
    } else {
      defaults?.removeObject(forKey: focusActivityIdKey)
    }
    if #available(iOS 18.0, *) {
      ControlCenter.shared.reloadControls(ofKind: focusControlKind)
    }
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
        self.setFocusActivity(activity.id)
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
      else {
        self.setFocusActivity(nil)
        return
      }
      await activity.end(nil, dismissalPolicy: .immediate)
      self.setFocusActivity(nil)
    }

    // Replaces our Core Spotlight items. Tapping one opens its deep link (KaihumanAppDelegate.swift).
    Function("indexSpotlight") { (json: String) in
      guard let data = json.data(using: .utf8),
            let rows = try? JSONDecoder().decode([SpotlightRow].self, from: data)
      else { return }
      let items = rows.map { row -> CSSearchableItem in
        let attributes = CSSearchableItemAttributeSet(contentType: UTType.text)
        attributes.title = row.title
        attributes.contentDescription = row.subtitle
        return CSSearchableItem(
          uniqueIdentifier: row.id, domainIdentifier: "kaihuman.\(row.kind)", attributeSet: attributes
        )
      }
      let index = CSSearchableIndex.default()
      index.deleteSearchableItems(withDomainIdentifiers: spotlightDomains) { _ in
        index.indexSearchableItems(items)
      }
    }
  }
}
