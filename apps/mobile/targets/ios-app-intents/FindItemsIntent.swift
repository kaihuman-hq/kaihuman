import AppIntents
import Foundation

// Open-ended queries ("what did I log about the trip last week"): Apple Intelligence Siri and
// Shortcuts fill any of the parameters. Not an App Shortcut, so the 10-phrase cap is untouched.

/// Finds todos, notes and log entries by words, kind and day range, without opening the app.
struct FindItemsIntent: AppIntent {
    static let title: LocalizedStringResource = "Find kaihuman items"
    static let description = IntentDescription(
        "Finds your todos, notes and log entries by words, kind and date."
    )

    @Parameter(title: "Containing")
    var text: String?

    @Parameter(title: "Kind")
    var kind: KaihumanItemKind?

    @Parameter(title: "From")
    var from: Date?

    @Parameter(title: "To")
    var to: Date?

    init() {}

    static var parameterSummary: some ParameterSummary {
        Summary("Find \(\.$kind) containing \(\.$text) from \(\.$from) to \(\.$to)")
    }

    func perform() async throws -> some IntentResult & ReturnsValue<[KaihumanItemEntity]> & ProvidesDialog {
        let found = Array(
            KaihumanItemStore.find(
                text: text,
                kind: kind,
                from: from.map { KaihumanItemStore.day($0) },
                to: to.map { KaihumanItemStore.day($0) },
                in: KaihumanItemStore.load()
            ).prefix(25)
        )
        guard let first = found.first else {
            return .result(value: found, dialog: "Nothing found.")
        }
        let dialog: IntentDialog = found.count == 1
            ? "Found one: \(first.title)"
            : "Found \(found.count). First: \(first.title)"
        return .result(value: found, dialog: dialog)
    }
}
