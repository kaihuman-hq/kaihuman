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
import androidx.glance.LocalSize
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
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

private val MEDIUM = DpSize(250.dp, 110.dp)
private val LARGE = DpSize(250.dp, 250.dp)
private val LARGE_MIN_HEIGHT = 200.dp

class KnowledgeCardWidget : GlanceAppWidget() {
    override val sizeMode: SizeMode = SizeMode.Responsive(setOf(MEDIUM, LARGE))

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        val hide = hidesText(context, id, snapshot)
        val offset = WidgetConfigStore.cardOffset(context, appWidgetIdOf(context, id))
        provideContent {
            KhTheme {
                Box(modifier = GlanceModifier.khWidgetSurface()) {
                    Body(snapshot, WidgetClock.now(), hide, offset)
                }
            }
        }
    }

    companion object {
        /** `cardOffset` is the number of "Next" taps (WidgetConfigStore.cardOffset). */
        @Composable
        internal fun Body(snapshot: WidgetTodoSnapshot?, nowMs: Long, hideText: Boolean, cardOffset: Int = 0) {
            val card = snapshot?.card(nowMs, cardOffset)
            val link = if (card != null && !hideText) DeepLinks.file(card.path) else DeepLinks.APP
            SnapshotShell(snapshot, nowMs, link) { _, freshness ->
                val large = LocalSize.current.height >= LARGE_MIN_HEIGHT
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                        Box(modifier = GlanceModifier.defaultWeight()) { WidgetHeader(khString(R.string.kh_w_knowledge_title)) }
                        if (card != null) {
                            Button(
                                text = khString(R.string.kh_w_next),
                                onClick = actionRunCallback<NextKnowledgeCardAction>(),
                                colors = ButtonDefaults.buttonColors(
                                    backgroundColor = GlanceTheme.colors.secondaryContainer,
                                    contentColor = GlanceTheme.colors.onSecondaryContainer,
                                ),
                                maxLines = 1,
                            )
                        }
                    }
                    Spacer(GlanceModifier.height(4.dp))
                    if (card == null) {
                        EmptyState(khString(R.string.kh_w_no_cards), khString(R.string.kh_w_no_cards_sub))
                    } else {
                        Text(
                            text = if (hideText) khString(R.string.kh_w_text_hidden) else card.title,
                            maxLines = 2,
                            style = TextStyle(
                                color = if (hideText) GlanceTheme.colors.onSurfaceVariant else GlanceTheme.colors.onSurface,
                                fontSize = if (large) 20.sp else 16.sp,
                                fontWeight = FontWeight.Bold,
                            ),
                        )
                        if (!hideText) {
                            Spacer(GlanceModifier.height(4.dp))
                            Text(
                                text = card.excerpt,
                                maxLines = if (large) 9 else 3,
                                style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = if (large) 14.sp else 12.sp),
                            )
                        }
                        Spacer(GlanceModifier.defaultWeight())
                        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                            if (!hideText) {
                                card.tags.take(3).forEach { TagChip(it) }
                            }
                            Spacer(GlanceModifier.defaultWeight())
                            StaleFooter(freshness)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TagChip(tag: String) {
    Box(
        modifier = GlanceModifier
            .padding(end = 4.dp)
            .background(GlanceTheme.colors.secondaryContainer)
            .cornerRadius(8.dp)
            .padding(horizontal = 6.dp, vertical = 2.dp),
    ) {
        Text(
            text = "#$tag",
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSecondaryContainer, fontSize = 10.sp, fontWeight = FontWeight.Medium),
        )
    }
}

/** Advances the wiki card by one, then redraws just this widget instance. */
class NextKnowledgeCardAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        WidgetConfigStore.bump(context, appWidgetIdOf(context, glanceId))
        KnowledgeCardWidget().update(context, glanceId)
    }
}
