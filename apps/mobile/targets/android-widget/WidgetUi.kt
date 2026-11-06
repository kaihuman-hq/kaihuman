package com.kaihuman.app

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProviderInfo
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.GlanceTheme
import androidx.glance.LocalContext
import androidx.glance.action.Action
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.updateAll
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.width
import androidx.glance.material3.ColorProviders
import androidx.glance.text.FontFamily
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.color.ColorProvider as DayNightColorProvider
import androidx.glance.unit.ColorProvider
import java.net.URLEncoder
import kotlinx.coroutines.CancellationException

/**
 * Every widget class; each widget agent appends its own `{ XxxWidget() }`. Used by
 * [updateAllWidgets] so a commit refreshes all of them.
 */
val ALL_WIDGETS: List<() -> GlanceAppWidget> = listOf(
    { TodoGlanceWidget() },
    { BoardColumnWidget() },
    { MilestoneWidget() },
    { QuickCaptureWidget() },
    { WeeklyDoneWidget() },
    { InboxWidget() },
    { IdeaPipelineWidget() },
    { KnowledgeCardWidget() },
)

suspend fun updateAllWidgets(context: Context) {
    for (make in ALL_WIDGETS) {
        try {
            make().updateAll(context)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            // One widget failing to refresh must not stop the others.
        }
    }
}

/** Tests replace `now` so layouts and freshness are deterministic. */
object WidgetClock {
    var now: () -> Long = { System.currentTimeMillis() }
}

/** Lets preview tests render the brand fallback on API 31+ where dynamic colour would win. */
object KhForceBrand {
    var enabled = false
}

private val Olive = Color(0xFF4F5E00)
private val Volt = Color(0xFFE6FF4A)
private val Ink = Color(0xFF0C0D0C)

/** Fallback palette (pre-Android 12, or forced): Olive on light, Volt on Ink, as on iOS. */
val KhBrandColors = ColorProviders(
    light = lightColorScheme(
        primary = Olive,
        onPrimary = Color.White,
        primaryContainer = Color(0xFFDDEB8A),
        onPrimaryContainer = Ink,
        secondary = Color(0xFF5B6148),
        onSecondary = Color.White,
        background = Color(0xFFFFFFFF),
        onBackground = Ink,
        surface = Color(0xFFFFFFFF),
        onSurface = Ink,
        surfaceVariant = Color(0xFFE8E9DF),
        surfaceContainer = Color(0xFFFFFFFF),
        secondaryContainer = Color(0xFFE4E8CF),
        onSecondaryContainer = Ink,
        onSurfaceVariant = Color(0xFF45483C),
        outline = Color(0xFF75786B),
        error = Color(0xFFBA1A1A),
        onError = Color.White,
    ),
    dark = darkColorScheme(
        primary = Volt,
        onPrimary = Ink,
        primaryContainer = Color(0xFF3B4500),
        onPrimaryContainer = Volt,
        secondary = Color(0xFFC3C9AB),
        onSecondary = Ink,
        background = Color(0xFF1B1C19),
        onBackground = Color(0xFFF4F5EF),
        surface = Color(0xFF1B1C19),
        onSurface = Color(0xFFF4F5EF),
        surfaceVariant = Color(0xFF2E3029),
        surfaceContainer = Color(0xFF1B1C19),
        secondaryContainer = Color(0xFF3A3D30),
        onSecondaryContainer = Color(0xFFF4F5EF),
        onSurfaceVariant = Color(0xFFC6C8BA),
        outline = Color(0xFF909284),
        error = Color(0xFFFFB4AB),
        onError = Ink,
    ),
)

private fun useDynamic(): Boolean = Build.VERSION.SDK_INT >= 31 && !KhForceBrand.enabled

/** Wraps widget content: dynamic (Material You) colours on Android 12+, brand colours before. */
@Composable
fun KhTheme(content: @Composable () -> Unit) {
    GlanceTheme(colors = if (useDynamic()) GlanceTheme.colors else KhBrandColors, content = content)
}

/** Full-bleed rounded widget background that follows the launcher's corner radius. */
@Composable
fun GlanceModifier.khWidgetSurface(): GlanceModifier {
    var m = this.fillMaxSize().appWidgetBackground().background(GlanceTheme.colors.widgetBackground)
    m = if (Build.VERSION.SDK_INT >= 31) {
        m.cornerRadius(android.R.dimen.system_app_widget_background_radius)
    } else {
        m.cornerRadius(16.dp)
    }
    return m.padding(12.dp)
}

object DeepLinks {
    const val APP = "kaihuman://"
    const val INBOX = "kaihuman://inbox"
    const val BOARD = "kaihuman://board"
    const val IDEAS = "kaihuman://ideas"

    private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8").replace("+", "%20")

    /** kind: todo | note | log | idea */
    fun quick(kind: String): String = "kaihuman://quick-$kind"

    /** Quick-log sheet for one idea; routes that predate `idea` ignore it. */
    fun quickLog(idea: String): String = "kaihuman://quick-log?idea=" + Uri.encode(idea)
    fun board(milestone: String): String = "kaihuman://board?milestone=${enc(milestone)}"
    fun boardItem(item: String): String = "kaihuman://board?item=${enc(item)}"
    fun ideas(status: String): String = "kaihuman://ideas?status=${enc(status)}"

    /** `kaihuman://files/<path>`, one percent-encoded segment at a time. */
    fun file(path: String): String =
        "kaihuman://files/" + path.split("/").filter { it.isNotEmpty() }.joinToString("/") { enc(it) }
}

/** Launches the app on `uri`. The package is pinned so no other app can claim the scheme. */
fun openUri(context: Context, uri: String): Action = actionStartActivity(
    Intent(Intent.ACTION_VIEW, Uri.parse(uri))
        .setPackage(context.packageName)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
)

private fun openAction(context: Context, uri: String): Action = openUri(context, uri)

/** Lock-screen / hub hosts are a privacy surface; home-screen hosts are not. */
fun isLockScreenHost(context: Context, glanceId: GlanceId): Boolean = try {
    val id = GlanceAppWidgetManager(context).getAppWidgetId(glanceId)
    val category = AppWidgetManager.getInstance(context).getAppWidgetOptions(id)
        .getInt(AppWidgetManager.OPTION_APPWIDGET_HOST_CATEGORY, -1)
    category == AppWidgetProviderInfo.WIDGET_CATEGORY_KEYGUARD
} catch (e: Exception) {
    false
}

fun hidesText(context: Context, glanceId: GlanceId, snapshot: WidgetTodoSnapshot?): Boolean =
    snapshot != null && !snapshot.showsLockScreenText && isLockScreenHost(context, glanceId)

/** Clock glyph shown on items whose commit is still queued. */
const val PENDING_GLYPH = "◷"

private val Warning = DayNightColorProvider(day = Color(0xFFB25000), night = Color(0xFFFFD60A))

/**
 * Signed-out placeholder when there is no snapshot, else `content` over the whole-widget app link.
 * Very old data gets a 50% scrim rather than a different layout.
 */
@Composable
fun SnapshotShell(
    snapshot: WidgetTodoSnapshot?,
    nowMs: Long,
    openUri: String = DeepLinks.APP,
    content: @Composable (WidgetTodoSnapshot, Freshness) -> Unit,
) {
    val context = LocalContext.current
    if (snapshot == null) {
        Box(
            modifier = GlanceModifier.fillMaxSize().clickable(openAction(context, DeepLinks.APP)),
            contentAlignment = Alignment.CenterStart,
        ) {
            Text(
                text = "Open kaihuman to sign in",
                style = TextStyle(
                    color = GlanceTheme.colors.onSurface,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )
        }
        return
    }
    val freshness = snapshot.freshness(nowMs)
    Box(modifier = GlanceModifier.fillMaxSize().clickable(openAction(context, openUri))) {
        content(snapshot, freshness)
        if (freshness.isDim) {
            val scrim = GlanceTheme.colors.widgetBackground.getColor(context).copy(alpha = 0.5f)
            Box(modifier = GlanceModifier.fillMaxSize().background(ColorProvider(scrim))) {}
        }
    }
}

/** "Synced 7h ago" with a warning dot once older than 6 h; the text carries the meaning. */
@Composable
fun StaleFooter(freshness: Freshness) {
    if (freshness is Freshness.Fresh) return
    Row(verticalAlignment = Alignment.CenterVertically) {
        Text(text = "●", style = TextStyle(color = Warning, fontSize = 9.sp))
        Spacer(GlanceModifier.width(4.dp))
        Text(
            text = "Synced ${freshness.hours}h ago",
            maxLines = 1,
            style = TextStyle(color = Warning, fontSize = 11.sp, fontWeight = FontWeight.Medium),
        )
    }
}

@Composable
fun WidgetHeader(title: String, trailing: String? = null) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(
            text = title,
            maxLines = 1,
            style = TextStyle(
                color = GlanceTheme.colors.primary,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
            ),
            modifier = GlanceModifier.defaultWeight(),
        )
        if (trailing != null) {
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
        }
    }
}
