package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.prayer.PrayerTimetable
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import com.ahmed.neocalendar.core.prayer.jumuaChoices
import com.ahmed.neocalendar.core.prayer.prayerTimetableById

/** La largeur du dialogue : 520, ou l'écran moins les 18 dp du voile de chaque côté (`min(520px, 100vw - 36px)`). */
private val CardMaxWidth = 520.dp

/** `.nc-prayer-dialog__option` et `__swatch` : bord 1 dp, rayon 10, fond du texte à 3 %, contour accent au choix. */
private fun Modifier.prayerBox(selected: Boolean, pressed: Boolean = false): Modifier {
    val shape = RoundedCornerShape(10.dp)
    return this
        .clip(shape)
        .background(if (selected) Neo.Accent.copy(alpha = 0.14f) else Neo.Text.copy(alpha = 0.03f), shape)
        .border(1.dp, if (selected || pressed) Neo.Accent else Neo.Border, shape)
}

/**
 * De quelle mosquée un calendrier suit les horaires (`PrayerMosqueDialog.tsx`, sans le rappel : le téléphone a son
 * application de mosquée). Une liste (« aucun » d'abord), puis la couleur des traits, la Jumu'a et la phrase d'aide.
 */
@Composable
fun PrayerMosqueDialog(
    calendarName: String,
    tables: List<PrayerTimetable>,
    mosqueId: String?,
    color: String?,
    calendarColor: String,
    jumua: List<String>?,
    onChoose: (String?) -> Unit,
    onColor: (String?) -> Unit,
    onJumua: (List<String>?) -> Unit,
    onDismiss: () -> Unit,
) {
    var picker by remember { mutableStateOf<Rect?>(null) }
    var jumuaOpen by remember { mutableStateOf(false) }
    val mosque = prayerTimetableById(tables, mosqueId)
    val jumuaShown = jumua ?: mosque?.jumua ?: emptyList()
    val shown = color ?: calendarColor

    NeoModal(onDismiss) {
        val shape = RoundedCornerShape(14.dp)
        Column(
            Modifier
                .padding(18.dp)
                .widthIn(max = CardMaxWidth)
                .fillMaxWidth()
                .shadow(24.dp, shape, ambientColor = Color.Black.copy(alpha = 0.3f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.Border, shape)
                .consumeTaps()
                .verticalScroll(rememberScrollState())
                .padding(18.dp),
        ) {
            // L'en-tête : l'horloge de 16 dans une case de 20, le titre, la croix de 30.
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) { Icon(NeoIcons.Clock, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp)) }
                Text(
                    "${tr("Horaires de prière")} — $calendarName",
                    color = Neo.Text, fontSize = 16.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.SansSerif,
                    modifier = Modifier.weight(1f),
                )
                Box(Modifier.size(30.dp).pressFill(RoundedCornerShape(7.dp), Neo.Hover, onClick = onDismiss), contentAlignment = Alignment.Center) {
                    Icon(NeoIcons.Close, "Fermer", tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
                }
            }

            Column(Modifier.padding(top = 14.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                val rows = listOf<Triple<String?, String, String>>(
                    Triple(null, tr("Aucun horaire de prière"), tr("Ce calendrier n'affiche rien des prières.")),
                ) + tables.map { Triple(it.id, it.name, "${tr("Calendrier")} ${it.year} · ${tr("Jumu'a")} ${it.jumua.joinToString(" & ")}") }
                for ((id, name, note) in rows) {
                    val selected = id == mosqueId
                    Row(
                        Modifier.fillMaxWidth().prayerBox(selected).pressFill(RoundedCornerShape(10.dp), Color.Transparent) { onChoose(id); onDismiss() }.padding(horizontal = 12.dp, vertical = 10.75.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                            Text(name, color = Neo.Text, fontSize = 13.5.sp, lineHeight = 16.3.sp, fontWeight = FontWeight.Bold, fontFamily = NeoFonts.inter)
                            Text(note, color = Neo.TextSecondary, fontSize = 12.sp, lineHeight = 14.5.sp, fontFamily = NeoFonts.inter)
                        }
                        if (selected) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(15.dp))
                    }
                }
            }

            // La couleur des traits : la rangée entière ouvre le choix, un chevron comme tout ce qui ouvre quelque chose.
            SettingRow(top = true) {
                var bounds by remember { mutableStateOf(Rect.Zero) }
                Row(
                    Modifier.weight(1f).onGloballyPositioned { bounds = it.boundsInWindow() }.prayerBox(false, pressed = picker != null)
                        .pressFill(RoundedCornerShape(10.dp), Color.Transparent) { picker = bounds }
                          .padding(horizontal = 12.dp, vertical = 10.5.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Text(tr("Couleur des traits"), color = Neo.Text, fontSize = 16.sp, lineHeight = 19.4.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = NeoFonts.inter, modifier = Modifier.weight(1f))
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        // Le trait à l'échelle : 32 x 2, bouts arrondis.
                        Box(Modifier.width(32.dp).height(2.dp).background(parseCalendarColor(shown), RoundedCornerShape(50)))
                        Text(shown, color = Neo.TextSecondary, fontSize = 11.5.sp, fontFamily = FontFamily.Monospace, letterSpacing = 0.23.sp)
                        Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(14.dp))
                    }
                }
                if (color != null) ResetButton(tr("Reprendre la couleur du calendrier")) { picker = null; onColor(null) }
            }

            // Où l'on fait la Jumu'a : parmi les séances des mosquées enregistrées, jamais en saisie libre.
            if (mosque != null) SettingRow(top = true) {
                Row(
                    Modifier.weight(1f).prayerBox(false, pressed = jumuaOpen)
                        .pressFill(RoundedCornerShape(10.dp), Color.Transparent) { jumuaOpen = true }
                        .padding(horizontal = 12.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                        Icon(NeoIcons.Users, null, tint = Neo.Text, modifier = Modifier.size(14.dp))
                        Text(tr("Jumu'a"), color = Neo.Text, fontSize = 16.sp, lineHeight = 19.4.sp, maxLines = 1, fontFamily = NeoFonts.inter)
                    }
                    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Text(jumuaShown.joinToString(" & "), color = Neo.TextSecondary, fontSize = 16.sp, lineHeight = 19.4.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, fontFamily = NeoFonts.inter)
                        Icon(NeoIcons.ChevronDown, null, tint = Neo.TextSecondary, modifier = Modifier.size(14.dp))
                    }
                }
                if (jumua != null) ResetButton(tr("Mosquée suivie")) { onJumua(null) }
            }

            // La phrase d'aide : la touche à tenir n'existe pas sur téléphone, seule la prochaine prière est marquée.
            Text(
                tr("Un trait marque la prochaine prière, à la couleur de ce calendrier."),
                color = Neo.TextSecondary, fontSize = 11.5.sp, lineHeight = 16.7.sp, fontFamily = FontFamily.SansSerif,
                modifier = Modifier.padding(top = 14.dp).fillMaxWidth().topRule().padding(top = 12.dp),
            )
        }
    }

    picker?.let { anchor ->
        CalendarColorPicker(shown, anchor, { hex -> onColor(hex) }, { picker = null })
    }
    if (jumuaOpen && mosque != null) {
        JumuaChoiceDialog(
            choices = jumuaChoices(tables).map { it.time to it.mosques },
            selected = jumuaShown,
            inherited = mosque.jumua,
            onPick = onJumua,
            onDismiss = { jumuaOpen = false },
        )
    }
}

/** `.nc-prayer-dialog__colour` : une rangée sous un filet, 14 dp plus bas et 12 dp de respiration. */
@Composable
private fun SettingRow(top: Boolean, content: @Composable androidx.compose.foundation.layout.RowScope.() -> Unit) {
    Row(
        Modifier.padding(top = if (top) 14.dp else 0.dp).fillMaxWidth().topRule().padding(top = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        content = content,
    )
}

/** Le filet haut de 1 dp d'une rangée. */
private fun Modifier.topRule(): Modifier = drawBehind { drawRect(Neo.Border, size = Size(size.width, 1.dp.toPx())) }

/** `.nc-prayer-dialog__reset` : 34 x 34, rayon 10, le geste « rotate-ccw » de 14. */
@Composable
private fun ResetButton(label: String, onClick: () -> Unit) {
    Box(Modifier.size(34.dp).pressFill(RoundedCornerShape(10.dp), Neo.Hover, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(NeoIcons.RotateCcw, label, tint = Neo.TextSecondary, modifier = Modifier.size(14.dp))
    }
}

/**
 * Où l'on fait la Jumu'a (`JumuaChoiceDialog.tsx`) : les séances des mosquées enregistrées se cochent, jamais en saisie libre ;
 * tout décocher, c'est revenir à celles de la mosquée suivie.
 */
@Composable
fun JumuaChoiceDialog(
    choices: List<Pair<String, List<String>>>,
    selected: List<String>,
    inherited: List<String>,
    onPick: (List<String>?) -> Unit,
    onDismiss: () -> Unit,
) {
    // Chaque geste écrit aussitôt ; la liste affichée suit ce qui est coché.
    var current by remember { mutableStateOf(selected) }
    ChoiceCard(tr("Jumu'a"), onDismiss) {
        for ((time, mosques) in choices) {
            val checked = time in current
            val note = ((if (time in inherited) listOf(tr("Mosquée suivie")) else emptyList()) + mosques).joinToString(" · ")
            ChoiceOption(time, note, checked = checked, accentWhenChecked = true) {
                val next = if (checked) current - time else (current + time).sorted()
                current = next.ifEmpty { inherited }
                onPick(next.ifEmpty { null })
            }
        }
    }
}
