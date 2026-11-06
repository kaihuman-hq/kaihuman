package com.kaihuman.app

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

// Names must match apps/mobile/src/adapters/widget-bridge.ts.
const val PREFS_NAME = "kaihuman_widget"
const val WIDGET_TODOS_KEY = "widget-todos.json"
const val PENDING_MUTATIONS_KEY = "pending-widget-mutations.json"
const val GITHUB_TOKEN_KEY = "github-token"
const val PENDING_URL_KEY = "pending-url"

// Android only READS snapshots written by the app (packages/core/src/widget-sync.ts), but the
// optimistic todo edits rewrite the file. Every class keeps its source JSON in `raw` so keys this
// code does not model (newer schema versions) survive that rewrite.

/** org.json maps JSON null to the string "null"; treat it as absent instead. */
internal fun JSONObject.str(key: String): String? =
    if (isNull(key)) null else optString(key).ifEmpty { null }

internal fun JSONObject.intOrNull(key: String): Int? = if (isNull(key)) null else optInt(key)

internal fun JSONObject.copyOf(): JSONObject = JSONObject(toString())

private fun JSONObject.objects(key: String): List<JSONObject> {
    val arr = optJSONArray(key) ?: return emptyList()
    return (0 until arr.length()).mapNotNull { arr.optJSONObject(it) }
}

private fun JSONObject.strings(key: String): List<String> {
    val arr = optJSONArray(key) ?: return emptyList()
    return (0 until arr.length()).mapNotNull { i -> if (arr.isNull(i)) null else arr.optString(i) }
}

// Mirrors WidgetTodoItem in packages/core/src/widget-sync.ts.
data class WidgetTodoItem(
    val id: String,
    val filePath: String,
    val indexInFile: Int,
    val text: String,
    val status: String, // "backlog" | "in-progress" | "done" | "rejected"
    val tags: List<String> = emptyList(),
    val milestoneId: String? = null,
    val milestoneName: String? = null,
    val milestoneDueDate: String? = null,
    val updatedAt: Long? = null,
    val priority: String? = null,
    /** Set by the widget when a toggle/move could not be committed yet. */
    val pending: Boolean = false,
    val raw: JSONObject? = null,
) {
    fun toJson(): JSONObject = (raw?.copyOf() ?: JSONObject()).apply {
        put("id", id)
        put("filePath", filePath)
        put("indexInFile", indexInFile)
        put("text", text)
        put("status", status)
        put("tags", JSONArray(tags))
        putOrRemove("milestoneId", milestoneId)
        putOrRemove("milestoneName", milestoneName)
        putOrRemove("milestoneDueDate", milestoneDueDate)
        putOrRemove("updatedAt", updatedAt)
        putOrRemove("priority", priority)
        if (pending) put("pending", true) else remove("pending")
    }

    companion object {
        /** Null when the entry lacks the fields a widget cannot do without. */
        fun fromJson(o: JSONObject): WidgetTodoItem? {
            val id = o.str("id") ?: return null
            val text = o.str("text") ?: return null
            return WidgetTodoItem(
                id = id,
                filePath = o.str("filePath") ?: return null,
                indexInFile = o.optInt("indexInFile", 0),
                text = text,
                status = o.str("status") ?: "backlog",
                tags = o.strings("tags"),
                milestoneId = o.str("milestoneId"),
                milestoneName = o.str("milestoneName"),
                milestoneDueDate = o.str("milestoneDueDate"),
                updatedAt = if (o.isNull("updatedAt")) null else o.optLong("updatedAt"),
                priority = o.str("priority"),
                pending = o.optBoolean("pending", false),
                raw = o,
            )
        }
    }
}

private fun JSONObject.putOrRemove(key: String, value: Any?) {
    if (value == null) remove(key) else put(key, value)
}

data class WidgetMilestone(val id: String, val name: String, val dueDate: String?)

data class WidgetCounts(
    val inbox: Int,
    val inProgress: Int,
    val backlog: Int,
    val doneToday: Int,
    val knowledgeInbox: Int? = null,
    val doneThisWeek: Int? = null,
)

data class WidgetStats(val doneByDay: List<Int>, val streakDays: Int, val weeklyGoal: Int?)

data class WidgetMilestoneSummary(
    val id: String,
    val name: String,
    val dueDate: String?,
    val open: Int,
    val done: Int,
)

data class WidgetHotIdea(val slug: String, val title: String, val level: String)

data class WidgetIdeas(val byStatus: Map<String, Int>, val hot: List<WidgetHotIdea>)

data class WidgetCard(val path: String, val title: String, val excerpt: String, val tags: List<String>)

data class WidgetHabit(
    val path: String,
    val name: String,
    val doneToday: Boolean,
    val streakDays: Int,
    val pending: Boolean = false,
)

data class WidgetFile(val sha: String, val content: String)

// Mirrors WidgetTodoSnapshot in packages/core/src/widget-sync.ts. v1 files have no schemaVersion
// and none of the optional fields.
data class WidgetTodoSnapshot(
    val schemaVersion: Int = 1,
    val updatedAt: Long,
    val repoFullName: String,
    val branch: String,
    val appFolder: String = ".kh", // ".kh" | ".lifeos"
    val upcomingMilestone: WidgetMilestone? = null,
    val counts: WidgetCounts,
    val stats: WidgetStats? = null,
    val milestones: List<WidgetMilestoneSummary>? = null,
    val tags: List<String>? = null,
    val lockScreenText: Boolean? = null,
    val timeZone: String? = null,
    val items: List<WidgetTodoItem> = emptyList(),
    val files: Map<String, WidgetFile> = emptyMap(),
    val ideas: WidgetIdeas? = null,
    val cards: List<WidgetCard>? = null,
    val habits: List<WidgetHabit>? = null,
    // Raw JSON as read; keys this class does not model survive a rewrite.
    val raw: JSONObject? = null,
) {
    /**
     * Android only edits updatedAt, counts, items and files. The read-only v2 sections are written
     * from the model only when no raw copy exists, so unknown nested keys in `raw` are kept.
     */
    fun toJson(): JSONObject {
        val out = raw?.copyOf() ?: JSONObject()
        fun fresh(key: String) = raw == null || !raw.has(key)
        out.put("schemaVersion", schemaVersion)
        out.put("updatedAt", updatedAt)
        out.put("repoFullName", repoFullName)
        out.put("branch", branch)
        out.put("appFolder", appFolder)
        if (fresh("upcomingMilestone")) {
            upcomingMilestone?.let {
                out.put("upcomingMilestone", JSONObject().apply {
                    put("id", it.id)
                    put("name", it.name)
                    it.dueDate?.let { d -> put("dueDate", d) }
                })
            }
        }
        out.put("counts", (out.optJSONObject("counts") ?: JSONObject()).apply {
            put("inbox", counts.inbox)
            put("inProgress", counts.inProgress)
            put("backlog", counts.backlog)
            put("doneToday", counts.doneToday)
            counts.knowledgeInbox?.let { put("knowledgeInbox", it) }
            counts.doneThisWeek?.let { put("doneThisWeek", it) }
        })
        if (fresh("stats")) {
            stats?.let {
                out.put("stats", JSONObject().apply {
                    put("doneByDay", JSONArray(it.doneByDay))
                    put("streakDays", it.streakDays)
                    it.weeklyGoal?.let { g -> put("weeklyGoal", g) }
                })
            }
        }
        if (fresh("milestones")) {
            milestones?.let { list ->
                out.put("milestones", JSONArray().also { arr ->
                    list.forEach {
                        arr.put(JSONObject().apply {
                            put("id", it.id)
                            put("name", it.name)
                            it.dueDate?.let { d -> put("dueDate", d) }
                            put("open", it.open)
                            put("done", it.done)
                        })
                    }
                })
            }
        }
        if (fresh("tags")) tags?.let { out.put("tags", JSONArray(it)) }
        if (fresh("privacy")) {
            lockScreenText?.let { out.put("privacy", JSONObject().put("lockScreenText", it)) }
        }
        if (fresh("timeZone")) timeZone?.let { out.put("timeZone", it) }
        out.put("items", JSONArray().also { arr -> items.forEach { arr.put(it.toJson()) } })
        out.put("files", JSONObject().also { obj ->
            files.forEach { (path, f) ->
                obj.put(path, JSONObject().apply { put("sha", f.sha); put("content", f.content) })
            }
        })
        if (fresh("ideas")) {
            ideas?.let {
                out.put("ideas", JSONObject().apply {
                    put("byStatus", JSONObject().also { o -> it.byStatus.forEach { (k, v) -> o.put(k, v) } })
                    put("hot", JSONArray().also { arr ->
                        it.hot.forEach { h ->
                            arr.put(JSONObject().put("slug", h.slug).put("title", h.title).put("level", h.level))
                        }
                    })
                })
            }
        }
        if (fresh("cards")) {
            cards?.let { list ->
                out.put("cards", JSONArray().also { arr ->
                    list.forEach {
                        arr.put(
                            JSONObject().put("path", it.path).put("title", it.title)
                                .put("excerpt", it.excerpt).put("tags", JSONArray(it.tags)),
                        )
                    }
                })
            }
        }
        if (fresh("habits")) {
            habits?.let { list ->
                out.put("habits", JSONArray().also { arr ->
                    list.forEach {
                        arr.put(
                            JSONObject().put("path", it.path).put("name", it.name)
                                .put("doneToday", it.doneToday).put("streakDays", it.streakDays)
                                .apply { if (it.pending) put("pending", true) },
                        )
                    }
                })
            }
        }
        return out
    }

    companion object {
        /** Throws on a file that is not a snapshot at all (no updatedAt/repo); optional parts are lenient. */
        fun fromJson(o: JSONObject): WidgetTodoSnapshot {
            val c = o.optJSONObject("counts") ?: JSONObject()
            val m = o.optJSONObject("upcomingMilestone")
            val fileObj = o.optJSONObject("files") ?: JSONObject()
            val files = HashMap<String, WidgetFile>()
            for (path in fileObj.keys()) {
                val f = fileObj.optJSONObject(path) ?: continue
                files[path] = WidgetFile(f.optString("sha"), f.optString("content"))
            }
            val statsObj = o.optJSONObject("stats")
            val ideasObj = o.optJSONObject("ideas")
            return WidgetTodoSnapshot(
                schemaVersion = if (o.isNull("schemaVersion")) 1 else o.optInt("schemaVersion", 1),
                updatedAt = o.getLong("updatedAt"),
                repoFullName = o.getString("repoFullName"),
                branch = o.str("branch") ?: "main",
                appFolder = o.str("appFolder") ?: ".kh",
                upcomingMilestone = m?.let { mo ->
                    val id = mo.str("id")
                    val name = mo.str("name")
                    if (id == null || name == null) null else WidgetMilestone(id, name, mo.str("dueDate"))
                },
                counts = WidgetCounts(
                    inbox = c.optInt("inbox"),
                    inProgress = c.optInt("inProgress"),
                    backlog = c.optInt("backlog"),
                    doneToday = c.optInt("doneToday"),
                    knowledgeInbox = c.intOrNull("knowledgeInbox"),
                    doneThisWeek = c.intOrNull("doneThisWeek"),
                ),
                stats = statsObj?.let { s ->
                    val arr = s.optJSONArray("doneByDay")
                    WidgetStats(
                        doneByDay = if (arr == null) emptyList() else (0 until arr.length()).map { arr.optInt(it) },
                        streakDays = s.optInt("streakDays"),
                        weeklyGoal = s.intOrNull("weeklyGoal"),
                    )
                },
                milestones = if (o.has("milestones")) {
                    o.objects("milestones").mapNotNull { mo ->
                        val id = mo.str("id") ?: return@mapNotNull null
                        WidgetMilestoneSummary(
                            id, mo.str("name") ?: id, mo.str("dueDate"), mo.optInt("open"), mo.optInt("done"),
                        )
                    }
                } else null,
                tags = if (o.has("tags")) o.strings("tags") else null,
                lockScreenText = o.optJSONObject("privacy")?.let { p ->
                    if (p.isNull("lockScreenText")) null else p.optBoolean("lockScreenText", true)
                },
                timeZone = o.str("timeZone"),
                items = o.objects("items").mapNotNull { WidgetTodoItem.fromJson(it) },
                files = files,
                ideas = ideasObj?.let { io ->
                    val by = io.optJSONObject("byStatus") ?: JSONObject()
                    WidgetIdeas(
                        byStatus = by.keys().asSequence().associateWith { by.optInt(it) },
                        hot = io.objects("hot").mapNotNull { h ->
                            val slug = h.str("slug") ?: return@mapNotNull null
                            WidgetHotIdea(slug, h.str("title") ?: slug, h.str("level") ?: "")
                        },
                    )
                },
                cards = if (o.has("cards")) {
                    o.objects("cards").mapNotNull { k ->
                        val path = k.str("path") ?: return@mapNotNull null
                        WidgetCard(path, k.str("title") ?: path, k.str("excerpt") ?: "", k.strings("tags"))
                    }
                } else null,
                habits = if (o.has("habits")) {
                    o.objects("habits").mapNotNull { h ->
                        val path = h.str("path") ?: return@mapNotNull null
                        WidgetHabit(
                            path, h.str("name") ?: path, h.optBoolean("doneToday"),
                            h.optInt("streakDays"), h.optBoolean("pending"),
                        )
                    }
                } else null,
                raw = o,
            )
        }
    }
}

object WidgetStore {
    /** Null when nothing is stored or the stored text is not a readable snapshot. */
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
