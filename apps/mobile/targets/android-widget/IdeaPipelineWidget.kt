package com.kaihuman.app

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.Button
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.clickable
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
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle

private val SMALL = DpSize(110.dp, 110.dp)
private val MEDIUM = DpSize(250.dp, 110.dp)
private val WIDE_MIN_WIDTH = 200.dp

class IdeaPipelineWidget : GlanceAppWidget() {
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
        @Composable
        internal fun Body(snapshot: WidgetTodoSnapshot?, nowMs: Long, hideText: Boolean) {
            SnapshotShell(snapshot, nowMs, DeepLinks.IDEAS) { snap, freshness ->
                val stages = snap.pipelineStages()
                val hot = snap.ideas?.hot?.firstOrNull()
                Column(modifier = GlanceModifier.fillMaxSize()) {
                    WidgetHeader(khString(R.string.kh_w_ideas_title))
                    Spacer(GlanceModifier.height(6.dp))
                    when {
                        stages.isEmpty() ->
                            EmptyState(khString(R.string.kh_w_no_ideas), khString(R.string.kh_w_no_ideas_sub))
                        LocalSize.current.width >= WIDE_MIN_WIDTH ->
                            Row(modifier = GlanceModifier.defaultWeight().fillMaxWidth()) {
                                Column(modifier = GlanceModifier.defaultWeight().fillMaxHeight()) {
                                    StageTiles(stages)
                                    Spacer(GlanceModifier.defaultWeight())
                                    StaleFooter(freshness)
                                }
                                Spacer(GlanceModifier.width(10.dp))
                                HotIdea(hot, hideText, GlanceModifier.width(110.dp).fillMaxHeight())
                            }
                        else -> {
                            stages.take(4).forEach { StageRow(it) }
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
private fun StageRow(stage: IdeaStage) {
    val context = LocalContext.current
    Row(
        modifier = GlanceModifier.fillMaxWidth().padding(vertical = 2.dp).clickable(openUri(context, DeepLinks.ideas(stage.status))),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = stageLabel(stage.status),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 12.sp, fontWeight = FontWeight.Medium),
            modifier = GlanceModifier.defaultWeight(),
        )
        Text(
            text = "${stage.count}",
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurface, fontSize = 13.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace),
        )
    }
}

@Composable
private fun StageTiles(stages: List<IdeaStage>) {
    val context = LocalContext.current
    Row(modifier = GlanceModifier.fillMaxWidth()) {
        stages.take(4).forEachIndexed { i, stage ->
            if (i > 0) Spacer(GlanceModifier.width(6.dp))
            Column(
                modifier = GlanceModifier
                    .defaultWeight()
                    .padding(vertical = 6.dp)
                    .background(GlanceTheme.colors.secondaryContainer)
                    .cornerRadius(10.dp)
                    .clickable(openUri(context, DeepLinks.ideas(stage.status))),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    text = "${stage.count}",
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSecondaryContainer, fontSize = 20.sp, fontWeight = FontWeight.Bold),
                )
                Text(
                    text = stageLabel(stage.status),
                    maxLines = 1,
                    style = TextStyle(color = GlanceTheme.colors.onSecondaryContainer, fontSize = 10.sp, fontWeight = FontWeight.Medium),
                )
            }
        }
    }
}

@Composable
private fun HotIdea(hot: WidgetHotIdea?, hideText: Boolean, modifier: GlanceModifier) {
    val context = LocalContext.current
    Column(modifier = modifier.clickable(openUri(context, DeepLinks.IDEAS))) {
        Text(
            text = hot?.level?.uppercase() ?: khString(R.string.kh_w_hot),
            maxLines = 1,
            style = TextStyle(color = GlanceTheme.colors.onSurfaceVariant, fontSize = 10.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(GlanceModifier.height(4.dp))
        val text = when {
            hot == null -> khString(R.string.kh_w_nothing_hot)
            hideText -> khString(R.string.kh_w_text_hidden)
            else -> hot.title
        }
        Text(
            text = text,
            maxLines = 4,
            style = TextStyle(
                color = if (hot == null || hideText) GlanceTheme.colors.onSurfaceVariant else GlanceTheme.colors.onSurface,
                fontSize = 13.sp,
                fontWeight = if (hot == null) FontWeight.Medium else FontWeight.Bold,
            ),
        )
        if (hot != null) {
            Spacer(GlanceModifier.height(6.dp))
            // Log works without showing the title, so it stays when text is hidden.
            Button(text = khString(R.string.kh_w_log), onClick = openUri(context, DeepLinks.quickLog(hot.slug)))
        }
    }
}
