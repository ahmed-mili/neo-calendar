package com.ahmed.neocalendar.nativeapp.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Size
import kotlinx.coroutines.launch
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.IntRect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Popup
import androidx.compose.ui.window.PopupPositionProvider
import androidx.compose.ui.window.PopupProperties
import com.ahmed.neocalendar.core.grid.COLOR_PICKER_PRESETS
import com.ahmed.neocalendar.core.grid.hexToHsv
import com.ahmed.neocalendar.core.grid.hsvToHex
import com.ahmed.neocalendar.core.grid.normalizeHex
import com.ahmed.neocalendar.core.preferences.REMINDER_CHOICES
import com.ahmed.neocalendar.core.reminders.ReminderUnit
import com.ahmed.neocalendar.core.reminders.reminderDelayLabel
import com.ahmed.neocalendar.core.reminders.reminderListLabel
import com.ahmed.neocalendar.core.reminders.reminderMinutesFrom
import com.ahmed.neocalendar.core.reminders.splitReminderDelay
import com.ahmed.neocalendar.core.workspace.validName
import com.ahmed.neocalendar.nativeapp.ui.fields.NumberBox
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import kotlin.math.max

/*
 * Les dialogues de calendrier de l'ancienne (spec §10) : feuille du bas pour l'ajout, le renommage et la suppression
 * (`mobile.css:1124` : sur Android `.nc-add-calendar-dialog` et `.nc-confirm-dialog` montent du bas, rayon 24 24 0 0),
 * popover du sélecteur de couleur, dialogue de choix du rappel. Police Inter (`App.css:3745`).
 */

/** Un texte en Inter, la police des dialogues. */
@Composable
internal fun UiText(
    text: String,
    modifier: Modifier = Modifier,
    color: Color = Neo.Text,
    size: TextUnit = 14.sp,
    weight: FontWeight? = null,
    maxLines: Int = Int.MAX_VALUE,
    lineHeight: TextUnit = TextUnit.Unspecified,
    italic: Boolean = false,
    family: FontFamily = NeoFonts.inter,
) {
    Text(
        text,
        modifier,
        color = color,
        fontSize = size,
        fontWeight = weight,
        fontFamily = family,
        fontStyle = if (italic) androidx.compose.ui.text.font.FontStyle.Italic else null,
        maxLines = maxLines,
        lineHeight = lineHeight,
        overflow = if (maxLines == Int.MAX_VALUE) TextOverflow.Clip else TextOverflow.Ellipsis,
    )
}

private val SheetShape = RoundedCornerShape(topStart = 24.dp, topEnd = 24.dp)

/** Une feuille du bas : pleine largeur, 88 % de la hauteur au plus, `padding-bottom: max(20, inset + 14)`. */
@Composable
internal fun BottomPanel(onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    NeoModal(onDismiss, Alignment.BottomCenter, insets = false) {
        val maxHeight = (LocalConfiguration.current.screenHeightDp * 0.88f).dp
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(max = maxHeight)
                .shadow(24.dp, SheetShape, ambientColor = Color.Black.copy(alpha = 0.48f), spotColor = Color.Black.copy(alpha = 0.48f))
                .background(Neo.Surface, SheetShape)
                .border(1.dp, Neo.BorderStrong, SheetShape)
                .consumeTaps()
                .verticalScroll(rememberScrollState())
                // `padding-bottom: max(20px, safe-bottom + 14px)` : la WebView n'annonce aucune zone de sécurité en bas, le pied reste à 20 dp.
                .padding(bottom = 20.dp),
            content = content,
        )
    }
}

/** Les deux boutons du pied : 48 dp, de même largeur, rayon 8, gras. */
@Composable
internal fun SheetFooter(
    cancelLabel: String,
    confirmLabel: String,
    onCancel: () -> Unit,
    onConfirm: () -> Unit,
    enabled: Boolean = true,
    danger: Boolean = false,
    /** Le bouton nu d'une confirmation qui n'est pas un danger : le bouton par défaut de la WebView (gris `#6B6B6B`, texte blanc, biseau de 2 dp). */
    neutral: Boolean = false,
) {
    val shape = RoundedCornerShape(8.dp)
    Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 18.dp), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
        Box(
            Modifier.weight(1f).height(48.dp).pressFill(shape, Neo.Hover, onClick = onCancel).border(1.dp, Neo.Border, shape),
            contentAlignment = Alignment.Center,
        ) { UiText(cancelLabel, size = 16.sp, weight = FontWeight.SemiBold) }
        Box(
            Modifier
                .weight(1f)
                .height(48.dp)
                .clip(shape)
                .background(if (danger) Neo.Danger else if (neutral) Color(0xFF6B6B6B) else Neo.Accent)
                .let { if (neutral) it.drawWithContent { drawContent(); drawOutsetBevel() } else it }
                .let { if (enabled) it.clickable(onClick = onConfirm) else it }
                .then(if (enabled) Modifier else Modifier.background(Color.Black.copy(alpha = 0.4f))),
            contentAlignment = Alignment.Center,
        ) {
            // Le danger écrit en blanc (`.nc-confirm-dialog__danger { color: #fff }`), le reste en texte sur accent.
            UiText(confirmLabel, color = if (danger || neutral) Color.White else Neo.OnAccent, size = 16.sp, weight = FontWeight.SemiBold)
        }
    }
}

/** `2px outset` du bouton par défaut : clair en haut et à gauche, sombre en bas et à droite. */
private fun androidx.compose.ui.graphics.drawscope.ContentDrawScope.drawOutsetBevel() {
    val w = 2.dp.toPx()
    val light = Color(0xFFBFBFBF)
    val dark = Color(0xFF161616)
    drawRect(light, Offset(0f, 0f), androidx.compose.ui.geometry.Size(size.width, w))
    drawRect(light, Offset(0f, 0f), androidx.compose.ui.geometry.Size(w, size.height))
    drawRect(dark, Offset(0f, size.height - w), androidx.compose.ui.geometry.Size(size.width, w))
    drawRect(dark, Offset(size.width - w, 0f), androidx.compose.ui.geometry.Size(w, size.height))
}

@Composable
private fun CloseButton(onClick: () -> Unit) {
    Box(Modifier.size(30.dp).pressFill(RoundedCornerShape(7.dp), Neo.Hover, onClick = onClick), contentAlignment = Alignment.Center) {
        Icon(NeoIcons.Close, "Fermer", tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
    }
}

/** Une ligne de champ du dialogue d'ajout : icône 18 dp, saisie, filet bas (`__input-row`, marges 18, padding 13 14). */
@Composable
private fun InputRow(
    icon: ImageVector,
    value: String,
    placeholder: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    uri: Boolean = false,
    rule: Boolean = true,
    inset: Boolean = true,
    /** Le champ prend le focus dès que la feuille s'ouvre (`inputRef.current?.focus()` de l'ancienne). */
    focusOnShow: Boolean = false,
    /** « Suivant » quand un autre champ suit (le clavier de l'ancienne montre la touche à flèche et barre). */
    imeAction: androidx.compose.ui.text.input.ImeAction = androidx.compose.ui.text.input.ImeAction.Done,
) {
    val focusRequester = remember { androidx.compose.ui.focus.FocusRequester() }
    if (focusOnShow) LaunchedEffect(Unit) { focusRequester.requestFocus() }
    Row(
        modifier
            .fillMaxWidth()
            .padding(horizontal = if (inset) 18.dp else 0.dp)
            .let { if (rule) it.drawRule() else it }
            .padding(horizontal = 14.dp, vertical = 13.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(icon, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
        Box(Modifier.weight(1f).padding(vertical = 7.dp), contentAlignment = Alignment.CenterStart) {
            if (value.isEmpty()) UiText(placeholder, color = Neo.TextFaint, size = 16.sp)
            BasicTextField(
                value,
                onChange,
                singleLine = true,
                textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp, fontFamily = NeoFonts.inter),
                cursorBrush = SolidColor(Neo.Accent),
                keyboardOptions = if (uri) {
                    KeyboardOptions(capitalization = KeyboardCapitalization.None, keyboardType = KeyboardType.Uri, imeAction = imeAction)
                } else {
                    KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = imeAction)
                },
                modifier = Modifier.fillMaxWidth().then(if (focusOnShow) Modifier.focusRequester(focusRequester) else Modifier),
            )
        }
    }
}

private fun Modifier.drawRule(): Modifier = drawBehind {
    drawRect(Neo.Border, topLeft = Offset(0f, size.height - 1.dp.toPx()), size = Size(size.width, 1.dp.toPx()))
}

// ── Ajouter un calendrier ─────────────────────────────────────────────────────────────────────────────────

/** Ce que la feuille d'ajout demande : un dossier de notes (avec un premier lien ICS facultatif), ou le calendrier des jours fériés. */
sealed interface AddCalendarRequest {
    data class Notes(val name: String, val icsUrl: String?) : AddCalendarRequest
    data class Holidays(val name: String?, val color: String) : AddCalendarRequest
}

/**
 * La feuille « Ajouter un calendrier » (`AddCalendarDialog.tsx`) : l'étiquette, le dossier racine, les deux cartes de type,
 * le nom, le lien ICS facultatif et son aide, puis Annuler / Ajouter le calendrier.
 */
@Composable
fun AddCalendarSheet(
    rootName: String,
    takenNames: Set<String>,
    onCreate: suspend (AddCalendarRequest) -> String?,
    onDismiss: () -> Unit,
) {
    var holidays by remember { mutableStateOf(false) }
    var name by remember { mutableStateOf("") }
    var icsUrl by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
    var submitting by remember { mutableStateOf(false) }
    val scope = androidx.compose.runtime.rememberCoroutineScope()
    val taken = takenNames.map { it.lowercase() }.toSet()

    val submit: () -> Unit = submit@{
        error = null
        val request: AddCalendarRequest
        if (!holidays) {
            val trimmed = name.trim()
            when {
                trimmed.isEmpty() -> { error = "Saisissez un nom de calendrier."; return@submit }
                runCatching { validName(trimmed, false) }.isFailure -> { error = "Le nom ne peut pas contenir / ou \\."; return@submit }
                trimmed.lowercase() in taken -> { error = "Un calendrier porte déjà ce nom."; return@submit }
            }
            val typed = icsUrl.trim()
            var url: String? = null
            if (typed.isNotEmpty()) {
                url = com.ahmed.neocalendar.core.preferences.normalizeIcsUrl(typed).ifEmpty { null }
                if (url == null) { error = "Cette adresse n'est pas valide. Entrez une adresse HTTPS ou webcal."; return@submit }
            }
            request = AddCalendarRequest.Notes(trimmed, url)
        } else {
            val trimmed = name.trim()
            val finalName = trimmed.ifEmpty { com.ahmed.neocalendar.core.preferences.FRANCE_HOLIDAY_NAME }
            if (finalName.lowercase() in taken) { error = "Un calendrier porte déjà ce nom."; return@submit }
            request = AddCalendarRequest.Holidays(trimmed.ifEmpty { null }, com.ahmed.neocalendar.core.preferences.FRANCE_HOLIDAY_COLOR)
        }
        submitting = true
        scope.launch {
            val problem = onCreate(request)
            submitting = false
            if (problem == null) onDismiss() else error = problem
        }
    }

    BottomPanel(onDismiss) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            UiText(
                "Calendrier",
                color = Neo.TextSecondary,
                size = 11.sp,
                weight = FontWeight.SemiBold,
                modifier = Modifier.background(Neo.ControlFill, RoundedCornerShape(6.dp)).padding(horizontal = 8.dp, vertical = 4.dp),
            )
            Spacer(Modifier.weight(1f))
            CloseButton(onDismiss)
        }
        // Le dossier racine (jamais son adresse : un identifiant content:// ne dit rien d'utile).
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 18.dp).drawRule().padding(horizontal = 14.dp, vertical = 13.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(NeoIcons.Folder, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
            UiText(rootName, size = 16.sp, weight = FontWeight.Bold, maxLines = 1)
        }
        Column(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 4.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            TypeCard("Dossier de notes", "Un fichier Markdown par événement, dans un dossier que vous choisissez.", !holidays, !submitting) { holidays = false; error = null }
            TypeCard("Jours fériés", "En lecture seule, calculés sur l'appareil.", holidays, !submitting) { holidays = true; error = null }
        }
        InputRow(
            NeoIcons.Plus,
            name,
            if (holidays) "Nom du calendrier (facultatif)" else "Nom du calendrier",
            { name = it; error = null },
            focusOnShow = true,
            imeAction = if (holidays) androidx.compose.ui.text.input.ImeAction.Done else androidx.compose.ui.text.input.ImeAction.Next,
        )
        if (!holidays) {
            // Le premier lien ICS, là où l'on crée le calendrier qui va le recevoir ; la note dit où retrouver les liens ensuite.
            Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp).drawRule()) {
                InputRow(NeoIcons.Link, icsUrl, "Lien ICS (facultatif)", { icsUrl = it; error = null }, uri = true, rule = false, inset = false)
                UiText(
                    "Une adresse https:// ou webcal://. Ses évènements sont synchronisés dans ce calendrier et restent en lecture seule. " +
                        "Pour ajouter, modifier ou retirer des liens ensuite : menu à trois points du calendrier, « Liens ICS ».",
                    color = Neo.TextSecondary,
                    size = 11.5.sp,
                    lineHeight = 16.7.sp,
                    modifier = Modifier.padding(start = 44.dp, end = 14.dp, bottom = 12.dp),
                )
            }
        }
        error?.let { UiText(it, color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 8.dp, bottom = 0.dp)) }
        SheetFooter("Annuler", if (submitting) "Ajout…" else "Ajouter le calendrier", onDismiss, submit, enabled = !submitting)
    }
}

@Composable
private fun TypeCard(title: String, description: String, selected: Boolean, enabled: Boolean, onClick: () -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier
            .fillMaxWidth()
            .clip(shape)
            .background(if (selected) Neo.Accent.copy(alpha = 0.14f) else Color.Transparent)
            .border(1.dp, if (selected) Neo.Accent else Neo.Border, shape)
            .let { if (enabled) it.pressFill(shape, if (selected) Color.Transparent else Neo.Hover, onClick = onClick) else it }
            .padding(horizontal = 13.dp, vertical = 11.dp),
        verticalArrangement = Arrangement.spacedBy(3.dp),
    ) {
        UiText(title, size = 13.sp, weight = FontWeight.SemiBold)
        UiText(description, color = Neo.TextSecondary, size = 11.sp, lineHeight = 14.85.sp)
    }
}

// ── Renommer ──────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le nom d'un calendrier (un dossier), pour le renommer. Les règles sont celles du Java (`validName`) : ni séparateur, ni « . » ni « .. » ;
 * un nom déjà pris est refusé ici avant de l'être par le noyau. Écart assumé : l'ancienne édite le nom en place dans la ligne du tiroir,
 * ici une feuille du bas (le tiroir est un panneau défilant où le clavier couvrirait la ligne).
 */
@Composable
fun CalendarNameDialog(
    title: String,
    initial: String,
    confirmLabel: String,
    takenNames: Set<String>,
    onConfirm: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    var text by remember { mutableStateOf(initial) }
    val name = text.trim()
    val invalid = name.isNotEmpty() && runCatching { validName(name, false) }.isFailure
    val taken = name.lowercase() in takenNames.map { it.lowercase() }
    val ok = name.isNotEmpty() && !invalid && !taken && name != initial
    BottomPanel(onDismiss) {
        Row(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 16.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            UiText(title, size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.weight(1f))
            CloseButton(onDismiss)
        }
        InputRow(NeoIcons.Pencil, text, "Nom du calendrier", { text = it }, rule = true)
        val problem = when {
            invalid -> "Le nom ne peut pas contenir / ou \\, ni être « . » ou « .. »."
            taken && name != initial -> "Un calendrier porte déjà ce nom."
            else -> null
        }
        problem?.let { UiText(it, color = Neo.Danger, size = 12.sp, modifier = Modifier.padding(start = 32.dp, end = 32.dp, top = 8.dp)) }
        SheetFooter("Annuler", confirmLabel, onDismiss, { onConfirm(name) }, enabled = ok)
    }
}

// ── Suppression ───────────────────────────────────────────────────────────────────────────────────────────

/** `ConfirmDialog` : une icône d'alerte, le titre, un mot, Annuler et le bouton de confirmation (rouge si `danger`). */
@Composable
internal fun ConfirmPanel(title: String, message: String, confirmLabel: String, danger: Boolean, onDismiss: () -> Unit, onConfirm: () -> Unit) {
    BottomPanel(onDismiss) {
        Row(
            Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 18.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Icon(NeoIcons.TriangleAlert, null, tint = Neo.Danger, modifier = Modifier.size(18.dp))
            UiText(title, size = 17.sp, weight = FontWeight.Bold, modifier = Modifier.weight(1f))
            CloseButton(onDismiss)
        }
        UiText(message, color = Neo.TextSecondary, size = 16.sp, modifier = Modifier.padding(start = 18.dp, end = 18.dp, top = 14.dp))
        SheetFooter("Annuler", confirmLabel, onDismiss, onConfirm, danger = danger, neutral = !danger)
    }
}

@Composable
fun ConfirmDeleteCalendarDialog(name: String, readOnly: Boolean, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    ConfirmPanel(
        "Supprimer le calendrier",
        if (readOnly) {
            "Retirer le calendrier en lecture seule « $name » ?"
        } else {
            "Retirer le dossier de calendrier vide « $name » ? Un calendrier ne peut l'être que s'il est vide."
        },
        "Supprimer le calendrier", danger = true, onDismiss, onConfirm,
    )
}

// ── Couleur ───────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Le sélecteur de couleur (`ColorPicker.tsx`) : popover de 232 dp ancré sous la pastille (au-dessus s'il manque la place) avec le
 * carré saturation / luminosité, la barre de teinte, l'aperçu et le champ hexadécimal, et les 12 pastilles. Un appui dehors le ferme.
 * Écart assumé : la couleur s'écrit au lâcher du doigt (et à chaque pastille ou code valide), pas à chaque pixel du glissé :
 * chaque écriture relit le dossier.
 */
@Composable
fun CalendarColorPicker(current: String, anchor: Rect, onChange: (String) -> Unit, onDismiss: () -> Unit) {
    val density = LocalDensity.current
    val provider = remember(anchor, density) { ColorPickerPositionProvider(anchor, with(density) { 14.dp.roundToPx() }, with(density) { 8.dp.roundToPx() }, with(density) { 6.dp.roundToPx() }) }
    val start = remember { hexToHsv(current) }
    var hue by remember { mutableFloatStateOf(start.h) }
    var sat by remember { mutableFloatStateOf(start.s) }
    var value by remember { mutableFloatStateOf(start.v) }
    var hexText by remember { mutableStateOf(normalizeHex(current) ?: current) }
    val currentHex = hsvToHex(hue, sat, value)

    fun emit(h: Float, s: Float, v: Float) {
        hexText = hsvToHex(h, s, v)
    }

    Popup(popupPositionProvider = provider, onDismissRequest = onDismiss, properties = PopupProperties(focusable = true, clippingEnabled = false)) {
        val shape = RoundedCornerShape(12.dp)
        Box(Modifier.padding(14.dp)) {
            Column(
                Modifier
                    .width(232.dp)
                    .shadow(12.dp, shape, ambientColor = Color.Black.copy(alpha = 0.25f), spotColor = Color.Black.copy(alpha = 0.45f))
                    .background(Neo.Surface, shape)
                    .border(1.dp, Neo.BorderStrong, shape)
                    .padding(12.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                // Carré saturation / luminosité : x = saturation, y = 1 - luminosité.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(140.dp)
                        .clip(RoundedCornerShape(8.dp))
                        .pointerInput(Unit) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                fun at(position: Offset) {
                                    sat = (position.x / size.width).coerceIn(0f, 1f)
                                    value = (1f - position.y / size.height).coerceIn(0f, 1f)
                                    emit(hue, sat, value)
                                }
                                at(down.position)
                                down.consume()
                                do {
                                    val event = awaitPointerEvent()
                                    event.changes.forEach { if (it.pressed) { at(it.position); it.consume() } }
                                } while (event.changes.any { it.pressed })
                                onChange(hsvToHex(hue, sat, value))
                            }
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        drawRect(Color.hsv(hue.coerceIn(0f, 359.99f), 1f, 1f))
                        drawRect(Brush.horizontalGradient(listOf(Color.White, Color.White.copy(alpha = 0f))))
                        drawRect(Brush.verticalGradient(listOf(Color.Black.copy(alpha = 0f), Color.Black)))
                    }
                    val thumb = 12.dp
                    BoxWithFraction(sat, 1f - value, thumb)
                }
                // Barre de teinte.
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(12.dp)
                        .clip(RoundedCornerShape(6.dp))
                        .pointerInput(Unit) {
                            awaitEachGesture {
                                val down = awaitFirstDown()
                                fun at(position: Offset) {
                                    hue = (position.x / size.width * 360f).coerceIn(0f, 360f)
                                    emit(hue, sat, value)
                                }
                                at(down.position)
                                down.consume()
                                do {
                                    val event = awaitPointerEvent()
                                    event.changes.forEach { if (it.pressed) { at(it.position); it.consume() } }
                                } while (event.changes.any { it.pressed })
                                onChange(hsvToHex(hue, sat, value))
                            }
                        },
                ) {
                    Canvas(Modifier.fillMaxSize()) {
                        drawRect(
                            Brush.horizontalGradient(
                                0f to Color(0xFFFF0000), 0.17f to Color(0xFFFFFF00), 0.33f to Color(0xFF00FF00),
                                0.5f to Color(0xFF00FFFF), 0.67f to Color(0xFF0000FF), 0.83f to Color(0xFFFF00FF), 1f to Color(0xFFFF0000),
                            ),
                        )
                    }
                    BoxWithFraction(hue / 360f, 0.5f, 14.dp)
                }
                // Aperçu et code.
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Box(Modifier.size(24.dp).background(parseCalendarColor(currentHex), RoundedCornerShape(6.dp)).border(1.dp, Color.White.copy(alpha = 0.15f), RoundedCornerShape(6.dp)))
                    Box(
                        Modifier
                            .weight(1f)
                            .height(32.dp)
                            .background(Neo.FieldFill, RoundedCornerShape(6.dp))
                            .border(1.dp, Neo.Border, RoundedCornerShape(6.dp))
                            .padding(horizontal = 8.dp),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        BasicTextField(
                            hexText,
                            { raw ->
                                val text = raw.take(7)
                                hexText = text
                                normalizeHex(text)?.let { hex ->
                                    val hsv = hexToHsv(hex)
                                    hue = hsv.h; sat = hsv.s; value = hsv.v
                                    onChange(hex)
                                }
                            },
                            singleLine = true,
                            textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp, fontFamily = FontFamily.Monospace, letterSpacing = 0.32.sp),
                            cursorBrush = SolidColor(Neo.Accent),
                            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None),
                            modifier = Modifier.fillMaxWidth(),
                        )
                    }
                }
                // Les 12 pastilles, six par rangée.
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    for (rowColors in COLOR_PICKER_PRESETS.chunked(6)) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            for (hex in rowColors) {
                                Box(
                                    Modifier
                                        .weight(1f)
                                        .aspectRatio(1f)
                                        .background(parseCalendarColor(hex), RoundedCornerShape(6.dp))
                                        .border(1.dp, Color.White.copy(alpha = 0.14f), RoundedCornerShape(6.dp))
                                        .clickable {
                                            val hsv = hexToHsv(hex)
                                            hue = hsv.h; sat = hsv.s; value = hsv.v
                                            hexText = hex
                                            onChange(hex)
                                        },
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}

/** La poignée ronde (bord blanc 2 dp, cerclée de noir) posée à la fraction (x, y) du parent. */
@Composable
private fun BoxWithFraction(x: Float, y: Float, thumb: Dp) {
    androidx.compose.foundation.layout.BoxWithConstraints(Modifier.fillMaxSize()) {
        Box(
            Modifier
                .offset(maxWidth * x - thumb / 2, maxHeight * y - thumb / 2)
                .size(thumb)
                .border(1.dp, Color.Black.copy(alpha = 0.45f), CircleShape)
                .padding(1.dp)
                .border(2.dp, Color.White, CircleShape),
        )
    }
}

private class ColorPickerPositionProvider(private val anchor: Rect, private val shadow: Int, private val margin: Int, private val gap: Int) : PopupPositionProvider {
    override fun calculatePosition(anchorBounds: IntRect, windowSize: IntSize, layoutDirection: LayoutDirection, popupContentSize: IntSize): IntOffset {
        val cardW = popupContentSize.width - 2 * shadow
        val cardH = popupContentSize.height - 2 * shadow
        var top = anchor.bottom.toInt() + gap
        if (top + cardH > windowSize.height - margin) top = max(margin, anchor.top.toInt() - cardH - gap)
        val left = anchor.left.toInt().coerceIn(margin, max(margin, windowSize.width - margin - cardW))
        return IntOffset(left - shadow, top - shadow)
    }
}

// ── Rappel ────────────────────────────────────────────────────────────────────────────────────────────────

/** La carte d'un dialogue de choix (`.nc-choice-dialog` sur Android) : 300 dp, rayon 12, padding 6 4 4, ombre. */
@Composable
internal fun ChoiceCard(title: String, onDismiss: () -> Unit, content: @Composable ColumnScope.() -> Unit) {
    NeoModal(onDismiss) {
        val shape = RoundedCornerShape(12.dp)
        Column(
            Modifier
                .padding(18.dp)
                .widthIn(max = 300.dp)
                .fillMaxWidth()
                .heightIn(max = (LocalConfiguration.current.screenHeightDp * 0.8f).dp)
                .shadow(14.dp, shape, ambientColor = Color.Black.copy(alpha = 0.22f), spotColor = Color.Black.copy(alpha = 0.4f))
                .background(Neo.Surface, shape)
                .border(1.dp, Neo.Border, shape)
                .consumeTaps()
                .verticalScroll(rememberScrollState())
                .padding(start = 4.dp, end = 4.dp, top = 6.dp, bottom = 4.dp),
            verticalArrangement = Arrangement.spacedBy(1.dp),
        ) {
            UiText(title, size = 15.sp, weight = FontWeight.SemiBold, modifier = Modifier.padding(start = 10.dp, end = 10.dp, top = 4.dp, bottom = 6.dp))
            content()
        }
    }
}

@Composable
internal fun ChoiceOption(label: String, note: String? = null, checked: Boolean = false, muted: Boolean = false, accentWhenChecked: Boolean = false, onClick: (() -> Unit)?) {
    val shape = RoundedCornerShape(6.dp)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 40.dp)
            .let { if (onClick != null) it.pressFill(shape, Neo.Hover, onClick = onClick) else it.clip(shape) }
            .padding(horizontal = 10.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Column(Modifier.weight(1f)) {
            UiText(label, color = if (muted) Neo.TextFaint else if (checked && accentWhenChecked) Neo.Accent else Neo.Text, size = 14.sp)
            if (note != null) UiText(note, color = if (muted) Neo.TextFaint else Neo.TextSecondary, size = 12.sp)
        }
        if (checked) Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(19.dp))
    }
}

/**
 * Le rappel : celui de toute l'application (`inherited` nul) ou celui d'un calendrier (`minutes` nul = il suit le réglage de l'application).
 * Port de ReminderChoiceDialog.tsx : les lignes se cochent sans refermer le dialogue, « Personnalisé » ajoute un délai au compteur.
 * Chaque geste écrit aussitôt.
 */
@Composable
fun ReminderDialog(
    title: String,
    minutes: List<Long>?,
    inherited: List<Long>?,
    onPick: (List<Long>?) -> Unit,
    onDismiss: () -> Unit,
) {
    var current by remember { mutableStateOf(minutes) }
    val chosen = current.orEmpty()
    val write = { next: List<Long>? -> current = next; onPick(next) }
    val toggle = { value: Long ->
        write(if (value in chosen) chosen - value else (chosen + value).sorted())
    }
    val presets = REMINDER_CHOICES.filter { it > 0 }
    val extras = chosen.filter { it !in presets }
    var amount by remember { mutableStateOf(splitReminderDelay(0).amount) }
    var unit by remember { mutableStateOf(ReminderUnit.Minutes) }

    ChoiceCard(title, onDismiss) {
        if (inherited != null) {
            ChoiceOption(
                "Réglage de l'application",
                reminderListLabel(inherited.map { it.toDouble() }),
                checked = current == null,
                muted = current != null,
            ) { write(null); onDismiss() }
        }
        ChoiceOption("Aucun rappel", checked = current != null && chosen.isEmpty()) { write(emptyList()); onDismiss() }
        for (preset in presets) ChoiceOption(reminderDelayLabel(preset.toDouble()), checked = preset in chosen) { toggle(preset) }
        for (extra in extras) ChoiceOption(reminderDelayLabel(extra.toDouble()), checked = true) { toggle(extra) }
        ChoiceOption("Personnalisé", onClick = null)
        Row(
            Modifier.padding(start = 10.dp, end = 10.dp, bottom = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            NumberBox(amount) { amount = it }
            for ((choice, label) in listOf(ReminderUnit.Minutes to "minutes", ReminderUnit.Hours to "heures", ReminderUnit.Days to "jours")) {
                val on = unit == choice
                Box(
                    Modifier
                        .height(36.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(if (on) Neo.Accent.copy(alpha = 0.18f) else Neo.Hover)
                        .border(1.dp, if (on) Neo.Accent else Neo.Border, RoundedCornerShape(10.dp))
                        .clickable { unit = choice }
                        .padding(horizontal = 10.dp),
                    contentAlignment = Alignment.Center,
                ) { UiText(label, color = if (on) Neo.Accent else Neo.Text, size = 13.sp) }
            }
        }
        Box(
            Modifier
                .padding(start = 10.dp, end = 10.dp, bottom = 6.dp)
                .height(34.dp)
                .clip(RoundedCornerShape(7.dp))
                .background(Neo.Accent)
                .clickable { toggle(reminderMinutesFrom(amount.toDouble(), unit).toLong()) }
                .padding(horizontal = 14.dp),
            contentAlignment = Alignment.Center,
        ) { UiText("Ajouter", color = Neo.OnAccent, size = 13.sp, weight = FontWeight.SemiBold) }
    }
}
