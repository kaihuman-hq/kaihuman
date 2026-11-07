package com.kaihuman.app

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback

/** Parameter key shared by every widget that completes or starts an item. */
object TodoActionKeys {
    val itemId = ActionParameters.Key<String>("itemId")
}

class ToggleTodoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val itemId = parameters[TodoActionKeys.itemId] ?: return
        TodoCommit.complete(context, itemId)
    }
}

/** Backlog to in progress. */
class StartTodoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val itemId = parameters[TodoActionKeys.itemId] ?: return
        TodoCommit.move(context, itemId, "in-progress")
    }
}
