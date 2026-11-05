package com.kaihuman.app

import android.content.Context
import android.util.Base64
import androidx.glance.GlanceId
import androidx.glance.action.ActionParameters
import androidx.glance.appwidget.action.ActionCallback
import androidx.glance.appwidget.updateAll
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
    fun markDone(content: String, indexInFile: Int, nowMs: Long): String? {
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
                lines[i] = lines[i].replaceFirst("[$marker]", "[x]")
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

class ToggleTodoAction : ActionCallback {
    override suspend fun onAction(context: Context, glanceId: GlanceId, parameters: ActionParameters) {
        val itemId = parameters[TodoGlanceWidget.itemIdKey] ?: return
        val snapshot = WidgetStore.load(context) ?: return
        val item = snapshot.items.find { it.id == itemId } ?: return
        val file = snapshot.files[item.filePath] ?: return
        if (item.status != "backlog" && item.status != "in-progress") return

        val now = System.currentTimeMillis()
        val updated = TodoMarkdown.markDone(file.content, item.indexInFile, now) ?: return

        // Optimistic local update first so the widget reacts immediately.
        val inboxPath = "${snapshot.appFolder}/inbox.todos.md"
        val counts = snapshot.counts
        val next = snapshot.copy(
            updatedAt = now,
            counts = counts.copy(
                inProgress = if (item.status == "in-progress") counts.inProgress - 1 else counts.inProgress,
                inbox = if (item.status != "in-progress" && item.filePath == inboxPath) counts.inbox - 1 else counts.inbox,
                backlog = if (item.status != "in-progress" && item.filePath != inboxPath) counts.backlog - 1 else counts.backlog,
                doneToday = counts.doneToday + 1,
            ),
            // Indices of later items in the same file are unaffected: the line stays, only its marker changes.
            items = snapshot.items.filter { it.id != itemId },
            files = snapshot.files + (item.filePath to file.copy(content = updated)),
        )
        WidgetStore.save(context, next)
        TodoGlanceWidget().updateAll(context)

        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val token = prefs.getString(GITHUB_TOKEN_KEY, null)
        val newSha = withContext(Dispatchers.IO) {
            if (token == null) null else pushToGitHub(snapshot, item.filePath, updated, file.sha, token)
        }
        if (newSha == null) {
            queueMutation(context, itemId, now)
        } else {
            val synced = next.copy(files = next.files + (item.filePath to WidgetFile(newSha, updated)))
            WidgetStore.save(context, synced)
        }
    }

    /** Returns the new blob sha, or null on any failure (offline, 409/422 conflict, auth). */
    private fun pushToGitHub(
        snapshot: WidgetTodoSnapshot,
        path: String,
        content: String,
        sha: String,
        token: String,
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
                    put("message", "widget: complete todo")
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

    private fun queueMutation(context: Context, itemId: String, timestamp: Long) {
        val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        val pending = try {
            JSONArray(prefs.getString(PENDING_MUTATIONS_KEY, "[]"))
        } catch (e: Exception) {
            JSONArray()
        }
        pending.put(JSONObject().apply {
            put("itemId", itemId)
            put("timestamp", timestamp)
        })
        prefs.edit().putString(PENDING_MUTATIONS_KEY, pending.toString()).apply()
    }
}
