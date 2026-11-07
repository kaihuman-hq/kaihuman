package com.kaihuman.app

import android.Manifest
import android.app.Application
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class FocusNotificationTest {
    private val app: Application = ApplicationProvider.getApplicationContext()
    private val manager get() = app.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    @Before
    fun setUp() {
        shadowOf(app).grantPermissions(Manifest.permission.POST_NOTIFICATIONS)
    }

    private fun send(action: String, block: Intent.() -> Unit = {}) =
        FocusActionReceiver().onReceive(app, Intent(action).apply(block))

    private fun start() = send(FocusActionReceiver.ACTION_START) {
        putExtra("todoId", "t1")
        putExtra("todoText", "Write tests")
        putExtra("minutes", 25)
    }

    @Test
    fun startPostsOngoingNotificationWithTwoActions() {
        start()
        val n = shadowOf(manager).getNotification(FocusNotification.NOTIFICATION_ID)
        assertNotNull(n)
        assertEquals(2, n.actions.size)
        assertEquals("Write tests", n.extras.getString("android.title"))
        assertNotNull(FocusNotification.load(app))
    }

    @Test
    fun startWithoutPermissionPostsNothing() {
        shadowOf(app).denyPermissions(Manifest.permission.POST_NOTIFICATIONS)
        start()
        assertNull(shadowOf(manager).getNotification(FocusNotification.NOTIFICATION_ID))
    }

    @Test
    fun endCancelsAndClearsState() {
        start()
        send(FocusActionReceiver.ACTION_END)
        assertNull(shadowOf(manager).getNotification(FocusNotification.NOTIFICATION_ID))
        assertNull(FocusNotification.load(app))
    }

    @Test
    fun extendMovesEnd() {
        start()
        val before = FocusNotification.load(app)!!.endMs
        send(FocusActionReceiver.ACTION_EXTEND)
        assertEquals(before + FocusLogic.EXTEND_MS, FocusNotification.load(app)!!.endMs)
    }

    @Test
    fun doneCancelsNotification() {
        start()
        send(FocusActionReceiver.ACTION_DONE)
        // The completion runs on a background thread; wait for it to cancel.
        val deadline = System.currentTimeMillis() + 5_000
        while (shadowOf(manager).getNotification(FocusNotification.NOTIFICATION_ID) != null &&
            System.currentTimeMillis() < deadline
        ) Thread.sleep(50)
        assertNull(shadowOf(manager).getNotification(FocusNotification.NOTIFICATION_ID))
    }
}
