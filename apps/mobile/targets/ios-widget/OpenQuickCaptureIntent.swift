import AppIntents
import Foundation

/// What a capture button opens. The raw value is the url path suffix: `kaihuman://quick-<raw>`.
enum QuickCaptureKind: String, AppEnum {
    case todo
    case note
    case log
    case idea
    case knowledge

    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Capture type")
    static let caseDisplayRepresentations: [QuickCaptureKind: DisplayRepresentation] = [
        .todo: DisplayRepresentation(title: "Todo"),
        .note: DisplayRepresentation(title: "Note"),
        .log: DisplayRepresentation(title: "Log"),
        .idea: DisplayRepresentation(title: "Idea"),
        .knowledge: DisplayRepresentation(title: "Knowledge"),
    ]

    var url: String {
        switch self {
        case .todo: return "kaihuman://quick-todo"
        case .note: return "kaihuman://quick-note"
        case .log: return "kaihuman://quick-log"
        case .idea: return "kaihuman://quick-idea"
        case .knowledge: return "kaihuman://quick-knowledge"
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
