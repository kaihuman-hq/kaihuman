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
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.provideContent
import androidx.glance.layout.Box
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.width
import androidx.glance.layout.Row
import androidx.glance.LocalSize
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

private val SMALL = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(180.dp, 110.dp)

class InboxWidget : GlanceAppWidget() {
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
        /** Only counts are shown, so `hideText` changes nothing here. */
        @Composable
        internal fun Body(snapshot: WidgetTodoSnapshot?, nowMs: Long, hideText: Boolean) {
            SnapshotShell(snapshot, nowMs, DeepLinks.INBOX) { snap, freshness ->
                val state = snap.inboxState()
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    WidgetHeader(khString(R.string.kh_w_inbox_title), showsAdd = true)
                    if (state.isZero) {
                        Spacer(GlanceModifier.height(8.dp))
                        EmptyState(khString(R.string.kh_w_inbox_zero))
                        Spacer(GlanceModifier.defaultWeight())
                        StaleFooter(freshness)
                    } else if (LocalSize.current.height < 130.dp) {
                        // 86 dp of content height: no room for the Process button; the whole widget opens the inbox.
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                text = "${state.todos}",
                                maxLines = 1,
                                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 30.sp, fontWeight = FontWeight.Bold),
                            )
                            Spacer(GlanceModifier.width(6.dp))
                            Text(
                                text = khPlural(R.plurals.kh_w_todos, state.todos),
                                maxLines = 1,
                                style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
                            )
                        }
                        Text(
                            text = khString(R.string.kh_w_in_knowledge, state.notes),
                            maxLines = 1,
                            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                        )
                        Spacer(GlanceModifier.defaultWeight())
                        StaleFooter(freshness)
                    } else {
                        Text(
                            text = "${state.todos}",
                            maxLines = 1,
                            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 34.sp, fontWeight = FontWeight.Bold),
                        )
                        Text(
                            text = khPlural(R.plurals.kh_w_todos, state.todos),
                            maxLines = 1,
                            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Medium),
                        )
                        Text(
                            text = khString(R.string.kh_w_in_knowledge, state.notes),
                            maxLines = 1,
                            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 11.sp, fontWeight = FontWeight.Medium),
                        )
                        Spacer(GlanceModifier.defaultWeight())
                        if (freshness is Freshness.Fresh) {
                            val context = LocalContext.current
                            Button(
                                text = khString(R.string.kh_w_process),
                                onClick = openUri(context, DeepLinks.INBOX),
                                colors = ButtonDefaults.buttonColors(
                                    backgroundColor = GlanceTheme.colors.primary,
                                    contentColor = GlanceTheme.colors.onPrimary,
                                ),
                                maxLines = 1,
                            )
                        } else {
                            StaleFooter(freshness)
                        }
                    }
                }
            }
        }
    }
}
