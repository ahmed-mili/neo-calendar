package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.ics.IcsLink
import com.ahmed.neocalendar.core.ics.IcsSyncState
import com.ahmed.neocalendar.core.ics.formatLastIcsSync
import com.ahmed.neocalendar.core.preferences.ICS_REFRESH_MINUTES
import com.ahmed.neocalendar.core.preferences.MAX_ICS_FEEDS_PER_CALENDAR
import com.ahmed.neocalendar.core.preferences.icsFeedProblem
import com.ahmed.neocalendar.nativeapp.IcsUi
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import kotlinx.coroutines.launch

private fun frequencyLabel(minutes: Int) = if (minutes < 60) "$minutes min" else "${minutes / 60} h"

/**
 * Les liens ICS d'un calendrier (inventaire §4, `IcsFeedsPanel.tsx`) : par lien, le nom, l'adresse,
 * l'état de la dernière synchro, la fréquence, « Actualiser », « Supprimer » et l'adresse où mène le
 * lieu ; en bas l'ajout (cinq liens au plus). Retirer un lien ne supprime jamais ses notes.
 * Habillage de `.nc-ics-panel` sur Android (`mobile.css:4867`) : carte centrée de 375 dp, rayon 20, padding 14, Inter.
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

    NeoModal(onDismiss) {
        val shape = RoundedCornerShape(20.dp)
        Column(
            Modifier
                .padding(18.dp)
                .widthIn(max = 480.dp)
                .fillMaxWidth()
                .heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.92f).dp)
                .shadow(24.dp, shape, ambientColor = Color.Black.copy(alpha = 0.48f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.BorderStrong, shape)
                .consumeTaps()
                .padding(14.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Icon(NeoIcons.Link, null, tint = Neo.TextSecondary, modifier = Modifier.size(22.dp))
                UiText("Liens ICS — $calendarName", size = 16.sp, weight = FontWeight.Bold, modifier = Modifier.weight(1f))
                Box(Modifier.size(30.dp).pressFill(RoundedCornerShape(7.dp), Neo.Hover, onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Icon(NeoIcons.Close, "Fermer", tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
                }
            }
            if (links.size > 1) UiText("${links.size} liens ics", color = Neo.TextSecondary, size = 12.sp, modifier = Modifier.padding(top = 6.dp))
            Column(
                Modifier.weight(1f, fill = false).padding(top = 12.dp).verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                if (links.isEmpty()) {
                    UiText("Aucun lien ICS pour l'instant.", color = Neo.TextSecondary, size = 13.sp, modifier = Modifier.padding(vertical = 10.dp))
                }
                for (link in links) {
                    androidx.compose.runtime.key(link.id) {
                        LinkCard(link, ui.states[link.id], link.id in ui.syncing, defaultMinutes, onEdit, onRemove, onRefresh)
                    }
                }
            }
            // Le formulaire d'ajout sur une colonne : deux champs, puis le bouton plein.
            Column(
                Modifier
                    .padding(top = 14.dp)
                    .fillMaxWidth()
                    .drawBehind { drawRect(Neo.Border, size = Size(size.width, 1.dp.toPx())) }
                    .padding(top = 14.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                IcsField(newName, "Nom", { newName = it; problem = null }, enabled = !adding)
                IcsField(newUrl, "https://…", { newUrl = it; problem = null }, uri = true, enabled = !adding)
                val buttonShape = RoundedCornerShape(7.dp)
                Row(
                    Modifier
                        .fillMaxWidth()
                        .height(34.dp)
                        .alpha(if (atLimit || adding) 0.5f else 1f)
                        .clip(buttonShape)
                        .background(Neo.Accent)
                        .let { base ->
                            if (atLimit || adding) {
                                base
                            } else {
                                base.clickable {
                                    val refused = icsFeedProblem(newName, newUrl, links.map { it.url })
                                    if (refused != null) {
                                        problem = refused
                                    } else {
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
                            }
                        },
                    horizontalArrangement = Arrangement.Center,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    // Texte blanc sur l'accent : `.nc-ics-panel__add-form button { color: #fff }`.
                    Icon(NeoIcons.Plus, null, tint = Color.White, modifier = Modifier.size(15.dp))
                    UiText("Ajouter un lien ICS", color = Color.White, size = 13.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(start = 6.dp))
                }
            }
            problem?.let { UiText(it, color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(top = 8.dp)) }
            if (atLimit) {
                UiText("Ce calendrier a déjà le maximum de cinq liens ICS.", color = Neo.TextSecondary, size = 12.sp, modifier = Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
private fun IcsField(value: String, placeholder: String, onChange: (String) -> Unit, uri: Boolean = false, enabled: Boolean = true) {
    val shape = RoundedCornerShape(7.dp)
    Box(
        Modifier
            .fillMaxWidth()
            .height(34.dp)
            .alpha(if (enabled) 1f else 0.55f)
            .background(Neo.ControlFill, shape)
            .border(1.dp, Neo.Border, shape)
            .padding(horizontal = 10.dp),
        contentAlignment = Alignment.CenterStart,
    ) {
        if (value.isEmpty()) UiText(placeholder, color = Neo.TextFaint, size = 16.sp)
        BasicTextField(
            value,
            onChange,
            enabled = enabled,
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp, fontFamily = NeoFonts.inter),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(
                capitalization = if (uri) KeyboardCapitalization.None else KeyboardCapitalization.Sentences,
                keyboardType = if (uri) KeyboardType.Uri else KeyboardType.Text,
            ),
            modifier = Modifier.fillMaxWidth(),
        )
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
    val shape = RoundedCornerShape(10.dp)
    var menu by remember { mutableStateOf(false) }
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Row(
            Modifier.fillMaxWidth().background(Neo.CardTint, shape).border(1.dp, Neo.Border, shape).padding(start = 8.dp, end = 10.dp, top = 10.dp, bottom = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Box(Modifier.size(22.dp), contentAlignment = Alignment.Center) { Icon(NeoIcons.Link, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                CommitField(link.name, "Nom", { onEdit(link.id, it, null, null) }, allowEmpty = false, fontSize = 16, weight = FontWeight.SemiBold)
                UiText(link.url, color = Neo.TextSecondary, size = 12.sp, maxLines = 1, modifier = Modifier.padding(horizontal = 6.dp))
                Status(state, syncing)
            }
            Box {
                Row(
                    Modifier
                        .size(width = 86.dp, height = 30.dp)
                        .background(if (menu) Neo.Hover else Neo.ControlFill, RoundedCornerShape(7.dp))
                        .border(1.dp, Neo.Border, RoundedCornerShape(7.dp))
                        .clickable { menu = true }
                        .padding(horizontal = 6.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    UiText(frequencyLabel(link.refreshMinutes ?: defaultMinutes), size = 16.sp, modifier = Modifier.weight(1f))
                    Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(12.dp))
                }
                NeoPopupMenu(menu, { menu = false }, minWidth = 100.dp) {
                    for (minutes in ICS_REFRESH_MINUTES) {
                        MenuRow(frequencyLabel(minutes), checked = minutes == (link.refreshMinutes ?: defaultMinutes)) {
                            menu = false
                            onEdit(link.id, null, minutes, null)
                        }
                    }
                }
            }
            LinkAction(NeoIcons.RefreshCw, "Actualiser maintenant — ${link.name}") { onRefresh(link.id) }
            LinkAction(NeoIcons.Trash2, "Supprimer le lien — ${link.name}") { onRemove(link.id) }
        }
        Row(
            Modifier.fillMaxWidth().padding(start = 36.dp, end = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Icon(NeoIcons.MapPin, null, tint = Neo.TextFaint, modifier = Modifier.size(16.dp))
            Box(Modifier.weight(1f)) {
                CommitField(link.address.orEmpty(), "Adresse où mène ce lien", { onEdit(link.id, null, null, it) }, allowEmpty = true, fontSize = 16, weight = null)
            }
        }
    }
}

@Composable
private fun LinkAction(icon: ImageVector, label: String, onClick: () -> Unit) {
    Box(Modifier.size(30.dp).pressFill(RoundedCornerShape(7.dp), Neo.Hover, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(icon, label, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
    }
}

@Composable
private fun Status(state: IcsSyncState?, syncing: Boolean) {
    Row(Modifier.padding(horizontal = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        when {
            syncing -> {
                CircularProgressIndicator(color = Neo.Accent, strokeWidth = 2.dp, modifier = Modifier.size(13.dp))
                UiText("Synchronisation…", color = Neo.Accent, size = 11.5.sp, italic = true, modifier = Modifier.padding(start = 5.dp))
            }
            state?.lastError != null -> Column {
                Row(verticalAlignment = Alignment.Top) {
                    Icon(NeoIcons.AlertCircle, null, tint = Neo.Danger, modifier = Modifier.padding(top = 1.dp).size(13.dp))
                    UiText(state.lastError!!, color = Neo.Danger, size = 11.5.sp, modifier = Modifier.padding(start = 5.dp))
                }
                state.lastSuccessAt?.let {
                    UiText(formatLastIcsSync(it), color = Neo.TextSecondary, size = 11.5.sp, italic = true, modifier = Modifier.padding(start = 18.dp))
                }
            }
            state?.lastSuccessAt == null -> UiText("Jamais synchronisé", color = Neo.SettingsNote, size = 11.5.sp, italic = true)
            else -> UiText(formatLastIcsSync(state.lastSuccessAt!!), color = Neo.SettingsNote, size = 11.5.sp, italic = true)
        }
    }
}

/** Un champ qui s'écrit quand on le quitte ou sur « Terminé » (jamais à chaque lettre) ; vide, il reprend sa valeur si `allowEmpty` est faux. */
@Composable
private fun CommitField(value: String, placeholder: String, onCommit: (String) -> Unit, allowEmpty: Boolean, fontSize: Int, weight: FontWeight?) {
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
    Box(Modifier.fillMaxWidth().heightIn(min = 30.dp).padding(horizontal = 6.dp), contentAlignment = Alignment.CenterStart) {
        if (text.isEmpty()) UiText(placeholder, color = Neo.TextFaint, size = fontSize.sp, weight = weight)
        BasicTextField(
            text,
            { text = it },
            singleLine = true,
            textStyle = TextStyle(color = Neo.Text, fontSize = fontSize.sp, fontWeight = weight, fontFamily = NeoFonts.inter),
            cursorBrush = SolidColor(Neo.Accent),
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { commit() }),
            modifier = Modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) commit() },
        )
    }
}
