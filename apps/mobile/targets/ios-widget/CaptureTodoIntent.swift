import AppIntents
import Foundation
import WidgetKit

/// Adds a todo to the inbox without opening the app (Siri, Shortcuts, Action button). Text input
/// cannot live in a widget, so this is reached through App Shortcuts rather than a widget button.
struct CaptureTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Add to Inbox"
    static var description = IntentDescription("Adds a todo to your Kaihuman inbox without opening the app.")
    static var openAppWhenRun = false

    @Parameter(title: "Todo")
    var text: String

    static var parameterSummary: some ParameterSummary {
        Summary("Add \(\.$text) to inbox")
    }

    init() {}

    init(text: String) {
        self.text = text
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return .result(dialog: "Nothing to add.") }
        let store = SharedTodoStore.shared
        // Nil means the capture could only be queued (no cached inbox file); either way it is saved.
        if let result = store.appendCapture(text: trimmed) {
            WidgetCenter.shared.reloadAllTimelines()
            await store.push(result, message: "widget: capture todo", queueing: .capture(text: trimmed))
        } else {
            WidgetCenter.shared.reloadAllTimelines()
        }
        return .result(dialog: "Added to inbox")
    }
}
