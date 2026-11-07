package com.kaihuman.app

import android.content.Context
import androidx.compose.runtime.Composable
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
import androidx.glance.layout.ColumnScope
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.semantics.contentDescription
import androidx.glance.semantics.semantics
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.compose.ui.unit.DpSize

// "Next up": open todos with an interactive check per row. Small, medium and large layouts mirror
// the iOS families (TodoWidgetViews.swift) but use Material You colours and system corner radii.

class TodoGlanceWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(
        setOf(DpSize(110.dp, 110.dp), DpSize(250.dp, 110.dp), DpSize(250.dp, 250.dp)),
    )

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        val source = WidgetConfigStore.source(context, appWidgetIdOf(context, id))
        val hideText = hidesText(context, id, snapshot)
        provideContent {
            KhTheme { NextUpBody(snapshot, WidgetClock.now(), hideText, source) }
        }
    }
}

/** Whole widget including the surface; callers wrap it in [KhTheme] and provide the size. */
@Composable
internal fun NextUpBody(
    snapshot: WidgetTodoSnapshot?,
    nowMs: Long,
    hideText: Boolean,
    source: TodoSource = TodoSource.All,
) {
    val size = LocalSize.current
    val sizeClass = sizeClassOf(size.width.value, size.height.value)
    Column(modifier = GlanceModifier.khWidgetSurface()) {
        SnapshotShell(snapshot, nowMs, DeepLinks.BOARD) { snap, freshness ->
            NextUpContent(snap, freshness, nowMs, hideText, source, sizeClass)
        }
    }
}

@Composable
private fun NextUpContent(
    snap: WidgetTodoSnapshot,
    freshness: Freshness,
    nowMs: Long,
    hideText: Boolean,
    source: TodoSource,
    size: WidgetSizeClass,
) {
    val context = LocalContext.current
    val stale = freshness !is Freshness.Fresh
    val all = snap.items(source)
    val rows = snap.nextUpRows(source, size, stale)
    val doneToday = snap.doneToday(nowMs)
    val empty = khString(context, nextUpEmptyRes(nextUpEmpty(source)))

    Column(modifier = GlanceModifier.fillMaxSize()) {
        when (size) {
            WidgetSizeClass.Small -> {
                Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "${all.size}",
                        maxLines = 1,
                        style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 26.sp, fontWeight = FontWeight.Bold),
                    )
                    Spacer(GlanceModifier.width(4.dp))
                    Text(
                        text = khString(context, R.string.kh_nu_open),
                        maxLines = 1,
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium),
                        modifier = GlanceModifier.defaultWeight(),
                    )
                    AddButton(width = 28.dp)
                }
                if (hideText) {
                    Text(
                        text = khString(context, R.string.kh_nu_done_today, doneToday),
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp),
                    )
                } else if (rows.isEmpty()) {
                    EmptyState(empty, GlanceModifier.defaultWeight())
                } else {
                    TodoRow(rows.first(), GlanceModifier.fillMaxWidth().height(40.dp), 13.sp, maxLines = 2)
                }
                Spacer(GlanceModifier.defaultWeight())
                StaleFooter(freshness)
            }
            WidgetSizeClass.Medium -> {
                NextUpHeader(khString(context, R.string.kh_nu_title), khString(context, R.string.kh_nu_open_count, all.size), height = 24.dp)
                ItemRows(rows, nextUpRowLimit(size, stale), hideText, empty, doneToday, all.size) { item, mod ->
                    TodoRow(item, mod, 12.sp)
                }
                StaleFooter(freshness)
            }
            WidgetSizeClass.Large -> {
                val label = sourceLabelText(context, sourceLabel(source, snap)).uppercase()
                NextUpHeader(
                    "${khString(context, R.string.kh_nu_title)} · $label",
                    khString(context, R.string.kh_nu_open_count, all.size),
                    height = 28.dp,
                )
                ItemRows(rows, nextUpRowLimit(size, stale), hideText, empty, doneToday, all.size) { item, mod ->
                    TodoRow(item, mod, 14.sp, showTag = true)
                }
                Row(modifier = GlanceModifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                    Box(modifier = GlanceModifier.defaultWeight()) {
                        if (stale) {
                            StaleFooter(freshness)
                        } else if (!hideText) {
                            snap.upcomingMilestone?.let { m ->
                                Text(
                                    text = "⚑ " + (m.dueDate?.let { "${m.name} · $it" } ?: m.name),
                                    maxLines = 1,
                                    style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                                )
                            }
                        }
                    }
                    Text(
                        text = khString(context, R.string.kh_nu_done_today, doneToday),
                        maxLines = 1,
                        style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                    )
                }
            }
        }
    }
}

/**
 * The list area shared by Next up and Board column: rows, the empty state, or counts only when
 * text is hidden. Missing rows become weighted spacers so the rows keep one height.
 */
@Composable
internal fun ColumnScope.ItemRows(
    rows: List<WidgetTodoItem>,
    limit: Int,
    hideText: Boolean,
    emptyText: String,
    doneToday: Int,
    openCount: Int,
    row: @Composable (WidgetTodoItem, GlanceModifier) -> Unit,
) {
    val context = LocalContext.current
    when {
        hideText -> Column(modifier = GlanceModifier.fillMaxWidth().defaultWeight(), verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = if (openCount == 1) khString(context, R.string.kh_nu_todos_open_one) else khString(context, R.string.kh_nu_todos_open_many, openCount),
                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 16.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                text = khString(context, R.string.kh_nu_done_today, doneToday),
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp),
            )
        }
        rows.isEmpty() -> EmptyState(emptyText, GlanceModifier.defaultWeight(), subtitle = if (limit > 3) khString(context, R.string.kh_nu_done_today, doneToday) else null)
        else -> {
            rows.forEach { row(it, GlanceModifier.fillMaxWidth().defaultWeight()) }
            repeat(limit - rows.size) { Spacer(GlanceModifier.defaultWeight()) }
        }
    }
}

@Composable
internal fun EmptyState(title: String, modifier: GlanceModifier, subtitle: String? = null) {
    Column(modifier = modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            maxLines = 2,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
        )
        if (subtitle != null) {
            Text(text = subtitle, style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp))
        }
    }
}

@Composable
internal fun NextUpHeader(title: String, trailing: String, height: androidx.compose.ui.unit.Dp) {
    Row(modifier = GlanceModifier.fillMaxWidth().height(height), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold),
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            text = trailing,
            maxLines = 1,
            style = TextStyle(
                color = GlanceTheme.colors.onSurfaceVariant,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = FontFamily.Monospace,
            ),
        )
        AddButton()
    }
}

/** Round "+" with a 40 x 24 dp tap area; opens the quick-add todo sheet. */
@Composable
internal fun AddButton(width: androidx.compose.ui.unit.Dp = 40.dp) {
    val context = LocalContext.current
    Box(
        modifier = GlanceModifier.width(width).height(24.dp)
            .clickable(openUri(context, DeepLinks.quick("todo")))
            .semantics { contentDescription = khString(context, R.string.kh_nu_add_desc) },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = GlanceModifier.size(22.dp).cornerRadius(11.dp).background(GlanceTheme.colors.primaryContainer),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = khString(context, R.string.kh_nu_add),
                style = TextStyle(color = GlanceTheme.colors.onPrimaryContainer, fontSize = 15.sp, fontWeight = FontWeight.Bold),
            )
        }
    }
}

/** One open todo: a 48 dp wide check, then the text. Tapping outside the check opens the item. */
@Composable
internal fun TodoRow(
    item: WidgetTodoItem,
    modifier: GlanceModifier,
    textSize: TextUnit,
    showTag: Boolean = false,
    // Material minimum touch target; the small widget uses it too.
    checkWidth: androidx.compose.ui.unit.Dp = 48.dp,
    maxLines: Int = 1,
) {
    val context = LocalContext.current
    val inProgress = item.status == "in-progress"
    Row(
        modifier = modifier.clickable(openUri(context, DeepLinks.boardItem(item.id))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = GlanceModifier.width(checkWidth).fillMaxHeight()
                .clickable(actionRunCallback<ToggleTodoAction>(actionParametersOf(TodoActionKeys.itemId to item.id)))
                .semantics { contentDescription = khString(context, R.string.kh_nu_complete_item_desc, item.text) },
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = if (inProgress) "◉" else "○",
                style = TextStyle(
                    color = if (inProgress) GlanceTheme.colors.primary else GlanceTheme.colors.onSurfaceVariant,
                    fontSize = (textSize.value + 7f).sp,
                ),
                modifier = GlanceModifier.padding(start = 4.dp),
            )
        }
        Text(
            text = item.text,
            maxLines = maxLines,
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
                text = "  #$tag",
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
    }
}

// String helpers: Glance text takes plain strings, so resolve resources at composition time.

internal fun khString(context: Context, id: Int, vararg args: Any): String = context.getString(id, *args)

internal fun nextUpEmptyRes(copy: EmptyCopy): Int = when (copy) {
    EmptyCopy.NothingInProgress -> R.string.kh_empty_nothing_in_progress
    EmptyCopy.NothingUpNext -> R.string.kh_empty_nothing_up_next
    EmptyCopy.InboxZero -> R.string.kh_empty_inbox_zero
    EmptyCopy.NothingOpenHere -> R.string.kh_empty_nothing_open_here
    EmptyCopy.BacklogEmpty -> R.string.kh_empty_backlog_empty
    EmptyCopy.NothingHere -> R.string.kh_empty_nothing_here
}

internal fun sourceLabelText(context: Context, label: SourceLabel): String = when (label.kind) {
    SourceLabel.Kind.All -> context.getString(R.string.kh_src_all)
    SourceLabel.Kind.Inbox -> context.getString(R.string.kh_src_inbox)
    SourceLabel.Kind.InProgress -> context.getString(R.string.kh_src_in_progress)
    SourceLabel.Kind.Backlog -> context.getString(R.string.kh_src_backlog)
    SourceLabel.Kind.Tag -> context.getString(R.string.kh_src_tag, label.text ?: "")
    SourceLabel.Kind.Milestone -> label.text ?: context.getString(R.string.kh_src_milestone)
    SourceLabel.Kind.Upcoming -> context.getString(R.string.kh_src_upcoming)
}
