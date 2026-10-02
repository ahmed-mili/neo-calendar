package com.ahmed.neocalendar.nativeapp.ui.theme

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ahmed.neocalendar.core.appearance.ThemeColors
import com.ahmed.neocalendar.core.appearance.mixColors
import com.ahmed.neocalendar.core.appearance.settingsNoteColor
import com.ahmed.neocalendar.core.appearance.settingsValueColor

/** `0 offsetY blur color`, l'ombre de `--nc-shadow` ; le thème n'a ni décalage horizontal ni étalement. */
@Immutable
class NeoShadow(val offsetY: Dp, val blur: Dp, val color: Color)

/**
 * Les jetons d'un thème : un champ par variable CSS de l'ancienne interface. Les écrans lisent `Neo.*`
 * (qui lit le thème courant), jamais une couleur en dur ; ajouter un thème, c'est écrire un `NeoTokens`.
 */
@Immutable
class NeoTokens(
    val id: String,
    // Fonds
    /** `--background-primary` / `--nc-bg-primary` : surface des fiches, dialogues, cartes. */
    val surface: Color,
    /** `--background-secondary` : tiroir, réglages, liste d'un calendrier. */
    val mantle: Color,
    /** `--nc-bg-crust` : fond de page, derrière le fond d'écran. */
    val background: Color,
    /** Fond des lignes de réglage. */
    val settingRow: Color,
    /** `--background-modifier-hover`, `--nc-surface-hover` : appui, survol, ligne active. */
    val hover: Color,
    /** Appui d'un bouton de la barre du haut (blanc 8 %). */
    val barPress: Color,
    // Bordures
    val border: Color,
    val borderStrong: Color,
    // Textes
    val text: Color,
    val textSecondary: Color,
    val textFaint: Color,
    /** Libellés clairs : semaine, jours, étiquettes d'heure. */
    val label: Color,
    /** Réglages : valeurs et titres. */
    val settingsValue: Color,
    /** Réglages : chevrons et notes. */
    val settingsNote: Color,
    // Accent
    val accent: Color,
    val accentStrong: Color,
    val onAccent: Color,
    // États
    /** Rond du jour et ligne de l'heure dans la grille. */
    val today: Color,
    /** Pastille « aujourd'hui » de la barre du haut. */
    val todayPill: Color,
    val danger: Color,
    val overdue: Color,
    val success: Color,
    val taskTodo: Color,
    val taskDone: Color,
    val gridLine: Color,
    /** Bord droit de la gouttière de la bande « journée entière » (`rgba(128,128,128,.35)`). */
    val allDayGutterBorder: Color,
    /** Bord gauche des cellules de la bande « journée entière » (`rgba(105,109,134,.24)`). */
    val allDayCellBorder: Color,
    val draft: Color,
    val draftFill: Color,
    /** Voile derrière un dialogue ou une feuille (`rgba(8,9,18,.72)`, `--nc-float-veil`). */
    val veil: Color,
    /** Fond (blanc 3,5 %) et bord (blanc 7 %) des petits boutons du tiroir (grille des durées). */
    val faintFill: Color,
    val faintBorder: Color,
    /** Fond (blanc 4 %) et bord (blanc 8 %) d'un champ du tiroir. */
    val inputFill: Color,
    val inputBorder: Color,
    /** `--background-modifier-form-field` : fond d'un champ de saisie (`rgb(57,58,78)`). */
    val fieldFill: Color,
    /** Fond d'un contrôle posé sur une carte (menu de fréquence, champs d'ajout d'un lien ICS) : `rgb(50,51,70)`. */
    val controlFill: Color,
    /** Fond d'une carte posée sur la surface d'un dialogue (`rgba(198,208,245,.03)`). */
    val cardTint: Color,
    /** Bord (blanc 5,5 %) et fond d'une carte « en cours » (blanc 5,5 %) de la liste d'un calendrier. */
    val cardEdge: Color,
    /** Bord d'une carte « en cours » (blanc 16 %). */
    val cardEdgeStrong: Color,
    // Voiles posés par-dessus la grille (blanc translucide)
    val highlightWeek: Color,
    val highlightAnchor: Color,
    val chipNeutral: Color,
    val todayColumn: Color,
    // Géométrie
    val cardRadius: Dp,
    val shadow: NeoShadow,
    // Fond d'écran
    /** Fond du thème quand le réglage dit « Par défaut du thème » (fichier du dossier `wallpapers`). */
    val themeWallpaperFile: String,
    /** Fond d'un appareil qui n'a rien choisi (`DEFAULT_ANDROID_WALLPAPER_ID`). */
    val defaultWallpaperId: String,
    /** Voile sur la photo, du haut (alpha) vers le bas, teinté `surface`. */
    val wallpaperVeilTop: Float,
    val wallpaperVeilBottom: Float,
)

/** Catppuccin Mocha : `catppuccin-mocha.css`, `mobile.css` et les relevés de la spec §22. */
val CatppuccinMocha = NeoTokens(
    id = "catppuccin-mocha",
    surface = Color(0xFF1E1E2E),
    mantle = Color(0xFF181825),
    background = Color(0xFF11111B),
    settingRow = Color(0xFF13131D),
    hover = Color(0xFF313244),
    barPress = Color(0x14FFFFFF),
    border = Color(0x476C7086),
    borderStrong = Color(0x38CDD6F4),
    text = Color(0xFFCDD6F4),
    textSecondary = Color(0xFFA1A8C9),
    textFaint = Color(0xFF80859D),
    label = Color(0xFFDDE3F7),
    settingsValue = Color(0xFF9BA2C1),
    settingsNote = Color(0xFF878DA7),
    accent = Color(0xFF89B4FA),
    accentStrong = Color(0xFFA3C5FB),
    onAccent = Color(0xFF1E1E2E),
    today = Color(0xFFF15550),
    todayPill = Color(0xFFF5544F),
    danger = Color(0xFFF38BA8),
    overdue = Color(0xFFE5534B),
    success = Color(0xFFA6E3A1),
    taskTodo = Color(0xFFE9973F),
    taskDone = Color(0xFF2F9E44),
    gridLine = Color(0x2B9EA5C5),
    allDayGutterBorder = Color(0x59808080),
    allDayCellBorder = Color(0x3D80859D),
    draft = Color(0xFF4AABE0),
    draftFill = Color(0x2E4AABE0),
    veil = Color(0xB8080912),
    faintFill = Color(0x09FFFFFF),
    faintBorder = Color(0x12FFFFFF),
    inputFill = Color(0x0AFFFFFF),
    inputBorder = Color(0x14FFFFFF),
    fieldFill = Color(0xFF393A4E),
    controlFill = Color(0xFF323346),
    cardTint = Color(0x08CDD6F4),
    cardEdge = Color(0x0EFFFFFF),
    cardEdgeStrong = Color(0x29FFFFFF),
    highlightWeek = Color(0x17FFFFFF),
    highlightAnchor = Color(0x26FFFFFF),
    chipNeutral = Color(0x24FFFFFF),
    todayColumn = Color(0x0DFFFFFF),
    cardRadius = 22.dp,
    shadow = NeoShadow(8.dp, 24.dp, Color(0x5211111B)),
    themeWallpaperFile = "starlit-snow-peak.jpg",
    defaultWallpaperId = "starlit-snow-peak-portrait",
    wallpaperVeilTop = 0.16f,
    wallpaperVeilBottom = 0.24f,
)

private fun c(argb: Long) = Color(argb)
private fun mix(a: Long, b: Long, t: Double) = Color(mixColors(a, b, t))

/**
 * Les jetons d'un thème autre que Catppuccin Mocha sombre (ou d'un Mocha dont une couleur a été personnalisée), calculés à
 * partir des couleurs résolues du thème. Chaque jeton garde le rôle et l'opacité qu'il a dans `CatppuccinMocha` (la table
 * mesurée de la spec §22) ; seule la teinte vient du thème : les fonds, les textes, l'accent et les états lui appartiennent,
 * les voiles translucides prennent l'encre (sombre : blanc, clair : noir). Le rouge d'aujourd'hui, les couleurs de tâche et
 * le brouillon sont ceux de l'ancienne pour tous les thèmes (elle ne les surcharge pas).
 */
fun deriveTokens(id: String, colors: ThemeColors, themeWallpaperFile: String): NeoTokens {
    val base = CatppuccinMocha
    val light = colors.light
    // Les voiles de la grille et des champs : du blanc sur un fond sombre, du noir sur un fond clair.
    val veilBase = if (light) Color.Black else Color.White
    fun veil(alpha: Float) = veilBase.copy(alpha = alpha)
    val ink = c(colors.text)
    return NeoTokens(
        id = id,
        surface = c(colors.primary),
        mantle = c(colors.secondary),
        background = c(colors.crust),
        settingRow = if (light) mix(colors.crust, colors.secondary, 0.6) else mix(colors.crust, colors.secondary, 0.25),
        hover = c(colors.hover),
        barPress = veil(0x14 / 255f),
        border = c(colors.border),
        borderStrong = ink.copy(alpha = 0x38 / 255f),
        text = ink,
        textSecondary = c(colors.muted),
        textFaint = c(colors.faint),
        label = if (light) ink else mix(colors.text, 0xFFFFFFFFL, 0.25),
        settingsValue = c(settingsValueColor(colors)),
        settingsNote = c(settingsNoteColor(colors)),
        accent = c(colors.accent),
        accentStrong = c(colors.accentStrong),
        onAccent = c(colors.onAccent),
        today = base.today,
        todayPill = base.todayPill,
        danger = c(colors.error),
        overdue = base.overdue,
        success = c(colors.success),
        taskTodo = base.taskTodo,
        taskDone = base.taskDone,
        gridLine = mix(colors.muted, colors.faint, 0.1).copy(alpha = 0x2B / 255f),
        allDayGutterBorder = base.allDayGutterBorder,
        allDayCellBorder = c(colors.faint).copy(alpha = 0x3D / 255f),
        draft = base.draft,
        draftFill = base.draftFill,
        veil = mix(colors.crust, 0xFF000000L, 0.5).copy(alpha = 0xB8 / 255f),
        faintFill = veil(0x09 / 255f),
        faintBorder = veil(0x12 / 255f),
        inputFill = veil(0x0A / 255f),
        inputBorder = veil(0x14 / 255f),
        fieldFill = mix(colors.primary, colors.text, 0.16),
        controlFill = mix(colors.primary, colors.text, 0.12),
        cardTint = ink.copy(alpha = 0x08 / 255f),
        cardEdge = veil(0x0E / 255f),
        cardEdgeStrong = veil(0x29 / 255f),
        highlightWeek = veil(0x17 / 255f),
        highlightAnchor = veil(0x26 / 255f),
        chipNeutral = veil(0x24 / 255f),
        todayColumn = veil(0x0D / 255f),
        cardRadius = base.cardRadius,
        shadow = NeoShadow(base.shadow.offsetY, base.shadow.blur, c(colors.crust).copy(alpha = 0x52 / 255f)),
        themeWallpaperFile = themeWallpaperFile,
        defaultWallpaperId = base.defaultWallpaperId,
        wallpaperVeilTop = if (light) 0.18f else base.wallpaperVeilTop,
        wallpaperVeilBottom = if (light) 0.18f else base.wallpaperVeilBottom,
    )
}
