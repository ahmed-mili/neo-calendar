package com.ahmed.neocalendar.nativeapp.ui

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.ahmed.neocalendar.core.appearance.BatchProgress
import com.ahmed.neocalendar.core.appearance.ImportedTheme
import com.ahmed.neocalendar.core.appearance.THEMES
import com.ahmed.neocalendar.core.appearance.THEME_DEFAULT_WALLPAPER
import com.ahmed.neocalendar.core.appearance.NO_WALLPAPER
import com.ahmed.neocalendar.core.appearance.ThemeCustomization
import com.ahmed.neocalendar.core.appearance.ThemeDefinition
import com.ahmed.neocalendar.core.appearance.ThemeImport
import com.ahmed.neocalendar.core.appearance.WALLPAPER_PHOTOS
import com.ahmed.neocalendar.core.appearance.Wallpaper
import com.ahmed.neocalendar.core.appearance.argbOfHex
import com.ahmed.neocalendar.core.appearance.availableCategories
import com.ahmed.neocalendar.core.appearance.batchNote
import com.ahmed.neocalendar.core.appearance.missingWallpapers
import com.ahmed.neocalendar.core.appearance.mixColors
import com.ahmed.neocalendar.core.appearance.normalizeHex
import com.ahmed.neocalendar.core.appearance.parseThemeShare
import com.ahmed.neocalendar.core.appearance.themeShareText
import com.ahmed.neocalendar.core.appearance.wallpaperCredit
import com.ahmed.neocalendar.core.appearance.wallpapersInCategory
import com.ahmed.neocalendar.nativeapp.ExternalOpen
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoAppearance
import com.ahmed.neocalendar.nativeapp.ui.theme.NeoFonts
import com.ahmed.neocalendar.nativeapp.ui.theme.WallpaperDownloads
import com.ahmed.neocalendar.nativeapp.ui.theme.WallpaperEffects
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.roundToInt

/** Une couleur `#rrggbb` du thème en couleur Compose. */
private fun hexColor(hex: String): Color = Color(argbOfHex(hex))

/** La pastille d'un thème (`ThemePreview`) : sa surface, son accent, la capitale de sa police ; 24 dp, rayon 7. */
@Composable
internal fun ThemePreview(theme: ThemeDefinition) {
    val surface = hexColor(theme.surface)
    Box(
        Modifier
            .size(24.dp)
            .background(surface, RoundedCornerShape(7.dp))
            .border(1.dp, Color(mixColors(argbOfHex(theme.surface), argbOfHex(theme.ink), 0.22)), RoundedCornerShape(7.dp)),
        contentAlignment = Alignment.Center,
    ) {
        SText("A", color = hexColor(theme.accent), size = 12f, weight = 650)
    }
}

/**
 * La page Apparence (§16) : mêmes groupes, mêmes lignes et mêmes textes que `renderAppearance` de `DesktopSettings.tsx`.
 * Le thème et le fond s'appliquent aussitôt ; une couleur, le contraste, les polices et la barre latérale attendent
 * « Enregistrer » (comme l'ancienne). Les curseurs du fond s'appliquent en direct.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
internal fun AppearancePage(openThemeChoice: () -> Unit) {
    val context = LocalContext.current
    val themeId = NeoAppearance.themeId
    val theme = NeoAppearance.theme
    val saved = NeoAppearance.effective
    var draft by remember(themeId) { mutableStateOf(saved) }
    var dirty by remember(themeId) { mutableStateOf(false) }
    var message by remember(themeId) { mutableStateOf<String?>(null) }
    // Le fond s'applique tout de suite, il n'attend pas « Enregistrer » : le brouillon le suit.
    LaunchedEffect(saved.wallpaperId) { if (draft.wallpaperId != saved.wallpaperId) draft = draft.copy(wallpaperId = saved.wallpaperId) }
    var colorPicker by remember { mutableStateOf<ColorTarget?>(null) }
    var wallpaperDialog by remember { mutableStateOf(false) }

    fun edit(change: (com.ahmed.neocalendar.core.appearance.EffectiveThemeAppearance) -> com.ahmed.neocalendar.core.appearance.EffectiveThemeAppearance) {
        draft = change(draft)
        dirty = true
        message = null
    }

    val importer = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri == null) return@rememberLauncherForActivityResult
        val text = try { context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) } } catch (_: Exception) { null }
        when (val result = if (text == null) ThemeImport.Invalid else parseThemeShare(text)) {
            ThemeImport.Invalid -> message = "Fichier de thème invalide"
            ThemeImport.NotInstalled -> message = "Ce thème n’est pas installé dans Neo Calendar"
            is ThemeImport.Ok -> {
                val imported = result.theme
                val target = THEMES.first { it.id == imported.themeId }
                NeoAppearance.setTheme(context, target.id)
                draft = importedDraft(target, imported)
                dirty = true
                message = "${target.label} importé — enregistre pour appliquer"
            }
        }
    }

    Group("Thème") {
        row(
            null, "Thème", theme.label, iconContent = { ThemePreview(theme) }, onClick = openThemeChoice,
        )
        row(NeoIcons.Upload, "Importer un thème", null, chevron = false) { importer.launch(arrayOf("*/*")) }
        row(NeoIcons.Copy, "Copier le thème", null, chevron = false) {
            val text = themeShareText(themeId, draft)
            val ok = try {
                (context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager).setPrimaryClip(ClipData.newPlainText("Neo Calendar", text))
                true
            } catch (_: Exception) { false }
            message = if (ok) "Thème copié" else "Impossible de copier le thème"
        }
    }

    Group("Couleurs") {
        custom { shape -> ColorRow(shape, "Accentuation", draft.accent, emphasized = true) { colorPicker = ColorTarget("accent", draft.accent, it) } }
        custom { shape -> ColorRow(shape, "Arrière-plan", draft.surface) { colorPicker = ColorTarget("surface", draft.surface, it) } }
        custom { shape -> ColorRow(shape, "Avant-plan", draft.ink) { colorPicker = ColorTarget("ink", draft.ink, it) } }
        custom { shape ->
            SliderRow(
                shape, NeoIcons.SunMedium, "Contraste", draft.contrast.toFloat(), 0f, 100f, 1f, { it.roundToInt().toString() },
                theme.contrast.toFloat(), onChange = { edit { d -> d.copy(contrast = it.roundToInt()) } },
                onReset = { edit { d -> d.copy(contrast = theme.contrast) } },
            )
        }
    }

    Group("Image de fond", note = "L’aperçu et l’application se mettent à jour instantanément.") {
        row(
            null, "Image de fond", wallpaperLabel(draft.wallpaperId), iconContent = { WallpaperThumb(draft.wallpaperId, draft.accent, draft.surface, 30, 22, 5) },
            iconWidth = 30, onClick = { wallpaperDialog = true },
        )
        val effects = NeoAppearance.effects
        custom { shape ->
            SliderRow(
                shape, NeoIcons.Contrast, "Luminosité du fond", effects.brightness, 0f, 1f, 0.05f, { "%.2f".format(java.util.Locale.ROOT, it) },
                0.7f, onChange = { NeoAppearance.setEffects(context, effects.copy(brightness = it)) },
                onReset = { NeoAppearance.setEffects(context, effects.copy(brightness = 0.7f)) },
            )
        }
        custom { shape ->
            SliderRow(
                shape, NeoIcons.Droplets, "Flou du fond", effects.blur, 0f, 20f, 1f, { it.roundToInt().toString() },
                5f, onChange = { NeoAppearance.setEffects(context, effects.copy(blur = it)) },
                onReset = { NeoAppearance.setEffects(context, effects.copy(blur = 5f)) },
            )
        }
        custom { shape ->
            SliderRow(
                shape, NeoIcons.Layers, "Opacité des conteneurs", effects.containerOpacity, 0f, 1f, 0.05f, { "%.2f".format(java.util.Locale.ROOT, it) },
                0.4f, onChange = { NeoAppearance.setEffects(context, effects.copy(containerOpacity = it)) },
                onReset = { NeoAppearance.setEffects(context, effects.copy(containerOpacity = 0.4f)) },
            )
        }
        toggle(NeoIcons.PanelLeft, "Barre latérale translucide", draft.translucentSidebar) { checked -> edit { it.copy(translucentSidebar = checked) } }
    }

    Group("Polices") {
        custom { shape -> FieldRow(shape, NeoIcons.Type, "Police de l’interface utilisateur", draft.uiFont) { text -> edit { it.copy(uiFont = text) } } }
        custom { shape -> FieldRow(shape, NeoIcons.CodeXml, "Police monospace", draft.codeFont) { text -> edit { it.copy(codeFont = text) } } }
    }

    Group(null, note = message) {
        row(NeoIcons.Save, "Enregistrer", if (dirty) "Modifications non enregistrées" else null, chevron = false, disabled = !dirty) {
            if (normalizeHex(draft.accent) == null || normalizeHex(draft.surface) == null || normalizeHex(draft.ink) == null) {
                message = "Les couleurs doivent utiliser le format #RRGGBB"
                return@row
            }
            NeoAppearance.setCustomization(
                context,
                ThemeCustomization(
                    accent = draft.accent, surface = draft.surface, ink = draft.ink, uiFont = draft.uiFont, codeFont = draft.codeFont,
                    translucentSidebar = draft.translucentSidebar, contrast = draft.contrast,
                ),
            )
            draft = NeoAppearance.effective
            dirty = false
            message = "Modifications enregistrées"
        }
        row(NeoIcons.RotateCcw, "Réinitialiser ce thème", null, chevron = false) {
            NeoAppearance.resetTheme(context)
            draft = NeoAppearance.effective
            dirty = false
            message = "Thème réinitialisé"
        }
    }

    colorPicker?.let { target ->
        CalendarColorPicker(
            current = target.current, anchor = target.anchor,
            onChange = { hex ->
                val value = normalizeHex(hex) ?: return@CalendarColorPicker
                edit {
                    when (target.field) {
                        "accent" -> it.copy(accent = value)
                        "surface" -> it.copy(surface = value)
                        else -> it.copy(ink = value)
                    }
                }
            },
            onDismiss = { colorPicker = null },
        )
    }
    if (wallpaperDialog) WallpaperDialog(draft.wallpaperId, draft.accent, draft.surface, onPick = { NeoAppearance.setWallpaper(context, it) }) { wallpaperDialog = false }
}

private class ColorTarget(val field: String, val current: String, val anchor: Rect)

/** Ce que l'import change du brouillon : seuls les champs lisibles. */
private fun importedDraft(theme: ThemeDefinition, imported: ImportedTheme): com.ahmed.neocalendar.core.appearance.EffectiveThemeAppearance {
    val base = com.ahmed.neocalendar.core.appearance.effectiveThemeAppearance(theme, NeoAppearance.preferences)
    return base.copy(
        accent = imported.accent?.let { normalizeHex(it) } ?: base.accent,
        surface = imported.surface?.let { normalizeHex(it) } ?: base.surface,
        ink = imported.ink?.let { normalizeHex(it) } ?: base.ink,
        contrast = imported.contrast ?: base.contrast,
        uiFont = imported.uiFont ?: base.uiFont,
        codeFont = imported.codeFont ?: base.codeFont,
        translucentSidebar = imported.translucentSidebar ?: base.translucentSidebar,
    )
}

private fun wallpaperLabel(id: String): String = when (id) {
    THEME_DEFAULT_WALLPAPER -> "Par défaut du thème"
    NO_WALLPAPER -> "Aucun"
    else -> WALLPAPER_PHOTOS.firstOrNull { it.id == id }?.label ?: WALLPAPER_PHOTOS.firstOrNull { it.id == "$id-portrait" }?.label ?: "Par défaut du thème"
}

// --- Les lignes ---

/** `ThemeColorPicker` : la pastille ronde de 20 dans la colonne d'icône, le nom, la valeur en majuscules (13, interlettrage .26), un chevron. */
@Composable
private fun ColorRow(shape: Shape, label: String, hex: String, emphasized: Boolean = false, onOpen: (Rect) -> Unit) {
    var bounds by remember { mutableStateOf(Rect.Zero) }
    val swatch = hexColor(hex)
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 52.dp)
            .background(Neo.SettingRow, shape)
            .onGloballyPositioned { bounds = it.boundsInWindow() }
            .pressFill(shape, Neo.Hover) { onOpen(bounds) }
            .padding(start = 16.dp, end = 14.dp, top = 9.dp, bottom = 9.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) {
            Box(
                Modifier
                    .size(20.dp)
                    .let { if (emphasized) it.drawBehind { drawCircle(Neo.Accent.copy(alpha = 0.22f), radius = 13.dp.toPx()) } else it }
                    .background(swatch, CircleShape)
                    .border(1.dp, Neo.Text.copy(alpha = if (emphasized) 0.34f else 0.2f), CircleShape),
            )
        }
        SText(label, Modifier.weight(1f), lineHeight = 19.5f)
        SText(hex.uppercase(), color = Neo.SettingsValue, size = 13f, maxLines = 1)
        Icon(NeoIcons.ChevronRight, null, tint = Neo.SettingsNote, modifier = Modifier.size(18.dp))
    }
}

/** `SettingsSliderRow` : le nom et le nombre sur la première ligne, la case du bouton de remise (38) tenue ouverte, le curseur sur la seconde. */
@Composable
private fun SliderRow(
    shape: Shape, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: Float, min: Float, max: Float, step: Float,
    format: (Float) -> String, default: Float, onChange: (Float) -> Unit, onReset: () -> Unit,
) {
    val moved = kotlin.math.abs(value - default) > 0.0001f
    Column(
        Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(start = 16.dp, end = 14.dp, top = 12.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
            SText(label, Modifier.weight(1f), lineHeight = 19.5f)
            SText(format(value), color = Neo.SettingsValue, maxLines = 1)
            // La case du bouton de remise reste ouverte (38 de large) ; elle ne prend de la hauteur que quand le bouton y est.
            Box(Modifier.width(38.dp), contentAlignment = Alignment.Center) {
                if (moved) Box(Modifier.size(38.dp).pressFill(RoundedCornerShape(10.dp), Neo.Hover, onClick = onReset), contentAlignment = Alignment.Center) {
                    Icon(NeoIcons.RotateCcw, "Réinitialiser", tint = Neo.SettingsValue, modifier = Modifier.size(17.dp))
                }
            }
        }
        NeoSlider(value, min, max, step, onChange)
    }
}

/**
 * `input[type=range]` de 22 dp, `accent-color: var(--nc-accent)` : le rendu natif de Chrome, mesuré sur l'ancienne (sombre) : piste de
 * 8 dp sur toute la largeur de la ligne, bord de 1 dp `#858585`, part non remplie `#3b3b3b`, part remplie à l'accent, bouton rond de
 * 14,5 dp (il voyage entre `rayon` et `largeur - rayon`). Un appui ou un glissé règle la valeur au pas près.
 */
@Composable
internal fun NeoSlider(value: Float, min: Float, max: Float, step: Float, onChange: (Float) -> Unit) {
    val accent = Neo.Accent
    val light = NeoAppearance.isLight
    val trackFill = if (light) Color(0xFFE4E4E4) else Color(0xFF3B3B3B)
    val trackEdge = if (light) Color(0xFF767676) else Color(0xFF858585)
    val latest by androidx.compose.runtime.rememberUpdatedState(onChange)
    Canvas(
        Modifier
            .fillMaxWidth()
            .height(22.dp)
            .pointerInput(min, max, step) {
                awaitEachGesture {
                    val down = awaitFirstDown()
                    val inset = 7.25.dp.toPx()
                    fun at(x: Float) {
                        val fraction = ((x - inset) / (size.width - 2 * inset)).coerceIn(0f, 1f)
                        val raw = min + fraction * (max - min)
                        latest((min + ((raw - min) / step).roundToInt() * step).coerceIn(min, max))
                    }
                    at(down.position.x)
                    down.consume()
                    do {
                        val event = awaitPointerEvent()
                        val change = event.changes.firstOrNull() ?: break
                        if (change.pressed) { at(change.position.x); change.consume() }
                    } while (event.changes.any { it.pressed })
                }
            },
    ) {
        val radius = 7.25.dp.toPx()
        val trackHeight = 8.dp.toPx()
        val top = (size.height - trackHeight) / 2
        val corner = androidx.compose.ui.geometry.CornerRadius(4.dp.toPx())
        val fraction = if (max > min) ((value - min) / (max - min)).coerceIn(0f, 1f) else 0f
        val x = radius + fraction * (size.width - 2 * radius)
        drawRoundRect(trackFill, Offset(0f, top), androidx.compose.ui.geometry.Size(size.width, trackHeight), corner)
        // La part remplie va du bord gauche au centre du bouton.
        clipRect(right = x) { drawRoundRect(accent, Offset(0f, top), androidx.compose.ui.geometry.Size(size.width, trackHeight), corner) }
        drawRoundRect(trackEdge, Offset(0.5.dp.toPx(), top + 0.5.dp.toPx()), androidx.compose.ui.geometry.Size(size.width - 1.dp.toPx(), trackHeight - 1.dp.toPx()), corner, style = androidx.compose.ui.graphics.drawscope.Stroke(1.dp.toPx()))
        drawCircle(accent, radius, Offset(x, size.height / 2))
    }
}

/** `SettingsFieldRow` : le nom sur la première ligne, le champ (38 dp, rayon 10, fond du champ à 70 %) sur la seconde. */
@Composable
private fun FieldRow(shape: Shape, icon: androidx.compose.ui.graphics.vector.ImageVector, label: String, value: String, onChange: (String) -> Unit) {
    var focused by remember { mutableStateOf(false) }
    Column(
        Modifier.fillMaxWidth().background(Neo.SettingRow, shape).padding(start = 16.dp, end = 14.dp, top = 12.dp, bottom = 14.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            Box(Modifier.width(22.dp), contentAlignment = Alignment.Center) { Icon(icon, null, tint = Neo.SettingsValue, modifier = Modifier.size(18.dp)) }
            SText(label, Modifier.weight(1f), lineHeight = 19.5f)
        }
        val inputShape = RoundedCornerShape(10.dp)
        Box(
            Modifier
                .fillMaxWidth()
                .height(38.dp)
                .background(Neo.FieldFill.copy(alpha = 0.7f), inputShape)
                .border(1.dp, if (focused) Neo.Accent else Neo.Border.copy(alpha = Neo.Border.alpha * 0.8f), inputShape)
                .padding(horizontal = 12.dp),
            contentAlignment = Alignment.CenterStart,
        ) {
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true,
                textStyle = TextStyle(color = Neo.Text, fontSize = 16.sp, fontFamily = NeoFonts.inter),
                cursorBrush = SolidColor(Neo.Accent),
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
    }
}

// --- Les vignettes de fond ---

/** La vignette d'un fond : l'image livrée dans l'APK, ou le dégradé du thème, ou la couleur de fond. */
@Composable
private fun WallpaperThumb(id: String, accent: String, surface: String, width: Int, height: Int, radius: Int) {
    val context = LocalContext.current
    val shape = RoundedCornerShape(radius.dp)
    val file = if (id == THEME_DEFAULT_WALLPAPER || id == NO_WALLPAPER) null else "$id.jpg"
    val bitmap by produceThumb(context, file)
    val base = Modifier.size(width.dp, height.dp).clip(shape)
    when {
        id == NO_WALLPAPER -> Box(base.background(hexColor(surface)))
        file != null && bitmap != null -> Image(bitmap!!, null, base, contentScale = ContentScale.Crop)
        else -> {
            val s = hexColor(surface)
            val a = hexColor(accent)
            Box(
                base.background(
                    Brush.linearGradient(listOf(s, Color(mixColors(argbOfHex(surface), argbOfHex(accent), 0.32)))),
                ).background(Brush.radialGradient(listOf(a.copy(alpha = 0.6f), Color.Transparent), center = Offset(width * 0.72f * 2.6f, height * 0.25f * 2.6f), radius = width * 1.1f * 2.6f / 2)),
            )
        }
    }
}

@Composable
private fun produceThumb(context: Context, file: String?) = androidx.compose.runtime.produceState<androidx.compose.ui.graphics.ImageBitmap?>(null, file) {
    value = if (file == null) null else withContext(Dispatchers.IO) { WallpaperDownloads.thumb(context, file) }
}

/** `ThemeWallpaperPicker` : catégories, « Tout télécharger », une ligne par fond (vignette 40 x 54, nom 16, crédit, état) dans la carte de choix. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun WallpaperDialog(selected: String, accent: String, surface: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var installed by remember { mutableStateOf<Set<String>?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var failed by remember { mutableStateOf<String?>(null) }
    var batch by remember { mutableStateOf<BatchProgress?>(null) }
    var category by remember { mutableStateOf("all") }
    LaunchedEffect(Unit) { installed = withContext(Dispatchers.IO) { WallpaperDownloads.installed(context) } }
    val have = installed ?: emptySet()
    val running = batch != null && batch!!.done < batch!!.total
    val missingAll = if (installed == null) emptyList() else missingWallpapers(WALLPAPER_PHOTOS, have)

    suspend fun fetch(wallpaper: Wallpaper): Boolean {
        val error = withContext(Dispatchers.IO) { WallpaperDownloads.download(context, wallpaper.file) }
        installed = withContext(Dispatchers.IO) { WallpaperDownloads.installed(context) }
        return error == null
    }

    ChoiceCard("Fonds d'écran", onDismiss = { if (busy == null && !running) onDismiss() }) {
        val categories = availableCategories()
        FlowRow(Modifier.padding(start = 2.dp, end = 2.dp, bottom = 8.dp), horizontalArrangement = Arrangement.spacedBy(4.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            for ((key, label) in listOf("all" to "Tous") + categories) {
                val active = category == key
                val pill = RoundedCornerShape(999.dp)
                SText(
                    label,
                    Modifier
                        .clip(pill)
                        .background(if (active) Neo.Accent else Color.Transparent, pill)
                        .border(1.dp, if (active) Neo.Accent else Neo.Border, pill)
                        .pressFill(pill, Neo.Hover) { category = key }
                        .padding(horizontal = 10.dp, vertical = 4.dp),
                    color = if (active) Neo.OnAccent else Neo.TextSecondary, size = 12f,
                )
            }
        }
        val note = batchNote(batch, missingAll.size)
        if (note != null) {
            val shape = RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp)
            Row(
                Modifier.fillMaxWidth().pressFill(shape, Neo.Hover) {
                    if (busy != null || running) return@pressFill
                    scope.launch {
                        failed = null
                        var failures = 0
                        val pending = missingAll
                        batch = BatchProgress(0, pending.size, 0)
                        pending.forEachIndexed { index, w ->
                            if (!fetch(w)) failures++
                            batch = BatchProgress(index + 1, pending.size, failures)
                        }
                        if (failures == 0) batch = null
                    }
                }.padding(horizontal = 12.dp, vertical = 12.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                SText(note, size = 14f, weight = 500)
                Icon(if (running) NeoIcons.LoaderCircle else NeoIcons.Download, null, tint = Neo.TextSecondary, modifier = Modifier.size(if (running) 18.dp else 16.dp))
            }
            Box(Modifier.fillMaxWidth().padding(bottom = 4.dp).height(1.dp).background(Neo.Text.copy(alpha = 0.12f)))
        }
        // « Par défaut du thème » et « Aucun » restent sous tout filtre : ce ne sont pas des photos.
        WallpaperOption(THEME_DEFAULT_WALLPAPER, "Par défaut du thème", null, selected, accent, surface, null, false, false) { onPick(THEME_DEFAULT_WALLPAPER); onDismiss() }
        for (wallpaper in wallpapersInCategory(category)) {
            val missing = installed != null && wallpaper.file !in have
            WallpaperOption(
                wallpaper.id, wallpaper.label, wallpaper, selected, accent, surface,
                note = when {
                    busy == wallpaper.id -> "Téléchargement…"
                    failed == wallpaper.id -> "Téléchargement impossible — appuyez pour réessayer"
                    missing -> "À télécharger"
                    else -> null
                },
                busy = busy == wallpaper.id, failed = failed == wallpaper.id && busy != wallpaper.id,
                missing = missing,
            ) {
                if (busy != null) return@WallpaperOption
                if (!missing) { onPick(wallpaper.id); onDismiss(); return@WallpaperOption }
                scope.launch {
                    failed = null
                    busy = wallpaper.id
                    if (fetch(wallpaper)) { onPick(wallpaper.id); busy = null; onDismiss() } else { failed = wallpaper.id; busy = null }
                }
            }
        }
        WallpaperOption(NO_WALLPAPER, "Aucun", null, selected, accent, surface, null, false, false) { onPick(NO_WALLPAPER); onDismiss() }
    }
}

@Composable
private fun WallpaperOption(
    id: String, label: String, wallpaper: Wallpaper?, selected: String, accent: String, surface: String, note: String?,
    busy: Boolean, failed: Boolean, missing: Boolean = false, onClick: () -> Unit,
) {
    val context = LocalContext.current
    val on = id == selected || id == "$selected-portrait" || "$id-portrait" == selected
    val shape = RoundedCornerShape(12.dp)
    Row(
        Modifier.fillMaxWidth().pressFill(shape, Neo.Hover, onClick = onClick).padding(horizontal = 12.dp, vertical = 7.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        WallpaperThumb(id, accent, surface, 40, 54, 7)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            SText(label, color = if (on) Neo.Accent else Neo.Text, size = 16f, maxLines = 1)
            if (wallpaper != null) {
                Row(
                    Modifier.pressFill(RoundedCornerShape(4.dp), Color.Transparent) { ExternalOpen.openLink(context, wallpaper.page) },
                    verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(5.dp),
                ) {
                    UnsplashMark()
                    SText(wallpaperCredit(wallpaper), color = Neo.TextSecondary, size = 12f, maxLines = 1)
                }
            }
            if (note != null) SText(note, color = if (failed) Neo.Danger else Neo.TextSecondary, size = 11f, lineHeight = 14.3f)
        }
        Box(Modifier.size(20.dp), contentAlignment = Alignment.Center) {
            when {
                busy -> Icon(NeoIcons.LoaderCircle, null, tint = Neo.TextSecondary, modifier = Modifier.size(18.dp))
                failed -> Icon(NeoIcons.RotateCcw, null, tint = Neo.Danger, modifier = Modifier.size(18.dp))
                on -> Icon(NeoIcons.Check, null, tint = Neo.Accent, modifier = Modifier.size(18.dp))
                missing -> Icon(NeoIcons.Download, null, tint = Neo.TextSecondary, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** La marque d'Unsplash (Simple Icons, `unsplash.svg`), dessinée plutôt qu'écrite : 11 dp. */
@Composable
private fun UnsplashMark() {
    val tint = Neo.TextSecondary
    val path = remember { PathParser().parsePathString("M7.5 6.75V0h9v6.75h-9zm9 3.75H24V24H0V10.5h7.5v6.75h9V10.5z").toPath() }
    Canvas(Modifier.size(11.dp)) { scale(size.width / 24f, pivot = Offset.Zero) { drawPath(path, tint) } }
}
