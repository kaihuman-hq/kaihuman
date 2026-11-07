package com.kaihuman.app

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

/**
 * One picker for every configurable widget: a todo source for Next up and Board column, a milestone
 * for Milestone countdown. Also launched for reconfiguration. Options come from the cached snapshot,
 * so it works offline.
 */
class WidgetConfigActivity : Activity() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private class Row(val text: String, val choice: ConfigChoice?, val enabled: Boolean)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Backing out must leave the widget unplaced.
        setResult(RESULT_CANCELED)
        val appWidgetId = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        val className = AppWidgetManager.getInstance(this).getAppWidgetInfo(appWidgetId)?.provider?.className
        val kind = configKindOf(className)
        val snapshot = WidgetStore.load(this)

        val defaultChoice = if (kind == ConfigKind.Milestone) {
            ConfigChoice(null, SourceLabel(SourceLabel.Kind.Upcoming))
        } else {
            ConfigChoice(TodoSource.All.id, SourceLabel(SourceLabel.Kind.All))
        }
        // Board column defaults to the inbox (as on iOS); Next up to everything.
        val sourceFallback = if (className?.contains("BoardColumnWidget") == true) TodoSource.Inbox else TodoSource.All
        val rows: List<Row>
        var checked = -1
        if (snapshot == null) {
            rows = listOf(
                Row(getString(R.string.kh_cfg_signed_out), null, enabled = false),
                Row(getString(R.string.kh_cfg_use_default), defaultChoice, enabled = true),
            )
        } else {
            val choices = if (kind == ConfigKind.Milestone) milestoneChoices(snapshot) else sourceChoices(snapshot)
            rows = choices.map { Row(sourceLabelText(this, it.label), it, enabled = true) }
            val current = if (kind == ConfigKind.Milestone) {
                WidgetConfigStore.milestone(this, appWidgetId)
            } else {
                WidgetConfigStore.source(this, appWidgetId, sourceFallback).id
            }
            checked = preselectedIndex(choices, current)
        }

        setTitle(if (kind == ConfigKind.Milestone) R.string.kh_cfg_title_milestone else R.string.kh_cfg_title_source)
        val adapter = object : ArrayAdapter<String>(this, android.R.layout.simple_list_item_single_choice, rows.map { it.text }) {
            override fun areAllItemsEnabled(): Boolean = rows.all { it.enabled }
            override fun isEnabled(position: Int): Boolean = rows[position].enabled
        }
        val list = ListView(this)
        list.choiceMode = ListView.CHOICE_MODE_SINGLE
        list.adapter = adapter
        if (checked >= 0) list.setItemChecked(checked, true)
        list.setOnItemClickListener { _, _, position, _ ->
            val choice = rows[position].choice ?: return@setOnItemClickListener
            commit(appWidgetId, kind, className, choice)
        }
        setContentView(list)
    }

    private fun commit(appWidgetId: Int, kind: ConfigKind, className: String?, choice: ConfigChoice) {
        if (kind == ConfigKind.Milestone) {
            WidgetConfigStore.setMilestone(this, appWidgetId, choice.id)
        } else {
            WidgetConfigStore.setSource(this, appWidgetId, TodoSource.parse(choice.id) ?: TodoSource.All)
        }
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        val widget: GlanceAppWidget = when {
            kind == ConfigKind.Milestone -> MilestoneWidget()
            className?.contains("BoardColumn") == true -> BoardColumnWidget()
            else -> TodoGlanceWidget()
        }
        val app = applicationContext
        scope.launch {
            try {
                val glanceId = GlanceAppWidgetManager(app).getGlanceIdBy(appWidgetId)
                widget.update(app, glanceId)
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                // The host also sends APPWIDGET_UPDATE after RESULT_OK, so a failed refresh heals itself.
            } finally {
                finish()
            }
        }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
