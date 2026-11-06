import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Focus session on the Lock Screen, StandBy and Dynamic Island. The countdown is a system timer
/// (`Text(timerInterval:)`), so the activity needs no updates while it runs.
struct FocusLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            FocusLockScreenView(
                attributes: context.attributes, state: context.state, activityId: context.activityID
            )
            .activityBackgroundTint(FocusStyle.theme.background)
            .activitySystemActionForegroundColor(WidgetTheme.volt)
        } dynamicIsland: { context in
            let theme = FocusStyle.theme
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "scope")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(theme.accent)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusTimerText(state: context.state, size: 24)
                        .frame(maxWidth: 90, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(context.attributes.todoText)
                        .font(.system(size: 14, weight: .semibold))
                        .lineLimit(2)
                        .privacySensitive()
                }
                DynamicIslandExpandedRegion(.bottom) {
                    FocusButtons(
                        todoId: context.attributes.todoId, activityId: context.activityID, theme: theme
                    )
                }
            } compactLeading: {
                Image(systemName: "scope").foregroundStyle(theme.accent)
            } compactTrailing: {
                FocusTimerText(state: context.state, size: 13)
                    .frame(maxWidth: 48)
            } minimal: {
                Image(systemName: "scope").foregroundStyle(theme.accent)
            }
            .keylineTint(WidgetTheme.volt)
        }
    }
}

enum FocusStyle {
    /// The activity always sits on a dark Ink surface, whatever the system appearance.
    static let theme = WidgetTheme.make(colorScheme: .dark, tinted: false)
}

/// Counts down to `plannedEnd` and stays at 0:00 once it passes (the range must not be reversed).
struct FocusTimerText: View {
    let state: FocusActivityAttributes.ContentState
    var size: CGFloat

    var body: some View {
        Text(timerInterval: state.startedAt...max(state.startedAt, state.plannedEnd), countsDown: true)
            .font(WidgetTheme.number(size))
            .foregroundStyle(FocusStyle.theme.accent)
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

/// Done and +5m. LiveActivityIntent buttons run in the app process.
struct FocusButtons: View {
    let todoId: String
    let activityId: String
    let theme: WidgetTheme

    var body: some View {
        HStack(spacing: 8) {
            Button(intent: FocusDoneIntent(todoId: todoId, activityId: activityId)) {
                Label("Done", systemImage: "checkmark")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(theme.onFill)
                    .frame(maxWidth: .infinity, minHeight: 34)
                    .background(Capsule().fill(theme.fill))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
            Button(intent: FocusExtendIntent(todoId: todoId, activityId: activityId)) {
                Text("+5m")
                    .font(.system(size: 13, weight: .semibold, design: .monospaced))
                    .foregroundStyle(theme.label)
                    .frame(maxWidth: .infinity, minHeight: 34)
                    .background(Capsule().fill(theme.button))
                    .contentShape(Capsule())
            }
            .buttonStyle(.plain)
        }
    }
}

/// Lock Screen / StandBy / notification banner layout. Plain inputs, no Environment, so the CI
/// harness can render it without ActivityKit.
struct FocusLockScreenView: View {
    let attributes: FocusActivityAttributes
    let state: FocusActivityAttributes.ContentState
    var activityId = ""

    var body: some View {
        let theme = FocusStyle.theme
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Image(systemName: "scope").foregroundStyle(theme.accent)
                Text("FOCUS")
                    .font(.system(size: 11, weight: .bold))
                    .tracking(0.8)
                    .foregroundStyle(theme.accent)
                Spacer(minLength: 8)
                FocusTimerText(state: state, size: 28)
                    .frame(maxWidth: 110, alignment: .trailing)
            }
            Text(attributes.todoText)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(theme.label)
                .lineLimit(2)
                .privacySensitive()
            FocusButtons(todoId: attributes.todoId, activityId: activityId, theme: theme)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

extension FocusActivityAttributes {
    static let preview = FocusActivityAttributes(todoId: ".kh/backlog.todos.md#0", todoText: "Ship widget sync v2")
}

extension FocusActivityAttributes.ContentState {
    static var preview: FocusActivityAttributes.ContentState {
        let now = Date()
        return .init(startedAt: now.addingTimeInterval(-10 * 60), plannedEnd: now.addingTimeInterval(15 * 60))
    }
}

#Preview("Lock Screen", as: .content, using: FocusActivityAttributes.preview) {
    FocusLiveActivity()
} contentStates: {
    FocusActivityAttributes.ContentState.preview
}

#Preview("Expanded", as: .dynamicIsland(.expanded), using: FocusActivityAttributes.preview) {
    FocusLiveActivity()
} contentStates: {
    FocusActivityAttributes.ContentState.preview
}
