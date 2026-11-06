package com.kaihuman.app

import android.app.PendingIntent
import android.content.Intent
import android.graphics.drawable.Icon
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/** Quick Settings tile that opens the capture sheet for one kind via the `kaihuman://quick-<kind>` link. */
abstract class CaptureTileService : TileService() {
    abstract val kind: String

    override fun onStartListening() {
        val tile = qsTile ?: return
        tile.state = Tile.STATE_INACTIVE
        tile.label = getString(labelRes(kind))
        tile.icon = Icon.createWithResource(this, iconRes(kind))
        tile.updateTile()
    }

    override fun onClick() {
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(DeepLinks.quick(kind)))
            .setPackage(packageName)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        if (Build.VERSION.SDK_INT >= 34) {
            val pending = PendingIntent.getActivity(this, kind.hashCode(), intent, PendingIntent.FLAG_IMMUTABLE)
            startActivityAndCollapse(pending)
        } else {
            @Suppress("DEPRECATION")
            startActivityAndCollapse(intent)
        }
    }

    private fun labelRes(kind: String): Int = when (kind) {
        "note" -> R.string.kh_tile_note
        "log" -> R.string.kh_tile_log
        "idea" -> R.string.kh_tile_idea
        else -> R.string.kh_tile_todo
    }

    private fun iconRes(kind: String): Int = when (kind) {
        "note" -> R.drawable.kh_ic_note
        "log" -> R.drawable.kh_ic_log
        "idea" -> R.drawable.kh_ic_idea
        else -> R.drawable.kh_ic_todo
    }
}

class TodoCaptureTileService : CaptureTileService() {
    override val kind = "todo"
}

class NoteCaptureTileService : CaptureTileService() {
    override val kind = "note"
}

class LogCaptureTileService : CaptureTileService() {
    override val kind = "log"
}

class IdeaCaptureTileService : CaptureTileService() {
    override val kind = "idea"
}
