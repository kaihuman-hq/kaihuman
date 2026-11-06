package com.kaihuman.app

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.Button
import androidx.glance.ButtonDefaults
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxHeight
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.width
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

private val GRID = DpSize(110.dp, 110.dp)
private val ROW = DpSize(250.dp, 60.dp)
private val GRID_WITH_FOOTER = DpSize(110.dp, 150.dp)

/** Below this height the four buttons sit in one row instead of a 2x2 grid. */
private val ROW_MAX_HEIGHT = 90.dp
private val FOOTER_MIN_HEIGHT = 130.dp

class QuickCaptureWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(ROW, GRID, GRID_WITH_FOOTER))

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
        /** Capture never needs data, so there is no signed-out screen; only the footer says why it is stale. */
        @Composable
        internal fun Body(snapshot: WidgetTodoSnapshot?, nowMs: Long, hideText: Boolean) {
            val size = LocalSize.current
            val kinds = listOf(
                Triple("todo", R.string.kh_w_capture_todo, true),
                Triple("note", R.string.kh_w_capture_note, false),
                Triple("log", R.string.kh_w_capture_log, false),
                Triple("idea", R.string.kh_w_capture_idea, false),
            )
            if (size.height < ROW_MAX_HEIGHT) {
                Row(modifier = GlanceModifier.fillMaxSize(), verticalAlignment = Alignment.CenterVertically) {
                    kinds.forEachIndexed { i, (kind, label, primary) ->
                        if (i > 0) Spacer(GlanceModifier.width(6.dp))
                        CaptureButton(kind, label, primary, GlanceModifier.defaultWeight().fillMaxHeight())
                    }
                }
            } else {
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    Column(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
                        for (rowStart in listOf(0, 2)) {
                            if (rowStart > 0) Spacer(GlanceModifier.height(6.dp))
                            Row(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
                                for (i in rowStart..rowStart + 1) {
                                    val (kind, label, primary) = kinds[i]
                                    if (i % 2 == 1) Spacer(GlanceModifier.width(6.dp))
                                    CaptureButton(kind, label, primary, GlanceModifier.defaultWeight().fillMaxHeight())
                                }
                            }
                        }
                    }
                    if (size.height >= FOOTER_MIN_HEIGHT) {
                        Spacer(GlanceModifier.height(6.dp))
                        Footer(snapshot, nowMs)
                    }
                }
            }
        }
    }
}

@Composable
private fun Footer(snapshot: WidgetTodoSnapshot?, nowMs: Long) {
    val context = LocalContext.current
    if (snapshot == null) {
        Text(
            text = khString(R.string.kh_w_sign_in),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
            modifier = GlanceModifier.clickable(openUri(context, DeepLinks.APP)),
        )
    } else {
        StaleFooter(snapshot.freshness(nowMs))
    }
}

@Composable
private fun CaptureButton(kind: String, label: Int, primary: Boolean, modifier: GlanceModifier) {
    val context = LocalContext.current
    val colors = if (primary) {
        ButtonDefaults.buttonColors(
            backgroundColor = GlanceTheme.colors.primary,
            contentColor = GlanceTheme.colors.onPrimary,
        )
    } else {
        ButtonDefaults.buttonColors(
            backgroundColor = GlanceTheme.colors.secondaryContainer,
            contentColor = GlanceTheme.colors.onSecondaryContainer,
        )
    }
    Button(
        text = khString(label),
        onClick = openUri(context, DeepLinks.quick(kind)),
        modifier = modifier,
        colors = colors,
        maxLines = 1,
    )
}
