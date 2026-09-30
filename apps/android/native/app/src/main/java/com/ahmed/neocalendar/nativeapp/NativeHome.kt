package com.ahmed.neocalendar.nativeapp

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.R

data class CalendarSummary(val name: String, val eventCount: Int)

data class UpcomingNote(val title: String, val date: String)

sealed interface NativeHomeState {
    data object Loading : NativeHomeState
    data class Failed(val message: String) : NativeHomeState
    data class Ready(
        val noteCount: Int,
        val calendars: List<CalendarSummary>,
        val upcoming: List<UpcomingNote>,
    ) : NativeHomeState
}

private val NeoDark = darkColorScheme(background = Color(0xFF11111B), surface = Color(0xFF11111B))

@Composable
fun NativeHome(state: NativeHomeState) {
    MaterialTheme(colorScheme = NeoDark) {
        Surface(modifier = Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
            when (state) {
                NativeHomeState.Loading -> Centered { CircularProgressIndicator() }
                is NativeHomeState.Failed -> Centered { Text(state.message, modifier = Modifier.padding(24.dp)) }
                is NativeHomeState.Ready -> ReadyContent(state)
            }
        }
    }
}

@Composable
private fun Centered(content: @Composable () -> Unit) =
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { content() }

@Composable
private fun ReadyContent(state: NativeHomeState.Ready) {
    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item {
            Column(Modifier.padding(top = 48.dp)) {
                Text(stringResource(R.string.native_title), style = MaterialTheme.typography.headlineSmall)
                Text(pluralStringResource(R.plurals.native_notes_read, state.noteCount, state.noteCount))
            }
        }
        item { Text(stringResource(R.string.native_calendars), style = MaterialTheme.typography.titleMedium) }
        items(state.calendars) { c ->
            Text(pluralStringResource(R.plurals.native_calendar_events, c.eventCount, c.name, c.eventCount))
        }
        item { Text(stringResource(R.string.native_upcoming), style = MaterialTheme.typography.titleMedium) }
        if (state.upcoming.isEmpty()) item { Text(stringResource(R.string.native_no_upcoming)) }
        items(state.upcoming) { n ->
            Column {
                Text(n.title)
                Text(n.date, style = MaterialTheme.typography.bodySmall)
            }
        }
    }
}
