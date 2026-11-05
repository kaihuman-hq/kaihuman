import AppIntents
import WidgetKit

struct ToggleTodoIntent: AppIntent {
    static var title: LocalizedStringResource = "Complete Todo"
    static var description = IntentDescription("Marks a Kaihuman todo as done.")

    @Parameter(title: "Todo ID")
    var itemId: String

    init() {}

    init(itemId: String) {
        self.itemId = itemId
    }

    func perform() async throws -> some IntentResult {
        let store = SharedTodoStore.shared
        guard let result = store.toggle(itemId: itemId) else { return .result() }
        // Reload before the network call so the widget reflects the tap immediately.
        WidgetCenter.shared.reloadAllTimelines()
        await store.push(result, itemId: itemId)
        return .result()
    }
}
