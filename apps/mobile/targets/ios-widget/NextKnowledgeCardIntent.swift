import AppIntents
import WidgetKit

/// "Next" on the knowledge card: no network, only an offset the next timeline adds to the rotation.
struct NextKnowledgeCardIntent: AppIntent {
    static var title: LocalizedStringResource = "Next Card"
    static var description = IntentDescription("Shows another knowledge card.")

    static let widgetKind = "KnowledgeCardWidget"

    init() {}

    func perform() async throws -> some IntentResult {
        SharedTodoStore.shared.advanceCardOffset()
        WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
        return .result()
    }
}
