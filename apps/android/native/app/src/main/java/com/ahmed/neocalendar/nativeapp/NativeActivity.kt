package com.ahmed.neocalendar.nativeapp

import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.lifecycle.lifecycleScope
import com.ahmed.neocalendar.core.notes.EventFile
import com.ahmed.neocalendar.core.notes.NeoEvent
import com.ahmed.neocalendar.core.notes.calendarIdFromPath
import com.ahmed.neocalendar.core.notes.parseStoredEvent
import com.ahmed.neocalendar.core.preferences.parseWorkspacePreferences
import com.ahmed.neocalendar.core.workspace.loadWorkspace
import java.time.LocalDate
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

private const val PREF_FILE = "neo_android"
private const val PREF_TREE = "tree_uri"

class NativeActivity : ComponentActivity() {
    private var state by mutableStateOf<NativeHomeState>(NativeHomeState.Loading)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { NativeHome(state) }
        lifecycleScope.launch {
            state = try {
                withContext(Dispatchers.IO) { load() }
            } catch (e: Exception) {
                NativeHomeState.Failed(e.message ?: e.toString())
            }
        }
    }

    /** Mêmes contrôles et mêmes messages que `MainActivity.tree()`. */
    private fun treeUri(): Uri {
        val raw = getSharedPreferences(PREF_FILE, MODE_PRIVATE).getString(PREF_TREE, "").orEmpty()
        if (raw.isEmpty()) throw Exception("Selectionnez dabord un dossier Android.")
        val uri = Uri.parse(raw)
        val granted = contentResolver.persistedUriPermissions.any { it.uri == uri && it.isReadPermission }
        if (!granted) throw Exception("Lautorisation du dossier a ete revoquee. Selectionnez-le a nouveau.")
        return uri
    }

    private fun load(): NativeHomeState.Ready {
        val workspace = loadWorkspace(SafWorkspaceStorage(this, treeUri()))
        // Validation de bout en bout : un fichier de préférences étrange ne doit pas faire planter la lecture.
        parseWorkspacePreferences(workspace.preferences)
        val known = workspace.calendars.map { calendarIdFromPath(it.relativePath) }.toSet()
        val events = workspace.eventFiles.mapNotNull {
            parseStoredEvent(EventFile(it.relativePath, it.calendarPath, it.fileName, it.contents), known)
        }
        val calendars = workspace.calendars.map { c ->
            val id = calendarIdFromPath(c.relativePath)
            CalendarSummary(c.name, events.count { it.calendarId == id })
        }
        val today = LocalDate.now().toString()
        val upcoming = events.mapNotNull { (it.event as? NeoEvent.Single)?.takeIf { s -> s.date >= today } }
            .sortedWith(compareBy({ it.date }, { it.startTime.orEmpty() }))
            .take(20)
            .map { UpcomingNote(it.title, it.date) }
        return NativeHomeState.Ready(workspace.eventFiles.size, calendars, upcoming)
    }
}
