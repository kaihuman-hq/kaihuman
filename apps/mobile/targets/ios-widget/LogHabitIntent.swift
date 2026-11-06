import AppIntents
import WidgetKit

/// "Log" on a habit row. Habit CSVs are not in the snapshot, so this only marks today done locally
/// and queues the check-in for the app to commit.
struct LogHabitIntent: AppIntent {
    static var title: LocalizedStringResource = "Log Habit"
    static var description = IntentDescription("Checks in a Kaihuman habit for today.")

    static let widgetKind = "HabitsWidget"

    @Parameter(title: "Habit path")
    var path: String

    init() {}

    init(path: String) {
        self.path = path
    }

    func perform() async throws -> some IntentResult {
        if SharedTodoStore.shared.checkInHabit(path: path) {
            WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
        }
        return .result()
    }
}
