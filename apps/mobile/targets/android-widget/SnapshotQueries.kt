package com.kaihuman.app

import java.util.Calendar
import java.util.TimeZone

// Pure helpers over WidgetTodoSnapshot; port of ios-widget/SnapshotQueries.swift. No Android
// framework types, so they run in plain JVM tests.

private const val HOUR_MS = 3_600_000L
private const val DAY_MS = 24 * HOUR_MS

/** How old the cached snapshot is. Thresholds follow doc/mobile-widgets.md section 5.2. */
sealed class Freshness {
    abstract val hours: Int

    object Fresh : Freshness() {
        override val hours: Int = 0
    }

    /** Older than 6 h: "Synced Nh ago" footer with a warning dot. */
    data class Stale(override val hours: Int) : Freshness()

    /** Older than 48 h: dim the content, keep the data. */
    data class Dim(override val hours: Int) : Freshness()
}

/** Which open todos a widget lists. `id` is the persisted config value. */
sealed class TodoSource {
    abstract val id: String

    object All : TodoSource() { override val id = "all" }
    object Inbox : TodoSource() { override val id = "column:inbox" }
    object InProgress : TodoSource() { override val id = "column:in-progress" }
    object Backlog : TodoSource() { override val id = "column:backlog" }
    data class Tag(val tag: String) : TodoSource() { override val id get() = "tag:$tag" }
    data class Milestone(val milestoneId: String) : TodoSource() { override val id get() = "milestone:$milestoneId" }

    companion object {
        fun parse(id: String?): TodoSource? = when {
            id == null -> null
            id == "all" -> All
            id == "column:inbox" -> Inbox
            id == "column:in-progress" -> InProgress
            id == "column:backlog" -> Backlog
            id.startsWith("tag:") -> Tag(id.removePrefix("tag:"))
            id.startsWith("milestone:") -> Milestone(id.removePrefix("milestone:"))
            else -> null
        }
    }
}

data class IdeaStage(val status: String, val count: Int)

/** The phone's zone can differ from the one the snapshot was written in (travel); prefer the snapshot's. */
fun WidgetTodoSnapshot.zone(): TimeZone =
    timeZone?.let { id -> TimeZone.getTimeZone(id).takeIf { it.id == id } } ?: TimeZone.getDefault()

private fun dayKey(ms: Long, zone: TimeZone): Triple<Int, Int, Int> {
    val c = Calendar.getInstance(zone).apply { timeInMillis = ms }
    return Triple(c.get(Calendar.YEAR), c.get(Calendar.MONTH), c.get(Calendar.DAY_OF_MONTH))
}

/** Days since 1970-01-01 of a calendar date; UTC arithmetic has no DST jumps. */
private fun epochDay(year: Int, month0: Int, day: Int): Long {
    val c = Calendar.getInstance(TimeZone.getTimeZone("UTC"))
    c.clear()
    c.set(year, month0, day)
    return Math.floorDiv(c.timeInMillis, DAY_MS)
}

fun WidgetTodoSnapshot.freshness(nowMs: Long): Freshness {
    val age = nowMs - updatedAt
    val hours = maxOf(0L, age / HOUR_MS).toInt()
    return when {
        age > 48 * HOUR_MS -> Freshness.Dim(hours)
        age > 6 * HOUR_MS -> Freshness.Stale(hours)
        else -> Freshness.Fresh
    }
}

val Freshness.isDim: Boolean get() = this is Freshness.Dim

val WidgetTodoSnapshot.inboxPath: String get() = "$appFolder/inbox.todos.md"

fun WidgetTodoSnapshot.isInbox(item: WidgetTodoItem): Boolean =
    item.status == "backlog" && item.filePath == inboxPath

private fun priorityRank(priority: String?): Int = when (priority?.lowercase()) {
    "urgent", "high" -> 0
    "medium" -> 1
    "low" -> 2
    else -> 3
}

/** Open todos in "next up" order: in progress first, then priority, then file order. */
val WidgetTodoSnapshot.nextUp: List<WidgetTodoItem>
    get() = items.withIndex()
        .filter { it.value.status == "backlog" || it.value.status == "in-progress" }
        .sortedWith(
            compareBy<IndexedValue<WidgetTodoItem>>(
                { if (it.value.status == "in-progress") 0 else 1 },
                { priorityRank(it.value.priority) },
                { it.index },
            ),
        )
        .map { it.value }

fun WidgetTodoSnapshot.items(source: TodoSource): List<WidgetTodoItem> {
    val open = nextUp
    return when (source) {
        TodoSource.All -> open
        TodoSource.Inbox -> open.filter { isInbox(it) }
        TodoSource.InProgress -> open.filter { it.status == "in-progress" }
        TodoSource.Backlog -> open.filter { it.status == "backlog" && !isInbox(it) }
        is TodoSource.Tag -> open.filter { source.tag in it.tags }
        is TodoSource.Milestone -> open.filter { it.milestoneId == source.milestoneId }
    }
}

/** Every tag known to the snapshot, for the source picker. */
val WidgetTodoSnapshot.allTags: List<String>
    get() = tags ?: items.flatMap { it.tags }.toSortedSet().toList()

/** The counter resets at local midnight; the snapshot only learns that on the next sync. */
fun WidgetTodoSnapshot.doneToday(nowMs: Long): Int =
    if (dayKey(updatedAt, zone()) == dayKey(nowMs, zone())) counts.doneToday else 0

val WidgetTodoSnapshot.doneThisWeek: Int
    get() = counts.doneThisWeek ?: stats?.doneByDay?.sum() ?: 0

val WidgetTodoSnapshot.weeklyGoal: Int get() = maxOf(1, stats?.weeklyGoal ?: 10)
val WidgetTodoSnapshot.streakDays: Int get() = stats?.streakDays ?: 0
val WidgetTodoSnapshot.knowledgeInbox: Int get() = counts.knowledgeInbox ?: 0

/** Default on: only an explicit false hides todo text on the lock screen. */
val WidgetTodoSnapshot.showsLockScreenText: Boolean get() = lockScreenText ?: true

/** Index into stats.doneByDay (Monday = 0 ... Sunday = 6). */
fun WidgetTodoSnapshot.weekdayIndex(nowMs: Long): Int {
    val dow = Calendar.getInstance(zone()).apply { timeInMillis = nowMs }.get(Calendar.DAY_OF_WEEK)
    return (dow + 5) % 7 // Calendar: Sunday = 1
}

/** Whole local days from now to a YYYY-MM-DD due date; negative when overdue. */
fun WidgetTodoSnapshot.daysLeft(dueDate: String?, nowMs: Long): Int? {
    val parts = dueDate?.split("-")?.map { it.toIntOrNull() ?: return null } ?: return null
    if (parts.size != 3) return null
    val (y, m, d) = dayKey(nowMs, zone())
    return (epochDay(parts[0], parts[1] - 1, parts[2]) - epochDay(y, m, d)).toInt()
}

const val CARD_SLOT_MS = 3 * HOUR_MS

/** Card shown at `nowMs`; stable within a 3 h slot, shifted by the user's "Next" taps. */
fun WidgetTodoSnapshot.card(nowMs: Long, offset: Int): WidgetCard? {
    val list = cards?.takeIf { it.isNotEmpty() } ?: return null
    val slot = Math.floorDiv(nowMs, CARD_SLOT_MS)
    return list[Math.floorMod(slot + offset, list.size.toLong()).toInt()]
}

/** The picked milestone, else the upcoming one. A vanished pick falls back to the upcoming one. */
fun WidgetTodoSnapshot.milestone(id: String?): WidgetMilestoneSummary? {
    if (id != null) milestones?.firstOrNull { it.id == id }?.let { return it }
    val upcoming = upcomingMilestone ?: return null
    return milestones?.firstOrNull { it.id == upcoming.id }
        ?: WidgetMilestoneSummary(
            upcoming.id, upcoming.name, upcoming.dueDate,
            open = items.count { it.milestoneId == upcoming.id }, done = 0,
        )
}

/** The snapshot only knows "done today" as of its last sync; a habit ticked yesterday is open again. */
fun WidgetTodoSnapshot.habitDone(habit: WidgetHabit, nowMs: Long): Boolean =
    habit.doneToday && dayKey(updatedAt, zone()) == dayKey(nowMs, zone())

/** Idea statuses in pipeline order first, then any the app invented. */
fun WidgetTodoSnapshot.ideaStages(preferred: List<String>): List<IdeaStage> {
    val by = ideas?.byStatus ?: return emptyList()
    val known = preferred.filter { it in by }
    val extra = by.keys.filter { it !in preferred }.sorted()
    return (known + extra).map { IdeaStage(it, by[it] ?: 0) }
}
