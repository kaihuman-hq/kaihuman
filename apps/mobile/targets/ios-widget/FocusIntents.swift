import ActivityKit
import AppIntents
import Foundation
import WidgetKit

/// Live Activity buttons run in the app process (iOS 17 LiveActivityIntent), so these compile into
/// the app target as well as the widget extension.
private func focusActivities(id: String, todoId: String) -> [Activity<FocusActivityAttributes>] {
    Activity<FocusActivityAttributes>.activities.filter {
        (!id.isEmpty && $0.id == id) || $0.attributes.todoId == todoId
    }
}

/// Done: completes the todo (cache + one GitHub PUT, like the widget toggle) and ends the activity.
struct FocusDoneIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Finish Focus"
    static var description = IntentDescription("Completes the todo and ends the focus session.")

    @Parameter(title: "Todo ID")
    var todoId: String

    @Parameter(title: "Activity ID", default: "")
    var activityId: String

    init() {}

    init(todoId: String, activityId: String = "") {
        self.todoId = todoId
        self.activityId = activityId
    }

    func perform() async throws -> some IntentResult {
        let store = SharedTodoStore.shared
        if let result = store.toggle(itemId: todoId) {
            WidgetCenter.shared.reloadAllTimelines()
            await store.push(result, itemId: todoId)
        }
        for activity in focusActivities(id: activityId, todoId: todoId) {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        return .result()
    }
}

/// +5m: moves the planned end; the countdown text follows without further updates.
struct FocusExtendIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Extend Focus"
    static var description = IntentDescription("Adds five minutes to the focus session.")

    static let extensionSeconds: TimeInterval = 5 * 60

    @Parameter(title: "Todo ID")
    var todoId: String

    @Parameter(title: "Activity ID", default: "")
    var activityId: String

    init() {}

    init(todoId: String, activityId: String = "") {
        self.todoId = todoId
        self.activityId = activityId
    }

    func perform() async throws -> some IntentResult {
        for activity in focusActivities(id: activityId, todoId: todoId) {
            var state = activity.content.state
            // An already-finished session restarts the five minutes from now, not from the past.
            state.plannedEnd = max(state.plannedEnd, Date()).addingTimeInterval(Self.extensionSeconds)
            await activity.update(ActivityContent(state: state, staleDate: nil, relevanceScore: 100))
        }
        return .result()
    }
}
