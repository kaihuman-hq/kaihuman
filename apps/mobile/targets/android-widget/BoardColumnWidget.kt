package com.kaihuman.app

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

// "Board column": one column (or tag / milestone) of the board; Start moves a backlog todo to in
// progress, Done completes one that is already in progress.

class BoardColumnWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(250.dp, 110.dp), DpSize(250.dp, 250.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        val source = WidgetConfigStore.source(context, appWidgetIdOf(context, id), TodoSource.Inbox)
        val hideText = hidesText(context, id, snapshot)
        provideContent {
            KhTheme { BoardColumnBody(snapshot, WidgetClock.now(), hideText, source) }
        }
    }
}

@Composable
internal fun BoardColumnBody(
    snapshot: WidgetTodoSnapshot?,
    nowMs: Long,
    hideText: Boolean,
    source: TodoSource = TodoSource.Inbox,
) {
    val size = LocalSize.current
    val sizeClass = sizeClassOf(size.width.value, size.height.value)
    Column(modifier = GlanceModifier.khWidgetSurface()) {
        SnapshotShell(snapshot, nowMs, DeepLinks.BOARD) { snap, freshness ->
            BoardContent(snap, freshness, hideText, source, sizeClass)
        }
    }
}

@Composable
private fun BoardContent(
    snap: WidgetTodoSnapshot,
    freshness: Freshness,
    hideText: Boolean,
    source: TodoSource,
    size: WidgetSizeClass,
) {
    val context = LocalContext.current
    val stale = freshness !is Freshness.Fresh
    val large = size == WidgetSizeClass.Large
    val all = snap.items(source)
    val rows = snap.boardRows(source, size, stale)
    val limit = boardRowLimit(size, stale)
    Column(modifier = GlanceModifier.fillMaxSize()) {
        val title = sourceLabelText(context, sourceLabel(source, snap)).uppercase()
        // Count only in the header's trailing slot: the "+" belongs to Next up.
        Row(modifier = GlanceModifier.fillMaxWidth().padding(bottom = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = title,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold),
                modifier = GlanceModifier.defaultWeight(),
            )
            Text(
                text = "${all.size}",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace,
                ),
            )
        }
        ItemRows(
            rows, limit, hideText, khString(context, nextUpEmptyRes(boardEmpty(source))), snap.counts.doneToday, all.size,
        ) { item, mod -> BoardRow(item, mod, if (large) 14.sp else 12.sp, showTag = large) }
        StaleFooter(freshness)
    }
}

/** Todo text plus a Start / Done pill; the pill's hit area is the full row height. */
@Composable
private fun BoardRow(item: WidgetTodoItem, modifier: GlanceModifier, textSize: TextUnit, showTag: Boolean) {
    val context = LocalContext.current
    val inProgress = !boardRowStarts(item)
    Row(
        modifier = modifier.clickable(openUri(context, DeepLinks.boardItem(item.id))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = if (inProgress) "◉ " else "",
            style = TextStyle(color = GlanceTheme.colors.primary, fontSize = textSize),
        )
        Text(
            text = item.text,
            maxLines = 1,
            style = TextStyle(
                color = GlanceTheme.colors.onSurface,
                fontSize = textSize,
                fontWeight = if (inProgress) FontWeight.Bold else FontWeight.Medium,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        val tag = if (showTag) item.tags.firstOrNull() else null
        if (tag != null) {
            Text(
                text = " #$tag",
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = (textSize.value - 2f).sp),
            )
        }
        if (item.pending) {
            Text(
                text = " $PENDING_GLYPH",
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = textSize),
            )
        }
        val label = khString(context, if (inProgress) R.string.kh_nu_done else R.string.kh_nu_start)
        val params = actionParametersOf(TodoActionKeys.itemId to item.id)
        Box(
            modifier = GlanceModifier.fillMaxHeight().padding(start = 6.dp)
                .clickable(if (inProgress) actionRunCallback<ToggleTodoAction>(params) else actionRunCallback<StartTodoAction>(params))
                .semantics { contentDescription = "$label: ${item.text}" },
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = GlanceModifier.cornerRadius(14.dp)
                    .background(if (inProgress) GlanceTheme.colors.primary else GlanceTheme.colors.primaryContainer)
                    .padding(horizontal = 10.dp, vertical = 3.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = label,
                    maxLines = 1,
                    style = TextStyle(
                        color = if (inProgress) GlanceTheme.colors.onPrimary else GlanceTheme.colors.onPrimaryContainer,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                )
            }
        }
    }
}
