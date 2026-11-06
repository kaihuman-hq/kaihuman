package com.kaihuman.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

private fun todo(id: String, status: String = "backlog", file: String = "f.todos.md", tags: List<String> = emptyList(), ms: String? = null) =
    WidgetTodoItem(id = id, filePath = file, indexInFile = 0, text = id, status = status, tags = tags, milestoneId = ms)

private fun snapshot(
    items: List<WidgetTodoItem> = emptyList(),
    milestones: List<WidgetMilestoneSummary>? = null,
    tags: List<String>? = null,
) = WidgetTodoSnapshot(
    schemaVersion = 2, updatedAt = 0, repoFullName = "a/b", branch = "main",
    counts = WidgetCounts(0, 0, 0, 0), items = items, milestones = milestones, tags = tags,
)

class NextUpLogicTest {
    @Test fun sizeClassFromChosenResponsiveSize() {
        assertEquals(WidgetSizeClass.Small, sizeClassOf(110f, 110f))
        assertEquals(WidgetSizeClass.Medium, sizeClassOf(250f, 110f))
        assertEquals(WidgetSizeClass.Large, sizeClassOf(250f, 250f))
        assertEquals(WidgetSizeClass.Large, sizeClassOf(110f, 250f))
    }

    @Test fun rowLimitsShrinkOnlyWhereTheFooterNeedsRoom() {
        assertEquals(1, nextUpRowLimit(WidgetSizeClass.Small))
        assertEquals(3, nextUpRowLimit(WidgetSizeClass.Medium))
        assertEquals(2, nextUpRowLimit(WidgetSizeClass.Medium, stale = true))
        assertEquals(6, nextUpRowLimit(WidgetSizeClass.Large, stale = true))
        assertEquals(6, boardRowLimit(WidgetSizeClass.Large))
        assertEquals(3, boardRowLimit(WidgetSizeClass.Medium))
    }

    @Test fun rowsFollowSourceAndLimit() {
        val s = snapshot(
            items = listOf(
                todo("a", "in-progress"), todo("b"), todo("c", tags = listOf("work")),
                todo("d", tags = listOf("work")), todo("e"), todo("f"), todo("g"), todo("done", "done"),
            ),
        )
        assertEquals(listOf("a"), s.nextUpRows(TodoSource.All, WidgetSizeClass.Small).map { it.id })
        assertEquals(listOf("a", "b", "c"), s.nextUpRows(TodoSource.All, WidgetSizeClass.Medium).map { it.id })
        assertEquals(6, s.nextUpRows(TodoSource.All, WidgetSizeClass.Large).size)
        assertEquals(listOf("c", "d"), s.nextUpRows(TodoSource.Tag("work"), WidgetSizeClass.Large).map { it.id })
        assertEquals(listOf("a"), s.boardRows(TodoSource.InProgress, WidgetSizeClass.Large).map { it.id })
    }

    @Test fun emptyCopyMatchesIos() {
        assertEquals(EmptyCopy.NothingInProgress, nextUpEmpty(TodoSource.InProgress))
        assertEquals(EmptyCopy.NothingUpNext, nextUpEmpty(TodoSource.All))
        assertEquals(EmptyCopy.InboxZero, nextUpEmpty(TodoSource.Inbox))
        assertEquals(EmptyCopy.NothingOpenHere, nextUpEmpty(TodoSource.Backlog))
        assertEquals(EmptyCopy.NothingOpenHere, nextUpEmpty(TodoSource.Tag("x")))
        assertEquals(EmptyCopy.NothingOpenHere, nextUpEmpty(TodoSource.Milestone("m")))
        assertEquals(EmptyCopy.BacklogEmpty, boardEmpty(TodoSource.Backlog))
        assertEquals(EmptyCopy.NothingInProgress, boardEmpty(TodoSource.InProgress))
        assertEquals(EmptyCopy.InboxZero, boardEmpty(TodoSource.Inbox))
    }

    @Test fun boardRowAction() {
        assertTrue(boardRowStarts(todo("a")))
        assertFalse(boardRowStarts(todo("a", "in-progress")))
    }

    @Test fun daysWordingCoversLeftTodayOverdueAndNone() {
        assertEquals(DaysWording("12", DayCaption.DaysLeft), daysWording(12))
        assertEquals(DaysWording("1", DayCaption.DayLeft), daysWording(1))
        assertEquals(DaysWording("0", DayCaption.DueToday), daysWording(0))
        assertEquals(DaysWording("1", DayCaption.DayOverdue), daysWording(-1))
        assertEquals(DaysWording("3", DayCaption.DaysOverdue), daysWording(-3))
        assertEquals(DaysWording("–", DayCaption.NoDueDate), daysWording(null))
    }

    @Test fun fractionsNeverDivideByZero() {
        assertEquals(0f, milestoneFraction(WidgetMilestoneSummary("m", "M", null, 0, 0)), 0f)
        assertEquals(0.5f, milestoneFraction(WidgetMilestoneSummary("m", "M", null, 2, 2)), 0f)
        assertEquals(0.25f, doneFraction(1, 3), 0f)
        assertEquals(0f, doneFraction(0, 0), 0f)
    }

    @Test fun sourceLabels() {
        val s = snapshot(milestones = listOf(WidgetMilestoneSummary("m1", "Widgets v1", null, 1, 1)))
        assertEquals(SourceLabel(SourceLabel.Kind.Tag, "work"), sourceLabel(TodoSource.Tag("work"), s))
        assertEquals(SourceLabel(SourceLabel.Kind.Milestone, "Widgets v1"), sourceLabel(TodoSource.Milestone("m1"), s))
        assertEquals(SourceLabel(SourceLabel.Kind.Milestone, null), sourceLabel(TodoSource.Milestone("gone"), s))
    }

    @Test fun configKindByProvider() {
        assertEquals(ConfigKind.Milestone, configKindOf("com.kaihuman.app.MilestoneWidgetReceiver"))
        assertEquals(ConfigKind.Source, configKindOf("com.kaihuman.app.BoardColumnWidgetReceiver"))
        assertEquals(ConfigKind.Source, configKindOf("com.kaihuman.app.TodoWidgetReceiver"))
        assertEquals(ConfigKind.Source, configKindOf(null))
    }

    @Test fun sourceChoicesListColumnsTagsAndMilestones() {
        val s = snapshot(
            items = listOf(todo("a", tags = listOf("work"))),
            milestones = listOf(WidgetMilestoneSummary("m1", "Widgets v1", null, 1, 1)),
            tags = listOf("home", "work"),
        )
        val choices = sourceChoices(s)
        assertEquals(
            listOf("all", "column:inbox", "column:in-progress", "column:backlog", "tag:home", "tag:work", "milestone:m1"),
            choices.map { it.id },
        )
        assertEquals(2, preselectedIndex(choices, "column:in-progress"))
        assertEquals(6, preselectedIndex(choices, "milestone:m1"))
        assertEquals(0, preselectedIndex(choices, "tag:vanished"))
    }

    @Test fun milestoneChoicesStartWithUpcoming() {
        val s = snapshot(milestones = listOf(WidgetMilestoneSummary("m1", "A", null, 1, 1), WidgetMilestoneSummary("m2", "B", null, 0, 0)))
        val choices = milestoneChoices(s)
        assertEquals(listOf<String?>(null, "m1", "m2"), choices.map { it.id })
        assertEquals(0, preselectedIndex(choices, null))
        assertEquals(2, preselectedIndex(choices, "m2"))
        assertEquals(listOf<String?>(null), milestoneChoices(snapshot()).map { it.id })
    }
}
