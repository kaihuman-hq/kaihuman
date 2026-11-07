package com.kaihuman.app

// Deterministic snapshots for WidgetPreviewRenderTest. "Now" is Wednesday 2026-11-04 10:00 UTC.

const val PREVIEW_NOW = 1_793_786_400_000L
private const val HOUR = 3_600_000L

private fun todo(
    n: Int,
    text: String,
    status: String = "backlog",
    file: String = ".kh/work.todos.md",
    tags: List<String> = emptyList(),
    priority: String? = null,
    milestone: Boolean = false,
) = WidgetTodoItem(
    id = "t$n", filePath = file, indexInFile = n, text = text, status = status, tags = tags,
    milestoneId = if (milestone) "m1" else null,
    milestoneName = if (milestone) "Widgets v1" else null,
    milestoneDueDate = if (milestone) "2026-11-09" else null,
    updatedAt = PREVIEW_NOW - 2 * HOUR, priority = priority,
)

private const val INBOX = ".kh/inbox.todos.md"

fun filledSnapshot(updatedAt: Long = PREVIEW_NOW - HOUR / 2, lockScreenText: Boolean? = null) = WidgetTodoSnapshot(
    schemaVersion = 2,
    updatedAt = updatedAt,
    repoFullName = "kai/life",
    branch = "main",
    upcomingMilestone = WidgetMilestone("m1", "Widgets v1", "2026-11-09"),
    counts = WidgetCounts(inbox = 3, inProgress = 2, backlog = 5, doneToday = 4, knowledgeInbox = 2, doneThisWeek = 9),
    stats = WidgetStats(doneByDay = listOf(2, 3, 4, 0, 0, 0, 0), streakDays = 6, weeklyGoal = 12),
    milestones = listOf(
        WidgetMilestoneSummary("m1", "Widgets v1", "2026-11-09", open = 5, done = 7),
        WidgetMilestoneSummary("m2", "Public beta", "2026-12-15", open = 12, done = 3),
    ),
    tags = listOf("kaihuman", "life", "reading", "work", "writing"),
    lockScreenText = lockScreenText,
    timeZone = "UTC",
    items = listOf(
        todo(1, "Reply to Mira about the launch checklist", "in-progress", tags = listOf("work"), priority = "high", milestone = true),
        todo(2, "Ship Android widget previews", "in-progress", tags = listOf("kaihuman"), priority = "medium", milestone = true),
        todo(3, "Draft Q4 review notes", tags = listOf("work", "writing"), priority = "medium"),
        todo(4, "Book dentist appointment", file = INBOX),
        todo(5, "Buy oat milk and coffee filters", file = INBOX, tags = listOf("life")),
        todo(6, "Renew passport", file = INBOX, tags = listOf("life"), priority = "low"),
        todo(7, "Read chapter 4 of Designing Data-Intensive Applications", tags = listOf("reading")),
        todo(8, "Fix flaky CI on the mobile workflow", tags = listOf("kaihuman"), milestone = true),
    ),
    ideas = WidgetIdeas(
        byStatus = mapOf("seed" to 5, "exploring" to 3, "committed" to 2, "shipped" to 4),
        hot = listOf(WidgetHotIdea("offline-first-sync", "Offline-first sync for the wiki", "hot")),
    ),
    cards = listOf(
        WidgetCard(
            "wiki/spacing-effect.md", "The spacing effect",
            "Reviewing material at growing intervals beats cramming: each recall makes the memory trace more durable and the next gap can be longer.",
            listOf("learning", "memory"),
        ),
        WidgetCard("wiki/zettelkasten.md", "Zettelkasten", "Atomic notes, linked by ideas rather than folders.", listOf("notes")),
        WidgetCard("wiki/gtd.md", "Getting Things Done", "Capture everything, clarify, organise, review weekly.", emptyList()),
    ),
)

fun emptySnapshot() = WidgetTodoSnapshot(
    schemaVersion = 2,
    updatedAt = PREVIEW_NOW - HOUR / 2,
    repoFullName = "kai/life",
    branch = "main",
    counts = WidgetCounts(0, 0, 0, 0, knowledgeInbox = 0, doneThisWeek = 0),
    stats = WidgetStats(doneByDay = List(7) { 0 }, streakDays = 0, weeklyGoal = 10),
    milestones = emptyList(),
    tags = emptyList(),
    timeZone = "UTC",
    items = emptyList(),
    ideas = WidgetIdeas(emptyMap(), emptyList()),
    cards = emptyList(),
)

fun staleSnapshot() = filledSnapshot(updatedAt = PREVIEW_NOW - 8 * HOUR)

/** Lock-screen privacy: the host hides text and the user opted out of lock-screen text. */
fun hiddenTextSnapshot() = filledSnapshot(lockScreenText = false)
