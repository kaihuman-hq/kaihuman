package com.kaihuman.app

// Pure decisions behind Next up, Board column, Milestone and the config picker. Kept free of
// Glance and Android types so they run in plain JVM tests; the widgets only map results to strings.

enum class WidgetSizeClass { Small, Medium, Large }

/** Responsive sizes are chosen by the launcher; this maps the chosen one to a layout. */
fun sizeClassOf(widthDp: Float, heightDp: Float): WidgetSizeClass = when {
    heightDp >= 200f -> WidgetSizeClass.Large
    widthDp >= 200f -> WidgetSizeClass.Medium
    else -> WidgetSizeClass.Small
}

/** A medium widget has no spare height for the stale footer, so it gives up a row for it. */
fun nextUpRowLimit(size: WidgetSizeClass, stale: Boolean = false): Int = when (size) {
    WidgetSizeClass.Small -> 1
    WidgetSizeClass.Medium -> if (stale) 2 else 3
    WidgetSizeClass.Large -> 6
}

fun boardRowLimit(size: WidgetSizeClass, stale: Boolean = false): Int = when (size) {
    WidgetSizeClass.Large -> 6
    WidgetSizeClass.Medium -> if (stale) 2 else 3
    WidgetSizeClass.Small -> 1
}

fun WidgetTodoSnapshot.nextUpRows(source: TodoSource, size: WidgetSizeClass, stale: Boolean = false): List<WidgetTodoItem> =
    items(source).take(nextUpRowLimit(size, stale))

fun WidgetTodoSnapshot.boardRows(source: TodoSource, size: WidgetSizeClass, stale: Boolean = false): List<WidgetTodoItem> =
    items(source).take(boardRowLimit(size, stale))

enum class EmptyCopy { NothingInProgress, NothingUpNext, InboxZero, NothingOpenHere, BacklogEmpty }

fun nextUpEmpty(source: TodoSource): EmptyCopy = when (source) {
    TodoSource.InProgress -> EmptyCopy.NothingInProgress
    TodoSource.All -> EmptyCopy.NothingUpNext
    TodoSource.Inbox -> EmptyCopy.InboxZero
    TodoSource.Backlog, is TodoSource.Tag, is TodoSource.Milestone -> EmptyCopy.NothingOpenHere
}

fun boardEmpty(source: TodoSource): EmptyCopy = when (source) {
    TodoSource.InProgress -> EmptyCopy.NothingInProgress
    TodoSource.Backlog -> EmptyCopy.BacklogEmpty
    TodoSource.Inbox -> EmptyCopy.InboxZero
    TodoSource.All -> EmptyCopy.NothingUpNext
    is TodoSource.Tag, is TodoSource.Milestone -> EmptyCopy.NothingOpenHere
}

/** What a source is called; [text] carries the tag or milestone name when the kind needs one. */
data class SourceLabel(val kind: Kind, val text: String? = null) {
    enum class Kind { All, Inbox, InProgress, Backlog, Tag, Milestone, Upcoming }
}

fun sourceLabel(source: TodoSource, snapshot: WidgetTodoSnapshot?): SourceLabel = when (source) {
    TodoSource.All -> SourceLabel(SourceLabel.Kind.All)
    TodoSource.Inbox -> SourceLabel(SourceLabel.Kind.Inbox)
    TodoSource.InProgress -> SourceLabel(SourceLabel.Kind.InProgress)
    TodoSource.Backlog -> SourceLabel(SourceLabel.Kind.Backlog)
    is TodoSource.Tag -> SourceLabel(SourceLabel.Kind.Tag, source.tag)
    is TodoSource.Milestone ->
        SourceLabel(SourceLabel.Kind.Milestone, snapshot?.milestones?.firstOrNull { it.id == source.milestoneId }?.name)
}

/** Board rows offer Start for backlog (incl. inbox) items and Done for items already in progress. */
fun boardRowStarts(item: WidgetTodoItem): Boolean = item.status != "in-progress"

fun doneFraction(doneToday: Int, open: Int): Float = doneToday.toFloat() / maxOf(1, doneToday + open)

fun milestoneFraction(m: WidgetMilestoneSummary): Float = m.done.toFloat() / maxOf(1, m.open + m.done)

enum class DayCaption { DaysLeft, DayLeft, DueToday, DayOverdue, DaysOverdue, NoDueDate }

/** The big number is the magnitude; the caption says whether it is left or overdue. */
data class DaysWording(val number: String, val caption: DayCaption)

fun daysWording(left: Int?): DaysWording = when {
    left == null -> DaysWording("–", DayCaption.NoDueDate)
    left == 0 -> DaysWording("0", DayCaption.DueToday)
    left < 0 -> DaysWording("${-left}", if (left == -1) DayCaption.DayOverdue else DayCaption.DaysOverdue)
    else -> DaysWording("$left", if (left == 1) DayCaption.DayLeft else DayCaption.DaysLeft)
}

// Configuration picker

enum class ConfigKind { Source, Milestone }

/** The configure activity serves several providers; the milestone one picks a milestone, the rest a source. */
fun configKindOf(providerClassName: String?): ConfigKind =
    if (providerClassName?.contains("MilestoneWidget") == true) ConfigKind.Milestone else ConfigKind.Source

/** [id] is a [TodoSource.id] for source pickers, a milestone id (null = upcoming) for milestone pickers. */
data class ConfigChoice(val id: String?, val label: SourceLabel)

fun sourceChoices(snapshot: WidgetTodoSnapshot): List<ConfigChoice> =
    listOf(
        ConfigChoice(TodoSource.All.id, SourceLabel(SourceLabel.Kind.All)),
        ConfigChoice(TodoSource.Inbox.id, SourceLabel(SourceLabel.Kind.Inbox)),
        ConfigChoice(TodoSource.InProgress.id, SourceLabel(SourceLabel.Kind.InProgress)),
        ConfigChoice(TodoSource.Backlog.id, SourceLabel(SourceLabel.Kind.Backlog)),
    ) + snapshot.allTags.map { ConfigChoice(TodoSource.Tag(it).id, SourceLabel(SourceLabel.Kind.Tag, it)) } +
        (snapshot.milestones ?: emptyList()).map {
            ConfigChoice(TodoSource.Milestone(it.id).id, SourceLabel(SourceLabel.Kind.Milestone, it.name))
        }

fun milestoneChoices(snapshot: WidgetTodoSnapshot): List<ConfigChoice> =
    listOf(ConfigChoice(null, SourceLabel(SourceLabel.Kind.Upcoming))) +
        (snapshot.milestones ?: emptyList()).map { ConfigChoice(it.id, SourceLabel(SourceLabel.Kind.Milestone, it.name)) }

/** Index to preselect; 0 (the default choice) when the stored value no longer exists. */
fun preselectedIndex(choices: List<ConfigChoice>, currentId: String?): Int =
    choices.indexOfFirst { it.id == currentId }.takeIf { it >= 0 } ?: 0
