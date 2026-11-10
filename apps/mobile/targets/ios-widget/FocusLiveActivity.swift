import ActivityKit
import AppIntents
import SwiftUI
import WidgetKit

/// Focus session on the Lock Screen, StandBy and Dynamic Island. The countdown is a system timer
/// (`Text(timerInterval:)`), so the activity needs no updates while it runs.
///
/// The `.small` activity family shows it in the Apple Watch Smart Stack, the macOS 26 menu bar and
/// CarPlay. iOS 18+ only: a plain iOS 17 variant needs an if/else in the widget bundle, which
/// `WidgetBundleBuilder` cannot express.
@available(iOS 18.0, *)
struct FocusLiveActivityFamilies: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            FocusActivityContent(context: context)
        } dynamicIsland: { context in
            FocusActivityUI.island(context)
        }
        .supplementalActivityFamilies([.small])
    }
}

/// Lock Screen / StandBy / banner content plus, on iOS 18, the small family.
struct FocusActivityContent: View {
    let context: ActivityViewContext<FocusActivityAttributes>

    var body: some View {
        Group {
            if #available(iOS 18.0, *) {
                FocusFamilyView(attributes: context.attributes, state: context.state, activityId: context.activityID)
            } else {
                FocusLockScreenView(
                    attributes: context.attributes, state: context.state, activityId: context.activityID
                )
            }
        }
        .activityBackgroundTint(FocusStyle.theme.background)
        .activitySystemActionForegroundColor(WidgetTheme.volt)
    }
}

@available(iOS 18.0, *)
struct FocusFamilyView: View {
    @Environment(\.activityFamily) private var family
    let attributes: FocusActivityAttributes
    let state: FocusActivityAttributes.ContentState
    var activityId = ""

    var body: some View {
        switch family {
        case .small: FocusSmallView(attributes: attributes, state: state)
        default: FocusLockScreenView(attributes: attributes, state: state, activityId: activityId)
        }
    }
}

enum FocusActivityUI {
    /// Expanded: icon, title and countdown with Done / +5m. Compact and minimal are what the system
    /// shows on the iOS 27 landscape island too, so they stay one icon and a short countdown.
    static func island(_ context: ActivityViewContext<FocusActivityAttributes>) -> DynamicIsland {
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

/// Watch Smart Stack, Mac menu bar and CarPlay Dashboard: no buttons (CarPlay is view-only and the
/// Watch routes taps to the phone), just what is being done and the countdown.
struct FocusSmallView: View {
    let attributes: FocusActivityAttributes
    let state: FocusActivityAttributes.ContentState

    var body: some View {
        let theme = FocusStyle.theme
        HStack(spacing: 8) {
            Image(systemName: "scope").foregroundStyle(theme.accent)
            Text(attributes.todoText)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(theme.label)
                .lineLimit(1)
                .privacySensitive()
            Spacer(minLength: 4)
            FocusTimerText(state: state, size: 17)
                .frame(maxWidth: 64, alignment: .trailing)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
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

@available(iOS 18.0, *)
#Preview("Lock Screen", as: .content, using: FocusActivityAttributes.preview) {
    FocusLiveActivityFamilies()
} contentStates: {
    FocusActivityAttributes.ContentState.preview
}

@available(iOS 18.0, *)
#Preview("Expanded", as: .dynamicIsland(.expanded), using: FocusActivityAttributes.preview) {
    FocusLiveActivityFamilies()
} contentStates: {
    FocusActivityAttributes.ContentState.preview
}

@available(iOS 18.0, *)
#Preview("Small family", as: .content, using: FocusActivityAttributes.preview) {
    FocusLiveActivityFamilies()
} contentStates: {
    FocusActivityAttributes.ContentState.preview
}
