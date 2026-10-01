package com.ahmed.neocalendar.nativeapp.sync

import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.ahmed.neocalendar.nativeapp.WorkspaceLocation
import com.ahmed.neocalendar.nativeapp.readWorkspaceData
import com.ahmed.neocalendar.nativeapp.refreshWidgets
import com.ahmed.neocalendar.nativeapp.upcomingOccurrences
import com.ahmed.neocalendar.nativeapp.writeReminders
import com.ahmed.neocalendar.nativeapp.writeWidget
import java.time.Instant

/**
 * Ce que l'app fait quand une synchro a apporté des notes : relire le dossier « comme après une écriture », reprogrammer
 * les rappels et mettre le widget à jour.
 *  - écran ouvert : l'écran se relit lui-même (`NativeViewModel.reload`), ce qui pousse aussi rappels et widget ;
 *  - app en arrière-plan, sans écran : lecture directe du dossier, puis rappels et widget, avec exactement la même lecture.
 */
object RemoteRefresh {
    private const val TAG = "NeoRemoteRefresh"

    /** Posé par le ViewModel tant qu'il existe ; appelé sur le fil principal. */
    @Volatile var liveReload: (() -> Unit)? = null

    fun run(context: Context) {
        val main = Handler(Looper.getMainLooper())
        val live = liveReload
        if (live != null) {
            main.post { live() }
            return
        }
        try {
            val now = Instant.now()
            val data = readWorkspaceData(WorkspaceLocation.open(context, write = false))
            val events = upcomingOccurrences(data, now)
            writeReminders(context, data, events, now)
            writeWidget(context, data, events, now)
            main.post { refreshWidgets(context) }
        } catch (e: Exception) {
            // Une lecture ratée ne touche ni aux rappels ni au widget : les derniers valent mieux que des listes vides.
            Log.w(TAG, "rappels et widget non mis à jour après une synchro", e)
        }
    }
}
