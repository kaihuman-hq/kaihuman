import CoreSpotlight
import ExpoModulesCore
import UIKit

// Home-screen quick actions (UIApplicationShortcutItems, set by plugins/with-kaihuman-widgets.ts)
// and Core Spotlight taps. Both carry a kaihuman:// deep link, routed like any other link.
private let appGroupId =
  Bundle.main.object(forInfoDictionaryKey: "KHAppGroup") as? String ?? "group.com.kaihuman.app"
private let pendingUrlKey = "pending-url"

/// Runs KaihumanAppLaunchHook.run() from the app target (targets/ios-app-intents/AppLaunchHook.swift):
/// entity indexing needs the entity type, which this pod cannot see. No-op if the class is absent.
func runAppLaunchHook() {
  guard let hook = NSClassFromString("KaihumanAppLaunchHook") as AnyObject?,
        hook.responds(to: NSSelectorFromString("run"))
  else { return }
  _ = hook.perform(NSSelectorFromString("run"))
}

public class KaihumanAppDelegate: ExpoAppDelegateSubscriber {
  /// The item the app was cold-launched with; iOS also passes it to performActionFor afterwards.
  private var launchShortcutType: String?

  /// Running app: open the link (RN Linking gets a `url` event). Not active yet: leave it in
  /// `pending-url`, which JS reads on start and on every foreground.
  private func deliver(_ link: String) {
    guard link.hasPrefix("kaihuman://"), let url = URL(string: link) else { return }
    if UIApplication.shared.applicationState == .active {
      UIApplication.shared.open(url)
    } else {
      UserDefaults(suiteName: appGroupId)?.set(link, forKey: pendingUrlKey)
    }
  }

  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    if let item = launchOptions?[.shortcutItem] as? UIApplicationShortcutItem {
      launchShortcutType = item.type
      UserDefaults(suiteName: appGroupId)?.set(item.type, forKey: pendingUrlKey)
    }
    runAppLaunchHook()
    return true
  }

  public func application(
    _ application: UIApplication,
    performActionFor shortcutItem: UIApplicationShortcutItem,
    completionHandler: @escaping (Bool) -> Void
  ) {
    if launchShortcutType == shortcutItem.type {
      launchShortcutType = nil // already queued at launch
    } else {
      deliver(shortcutItem.type)
    }
    completionHandler(true)
  }

  public func application(
    _ application: UIApplication,
    continue userActivity: NSUserActivity,
    restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void
  ) -> Bool {
    guard userActivity.activityType == CSSearchableItemActionType,
          let link = userActivity.userInfo?[CSSearchableItemActivityIdentifier] as? String
    else { return false }
    deliver(link)
    return true
  }
}
