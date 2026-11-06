import AppIntents
import WidgetKit

/// A choice in the Next up picker. Built from the cached snapshot, so it works offline.
struct TodoSourceEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Source")
    static let defaultQuery = TodoSourceQuery()

    var id: String
    var title: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(title)")
    }

    var filter: TodoSourceFilter { TodoSourceFilter(id: id) ?? .all }

    static let all = TodoSourceEntity(id: "all", title: "All open todos")

    static func options(from snapshot: SharedTodoSnapshot?) -> [TodoSourceEntity] {
        var result = [
            all,
            TodoSourceEntity(id: "column:inbox", title: "Inbox"),
            TodoSourceEntity(id: "column:in-progress", title: "In progress"),
            TodoSourceEntity(id: "column:backlog", title: "Backlog"),
        ]
        guard let snapshot else { return result }
        result += snapshot.allTags.map { TodoSourceEntity(id: "tag:\($0)", title: "#\($0)") }
        result += (snapshot.milestones ?? []).map {
            TodoSourceEntity(id: "milestone:\($0.id)", title: $0.name)
        }
        return result
    }
}

struct TodoSourceQuery: EntityQuery {
    func entities(for identifiers: [String]) async throws -> [TodoSourceEntity] {
        let options = TodoSourceEntity.options(from: SharedTodoStore.shared.load())
        // A tag or milestone that has since vanished keeps resolving, so the widget shows an empty
        // state instead of silently falling back to "all".
        return identifiers.compactMap { id in
            options.first { $0.id == id }
                ?? TodoSourceFilter(id: id).map { _ in TodoSourceEntity(id: id, title: id) }
        }
    }

    func suggestedEntities() async throws -> [TodoSourceEntity] {
        TodoSourceEntity.options(from: SharedTodoStore.shared.load())
    }
}

struct NextUpConfigurationIntent: WidgetConfigurationIntent {
    static let title: LocalizedStringResource = "Next up"
    static let description = IntentDescription("Choose which todos to show.")

    @Parameter(title: "Source")
    var source: TodoSourceEntity?

    init() {}

    init(source: TodoSourceEntity?) {
        self.source = source
    }

    var filter: TodoSourceFilter { source?.filter ?? .all }
}
