package com.kaihuman.app

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.ActionParameters
import androidx.glance.action.actionParametersOf
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.action.actionRunCallback
import androidx.glance.appwidget.action.actionStartActivity
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.padding
import androidx.glance.layout.height
import androidx.glance.text.FontFamily
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import org.json.JSONArray
import org.json.JSONObject

// Names must match apps/mobile/src/adapters/widget-bridge.ts.
const val PREFS_NAME = "kaihuman_widget"
const val WIDGET_TODOS_KEY = "widget-todos.json"
const val PENDING_MUTATIONS_KEY = "pending-widget-mutations.json"
const val GITHUB_TOKEN_KEY = "github-token"

// Mirrors WidgetTodoItem in packages/core/src/widget-sync.ts.
data class WidgetTodoItem(
    val id: String,
    val filePath: String,
    val indexInFile: Int,
    val text: String,
    val status: String, // "backlog" | "in-progress" | "done" | "rejected"
    val tags: List<String>,
    val milestoneId: String?,
    val milestoneName: String?,
    val milestoneDueDate: String?,
    val updatedAt: Long?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id)
        put("filePath", filePath)
        put("indexInFile", indexInFile)
        put("text", text)
        put("status", status)
        put("tags", JSONArray(tags))
        milestoneId?.let { put("milestoneId", it) }
        milestoneName?.let { put("milestoneName", it) }
        milestoneDueDate?.let { put("milestoneDueDate", it) }
        updatedAt?.let { put("updatedAt", it) }
    }

    companion object {
        fun fromJson(o: JSONObject): WidgetTodoItem {
            val tagArray = o.optJSONArray("tags") ?: JSONArray()
            return WidgetTodoItem(
                id = o.getString("id"),
                filePath = o.getString("filePath"),
                indexInFile = o.getInt("indexInFile"),
                text = o.getString("text"),
                status = o.getString("status"),
                tags = (0 until tagArray.length()).map { tagArray.getString(it) },
                milestoneId = o.optString("milestoneId").ifEmpty { null },
                milestoneName = o.optString("milestoneName").ifEmpty { null },
                milestoneDueDate = o.optString("milestoneDueDate").ifEmpty { null },
                updatedAt = if (o.has("updatedAt")) o.getLong("updatedAt") else null,
            )
        }
    }
}

data class WidgetMilestone(val id: String, val name: String, val dueDate: String?)

data class WidgetCounts(val inbox: Int, val inProgress: Int, val backlog: Int, val doneToday: Int)

data class WidgetFile(val sha: String, val content: String)

// Mirrors WidgetTodoSnapshot in packages/core/src/widget-sync.ts.
data class WidgetTodoSnapshot(
    val updatedAt: Long,
    val repoFullName: String,
    val branch: String,
    val appFolder: String, // ".kh" | ".lifeos"
    val upcomingMilestone: WidgetMilestone?,
    val counts: WidgetCounts,
    val items: List<WidgetTodoItem>,
    val files: Map<String, WidgetFile>,
    // Raw JSON as read; keys this class does not model (schema v2+) survive a rewrite.
    val raw: JSONObject? = null,
) {
    fun toJson(): JSONObject = JSONObject(raw?.toString() ?: "{}").apply {
        put("updatedAt", updatedAt)
        put("repoFullName", repoFullName)
        put("branch", branch)
        put("appFolder", appFolder)
        upcomingMilestone?.let {
            put(
                "upcomingMilestone",
                JSONObject().apply {
                    put("id", it.id)
                    put("name", it.name)
                    it.dueDate?.let { d -> put("dueDate", d) }
                },
            )
        }
        put(
            "counts",
            JSONObject().apply {
                put("inbox", counts.inbox)
                put("inProgress", counts.inProgress)
                put("backlog", counts.backlog)
                put("doneToday", counts.doneToday)
                // Preserve v2 counts (knowledgeInbox, doneThisWeek) from the raw snapshot.
                raw?.optJSONObject("counts")?.let { old ->
                    for (key in old.keys()) if (!has(key)) put(key, old.get(key))
                }
            },
        )
        put("items", JSONArray().also { arr -> items.forEach { arr.put(it.toJson()) } })
        put(
            "files",
            JSONObject().also { obj ->
                files.forEach { (path, f) ->
                    obj.put(path, JSONObject().apply { put("sha", f.sha); put("content", f.content) })
                }
            },
        )
    }

    companion object {
        fun fromJson(o: JSONObject): WidgetTodoSnapshot {
            val itemArray = o.optJSONArray("items") ?: JSONArray()
            val c = o.getJSONObject("counts")
            val m = o.optJSONObject("upcomingMilestone")
            val fileObj = o.optJSONObject("files") ?: JSONObject()
            val files = HashMap<String, WidgetFile>()
            for (path in fileObj.keys()) {
                val f = fileObj.getJSONObject(path)
                files[path] = WidgetFile(f.getString("sha"), f.getString("content"))
            }
            return WidgetTodoSnapshot(
                updatedAt = o.getLong("updatedAt"),
                repoFullName = o.getString("repoFullName"),
                branch = o.getString("branch"),
                appFolder = o.getString("appFolder"),
                upcomingMilestone = m?.let {
                    WidgetMilestone(
                        it.getString("id"),
                        it.getString("name"),
                        it.optString("dueDate").ifEmpty { null },
                    )
                },
                counts = WidgetCounts(
                    c.getInt("inbox"),
                    c.getInt("inProgress"),
                    c.getInt("backlog"),
                    c.getInt("doneToday"),
                ),
                items = (0 until itemArray.length()).map { WidgetTodoItem.fromJson(itemArray.getJSONObject(it)) },
                files = files,
                raw = o,
            )
        }
    }
}

object WidgetStore {
    fun load(context: Context): WidgetTodoSnapshot? {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(WIDGET_TODOS_KEY, null) ?: return null
        return try {
            WidgetTodoSnapshot.fromJson(JSONObject(raw))
        } catch (e: Exception) {
            null
        }
    }

    fun save(context: Context, snapshot: WidgetTodoSnapshot) {
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(WIDGET_TODOS_KEY, snapshot.toJson().toString())
            .apply()
    }
}

private val NEXUS_BG = Color(0xFF0A0A0F)
private val NEXUS_GREEN = Color(0xFF00FF00)
private val NEXUS_CYAN = Color(0xFF00FFFF)
private val NEXUS_MUTED = Color(0xFF8A8A99)
private const val MAX_TASKS = 5

class TodoGlanceWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val snapshot = WidgetStore.load(context)
        provideContent { WidgetContent(context, snapshot) }
    }

    @Composable
    private fun WidgetContent(context: Context, snapshot: WidgetTodoSnapshot?) {
        val mono = FontFamily.Monospace
        val open = snapshot?.items.orEmpty().filter { it.status == "backlog" || it.status == "in-progress" }
        Column(
            modifier = GlanceModifier.fillMaxSize().background(NEXUS_BG).padding(12.dp),
        ) {
            Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    text = "KAIHUMAN // TODOS",
                    style = TextStyle(color = androidx.glance.unit.ColorProvider(NEXUS_GREEN), fontFamily = mono, fontSize = 12.sp),
                    modifier = GlanceModifier.defaultWeight(),
                )
                Text(
                    text = "+",
                    style = TextStyle(color = androidx.glance.unit.ColorProvider(NEXUS_GREEN), fontFamily = mono, fontSize = 18.sp),
                    modifier = GlanceModifier.clickable(
                        actionStartActivity(
                            Intent(Intent.ACTION_VIEW, Uri.parse("kaihuman://quick-todo")).setPackage(context.packageName),
                        ),
                    ),
                )
            }
            Spacer(modifier = GlanceModifier.height(4.dp))
            if (open.isEmpty()) {
                Text(
                    text = if (snapshot == null) "open kaihuman to sync" else "all clear",
                    style = TextStyle(color = androidx.glance.unit.ColorProvider(NEXUS_MUTED), fontFamily = mono, fontSize = 12.sp),
                )
            }
            open.take(MAX_TASKS).forEach { item ->
                val inProgress = item.status == "in-progress"
                Row(
                    modifier = GlanceModifier.fillMaxWidth().padding(vertical = 3.dp).clickable(
                        actionRunCallback<ToggleTodoAction>(actionParametersOf(itemIdKey to item.id)),
                    ),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = if (inProgress) "[>] " else "[ ] ",
                        style = TextStyle(
                            color = androidx.glance.unit.ColorProvider(if (inProgress) NEXUS_CYAN else NEXUS_MUTED),
                            fontFamily = mono,
                            fontSize = 13.sp,
                        ),
                    )
                    Text(
                        text = item.text,
                        maxLines = 1,
                        style = TextStyle(color = androidx.glance.unit.ColorProvider(Color.White), fontFamily = mono, fontSize = 13.sp),
                    )
                }
            }
        }
    }

    companion object {
        val itemIdKey = ActionParameters.Key<String>("itemId")
    }
}
