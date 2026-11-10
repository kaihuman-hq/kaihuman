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
        FocusTimerState.set(activityId: nil)
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

/// Whether a focus session runs, shared by the app module, the intents and the Control Center
/// toggle (which cannot list the app's activities from the widget extension).
enum FocusTimerState {
    static let activityIdKey = "focus-activity-id"
    static let controlKind = "FocusTimerControl"
    /// Same default as FOCUS_MINUTES in src/screens/focus-session.ts.
    static let defaultMinutes = 25

    private static var defaults: UserDefaults? { UserDefaults(suiteName: SharedTodoStore.appGroupId) }

    static var isRunning: Bool { defaults?.string(forKey: activityIdKey) != nil }

    static func set(activityId: String?) {
        if let activityId {
            defaults?.set(activityId, forKey: activityIdKey)
        } else {
            defaults?.removeObject(forKey: activityIdKey)
        }
        if #available(iOS 18.0, *) {
            ControlCenter.shared.reloadControls(ofKind: controlKind)
        }
    }
}

/// Control Center / Lock Screen / Action button toggle: on starts a focus session on the next
/// todo, off ends every running one. Runs in the app process (LiveActivityIntent) so it may
/// request the Live Activity.
struct ToggleFocusTimerIntent: SetValueIntent, LiveActivityIntent {
    static var title: LocalizedStringResource = "Focus Timer"
    static var description = IntentDescription("Starts a focus session on your next todo, or stops it.")

    @Parameter(title: "Running")
    var value: Bool

    init() {}

    func perform() async throws -> some IntentResult {
        if value {
            startOnNextTodo()
        } else {
            for activity in Activity<FocusActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
            FocusTimerState.set(activityId: nil)
        }
        return .result()
    }

    private func startOnNextTodo() {
        guard ActivityAuthorizationInfo().areActivitiesEnabled,
              let next = SharedTodoStore.shared.load()?.nextUp.first
        else {
            FocusTimerState.set(activityId: nil)
            return
        }
        let now = Date()
        let state = FocusActivityAttributes.ContentState(
            startedAt: now,
            plannedEnd: now.addingTimeInterval(Double(FocusTimerState.defaultMinutes) * 60)
        )
        let activity = try? Activity.request(
            attributes: FocusActivityAttributes(todoId: next.id, todoText: next.text),
            content: ActivityContent(state: state, staleDate: nil, relevanceScore: 100),
            pushType: nil
        )
        FocusTimerState.set(activityId: activity?.id)
    }
}
