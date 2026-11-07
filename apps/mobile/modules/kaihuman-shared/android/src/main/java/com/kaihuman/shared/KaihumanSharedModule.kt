package com.kaihuman.shared

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import expo.modules.interfaces.permissions.PermissionsStatus
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Names must match targets/android-widget/TodoGlanceWidget.kt and the plugin's receiver name.
private const val PREFS_NAME = "kaihuman_widget"
private const val GITHUB_TOKEN_KEY = "github-token"
private const val PENDING_URL_KEY = "pending-url"
// Mirrors ANDROID_WIDGETS in plugins/with-kaihuman-widgets.ts (a test keeps them equal).
private val WIDGET_RECEIVER_CLASSES = listOf(
  ".TodoWidgetReceiver",
  ".QuickCaptureWidgetReceiver",
  ".WeeklyDoneWidgetReceiver",
  ".InboxWidgetReceiver",
  ".BoardColumnWidgetReceiver",
  ".MilestoneWidgetReceiver",
  ".IdeaPipelineWidgetReceiver",
  ".KnowledgeCardWidgetReceiver",
)

private const val POST_NOTIFICATIONS = "android.permission.POST_NOTIFICATIONS"
private const val FOCUS_ACTION_PREFIX = "com.kaihuman.app.focus."

class KaihumanSharedModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val prefs
    get() = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("KaihumanShared")

    Function("readSharedFile") { name: String ->
      prefs.getString(name, null)
    }

    Function("writeSharedFile") { name: String, content: String ->
      prefs.edit().putString(name, content).apply()
    }

    // The receiver lives in the app module, so it is addressed by name instead of by class.
    Function("reloadWidgets") {
      val manager = AppWidgetManager.getInstance(context)
      for (receiver in WIDGET_RECEIVER_CLASSES) {
        val component = ComponentName(context.packageName, context.packageName + receiver)
        val ids = manager.getAppWidgetIds(component)
        if (ids.isNotEmpty()) {
          val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
            .setComponent(component)
            .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
          context.sendBroadcast(intent)
        }
      }
    }

    // Focus session = ongoing notification owned by FocusActionReceiver (app module), addressed by name.
    Function("startFocusActivity") { todoId: String, todoText: String, minutes: Int ->
      if (!canPostNotifications()) return@Function null
      sendFocus("START") {
        putExtra("todoId", todoId)
        putExtra("todoText", todoText)
        putExtra("minutes", minutes)
      }
      todoId
    }

    // Android 13+ needs a runtime grant or the focus notification is silently dropped. Asked in
    // context (first "Start focus"); resolves false when denied, including "don't ask again".
    AsyncFunction("requestNotificationPermission") { promise: Promise ->
      if (canPostNotifications()) {
        promise.resolve(true)
        return@AsyncFunction
      }
      val permissions = appContext.permissions
      if (permissions == null) {
        promise.resolve(false)
        return@AsyncFunction
      }
      permissions.askForPermissions({ result ->
        promise.resolve(result[POST_NOTIFICATIONS]?.status == PermissionsStatus.GRANTED)
      }, POST_NOTIFICATIONS)
    }

    Function("updateFocusActivity") { id: String, plannedEndMs: Double ->
      sendFocus("UPDATE") {
        putExtra("todoId", id)
        putExtra("endMs", plannedEndMs.toLong())
      }
    }

    Function("endFocusActivity") { id: String ->
      sendFocus("END") { putExtra("todoId", id) }
    }

    Function("setSharedToken") { token: String? ->
      val editor = prefs.edit()
      if (token != null) editor.putString(GITHUB_TOKEN_KEY, token) else editor.remove(GITHUB_TOKEN_KEY)
      editor.apply()
    }

    Function("consumePendingUrl") {
      val url = prefs.getString(PENDING_URL_KEY, null)
      if (url != null) prefs.edit().remove(PENDING_URL_KEY).apply()
      url
    }
  }

  private fun canPostNotifications(): Boolean =
    Build.VERSION.SDK_INT < 33 ||
      context.checkSelfPermission(POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

  private fun sendFocus(action: String, extras: Intent.() -> Unit) {
    val intent = Intent(FOCUS_ACTION_PREFIX + action)
      .setComponent(ComponentName(context.packageName, context.packageName + ".FocusActionReceiver"))
    intent.extras()
    context.sendBroadcast(intent)
  }
}
