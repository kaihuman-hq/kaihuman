package com.kaihuman.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class FocusLogicTest {
    @Test
    fun endForAddsMinutes() {
        assertEquals(1_000L + 25 * 60_000L, FocusLogic.endFor(1_000L, 25))
        assertEquals(1_000L + 60_000L, FocusLogic.endFor(1_000L, 0))
    }

    @Test
    fun extendCountsFromEndWhenRunning() {
        assertEquals(10 * 60_000L + 5 * 60_000L, FocusLogic.extend(10 * 60_000L, 1_000L))
    }

    @Test
    fun extendCountsFromNowWhenExpired() {
        assertEquals(50_000L + 5 * 60_000L, FocusLogic.extend(1_000L, 50_000L))
    }

    @Test
    fun stateRoundTripsAndRejectsGarbage() {
        val state = FocusState("t1", "Write \"tests\"", 42L)
        assertEquals(state, FocusLogic.fromJson(FocusLogic.toJson(state)))
        assertNull(FocusLogic.fromJson("not json"))
        assertNull(FocusLogic.fromJson(null))
    }
}
