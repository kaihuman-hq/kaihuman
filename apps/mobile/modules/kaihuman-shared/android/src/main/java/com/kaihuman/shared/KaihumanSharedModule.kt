package com.kaihuman.shared

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

// Names must match targets/android-widget/TodoGlanceWidget.kt and the plugin's receiver name.
private const val PREFS_NAME = "kaihuman_widget"
private const val GITHUB_TOKEN_KEY = "github-token"
private const val PENDING_URL_KEY = "pending-url"
private const val RECEIVER_CLASS = ".TodoWidgetReceiver"

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
      val component = ComponentName(context.packageName, context.packageName + RECEIVER_CLASS)
      val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(component)
      if (ids.isNotEmpty()) {
        val intent = Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE)
          .setComponent(component)
          .putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids)
        context.sendBroadcast(intent)
      }
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
}
