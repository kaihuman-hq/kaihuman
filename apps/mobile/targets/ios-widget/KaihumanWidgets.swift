import SwiftUI
import WidgetKit

/// Today (was Next up). The kind string predates the restyle and stays so already-placed widgets survive.
struct InboxTodoWidget: Widget {
    let kind = "InboxTodoWidget"

    var body: some WidgetConfiguration {
        AppIntentConfiguration(kind: kind, intent: NextUpConfigurationIntent.self, provider: NextUpProvider()) { entry in
            NextUpEntryView(entry: entry)
                .modifier(KaihumanBackground())
        }
        .configurationDisplayName("Today")
        .description("Today's todos: overdue, in progress and due today. Tap a circle to complete one.")
        .supportedFamilies([
            .systemSmall, .systemMedium, .systemLarge,
            .accessoryCircular, .accessoryRectangular, .accessoryInline,
        ])
    }
}

@main
struct KaihumanWidgets: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        InboxTodoWidget()
        QuickCaptureWidget()
        QuickAddWidget()
        WeeklyDoneWidget()
        InboxCountWidget()
        // Nested so the builder never sees more than ten children (older SDKs cap buildBlock).
        KaihumanV2Widgets().body
        // ControlWidget needs the iOS 18 SDK runtime; the extension itself deploys to 17.0.
        if #available(iOS 18.0, *) {
            NewTodoControl()
            NewNoteControl()
            NewLogControl()
            NewIdeaControl()
            AddToInboxControl()
            CaptureControl()
            FocusTimerControl()
            StopFocusControl()
            // Live Activity with the iOS 18 `.small` family (Watch, CarPlay, Mac). iOS 17 has no Live
            // Activity: the builder has no if/else, and a negative availability check crashed swiftc.
            FocusLiveActivityFamilies()
        }
        // iOS 27 extra-large size; the gate keeps older systems from listing it.
        if #available(iOS 27.0, *) {
            TodayDashboardWidget()
        }
    }
}

/// The v2 set: board column, milestone, ideas, knowledge card, habits, due today, timer.
struct KaihumanV2Widgets: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        BoardColumnWidget()
        MilestoneCountdownWidget()
        IdeaPipelineWidget()
        KnowledgeCardWidget()
        HabitsWidget()
        DueTodayWidget()
        TimerWidget()
    }
}
