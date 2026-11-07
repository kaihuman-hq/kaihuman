package com.kaihuman.app

import java.util.Calendar
import java.util.TimeZone
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val H = 3_600_000L

private fun utc(y: Int, m: Int, d: Int, h: Int = 0, min: Int = 0): Long =
    Calendar.getInstance(TimeZone.getTimeZone("UTC")).apply { clear(); set(y, m - 1, d, h, min) }.timeInMillis

private fun item(
    id: String,
    status: String = "backlog",
    file: String = "f.todos.md",
    priority: String? = null,
    tags: List<String> = emptyList(),
    milestone: String? = null,
) = WidgetTodoItem(
    id = id, filePath = file, indexInFile = 0, text = id, status = status,
    tags = tags, milestoneId = milestone, priority = priority,
)

private fun snap(
    updatedAt: Long = 0,
    items: List<WidgetTodoItem> = emptyList(),
    timeZone: String? = "UTC",
    counts: WidgetCounts = WidgetCounts(0, 0, 0, 3),
    stats: WidgetStats? = null,
    cards: List<WidgetCard>? = null,
    milestones: List<WidgetMilestoneSummary>? = null,
    upcoming: WidgetMilestone? = null,
    ideas: WidgetIdeas? = null,
    tags: List<String>? = null,
) = WidgetTodoSnapshot(
    schemaVersion = 2, updatedAt = updatedAt, repoFullName = "a/b", branch = "main",
    counts = counts, items = items, timeZone = timeZone, stats = stats, cards = cards,
    milestones = milestones, upcomingMilestone = upcoming, ideas = ideas, tags = tags,
)

class SnapshotQueriesTest {
    @Test fun freshnessThresholds() {
        val s = snap(updatedAt = 0)
        assertEquals(Freshness.Fresh, s.freshness(6 * H))
        assertEquals(Freshness.Stale(6), s.freshness(6 * H + 1))
        assertEquals(Freshness.Stale(47), s.freshness(47 * H + 5))
        assertEquals(Freshness.Stale(48), s.freshness(48 * H))
        assertEquals(Freshness.Dim(48), s.freshness(48 * H + 1))
        // A clock behind the snapshot is fresh, not negative.
        assertEquals(Freshness.Fresh, s.freshness(-5 * H))
        assertTrue(s.freshness(100 * H).isDim)
    }

    @Test fun sourceParseRoundTrip() {
        for (id in listOf("all", "column:inbox", "column:in-progress", "column:backlog", "tag:work", "milestone:m1")) {
            assertEquals(id, TodoSource.parse(id)?.id)
        }
        assertEquals(TodoSource.Tag("a:b"), TodoSource.parse("tag:a:b"))
        assertNull(TodoSource.parse("nonsense"))
        assertNull(TodoSource.parse(null))
    }

    @Test fun nextUpOrdersInProgressThenPriorityThenFileOrder() {
        val s = snap(
            items = listOf(
                item("low", priority = "low"),
                item("none"),
                item("high", priority = "High"),
                item("prog-none", status = "in-progress"),
                item("prog-high", status = "in-progress", priority = "urgent"),
                item("medium", priority = "medium"),
                item("done", status = "done"),
                item("none2"),
            ),
        )
        assertEquals(
            listOf("prog-high", "prog-none", "high", "medium", "low", "none", "none2"),
            s.nextUp.map { it.id },
        )
    }

    @Test fun sourceFilters() {
        val inbox = ".kh/inbox.todos.md"
        val s = snap(
            items = listOf(
                item("in", file = inbox),
                item("bl", tags = listOf("work"), milestone = "m1"),
                item("ip", status = "in-progress", file = inbox),
            ),
        ).copy(appFolder = ".kh")
        assertEquals(listOf("in"), s.items(TodoSource.Inbox).map { it.id })
        assertEquals(listOf("bl"), s.items(TodoSource.Backlog).map { it.id })
        assertEquals(listOf("ip"), s.items(TodoSource.InProgress).map { it.id })
        assertEquals(listOf("bl"), s.items(TodoSource.Tag("work")).map { it.id })
        assertEquals(listOf("bl"), s.items(TodoSource.Milestone("m1")).map { it.id })
        assertEquals(3, s.items(TodoSource.All).size)
        assertEquals(listOf("work"), s.allTags)
    }

    @Test fun doneTodayResetsAcrossMidnightInSnapshotZone() {
        // 23:30 in Berlin (UTC+1 in January) is 22:30 UTC.
        val updated = utc(2026, 1, 10, 22, 30)
        val berlin = snap(updatedAt = updated, timeZone = "Europe/Berlin")
        // 22:50 UTC is 23:50 Berlin: same day.
        assertEquals(3, berlin.doneToday(utc(2026, 1, 10, 22, 50)))
        // 23:10 UTC is 00:10 Berlin the next day: reset, though UTC is still the 10th.
        assertEquals(0, berlin.doneToday(utc(2026, 1, 10, 23, 10)))
        // The same instants in a UTC snapshot are one UTC day.
        val utcSnap = snap(updatedAt = updated, timeZone = "UTC")
        assertEquals(3, utcSnap.doneToday(utc(2026, 1, 10, 23, 10)))
        assertEquals(0, utcSnap.doneToday(utc(2026, 1, 11, 0, 1)))
    }

    @Test fun weekdayIndexIsMondayZero() {
        val s = snap()
        assertEquals(0, s.weekdayIndex(utc(2026, 11, 2, 12))) // Monday
        assertEquals(6, s.weekdayIndex(utc(2026, 11, 8, 12))) // Sunday
        assertEquals(4, s.weekdayIndex(utc(2026, 11, 6, 12))) // Friday
    }

    @Test fun daysLeft() {
        val s = snap()
        val now = utc(2026, 11, 6, 23, 59)
        assertEquals(0, s.daysLeft("2026-11-06", now))
        assertEquals(1, s.daysLeft("2026-11-07", now))
        assertEquals(-3, s.daysLeft("2026-11-03", now))
        assertEquals(30, s.daysLeft("2026-12-06", now))
        assertNull(s.daysLeft(null, now))
        assertNull(s.daysLeft("soon", now))
        // Local day, not UTC day: 23:30 UTC is already tomorrow in Tokyo.
        assertEquals(0, snap(timeZone = "Asia/Tokyo").daysLeft("2026-11-07", utc(2026, 11, 6, 23, 30)))
    }

    @Test fun cardRotatesEveryThreeHoursAndByOffset() {
        val cards = (0..2).map { WidgetCard("p$it", "t$it", "e", emptyList()) }
        val s = snap(cards = cards)
        val t = 3 * H * 10 // slot 10, 10 % 3 == 1
        assertEquals("p1", s.card(t, 0)?.path)
        assertEquals("p1", s.card(t + 3 * H - 1, 0)?.path)
        assertEquals("p2", s.card(t + 3 * H, 0)?.path)
        assertEquals("p2", s.card(t, 1)?.path)
        assertEquals("p0", s.card(t, -1)?.path)
        assertEquals("p2", s.card(t, -2)?.path) // negative offsets wrap
        assertNull(snap().card(t, 0))
        assertNull(snap(cards = emptyList()).card(t, 0))
    }

    @Test fun milestoneFallsBackToUpcomingThenSynthesises() {
        val m1 = WidgetMilestoneSummary("m1", "One", "2026-12-01", 2, 1)
        val m2 = WidgetMilestoneSummary("m2", "Two", null, 5, 0)
        val upcoming = WidgetMilestone("m2", "Two", null)
        val s = snap(milestones = listOf(m1, m2), upcoming = upcoming)
        assertEquals("m1", s.milestone("m1")?.id)
        assertEquals("m2", s.milestone(null)?.id)
        assertEquals("m2", s.milestone("gone")?.id) // vanished pick
        // Upcoming missing from the summaries: counts come from open items.
        val bare = snap(
            upcoming = WidgetMilestone("m9", "Nine", "2026-12-31"),
            items = listOf(item("a", milestone = "m9"), item("b", milestone = "m9"), item("c")),
        )
        val synth = bare.milestone(null)!!
        assertEquals(WidgetMilestoneSummary("m9", "Nine", "2026-12-31", 2, 0), synth)
        assertNull(snap().milestone(null))
    }

    @Test fun ideaStagesFollowPreferredOrderThenExtrasSorted() {
        val s = snap(ideas = WidgetIdeas(mapOf("zeta" to 1, "exploring" to 2, "alpha" to 4, "seed" to 3), emptyList()))
        assertEquals(
            listOf("seed" to 3, "exploring" to 2, "alpha" to 4, "zeta" to 1),
            s.ideaStages(listOf("seed", "exploring", "building")).map { it.status to it.count },
        )
        assertTrue(snap().ideaStages(listOf("seed")).isEmpty())
    }

    @Test fun derivedCountersAndDefaults() {
        val s = snap(stats = WidgetStats(listOf(1, 2, 3, 0, 0, 0, 0), 4, null))
        assertEquals(6, s.doneThisWeek)
        assertEquals(10, s.weeklyGoal)
        assertEquals(4, s.streakDays)
        assertEquals(0, s.knowledgeInbox)
        assertEquals(1, snap(stats = WidgetStats(emptyList(), 0, 0)).weeklyGoal)
        assertEquals(0, snap().doneThisWeek)
        assertTrue(snap().showsLockScreenText)
    }

    @Test fun habitDoneOnlyOnTheSnapshotDay() {
        val habit = WidgetHabit("h", "Read", true, 2)
        val s = snap(updatedAt = utc(2026, 1, 10, 8))
        assertTrue(s.habitDone(habit, utc(2026, 1, 10, 20)))
        assertEquals(false, s.habitDone(habit, utc(2026, 1, 11, 1)))
    }
}
