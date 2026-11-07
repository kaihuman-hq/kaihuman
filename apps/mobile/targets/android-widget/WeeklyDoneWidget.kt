package com.kaihuman.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RectF
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider

private val SMALL = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val WIDE_MIN_WIDTH = 200.dp

private const val RING_PX = 192
private const val RING_STROKE_FRACTION = 0.11f

/** Draws the ring into a bitmap; Glance has no arc primitive. Colours are already resolved. */
internal fun drawRing(done: Int, goal: Int, accent: Int, track: Int, sizePx: Int = RING_PX): Bitmap {
    val bitmap = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val stroke = sizePx * RING_STROKE_FRACTION
    val inset = stroke / 2f
    val oval = RectF(inset, inset, sizePx - inset, sizePx - inset)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        style = Paint.Style.STROKE
        strokeWidth = stroke
        strokeCap = Paint.Cap.ROUND
    }
    paint.color = track
    canvas.drawArc(oval, 0f, 360f, false, paint)
    val arc = ringArc(done, goal)
    if (arc.sweepAngle > 0f) {
        paint.color = accent
        canvas.drawArc(oval, arc.startAngle, arc.sweepAngle, false, paint)
    }
    return bitmap
}

class WeeklyDoneWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(SMALL, MEDIUM))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        val hide = hidesText(context, id, snapshot)
        provideContent {
            KhTheme {
                Box(modifier = GlanceModifier.khWidgetSurface()) {
                    Body(snapshot, WidgetClock.now(), hide)
                }
            }
        }
    }

    companion object {
        /** Counts and the ring carry no todo text, so `hideText` changes nothing here. */
        @Composable
        internal fun Body(snapshot: WidgetTodoSnapshot?, nowMs: Long, hideText: Boolean) {
            SnapshotShell(snapshot, nowMs, DeepLinks.BOARD) { snap, freshness ->
                val wide = LocalSize.current.width >= WIDE_MIN_WIDTH
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    WidgetHeader(khString(R.string.kh_w_this_week))
                    Spacer(GlanceModifier.height(4.dp))
                    if (wide) {
                        Row(modifier = GlanceModifier.defaultWeight().fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Ring(snap.doneThisWeek, snap.weeklyGoal)
                                Spacer(GlanceModifier.height(4.dp))
                                Caption(snap, freshness)
                            }
                            Spacer(GlanceModifier.width(16.dp))
                            Bars(snap, nowMs, GlanceModifier.defaultWeight())
                        }
                    } else {
                        Column(modifier = GlanceModifier.defaultWeight().fillMaxSize(), horizontalAlignment = Alignment.CenterHorizontally) {
                            Ring(snap.doneThisWeek, snap.weeklyGoal)
                            Spacer(GlanceModifier.height(4.dp))
                            Caption(snap, freshness)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun Caption(snap: WidgetTodoSnapshot, freshness: Freshness) {
    if (freshness is Freshness.Fresh) {
        Text(
            text = khString(R.string.kh_w_day_streak, snap.streakDays),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 11.sp, fontWeight = FontWeight.Medium),
        )
    } else {
        StaleFooter(freshness)
    }
}

@Composable
private fun Ring(done: Int, goal: Int) {
    val context = LocalContext.current
    val accent = GlanceTheme.colors.primary.getColor(context).toArgb()
    val track = GlanceTheme.colors.onSurface.getColor(context).copy(alpha = 0.15f).toArgb()
    val bitmap = drawRing(done, goal, accent, track)
    Box(modifier = GlanceModifier.size(64.dp), contentAlignment = Alignment.Center) {
        Image(
            provider = ImageProvider(bitmap),
            contentDescription = khString(R.string.kh_w_ring_desc, done, goal),
            modifier = GlanceModifier.size(64.dp),
        )
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "$done",
                maxLines = 1,
                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 18.sp, fontWeight = FontWeight.Bold),
            )
            Text(
                text = "/$goal",
                maxLines = 1,
                style = TextStyle(
                    color = GlanceTheme.colors.onSurfaceVariant,
                    fontSize = 9.sp,
                    fontWeight = FontWeight.Medium,
                    fontFamily = FontFamily.Monospace,
                ),
            )
        }
    }
}

@Composable
private fun Bars(snap: WidgetTodoSnapshot, nowMs: Long, modifier: GlanceModifier) {
    val context = LocalContext.current
    val accent = GlanceTheme.colors.primary.getColor(context)
    val past = ColorProvider(accent.copy(alpha = 0.55f))
    val track = ColorProvider(GlanceTheme.colors.onSurface.getColor(context).copy(alpha = 0.15f))
    val bars = weekBars(snap.stats?.doneByDay ?: emptyList(), snap.weekdayIndex(nowMs))
    Row(
        modifier = modifier.fillMaxHeight(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalAlignment = Alignment.Bottom,
    ) {
        bars.forEach { bar ->
            val color = when {
                bar.isFuture -> track
                bar.isToday -> GlanceTheme.colors.primary
                else -> past
            }
            Column(modifier = GlanceModifier.width(18.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = GlanceModifier
                        .width(10.dp)
                        .height(maxOf(3f, 30f * bar.fraction).dp)
                        .background(color)
                        .cornerRadius(2.dp),
                ) {}
                Spacer(GlanceModifier.height(2.dp))
                // Today is bold so it reads without colour.
                Text(
                    text = WEEKDAY_LETTERS[bar.index],
                    style = TextStyle(
                        color = if (bar.isToday) GlanceTheme.colors.primary else GlanceTheme.colors.onSurfaceVariant,
                        fontSize = 9.sp,
                        fontWeight = if (bar.isToday) FontWeight.Bold else FontWeight.Medium,
                    ),
                )
            }
        }
    }
}
