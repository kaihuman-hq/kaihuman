package com.kaihuman.app

import android.content.Context
import androidx.glance.GlanceId
import androidx.glance.appwidget.GlanceAppWidgetManager

/** Per-appWidgetId choices made in WidgetConfigActivity (or bumped by a widget button). */
object WidgetConfigStore {
    const val PREFS = "kaihuman_widget_config"

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    /** Defaults to [TodoSource.All] when unset or unreadable. */
    /** `fallback` differs per widget: Next up lists everything, Board column the inbox (as on iOS). */
    fun source(context: Context, appWidgetId: Int, fallback: TodoSource = TodoSource.All): TodoSource =
        TodoSource.parse(prefs(context).getString("source-$appWidgetId", null)) ?: fallback

    fun setSource(context: Context, appWidgetId: Int, source: TodoSource) {
        prefs(context).edit().putString("source-$appWidgetId", source.id).apply()
    }

    /** Null means "the upcoming milestone". */
    fun milestone(context: Context, appWidgetId: Int): String? =
        prefs(context).getString("milestone-$appWidgetId", null)

    fun setMilestone(context: Context, appWidgetId: Int, milestoneId: String?) {
        prefs(context).edit().apply {
            if (milestoneId == null) remove("milestone-$appWidgetId") else putString("milestone-$appWidgetId", milestoneId)
        }.apply()
    }

    fun cardOffset(context: Context, appWidgetId: Int): Int = prefs(context).getInt("card-$appWidgetId", 0)

    /** Advances to the next card and returns the new offset. */
    fun bump(context: Context, appWidgetId: Int): Int {
        val next = cardOffset(context, appWidgetId) + 1
        prefs(context).edit().putInt("card-$appWidgetId", next).apply()
        return next
    }

    fun remove(context: Context, appWidgetId: Int) {
        prefs(context).edit()
            .remove("source-$appWidgetId")
            .remove("milestone-$appWidgetId")
            .remove("card-$appWidgetId")
            .apply()
    }
}

fun appWidgetIdOf(context: Context, glanceId: GlanceId): Int =
    GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
