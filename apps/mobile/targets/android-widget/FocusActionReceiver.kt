package com.kaihuman.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/** Drives the focus notification. Not exported: only this app (module broadcasts, notification buttons) sends to it. */
class FocusActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val now = WidgetClock.now()
        when (intent.action) {
            ACTION_START -> {
                val todoId = intent.getStringExtra("todoId") ?: return
                val text = intent.getStringExtra("todoText") ?: return
                val state = FocusState(todoId, text, FocusLogic.endFor(now, intent.getIntExtra("minutes", 25)))
                FocusNotification.save(context, state)
                FocusNotification.post(context, state)
            }
            ACTION_UPDATE -> {
                val state = FocusNotification.load(context) ?: return
                val end = intent.getLongExtra("endMs", -1L)
                if (end < 0) return
                val next = state.copy(endMs = end)
                FocusNotification.save(context, next)
                FocusNotification.post(context, next)
            }
            ACTION_EXTEND -> {
                val state = FocusNotification.load(context) ?: return
                val next = state.copy(endMs = FocusLogic.extend(state.endMs, now))
                FocusNotification.save(context, next)
                FocusNotification.post(context, next)
            }
            ACTION_END -> finish(context)
            ACTION_DONE -> {
                val todoId = FocusNotification.load(context)?.todoId ?: intent.getStringExtra("todoId")
                val pending = goAsync()
                CoroutineScope(SupervisorJob() + Dispatchers.IO).launch {
                    try {
                        if (todoId != null) TodoCommit.complete(context, todoId)
                    } finally {
                        finish(context)
                        pending?.finish()
                    }
                }
            }
        }
    }

    private fun finish(context: Context) {
        FocusNotification.cancel(context)
        FocusNotification.save(context, null)
    }

    companion object {
        const val ACTION_START = "com.kaihuman.app.focus.START"
        const val ACTION_UPDATE = "com.kaihuman.app.focus.UPDATE"
        const val ACTION_EXTEND = "com.kaihuman.app.focus.EXTEND"
        const val ACTION_END = "com.kaihuman.app.focus.END"
        const val ACTION_DONE = "com.kaihuman.app.focus.DONE"
    }
}
