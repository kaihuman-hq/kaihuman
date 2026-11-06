import AppIntents
import WidgetKit

/// The "Start" button on board rows: backlog -> in progress, committed like a toggle.
struct StartTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Start Todo"
    static var description = IntentDescription("Moves a Kaihuman todo to in progress.")

    @Parameter(title: "Todo ID")
    var itemId: String

    init() {}

    init(itemId: String) {
        self.itemId = itemId
    }

    func perform() async throws -> some IntentResult {
        let store = SharedTodoStore.shared
        guard let result = store.move(itemId: itemId, to: .inProgress) else { return .result() }
        // Reload before the network call so the widget reflects the tap immediately.
        WidgetCenter.shared.reloadAllTimelines()
        await store.push(
            result, message: "widget: start todo", queueing: .move(itemId: itemId, status: .inProgress)
        )
        return .result()
    }
}
