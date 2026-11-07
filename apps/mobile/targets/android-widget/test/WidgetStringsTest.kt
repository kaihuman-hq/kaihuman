package com.kaihuman.app

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

// Plain Application avoids SoLoader in MainApplication (same as SnapshotParsingTest).
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = android.app.Application::class)
class WidgetStringsTest {
    private val context: Context get() = ApplicationProvider.getApplicationContext()
    private fun s(id: Int, vararg args: Any) = context.getString(id, *args)

    @Test fun boardColumnEmptyStateNamesNoInbox() {
        assertEquals("Nothing here", s(nextUpEmptyRes(boardEmpty(TodoSource.Inbox))))
        assertEquals("Nothing here", s(nextUpEmptyRes(boardEmpty(TodoSource.All))))
        assertEquals("Backlog is empty", s(nextUpEmptyRes(boardEmpty(TodoSource.Backlog))))
        assertEquals("Nothing in progress — pick from backlog", s(nextUpEmptyRes(boardEmpty(TodoSource.InProgress))))
    }

    @Test fun nextUpEmptyStates() {
        assertEquals("Nothing up next", s(nextUpEmptyRes(nextUpEmpty(TodoSource.All))))
        assertEquals("Inbox zero", s(nextUpEmptyRes(nextUpEmpty(TodoSource.Inbox))))
        assertEquals("Nothing open here", s(nextUpEmptyRes(nextUpEmpty(TodoSource.Backlog))))
    }

    @Test fun otherWidgetsKeepTheirOwnEmptyCopy() {
        assertEquals("Inbox zero", s(R.string.kh_w_inbox_zero))
        assertEquals("No ideas yet", s(R.string.kh_w_no_ideas))
        assertEquals("No cards yet", s(R.string.kh_w_no_cards))
        assertEquals("No milestone", s(R.string.kh_ms_none))
    }

    @Test fun signedOutAndStaleCopyComeFromResources() {
        assertEquals("Open kaihuman to sign in", s(R.string.kh_w_sign_in))
        assertEquals(s(R.string.kh_w_sign_in), s(R.string.kh_cfg_signed_out))
        assertEquals("Synced 7h ago", s(R.string.kh_w_synced_ago, 7))
    }

    @Test fun emptyStringsAreDistinctAndNeverBlank() {
        val ids = listOf(
            R.string.kh_empty_nothing_in_progress, R.string.kh_empty_nothing_up_next, R.string.kh_empty_inbox_zero,
            R.string.kh_empty_nothing_open_here, R.string.kh_empty_backlog_empty, R.string.kh_empty_nothing_here,
        )
        val all = ids.map { s(it) }
        assertTrue(all.none { it.isBlank() })
        assertEquals(all.size, all.toSet().size)
        assertFalse(s(R.string.kh_empty_nothing_here).contains("Inbox", ignoreCase = true))
    }
}
