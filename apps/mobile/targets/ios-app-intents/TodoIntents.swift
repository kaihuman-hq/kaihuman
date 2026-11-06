import AppIntents
import Foundation
import WidgetKit

// Siri / Spotlight / Shortcuts / Action button intents. Compiled into the MAIN APP target only:
// an AppShortcutsProvider outside the app target is ignored by the system.
// They read the same App Group snapshot the widgets use, so they work offline.

/// An open todo, for the "Complete <todo>" parameter.
struct TodoEntity: AppEntity {
    static let typeDisplayRepresentation = TypeDisplayRepresentation(name: "Todo")
    static let defaultQuery = TodoEntityQuery()

    var id: String
    var text: String

    var displayRepresentation: DisplayRepresentation {
        DisplayRepresentation(title: "\(text)")
    }

    init(item: SharedTodoItem) {
        self.id = item.id
        self.text = item.text
    }
}

struct TodoEntityQuery: EntityStringQuery {
    private func openTodos() -> [TodoEntity] {
        (SharedTodoStore.shared.load()?.nextUp ?? []).map { TodoEntity(item: $0) }
    }

    func entities(for identifiers: [String]) async throws -> [TodoEntity] {
        openTodos().filter { identifiers.contains($0.id) }
    }

    func entities(matching string: String) async throws -> [TodoEntity] {
        openTodos().filter { $0.text.localizedCaseInsensitiveContains(string) }
    }

    func suggestedEntities() async throws -> [TodoEntity] {
        Array(openTodos().prefix(25))
    }
}

/// "Add a todo in kaihuman": opens the capture sheet (text input needs the app).
struct AddTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "Add a todo"
    static let description = IntentDescription("Opens kaihuman on a new todo.")
    static let openAppWhenRun = true

    func perform() async throws -> some IntentResult {
        UserDefaults(suiteName: SharedTodoStore.appGroupId)?
            .set(QuickCaptureKind.todo.url, forKey: "pending-url")
        return .result()
    }
}

/// "What's next in kaihuman": answers from the cached snapshot without opening the app.
struct WhatsNextIntent: AppIntent {
    static let title: LocalizedStringResource = "What's next"
    static let description = IntentDescription("Tells you your next todo.")

    func perform() async throws -> some IntentResult & ProvidesDialog {
        guard let snapshot = SharedTodoStore.shared.load() else {
            return .result(dialog: "Open kaihuman to sign in first.")
        }
        guard let next = snapshot.nextUp.first else {
            return .result(dialog: "Inbox zero. Nothing is open.")
        }
        return .result(dialog: "Next up: \(next.text)")
    }
}

/// "Complete <todo> in kaihuman": same path as the widget toggle (cache first, then one GitHub PUT).
struct CompleteTodoIntent: AppIntent {
    static let title: LocalizedStringResource = "Complete a todo"
    static let description = IntentDescription("Marks a kaihuman todo as done.")

    @Parameter(title: "Todo")
    var todo: TodoEntity

    static var parameterSummary: some ParameterSummary {
        Summary("Complete \(\.$todo)")
    }

    init() {}

    init(todo: TodoEntity) {
        self.todo = todo
    }

    func perform() async throws -> some IntentResult & ProvidesDialog {
        let store = SharedTodoStore.shared
        guard let result = store.toggle(itemId: todo.id) else {
            return .result(dialog: "That todo is already done or gone.")
        }
        // Reload before the network call so the widgets reflect it immediately.
        WidgetCenter.shared.reloadAllTimelines()
        await store.push(result, itemId: todo.id)
        return .result(dialog: "Done: \(todo.text)")
    }
}
