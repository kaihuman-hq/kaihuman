package com.kaihuman.app

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import org.json.JSONObject

/** Persisted focus session; `endMs` is epoch millis of the planned end. */
data class FocusState(val todoId: String, val todoText: String, val endMs: Long)

/** Pure timer maths, kept free of Android types so it runs in plain JVM tests. */
object FocusLogic {
    const val EXTEND_MS = 5 * 60_000L

    fun endFor(nowMs: Long, minutes: Int): Long = nowMs + minutes.coerceAtLeast(1) * 60_000L

    /** Extending an expired timer counts from now, so "+5m" always gives five minutes. */
    fun extend(endMs: Long, nowMs: Long): Long = maxOf(endMs, nowMs) + EXTEND_MS

    fun toJson(state: FocusState): String = JSONObject()
        .put("todoId", state.todoId)
        .put("todoText", state.todoText)
        .put("endMs", state.endMs)
        .toString()

    fun fromJson(json: String?): FocusState? {
        if (json.isNullOrEmpty()) return null
        return try {
            val o = JSONObject(json)
            FocusState(o.getString("todoId"), o.getString("todoText"), o.getLong("endMs"))
        } catch (_: Exception) {
            null
        }
    }
}

/** The ongoing countdown notification, Android counterpart of the iOS focus Live Activity. */
object FocusNotification {
    const val CHANNEL_ID = "kh_focus"
    const val NOTIFICATION_ID = 4107
    const val STATE_KEY = "focus-session"

    fun load(context: Context): FocusState? =
        FocusLogic.fromJson(context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getString(STATE_KEY, null))

    fun save(context: Context, state: FocusState?) {
        val editor = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit()
        if (state == null) editor.remove(STATE_KEY) else editor.putString(STATE_KEY, FocusLogic.toJson(state))
        editor.apply()
    }

    fun canPost(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    fun post(context: Context, state: FocusState) {
        if (!canPost(context)) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        ensureChannel(manager, context)
        manager.notify(NOTIFICATION_ID, build(context, state))
    }

    fun cancel(context: Context) {
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
    }

    private fun ensureChannel(manager: NotificationManager, context: Context) {
        if (Build.VERSION.SDK_INT < 26) return
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                context.getString(R.string.kh_focus_channel_name),
                NotificationManager.IMPORTANCE_LOW,
            ),
        )
    }

    private fun action(context: Context, action: String, state: FocusState): PendingIntent {
        val intent = Intent(action)
            .setClassName(context.packageName, "${context.packageName}.FocusActionReceiver")
            .putExtra("todoId", state.todoId)
        return PendingIntent.getBroadcast(context, action.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE)
    }

    @Suppress("DEPRECATION")
    private fun builder(context: Context): Notification.Builder =
        if (Build.VERSION.SDK_INT >= 26) Notification.Builder(context, CHANNEL_ID) else Notification.Builder(context)

    private fun build(context: Context, state: FocusState): Notification {
        val open = PendingIntent.getActivity(
            context,
            0,
            Intent(Intent.ACTION_VIEW, Uri.parse(DeepLinks.BOARD))
                .setPackage(context.packageName)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
            PendingIntent.FLAG_IMMUTABLE,
        )
        // The lock screen shows only the generic public version, so the todo text stays private.
        val public = builder(context)
            .setSmallIcon(R.drawable.kh_ic_todo)
            .setContentTitle(context.getString(R.string.kh_focus_public_title))
            .build()
        val b = builder(context)
            .setSmallIcon(R.drawable.kh_ic_todo)
            .setContentTitle(state.todoText)
            .setContentIntent(open)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_PROGRESS)
            .setVisibility(Notification.VISIBILITY_PRIVATE)
            .setPublicVersion(public)
            .setWhen(state.endMs)
            .setShowWhen(true)
            .setUsesChronometer(true)
        if (Build.VERSION.SDK_INT >= 24) b.setChronometerCountDown(true)
        @Suppress("DEPRECATION")
        b.addAction(Notification.Action.Builder(null, context.getString(R.string.kh_focus_done), action(context, FocusActionReceiver.ACTION_DONE, state)).build())
        b.addAction(Notification.Action.Builder(null, context.getString(R.string.kh_focus_extend), action(context, FocusActionReceiver.ACTION_EXTEND, state)).build())
        return b.build()
    }
}
