import AppIntents
import Foundation

/// Settings > Focus > (a Focus) > Add Filter > kaihuman. While that Focus is on, the app and its
/// widgets show only the todos that match; when it ends, the system runs the intent again with the
/// defaults (everything empty), which clears the filter. Lives in the app target, like all
/// intents the system discovers by scanning the app.
struct KaihumanFocusFilter: SetFocusFilterIntent {
    static var title: LocalizedStringResource = "Filter todos"
    static var description: IntentDescription? = IntentDescription(
        "Show only todos with these tags, from one list or one board, while this Focus is on."
    )

    @Parameter(title: "Tags", description: "Comma-separated, e.g. work, urgent. Any of them matches.")
    var tags: String?

    @Parameter(title: "List", description: "The todo file name, e.g. work for work.todos.md.")
    var area: String?

    @Parameter(title: "Board", description: "A milestone id or name.")
    var board: String?

    var displayRepresentation: DisplayRepresentation {
        let filter = Self.filter(tags: tags, area: area, board: board, label: nil)
        let subtitle: LocalizedStringResource = filter.isEmpty ? "Everything" : "\(filter.title)"
        return DisplayRepresentation(title: "Filter todos", subtitle: subtitle)
    }

    func perform() async throws -> some IntentResult {
        SharedTodoStore.shared.saveFocusFilter(Self.filter(tags: tags, area: area, board: board, label: nil))
        return .result()
    }

    /// Splits `work, #urgent` into tags; blank text means no constraint.
    static func filter(tags: String?, area: String?, board: String?, label: String?) -> SharedFocusFilter {
        func clean(_ s: String?) -> String? {
            let t = s?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            return t.isEmpty ? nil : t
        }
        let list = (tags ?? "").split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces).trimmingCharacters(in: CharacterSet(charactersIn: "#")) }
            .filter { !$0.isEmpty }
        return SharedFocusFilter(
            tags: list.isEmpty ? nil : list, area: clean(area), board: clean(board), label: clean(label)
        )
    }
}
