package com.kaihuman.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

private const val V1 = """
{"updatedAt":1700000000000,"repoFullName":"a/b","branch":"main","appFolder":".kh",
 "counts":{"inbox":1,"inProgress":2,"backlog":3,"doneToday":4},
 "items":[{"id":".kh/inbox.todos.md#0","filePath":".kh/inbox.todos.md","indexInFile":0,"text":"hi","status":"backlog","tags":["x"]}],
 "files":{".kh/inbox.todos.md":{"sha":"s","content":"- [ ] hi"}}}
"""

private const val V2 = """
{"schemaVersion":2,"updatedAt":1700000000000,"repoFullName":"a/b","branch":"dev","appFolder":".lifeos",
 "upcomingMilestone":{"id":"m1","name":"Ship","dueDate":"2026-12-01"},
 "counts":{"inbox":1,"inProgress":2,"backlog":3,"doneToday":4,"knowledgeInbox":5,"doneThisWeek":6},
 "stats":{"doneByDay":[1,2,3,0,0,0,0],"streakDays":7,"weeklyGoal":12},
 "milestones":[{"id":"m1","name":"Ship","dueDate":"2026-12-01","open":3,"done":9}],
 "tags":["a","b"],"privacy":{"lockScreenText":false},"timeZone":"Europe/Berlin",
 "items":[{"id":"i","filePath":"f","indexInFile":2,"text":"t","status":"in-progress","tags":[],
   "milestoneId":"m1","milestoneName":"Ship","milestoneDueDate":"2026-12-01","updatedAt":5,"priority":"high","pending":true}],
 "files":{"f":{"sha":"s","content":"c"}},
 "ideas":{"byStatus":{"seed":2,"exploring":1},"hot":[{"slug":"s","title":"T","level":"hot"}]},
 "cards":[{"path":"p","title":"Card","excerpt":"e","tags":["t"]}],
 "habits":[{"path":"h","name":"Read","doneToday":true,"streakDays":3,"pending":true}]}
"""

// Robolectric 4.14 supports up to SDK 35 (app targets 36); the plain Application avoids SoLoader in MainApplication.
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = android.app.Application::class)
class SnapshotParsingTest {
    private fun parse(s: String) = WidgetTodoSnapshot.fromJson(JSONObject(s))

    @Test fun v1FileParsesWithDefaults() {
        val s = parse(V1)
        assertEquals(1, s.schemaVersion)
        assertEquals(4, s.counts.doneToday)
        assertNull(s.counts.knowledgeInbox)
        assertNull(s.stats)
        assertNull(s.ideas)
        assertNull(s.lockScreenText)
        assertTrue(s.showsLockScreenText)
        assertEquals("hi", s.items.single().text)
        assertFalse(s.items.single().pending)
        assertEquals("s", s.files[".kh/inbox.todos.md"]?.sha)
    }

    @Test fun v2FileParsesEveryField() {
        val s = parse(V2)
        assertEquals(2, s.schemaVersion)
        assertEquals(".lifeos", s.appFolder)
        assertEquals("Ship", s.upcomingMilestone?.name)
        assertEquals(5, s.counts.knowledgeInbox)
        assertEquals(6, s.counts.doneThisWeek)
        assertEquals(listOf(1, 2, 3, 0, 0, 0, 0), s.stats?.doneByDay)
        assertEquals(7, s.stats?.streakDays)
        assertEquals(12, s.stats?.weeklyGoal)
        assertEquals(9, s.milestones?.single()?.done)
        assertEquals(listOf("a", "b"), s.tags)
        assertEquals(false, s.lockScreenText)
        assertEquals("Europe/Berlin", s.timeZone)
        val item = s.items.single()
        assertEquals("high", item.priority)
        assertTrue(item.pending)
        assertEquals(5L, item.updatedAt)
        assertEquals(2, s.ideas?.byStatus?.get("seed"))
        assertEquals("hot", s.ideas?.hot?.single()?.level)
        assertEquals("Card", s.cards?.single()?.title)
        assertEquals(listOf("t"), s.cards?.single()?.tags)
        val habit = s.habits!!.single()
        assertTrue(habit.doneToday && habit.pending)
        assertEquals(3, habit.streakDays)
    }

    @Test fun unknownKeysAreIgnoredAndPreservedThroughToJson() {
        val withExtras = JSONObject(V2).apply {
            put("futureTop", JSONObject().put("a", 1))
            getJSONObject("counts").put("futureCount", 9)
            getJSONObject("stats").put("futureStat", "x")
            getJSONArray("items").getJSONObject(0).put("futureItem", true)
            getJSONObject("ideas").put("futureIdea", 1)
            getJSONArray("cards").getJSONObject(0).put("futureCard", "k")
        }
        val s = WidgetTodoSnapshot.fromJson(withExtras)
        // Mutate something Android edits, then round-trip.
        val out = s.copy(counts = s.counts.copy(doneToday = 99)).toJson()
        assertEquals(1, out.getJSONObject("futureTop").getInt("a"))
        assertEquals(9, out.getJSONObject("counts").getInt("futureCount"))
        assertEquals(99, out.getJSONObject("counts").getInt("doneToday"))
        assertEquals("x", out.getJSONObject("stats").getString("futureStat"))
        assertTrue(out.getJSONArray("items").getJSONObject(0).getBoolean("futureItem"))
        assertEquals(1, out.getJSONObject("ideas").getInt("futureIdea"))
        assertEquals("k", out.getJSONArray("cards").getJSONObject(0).getString("futureCard"))
        // And the output still parses to the same model.
        assertEquals(99, WidgetTodoSnapshot.fromJson(out).counts.doneToday)
    }

    @Test fun nullJsonValuesCountAsAbsent() {
        val o = JSONObject(V1)
        o.getJSONArray("items").getJSONObject(0).put("milestoneId", JSONObject.NULL)
        assertNull(WidgetTodoSnapshot.fromJson(o).items.single().milestoneId)
    }

    @Test fun storeRoundTripsAndReturnsNullOnCorruptJson() {
        val context = ApplicationProvider.getApplicationContext<Context>()
        assertNull(WidgetStore.load(context))
        WidgetStore.save(context, parse(V2))
        assertNotNull(WidgetStore.load(context))
        assertEquals(6, WidgetStore.load(context)?.counts?.doneThisWeek)

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        prefs.edit().putString(WIDGET_TODOS_KEY, "{not json").commit()
        assertNull(WidgetStore.load(context))
        prefs.edit().putString(WIDGET_TODOS_KEY, "{}").commit()
        assertNull(WidgetStore.load(context))
    }
}
