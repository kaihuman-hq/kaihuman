package com.kaihuman.app

import android.content.Context
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

/** Line-level `.todos.md` edit; matches the item regex and `::updated::` layout in packages/formats todos.ts. */
object TodoMarkdown {
    private val ITEM = Regex("^(\\s*)([-*])\\s+\\[([^\\]]*)\\]\\s+(.*)")
    private val UPDATED = Regex("::updated::\\s*\\d+")

    /** Returns the new file content, or null when the item is missing or already closed. */
    fun markDone(content: String, indexInFile: Int, nowMs: Long): String? =
        setMarker(content, indexInFile, "x", nowMs)

    /** Backlog is `[ ]`, in progress `[>]`, done `[x]`. Only open items can change. */
    fun setMarker(content: String, indexInFile: Int, to: String, nowMs: Long): String? {
        val lines = content.split("\n").toMutableList()
        var start = 0
        if (content.startsWith("---")) {
            val close = content.indexOf("\n---", 3)
            if (close != -1) {
                // Items start after the closing fence line.
                val fenceEnd = content.indexOf('\n', close + 1)
                start = if (fenceEnd == -1) lines.size else content.substring(0, fenceEnd + 1).count { it == '\n' }
            }
        }
        var seen = 0
        var i = start
        while (i < lines.size) {
            val m = ITEM.find(lines[i])
            if (m == null) {
                i++
                continue
            }
            if (seen == indexInFile) {
                val marker = m.groupValues[3]
                if (marker != " " && marker != ">") return null
                if (marker == to) return null
                lines[i] = lines[i].replaceFirst("[$marker]", "[$to]")
                val metaIdx = i + 1
                val meta = lines.getOrNull(metaIdx)?.trim() ?: ""
                if (meta.startsWith("::updated::") || meta.startsWith("::created::")) {
                    lines[metaIdx] = if (UPDATED.containsMatchIn(meta)) {
                        meta.replaceFirst(UPDATED, "::updated:: $nowMs")
                    } else {
                        "::updated:: $nowMs $meta"
                    }
                } else {
                    lines.add(metaIdx, "::updated:: $nowMs")
                }
                return lines.joinToString("\n")
            }
            seen++
            i++
        }
        return null
    }
}

/** Optimistic local edit, GitHub write, and queueing for the app when the write fails. */
object TodoCommit {
    suspend fun complete(context: Context, itemId: String) = commit(context, itemId, null)

    /** `status` is "in-progress" (Start) or "backlog". */
    suspend fun move(context: Context, itemId: String, status: String) = commit(context, itemId, status)

    private fun bucketDelta(snapshot: WidgetTodoSnapshot, item: WidgetTodoItem, sign: Int, c: WidgetCounts): WidgetCounts =
        when {
            item.status == "in-progress" -> c.copy(inProgress = c.inProgress + sign)
            item.filePath == snapshot.inboxPath -> c.copy(inbox = c.inbox + sign)
            else -> c.copy(backlog = c.backlog + sign)
        }

    /** `target == null` completes the item; otherwise moves it to that open status. */
    private suspend fun commit(context: Context, itemId: String, target: String?) {
        val snapshot = WidgetStore.load(context) ?: return
        val item = snapshot.items.find { it.id == itemId } ?: return
        val file = snapshot.files[item.filePath] ?: return
        if (item.status != "backlog" && item.status != "in-progress") return
        if (target != null && (target == item.status || (target != "backlog" && target != "in-progress"))) return

        val now = WidgetClock.now()
        val marker = when (target) {
            null -> "x"
            "in-progress" -> ">"
            else -> " "
        }
        val updated = TodoMarkdown.setMarker(file.content, item.indexInFile, marker, now) ?: return

        val removed = bucketDelta(snapshot, item, -1, snapshot.counts)
        val moved = item.copy(status = target ?: item.status, updatedAt = now)
        val counts = if (target == null) {
            removed.copy(
                doneToday = snapshot.counts.doneToday + 1,
                doneThisWeek = snapshot.counts.doneThisWeek?.plus(1),
            )
        } else {
            bucketDelta(snapshot, moved, +1, removed)
        }
        // Optimistic local update first so the widget reacts immediately. Indices of other items in the
        // same file are unaffected: the line stays, only its marker changes.
        val next = snapshot.copy(
            updatedAt = now,
            counts = counts,
            items = if (target == null) {
                snapshot.items.filter { it.id != itemId }
            } else {
                snapshot.items.map { if (it.id == itemId) moved else it }
            },
            files = snapshot.files + (item.filePath to file.copy(content = updated)),
        )
        WidgetStore.save(context, next)
        updateAllWidgets(context)

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(GITHUB_TOKEN_KEY, null)
        val message = if (target == null) "widget: complete todo" else "widget: move todo to $target"
        val newSha = withContext(Dispatchers.IO) {
            if (token == null) null else pushToGitHub(snapshot, item.filePath, updated, file.sha, token, message)
        }
        if (newSha == null) {
            queueMutation(context, itemId, target, now)
            if (target != null) {
                // The clock glyph tells the user the move is not committed yet.
                WidgetStore.save(
                    context,
                    next.copy(items = next.items.map { if (it.id == itemId) it.copy(pending = true) else it }),
                )
            }
        } else {
            WidgetStore.save(context, next.copy(files = next.files + (item.filePath to WidgetFile(newSha, updated))))
        }
        updateAllWidgets(context)
    }

    /** Returns the new blob sha, or null on any failure (offline, 409/422 conflict, auth). */
    private fun pushToGitHub(
        snapshot: WidgetTodoSnapshot,
        path: String,
        content: String,
        sha: String,
        token: String,
        message: String,
    ): String? {
        return try {
            val url = URL("https://api.github.com/repos/${snapshot.repoFullName}/contents/$path")
            val conn = url.openConnection() as HttpURLConnection
            try {
                conn.requestMethod = "PUT"
                conn.connectTimeout = 10000
                conn.readTimeout = 10000
                conn.doOutput = true
                conn.setRequestProperty("Authorization", "Bearer $token")
                conn.setRequestProperty("Accept", "application/vnd.github+json")
                conn.setRequestProperty("Content-Type", "application/json")
                val body = JSONObject().apply {
                    put("message", message)
                    put("content", Base64.encodeToString(content.toByteArray(Charsets.UTF_8), Base64.NO_WRAP))
                    put("sha", sha)
                    put("branch", snapshot.branch)
                }
                conn.outputStream.use { it.write(body.toString().toByteArray(Charsets.UTF_8)) }
                // 409 and 422 (stale sha) land here too and are queued for the app to reconcile.
                if (conn.responseCode !in 200..201) return null
                val response = conn.inputStream.bufferedReader().use { it.readText() }
                JSONObject(response).getJSONObject("content").getString("sha")
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Formats follow PendingWidgetMutation in widget-sync.ts. */
    private fun queueMutation(context: Context, itemId: String, target: String?, timestamp: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val pending = try {
            JSONArray(prefs.getString(PENDING_MUTATIONS_KEY, "[]"))
        } catch (e: Exception) {
            JSONArray()
        }
        pending.put(JSONObject().apply {
            put("kind", if (target == null) "toggle" else "move")
            put("itemId", itemId)
            if (target != null) put("status", target)
            put("timestamp", timestamp)
        })
        prefs.edit().putString(PENDING_MUTATIONS_KEY, pending.toString()).apply()
    }
}
