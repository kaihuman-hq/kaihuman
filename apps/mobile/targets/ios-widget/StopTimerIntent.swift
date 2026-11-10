import AppIntents
import WidgetKit

/// ■ on the timer widget. Time-tracking CSVs are not in the snapshot, so this stops the timer in
/// the snapshot at once and queues a `timer-stop` for the app, which closes the interval at the
/// tap's time when it replays the queue (widget-bridge.ts).
struct StopTimerIntent: AppIntent {
    static var title: LocalizedStringResource = "Stop Timer"
    static var description = IntentDescription("Stops the running Kaihuman timer.")

    static let widgetKind = "TimerWidget"

    @Parameter(title: "Timer path")
    var path: String

    init() {}

    init(path: String) {
        self.path = path
    }

    func perform() async throws -> some IntentResult {
        if SharedTodoStore.shared.stopTimer(path: path) {
            WidgetCenter.shared.reloadTimelines(ofKind: Self.widgetKind)
        }
        return .result()
    }
}

extension SharedTodoStore {
    /// False when no snapshot, another timer, or it is not running (a stale tap is a no-op).
    @discardableResult
    func stopTimer(path: String, now: Date = Date()) -> Bool {
        guard var snapshot = load(), var timer = snapshot.timer, timer.path == path,
              let started = timer.startedAt, timer.pending != true else { return false }
        let millis = PendingWidgetMutation.millis(now)
        timer.todayMinutes += max(0, Int((millis - started) / 60_000))
        timer.startedAt = nil
        timer.pending = true
        snapshot.timer = timer
        snapshot.updatedAt = millis
        save(snapshot)
        queue(.timerStop(path: path, now: now))
        return true
    }
}
