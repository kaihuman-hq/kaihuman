package com.kaihuman.app

// Pure helpers for the Phase 2 widgets (quick capture, weekly done, inbox, ideas, wiki card).
// No Android types, so they run in plain JVM tests.

/** Where the ring starts: 12 o'clock, like the iOS trim(from:) + rotation(-90). */
const val RING_START_ANGLE = -90f

/** Fraction of the weekly goal reached, clamped to 0..1. A goal below 1 counts as 1. */
fun ringProgress(done: Int, goal: Int): Float {
    val g = maxOf(1, goal)
    return (done.coerceAtLeast(0).toFloat() / g).coerceIn(0f, 1f)
}

/** More done than the goal: the ring stays full, the centre count keeps growing. */
fun ringOverflow(done: Int, goal: Int): Boolean = done > maxOf(1, goal)

data class RingArc(val startAngle: Float, val sweepAngle: Float)

fun ringArc(done: Int, goal: Int): RingArc = RingArc(RING_START_ANGLE, 360f * ringProgress(done, goal))

/** One bar of the Mon-Sun row. `fraction` is relative to the busiest day so far (never 0 for a peak of 0). */
data class WeekBar(
    val index: Int,
    val value: Int,
    val fraction: Float,
    val isToday: Boolean,
    val isFuture: Boolean,
)

val WEEKDAY_LETTERS = listOf("M", "T", "W", "T", "F", "S", "S")

fun weekBars(counts: List<Int>, today: Int): List<WeekBar> {
    val peak = maxOf(1, counts.maxOrNull() ?: 1)
    return (0 until 7).map { i ->
        val v = counts.getOrElse(i) { 0 }.coerceAtLeast(0)
        WeekBar(i, v, v.toFloat() / peak, isToday = i == today, isFuture = i > today)
    }
}

data class InboxState(val todos: Int, val notes: Int) {
    val total: Int get() = todos + notes
    val isZero: Boolean get() = total == 0
}

fun WidgetTodoSnapshot.inboxState(): InboxState =
    InboxState(todos = counts.inbox.coerceAtLeast(0), notes = knowledgeInbox.coerceAtLeast(0))

/** Idea stage order shown by the widget, as on iOS. */
val IDEA_STAGE_ORDER = listOf("seed", "exploring", "committed", "shipped")

fun stageLabel(status: String): String = status.replaceFirstChar { it.uppercase() }

fun WidgetTodoSnapshot.pipelineStages(): List<IdeaStage> = ideaStages(IDEA_STAGE_ORDER)
