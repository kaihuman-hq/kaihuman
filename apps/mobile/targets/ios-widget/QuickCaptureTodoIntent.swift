import AppIntents
import Foundation

/// Opens the app; the app reads `pending-url` on launch and routes to `kaihuman://quick-todo`.
struct QuickCaptureTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Quick Todo"
    static var openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?
            .set("kaihuman://quick-todo", forKey: "pending-url")
        return .result()
    }
}
