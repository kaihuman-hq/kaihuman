import AppIntents
import Foundation

// Siri phrases beyond todos: note, log, search, what's due today. Text entry needs the app, so
// the capture intents open its sheets through `pending-url`, like the widget buttons.

private func openInApp(_ link: String) {
    UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(link, forKey: "pending-url")
}

/// "Add a note in kaihuman".
struct AddNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Add a note"
    static let description = IntentDescription("Opens kaihuman on a new note.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        openInApp(QuickCaptureKind.note.url)
        return .result()
    }
}

/// "Log in kaihuman": the action log entry sheet.
struct AddLogIntent: AppIntent {
    static let title: LocalizedStringResource = "Add a log entry"
    static let description = IntentDescription("Opens kaihuman on a new log entry.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        openInApp(QuickCaptureKind.log.url)
        return .result()
    }
}

/// "Search kaihuman": Siri asks what for (a String cannot sit in an App Shortcut phrase).
struct SearchKaihumanIntent: AppIntent {
    static let title: LocalizedStringResource = "Search kaihuman"
    static let description = IntentDescription("Searches your todos, notes, ideas and wiki.")
    static let openAppWhenRun = true

    @Parameter(title: "Search for", requestValueDialog: "What do you want to find?")
    var query: String

    init() {}

    init(query: String) {
        self.query = query
    }

    static var parameterSummary: some ParameterSummary {
        Summary("Search kaihuman for \(\.$query)")
    }

    static func link(for query: String) -> String {
        var components = URLComponents()
        components.scheme = "kaihuman"
        components.host = "search"
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmed.isEmpty { components.queryItems = [URLQueryItem(name: "q", value: trimmed)] }
        return components.string ?? "kaihuman://search"
    }

    func perform() async throws -> some IntentResult {
        openInApp(Self.link(for: query))
        return .result()
    }
}

/// "What's due today in kaihuman": answered from the cached snapshot, no app launch.
struct DueTodayIntent: AppIntent {
    static let title: LocalizedStringResource = "What's due today"
    static let description = IntentDescription("Tells you which todos are due today.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snapshot = SharedTodoStore.shared.load() else {
            return .result(dialog: "Open kaihuman to sign in first.")
        }
        let due = snapshot.dueByToday(at: Date())
        switch due.count {
        case 0:
            return .result(dialog: "Nothing is due today.")
        case 1:
            return .result(dialog: "One todo is due: \(due[0].text)")
        default:
            let firstThree = due.prefix(3).map(\.text).joined(separator: ", ")
            return .result(dialog: "\(due.count) todos are due. First: \(firstThree)")
        }
    }
}
