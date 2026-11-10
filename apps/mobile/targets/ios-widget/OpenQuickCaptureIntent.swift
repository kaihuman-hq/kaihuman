import AppIntents
import Foundation

/// What a capture button opens. The raw value is the url path suffix: `kaihuman://quick-<raw>`.
enum QuickCaptureKind: String, AppEnum {
    case todo
    case note
    case log
    case idea
    case knowledge
    /// The one-field sheet that adds a plain todo to the inbox (widget "+", quick-add widget).
    case inbox

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Capture type")
    static let caseDisplayRepresentations: [QuickCaptureKind: DisplayRepresentation] = [
        .todo: DisplayRepresentation(title: "Todo"),
        .note: DisplayRepresentation(title: "Note"),
        .log: DisplayRepresentation(title: "Log"),
        .idea: DisplayRepresentation(title: "Idea"),
        .knowledge: DisplayRepresentation(title: "Knowledge"),
        .inbox: DisplayRepresentation(title: "Inbox"),
    ]

    var url: String {
        switch self {
        case .todo: return "kaihuman://quick-todo"
        case .note: return "kaihuman://quick-note"
        case .log: return "kaihuman://quick-log"
        case .idea: return "kaihuman://quick-idea"
        case .knowledge: return "kaihuman://quick-knowledge"
        case .inbox: return "kaihuman://quick-inbox"
        }
    }
}

/// Opens the app; the app reads `pending-url` on launch and routes to the capture sheet.
struct OpenQuickCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "Quick Capture"
    static let openAppWhenRun = true

    @Parameter(title: "Type", default: .todo)
    var kind: QuickCaptureKind

    init() {}

    init(kind: QuickCaptureKind) {
        self.kind = kind
    }

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(kind.url, forKey: "pending-url")
        return .result()
    }
}

/// Opens quick-log for one idea (the idea pipeline's "Log" button). The slug rides along as a query
/// parameter on the same `quick-log` route the other capture buttons use.
struct OpenIdeaLogIntent: AppIntent {
    static let title: LocalizedStringResource = "Log Idea"
    static let openAppWhenRun = true

    @Parameter(title: "Idea slug")
    var slug: String

    init() {}

    init(slug: String) {
        self.slug = slug
    }

    func perform() async throws -> some IntentResult {
        let encoded = slug.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? slug
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?
            .set("kaihuman://quick-log?idea=\(encoded)", forKey: "pending-url")
        return .result()
    }
}

/// App screens that are not capture sheets: Control Center "Capture", Siri "Today", search.
enum KaihumanDestination: String, AppEnum {
    case capture
    case today
    case search

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Screen")
    static let caseDisplayRepresentations: [KaihumanDestination: DisplayRepresentation] = [
        .capture: DisplayRepresentation(title: "Capture"),
        .today: DisplayRepresentation(title: "Today"),
        .search: DisplayRepresentation(title: "Search"),
    ]

    var url: String { "kaihuman://\(rawValue)" }
}

/// Opens the app on one screen through the same `pending-url` hand-off as the capture buttons.
struct OpenDestinationIntent: AppIntent {
    static let title: LocalizedStringResource = "Open kaihuman"
    static let openAppWhenRun = true

    @Parameter(title: "Screen", default: .today)
    var destination: KaihumanDestination

    init() {}

    init(destination: KaihumanDestination) {
        self.destination = destination
    }

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?.set(destination.url, forKey: "pending-url")
        return .result()
    }
}
