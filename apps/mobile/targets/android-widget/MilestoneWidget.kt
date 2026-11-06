package com.kaihuman.app

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.LinearProgressIndicator
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

// "Milestone countdown": days left and open versus done todos for one milestone.

class MilestoneWidget : GlanceAppWidget() {
    override val sizeMode = SizeMode.Responsive(setOf(DpSize(110.dp, 110.dp), DpSize(250.dp, 110.dp)))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        val milestoneId = WidgetConfigStore.milestone(context, appWidgetIdOf(context, id))
        val hideText = hidesText(context, id, snapshot)
        provideContent {
            KhTheme { MilestoneBody(snapshot, WidgetClock.now(), hideText, milestoneId) }
        }
    }
}

/** Whole widget including the surface; callers wrap it in [KhTheme] and provide the size. */
@Composable
internal fun MilestoneBody(
    snapshot: WidgetTodoSnapshot?,
    nowMs: Long,
    hideText: Boolean,
    milestoneId: String? = null,
) {
    val size = LocalSize.current
    val medium = sizeClassOf(size.width.value, size.height.value) != WidgetSizeClass.Small
    val milestone = snapshot?.milestone(milestoneId)
    val uri = milestone?.let { DeepLinks.board(it.id) } ?: DeepLinks.BOARD
    Column(modifier = GlanceModifier.khWidgetSurface()) {
        SnapshotShell(snapshot, nowMs, uri) { snap, freshness ->
            if (milestone == null) {
                MilestoneEmpty()
            } else {
                MilestoneContent(milestone, daysWording(snap.daysLeft(milestone.dueDate, nowMs)), freshness, hideText, medium)
            }
        }
    }
}

@Composable
private fun MilestoneEmpty() {
    val context = LocalContext.current
    EmptyState(
        khString(context, R.string.kh_ms_none),
        GlanceModifier.fillMaxSize(),
        subtitle = khString(context, R.string.kh_ms_none_hint),
    )
}

private fun captionRes(c: DayCaption): Int = when (c) {
    DayCaption.DaysLeft -> R.string.kh_ms_days_left
    DayCaption.DayLeft -> R.string.kh_ms_day_left
    DayCaption.DueToday -> R.string.kh_ms_due_today
    DayCaption.DayOverdue -> R.string.kh_ms_day_overdue
    DayCaption.DaysOverdue -> R.string.kh_ms_days_overdue
    DayCaption.NoDueDate -> R.string.kh_ms_no_due_date
}

@Composable
private fun MilestoneContent(
    m: WidgetMilestoneSummary,
    days: DaysWording,
    freshness: Freshness,
    hideText: Boolean,
    medium: Boolean,
) {
    val context = LocalContext.current
    val overdue = days.caption == DayCaption.DayOverdue || days.caption == DayCaption.DaysOverdue
    val numberColor = if (overdue) GlanceTheme.colors.error else GlanceTheme.colors.onSurface
    val counts = khString(context, R.string.kh_ms_open_done, m.open, m.done)

    @Composable
    fun daysBlock() {
        Text(
            text = days.number,
            maxLines = 1,
            style = TextStyle(color = numberColor, fontSize = if (medium) 44.sp else 36.sp, fontWeight = FontWeight.Bold),
        )
        Text(
            text = khString(context, captionRes(days.caption)),
            maxLines = 1,
            style = TextStyle(color = numberColor, fontSize = 12.sp, fontWeight = FontWeight.Medium),
        )
    }

    @Composable
    fun progressBlock() {
        LinearProgressIndicator(
            progress = milestoneFraction(m),
            modifier = GlanceModifier.fillMaxWidth().height(6.dp),
            color = GlanceTheme.colors.primary,
            backgroundColor = GlanceTheme.colors.secondaryContainer,
        )
        Spacer(GlanceModifier.height(4.dp))
        if (freshness is Freshness.Fresh) {
            Text(
                text = counts,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
            )
        } else {
            StaleFooter(freshness)
        }
    }

    @Composable
    fun nameBlock() {
        Text(
            text = khString(context, R.string.kh_ms_title),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.primary, fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        if (!hideText) {
            Text(
                text = m.name,
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            )
        }
    }

    if (medium) {
        Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
            Column(modifier = GlanceModifier.padding(end = 16.dp)) { daysBlock() }
            Column(modifier = GlanceModifier.defaultWeight()) {
                nameBlock()
                Spacer(GlanceModifier.height(10.dp))
                progressBlock()
            }
        }
    } else {
        Column(modifier = GlanceModifier.fillMaxSize()) {
            nameBlock()
            Spacer(GlanceModifier.height(2.dp))
            daysBlock()
            Spacer(GlanceModifier.defaultWeight())
            progressBlock()
        }
    }
}
