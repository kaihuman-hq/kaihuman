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
        .result(dialog: await InboxCapture.add(text))
    }
}

/// The one inbox write path for Siri, Shortcuts and Apple Intelligence (CaptureTodoIntent,
/// AddTodoIntent, the reminders schema). A due date cannot be written into the cached inbox file
/// here, so a dated todo goes to the smart-capture queue the app drains (saveCapture adds `::due::`).
enum InboxCapture {
    static func add(_ text: String, due: Date? = nil) async -> IntentDialog {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return "Nothing to add." }
        var line = trimmed
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *), let parsed = await SmartCaptureParser.parse(trimmed, now: Date()) {
            if parsed.kind == "todo" && parsed.due == nil {
                line = parsed.inboxLine
            } else {
                SmartCaptureQueue.append(original: trimmed, parsed)
                return "Saved. kaihuman files it when it opens next."
            }
        }
        #endif
        if let due {
            SmartCaptureQueue.append(
                original: trimmed,
                SmartCapture(kind: "todo", text: line, tags: [], due: dueDay(due))
            )
            return "Saved. kaihuman files it when it opens next."
        }
        let store = SharedTodoStore.shared
        // Nil means the capture could only be queued (no cached inbox file); either way it is saved.
        if let result = store.appendCapture(text: line) {
            WidgetCenter.shared.reloadAllTimelines()
            await store.push(result, message: "widget: capture todo", queueing: .capture(text: line))
        } else {
            WidgetCenter.shared.reloadAllTimelines()
        }
        return "Added to inbox"
    }

    /// `YYYY-MM-DD` in the user's calendar: the date part parseDue (@kaihuman/formats) accepts.
    static func dueDay(_ date: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}
