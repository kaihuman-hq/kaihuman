import AppIntents
import CoreSpotlight
import Foundation

// App-target code that runs at launch and after each Spotlight publish. The Expo module
// (modules/kaihuman-shared, a separate pod) cannot see this target's types, so it finds this
// class by its Objective-C name: NSClassFromString("KaihumanAppLaunchHook") + perform("run").

@objc(KaihumanAppLaunchHook)
final class KaihumanAppLaunchHook: NSObject {
    private static let indexedIdsKey = "indexed-entity-ids"

    /// Refreshes Siri's entity phrase values and the Spotlight entity index from
    /// spotlight-items.json. Cheap enough for launch: one small file, work off the main thread.
    @objc static func run() {
        KaihumanAppShortcuts.updateAppShortcutParameters()
        guard #available(iOS 18.0, *) else { return }
        Task.detached(priority: .utility) { await indexEntities() }
    }

    @available(iOS 18.0, *)
    private static func indexEntities() async {
        let items = KaihumanItemStore.load()
        let defaults = UserDefaults(suiteName: SharedTodoStore.appGroupId)
        let current = Set(items.map(\.id))
        let stale = (defaults?.stringArray(forKey: indexedIdsKey) ?? []).filter { !current.contains($0) }
        let index = CSSearchableIndex.default()
        // indexAppEntities is documented iOS 18 API. deleteAppEntities(identifiedBy:ofType:)
        // is UNVERIFIED (name from WWDC24 notes): check it against the SDK on the first Mac build.
        if !stale.isEmpty {
            try? await index.deleteAppEntities(identifiedBy: stale, ofType: KaihumanItemEntity.self)
        }
        do {
            try await index.indexAppEntities(items)
            defaults?.set(Array(current), forKey: indexedIdsKey)
        } catch {
            // Spotlight is a convenience; the classic CSSearchableItems still cover search.
        }
    }
}
