package com.kaihuman.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

private const val H3 = 3 * 3_600_000L

private fun snap(
    counts: WidgetCounts = WidgetCounts(0, 0, 0, 0),
    ideas: WidgetIdeas? = null,
    cards: List<WidgetCard>? = null,
) = WidgetTodoSnapshot(
    schemaVersion = 2, updatedAt = 0, repoFullName = "a/b", branch = "main",
    counts = counts, items = emptyList(), timeZone = "UTC", ideas = ideas, cards = cards,
)

private fun card(n: Int) = WidgetCard("wiki/$n.md", "T$n", "e$n", emptyList())

class WidgetsLogicTest {
    @Test fun ringProgressClampsAndHandlesBadGoal() {
        assertEquals(0.5f, ringProgress(5, 10), 0.0001f)
        assertEquals(1f, ringProgress(25, 10), 0f)
        assertEquals(0f, ringProgress(-3, 10), 0f)
        assertEquals(1f, ringProgress(3, 0), 0f) // goal below 1 counts as 1
    }

    @Test fun ringOverflowOnlyAboveGoal() {
        assertFalse(ringOverflow(10, 10))
        assertTrue(ringOverflow(11, 10))
    }

    @Test fun ringArcStartsAtTopAndSweepsFraction() {
        val arc = ringArc(5, 10)
        assertEquals(-90f, arc.startAngle, 0f)
        assertEquals(180f, arc.sweepAngle, 0.001f)
        assertEquals(360f, ringArc(40, 10).sweepAngle, 0f)
        assertEquals(0f, ringArc(0, 10).sweepAngle, 0f)
    }

    @Test fun weekBarsMarkTodayAndFuture() {
        val bars = weekBars(listOf(2, 4, 1), today = 2)
        assertEquals(7, bars.size)
        assertEquals(1f, bars[1].fraction, 0f)
        assertEquals(0.5f, bars[0].fraction, 0f)
        assertTrue(bars[2].isToday)
        assertFalse(bars[2].isFuture)
        assertTrue(bars[3].isFuture)
        assertEquals(0, bars[6].value) // short list pads with zero
        assertEquals(0f, weekBars(emptyList(), 0)[0].fraction, 0f)
    }

    @Test fun inboxEmptyState() {
        assertTrue(snap().inboxState().isZero)
        val s = snap(counts = WidgetCounts(inbox = 2, inProgress = 0, backlog = 0, doneToday = 0, knowledgeInbox = 3))
        assertFalse(s.inboxState().isZero)
        assertEquals(5, s.inboxState().total)
        // Knowledge-only inbox is not "zero".
        assertFalse(snap(counts = WidgetCounts(0, 0, 0, 0, knowledgeInbox = 1)).inboxState().isZero)
    }

    @Test fun pipelineStagesFollowPreferredOrderThenExtras() {
        val ideas = WidgetIdeas(mapOf("shipped" to 1, "zeta" to 2, "seed" to 5, "alpha" to 1), emptyList())
        assertEquals(listOf("seed", "shipped", "alpha", "zeta"), snap(ideas = ideas).pipelineStages().map { it.status })
        assertTrue(snap().pipelineStages().isEmpty())
        assertEquals("Exploring", stageLabel("exploring"))
    }

    @Test fun cardOffsetWrapsAndSlotsRotate() {
        val s = snap(cards = listOf(card(0), card(1), card(2)))
        assertEquals("wiki/0.md", s.card(0, 0)?.path)
        assertEquals("wiki/1.md", s.card(0, 1)?.path)
        assertEquals("wiki/0.md", s.card(0, 3)?.path) // offset wraps
        assertEquals("wiki/1.md", s.card(H3, 0)?.path) // next 3 h slot
        assertEquals("wiki/0.md", s.card(H3 * 2, 1)?.path)
        assertNull(snap().card(0, 5))
    }
}
