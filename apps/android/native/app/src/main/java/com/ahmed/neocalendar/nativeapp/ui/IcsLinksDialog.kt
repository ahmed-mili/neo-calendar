package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.formatLastIcsSync
import com.ahmed.neocalendar.core.preferences.ICS_REFRESH_MINUTES
import com.ahmed.neocalendar.core.preferences.MAX_ICS_FEEDS_PER_CALENDAR
import com.ahmed.neocalendar.core.preferences.icsFeedProblem
import com.ahmed.neocalendar.nativeapp.IcsUi
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenu
import com.ahmed.neocalendar.nativeapp.ui.fields.NeoMenuItem
import com.ahmed.neocalendar.nativeapp.ui.fields.TextAction
import com.ahmed.neocalendar.nativeapp.ui.fields.ValuePill
import kotlinx.coroutines.launch

private fun frequencyLabel(minutes: Int) = if (minutes < 60) "$minutes min" else "${minutes / 60} h"

/**
 * Les liens ICS d'un calendrier (inventaire §4, `IcsFeedsPanel.tsx`) : par lien, le nom, l'adresse,
 * l'état de la dernière synchro, la fréquence, « Actualiser », « Supprimer » et l'adresse où mène le
 * lieu ; en bas l'ajout (cinq liens au plus). Retirer un lien ne supprime jamais ses notes.
 */
@Composable
fun IcsLinksDialog(
    calendarName: String,
    links: List<IcsLink>,
    ui: IcsUi,
    defaultMinutes: Int,
    onAdd: suspend (name: String, url: String) -> String?,
    onEdit: (id: String, name: String?, minutes: Int?, address: String?) -> Unit,
    onRemove: (String) -> Unit,
    onRefresh: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var newName by remember { mutableStateOf("") }
    var newUrl by remember { mutableStateOf("") }
    var problem by remember { mutableStateOf<String?>(null) }
    var adding by remember { mutableStateOf(false) }
    val atLimit = links.size >= MAX_ICS_FEEDS_PER_CALENDAR

    NeoDialog("Liens ICS — $calendarName", onDismiss, dismissLabel = "Fermer") {
        if (links.size > 1) Text("${links.size} liens ics", color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(bottom = 8.dp))
        if (links.isEmpty()) Text("Aucun lien ICS pour l'instant.", color = Neo.TextSecondary, fontSize = 14.sp, modifier = Modifier.padding(bottom = 8.dp))
        for (link in links) {
            androidx.compose.runtime.key(link.id) {
                LinkCard(link, ui.states[link.id], link.id in ui.syncing, defaultMinutes, onEdit, onRemove, onRefresh)
            }
        }
        Text("Ajouter un lien ICS", color = Neo.TextSecondary, fontSize = 13.sp, fontWeight = FontWeight.SemiBold, modifier = Modifier.padding(top = 12.dp, bottom = 6.dp))
        TextInput(newName, { newName = it; problem = null }, "Nom")
        Box(Modifier.padding(top = 8.dp)) { TextInput(newUrl, { newUrl = it; problem = null }, "https://…", uri = true) }
        Box(Modifier.padding(top = 4.dp)) {
            TextAction("Ajouter un lien ICS", enabled = !atLimit && !adding) {
                val refused = icsFeedProblem(newName, newUrl, links.map { it.url })
                if (refused != null) {
                    problem = refused
                    return@TextAction
                }
                adding = true
                scope.launch {
                    val error = onAdd(newName.trim(), newUrl.trim())
                    adding = false
                    if (error == null) {
                        newName = ""
                        newUrl = ""
                    } else {
                        problem = error
                    }
                }
            }
        }
        problem?.let { Text(it, color = Neo.Today, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp)) }
        if (atLimit) Text("Ce calendrier a déjà le maximum de cinq liens ICS.", color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(top = 4.dp))
    }
}

@Composable
private fun LinkCard(
    link: IcsLink,
    state: IcsSyncState?,
    syncing: Boolean,
    defaultMinutes: Int,
    onEdit: (String, String?, Int?, String?) -> Unit,
    onRemove: (String) -> Unit,
    onRefresh: (String) -> Unit,
) {
    val shape = RoundedCornerShape(12.dp)
    var menu by remember { mutableStateOf(false) }
    Column(Modifier.fillMaxWidth().padding(bottom = 10.dp).border(1.dp, Neo.Border, shape).padding(12.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(NeoIcons.Link, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f).padding(start = 8.dp)) {
                CommitField(link.name, "Nom", { onEdit(link.id, it, null, null) }, allowEmpty = false, fontSize = 15)
            }
        }
        Text(link.url, color = Neo.TextFaint, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
        Status(state, syncing)
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.CenterVertically) {
            Box {
                ValuePill(frequencyLabel(link.refreshMinutes ?: defaultMinutes), open = menu, chevron = true) { menu = true }
                NeoMenu(menu, { menu = false }) {
                    for (minutes in ICS_REFRESH_MINUTES) {
                        NeoMenuItem(frequencyLabel(minutes), selected = minutes == (link.refreshMinutes ?: defaultMinutes)) {
                            menu = false
                            onEdit(link.id, null, minutes, null)
                        }
                    }
                }
            }
            Box(Modifier.weight(1f))
            Box(Modifier.size(Neo.TouchTarget).clickable { onRefresh(link.id) }, contentAlignment = Alignment.Center) {
                Icon(NeoIcons.RefreshCw, "Actualiser maintenant — ${link.name}", tint = Neo.TextSecondary, modifier = Modifier.size(20.dp))
            }
            Box(Modifier.size(Neo.TouchTarget).clickable { onRemove(link.id) }, contentAlignment = Alignment.Center) {
                Icon(NeoIcons.Trash2, "Supprimer le lien — ${link.name}", tint = Neo.Today, modifier = Modifier.size(20.dp))
            }
        }
        Row(Modifier.fillMaxWidth().padding(top = 2.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(NeoIcons.MapPin, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f).padding(start = 8.dp)) {
                CommitField(link.address.orEmpty(), "Adresse où mène ce lien", { onEdit(link.id, null, null, it) }, allowEmpty = true, fontSize = 14)
            }
        }
    }
}

@Composable
private fun Status(state: IcsSyncState?, syncing: Boolean) {
    Row(Modifier.padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        when {
            syncing -> {
                CircularProgressIndicator(color = Neo.Accent, strokeWidth = 2.dp, modifier = Modifier.size(13.dp))
                Text("Synchronisation…", color = Neo.Accent, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp))
            }
            state?.lastError != null -> Column {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(NeoIcons.AlertCircle, null, tint = Neo.Today, modifier = Modifier.padding(top = 1.dp).size(13.dp))
                    Text(state.lastError!!, color = Neo.Today, fontSize = 12.sp, modifier = Modifier.padding(start = 6.dp))
                }
                state.lastSuccessAt?.let { Text(formatLastIcsSync(it), color = Neo.TextFaint, fontSize = 12.sp, modifier = Modifier.padding(start = 19.dp)) }
            }
            state?.lastSuccessAt == null -> Text("Jamais synchronisé", color = Neo.TextFaint, fontSize = 12.sp)
            else -> Text(formatLastIcsSync(state.lastSuccessAt!!), color = Neo.TextFaint, fontSize = 12.sp)
        }
    }
}

/** Un champ qui s'écrit quand on le quitte ou sur « Terminé » (jamais à chaque lettre) ; vide, il reprend sa valeur si `allowEmpty` est faux. */
@Composable
private fun CommitField(value: String, placeholder: String, onCommit: (String) -> Unit, allowEmpty: Boolean, fontSize: Int) {
    var text by remember(value) { mutableStateOf(value) }
    val commit = {
        val trimmed = text.trim()
        if (trimmed == value) {
            text = value
        } else if (trimmed.isEmpty() && !allowEmpty) {
            text = value
        } else {
            onCommit(trimmed)
        }
    }
    Box(Modifier.fillMaxWidth().heightIn(min = 40.dp), contentAlignment = Alignment.CenterStart) {
        if (text.isEmpty()) Text(placeholder, color = Neo.TextFaint, fontSize = fontSize.sp)
        BasicTextField(
            text,
            { text = it },
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = fontSize.sp),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commit() }),
            modifier = Modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) commit() },
        )
    }
}
