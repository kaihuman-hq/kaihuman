import ActivityKit
import AppIntents
import Foundation
import WidgetKit

/// Ends every running focus session. Backs the Stop Focus control (Action button, Control Center,
/// Lock Screen, and the Watch/Mac mirrors of those controls); a LiveActivityIntent so it runs in
/// the app process, which owns the activities. Unlike the Focus timer toggle it only ever stops,
/// so assigning it to the Action button cannot start a session by mistake.
struct StopFocusIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Stop Focus"
    static var description = IntentDescription("Ends the running focus session.")

    init() {}

    func perform() async throws -> some IntentResult {
        for activity in Activity<FocusActivityAttributes>.activities {
            await activity.end(nil, dismissalPolicy: .immediate)
        }
        FocusTimerState.set(activityId: nil)
        return .result()
    }
}
