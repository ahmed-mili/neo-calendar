package com.ahmed.neocalendar.nativeapp

import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.NeoCalendarWidget
import com.ahmed.neocalendar.R
import com.ahmed.neocalendar.WidgetData
import com.ahmed.neocalendar.core.widget.WidgetCalendar
import com.ahmed.neocalendar.nativeapp.ui.Neo
import com.ahmed.neocalendar.nativeapp.ui.NeoTheme
import com.ahmed.neocalendar.nativeapp.ui.parseCalendarColor
import org.json.JSONObject

/**
 * Le choix des calendriers d'UN widget : ouvert à la pose (`android:configure`) et par « Reconfigurer »
 * (appui long, Android 12+). Retour sans « Ajouter » : RESULT_CANCELED, donc Android ne pose pas le widget.
 * La liste vient de la dernière charge écrite par l'app, sans toucher au dossier de notes.
 */
class WidgetConfigActivity : ComponentActivity() {
    private var appWidgetId = AppWidgetManager.INVALID_APPWIDGET_ID

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        appWidgetId = intent?.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        // Sans identifiant, il n'y a pas de widget à configurer.
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        if (appWidgetId == AppWidgetManager.INVALID_APPWIDGET_ID) {
            finish()
            return
        }
        val calendars = readCalendars()
        // Tous cochés au départ ; à la reconfiguration, ceux du choix enregistré.
        val saved = WidgetData.chosenCalendars(this, appWidgetId)
        setContent {
            NeoTheme {
                ConfigScreen(calendars, saved) { ids -> save(calendars, ids) }
            }
        }
    }

    private fun readCalendars(): List<WidgetCalendar> {
        val raw = WidgetData.read(this)
        if (raw.isNullOrEmpty()) return emptyList()
        return try {
            val array = JSONObject(raw).optJSONArray("calendars") ?: return emptyList()
            (0 until array.length()).mapNotNull { i ->
                val item = array.optJSONObject(i) ?: return@mapNotNull null
                WidgetCalendar(item.optString("id"), item.optString("name"), item.optString("color"))
            }
        } catch (_: Exception) {
            emptyList()
        }
    }

    private fun save(calendars: List<WidgetCalendar>, ids: Set<String>) {
        // Sans liste (l'app n'a jamais tourné), aucun choix n'est enregistré : le widget montre tout.
        if (calendars.isNotEmpty()) WidgetData.chooseCalendars(this, appWidgetId, ids)
        val manager = AppWidgetManager.getInstance(this)
        manager.notifyAppWidgetViewDataChanged(intArrayOf(appWidgetId), R.id.widget_list)
        NeoCalendarWidget().onUpdate(this, manager, intArrayOf(appWidgetId))
        setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, appWidgetId))
        finish()
    }
}

@Composable
private fun ConfigScreen(calendars: List<WidgetCalendar>, saved: Set<String>?, onAdd: (Set<String>) -> Unit) {
    // Les décochés plutôt que les cochés : sans choix enregistré, tout est coché.
    var unchecked by rememberSaveable(calendars) {
        mutableStateOf(if (saved == null) emptyList() else calendars.map { it.id }.filter { it !in saved })
    }
    val checked = calendars.map { it.id }.filter { it !in unchecked }.toSet()
    Box(Modifier.fillMaxSize().background(Neo.Background).safeDrawingPadding()) {
        Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.widget_config_title),
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(vertical = 20.dp),
            )
            if (calendars.isEmpty()) {
                Text(stringResource(R.string.widget_config_empty), style = MaterialTheme.typography.bodySmall)
            }
            LazyColumn(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                items(calendars, key = { it.id }) { calendar ->
                    val on = calendar.id in checked
                    val toggle = {
                        unchecked = if (on) unchecked + calendar.id else unchecked - calendar.id
                    }
                    Row(
                        Modifier.fillMaxWidth().clickable { toggle() }.padding(vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Checkbox(checked = on, onCheckedChange = { toggle() })
                        Box(
                            Modifier.padding(horizontal = 8.dp).size(12.dp).clip(CircleShape)
                                .background(parseCalendarColor(calendar.color)),
                        )
                        Text(calendar.name, style = MaterialTheme.typography.bodyLarge)
                    }
                }
            }
            // Aucun calendrier coché : un widget vide à jamais, on ne l'offre pas.
            Button(
                onClick = { onAdd(checked) },
                enabled = calendars.isEmpty() || checked.isNotEmpty(),
                modifier = Modifier.fillMaxWidth().padding(vertical = 16.dp),
            ) { Text(stringResource(R.string.widget_config_add), color = Neo.Background) }
        }
    }
}
