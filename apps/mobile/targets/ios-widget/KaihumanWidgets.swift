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
        KaihumanFocusWidgets().body
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

/// The focus Live Activity (small family from iOS 18) and the iOS 27 extra-large Today dashboard.
/// Declared after the controls on purpose: src/ios-widget.test.ts reads the first iOS 18 block.
struct KaihumanFocusWidgets: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        // WidgetBundleBuilder has no buildEither, so two one-sided branches instead of if/else.
        if #available(iOS 18.0, *) {
            FocusLiveActivityFamilies()
        }
        if #unavailable(iOS 18.0) {
            FocusLiveActivity()
        }
        // iOS 27 extra-large size; the view needs nothing newer, the gate keeps older systems from listing it.
        if #available(iOS 27.0, *) {
            TodayDashboardWidget()
        }
    }
}
