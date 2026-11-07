package com.kaihuman.app

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Bundle
import android.view.View
import android.widget.FrameLayout
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.glance.GlanceModifier
import androidx.glance.appwidget.ExperimentalGlanceRemoteViewsApi
import androidx.glance.appwidget.GlanceRemoteViews
import androidx.glance.layout.Box
import java.io.File
import java.io.FileOutputStream
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders every widget in its supported sizes and states, light and dark, to PNGs plus a contact
 * sheet. Output: $KH_WIDGET_PREVIEW_DIR (default build/widget-previews). Robolectric has no
 * Material You wallpaper colours, so everything but the "dynamic" tile uses the brand palette.
 */
@OptIn(ExperimentalGlanceRemoteViewsApi::class)
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34], application = android.app.Application::class)
class WidgetPreviewRenderTest {
    private class Case(
        val widget: String,
        val state: String,
        val size: DpSize,
        val dynamic: Boolean = false,
        val body: @Composable (WidgetTodoSnapshot?, Long) -> Unit,
    ) {
        val slug get() = "${widget}_${state}_${size.width.value.toInt()}x${size.height.value.toInt()}"
            .lowercase().replace(Regex("[^a-z0-9_]+"), "-")
    }

    private val small = DpSize(110.dp, 110.dp)
    private val medium = DpSize(250.dp, 110.dp)
    private val large = DpSize(250.dp, 250.dp)

    private fun surface(content: @Composable () -> Unit): @Composable () -> Unit = {
        KhTheme { Box(GlanceModifier.khWidgetSurface()) { content() } }
    }

    private fun cases(): List<Case> {
        val out = mutableListOf<Case>()
        fun nextUp(state: String, size: DpSize, dynamic: Boolean = false, hide: Boolean = false) =
            out.add(Case("Next up", state, size, dynamic) { s, now -> KhTheme { NextUpBody(s, now, hide) } })
        fun board(state: String, size: DpSize, source: TodoSource) =
            out.add(Case("Board column", state, size) { s, now -> KhTheme { BoardColumnBody(s, now, false, source) } })
        fun milestone(state: String, size: DpSize) =
            out.add(Case("Milestone", state, size) { s, now -> KhTheme { MilestoneBody(s, now, false, null) } })
        fun capture(state: String, size: DpSize) =
            out.add(Case("Quick capture", state, size) { s, now ->
                surface { QuickCaptureWidget.Body(s, now, false) }()
            })
        fun weekly(state: String, size: DpSize) =
            out.add(Case("Weekly done", state, size) { s, now -> surface { WeeklyDoneWidget.Body(s, now, false) }() })
        fun inbox(state: String, size: DpSize) =
            out.add(Case("Inbox", state, size) { s, now -> surface { InboxWidget.Body(s, now, false) }() })
        fun ideas(state: String, size: DpSize) =
            out.add(Case("Idea pipeline", state, size) { s, now -> surface { IdeaPipelineWidget.Body(s, now, false) }() })
        fun wiki(state: String, size: DpSize, hide: Boolean = false) =
            out.add(Case("Wiki card", state, size) { s, now ->
                surface { KnowledgeCardWidget.Body(s, now, hide, 0) }()
            })

        nextUp("filled", small); nextUp("filled", medium); nextUp("filled", large)
        nextUp("empty", medium); nextUp("stale", medium); nextUp("signed-out", small)
        nextUp("hidden", medium, hide = true); nextUp("dynamic", medium, dynamic = true)
        board("filled", medium, TodoSource.Inbox); board("filled", large, TodoSource.InProgress)
        board("empty", medium, TodoSource.Inbox)
        milestone("filled", small); milestone("filled", medium); milestone("empty", small)
        capture("filled", small); capture("filled", DpSize(250.dp, 60.dp)); capture("stale", DpSize(110.dp, 150.dp))
        weekly("filled", small); weekly("filled", medium); weekly("empty", medium); weekly("stale", medium)
        inbox("filled", small); inbox("filled", DpSize(180.dp, 110.dp)); inbox("empty", small)
        ideas("filled", small); ideas("filled", medium); ideas("empty", medium)
        wiki("filled", medium); wiki("filled", large); wiki("empty", medium)
        wiki("hidden", medium, hide = true)
        return out
    }

    private fun snapshotFor(c: Case): WidgetTodoSnapshot? = when (c.state) {
        "empty" -> emptySnapshot()
        "stale" -> staleSnapshot()
        "signed-out" -> null
        "hidden" -> hiddenTextSnapshot()
        else -> filledSnapshot()
    }

    @After fun reset() {
        KhForceBrand.enabled = false
    }

    private fun render(context: Context, c: Case, night: Boolean): Bitmap {
        val density = context.resources.displayMetrics.density
        KhForceBrand.enabled = !c.dynamic
        val snap = snapshotFor(c)
        val rv = runBlocking {
            GlanceRemoteViews().compose(context, c.size, null, Bundle()) { c.body(snap, PREVIEW_NOW) }.remoteViews
        }
        val w = (c.size.width.value * density).toInt()
        val h = (c.size.height.value * density).toInt()
        val parent = FrameLayout(context)
        val view = rv.apply(context, parent)
        view.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY))
        view.layout(0, 0, w, h)
        val pad = (8 * density).toInt()
        val bmp = Bitmap.createBitmap(w + 2 * pad, h + 2 * pad, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(if (night) 0xFF34373F.toInt() else 0xFFC4C9D2.toInt())
        canvas.translate(pad.toFloat(), pad.toFloat())
        view.draw(canvas)
        return bmp
    }

    private fun savePng(bmp: Bitmap, file: File) {
        file.parentFile?.mkdirs()
        FileOutputStream(file).use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    }

    @Test fun renderContactSheet() {
        WidgetClock.now = { PREVIEW_NOW }
        val dir = File(System.getenv("KH_WIDGET_PREVIEW_DIR")?.takeIf { it.isNotEmpty() } ?: "build/widget-previews")
        dir.deleteRecursively()
        dir.mkdirs()
        val sections = mutableListOf<Triple<String, Boolean, List<Pair<Case, Bitmap>>>>()
        for (night in listOf(false, true)) {
            RuntimeEnvironment.setQualifiers(if (night) "+night-xxhdpi" else "+notnight-xxhdpi")
            val context = RuntimeEnvironment.getApplication()
            val tiles = cases().map { c ->
                val bmp = render(context, c, night)
                savePng(bmp, File(dir, "${c.slug}_${if (night) "dark" else "light"}.png"))
                c to bmp
            }
            sections.add(Triple(if (night) "Dark" else "Light", night, tiles))
        }
        val sheet = contactSheet(sections)
        savePng(sheet, File(dir, "widgets-android.png"))
        assertTrue(File(dir, "widgets-android.png").length() > 0)
    }

    private fun contactSheet(sections: List<Triple<String, Boolean, List<Pair<Case, Bitmap>>>>): Bitmap {
        val scale = 0.5f
        val margin = 24
        val sheetW = 2000
        val captionH = 56
        val titleH = 70
        val text = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 20f; typeface = Typeface.DEFAULT_BOLD }
        val sub = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 17f }
        val title = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 34f; typeface = Typeface.DEFAULT_BOLD }

        // Lay out: flow tiles left to right, wrap at sheetW.
        data class Placed(val bmp: Bitmap, val c: Case, val x: Int, val y: Int, val night: Boolean)
        val placed = mutableListOf<Placed>()
        val heads = mutableListOf<Triple<String, Int, Boolean>>()
        var y = margin
        for ((name, night, tiles) in sections) {
            heads.add(Triple("$name theme", y, night))
            y += titleH
            var x = margin
            var rowH = 0
            for ((c, bmp) in tiles) {
                val tw = maxOf((bmp.width * scale).toInt(), 330)
                val th = (bmp.height * scale).toInt()
                if (x + tw > sheetW - margin) { x = margin; y += rowH + captionH + margin / 2; rowH = 0 }
                placed.add(Placed(bmp, c, x, y, night))
                x += tw + margin
                rowH = maxOf(rowH, th)
            }
            y += rowH + captionH + margin
        }
        val sheet = Bitmap.createBitmap(sheetW, y, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(sheet)
        canvas.drawColor(Color.WHITE)
        val filter = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
        for ((label, top, night) in heads) {
            val bandTop = top - margin / 2
            canvas.drawRect(0f, bandTop.toFloat(), sheetW.toFloat(), (bandTop + titleH).toFloat(), Paint().apply { color = if (night) 0xFF1B1C19.toInt() else 0xFFF5F5F4.toInt() })
            title.color = if (night) 0xFFE6FF4A.toInt() else 0xFF0C0D0C.toInt()
            canvas.drawText("kaihuman Android widgets - $label", margin.toFloat(), (bandTop + 46).toFloat(), title)
        }
        for (p in placed) {
            val tw = (p.bmp.width * scale).toInt()
            val th = (p.bmp.height * scale).toInt()
            canvas.drawBitmap(p.bmp, null, android.graphics.Rect(p.x, p.y, p.x + tw, p.y + th), filter)
            text.color = Color.BLACK; sub.color = 0xFF555555.toInt()
            canvas.drawText(p.c.widget, p.x.toFloat(), (p.y + th + 22).toFloat(), text)
            val theme = if (p.c.dynamic) "Material You" else "brand"
            canvas.drawText("${p.c.state} - ${p.c.size.width.value.toInt()}x${p.c.size.height.value.toInt()} dp - ${if (p.night) "dark" else "light"} - $theme", p.x.toFloat(), (p.y + th + 44).toFloat(), sub)
        }
        return sheet
    }
}
