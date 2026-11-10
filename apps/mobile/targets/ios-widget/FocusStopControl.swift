import AppIntents
import SwiftUI
import WidgetKit

/// Stop button for the focus session. Pick it for the Action button (Settings > Action Button >
/// Controls) or add it to Control Center / the Lock Screen. On watchOS 26 a control on the paired
/// iPhone runs its action here; a native Watch control target is a documented next step.
@available(iOS 18.0, *)
struct StopFocusControl: ControlWidget {
    static let kind = "StopFocusControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: StopFocusIntent()) {
                Label("Stop focus", systemImage: "stop.circle")
            }
        }
        .displayName("Stop focus")
        .description("Ends the running focus session.")
    }
}
